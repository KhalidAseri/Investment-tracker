'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { ChartPie, ChevronLeft, ChevronRight, CircleUserRound, Coins, Eye, EyeOff, Layers, LayoutDashboard, PackagePlus, Pencil, PieChart, Plus, RefreshCw, Route, ShoppingCart } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { TxType } from '@/lib/types'
import AssetWizard from './AssetWizard'
import AssetSheet from './AssetSheet'
import QuickUpdate from './QuickUpdate'
import BasketSheet from './BasketSheet'
import { Money, Sheet, closeTopSheet, cx, haptic } from './ui'

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
  /** Walks through every hand-valued asset to bring its value up to date. */
  openQuickUpdate: () => void
  /** Opens a weighted portfolio: empty to create one, or an existing one by its account id. */
  openBasket: (accountId?: string) => void
}
const ActionsCtx = createContext<Actions>({ openWizard: () => {}, openAsset: () => {}, openQuickUpdate: () => {}, openBasket: () => {} })
export const useActions = () => useContext(ActionsCtx)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  const { L, settings, updateSettings, refreshQuotes, quoteStatus, ready, data, view, syncStatus } = useStore()
  const [wizard, setWizard] = useState(false)
  const [asset, setAsset] = useState<{ id: string; mode?: TxType | 'LINK' } | null>(null)
  const [quick, setQuick] = useState(false)
  const [pick, setPick] = useState<TxType | null>(null)
  const [update, setUpdate] = useState(false)
  const [basket, setBasket] = useState<{ accountId: string | null } | null>(null)

  const actions = useMemo<Actions>(() => ({ openWizard: () => setWizard(true), openAsset: (id, mode) => setAsset({ id, mode }), openQuickUpdate: () => setUpdate(true), openBasket: (accountId) => setBasket({ accountId: accountId ?? null }) }), [])
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

  // The large title scrolls away and a small one takes its place in the bar, as on a phone's own screens.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 40)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [path])

  // Pull down at the top of a page to refresh prices.
  const [pull, setPull] = useState(0)
  const pullRef = useRef(0)
  const refreshRef = useRef(refreshQuotes)
  refreshRef.current = refreshQuotes
  useEffect(() => {
    let startY = 0
    let active = false
    const set = (v: number) => { pullRef.current = v; setPull(v) }
    const onStart = (e: TouchEvent) => { active = window.scrollY <= 0 && document.body.style.overflow !== 'hidden'; startY = e.touches[0].clientY }
    const onMove = (e: TouchEvent) => { if (!active) return; const d = e.touches[0].clientY - startY; set(d > 0 && window.scrollY <= 0 ? Math.min(84, d * 0.45) : 0) }
    const onEnd = () => { if (active && pullRef.current >= 56) { haptic(); void refreshRef.current(true) } set(0); active = false }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => { window.removeEventListener('touchstart', onStart); window.removeEventListener('touchmove', onMove); window.removeEventListener('touchend', onEnd); window.removeEventListener('touchcancel', onEnd) }
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

  const QUICK: { type: TxType | 'ASSET' | 'BASKET'; ar: string; en: string; hintAr: string; hintEn: string; icon: React.ElementType }[] = [
    { type: 'ASSET', ar: 'أصل جديد', en: 'New asset', hintAr: 'سهم، صندوق، نقد، ذهب، عقار', hintEn: 'Stock, fund, cash, gold, property', icon: PackagePlus },
    { type: 'BUY', ar: 'شراء', en: 'Buy', hintAr: 'أضف كمية لأصل تملكه', hintEn: 'Add to a holding', icon: ShoppingCart },
    { type: 'DIVIDEND', ar: 'توزيعة أو عائد', en: 'Dividend or income', hintAr: 'سجّل ما استلمته', hintEn: 'Record what you received', icon: Coins },
    { type: 'BASKET', ar: 'محفظة بنِسب', en: 'Weighted portfolio', hintAr: 'مكوّنات بنِسبها وقيمة حصتك', hintEn: 'Components by weight and your share', icon: PieChart },
    { type: 'VALUE_UPDATE', ar: 'تحديث القيم', en: 'Update values', hintAr: 'مرّ على أصولك اليدوية واحدًا واحدًا', hintEn: 'Go through your hand-valued assets one by one', icon: Pencil },
  ]
  const candidates = view.rows.filter((r) => (pick === 'BUY' ? r.asset.pricing === 'live' : pick === 'VALUE_UPDATE' ? r.asset.pricing === 'manual' : true))

  const Chevron = settings.locale === 'ar' ? ChevronLeft : ChevronRight
  const tab = (t: (typeof TABS)[number]) => {
    const active = current?.href === t.href
    return (
      <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors', active ? 'text-link' : 'text-ink-faint')}>
        <t.icon className="h-6 w-6" strokeWidth={active ? 2.3 : 1.8} aria-hidden />
        {L(t.ar, t.en)}
      </Link>
    )
  }

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
        <header className={cx('sticky top-0 z-30 px-2 pt-[env(safe-area-inset-top)] transition-[background-color,border-color] duration-200', scrolled ? 'border-b border-line bg-surface/80 backdrop-blur-xl' : 'border-b border-transparent bg-surface')}>
          <div className="flex h-11 items-center justify-between">
            <span aria-hidden className={cx('ps-2 text-[17px] font-semibold transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')}>{title}</span>
            <div className="flex items-center">
              {hasLive && (
                <button onClick={() => refreshQuotes(true)} disabled={quoteStatus === 'loading'} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft" aria-label={L('تحديث الأسعار', 'Refresh prices')}>
                  <RefreshCw className={cx('h-[22px] w-[22px]', quoteStatus === 'loading' && 'animate-spin')} />
                </button>
              )}
              <button onClick={() => updateSettings({ hideAmounts: !settings.hideAmounts })} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft" aria-label={settings.hideAmounts ? L('إظهار المبالغ', 'Show amounts') : L('إخفاء المبالغ', 'Hide amounts')} aria-pressed={settings.hideAmounts}>
                {settings.hideAmounts ? <EyeOff className="h-[22px] w-[22px]" /> : <Eye className="h-[22px] w-[22px]" />}
              </button>
              <Link href="/more/" className={cx('relative flex h-11 w-11 items-center justify-center rounded-full', path.startsWith('/more') ? 'text-link' : 'text-ink-soft')} aria-label={L('حسابي والإعدادات', 'Account and settings')}>
                <CircleUserRound className="h-6 w-6" />
                {syncDot && <span className={cx('absolute end-2 top-2 h-2 w-2 rounded-full ring-2 ring-surface', syncDot)} aria-hidden />}
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 pb-32">
          {/* pull-to-refresh: the arrow turns as the page is pulled, and lets go into a refresh */}
          <div className="flex items-end justify-center overflow-hidden text-ink-faint" style={{ height: pull }} aria-hidden>
            <RefreshCw className="mb-2 h-5 w-5" style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 56) }} />
          </div>
          <h1 className="large-title pt-1">{title}</h1>
          <p className="min-h-[20px] pb-2 text-[13px] text-ink-soft" role="status">{statusText}</p>
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

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl" aria-label={L('التنقل الرئيسي', 'Main navigation')}>
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
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
            {QUICK.map((q) => (
              <li key={q.type}>
                <button onClick={() => { if (q.type === 'ASSET') { closeQuick(); setWizard(true) } else if (q.type === 'BASKET') { closeQuick(); setBasket({ accountId: null }) } else if (q.type === 'VALUE_UPDATE') { closeQuick(); setUpdate(true) } else setPick(q.type) }} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2 text-start">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-tint text-link"><q.icon className="h-5 w-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium leading-snug">{L(q.ar, q.en)}</span>
                    <span className="block text-[13px] leading-snug text-ink-soft">{L(q.hintAr, q.hintEn)}</span>
                  </span>
                  <Chevron className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-ink-soft">{L('لا يوجد أصل مناسب بعد. أضف أصلًا أولاً.', 'No suitable asset yet. Add one first.')}</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
            {candidates.map((r) => (
              <li key={r.asset.id}>
                <button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-start" onClick={() => { const mode = pick; closeQuick(); setAsset({ id: r.asset.id, mode }) }}>
                  <span className="min-w-0 truncate text-sm font-medium">{r.asset.name}</span>
                  <Money value={r.value} className="shrink-0 text-sm text-ink-soft" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <AssetWizard open={wizard} onClose={() => setWizard(false)} onExisting={(id) => setAsset({ id, mode: 'BUY' })} onBasket={() => { setWizard(false); setBasket({ accountId: null }) }} />
      <BasketSheet open={!!basket} accountId={basket?.accountId ?? null} onClose={() => setBasket(null)} />
      <QuickUpdate open={update} onClose={() => setUpdate(false)} />
      <AssetSheet assetId={asset?.id ?? null} initialMode={asset?.mode} onClose={() => setAsset(null)} />
    </ActionsCtx.Provider>
  )
}
