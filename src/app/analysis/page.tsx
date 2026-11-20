'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChartPie } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { AssetClass } from '@/lib/types'
import { CLASS_COLOR } from '@/lib/labels'
import { breakdown, insights, type Axis } from '@/lib/engine/exposure'
import { DRIFT_THRESHOLD, allocateContribution, driftRows } from '@/lib/engine/guidance'
import { pct } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import TargetsSheet from '@/components/TargetsSheet'
import { BarList, Donut, TargetBar, Treemap, WorldMap, countryName } from '@/components/charts'
import { Chips, Empty, Field, Money, Notice, NumberInput, Stagger, cx } from '@/components/ui'

type View = Axis | 'positions'
// Sectors and other non-class splits take colours by rank from the same validated palette.
const RANK = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)']

export default function AnalysisPage() {
  const { L, data, settings, view } = useStore()
  const [scope, setScope] = useState<'invest' | 'all'>('invest')
  const [axis, setAxis] = useState<View>('class')
  const [sel, setSel] = useState<string | null>(null)
  const [editTargets, setEditTargets] = useState(false)
  const [amount, setAmount] = useState(settings.monthlyContribution)
  const [hash] = useHash('')
  const profiles = data.profiles

  useEffect(() => {
    if (hash === 'targets' || hash === 'next') document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])
  useEffect(() => { setSel(null) }, [axis, scope])

  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const rows = scope === 'invest' ? investRows : view.rows
  const total = rows.reduce((s, r) => s + r.value, 0)
  const name = useMemo(() => (code: string) => countryName(code, settings.locale), [settings.locale])
  const bd = useMemo(() => breakdown(rows, axis === 'positions' ? 'class' : axis, settings, L, { profiles, countryName: name }), [rows, axis, settings, L, profiles, name])
  const drift = useMemo(() => driftRows(investRows, settings, L, profiles), [investRows, settings, L, profiles])
  const plan = useMemo(() => allocateContribution(amount, investRows, settings, L, profiles), [amount, investRows, settings, L, profiles])
  const risks = useMemo(() => insights(investRows, settings, L, Date.now(), profiles), [investRows, settings, L, profiles])

  if (data.assets.length === 0) {
    return <Empty icon={<ChartPie className="h-7 w-7" />} title={L('لا شيء لتحليله بعد', 'Nothing to analyse yet')} body={L('أضف أصولك من زر + ليظهر توزيعك على كل المحاور.', 'Add your assets from the + button to see your allocation on every axis.')} />
  }

  const VIEWS: { value: View; label: string }[] = [
    { value: 'class', label: L('فئة الأصل', 'Asset class') },
    { value: 'country', label: L('الدول', 'Countries') },
    { value: 'region', label: L('المناطق', 'Regions') },
    { value: 'sector', label: L('القطاعات', 'Sectors') },
    { value: 'positions', label: L('المراكز', 'Positions') },
    { value: 'currency', label: L('العملة', 'Currency') },
    { value: 'platform', label: L('الجهة', 'Provider') },
    { value: 'liquidity', label: L('السيولة', 'Liquidity') },
  ]
  const positions = rows.filter((r) => r.value > 0).map((r) => ({ key: r.asset.id, label: r.asset.name, value: r.value, pct: total > 0 ? (r.value / total) * 100 : 0, color: CLASS_COLOR[r.asset.assetClass], parts: [] as typeof bd.slices[number]['parts'] }))
  const slices = axis === 'positions' ? positions : bd.slices.map((s, i) => ({ ...s, color: axis === 'class' ? CLASS_COLOR[s.key as AssetClass] : axis === 'sector' ? RANK[Math.min(i, RANK.length - 1)] : undefined }))
  const picked = slices.find((s) => s.key === sel) ?? null
  const weights = axis === 'country' ? Object.fromEntries(bd.slices.filter((s) => !s.key.startsWith('~') && s.key !== 'OTHER').map((s) => [s.key, s.pct])) : {}
  const levelText = { concentrated: L('مركّز', 'Concentrated'), moderate: L('متوسط التنويع', 'Moderately diversified'), diversified: L('متنوع', 'Diversified') }[bd.level]
  const maxBar = Math.max(...drift.map((d) => Math.max(d.actualPct, d.targetPct)), 1)
  const usesProfiles = axis === 'class' || axis === 'country' || axis === 'region' || axis === 'sector'

  return (
    <Stagger className="space-y-4">
      <Chips value={scope} onChange={setScope} options={[{ value: 'invest', label: L('المحفظة الاستثمارية', 'Investable portfolio') }, { value: 'all', label: L('كل الأصول مع الطوارئ', 'Everything incl. emergency') }]} />

      {/* Exposure: pick an axis, tap a part to see what it is made of */}
      <section className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="section-title">{L('أين تتوزع أموالك؟', 'Where is your money?')}</h2>
          <Money value={total} className="text-sm font-semibold text-ink-soft" />
        </div>
        <Chips value={axis} onChange={setAxis} options={VIEWS} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={axis} className="space-y-4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {axis === 'class' && <Donut slices={slices.map((s) => ({ ...s, color: s.color ?? RANK[0] }))} selected={sel} onSelect={setSel} total={total} centerLabel={L('الإجمالي', 'Total')} />}
            {axis === 'country' && <WorldMap weights={weights} selected={sel} onSelect={setSel} />}
            {(axis === 'sector' || axis === 'positions') && <Treemap items={slices} selected={sel} onSelect={setSel} />}
            <BarList items={slices} selected={sel} onSelect={(k) => setSel(sel === k ? null : k)} />
          </motion.div>
        </AnimatePresence>

        {/* Drill-down: the assets behind the selected part */}
        <AnimatePresence initial={false}>
          {picked && picked.parts.length > 0 && (
            <motion.div key={picked.key} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="rounded-2xl bg-surface p-4">
                <p className="mb-2 text-sm font-semibold">{L(`ما الذي يكوّن «${picked.label}»؟`, `What makes up “${picked.label}”?`)}</p>
                <ul className="space-y-1.5">
                  {picked.parts.map((p) => (
                    <li key={p.assetId} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{p.name}</span>
                      <span className="flex shrink-0 items-baseline gap-2"><Money value={p.value} className="text-xs text-ink-soft" /><span className="num w-12 text-end font-medium">{pct((p.value / picked.value) * 100, 0)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {axis !== 'positions' && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-3 text-sm">
            <span className={cx('font-semibold', bd.level === 'concentrated' ? 'text-warn-600' : bd.level === 'diversified' ? 'text-gain' : 'text-ink')}>{levelText}</span>
            <span className="text-ink-soft">{L('أكبر حصة', 'Largest share')} <span className="num font-semibold text-ink">{pct(bd.topPct, 0)}</span></span>
            <span className="text-ink-soft">{L('عدد فعّال', 'Effective count')} <span className="num font-semibold text-ink">{bd.effectiveN.toFixed(1)}</span></span>
          </div>
        )}
        {usesProfiles && (
          <p className="hint">
            {bd.profiledPct >= 99.5 ? L('كل هذا التحليل مبني على توزيعات فعلية محلَّلة لكل أصل.', 'All of this rests on researched look-through data for each asset.')
              : L(`${bd.profiledPct.toFixed(0)}% من هذا التحليل مبني على توزيعات محلَّلة لكل أصل؛ الباقي تصنيف مبدئي إلى أن يُحلَّل.`, `${bd.profiledPct.toFixed(0)}% of this rests on researched look-through data; the rest uses a preliminary classification until analysed.`)}{' '}
            <Link href="/more/#profiles" className="font-semibold text-link">{L('توزيعات الأصول', 'Asset breakdowns')}</Link>
          </p>
        )}
        {axis === 'country' && bd.slices.some((s) => s.key.startsWith('~')) && <p className="hint">{L('بعض الأصول غير المحلَّلة معروفة بمنطقتها فقط، فتظهر في القائمة دون الخريطة.', 'Some un-analysed assets are known only by region, so they appear in the list but not on the map.')}</p>}
        {axis === 'currency' && <p className="hint">{L('الريال مربوط بالدولار، فالتعرض للعملتين متقارب عمليًا ما دام الربط قائمًا.', 'The riyal is pegged to the dollar, so exposure to the two is effectively similar while the peg holds.')}</p>}
      </section>

      {/* Risk findings */}
      <section className="space-y-3">
        <h2 className="section-title">{L('المخاطر والتركّزات', 'Risks & concentrations')}</h2>
        {risks.map((r) => <Notice key={r.id} tone={r.severity} title={r.title}>{r.body}</Notice>)}
      </section>

      {/* Target vs actual */}
      <section id="targets" className="card scroll-mt-20 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{L('الفعلي مقابل المستهدف', 'Actual vs target')}</h2>
          <button className="btn-soft min-h-[36px] px-3" onClick={() => setEditTargets(true)}>{settings.targetsSet ? L('تعديل', 'Edit') : L('تحديد', 'Set')}</button>
        </div>
        {!settings.targetsSet && <Notice tone="info" title={L('لم تحدد توزيعك المستهدف بعد', 'You have not set a target allocation yet')}>{L('المعروض قالب «متوازن» افتراضي. حدّد توزيعك ليصبح التوجيه خاصًا بك.', 'Showing the default Balanced template. Set your own so the guidance is yours.')}</Notice>}
        <ul className="space-y-3.5">
          {drift.map((d) => (
            <li key={d.assetClass}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{d.label}</span>
                <span className="num text-xs text-ink-soft">
                  <span className="font-semibold text-ink">{pct(d.actualPct, 0)}</span> / {pct(d.targetPct, 0)}
                  {Math.abs(d.drift) > DRIFT_THRESHOLD && <span className="ms-1.5 rounded-full bg-warn-tint px-1.5 py-0.5 font-semibold text-warn-600">{d.drift > 0 ? '+' : ''}{d.drift.toFixed(0)}</span>}
                </span>
              </div>
              <TargetBar actual={d.actualPct} target={d.targetPct} color={CLASS_COLOR[d.assetClass]} max={maxBar} />
            </li>
          ))}
        </ul>
        <p className="hint">{L('الشريط = حصتك الفعلية، العلامة = المستهدف. يظهر الفرق بالنقاط عند تجاوزه 5.', 'Bar = your actual share, marker = target. The gap in points shows once it exceeds 5.')}</p>
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
            {[...plan].sort((a, b) => b.amount - a.amount).map((l) => (
              <li key={l.assetClass} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold"><span className="h-3 w-3 rounded-sm" style={{ background: CLASS_COLOR[l.assetClass] }} aria-hidden />{l.label}</span>
                  <Money value={l.amount} className="text-sm font-semibold" />
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

      <TargetsSheet open={editTargets} onClose={() => setEditTargets(false)} />
    </Stagger>
  )
}
