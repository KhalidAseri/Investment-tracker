'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChartPie } from 'lucide-react'
import { useStore } from '@/lib/store'
import { CLASS_COLOR } from '@/lib/labels'
import { breakdown, insights, type Axis } from '@/lib/engine/exposure'
import { DRIFT_THRESHOLD, allocateContribution, driftRows } from '@/lib/engine/guidance'
import { pct } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import TargetsSheet from '@/components/TargetsSheet'
import { BarList, TargetBar } from '@/components/charts'
import { Chips, Empty, Field, Money, Notice, NumberInput, cx } from '@/components/ui'

export default function AnalysisPage() {
  const { L, data, settings, view } = useStore()
  const [scope, setScope] = useState<'invest' | 'all'>('invest')
  const [axis, setAxis] = useState<Axis>('class')
  const [lookThrough, setLookThrough] = useState(true)
  const [editTargets, setEditTargets] = useState(false)
  const [amount, setAmount] = useState(settings.monthlyContribution)
  const [hash] = useHash('')

  useEffect(() => {
    if (hash === 'targets' || hash === 'next') document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const rows = scope === 'invest' ? investRows : view.rows
  const bd = useMemo(() => breakdown(rows, axis, settings, L, lookThrough), [rows, axis, settings, L, lookThrough])
  const drift = useMemo(() => driftRows(investRows, settings, L), [investRows, settings, L])
  const plan = useMemo(() => allocateContribution(amount, investRows, settings, L), [amount, investRows, settings, L])
  const risks = useMemo(() => insights(investRows, settings, L), [investRows, settings, L])
  const total = rows.reduce((s, r) => s + r.value, 0)
  const top = investRows.slice(0, 5)
  const investTotal = investRows.reduce((s, r) => s + r.value, 0)

  if (data.assets.length === 0) {
    return <Empty icon={<ChartPie className="h-7 w-7" />} title={L('لا شيء لتحليله بعد', 'Nothing to analyse yet')} body={L('أضف أصولك من تبويب «الأصول» ليظهر توزيعك على كل المحاور.', 'Add your assets under Assets to see your allocation on every axis.')} />
  }

  const AXES: { value: Axis; label: string }[] = [
    { value: 'class', label: L('فئة الأصل', 'Asset class') },
    { value: 'region', label: L('الجغرافيا', 'Geography') },
    { value: 'sector', label: L('القطاع', 'Sector') },
    { value: 'currency', label: L('العملة', 'Currency') },
    { value: 'platform', label: L('الجهة', 'Provider') },
    { value: 'liquidity', label: L('السيولة', 'Liquidity') },
  ]
  const levelText = { concentrated: L('مركّز', 'Concentrated'), moderate: L('متوسط التنويع', 'Moderately diversified'), diversified: L('متنوع', 'Diversified') }[bd.level]
  const maxBar = Math.max(...drift.map((d) => Math.max(d.actualPct, d.targetPct)), 1)
  const hasGlobal = rows.some((r) => r.asset.region === 'GLOBAL')

  return (
    <>
      <Chips value={scope} onChange={setScope} options={[{ value: 'invest', label: L('المحفظة الاستثمارية', 'Investable portfolio') }, { value: 'all', label: L('كل الأصول مع الطوارئ', 'Everything incl. emergency') }]} />

      {/* Exposure by axis */}
      <section className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">{L('أين تتوزع أموالك؟', 'Where is your money?')}</h2>
          <Money value={total} className="text-sm font-semibold text-ink-soft" />
        </div>
        <Chips value={axis} onChange={setAxis} options={AXES} />
        <BarList items={bd.slices.map((s) => ({ ...s, color: axis === 'class' ? CLASS_COLOR[s.key as keyof typeof CLASS_COLOR] : undefined }))} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
          <span className={cx('font-semibold', bd.level === 'concentrated' ? 'text-warn-600' : bd.level === 'diversified' ? 'text-gain' : 'text-ink')}>{levelText}</span>
          <span className="text-ink-soft">{L('أكبر حصة', 'Largest share')} <span className="num font-semibold text-ink">{pct(bd.topPct, 0)}</span></span>
          <span className="text-ink-soft">{L('عدد فعّال', 'Effective count')} <span className="num font-semibold text-ink">{bd.effectiveN.toFixed(1)}</span></span>
        </div>
        {axis === 'region' && hasGlobal && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={lookThrough} onChange={(e) => setLookThrough(e.target.checked)} />
            <span>{L('فكّك الصناديق العالمية إلى مناطقها', 'Look through global funds')}<span className="hint block">{L(`تقريبي: أمريكا ${settings.lookThrough.US}% · متقدمة ${settings.lookThrough.DEV}% · ناشئة ${settings.lookThrough.EM}% (يُعدَّل من الإعدادات).`, `Approximate: US ${settings.lookThrough.US}% · developed ${settings.lookThrough.DEV}% · emerging ${settings.lookThrough.EM}% (editable in Settings).`)}</span></span>
          </label>
        )}
        {axis === 'currency' && <p className="hint">{L('الريال مربوط بالدولار، فالتعرض للعملتين متقارب عمليًا ما دام الربط قائمًا.', 'The riyal is pegged to the dollar, so exposure to the two is effectively similar while the peg holds.')}</p>}
        {axis === 'region' && <p className="hint">{L('الذهب والعملات الرقمية لا ترتبط بدولة، فتظهر في بند مستقل.', 'Gold and crypto are not tied to a country, so they appear separately.')}</p>}
      </section>

      {/* Risk findings */}
      <section className="space-y-2.5">
        <h2 className="section-title">{L('المخاطر والتركّزات', 'Risks & concentrations')}</h2>
        {risks.map((r) => <Notice key={r.id} tone={r.severity} title={r.title}>{r.body}</Notice>)}
      </section>

      {/* Target vs actual */}
      <section id="targets" className="card scroll-mt-20 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{L('الفعلي مقابل المستهدف', 'Actual vs target')}</h2>
          <button className="text-sm font-semibold text-brand-700" onClick={() => setEditTargets(true)}>{settings.targetsSet ? L('تعديل', 'Edit') : L('تحديد', 'Set')}</button>
        </div>
        {!settings.targetsSet && <Notice tone="info" title={L('لم تحدد توزيعك المستهدف بعد', 'You have not set a target allocation yet')}>{L('المعروض قالب «متوازن» افتراضي. حدّد توزيعك ليصبح التوجيه خاصًا بك.', 'Showing the default Balanced template. Set your own so the guidance is yours.')}</Notice>}
        <ul className="space-y-3.5">
          {drift.map((d) => (
            <li key={d.assetClass}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="num text-xs text-ink-soft">
                  <span className="font-semibold text-ink">{pct(d.actualPct, 0)}</span> / {pct(d.targetPct, 0)}
                  {Math.abs(d.drift) > DRIFT_THRESHOLD && <span className="ms-1.5 rounded-full bg-warn-50 px-1.5 py-0.5 font-semibold text-warn-600">{d.drift > 0 ? '+' : ''}{d.drift.toFixed(0)}</span>}
                </span>
              </div>
              <TargetBar actual={d.actualPct} target={d.targetPct} color={CLASS_COLOR[d.assetClass]} max={maxBar} />
            </li>
          ))}
        </ul>
        <p className="hint">{L('الشريط = حصتك الفعلية، العلامة السوداء = المستهدف. يظهر الفرق بالنقاط عند تجاوزه 5.', 'Bar = your actual share, black marker = target. The gap in points shows once it exceeds 5.')}</p>
      </section>

      {/* Next contribution */}
      <section id="next" className="card scroll-mt-20 space-y-4">
        <div>
          <h2 className="section-title">{L('وين أحط المبلغ القادم؟', 'Where should the next amount go?')}</h2>
          <p className="hint mt-1">{L('يوزّع المبلغ على الفئات الأقل من مستهدفها ليقرّبك من توزيعك بدون بيع أي شيء.', 'Splits the amount across the classes below target, moving you toward your allocation without selling anything.')}</p>
        </div>
        <Field label={L('المبلغ الذي ستستثمره', 'Amount you will invest')}><NumberInput value={amount} onChange={setAmount} suffix={L('ر.س', 'SAR')} /></Field>
        {plan.length > 0 ? (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {plan.sort((a, b) => b.amount - a.amount).map((l) => (
              <li key={l.assetClass} className="px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOR[l.assetClass] }} aria-hidden />{l.label}</span>
                  <Money value={l.amount} className="text-sm font-bold" />
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  {L('تصبح حصتها', 'Share becomes')} <span className="num font-medium text-ink">{pct(l.afterPct, 0)}</span> {L('من مستهدف', 'of target')} <span className="num">{pct(l.targetPct, 0)}</span>
                  {l.suggestions.length > 0 ? <> · {L('في', 'via')} {l.suggestions.join('، ')}</> : <> · {L('لا تملك أصلًا في هذه الفئة — أضف واحدًا', 'you hold nothing in this class — add one')}</>}
                </p>
              </li>
            ))}
          </ul>
        ) : <p className="hint">{L('أدخل مبلغًا لترى التوزيع المقترح.', 'Enter an amount to see the suggested split.')}</p>}
      </section>

      {/* Top holdings */}
      <section className="card">
        <h2 className="section-title mb-3">{L('أكبر المراكز', 'Largest positions')}</h2>
        <BarList items={top.map((r) => ({ key: r.asset.id, label: r.asset.name, value: r.value, pct: investTotal > 0 ? (r.value / investTotal) * 100 : 0, color: CLASS_COLOR[r.asset.assetClass] }))} />
      </section>

      <TargetsSheet open={editTargets} onClose={() => setEditTargets(false)} />
    </>
  )
}
