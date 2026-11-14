'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Check, Circle, CircleCheck, CircleDot } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ReviewFrequency, ZakatMode } from '@/lib/types'
import { CLASS_COLOR, FREQ_LABEL, ZAKAT_LABEL, todayISO } from '@/lib/labels'
import { insights, staleManualRows } from '@/lib/engine/exposure'
import { DRIFT_THRESHOLD, driftRows, maxDrift } from '@/lib/engine/guidance'
import { emergencyStatus, goalStatus, monthsToTarget, roadmap } from '@/lib/engine/plan'
import { annualTransfer, balanceEquation, effectiveZakatRate, growthSeries, guardrail, layers, requiredPortfolio } from '@/lib/engine/income'
import { NISAB_GOLD_GRAMS, goldPricePerGram, nextHawlDate, zakatStatus } from '@/lib/engine/zakat'
import { reviewStatus } from '@/lib/engine/review'
import { dateLabel, num, pct } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import { LineChart, Meter, SegBar } from '@/components/charts'
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
  const zakatRate = effectiveZakatRate(zakat.due, view.investable, settings)
  const eq = balanceEquation(settings.goal.expectedReturn, settings.goal.inflation, zakatRate, settings.income.rate)
  const transfer = useMemo(() => annualTransfer(investRows, zakat.due, data.snapshots, settings, L), [investRows, zakat.due, data.snapshots, settings, L])
  const lay = useMemo(() => layers(investRows, settings.income.annualIncome || transfer.income, zakat.due, settings.income.reserveYears), [investRows, settings.income, transfer.income, zakat.due])
  const guard = guardrail(settings.income.annualIncome, view.investable, settings.income.upper, settings.income.lower)
  const required = requiredPortfolio(settings.goal.monthlyIncome, settings.income.rate)
  // While still building, the portfolio compounds at the real return net of zakat.
  const buildRate = Math.pow(1 + Math.max(-0.5, (settings.goal.expectedReturn - settings.goal.inflation - zakatRate) / 100), 1 / 12) - 1
  const monthsToRequired = required > 0 ? monthsToTarget(view.investable, settings.monthlyContribution, required, buildRate) : null
  const yearsToRequired = monthsToRequired === null ? null : Math.ceil(monthsToRequired / 12)
  // Fixed slot order (validated categorical palette); a negative remainder is shown by the notice, not as a segment.
  const eqParts = [
    { key: 'income', label: L('دخلك', 'Your income'), raw: settings.income.rate, color: '#2a78d6' },
    { key: 'inflation', label: L('التضخم', 'Inflation'), raw: settings.goal.inflation, color: '#eb6834' },
    { key: 'zakat', label: L('الزكاة', 'Zakat'), raw: zakatRate, color: '#1baf7a' },
    { key: 'growth', label: L('النمو الحقيقي المتبقي', 'Real growth left'), raw: eq.growth, color: '#eda100' },
  ]
    .map((p) => ({ ...p, part: Math.max(0, p.raw) }))
    .map((p, _, all) => ({ ...p, pct: (p.part / (all.reduce((t, x) => t + x.part, 0) || 1)) * 100 }))
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
              : <Field label={L('الدخل الشهري الذي تريده (بقيمة اليوم)', 'Monthly income you want (today’s money)')} hint={goal.target > 0 ? L(`يتطلب محفظة بقيمة ${num(goal.target, 0)} ر.س عند معدل سحب ${settings.income.rate}%.`, `Needs a portfolio of SAR ${num(goal.target, 0)} at a ${settings.income.rate}% withdrawal rate.`) : undefined}><NumberInput value={settings.goal.monthlyIncome} onChange={(monthlyIncome) => setGoal({ monthlyIncome })} suffix={sar} /></Field>}
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
          {/* 1. The balance: return = income + zakat + inflation + growth */}
          <section className="card space-y-4">
            <div>
              <h2 className="section-title">{L('وازن بين الدخل والزكاة والنمو', 'Balance income, zakat and growth')}</h2>
              <p className="hint mt-1">{L('القاعدة: العائد المتوقع ≥ الدخل الذي تسحبه + الزكاة + التضخم. ما يبقى هو النمو الحقيقي لمحفظتك.', 'The rule: expected return ≥ income withdrawn + zakat + inflation. What is left is your portfolio’s real growth.')}</p>
            </div>
            <Slider label={L('العائد السنوي المتوقع', 'Expected annual return')} value={settings.goal.expectedReturn} min={2} max={12} step={0.5} display={`${settings.goal.expectedReturn}%`} onChange={(expectedReturn) => setGoal({ expectedReturn })} />
            <Slider label={L('التضخم', 'Inflation')} value={settings.goal.inflation} min={0} max={6} step={0.5} display={`${settings.goal.inflation}%`} onChange={(inflation) => setGoal({ inflation })} />
            <Slider label={L('الزكاة الفعلية من قيمة المحفظة', 'Effective zakat on portfolio value')} value={Math.round(zakatRate * 10) / 10} min={0} max={2.6} step={0.1} display={`${zakatRate.toFixed(1)}%`} onChange={(zakatRateOverride) => setIncome({ zakatRateOverride })}
              hint={settings.income.zakatRateOverride >= 0
                ? <button className="font-semibold text-brand-700" onClick={() => setIncome({ zakatRateOverride: -1 })}>{L('ارجع للنسبة المحسوبة من أصولك', 'Back to the rate computed from your assets')}</button>
                : L('محسوبة تلقائيًا من معالجة الزكاة لكل أصل في تبويب «الزكاة». حرّك المؤشر لتجربة نسبة أخرى.', 'Computed from each asset’s treatment under the Zakat tab. Move the slider to try another rate.')} />
            <Slider label={L('دخلك السنوي من المحفظة', 'Your annual income from the portfolio')} value={settings.income.rate} min={0} max={8} step={0.25} display={`${settings.income.rate}%`} onChange={(rate) => setIncome({ rate })} />

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
            {eq.sustainable
              ? <Notice tone="good" title={L(`تركيبة متوازنة: يبقى ${eq.growth.toFixed(1)}% نموًا حقيقيًا كل سنة`, `Balanced: ${eq.growth.toFixed(1)}% real growth is left each year`)}>{L(`أقصى دخل لا يمس النمو: ${Math.max(0, eq.maxIncomeRate).toFixed(1)}%.`, `Highest income that leaves growth untouched: ${Math.max(0, eq.maxIncomeRate).toFixed(1)}%.`)}</Notice>
              : <Notice tone="warn" title={L(`تأكل من رأس المال ${Math.abs(eq.growth).toFixed(1)}% كل سنة`, `You are eating ${Math.abs(eq.growth).toFixed(1)}% of capital each year`)}>{L(`الدخل + الزكاة + التضخم أكبر من العائد المتوقع. خفّض الدخل إلى ${Math.max(0, eq.maxIncomeRate).toFixed(1)}% أو أقل — حتى لو كانت التوزيعات تغطي المبلغ.`, `Income + zakat + inflation exceed the expected return. Lower income to ${Math.max(0, eq.maxIncomeRate).toFixed(1)}% or less — even if dividends happen to cover it.`)}</Notice>}
          </section>

          {/* 2. What this mix pays, and the portfolio size the target needs */}
          <section className="card space-y-4">
            <h2 className="section-title">{L('الدخل وحجم المحفظة المطلوب', 'Income and the portfolio size you need')}</h2>
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs text-brand-700">{L('محفظتك اليوم تعطيك شهريًا', 'Your portfolio today pays per month')}</p>
              <p className="text-3xl font-bold text-brand-900"><Money value={(view.investable * settings.income.rate) / 100 / 12} /></p>
              <p className="mt-1 text-xs text-brand-700">{L('سنويًا', 'Per year')} <Money value={(view.investable * settings.income.rate) / 100} /> · {L('زكاة تقديرية', 'est. zakat')} <Money value={(view.investable * zakatRate) / 100} /></p>
            </div>
            <Field label={L('الدخل الشهري الذي تريد الوصول إليه (بقيمة اليوم)', 'The monthly income you want to reach (today’s money)')}>
              <NumberInput value={settings.goal.monthlyIncome} onChange={(monthlyIncome) => setGoal({ monthlyIncome })} suffix={sar} />
            </Field>
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
              <h2 className="section-title">{L('التحويلة السنوية في يوم الزكاة', 'The yearly transfer on zakat day')}</h2>
              <p className="hint mt-1">
                {settings.zakat.hawlDate
                  ? <>{L('الموعد', 'Date')}: {dateLabel(settings.zakat.hawlDate, settings.locale)} · {zakat.daysToHawl !== null && zakat.daysToHawl > 0 ? L(`بعد ${zakat.daysToHawl} يوم`, `in ${zakat.daysToHawl} days`) : L('حان موعدها', 'due now')}</>
                  : <>{L('حدّد تاريخ الحول من تبويب «الزكاة» ليذكّرك التطبيق بها.', 'Set the due date under the Zakat tab so the app reminds you.')} <Link href="/plan/#zakat" className="font-semibold text-brand-700">{L('تحديد', 'Set')}</Link></>}
              </p>
            </div>
            <ol className="space-y-3 text-sm leading-relaxed">
              <li className="flex gap-3"><Num n={1} /><span>{L('قيمة المحفظة الاستثمارية', 'Investable portfolio value')} <Money value={view.investable} className="font-semibold" /> · {L('الزكاة المستحقة', 'zakat due')} <Money value={transfer.zakat} className="font-semibold" /></span></li>
              <li className="flex gap-3"><Num n={2} /><span>
                {L(`دخل السنة = ${settings.income.rate}% من متوسط القيمة`, `Year’s income = ${settings.income.rate}% of the average value`)} (<Money value={transfer.smoothed} />{transfer.smoothedMonths < 36 && <span className="text-ink-soft"> {L(`— متوسط ${transfer.smoothedMonths} شهر متاح، يكتمل إلى 36`, `— ${transfer.smoothedMonths} month(s) available, building to 36`)}</span>}) = <Money value={transfer.income} className="font-bold" />
                {transfer.rule === 'cut' && <span className="block text-warn-600">{L('خُفّض 10%: كان سيتجاوز الحد الأعلى من قيمة المحفظة الحالية.', 'Cut 10%: it would exceed the upper bound of today’s value.')}</span>}
                {transfer.rule === 'raise' && <span className="block text-gain">{L('رُفع 10%: كان أقل من الحد الأدنى من قيمة المحفظة الحالية.', 'Raised 10%: it was below the lower bound of today’s value.')}</span>}
                {transfer.rule === 'held' && <span className="block text-warn-600">{L('ثُبّت على دخل السنة الماضية: لا زيادة في سنة خسرت فيها المحفظة.', 'Held at last year’s income: no raise in a year the portfolio lost value.')}</span>}
              </span></li>
              <li className="flex gap-3"><Num n={3} /><span>{L('التحويلة = الدخل + الزكاة', 'Transfer = income + zakat')} = <Money value={transfer.transfer} className="font-bold" /> · {L('الموجود في حساب الدخل (توزيعات ورصيد)', 'already in the income account (dividends and balance)')} <Money value={transfer.inAccount} /> · {L('المطلوب تحويله', 'still to move')} <Money value={transfer.need} className="font-bold" /></span></li>
              <li className="flex gap-3"><Num n={4} /><span>
                {transfer.need <= 0 ? L('حساب الدخل يكفي — لا حاجة لبيع شيء.', 'The income account already covers it — nothing to sell.')
                  : transfer.marketDown ? <>{L(`السوق نازل ${transfer.drawdownPct.toFixed(0)}% عن قمته: لا تبع من النمو. خذ من الاحتياط`, `The market is ${transfer.drawdownPct.toFixed(0)}% off its peak: do not sell growth. Take from the reserve`)} <Money value={transfer.fromReserve} className="font-semibold" />{transfer.sells.length > 0 && L(' والباقي من:', ' and the rest from:')}</>
                  : L('بِع من الفئات الزائدة عن وزنها المستهدف — فتعيد التوازن بنفس الخطوة:', 'Sell from the classes above their target weight — rebalancing in the same step:')}
                {transfer.sells.length > 0 && (
                  <ul className="mt-1.5 divide-y divide-line rounded-xl border border-line">
                    {transfer.sells.map((l) => (
                      <li key={l.assetClass} className="flex items-center justify-between gap-3 px-3 py-2"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOR[l.assetClass] }} aria-hidden />{l.label}</span><Money value={l.amount} className="font-semibold" /></li>
                    ))}
                  </ul>
                )}
              </span></li>
              <li className="flex gap-3"><Num n={5} /><span>{L('ادفع الزكاة من المبلغ المحوَّل، ثم حوّل لنفسك كل شهر', 'Pay zakat out of the transferred amount, then pay yourself each month')} <Money value={transfer.monthly} className="font-bold" /></span></li>
            </ol>
            <button className="btn-primary w-full" disabled={view.investable <= 0} onClick={() => updateSettings({
              income: { ...settings.income, annualIncome: transfer.income, lastTransferDate: todayISO() },
              zakat: { ...settings.zakat, lastPaidDate: todayISO(), lastPaidAmount: transfer.zakat, hawlDate: nextHawlDate(settings.zakat.hawlDate || todayISO(), settings.zakat.calendar) },
            })}>{L('نفّذتُ التحويلة — ثبّت دخل السنة', 'I did the transfer — lock in this year’s income')}</button>
            <p className="hint">{L('بعد التنفيذ سجّل البيع والإيداع الفعليين من صفحة كل أصل لتبقى الأرصدة مطابقة. الموعد ينتقل تلقائيًا للحول القادم.', 'After doing it, record the actual sale and deposit on each asset’s page so balances stay in step. The date moves to next year automatically.')}</p>
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
                {guard.state === 'cut' && <Notice tone="warn" title={L(`الدخل تجاوز ${settings.income.upper}% من قيمة المحفظة`, `Income is above ${settings.income.upper}% of the portfolio`)} action={<button className="btn-soft" onClick={() => setIncome({ annualIncome: guard.suggested })}>{L(`خفّضه 10% إلى ${num(guard.suggested / 12, 0)} ر.س شهريًا`, `Cut 10% to SAR ${num(guard.suggested / 12, 0)} a month`)}</button>}>{L('المحفظة هبطت؛ التخفيض المؤقت يحمي رأس المال حتى تتعافى.', 'The portfolio fell; a temporary cut protects capital until it recovers.')}</Notice>}
                {guard.state === 'raise' && <Notice tone="good" title={L(`الدخل أقل من ${settings.income.lower}% من قيمة المحفظة`, `Income is below ${settings.income.lower}% of the portfolio`)} action={<button className="btn-soft" onClick={() => setIncome({ annualIncome: guard.suggested })}>{L(`ارفعه 10% إلى ${num(guard.suggested / 12, 0)} ر.س شهريًا`, `Raise 10% to SAR ${num(guard.suggested / 12, 0)} a month`)}</button>}>{L('المحفظة ارتفعت؛ تقدر تزيد دخلك دون مساس بالنمو.', 'The portfolio rose; you can lift your income without touching growth.')}</Notice>}
                {guard.state === 'ok' && <Notice tone="good" title={L('الدخل ضمن الحدود الآمنة', 'Income is within the safe bounds')} />}
              </>
            ) : <p className="hint">{L('يظهر راتبك هنا بعد تنفيذ أول تحويلة سنوية.', 'Your salary appears here after the first yearly transfer.')}</p>}
            <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink-soft">
              <li>• {L(`إذا صار الدخل أكثر من ${settings.income.upper}% من قيمة المحفظة الحالية: خفّضه 10%.`, `If income exceeds ${settings.income.upper}% of the current value: cut it 10%.`)}</li>
              <li>• {L(`إذا صار أقل من ${settings.income.lower}%: ارفعه 10%.`, `If it falls below ${settings.income.lower}%: raise it 10%.`)}</li>
              <li>• {L('لا زيادة في سنة كانت المحفظة فيها خاسرة.', 'No raise in a year the portfolio lost value.')}</li>
              <li>• {L(`إذا نزل السوق ${settings.income.drawdownTrigger}% أو أكثر عن قمته: عبّئ من الاحتياط ولا تبع من النمو.`, `If the market is ${settings.income.drawdownTrigger}% or more off its peak: refill from the reserve, do not sell growth.`)}</li>
            </ul>
          </section>

          {view.investable > 0 && (
            <section className="card space-y-3">
              <h2 className="section-title">{L('المحفظة مع الدخل عبر السنوات', 'The portfolio under this plan over the years')}</h2>
              <p className="text-sm text-ink-soft">{eq.sustainable ? L(`بنمو حقيقي ${eq.growth.toFixed(1)}% يكبر دخلك معها بنفس النسبة، بقيمة اليوم.`, `At ${eq.growth.toFixed(1)}% real growth your income grows with it at the same pace, in today’s money.`) : L('بهذه التركيبة تتآكل المحفظة ودخلك معها سنة بعد سنة.', 'With this mix the portfolio — and your income with it — shrinks year after year.')}</p>
              <LineChart points={growthSeries(view.investable, eq.growth)} label={L('قيمة المحفظة المتوقعة مع الدخل', 'Projected portfolio value under the income plan')} />
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
              <p className="text-xs text-brand-700">{L('الزكاة التقديرية المستحقة', 'Estimated zakat due')}</p>
              <p className="text-3xl font-bold text-brand-900"><Money value={zakat.due} /></p>
              <p className="mt-1 text-xs text-brand-700">{L('الوعاء الزكوي', 'Zakatable base')} <Money value={zakat.base} /> × <span className="num">{zakat.ratePct}%</span></p>
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
            <button className="btn-primary w-full" disabled={zakat.due <= 0} onClick={() => setZakat({ lastPaidDate: todayISO(), lastPaidAmount: zakat.due, hawlDate: nextHawlDate(settings.zakat.hawlDate || todayISO(), settings.zakat.calendar) })}>
              {L('أخرجتُ الزكاة — انقل الموعد للحول القادم', 'I paid it — move the date to next year')}
            </button>
            {settings.zakat.lastPaidDate && <p className="hint">{L('آخر إخراج مسجل', 'Last recorded payment')}: {dateLabel(settings.zakat.lastPaidDate, settings.locale)} — <Money value={settings.zakat.lastPaidAmount} /></p>}
          </section>

          <section className="card space-y-3">
            <h2 className="section-title">{L('معالجة كل أصل', 'Treatment per asset')}</h2>
            <p className="hint">{L('الافتراض قابل للتغيير لكل أصل حسب نيتك (استثمار طويل أم متاجرة) وحسب ما تأخذ به من فتوى.', 'The default can be changed per asset according to your intention (long-term or trading) and the ruling you follow.')}</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {zakat.rows.map((r) => (
                <li key={r.assetId} className="space-y-2 px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3"><span className="min-w-0 truncate text-sm font-semibold">{r.name}</span><Money value={r.due} className="shrink-0 text-sm font-bold" /></div>
                  <select className="input py-2 text-sm" aria-label={L(`معالجة زكاة ${r.name}`, `Zakat treatment for ${r.name}`)} value={r.mode} onChange={(e) => updateAsset(r.assetId, { zakatMode: e.target.value as ZakatMode })}>
                    {(Object.keys(ZAKAT_LABEL) as ZakatMode[]).map((m) => <option key={m} value={m}>{L(ZAKAT_LABEL[m].ar, ZAKAT_LABEL[m].en)}</option>)}
                  </select>
                  {r.mode === 'PERCENT' && (
                    <div className="flex items-center gap-2 text-sm"><span className="text-ink-soft">{L('نسبة الوعاء من القيمة', 'Zakatable share of value')}</span><div className="w-24"><NumberInput value={data.assets.find((a) => a.id === r.assetId)?.zakatPercent ?? 100} onChange={(zakatPercent) => updateAsset(r.assetId, { zakatPercent })} suffix="%" /></div></div>
                  )}
                </li>
              ))}
              {zakat.rows.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-soft">{L('لا أصول بعد.', 'No assets yet.')}</li>}
            </ul>
            <Disclaimer>
              {L('هذا تقدير حسابي لمساعدتك وليس فتوى. الافتراضات: النقد والودائع وصناديق المرابحة والصكوك والذهب على كامل القيمة؛ أسهم المضاربة على كامل القيمة السوقية؛ الأسهم والصناديق للاستثمار الطويل على حصتك من الأصول الزكوية للشركة وهي عادة أقل بكثير — الافتراض هنا تقدير تقريبي 30% من القيمة السوقية فعدّله حسب قوائم الشركة أو ما تأخذ به، وفيه رأي أن زكاة الشركة المدفوعة لهيئة الزكاة تكفي (وهو الافتراض للأسهم السعودية المدرجة) والمسألة خلافية؛ العقار المؤجَّر وصناديق الريت لا زكاة على أصلها بل على الإيجار أو التوزيعات إذا حال عليها الحول. راجع جهة شرعية تثق بها.',
                'An arithmetic estimate to help you, not a religious ruling. Defaults: cash, deposits, money-market funds, sukuk and gold on full value; trading shares on full market value; long-term shares and funds on your share of the company’s zakatable assets, usually far lower — the default here is a rough estimate of 30% of market value, so adjust it to the company’s statements or the view you follow — one view holds that the zakat the company pays to ZATCA suffices (the default for Saudi-listed shares), and scholars differ; rented property and REITs are not zakatable on the asset, only on rent or distributions held for a full year. Check with a Shariah authority you trust.')}
            </Disclaimer>
          </section>
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
    </>
  )
}
