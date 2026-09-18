'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Calculator, Scale, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/gold', label: 'الشراء', icon: Calculator },
  { href: '/gold/sell', label: 'البيع', icon: TrendingDown },
  { href: '/gold/compare', label: 'المقارنة', icon: Scale },
  { href: '/gold/guide', label: 'نصائح', icon: BookOpen },
]

export default function GoldNav() {
  const pathname = usePathname()
  // Static export serves trailing-slash URLs, so normalise before comparing.
  const current = pathname.replace(/\/$/, '') || '/'

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {TABS.map((tab) => {
        const active = current === tab.href
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors touch-manipulation',
              active
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-gray-600 ring-1 ring-gray-200 active:bg-gray-50'
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
