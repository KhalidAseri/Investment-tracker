'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChartPie, Ellipsis, Eye, EyeOff, Layers, LayoutDashboard, RefreshCw, Route } from 'lucide-react'
import { useStore } from '@/lib/store'
import { cx } from './ui'

const TABS = [
  { href: '/dashboard/', ar: 'الرئيسية', en: 'Home', icon: LayoutDashboard },
  { href: '/assets/', ar: 'الأصول', en: 'Assets', icon: Layers },
  { href: '/analysis/', ar: 'التحليل', en: 'Analysis', icon: ChartPie },
  { href: '/plan/', ar: 'الخطة', en: 'Plan', icon: Route },
  { href: '/more/', ar: 'المزيد', en: 'More', icon: Ellipsis },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? ''
  const { L, settings, updateSettings, refreshQuotes, quoteStatus, ready, data } = useStore()
  if (path.startsWith('/share')) return <main className="mx-auto min-h-dvh max-w-xl px-4 py-6">{children}</main>

  const current = TABS.find((t) => path.startsWith(t.href.slice(0, -1)))
  const hasLive = data.assets.some((a) => a.pricing === 'live')
  const statusText =
    quoteStatus === 'loading' ? L('جاري تحديث الأسعار…', 'Updating prices…')
    : quoteStatus === 'failed' ? L('تعذّر جلب الأسعار — تُعرض آخر قيم محفوظة', 'Could not fetch prices — showing last saved values')
    : quoteStatus === 'partial' ? L('بعض الأسعار لم تتحدث', 'Some prices did not update')
    : ''

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center justify-between">
          <h1 className="text-lg font-bold">{current ? L(current.ar, current.en) : L('استثماراتي', 'My Investments')}</h1>
          <div className="flex items-center">
            {hasLive && (
              <button onClick={() => refreshQuotes(true)} disabled={quoteStatus === 'loading'} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-white" aria-label={L('تحديث الأسعار', 'Refresh prices')}>
                <RefreshCw className={cx('h-5 w-5', quoteStatus === 'loading' && 'animate-spin')} />
              </button>
            )}
            <button onClick={() => updateSettings({ hideAmounts: !settings.hideAmounts })} className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-white" aria-label={settings.hideAmounts ? L('إظهار المبالغ', 'Show amounts') : L('إخفاء المبالغ', 'Hide amounts')} aria-pressed={settings.hideAmounts}>
              {settings.hideAmounts ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {statusText && <p className="pb-2 text-xs text-ink-soft" role="status">{statusText}</p>}
      </header>

      <main className="flex-1 space-y-4 px-4 pb-28 pt-4">{ready ? children : <div className="py-24 text-center text-sm text-ink-soft">…</div>}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label={L('التنقل الرئيسي', 'Main navigation')}>
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => {
            const active = current?.href === t.href
            return (
              <Link key={t.href} href={t.href} aria-current={active ? 'page' : undefined} className={cx('flex min-h-[58px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-brand-600' : 'text-ink-soft')}>
                <t.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {L(t.ar, t.en)}
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
