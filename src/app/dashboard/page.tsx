'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/store'
import { ASSET_CLASSES, CLASS_COLOR, CLASS_LABEL } from '@/lib/labels'
import { classTotals } from '@/lib/engine/exposure'
import { goalStatus } from '@/lib/engine/plan'
import { nextActions } from '@/lib/actions'
import { pct } from '@/lib/format'
import AssetWizard from '@/components/AssetWizard'
import Onboarding from '@/components/Onboarding'
import { LineChart, Meter, SegBar } from '@/components/charts'
import { Delta, Empty, Money, Notice } from '@/components/ui'

export default function DashboardPage() {
  const { L, data, settings, view, quotes } = useStore()
  const [adding, setAdding] = useState(false)
  const Arrow = settings.locale === 'ar' ? ChevronLeft : ChevronRight

  const actions = useMemo(() => nextActions(data, view, quotes, L), [data, view, quotes, L])
  const goal = useMemo(() => goalStatus(view, settings), [view, settings])
  const classes = useMemo(() => {
    const totals = classTotals(view.rows)
    return ASSET_CLASSES.map((c) => ({ key: c, label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), value: totals[c], pct: view.netWorth > 0 ? (totals[c] / view.netWorth) * 100 : 0, color: CLASS_COLOR[c] })).filter((c) => c.value > 0)
  }, [view, L])
  const history = data.snapshots.map((s) => ({ x: s.month, y: s.netWorth }))

  if (!settings.onboarded && data.assets.length === 0) return <Onboarding />

  if (data.assets.length === 0) {
    return (
      <>
        <Empty icon={<Sparkles className="h-7 w-7" />} title={L('ابدأ بإضافة ما تملكه', 'Start by adding what you own')}
          body={L('أضف أصولك مرة واحدة، والتطبيق يريك توزيعك الحقيقي، أين التركّز، وأين تضع مساهمتك القادمة.', 'Add your assets once and the app shows your real allocation, where you are concentrated and where your next contribution should go.')}
          action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{L('إضافة أول أصل', 'Add first asset')}</button>} />
        <AssetWizard open={adding} onClose={() => setAdding(false)} />
      </>
    )
  }

  return (
    <>
      {/* Net worth */}
      <section className="rounded-3xl bg-brand-700 p-5 text-white shadow-card">
        <p className="text-sm text-white/75">{L('صافي قيمة المحفظة', 'Portfolio net worth')}</p>
        <p className="mt-1 text-[2.1rem] font-bold leading-none"><Money value={view.netWorth} /></p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {view.hasLive && (
            <span className="text-white/75">{L('اليوم', 'Today')} <span className="num font-semibold text-white">{settings.hideAmounts ? pct(view.dayChangePct, 2, true) : `${view.dayChange >= 0 ? '+' : ''}${Math.round(view.dayChange).toLocaleString('en-US')} (${pct(view.dayChangePct, 2, true)})`}</span></span>
          )}
          <span className="text-white/75">{L('إجمالي الربح', 'Total gain')} <span className="num font-semibold text-white">{pct(view.gainPct, 1, true)}</span></span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/15 pt-3 text-sm">
          <div><p className="text-xs text-white/70">{L('استثماري', 'Investable')}</p><Money value={view.investable} className="font-semibold" /></div>
          <div><p className="text-xs text-white/70">{L('صندوق الطوارئ', 'Emergency fund')}</p><Money value={view.emergency} className="font-semibold" /></div>
        </div>
      </section>

      {/* What to do now */}
      <section className="space-y-2.5">
        <h2 className="section-title">{L('المطلوب منك الآن', 'What needs you now')}</h2>
        {actions.map((a) => (
          <Notice key={a.id} tone={a.tone} title={a.title} action={<Link href={a.href} className="inline-flex min-h-[36px] items-center gap-1 text-sm font-semibold text-brand-700">{a.cta}<Arrow className="h-4 w-4" /></Link>}>
            {a.body}
          </Notice>
        ))}
      </section>

      {/* Goal */}
      {goal.target > 0 && (
        <Link href="/plan/#goal" className="card block">
          <div className="flex items-baseline justify-between">
            <h2 className="section-title">{L('هدفك', 'Your goal')}</h2>
            <span className="num text-sm font-bold">{pct(goal.pct, 0)}</span>
          </div>
          <div className="mt-3"><Meter value={goal.pct} label={L('نسبة بلوغ الهدف', 'Goal progress')} tone={goal.pct >= 100 ? 'good' : 'brand'} /></div>
          <div className="mt-2 flex justify-between text-xs text-ink-soft">
            <Money value={goal.current} />
            <span>{L('من', 'of')} <Money value={goal.target} /></span>
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {goal.pct >= 100 ? L('بلغت هدفك. راجع «الدخل» لتحويله إلى صرف منتظم.', 'You reached your goal. See Income to turn it into regular spending.')
              : goal.reachYear ? L(`بوتيرتك الحالية تبلغه في ${goal.reachYear}.`, `At your current pace you reach it in ${goal.reachYear}.`)
              : L('بالوتيرة الحالية لا يُبلغ الهدف — ارفع المساهمة الشهرية.', 'At the current pace the goal is not reached — raise your monthly contribution.')}
          </p>
        </Link>
      )}

      {/* Allocation glance */}
      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">{L('توزيع المحفظة', 'Allocation')}</h2>
          <Link href="/analysis/" className="flex min-h-[36px] items-center gap-1 text-sm font-semibold text-brand-700">{L('كل المحاور', 'All axes')}<Arrow className="h-4 w-4" /></Link>
        </div>
        <div className="mt-3"><SegBar parts={classes} /></div>
        <ul className="mt-3 space-y-2">
          {classes.map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.color }} aria-hidden /><span className="truncate">{c.label}</span></span>
              <span className="flex shrink-0 items-baseline gap-2"><Money value={c.value} className="text-xs text-ink-soft" /><span className="num w-12 text-end font-semibold">{pct(c.pct)}</span></span>
            </li>
          ))}
        </ul>
      </section>

      {/* Net worth over time */}
      <section className="card">
        <h2 className="section-title">{L('مسار صافي القيمة', 'Net worth over time')}</h2>
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
    </>
  )
}
