'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, TrendingUp, Settings } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import { cn } from '@/lib/utils'

export default function BottomNav() {
  const pathname = usePathname()
  const { t } = useLocale()

  const navItems = [
    { href: '/dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { href: '/accounts', label: t.nav.accounts, icon: Wallet },
    { href: '/dividends', label: t.nav.dividends, icon: TrendingUp },
    { href: '/settings', label: t.nav.settings, icon: Settings },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden safe-bottom">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 w-full h-full rounded-lg transition-colors touch-manipulation',
                isActive
                  ? 'text-primary-600'
                  : 'text-gray-400 active:text-gray-600'
              )}
            >
              <Icon className={cn('w-5 h-5', isActive && 'stroke-[2.5]')} />
              <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
