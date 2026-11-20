'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ASSET_CLASSES, CLASS_COLOR, CLASS_LABEL } from '@/lib/labels'
import { classTotals } from '@/lib/engine/exposure'
import { goalStatus } from '@/lib/engine/plan'
import { nextActions } from '@/lib/actions'
import { num, pct } from '@/lib/format'
import { useActions } from '@/components/AppShell'
import Onboarding from '@/components/Onboarding'
import { Donut, LineChart, Meter } from '@/components/charts'
import { Chips, CountUp, Delta, Empty, Money, Notice, Stagger, cx } from '@/components/ui'

type Range = '3M' | '1Y' | 'ALL'

export default function DashboardPage() {
  const { L, data, settings, view, quotes } = useStore()
  const { openWizard, openAsset } = useActions()
  const [sel, setSel] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('ALL')
  const [card, setCard] = useState(0)
  const rail = useRef<HTMLDivElement>(null)
  const Arrow = settings.locale === 'ar' ? ChevronLeft : ChevronRight

  const actions = useMemo(() => nextActions(data, view, quotes, L), [data, view, quotes, L])
  const goal = useMemo(() => goalStatus(view, settings), [view, settings])
  const classes = useMemo(() => {
    const totals = classTotals(view.rows, data.profiles)
    return ASSET_CLASSES.map((c) => ({ key: c as string, label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), value: totals[c], pct: view.netWorth > 0 ? (totals[c] / view.netWorth) * 100 : 0, color: CLASS_COLOR[c] })).filter((c) => c.value > 0)
  }, [view, data.profiles, L])
  const history = useMemo(() => {
    const all = data.snapshots.map((s) => ({ x: s.month, y: s.netWorth }))
    return range === 'ALL' ? all : all.slice(-(range === '3M' ? 4 : 13))
  }, [data.snapshots, range])

  if (!settings.onboarded && data.assets.length === 0) return <Onboarding />
  if (data.assets.length === 0) {
    return (
      <Empty icon={<Sparkles className="h-7 w-7" />} title={L('ابدأ بإضافة ما تملكه', 'Start by adding what you own')}
        body={L('أضف أصولك مرة واحدة، والتطبيق يريك توزيعك الحقيقي، أين التركّز، وأين تضع مساهمتك القادمة.', 'Add your assets once and the app shows your real allocation, where you are concentrated and where your next contribution should go.')}
        action={<button className="btn-primary" onClick={openWizard}><Plus className="h-4 w-4" />{L('إضافة أول أصل', 'Add first asset')}</button>} />
    )
  }

  const onRail = () => {
    const el = rail.current
    if (el) setCard(Math.round(Math.abs(el.scrollLeft) / (el.scrollWidth / actions.length)))
  }

  return (
    <Stagger className="space-y-4">
      {/* Net worth */}
      <section className="rounded-3xl bg-hero p-5 text-hero-ink shadow-card">
        <p className="text-sm opacity-70">{L('صافي قيمة المحفظة', 'Portfolio net worth')}</p>
        <p className="mt-1 text-[2.2rem] font-bold leading-none">
          {settings.hideAmounts ? <span className="num">••••</span> : <><CountUp value={view.netWorth} format={(n) => num(n, 0)} /> <span className="text-base font-medium opacity-70">{L('ر.س', 'SAR')}</span></>}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {view.hasLive && (
            <span className="opacity-90"><span className="opacity-75">{L('اليوم', 'Today')}</span> <span className="num font-semibold">{settings.hideAmounts ? pct(view.dayChangePct, 2, true) : `${view.dayChange >= 0 ? '+' : ''}${num(view.dayChange, 0)} (${pct(view.dayChangePct, 2, true)})`}</span></span>
          )}
          <span className="opacity-90"><span className="opacity-75">{L('إجمالي الربح', 'Total gain')}</span> <span className="num font-semibold">{pct(view.gainPct, 1, true)}</span></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-sm">
          <div><p className="text-xs opacity-70">{L('استثماري', 'Investable')}</p><Money value={view.investable} className="font-semibold" /></div>
          <div><p className="text-xs opacity-70">{L('صندوق الطوارئ', 'Emergency fund')}</p><Money value={view.emergency} className="font-semibold" /></div>
        </div>
      </section>

      {/* What to do now: one card at a time */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="section-title">{L('المطلوب منك الآن', 'What needs you now')}</h2>
          {actions.length > 1 && <span className="num text-xs text-ink-soft">{card + 1} / {actions.length}</span>}
        </div>
        <div ref={rail} onScroll={onRail} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
          {actions.map((a) => (
            <div key={a.id} className={cx('shrink-0 snap-center', actions.length > 1 ? 'w-[88%]' : 'w-full')}>
              <Notice tone={a.tone} title={a.title} action={a.assetId
                ? <button className="btn-soft min-h-[40px] px-3" onClick={() => openAsset(a.assetId!, a.assetMode)}>{a.cta}<Arrow className="h-4 w-4" /></button>
                : <Link href={a.href} className="btn-soft min-h-[40px] px-3">{a.cta}<Arrow className="h-4 w-4" /></Link>}>{a.body}</Notice>
            </div>
          ))}
        </div>
        {actions.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {actions.map((a, i) => <span key={a.id} className={cx('h-1.5 rounded-full transition-all duration-300', i === card ? 'w-5 bg-accent' : 'w-1.5 bg-line')} />)}
          </div>
        )}
      </section>

      {/* Goal */}
      {goal.target > 0 && (
        <Link href="/plan/#goal" className="card block">
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">{L('هدفك', 'Your goal')}</h2>
            <span className="num text-sm font-bold">{pct(goal.pct, 0)}</span>
          </div>
          <div className="mt-3"><Meter value={goal.pct} label={L('نسبة بلوغ الهدف', 'Goal progress')} tone={goal.pct >= 100 ? 'good' : 'brand'} /></div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft"><Money value={goal.current} /><span>{L('من', 'of')} <Money value={goal.target} /></span></div>
          <p className="mt-2 text-sm text-ink-soft">
            {goal.pct >= 100 ? L('بلغت هدفك. راجع خطة الدخل لتحويله إلى صرف منتظم.', 'You reached your goal. See the income plan to turn it into regular spending.')
              : goal.reachYear ? L(`بوتيرتك الحالية تبلغه في ${goal.reachYear}.`, `At your current pace you reach it in ${goal.reachYear}.`)
              : L('بالوتيرة الحالية لا يُبلغ الهدف — ارفع المساهمة الشهرية.', 'At the current pace the goal is not reached — raise your monthly contribution.')}
          </p>
        </Link>
      )}

      {/* Allocation */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{L('توزيع المحفظة', 'Allocation')}</h2>
          <Link href="/analysis/" className="flex min-h-[36px] items-center gap-1 text-sm font-semibold text-link">{L('التحليل الكامل', 'Full analysis')}<Arrow className="h-4 w-4" /></Link>
        </div>
        <div className="mt-2"><Donut slices={classes} selected={sel} onSelect={setSel} total={view.netWorth} centerLabel={L('الإجمالي', 'Total')} /></div>
        <ul className="mt-3 space-y-1">
          {classes.map((c) => (
            <li key={c.key}>
              <button className={cx('flex min-h-[40px] w-full items-center justify-between gap-3 rounded-xl px-2 text-sm transition-colors', sel === c.key ? 'bg-tint' : 'hover:bg-surface')} aria-pressed={sel === c.key} onClick={() => setSel(sel === c.key ? null : c.key)}>
                <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden /><span className="truncate">{c.label}</span></span>
                <span className="flex shrink-0 items-baseline gap-2"><Money value={c.value} className="text-xs text-ink-soft" /><span className="num w-12 text-end font-semibold">{pct(c.pct)}</span></span>
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
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink-soft">{L('إجمالي الربح / الخسارة', 'Total gain / loss')}</span>
          <Delta value={view.gain} percent={view.gainPct} />
        </div>
      </section>
    </Stagger>
  )
}
