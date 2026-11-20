'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ChartPie, CircleUserRound, Coins, Eye, EyeOff, Layers, LayoutDashboard, PackagePlus, Pencil, Plus, RefreshCw, Route, ShoppingCart } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { TxType } from '@/lib/types'
import AssetWizard from './AssetWizard'
import AssetSheet from './AssetSheet'
import { Money, Sheet, closeTopSheet, cx } from './ui'

const TABS = [
  { href: '/dashboard/', ar: 'الرئيسية', en: 'Home', icon: LayoutDashboard },
  { href: '/assets/', ar: 'المحفظة', en: 'Portfolio', icon: Layers },
  { href: '/analysis/', ar: 'التحليل', en: 'Insights', icon: ChartPie },
  { href: '/plan/', ar: 'الخطة', en: 'Plan', icon: Route },
]

interface Actions {
  openWizard: () => void
  /** Opens an asset, optionally straight into one of its actions. */
  openAsset: (id: string, mode?: TxType | 'LINK') => void
}
const ActionsCtx = createContext<Actions>({ openWizard: () => {}, openAsset: () => {} })
export const useActions = () => useContext(ActionsCtx)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  const { L, settings, updateSettings, refreshQuotes, quoteStatus, ready, data, view, syncStatus } = useStore()
  const [wizard, setWizard] = useState(false)
  const [asset, setAsset] = useState<{ id: string; mode?: TxType | 'LINK' } | null>(null)
  const [quick, setQuick] = useState(false)
  const [pick, setPick] = useState<TxType | null>(null)

  const actions = useMemo<Actions>(() => ({ openWizard: () => setWizard(true), openAsset: (id, mode) => setAsset({ id, mode }) }), [])
  const closeQuick = useCallback(() => { setQuick(false); setPick(null) }, [])

  // Android back button: close the top sheet first, then go back, then leave the app.
  useEffect(() => {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return
    let remove: (() => void) | undefined
    import('@capacitor/app').then(({ App }) =>
      App.addListener('backButton', ({ canGoBack }) => {
        if (closeTopSheet()) return
        if (canGoBack) window.history.back()
        else void App.exitApp()
      }).then((h) => { remove = () => void h.remove() }),
    )
    return () => remove?.()
  }, [])

  if (path.startsWith('/share')) return <main className="mx-auto min-h-dvh max-w-xl px-4 py-6">{children}</main>

  const current = TABS.find((t) => path.startsWith(t.href.slice(0, -1)))
  const title = current ? L(current.ar, current.en) : path.startsWith('/more') ? L('حسابي', 'My account') : L('استثماراتي', 'My Investments')
  const hasLive = data.assets.some((a) => a.pricing === 'live')
  const statusText =
    quoteStatus === 'loading' ? L('جاري تحديث الأسعار…', 'Updating prices…')
    : quoteStatus === 'failed' ? L('تعذّر جلب الأسعار — تُعرض آخر قيم محفوظة', 'Could not fetch prices — showing last saved values')
    : quoteStatus === 'partial' ? L('بعض الأسعار لم تتحدث', 'Some prices did not update')
    : ''
  const syncDot = syncStatus === 'synced' ? 'bg-gain' : syncStatus === 'conflict' || syncStatus === 'error' ? 'bg-loss' : syncStatus === 'syncing' ? 'bg-accent animate-pulse' : ''

  const QUICK: { type: TxType | 'ASSET'; ar: string; en: string; hintAr: string; hintEn: string; icon: React.ElementType }[] = [
    { type: 'ASSET', ar: 'أصل جديد', en: 'New asset', hintAr: 'سهم، صندوق، نقد، ذهب، عقار', hintEn: 'Stock, fund, cash, gold, property', icon: PackagePlus },
    { type: 'BUY', ar: 'شراء', en: 'Buy', hintAr: 'أضف كمية لأصل تملكه', hintEn: 'Add to a holding', icon: ShoppingCart },
    { type: 'DIVIDEND', ar: 'توزيعة أو عائد', en: 'Dividend or income', hintAr: 'سجّل ما استلمته', hintEn: 'Record what you received', icon: Coins },
    { type: 'VALUE_UPDATE', ar: 'تحديث قيمة', en: 'Update a value', hintAr: 'للأصول اليدوية', hintEn: 'For manual assets', icon: Pencil },
  ]
  const candidates = view.rows.filter((r) => (pick === 'BUY' ? r.asset.pricing === 'live' : pick === 'VALUE_UPDATE' ? r.asset.pricing === 'manual' : true))

  const tab = (t: (typeof TABS)[number]) => {
    const active = current?.href === t.href
    return (
      <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={cx('relative flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-link' : 'text-ink-soft')}>
        {active && <motion.span layoutId="nav-pill" className="absolute top-0 h-0.5 w-10 rounded-full bg-accent" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
        <t.icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
        {L(t.ar, t.en)}
      </Link>
    )
  }

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <div className="flex h-14 items-center justify-between">
            <h1 className="text-lg font-bold">{title}</h1>
            <div className="flex items-center">
              {hasLive && (
                <button onClick={() => refreshQuotes(true)} disabled={quoteStatus === 'loading'} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-card" aria-label={L('تحديث الأسعار', 'Refresh prices')}>
                  <RefreshCw className={cx('h-5 w-5', quoteStatus === 'loading' && 'animate-spin')} />
                </button>
              )}
              <button onClick={() => updateSettings({ hideAmounts: !settings.hideAmounts })} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-card" aria-label={settings.hideAmounts ? L('إظهار المبالغ', 'Show amounts') : L('إخفاء المبالغ', 'Hide amounts')} aria-pressed={settings.hideAmounts}>
                {settings.hideAmounts ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
              <Link href="/more/" className={cx('relative flex h-11 w-11 items-center justify-center rounded-full hover:bg-card', path.startsWith('/more') ? 'text-link' : 'text-ink-soft')} aria-label={L('حسابي والإعدادات', 'Account and settings')}>
                <CircleUserRound className="h-[22px] w-[22px]" />
                {syncDot && <span className={cx('absolute end-2 top-2 h-2 w-2 rounded-full ring-2 ring-surface', syncDot)} aria-hidden />}
              </Link>
            </div>
          </div>
          {statusText && <p className="pb-2 text-xs text-ink-soft" role="status">{statusText}</p>}
        </header>

        <main className="flex-1 px-4 pb-32 pt-4">
          {ready ? (
            // Enter-only transition. An exit animation here would hold the old wrapper while the router
            // already renders the new page inside it, leaving the new page stuck invisible.
            <motion.div key={path} className="space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}>
              {children}
            </motion.div>
          ) : (
            <div className="space-y-4" aria-busy="true"><div className="skeleton h-40" /><div className="skeleton h-24" /><div className="skeleton h-56" /></div>
          )}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md" aria-label={L('التنقل الرئيسي', 'Main navigation')}>
          {/* Five equal slots; the add button sits in the middle one. It is placed with a margin, not a
              transform: the motion library owns the element's transform and would overwrite a CSS translate. */}
          <div className="mx-auto grid max-w-xl grid-cols-5">
            {TABS.slice(0, 2).map(tab)}
            <div className="flex justify-center">
              <motion.button onClick={() => setQuick(true)} whileTap={{ scale: 0.92 }} className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-float" aria-label={L('إضافة أو تسجيل', 'Add or record')}>
                <Plus className="h-7 w-7" />
              </motion.button>
            </div>
            {TABS.slice(2).map(tab)}
          </div>
        </nav>
      </div>

      {/* Quick add: the four things people record most, two taps away from anywhere */}
      <Sheet open={quick} onClose={closeQuick} title={pick ? L('اختر الأصل', 'Choose the asset') : L('إضافة أو تسجيل', 'Add or record')}>
        {!pick ? (
          <div className="grid grid-cols-2 gap-2.5">
            {QUICK.map((q) => (
              <button key={q.type} onClick={() => { if (q.type === 'ASSET') { closeQuick(); setWizard(true) } else setPick(q.type) }} className="flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-line bg-card p-3.5 text-start transition hover:border-accent active:scale-[0.98]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tint text-link"><q.icon className="h-5 w-5" /></span>
                <span className="text-sm font-semibold leading-tight">{L(q.ar, q.en)}</span>
                <span className="text-[11px] leading-snug text-ink-soft">{L(q.hintAr, q.hintEn)}</span>
              </button>
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-ink-soft">{L('لا يوجد أصل مناسب بعد. أضف أصلًا أولاً.', 'No suitable asset yet. Add one first.')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {candidates.map((r) => (
              <li key={r.asset.id}>
                <button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3.5 py-2 text-start hover:bg-surface" onClick={() => { const mode = pick; closeQuick(); setAsset({ id: r.asset.id, mode }) }}>
                  <span className="min-w-0 truncate text-sm font-medium">{r.asset.name}</span>
                  <Money value={r.value} className="shrink-0 text-sm text-ink-soft" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <AssetWizard open={wizard} onClose={() => setWizard(false)} />
      <AssetSheet assetId={asset?.id ?? null} initialMode={asset?.mode} onClose={() => setAsset(null)} />
    </ActionsCtx.Provider>
  )
}
