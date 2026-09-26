'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import { BookOpen, Calculator, Scale, TrendingDown } from 'lucide-react'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { SPRING, TAP } from './motion'

const TABS = [
  { href: '/', label: 'الشراء', icon: Calculator },
  { href: '/sell', label: 'البيع', icon: TrendingDown },
  { href: '/compare', label: 'المقارنة', icon: Scale },
  { href: '/guide', label: 'نصائح', icon: BookOpen },
]

export default function GoldNav() {
  const pathname = usePathname()
  // Static export serves trailing-slash URLs, so normalise before comparing.
  const current = pathname.replace(/\/$/, '') || '/'

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      {TABS.map((tab) => {
        const active = current === tab.href
        const Icon = tab.icon
        return (
          <motion.div key={tab.href} whileTap={TAP} className="shrink-0">
            <Link
              href={tab.href}
              onClick={() => tapFeedback('light')}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold touch-manipulation',
                active ? 'text-white' : 'text-gray-600'
              )}
            >
              {/* One pill that slides between tabs, so the eye follows the move
                  rather than hunting for what just turned amber. */}
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  transition={SPRING}
                  className="absolute inset-0 rounded-xl bg-amber-600 shadow-sm shadow-amber-600/30"
                />
              )}
              {!active && (
                <span className="absolute inset-0 rounded-xl bg-white ring-1 ring-gray-200" />
              )}
              <Icon className="relative h-4 w-4" />
              <span className="relative">{tab.label}</span>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
