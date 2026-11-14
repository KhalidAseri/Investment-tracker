import type { AppData, Pick2, Quotes } from './types.ts'
import type { PortfolioView } from './engine/valuation.ts'
import { insights, staleManualRows } from './engine/exposure.ts'
import { DRIFT_THRESHOLD, allocateContribution, driftRows, maxDrift } from './engine/guidance.ts'
import { emergencyStatus } from './engine/plan.ts'
import { reviewStatus } from './engine/review.ts'
import { zakatStatus } from './engine/zakat.ts'
import { annualTransfer, balanceEquation, effectiveZakatRate, guardrail, layers } from './engine/income.ts'
import { num } from './format.ts'

export interface NextAction {
  id: string
  tone: 'warn' | 'info' | 'good'
  title: string
  body: string
  href: string
  cta: string
}

/** The short, prioritised list on the home screen: what deserves attention right now. */
export function nextActions(data: AppData, view: PortfolioView, quotes: Quotes, L: Pick2, now = new Date()): NextAction[] {
  const s = data.settings
  const out: NextAction[] = []
  if (data.assets.length === 0) return out
  const investRows = view.rows.filter((r) => !r.asset.isEmergencyFund)

  if (s.monthlyExpenses <= 0) {
    out.push({ id: 'numbers', tone: 'info', title: L('أدخل مصاريفك الشهرية', 'Enter your monthly expenses'), body: L('لنحسب حجم صندوق الطوارئ المناسب لك.', 'So we can size the right emergency fund for you.'), href: '/plan/#emergency', cta: L('إدخال', 'Enter') })
  } else {
    const ef = emergencyStatus(view, s)
    if (!ef.ready) {
      out.push({
        id: 'emergency', tone: 'warn',
        title: L(`أكمل صندوق الطوارئ — باقي ${num(ef.shortfall, 0)} ر.س`, `Finish your emergency fund — SAR ${num(ef.shortfall, 0)} to go`),
        body: L(`يغطي الآن ${ef.monthsCovered.toFixed(1)} شهر من ${s.emergencyMonths}. وجّه مساهماتك له أولاً قبل أي استثمار متقلب.`, `It covers ${ef.monthsCovered.toFixed(1)} of ${s.emergencyMonths} months. Direct contributions here before volatile investing.`),
        href: '/plan/#emergency', cta: L('صندوق الطوارئ', 'Emergency fund'),
      })
    }
  }

  const review = reviewStatus(data, now)
  if (review.due) {
    out.push({ id: 'review', tone: 'warn', title: L('حان موعد مراجعة المحفظة', 'Your portfolio review is due'), body: L('خمس دقائق: حدّث القيم، افحص الانحراف، وسجّل لقطة.', 'Five minutes: update values, check drift, save a snapshot.'), href: '/plan/#review', cta: L('ابدأ المراجعة', 'Start review') })
  }

  const z = zakatStatus(view.rows, quotes, s, now)
  const incomeActive = s.income.annualIncome > 0 || investRows.some((r) => r.asset.isIncomeAccount)
  if (incomeActive) {
    // The income plan: one yearly transfer on zakat day, a steady salary in between.
    if (z.daysToHawl !== null && z.daysToHawl <= 30) {
      const t = annualTransfer(investRows, z.due, data.snapshots, s, L, now)
      out.push({
        id: 'transfer', tone: z.daysToHawl <= 0 ? 'warn' : 'info',
        title: z.daysToHawl <= 0 ? L('حان موعد التحويلة السنوية', 'Your yearly transfer is due') : L(`التحويلة السنوية بعد ${z.daysToHawl} يوم`, `Yearly transfer in ${z.daysToHawl} days`),
        body: L(`دخل السنة ${num(t.income, 0)} + زكاة ${num(t.zakat, 0)} = ${num(t.transfer, 0)} ر.س إلى حساب الدخل.`, `Year’s income ${num(t.income, 0)} + zakat ${num(t.zakat, 0)} = SAR ${num(t.transfer, 0)} into the income account.`),
        href: '/plan/#income', cta: L('خطوات التحويلة', 'Transfer steps'),
      })
    }
    const g = guardrail(s.income.annualIncome, view.investable, s.income.upper, s.income.lower)
    if (g.state === 'cut' || g.state === 'raise') {
      out.push({
        id: 'guardrail', tone: g.state === 'cut' ? 'warn' : 'good',
        title: g.state === 'cut' ? L('خفّض دخلك 10% لحماية المحفظة', 'Cut your income 10% to protect the portfolio') : L('تقدر ترفع دخلك 10%', 'You can raise your income 10%'),
        body: L(`دخلك الآن ${g.ratePct.toFixed(1)}% من قيمة المحفظة (الحدود ${s.income.lower}–${s.income.upper}%).`, `Your income is now ${g.ratePct.toFixed(1)}% of the portfolio (bounds ${s.income.lower}–${s.income.upper}%).`),
        href: '/plan/#income', cta: L('عدّل الدخل', 'Adjust income'),
      })
    }
    const monthly = s.income.annualIncome / 12
    const lay = layers(investRows, s.income.annualIncome, z.due, s.income.reserveYears)
    if (monthly > 0 && lay.income.value < monthly * 2 && (z.daysToHawl === null || z.daysToHawl > 45)) {
      out.push({
        id: 'income-low', tone: 'warn',
        title: L(`حساب الدخل يكفي ${(lay.income.value / monthly).toFixed(1)} شهر فقط`, `The income account covers only ${(lay.income.value / monthly).toFixed(1)} months`),
        body: L('عبّئه الآن: من التوزيعات أولاً، ثم من الفئة الزائدة عن مستهدفها.', 'Refill it now: dividends first, then the class above its target.'), href: '/plan/#income', cta: L('خطة الدخل', 'Income plan'),
      })
    } else if (monthly > 0 && lay.reserve.value < lay.reserve.target * 0.8) {
      out.push({
        id: 'reserve', tone: 'info', title: L('الاحتياط أقل من حجمه المستهدف', 'The reserve is below its target size'),
        body: L(`${num(lay.reserve.value, 0)} من ${num(lay.reserve.target, 0)} ر.س. وجّه له مساهمات أو جزءًا من أرباح سنة جيدة.`, `${num(lay.reserve.value, 0)} of SAR ${num(lay.reserve.target, 0)}. Send contributions or part of a good year’s gains there.`), href: '/plan/#income', cta: L('الطبقات', 'Layers'),
      })
    }
    const eq = balanceEquation(s.goal.expectedReturn, s.goal.inflation, effectiveZakatRate(z.due, view.investable, s), s.income.rate)
    if (!eq.sustainable) {
      out.push({ id: 'eroding', tone: 'warn', title: L('خطة الدخل تأكل من رأس المال', 'The income plan is eating capital'), body: L(`الدخل + الزكاة + التضخم يتجاوز العائد المتوقع بـ ${Math.abs(eq.growth).toFixed(1)}%.`, `Income + zakat + inflation exceed the expected return by ${Math.abs(eq.growth).toFixed(1)}%.`), href: '/plan/#income', cta: L('وازن', 'Rebalance the mix') })
    }
  } else if (z.daysToHawl !== null && z.daysToHawl <= 30 && z.due > 0) {
    out.push({
      id: 'zakat', tone: z.daysToHawl <= 0 ? 'warn' : 'info',
      title: z.daysToHawl <= 0 ? L('استحقت زكاة المحفظة', 'Zakat on the portfolio is due') : L(`الزكاة بعد ${z.daysToHawl} يوم`, `Zakat is due in ${z.daysToHawl} days`),
      body: L(`التقدير الحالي ${num(z.due, 0)} ر.س.`, `Current estimate: SAR ${num(z.due, 0)}.`), href: '/plan/#zakat', cta: L('التفاصيل', 'Details'),
    })
  }

  const stale = staleManualRows(view.rows, now.getTime())
  if (stale.length > 0) {
    out.push({ id: 'stale', tone: 'info', title: L(`حدّث قيمة ${stale.length} أصل يدوي`, `Update ${stale.length} manual asset value(s)`), body: stale.slice(0, 3).map((r) => r.asset.name).join('، '), href: '/assets/', cta: L('الأصول', 'Assets') })
  }

  if (s.targetsSet && investRows.length > 0) {
    const worst = maxDrift(driftRows(investRows, s, L))
    if (worst && Math.abs(worst.drift) > DRIFT_THRESHOLD) {
      const lines = allocateContribution(s.monthlyContribution || 1000, investRows, s, L)
      const first = lines.sort((a, b) => b.amount - a.amount)[0]
      out.push({
        id: 'drift', tone: 'info',
        title: first ? L(`وجّه مساهمتك القادمة إلى: ${first.label}`, `Send your next contribution to: ${first.label}`) : L('المحفظة انحرفت عن المستهدف', 'The portfolio has drifted from target'),
        body: L(`«${worst.label}» ${worst.drift > 0 ? 'أعلى' : 'أقل'} من المستهدف بـ ${Math.abs(worst.drift).toFixed(0)} نقطة.`, `“${worst.label}” is ${Math.abs(worst.drift).toFixed(0)} points ${worst.drift > 0 ? 'above' : 'below'} target.`),
        href: '/analysis/#next', cta: L('وزّع المبلغ', 'Allocate'),
      })
    }
  } else if (!s.targetsSet) {
    out.push({ id: 'targets', tone: 'info', title: L('حدّد توزيعك المستهدف', 'Set your target allocation'), body: L('ليقترح التطبيق أين تضع كل مساهمة قادمة.', 'So the app can suggest where each new contribution should go.'), href: '/analysis/#targets', cta: L('تحديد', 'Set') })
  }

  const risk = insights(investRows, s, L, now.getTime()).find((i) => i.severity === 'warn')
  if (risk) out.push({ id: risk.id, tone: 'warn', title: risk.title, body: risk.body, href: '/analysis/', cta: L('التحليل', 'Analysis') })

  if (out.length === 0) {
    out.push({ id: 'ok', tone: 'good', title: L('محفظتك على المسار', 'Your portfolio is on track'), body: L('لا شيء عاجل. استمر في مساهمتك الشهرية.', 'Nothing urgent. Keep up your monthly contribution.'), href: '/analysis/', cta: L('التحليل', 'Analysis') })
  }
  return out.slice(0, 5)
}
