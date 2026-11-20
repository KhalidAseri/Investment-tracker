'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Layers, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ASSET_CLASSES, CLASS_COLOR, CLASS_LABEL } from '@/lib/labels'
import { classTotals } from '@/lib/engine/exposure'
import { emergencyStatus, goalStatus, monthsToTarget, realMonthlyRate } from '@/lib/engine/plan'
import { fxRate } from '@/lib/engine/valuation'
import { portfolioFreshness } from '@/lib/engine/freshness'
import { journey as buildJourney, newMilestones } from '@/lib/engine/journey'
import { holdingsSeries, lastDays } from '@/lib/engine/performance'
import { fetchHistory, type PricePoint } from '@/lib/market-client'
import { nextActions, type NextAction } from '@/lib/actions'
import { num, pct } from '@/lib/format'
import { useActions } from '@/components/AppShell'
import Onboarding from '@/components/Onboarding'
import { JourneyLine, MilestoneSheet } from '@/components/Journey'
import { Donut, LineChart, Sparkline } from '@/components/charts'
import { Chips, CountUp, Delta, Empty, Money, Notice, Slider, Stagger, cx, haptic } from '@/components/ui'

type Range = '3M' | '1Y' | 'ALL'

export default function DashboardPage() {
  const { L, data, settings, view, quotes, updateSettings } = useStore()
  const { openWizard, openAsset, openQuickUpdate } = useActions()
  const [sel, setSel] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('ALL')
  const [hist, setHist] = useState<Record<string, PricePoint[]>>({})
  const [whatIf, setWhatIf] = useState<number | null>(null)
  const [milestone, setMilestone] = useState<string | null>(null)
  const Arrow = settings.locale === 'ar' ? ChevronLeft : ChevronRight

  const actions = useMemo(() => nextActions(data, view, quotes, L), [data, view, quotes, L])
  const goal = useMemo(() => goalStatus(view, settings), [view, settings])
  const ef = useMemo(() => emergencyStatus(view, settings), [view, settings])
  const route = useMemo(() => buildJourney(ef, goal), [ef, goal])
  const fresh = useMemo(() => portfolioFreshness(view.rows, quotes), [view.rows, quotes])
  const classes = useMemo(() => {
    const totals = classTotals(view.rows, data.profiles)
    return ASSET_CLASSES.map((c) => ({ key: c as string, label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), value: totals[c], pct: view.netWorth > 0 ? (totals[c] / view.netWorth) * 100 : 0, color: CLASS_COLOR[c] })).filter((c) => c.value > 0)
  }, [view, data.profiles, L])
  const history = useMemo(() => {
    const all = data.snapshots.map((s) => ({ x: s.month, y: s.netWorth }))
    return range === 'ALL' ? all : all.slice(-(range === '3M' ? 4 : 13))
  }, [data.snapshots, range])

  // The last 30 days of what is held now: priced assets at each day's close, the rest at today's value.
  const priced = useMemo(() => view.rows.filter((r) => r.asset.pricing === 'live' && r.asset.symbol && r.price !== null && !((r.asset.valueAnchor ?? 0) > 0)), [view.rows])
  const symbols = useMemo(() => Array.from(new Set(priced.map((r) => r.asset.symbol as string))).sort().join('|'), [priced])
  useEffect(() => {
    if (!symbols) { setHist({}); return }
    let gone = false
    Promise.all(symbols.split('|').map(async (s) => [s, await fetchHistory(s, '3m')] as const)).then((pairs) => { if (!gone) setHist(Object.fromEntries(pairs)) })
    return () => { gone = true }
  }, [symbols])
  const month = useMemo(() => {
    const pricedIds = new Set(priced.map((r) => r.asset.id))
    const holdings = view.rows.map((r) => {
      const a = r.asset
      const isPriced = pricedIds.has(a.id) && (hist[a.symbol as string]?.length ?? 0) >= 2
      const q = a.symbol ? quotes[a.symbol] : undefined
      return { symbol: isPriced ? a.symbol : null, unitsInBase: isPriced ? a.quantity * (a.priceFactor || 1) * fxRate(q?.currency || a.currency, settings.fx) : 0, value: r.value }
    })
    if (!holdings.some((h) => h.symbol)) return null
    const series = holdingsSeries(holdings, hist, lastDays(30))
    const first = series[0].close
    return { values: series.map((p) => p.close), changePct: first > 0 ? (series[series.length - 1].close / first - 1) * 100 : 0 }
  }, [view.rows, priced, hist, quotes, settings.fx])

  const movers = useMemo(() => view.rows
    .map((r) => ({ r, q: r.asset.symbol ? quotes[r.asset.symbol] : undefined }))
    .filter(({ r, q }) => r.asset.pricing === 'live' && q && q.origin !== 'claude' && r.dayChange !== 0)
    .sort((a, b) => Math.abs(b.q!.changePercent) - Math.abs(a.q!.changePercent)).slice(0, 3), [view.rows, quotes])

  // A station is announced once, when it is crossed. The first check only records where the user already is.
  const reachedKey = route.stations.filter((s) => s.reached).map((s) => s.id).join(',')
  useEffect(() => {
    if (data.assets.length === 0) return
    const reached = reachedKey ? reachedKey.split(',') : []
    const fresh = newMilestones(reached, settings.milestones)
    if (settings.milestones === undefined || fresh.length > 0 || reached.length !== settings.milestones.length) updateSettings({ milestones: reached })
    if (fresh.length > 0) { setMilestone(fresh[fresh.length - 1]); haptic(18) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the set of reached stations only
  }, [reachedKey, data.assets.length])

  if (!settings.onboarded && data.assets.length === 0) return <Onboarding />
  if (data.assets.length === 0) {
    return (
      <Empty icon={<Layers className="h-7 w-7" />} title={L('ابدأ بإضافة ما تملكه', 'Start by adding what you own')}
        body={L('أضف أصولك مرة واحدة، والتطبيق يريك توزيعك الحقيقي، أين التركّز، وأين تضع مساهمتك القادمة.', 'Add your assets once and the app shows your real allocation, where you are concentrated and where your next contribution should go.')}
        action={<button className="btn-primary" onClick={openWizard}><Plus className="h-4 w-4" />{L('إضافة أول أصل', 'Add first asset')}</button>} />
    )
  }

  const run = (a: NextAction) => (a.quick ? openQuickUpdate() : a.assetId ? openAsset(a.assetId, a.assetMode) : undefined)
  const isButton = (a: NextAction) => !!(a.quick || a.assetId)
  const [first, ...rest] = actions

  // Goal: what the monthly contribution does to the arrival year.
  const monthly = whatIf ?? settings.monthlyContribution
  const months = goal.target > 0 ? monthsToTarget(goal.current, monthly, goal.target, realMonthlyRate(settings)) : null
  const reachYear = months === null ? null : new Date().getFullYear() + Math.ceil(months / 12)
  const sliderMax = Math.max(20000, Math.ceil((settings.monthlyContribution * 3) / 5000) * 5000)

  return (
    <Stagger className="space-y-4">
      {/* Net worth: the one rich moment of the screen */}
      <section className="overflow-hidden rounded-3xl bg-hero text-hero-ink">
        <div className="p-5 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm opacity-70">{L('صافي قيمة المحفظة', 'Portfolio net worth')}</p>
            <button onClick={fresh.needsUser.length > 0 ? openQuickUpdate : undefined} disabled={fresh.needsUser.length === 0}
              className={cx('flex min-h-[32px] items-center gap-2 rounded-full bg-white/10 px-3 text-xs', fresh.needsUser.length > 0 && 'hover:bg-white/20')}
              aria-label={L(`حداثة البيانات ${fresh.pct.toFixed(0)}%`, `Data freshness ${fresh.pct.toFixed(0)}%`)}>
              <span className={cx('h-2 w-2 rounded-full', fresh.pct >= 99.5 ? 'bg-emerald-400' : fresh.pct >= 70 ? 'bg-amber-300' : 'bg-rose-400')} aria-hidden />
              {fresh.pct >= 99.5 ? L('كل الأرقام حديثة', 'All figures current') : <><span className="num">{pct(fresh.pct, 0)}</span> {L('حديث', 'current')}{fresh.needsUser.length > 0 && <> · {L('حدّث', 'Update')}</>}</>}
            </button>
          </div>
          <p className="mt-2 text-[2.2rem] font-semibold leading-none">
            {settings.hideAmounts ? <span className="num">••••</span> : <><CountUp value={view.netWorth} format={(n) => num(n, 0)} /> <span className="text-base font-normal opacity-70">{L('ر.س', 'SAR')}</span></>}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {view.hasLive && view.dayChange !== 0 && (
              <span><span className="opacity-70">{L('اليوم', 'Today')}</span> <span className="num font-medium">{settings.hideAmounts ? pct(view.dayChangePct, 2, true) : `${view.dayChange >= 0 ? '+' : ''}${num(view.dayChange, 0)} (${pct(view.dayChangePct, 2, true)})`}</span></span>
            )}
            {month && <span><span className="opacity-70">{L('30 يومًا', '30 days')}</span> <span className="num font-medium">{pct(month.changePct, 1, true)}</span></span>}
            {Math.abs(view.gain) >= 1 && <span><span className="opacity-70">{L('إجمالي الربح', 'Total gain')}</span> <span className="num font-medium">{pct(view.gainPct, 1, true)}</span></span>}
          </div>
        </div>
        {month && <div className="opacity-90"><Sparkline values={month.values} label={L('قيمة ما تملكه الآن خلال آخر 30 يومًا', 'What you hold now over the last 30 days')} /></div>}
        <div className={cx('grid grid-cols-2 gap-3 px-5 pb-5 text-sm', month ? 'pt-3' : 'border-t border-white/15 pt-3')}>
          <div><p className="text-xs opacity-70">{L('استثماري', 'Investable')}</p><Money value={view.investable} className="font-medium" /></div>
          <div><p className="text-xs opacity-70">{L('صندوق الطوارئ', 'Emergency fund')}</p><Money value={view.emergency} className="font-medium" /></div>
        </div>
      </section>

      {/* What to do now: the most important step, then the rest as a short list */}
      {first && (
        <section>
          <h2 className="section-title mb-3">{L('المطلوب منك الآن', 'What needs you now')}</h2>
          <Notice tone={first.tone} title={first.title} action={isButton(first)
            ? <button className="btn-soft min-h-[40px] px-3" onClick={() => run(first)}>{first.cta}<Arrow className="h-4 w-4" /></button>
            : <Link href={first.href} className="btn-soft min-h-[40px] px-3">{first.cta}<Arrow className="h-4 w-4" /></Link>}>{first.body}</Notice>
          {rest.length > 0 && (
            <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {rest.map((a) => {
                const inner = <><span className="flex min-w-0 items-center gap-3"><span className={cx('h-2 w-2 shrink-0 rounded-full', a.tone === 'warn' ? 'bg-[var(--c4)]' : a.tone === 'good' ? 'bg-gain' : 'bg-accent')} aria-hidden /><span className="truncate text-sm">{a.title}</span></span><Arrow className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden /></>
                const cls = 'flex min-h-[48px] w-full items-center justify-between gap-3 px-4 text-start hover:bg-surface'
                return <li key={a.id}>{isButton(a) ? <button className={cls} onClick={() => run(a)}>{inner}</button> : <Link href={a.href} className={cls}>{inner}</Link>}</li>
              })}
            </ul>
          )}
        </section>
      )}

      {/* The route to the goal */}
      {goal.target > 0 && (
        <section className="card space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">{L('رحلتك إلى الهدف', 'Your route to the goal')}</h2>
            <span className="num text-sm font-semibold">{pct(goal.pct, goal.pct < 10 ? 1 : 0)}</span>
          </div>
          <JourneyLine journey={route} />
          <div className="flex justify-between text-xs text-ink-soft"><Money value={goal.current} /><span>{L('من', 'of')} <Money value={goal.target} /></span></div>
          {goal.pct >= 100 ? (
            <p className="text-sm text-ink-soft">{L('بلغت هدفك. راجع خطة الدخل لتحويله إلى صرف منتظم.', 'You reached your goal. See the income plan to turn it into regular spending.')}</p>
          ) : (
            <>
              <Slider label={L('لو ساهمت شهريًا بـ', 'If you put in each month')} value={monthly} min={0} max={sliderMax} step={250} onChange={setWhatIf}
                display={`${num(monthly, 0)} ${L('ر.س', 'SAR')}`}
                hint={reachYear ? L(`تبلغ هدفك في ${reachYear}${!ef.ready && ef.target > 0 ? '، بعد إكمال صندوق الطوارئ' : ''}`, `You reach your goal in ${reachYear}${!ef.ready && ef.target > 0 ? ', once the emergency fund is complete' : ''}`) : L('بهذه المساهمة لا يُبلغ الهدف خلال 80 سنة', 'At this contribution the goal is not reached within 80 years')} />
              <div className="flex items-center justify-between gap-3">
                {whatIf !== null && whatIf !== settings.monthlyContribution
                  ? <button className="btn-soft min-h-[40px] px-4" onClick={() => { updateSettings({ monthlyContribution: whatIf }); setWhatIf(null); haptic() }}>{L('اعتمدها مساهمتي الشهرية', 'Make it my monthly contribution')}</button>
                  : <span className="text-xs text-ink-soft">{L('حرّك المنزلق لترى أثر المساهمة', 'Move the slider to see what the contribution does')}</span>}
                <Link href="/plan/#goal" className="flex min-h-[40px] shrink-0 items-center gap-1 text-sm font-medium text-link">{L('الهدف', 'Goal')}<Arrow className="h-4 w-4" /></Link>
              </div>
            </>
          )}
        </section>
      )}

      {/* Today's movers */}
      {movers.length >= 2 && (
        <section className="card">
          <h2 className="section-title">{L('حركة اليوم', 'Today’s movers')}</h2>
          <ul className="mt-2 divide-y divide-line">
            {movers.map(({ r, q }) => (
              <li key={r.asset.id}>
                <button className="flex min-h-[48px] w-full items-center justify-between gap-3 text-start" onClick={() => openAsset(r.asset.id)}>
                  <bdi className="min-w-0 truncate text-sm">{r.asset.name}</bdi>
                  <span className="flex shrink-0 items-baseline gap-3"><Delta value={r.dayChange} className="text-xs" /><Delta percent={q!.changePercent} className="w-16 justify-end text-sm" /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Allocation */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{L('توزيع المحفظة', 'Allocation')}</h2>
          <Link href="/analysis/" className="flex min-h-[36px] items-center gap-1 text-sm font-medium text-link">{L('التحليل الكامل', 'Full analysis')}<Arrow className="h-4 w-4" /></Link>
        </div>
        <div className="mt-2"><Donut slices={classes} selected={sel} onSelect={setSel} total={view.netWorth} centerLabel={L('الإجمالي', 'Total')} /></div>
        <ul className="mt-3 space-y-1">
          {classes.map((c) => (
            <li key={c.key}>
              <button className={cx('flex min-h-[40px] w-full items-center justify-between gap-3 rounded-xl px-2 text-sm transition-colors', sel === c.key ? 'bg-tint' : 'hover:bg-surface')} aria-pressed={sel === c.key} onClick={() => setSel(sel === c.key ? null : c.key)}>
                <span className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden /><span className="truncate">{c.label}</span></span>
                <span className="flex shrink-0 items-baseline gap-2"><Money value={c.value} className="text-xs text-ink-soft" /><span className="num w-12 text-end font-medium">{pct(c.pct)}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* Net worth over time */}
      <section className="card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">{L('مسار صافي القيمة', 'Net worth over time')}</h2>
          {data.snapshots.length > 4 && <Chips wrap value={range} onChange={setRange} options={[{ value: '3M', label: L('3 أشهر', '3M') }, { value: '1Y', label: L('سنة', '1Y') }, { value: 'ALL', label: L('الكل', 'All') }]} />}
        </div>
        {history.length >= 2 ? (
          <div className="mt-2"><LineChart points={history} label={L('صافي القيمة شهريًا', 'Monthly net worth')} /></div>
        ) : (
          <p className="hint mt-2">{L('تُحفظ لقطة لصافي القيمة كل شهر تلقائيًا. يظهر المنحنى هنا من الشهر القادم.', 'A net-worth snapshot is saved automatically each month. The curve appears here from next month.')}</p>
        )}
        {Math.abs(view.gain) >= 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
            <span className="text-ink-soft">{L('إجمالي الربح / الخسارة', 'Total gain / loss')}</span>
            <Delta value={view.gain} percent={view.gainPct} />
          </div>
        )}
      </section>

      <MilestoneSheet id={milestone} journey={route} onClose={() => setMilestone(null)} />
    </Stagger>
  )
}
