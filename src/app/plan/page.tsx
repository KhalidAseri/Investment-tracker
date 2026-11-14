'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Circle, CircleCheck, CircleDot } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ReviewFrequency } from '@/lib/types'
import { CLASS_COLOR, FREQ_LABEL, ZAKAT_LABEL, todayISO } from '@/lib/labels'
import { insights, staleManualRows } from '@/lib/engine/exposure'
import { DRIFT_THRESHOLD, driftRows, maxDrift } from '@/lib/engine/guidance'
import { emergencyStatus, goalStatus, incomeRate, monthsToTarget, roadmap } from '@/lib/engine/plan'
import { actualZakatRate, annualTransfer, balanceEquation, growthSeries, guardrail, layers, requiredPortfolio } from '@/lib/engine/income'
import { NISAB_GOLD_GRAMS, goldPricePerGram, zakatStatus } from '@/lib/engine/zakat'
import { reviewStatus } from '@/lib/engine/review'
import { dateLabel, num, pct } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import { LineChart, Meter, SegBar } from '@/components/charts'
import YearEndSheet from '@/components/YearEndSheet'
import { ZakatSheet } from '@/components/ZakatControl'
import { Chips, Disclaimer, Field, Money, Notice, NumberInput, Slider, Stat, cx } from '@/components/ui'

function Num({ n }: { n: number }) {
  return <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{n}</span>
}

type Tab = 'roadmap' | 'emergency' | 'goal' | 'income' | 'zakat' | 'review'
const TABS: Tab[] = ['roadmap', 'emergency', 'goal', 'income', 'zakat', 'review']

export default function PlanPage() {
  const { L, data, settings, view, quotes, quoteStatus, updateSettings, updateAsset, completeReview } = useStore()
  const [hash, setHash] = useHash('roadmap')
  const tab: Tab = (TABS as string[]).includes(hash) ? (hash as Tab) : 'roadmap'
  const [note, setNote] = useState('')
  const [yearEnd, setYearEnd] = useState(false)
  const [zakatAsset, setZakatAsset] = useState<string | null>(null)
  const sar = L('ر.س', 'SAR')

  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const ef = useMemo(() => emergencyStatus(view, settings), [view, settings])
  const goal = useMemo(() => goalStatus(view, settings), [view, settings])
  const drift = useMemo(() => driftRows(investRows, settings, L), [investRows, settings, L])
  const worst = maxDrift(drift)
  const risks = useMemo(() => insights(investRows, settings, L), [investRows, settings, L])
  const steps = useMemo(
    () => roadmap(data, view, { hasWarnings: risks.some((r) => r.severity === 'warn'), maxDriftAbs: Math.abs(worst?.drift ?? 0) }, L),
    [data, view, risks, worst, L],
  )
  const zakat = useMemo(() => zakatStatus(view.rows, quotes, settings), [view.rows, quotes, settings])
  const inc = settings.income
  const eq = balanceEquation(settings.goal.expectedReturn, inc.planZakatRate, settings.goal.inflation, inc.growthTarget)
  const planRate = eq.incomeRate
  const transfer = useMemo(() => annualTransfer(investRows, zakat.due, data.snapshots, settings, L), [investRows, zakat.due, data.snapshots, settings, L])
  const lay = useMemo(() => layers(investRows, inc.annualIncome || transfer.income, zakat.due, inc.reserveYears), [investRows, inc.annualIncome, inc.reserveYears, transfer.income, zakat.due])
  const guard = guardrail(inc.annualIncome, view.investable, inc.lastRate || planRate)
  const required = requiredPortfolio(settings.goal.monthlyIncome, planRate)
  // While still building, the portfolio compounds at the real return net of the planned zakat.
  const buildRate = Math.pow(1 + Math.max(-0.5, (settings.goal.expectedReturn - settings.goal.inflation - inc.planZakatRate) / 100), 1 / 12) - 1
  const monthsToRequired = required > 0 ? monthsToTarget(view.investable, settings.monthlyContribution, required, buildRate) : null
  const yearsToRequired = monthsToRequired === null ? null : Math.ceil(monthsToRequired / 12)
  // What the return is spent on, in the order it is taken out. Fixed slot order of the validated palette.
  const eqParts = [
    { key: 'zakat', label: L('الزكاة', 'Zakat'), raw: inc.planZakatRate, color: '#2a78d6' },
    { key: 'inflation', label: L('التضخم', 'Inflation'), raw: settings.goal.inflation, color: '#eb6834' },
    { key: 'growth', label: L('النمو الحقيقي للمحفظة', 'Real portfolio growth'), raw: inc.growthTarget, color: '#1baf7a' },
    { key: 'income', label: L('المتبقي: دخلك', 'What is left: your income'), raw: planRate, color: '#eda100' },
  ].map((p, _, all) => ({ ...p, pct: (Math.max(0, p.raw) / (all.reduce((t, x) => t + Math.max(0, x.raw), 0) || 1)) * 100 }))
  const actualRate = actualZakatRate(zakat.due, view.investable)
  const review = useMemo(() => reviewStatus(data), [data])
  const stale = useMemo(() => staleManualRows(view.rows), [view.rows])
  const gram = goldPricePerGram(quotes, settings)

  const labels: Record<Tab, string> = {
    roadmap: L('الخارطة', 'Roadmap'), emergency: L('الطوارئ', 'Emergency'), goal: L('الهدف', 'Goal'),
    income: L('الدخل', 'Income'), zakat: L('الزكاة', 'Zakat'), review: L('المراجعة', 'Review'),
  }
  const setGoal = (p: Partial<typeof settings.goal>) => updateSettings({ goal: { ...settings.goal, ...p } })
  const setIncome = (p: Partial<typeof settings.income>) => updateSettings({ income: { ...settings.income, ...p } })
  const setZakat = (p: Partial<typeof settings.zakat>) => updateSettings({ zakat: { ...settings.zakat, ...p } })

  return (
    <>
      <Chips value={tab} onChange={setHash} options={TABS.map((t) => ({ value: t, label: labels[t] }))} />

      {/* ---------- Roadmap ---------- */}
      {tab === 'roadmap' && (
        <section className="card">
          <h2 className="section-title">{L('خارطة بناء المحفظة', 'Portfolio building roadmap')}</h2>
          <p className="hint mt-1">{L('ثماني مراحل بالترتيب. التطبيق يعلّم ما يستطيع رصده، والباقي تعلّمه أنت.', 'Eight stages in order. The app ticks what it can observe; you tick the rest.')}</p>
          <ol className="mt-4 space-y-0">
            {steps.map((s, i) => {
              const Icon = s.status === 'done' ? CircleCheck : s.status === 'current' ? CircleDot : Circle
              return (
                <li key={s.id} className="relative flex gap-3 pb-5 last:pb-0">
                  {i < steps.length - 1 && <span className="absolute start-[11px] top-7 h-[calc(100%-1.75rem)] w-0.5 bg-line" aria-hidden />}
                  <Icon className={cx('mt-0.5 h-6 w-6 shrink-0', s.status === 'done' ? 'text-gain' : s.status === 'current' ? 'text-brand-600' : 'text-ink-faint')} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-sm font-bold', s.status === 'todo' && 'text-ink-soft')}>
                      {s.title}
                      {s.status === 'current' && <span className="ms-2 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{L('أنت هنا', 'You are here')}</span>}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">{s.body}</p>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {s.href && s.status !== 'done' && <Link href={s.href} className="text-sm font-semibold text-brand-700">{L('افتح', 'Open')}</Link>}
                      {s.manualKey && (
                        <button className="flex min-h-[32px] items-center gap-1.5 text-sm font-semibold text-brand-700" onClick={() => updateSettings({ roadmap: { ...settings.roadmap, [s.manualKey!]: !settings.roadmap[s.manualKey!] } })}>
                          <Check className="h-4 w-4" />{settings.roadmap[s.manualKey] ? L('تراجع عن التعليم', 'Undo') : L('تم / لا ينطبق', 'Done / not applicable')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* ---------- Emergency fund ---------- */}
      {tab === 'emergency' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('صندوق الطوارئ', 'Emergency fund')}</h2>
            <Field label={L('مصاريفك الشهرية الأساسية', 'Your essential monthly expenses')}><NumberInput value={settings.monthlyExpenses} onChange={(monthlyExpenses) => updateSettings({ monthlyExpenses })} suffix={sar} /></Field>
            <Field group label={L('كم شهرًا تريد تغطيته؟', 'How many months to cover?')} hint={L('3 أشهر لدخل ثابت ومعيلَين، 6 للمعتاد، 9–12 لدخل متذبذب أو معيل وحيد.', '3 for stable dual incomes, 6 as the norm, 9–12 for variable income or a sole earner.')}>
              <Chips wrap value={settings.emergencyMonths} onChange={(emergencyMonths) => updateSettings({ emergencyMonths })} options={[3, 6, 9, 12].map((m) => ({ value: m, label: L(`${m} أشهر`, `${m} mo`) }))} />
            </Field>
            {ef.target > 0 ? (
              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-sm"><span className="font-semibold">{ef.ready ? L('مكتمل', 'Complete') : L('التقدم', 'Progress')}</span><span className="num font-bold">{pct(ef.pct, 0)}</span></div>
                <Meter value={ef.pct} tone={ef.ready ? 'good' : 'brand'} label={L('اكتمال صندوق الطوارئ', 'Emergency fund progress')} />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <Stat label={L('الموجود', 'Saved')}><span className="text-sm"><Money value={ef.current} /></span></Stat>
                  <Stat label={L('المطلوب', 'Target')}><span className="text-sm"><Money value={ef.target} /></span></Stat>
                  <Stat label={L('يغطي', 'Covers')}><span className="num text-sm">{ef.monthsCovered.toFixed(1)} {L('شهر', 'mo')}</span></Stat>
                </div>
                {!ef.ready && settings.monthlyContribution > 0 && (
                  <p className="pt-1 text-sm text-ink-soft">{L(`بتوجيه مساهمتك الشهرية كاملة له يكتمل خلال ${Math.ceil(ef.shortfall / settings.monthlyContribution)} شهر.`, `Sending your full monthly contribution here completes it in ${Math.ceil(ef.shortfall / settings.monthlyContribution)} months.`)}</p>
                )}
              </div>
            ) : <p className="hint">{L('أدخل مصاريفك الشهرية ليُحسب المبلغ المطلوب.', 'Enter your monthly expenses to compute the target.')}</p>}
          </section>
          <section className="card space-y-3">
            <h2 className="section-title">{L('أي أصولك تُحتسب للطوارئ؟', 'Which assets count toward it?')}</h2>
            <p className="hint">{L('اختر النقد وصناديق أسواق النقد سريعة التسييل فقط. ما تختاره يُستثنى من تحليل الاستثمار.', 'Choose only cash and quickly redeemable money-market funds. What you pick is excluded from the investment analysis.')}</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {view.rows.filter((r) => r.asset.assetClass === 'CASH' || r.asset.isEmergencyFund).map((r) => (
                <li key={r.asset.id}>
                  <label className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
                    <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={r.asset.isEmergencyFund} onChange={(e) => updateAsset(r.asset.id, { isEmergencyFund: e.target.checked })} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.asset.name}</span>
                    <Money value={r.value} className="text-sm" />
                  </label>
                </li>
              ))}
              {!view.rows.some((r) => r.asset.assetClass === 'CASH' || r.asset.isEmergencyFund) && <li className="px-3.5 py-3 text-sm text-ink-soft">{L('لا أصول نقدية بعد. أضف حساب ادخار أو صندوق مرابحة من «الأصول».', 'No cash assets yet. Add a savings account or money-market fund under Assets.')}</li>}
            </ul>
            <Disclaimer>{L('أين تضعه؟ في وعاء يُسيَّل خلال أيام ولا يتقلب: حساب ادخار، أو صندوق مرابحة/أسواق نقد. ليس في الأسهم، وليس في وديعة مقفلة طويلة.', 'Where to keep it? Somewhere redeemable within days that does not swing: a savings account or a murabaha / money-market fund. Not equities, not a long locked deposit.')}</Disclaimer>
          </section>
        </>
      )}

      {/* ---------- Goal ---------- */}
      {tab === 'goal' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('هدفك', 'Your goal')}</h2>
            <Chips wrap value={settings.goal.mode} onChange={(mode) => setGoal({ mode })} options={[{ value: 'AMOUNT', label: L('مبلغ محدد', 'A set amount') }, { value: 'INCOME', label: L('دخل شهري من المحفظة', 'Monthly income from the portfolio') }]} />
            {settings.goal.mode === 'AMOUNT'
              ? <Field label={L('المبلغ المستهدف (بقيمة اليوم)', 'Target amount (today’s money)')}><NumberInput value={settings.goal.amount} onChange={(amount) => setGoal({ amount })} suffix={sar} /></Field>
              : <Field label={L('الدخل الشهري الذي تريده (بقيمة اليوم)', 'Monthly income you want (today’s money)')} hint={goal.target > 0 ? L(`يتطلب محفظة بقيمة ${num(goal.target, 0)} ر.س عند نسبة دخل ${planRate.toFixed(2)}% (من خطة الدخل).`, `Needs a portfolio of SAR ${num(goal.target, 0)} at a ${planRate.toFixed(2)}% income rate (from the income plan).`) : undefined}><NumberInput value={settings.goal.monthlyIncome} onChange={(monthlyIncome) => setGoal({ monthlyIncome })} suffix={sar} /></Field>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={L('سنة الوصول', 'Target year')}><NumberInput value={settings.goal.targetYear} onChange={(targetYear) => setGoal({ targetYear: Math.round(targetYear) })} /></Field>
              <Field label={L('مساهمتك الشهرية', 'Monthly contribution')}><NumberInput value={settings.monthlyContribution} onChange={(monthlyContribution) => updateSettings({ monthlyContribution })} suffix={sar} /></Field>
              <Field label={L('العائد السنوي المتوقع', 'Expected annual return')}><NumberInput value={settings.goal.expectedReturn} onChange={(expectedReturn) => setGoal({ expectedReturn })} suffix="%" /></Field>
              <Field label={L('التضخم السنوي', 'Annual inflation')}><NumberInput value={settings.goal.inflation} onChange={(inflation) => setGoal({ inflation })} suffix="%" /></Field>
            </div>
          </section>
          {goal.target > 0 ? (
            <section className="card space-y-4">
              <div className="flex items-baseline justify-between"><h2 className="section-title">{L('أين أنت من الهدف؟', 'Where do you stand?')}</h2><span className="num text-sm font-bold">{pct(goal.pct, 0)}</span></div>
              <Meter value={goal.pct} tone={goal.pct >= 100 ? 'good' : 'brand'} label={L('نسبة بلوغ الهدف', 'Goal progress')} />
              <div className="grid grid-cols-2 gap-3">
                <Stat label={L('المحفظة الاستثمارية الآن', 'Investable now')}><Money value={goal.current} /></Stat>
                <Stat label={L('الهدف', 'Target')}><Money value={goal.target} /></Stat>
                <Stat label={L('تبلغه بوتيرتك الحالية', 'You reach it at this pace')}><span className="num">{goal.reachYear ?? L('لا يُبلغ', 'Never')}</span></Stat>
                <Stat label={L(`المتوقع في ${settings.goal.targetYear}`, `Projected in ${settings.goal.targetYear}`)}><Money value={goal.projectedAtDate} /></Stat>
              </div>
              {goal.pct < 100 && (
                <Notice tone={goal.onTrack ? 'good' : 'warn'} title={goal.onTrack ? L('أنت على المسار', 'You are on track') : L(`تحتاج ${num(goal.requiredMonthly, 0)} ر.س شهريًا لتبلغه في ${settings.goal.targetYear}`, `You need SAR ${num(goal.requiredMonthly, 0)} a month to reach it by ${settings.goal.targetYear}`)}>
                  {goal.onTrack
                    ? L(`مساهمتك الحالية تكفي؛ الحد الأدنى اللازم ${num(goal.requiredMonthly, 0)} ر.س شهريًا.`, `Your current contribution is enough; the minimum needed is SAR ${num(goal.requiredMonthly, 0)} a month.`)
                    : L(`مساهمتك الحالية ${num(settings.monthlyContribution, 0)} ر.س. ارفعها، أو مدّد السنة المستهدفة.`, `You contribute SAR ${num(settings.monthlyContribution, 0)} now. Raise it, or push the target year out.`)}
                </Notice>
              )}
              <LineChart points={goal.series} target={goal.target} targetLabel={L('الهدف', 'Goal')} label={L('إسقاط قيمة المحفظة حتى الهدف', 'Projected portfolio value toward the goal')} />
              <Disclaimer>{L(`كل الأرقام بالقوة الشرائية لليوم: العائد الحقيقي = ${settings.goal.expectedReturn}% − تضخم ${settings.goal.inflation}%. إسقاط حسابي لا يضمن عائدًا؛ الأسواق تتقلب من سنة لأخرى.`, `All figures are in today’s purchasing power: real return = ${settings.goal.expectedReturn}% − ${settings.goal.inflation}% inflation. A projection, not a promise; markets swing from year to year.`)}</Disclaimer>
            </section>
          ) : <Notice tone="info" title={L('أدخل هدفك لترى المسار', 'Enter your goal to see the path')} />}
        </>
      )}

      {/* ---------- Income plan ---------- */}
      {tab === 'income' && (
        <>
          {/* 1. Income is what is left of the return after zakat, inflation and the growth to keep */}
          <section className="card space-y-4">
            <div>
              <h2 className="section-title">{L('وازن بين الزكاة والنمو ودخلك', 'Balance zakat, growth and your income')}</h2>
              <p className="hint mt-1">{L('من العائد المتوقع تطلع الزكاة ثم التضخم ثم النمو الذي تريده لمحفظتك، والمتبقي هو دخلك.', 'From the expected return come zakat, then inflation, then the growth you want the portfolio to keep. What is left is your income.')}</p>
            </div>
            <Slider label={L('العائد السنوي المتوقع', 'Expected annual return')} value={settings.goal.expectedReturn} min={2} max={12} step={0.5} display={`${settings.goal.expectedReturn}%`} onChange={(expectedReturn) => setGoal({ expectedReturn })} />
            <Slider label={L('الزكاة', 'Zakat')} value={inc.planZakatRate} min={0} max={2.6} step={0.1} display={`${inc.planZakatRate}%`} onChange={(planZakatRate) => setIncome({ planZakatRate })}
              hint={L('2.5% من كامل المحفظة هو الحد الأعلى. الفعلية تُحسب من أصولك يوم الحول وغالبًا تكون أقل.', '2.5% of the whole portfolio is the ceiling. The actual figure is computed from your assets on zakat day and is usually lower.')} />
            <Slider label={L('التضخم', 'Inflation')} value={settings.goal.inflation} min={0} max={6} step={0.5} display={`${settings.goal.inflation}%`} onChange={(inflation) => setGoal({ inflation })} />
            <Slider label={L('النمو الحقيقي الذي أريده للمحفظة', 'Real growth I want the portfolio to keep')} value={inc.growthTarget} min={0} max={6} step={0.25} display={`${inc.growthTarget}%`} onChange={(growthTarget) => setIncome({ growthTarget })}
              hint={L('صفر = المحفظة تحافظ على قوتها الشرائية فقط. كل نقطة هنا تنقص من دخلك اليوم وتكبّره لاحقًا.', 'Zero = the portfolio only keeps its purchasing power. Each point here lowers today’s income and grows it later.')} />

            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs text-brand-700">{L('المتبقي: دخلك السنوي من المحفظة', 'What is left: your annual income from the portfolio')}</p>
              <p className="num text-3xl font-bold text-brand-900">{planRate.toFixed(2).replace(/\.?0+$/, '')}%</p>
              <p className="num mt-1 text-xs text-brand-700">{`${settings.goal.expectedReturn} − ${inc.planZakatRate} − ${settings.goal.inflation} − ${inc.growthTarget} = ${eq.remainder.toFixed(2).replace(/\.?0+$/, '')}`}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{L(`كيف يتوزع العائد ${settings.goal.expectedReturn}%؟`, `How the ${settings.goal.expectedReturn}% return is used`)}</p>
              <SegBar parts={eqParts} />
              <ul className="mt-3 space-y-1.5">
                {eqParts.map((p) => (
                  <li key={p.key} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden />{p.label}</span>
                    <span className="num font-semibold">{p.raw.toFixed(2).replace(/\.?0+$/, '')}%</span>
                  </li>
                ))}
              </ul>
            </div>
            {!eq.feasible && <Notice tone="warn" title={L('لا يبقى دخل بهذه التركيبة', 'Nothing is left for income with this mix')}>{L(`العائد لا يغطي الزكاة والتضخم والنمو المطلوب (ينقص ${Math.abs(eq.remainder).toFixed(1)}%). خفّض النمو المطلوب.`, `The return does not cover zakat, inflation and the growth target (short by ${Math.abs(eq.remainder).toFixed(1)}%). Lower the growth target.`)}</Notice>}
            {view.investable > 0 && (
              <p className="hint">
                {L(`الزكاة الفعلية من أصولك الآن ${actualRate.toFixed(2)}% — لو بقيت كذلك يوم الحول يصير دخلك ${incomeRate(settings.goal.expectedReturn, actualRate, settings.goal.inflation, inc.growthTarget).toFixed(2)}%.`, `Actual zakat from your assets is now ${actualRate.toFixed(2)}% — if it stays so on zakat day your income becomes ${incomeRate(settings.goal.expectedReturn, actualRate, settings.goal.inflation, inc.growthTarget).toFixed(2)}%.`)}{' '}
                <Link href="/plan/#zakat" className="font-semibold text-brand-700">{L('اضبط زكاة كل أصل', 'Set zakat per asset')}</Link>
              </p>
            )}
          </section>

          {/* 2. What this mix pays, and the portfolio size the target needs */}
          <section className="card space-y-4">
            <h2 className="section-title">{L('الدخل وحجم المحفظة المطلوب', 'Income and the portfolio size you need')}</h2>
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs text-brand-700">{L('محفظتك اليوم تعطيك شهريًا', 'Your portfolio today pays per month')}</p>
              <p className="text-3xl font-bold text-brand-900"><Money value={(view.investable * planRate) / 100 / 12} /></p>
              <p className="mt-1 text-xs text-brand-700">{L('سنويًا', 'Per year')} <Money value={(view.investable * planRate) / 100} /> · {L('زكاة حسب الخطة', 'planned zakat')} <Money value={(view.investable * inc.planZakatRate) / 100} /></p>
            </div>
            <Field label={L('الدخل الشهري الذي تريد الوصول إليه (بقيمة اليوم)', 'The monthly income you want to reach (today’s money)')}>
              <NumberInput value={settings.goal.monthlyIncome} onChange={(monthlyIncome) => setGoal({ monthlyIncome })} suffix={sar} />
            </Field>
            {settings.goal.monthlyIncome > 0 && required <= 0 && <p className="hint">{L('لا يبقى دخل بالتركيبة الحالية، فلا يمكن حساب حجم محفظة. عدّل المنزلقات أعلاه.', 'Nothing is left for income with the current mix, so no size can be computed. Adjust the sliders above.')}</p>}
            {required > 0 && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={L('حجم المحفظة المطلوب', 'Portfolio size needed')}><Money value={required} /></Stat>
                  <Stat label={L('الباقي', 'Still to go')}><Money value={Math.max(0, required - view.investable)} /></Stat>
                </div>
                <Meter value={(view.investable / required) * 100} tone={view.investable >= required ? 'good' : 'brand'} label={L('التقدم نحو حجم المحفظة المطلوب', 'Progress to the required portfolio size')} />
                <p className="text-sm text-ink-soft">
                  {view.investable >= required ? L('بلغت الحجم المطلوب — نفّذ أول تحويلة سنوية أدناه.', 'You have reached the size needed — do your first yearly transfer below.')
                    : yearsToRequired === null ? L('بمساهمتك الحالية لا يُبلغ هذا الحجم. ارفع المساهمة أو خفّض الدخل المستهدف.', 'Your current contribution never gets there. Raise it or lower the target income.')
                    : L(`بمساهمتك الشهرية ${num(settings.monthlyContribution, 0)} ر.س تبلغه خلال نحو ${yearsToRequired} سنة.`, `With SAR ${num(settings.monthlyContribution, 0)} a month you get there in about ${yearsToRequired} years.`)}
                </p>
                {settings.goal.mode !== 'INCOME' && <button className="btn-soft w-full" onClick={() => setGoal({ mode: 'INCOME' })}>{L('اجعل هذا هدف محفظتي', 'Make this my portfolio goal')}</button>}
              </>
            )}
          </section>

          {/* 3. The three layers */}
          <section className="card space-y-4">
            <div>
              <h2 className="section-title">{L('الطبقات الثلاث', 'The three layers')}</h2>
              <p className="hint mt-1">{L('حساب الدخل يدفع راتبك، الاحتياط يعبّئه وقت الهبوط، والنمو لا يُلمس في السنوات السيئة.', 'The income account pays your salary, the reserve refills it in a downturn, and growth is left alone in bad years.')}</p>
            </div>
            {[
              { name: L('حساب الدخل', 'Income account'), what: L('نقد أو صندوق مرابحة: دخل سنة + زكاتها', 'Cash or money market: a year of income + its zakat'), value: lay.income.value, target: lay.income.target },
              { name: L('الاحتياط', 'Reserve'), what: L(`صكوك ونقد منخفض التذبذب: دخل ${settings.income.reserveYears} سنة`, `Sukuk and low-volatility cash: ${settings.income.reserveYears} years of income`), value: lay.reserve.value, target: lay.reserve.target },
              { name: L('النمو', 'Growth'), what: L('أسهم وصناديق أسهم وريت وذهب: الباقي', 'Equities, equity funds, REITs, gold: the rest'), value: lay.growth.value, target: 0 },
            ].map((l) => (
              <div key={l.name}>
                <div className="flex items-baseline justify-between gap-3 text-sm"><span className="font-semibold">{l.name}</span><span><Money value={l.value} className="font-semibold" />{l.target > 0 && <span className="text-xs text-ink-soft"> / <Money value={l.target} /></span>}</span></div>
                {l.target > 0 && <div className="mt-1.5"><Meter value={(l.value / l.target) * 100} tone={l.value >= l.target ? 'good' : 'warn'} label={l.name} /></div>}
                <p className="hint mt-1">{l.what}</p>
              </div>
            ))}
            <Field group label={L('حجم الاحتياط', 'Reserve size')}>
              <Chips wrap value={settings.income.reserveYears} onChange={(reserveYears) => setIncome({ reserveYears })} options={[1, 1.5, 2].map((y) => ({ value: y, label: L(`${y} سنة`, `${y} yr`) }))} />
            </Field>
            <div>
              <p className="label">{L('أي حساباتك النقدية هو حساب الدخل؟', 'Which of your cash accounts is the income account?')}</p>
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {investRows.filter((r) => r.asset.assetClass === 'CASH').map((r) => (
                  <li key={r.asset.id}>
                    <label className="flex min-h-[52px] items-center gap-3 px-3.5 py-2">
                      <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={!!r.asset.isIncomeAccount} onChange={(e) => updateAsset(r.asset.id, { isIncomeAccount: e.target.checked })} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.asset.name}</span>
                      <Money value={r.value} className="text-sm" />
                    </label>
                  </li>
                ))}
                {!investRows.some((r) => r.asset.assetClass === 'CASH') && <li className="px-3.5 py-3 text-sm text-ink-soft">{L('أضف حسابًا نقديًا أو صندوق مرابحة مخصصًا للدخل من «الأصول» (غير صندوق الطوارئ).', 'Add a cash account or money-market fund dedicated to income under Assets (separate from the emergency fund).')}</li>}
              </ul>
            </div>
          </section>

          {/* 4. The yearly transfer on the zakat date */}
          <section className="card space-y-4">
            <div>
              <h2 className="section-title">{L('يوم الزكاة والتحويلة السنوية', 'Zakat day and the yearly transfer')}</h2>
              <p className="hint mt-1">
                {settings.zakat.hawlDate
                  ? <>{L('الموعد', 'Date')}: {dateLabel(settings.zakat.hawlDate, settings.locale)} · {zakat.daysToHawl !== null && zakat.daysToHawl > 0 ? L(`بعد ${zakat.daysToHawl} يوم`, `in ${zakat.daysToHawl} days`) : L('حان موعدها', 'due now')}</>
                  : <>{L('حدّد تاريخ الحول من تبويب «الزكاة» ليذكّرك التطبيق.', 'Set the due date under the Zakat tab so the app reminds you.')} <Link href="/plan/#zakat" className="font-semibold text-brand-700">{L('تحديد', 'Set')}</Link></>}
              </p>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">{L('مرة في السنة، في يوم واحد: تراجع الزكاة الفعلية لكل أصل وتدفعها، ثم يُحسب دخل سنتك من المتبقي ويُثبَّت راتبك الشهري.', 'Once a year, on one day: you review and pay the actual zakat per asset, then the year’s income is computed from what is left and your monthly salary is fixed.')}</p>
            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L('لو كان اليوم: الزكاة الفعلية', 'If it were today: actual zakat')}</dt><dd className="font-semibold"><Money value={transfer.zakat} /> <span className="num text-xs text-ink-soft">({pct(transfer.zakatRatePct, 2)})</span></dd></div>
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L('دخل السنة', 'Year’s income')}</dt><dd className="font-semibold"><Money value={transfer.income} /> <span className="num text-xs text-ink-soft">({pct(transfer.ratePct, 2)})</span></dd></div>
              <div className="flex justify-between bg-surface px-3.5 py-2.5"><dt className="font-semibold">{L('راتبك الشهري', 'Your monthly salary')}</dt><dd className="font-bold"><Money value={transfer.monthly} /></dd></div>
            </dl>
            <button className="btn-primary w-full" disabled={view.investable <= 0} onClick={() => setYearEnd(true)}>{L('ابدأ يوم الزكاة والتحويلة', 'Start zakat day and the transfer')}</button>
          </section>

          {/* 5. Current salary and guardrails */}
          <section className="card space-y-3">
            <h2 className="section-title">{L('راتبك الحالي وقواعد الحماية', 'Your current salary and guardrails')}</h2>
            {settings.income.annualIncome > 0 ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label={L('راتبك الشهري الثابت', 'Your fixed monthly salary')}><Money value={settings.income.annualIncome / 12} /></Stat>
                  <Stat label={L('نسبته من القيمة الحالية', 'As a share of today’s value')} sub={settings.income.lastTransferDate ? L(`ثُبّت في ${dateLabel(settings.income.lastTransferDate, settings.locale)}`, `Set on ${dateLabel(settings.income.lastTransferDate, settings.locale)}`) : undefined}><span className="num">{guard.ratePct.toFixed(1)}%</span></Stat>
                </div>
                {guard.state === 'cut' && <Notice tone="warn" title={L(`الدخل تجاوز ${guard.upper.toFixed(1)}% من قيمة المحفظة`, `Income is above ${guard.upper.toFixed(1)}% of the portfolio`)} action={<button className="btn-soft" onClick={() => setIncome({ annualIncome: guard.suggested })}>{L(`خفّضه 10% إلى ${num(guard.suggested / 12, 0)} ر.س شهريًا`, `Cut 10% to SAR ${num(guard.suggested / 12, 0)} a month`)}</button>}>{L('المحفظة هبطت؛ التخفيض المؤقت يحمي رأس المال حتى تتعافى.', 'The portfolio fell; a temporary cut protects capital until it recovers.')}</Notice>}
                {guard.state === 'raise' && <Notice tone="good" title={L(`الدخل أقل من ${guard.lower.toFixed(1)}% من قيمة المحفظة`, `Income is below ${guard.lower.toFixed(1)}% of the portfolio`)} action={<button className="btn-soft" onClick={() => setIncome({ annualIncome: guard.suggested })}>{L(`ارفعه 10% إلى ${num(guard.suggested / 12, 0)} ر.س شهريًا`, `Raise 10% to SAR ${num(guard.suggested / 12, 0)} a month`)}</button>}>{L('المحفظة ارتفعت؛ تقدر تزيد دخلك دون مساس بالنمو.', 'The portfolio rose; you can lift your income without touching growth.')}</Notice>}
                {guard.state === 'ok' && <Notice tone="good" title={L('الدخل ضمن الحدود الآمنة', 'Income is within the safe bounds')} />}
              </>
            ) : <p className="hint">{L('يظهر راتبك هنا بعد تنفيذ أول تحويلة سنوية.', 'Your salary appears here after the first yearly transfer.')}</p>}
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
              <li>• {L(`إذا صار الدخل أكثر من ${guard.upper.toFixed(1)}% من قيمة المحفظة الحالية: خفّضه 10%.`, `If income exceeds ${guard.upper.toFixed(1)}% of the current value: cut it 10%.`)}</li>
              <li>• {L(`إذا صار أقل من ${guard.lower.toFixed(1)}%: ارفعه 10%.`, `If it falls below ${guard.lower.toFixed(1)}%: raise it 10%.`)}</li>
              <li>• {L('الحدّان يتبعان نسبة دخل خطتك (5% و3% عند خطة 3.5%).', 'Both bounds follow your plan’s income rate (5% and 3% for a 3.5% plan).')}</li>
              <li>• {L('لا زيادة في سنة كانت المحفظة فيها خاسرة.', 'No raise in a year the portfolio lost value.')}</li>
              <li>• {L(`إذا نزل السوق ${settings.income.drawdownTrigger}% أو أكثر عن قمته: عبّئ من الاحتياط ولا تبع من النمو.`, `If the market is ${settings.income.drawdownTrigger}% or more off its peak: refill from the reserve, do not sell growth.`)}</li>
            </ul>
          </section>

          {view.investable > 0 && (
            <section className="card space-y-3">
              <h2 className="section-title">{L('المحفظة مع الدخل عبر السنوات', 'The portfolio under this plan over the years')}</h2>
              <p className="text-sm text-ink-soft">{eq.feasible ? L(`تنمو المحفظة ${inc.growthTarget}% حقيقيًا كل سنة، ودخلك يكبر معها بنفس النسبة بقيمة اليوم.`, `The portfolio grows ${inc.growthTarget}% a year in real terms, and your income grows with it at the same pace in today’s money.`) : L('بهذه التركيبة العائد لا يغطي ما يخرج، فالمحفظة تتآكل.', 'With this mix the return does not cover what leaves, so the portfolio shrinks.')}</p>
              <LineChart points={growthSeries(view.investable, eq.feasible ? inc.growthTarget : eq.remainder)} label={L('قيمة المحفظة المتوقعة مع الدخل', 'Projected portfolio value under the income plan')} />
              <Disclaimer>{L('إطار منهجي وإسقاط حسابي بعائد ثابت، وليس استشارة مالية أو فتوى. العوائد غير مضمونة، والواقع يتقلب — ولذلك وُجدت الطبقات وقواعد الحماية.', 'A methodical framework and a constant-return projection, not financial advice or a religious ruling. Returns are not guaranteed and reality swings — hence the layers and guardrails.')}</Disclaimer>
            </section>
          )}
        </>
      )}

      {/* ---------- Zakat ---------- */}
      {tab === 'zakat' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('زكاة المحفظة', 'Portfolio zakat')}</h2>
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs text-brand-700">{L('الزكاة الفعلية لو حال الحول اليوم', 'Actual zakat if it were due today')}</p>
              <p className="text-3xl font-bold text-brand-900"><Money value={zakat.due} /></p>
              <p className="mt-1 text-xs text-brand-700"><span className="num">{pct(actualRate, 2)}</span> {L('من المحفظة الاستثمارية', 'of the investable portfolio')} · {L('في الخطة', 'planned')} <span className="num">{inc.planZakatRate}%</span></p>
            </div>
            {zakat.aboveNisab === false && <Notice tone="info" title={L('الوعاء دون النصاب', 'The base is below the nisab')}>{L('حسب ما هو مسجل هنا فقط. إن كان لك مال زكوي آخر خارج التطبيق فاجمعه معه.', 'Based only on what is recorded here. If you hold other zakatable wealth outside the app, add it in.')}</Notice>}
            <div className="grid grid-cols-2 gap-3">
              <Field label={L('تاريخ الحول القادم', 'Next due date')}><input type="date" className="input" value={settings.zakat.hawlDate} onChange={(e) => setZakat({ hawlDate: e.target.value })} /></Field>
              <Field label={L('حساب السنة', 'Year basis')}>
                <select className="input" value={settings.zakat.calendar} onChange={(e) => setZakat({ calendar: e.target.value as 'HIJRI' | 'GREGORIAN' })}>
                  <option value="HIJRI">{L('هجرية — 2.5%', 'Hijri — 2.5%')}</option>
                  <option value="GREGORIAN">{L('ميلادية — 2.577%', 'Gregorian — 2.577%')}</option>
                </select>
              </Field>
            </div>
            <p className="text-sm text-ink-soft">
              {L('النصاب', 'Nisab')} ({NISAB_GOLD_GRAMS} {L('جم ذهب', 'g gold')}): {zakat.nisab > 0 ? <Money value={zakat.nisab} className="font-semibold text-ink" /> : '—'}
              {gram > 0 && <> · {L('سعر الجرام', 'gram price')} <span className="num">{num(gram, 2)}</span></>}
              {zakat.daysToHawl !== null && <> · {zakat.daysToHawl > 0 ? L(`باقي ${zakat.daysToHawl} يوم`, `${zakat.daysToHawl} days left`) : L('حلّ موعدها', 'now due')}</>}
            </p>
            {!(quotes['GC=F']?.price > 0) && (
              <Field label={L('سعر جرام الذهب عيار 24 (لحساب النصاب)', '24k gold price per gram (for the nisab)')} hint={L('تعذّر جلبه تلقائيًا — أدخله يدويًا.', 'Could not be fetched automatically — enter it by hand.')}>
                <NumberInput value={settings.zakat.goldPricePerGram} onChange={(goldPricePerGram) => setZakat({ goldPricePerGram })} suffix={sar} />
              </Field>
            )}
            <button className="btn-primary w-full" disabled={view.investable <= 0} onClick={() => setYearEnd(true)}>{L('ابدأ يوم الزكاة والتحويلة', 'Start zakat day and the transfer')}</button>
            <p className="hint">{L('يوم الدفع هو يوم التحويلة السنوية لحساب الدخل: تراجع، تدفع، ثم يُحسب دخل السنة.', 'Payment day is also the yearly transfer to the income account: review, pay, then the year’s income is computed.')}</p>
          </section>

          <section className="card space-y-3">
            <h2 className="section-title">{L('زكاة كل أصل', 'Zakat per asset')}</h2>
            <p className="hint">{L('اضغط أي أصل لتحديد طريقة زكاته: كامل القيمة، نسبة، زكاة السهم، مبلغ تحدده، الشركة تزكّي، أو لا زكاة.', 'Tap any asset to choose how it is zakated: full value, a share, per-share zakat, an amount you set, company pays, or none.')}</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {zakat.rows.map((r) => (
                <li key={r.assetId}>
                  <button className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3.5 py-2 text-start hover:bg-surface" onClick={() => setZakatAsset(r.assetId)}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.name}</span><span className="text-xs text-ink-soft">{L(ZAKAT_LABEL[r.mode].ar, ZAKAT_LABEL[r.mode].en)} · <span className="num">{pct(r.effectivePct, 2)}</span> {L('من قيمته', 'of its value')}</span></span>
                    <Money value={r.due} className="shrink-0 text-sm font-bold" />
                  </button>
                </li>
              ))}
              {zakat.rows.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-soft">{L('لا أصول بعد. تحدد زكاة كل أصل وأنت تسجله.', 'No assets yet. You set each asset’s zakat as you add it.')}</li>}
            </ul>
            <Disclaimer>
              {L('تقدير حسابي لمساعدتك وليس فتوى. الافتراضات عند تسجيل الأصل: النقد والودائع والصكوك والذهب على كامل القيمة؛ الأسهم والصناديق طويلة الأجل على 30% من قيمتها كتقدير تقريبي للأصول الزكوية؛ الأسهم السعودية المدرجة تزكّيها الشركة (والمسألة خلافية)؛ العقار المؤجَّر والريت لا زكاة على أصلها. عدّل كل أصل بما تأخذ به، وراجع جهة شرعية تثق بها.',
                'An arithmetic estimate to help you, not a religious ruling. Defaults when an asset is added: cash, deposits, sukuk and gold on full value; long-term shares and funds on 30% of value as a rough stand-in for zakatable assets; Saudi-listed shares are covered by the company (scholars differ); rented property and REITs are not zakatable on the asset. Adjust each asset to the view you follow and check with a Shariah authority you trust.')}
            </Disclaimer>
          </section>

          {settings.zakat.history.length > 0 && (
            <section className="card">
              <h2 className="section-title mb-3">{L('سجل السنوات', 'Year records')}</h2>
              <ul className="divide-y divide-line">
                {settings.zakat.history.map((h, i) => (
                  <li key={h.date + i} className="py-2.5 text-sm">
                    <details>
                      <summary className="flex cursor-pointer items-center justify-between gap-3"><span>{dateLabel(h.date, settings.locale)}</span><span className="text-end"><Money value={h.actual} className="font-semibold" /><span className="block text-xs text-ink-soft">{L('المخطط', 'planned')} <Money value={h.planned} /> · {L('دخل السنة', 'income')} <Money value={h.income} /></span></span></summary>
                      <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">{h.items.map((it, j) => <li key={j} className="flex justify-between gap-3"><span className="truncate">{it.name}</span><Money value={it.amount} /></li>)}</ul>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ---------- Review ---------- */}
      {tab === 'review' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('المراجعة الدورية', 'Periodic review')}</h2>
            <Field group label={L('كل متى تراجع محفظتك؟', 'How often do you review?')} hint={L('ربع سنوية تكفي أغلب المستثمرين. المتابعة اليومية تزيد القلق لا العائد.', 'Quarterly is enough for most investors. Daily checking adds worry, not return.')}>
              <Chips wrap value={settings.review.frequency} onChange={(frequency: ReviewFrequency) => updateSettings({ review: { ...settings.review, frequency } })} options={(Object.keys(FREQ_LABEL) as ReviewFrequency[]).map((f) => ({ value: f, label: L(FREQ_LABEL[f].ar, FREQ_LABEL[f].en) }))} />
            </Field>
            {review.nextDue && (
              <Notice tone={review.due ? 'warn' : 'good'} title={review.due ? L('المراجعة مستحقة الآن', 'A review is due now') : L(`المراجعة القادمة ${dateLabel(review.nextDue, settings.locale)}`, `Next review ${dateLabel(review.nextDue, settings.locale)}`)}>
                {review.due ? L('مرّ على القائمة أدناه ثم اضغط «أتممت المراجعة».', 'Go through the list below, then tap “Review done”.') : L(`بعد ${review.daysUntil} يوم.`, `In ${review.daysUntil} days.`)}
              </Notice>
            )}
          </section>
          <section className="card space-y-3">
            <h2 className="section-title">{L('قائمة المراجعة', 'Review checklist')}</h2>
            <ul className="space-y-2.5">
              {[
                { ok: quoteStatus !== 'failed', title: L('الأسعار المباشرة محدثة', 'Live prices are up to date'), body: quoteStatus === 'failed' ? L('تعذّر الجلب — اضغط زر التحديث أعلى الشاشة.', 'Fetch failed — tap refresh at the top.') : '', href: '' },
                { ok: stale.length === 0, title: L('قيم الأصول اليدوية محدثة', 'Manual asset values are up to date'), body: stale.length ? L(`حدّث: ${stale.map((r) => r.asset.name).join('، ')}`, `Update: ${stale.map((r) => r.asset.name).join(', ')}`) : '', href: '/assets/' },
                { ok: ef.ready || ef.target === 0, title: L('صندوق الطوارئ مكتمل', 'Emergency fund is complete'), body: ef.target > 0 && !ef.ready ? L(`باقي ${num(ef.shortfall, 0)} ر.س`, `SAR ${num(ef.shortfall, 0)} to go`) : '', href: '/plan/#emergency' },
                { ok: !worst || Math.abs(worst.drift) <= DRIFT_THRESHOLD, title: L('التوزيع قريب من المستهدف', 'Allocation is close to target'), body: worst && Math.abs(worst.drift) > DRIFT_THRESHOLD ? L(`«${worst.label}» منحرفة ${Math.abs(worst.drift).toFixed(0)} نقطة — وجّه المساهمة القادمة.`, `“${worst.label}” is off by ${Math.abs(worst.drift).toFixed(0)} points — steer the next contribution.`) : '', href: '/analysis/#next' },
                { ok: !risks.some((r) => r.severity === 'warn'), title: L('لا تركّزات مقلقة', 'No worrying concentrations'), body: risks.find((r) => r.severity === 'warn')?.title ?? '', href: '/analysis/' },
                { ok: zakat.daysToHawl === null || zakat.daysToHawl > 30, title: L('الزكاة ليست قريبة الاستحقاق', 'Zakat is not due soon'), body: zakat.daysToHawl !== null && zakat.daysToHawl <= 30 ? L(`تستحق خلال ${Math.max(0, zakat.daysToHawl)} يوم`, `Due within ${Math.max(0, zakat.daysToHawl)} days`) : settings.zakat.hawlDate ? '' : L('لم تحدد تاريخ الحول بعد.', 'You have not set a due date yet.'), href: '/plan/#zakat' },
              ].map((c, i) => (
                <li key={i} className="flex gap-3">
                  {c.ok ? <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-gain" aria-label={L('سليم', 'OK')} /> : <CircleDot className="mt-0.5 h-5 w-5 shrink-0 text-warn-600" aria-label={L('يحتاج إجراء', 'Needs action')} />}
                  <div className="min-w-0 text-sm"><p className="font-medium">{c.title}</p>{c.body && <p className="text-[13px] text-ink-soft">{c.body} {c.href && !c.ok && <Link href={c.href} className="font-semibold text-brand-700">{L('افتح', 'Open')}</Link>}</p>}</div>
                </li>
              ))}
            </ul>
            <Field label={L('ملاحظة لنفسك (اختياري)', 'A note to yourself (optional)')}><textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={L('ماذا قررت في هذه المراجعة؟', 'What did you decide this time?')} /></Field>
            <button className="btn-primary w-full" disabled={data.assets.length === 0} onClick={() => { completeReview(note.trim()); setNote('') }}>{L('أتممت المراجعة — احفظ لقطة', 'Review done — save snapshot')}</button>
          </section>
          {data.reviews.length > 0 && (
            <section className="card">
              <h2 className="section-title mb-3">{L('سجل المراجعات', 'Review history')}</h2>
              <ul className="divide-y divide-line">
                {data.reviews.map((r) => (
                  <li key={r.id} className="py-2.5 text-sm">
                    <div className="flex justify-between gap-3"><span>{dateLabel(r.date, settings.locale)}</span><Money value={r.netWorth} className="font-semibold" /></div>
                    {r.note && <p className="mt-0.5 text-[13px] text-ink-soft">{r.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <YearEndSheet open={yearEnd} onClose={() => setYearEnd(false)} />
      <ZakatSheet assetId={zakatAsset} onClose={() => setZakatAsset(null)} />
    </>
  )
}
