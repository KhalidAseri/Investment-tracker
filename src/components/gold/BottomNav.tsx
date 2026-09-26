'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, Calculator, MapPin } from 'lucide-react'
import { getOffers, OFFERS_CHANGED } from '@/lib/gold/storage'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { SPRING } from './motion'

const TABS = [
  { href: '/', label: 'الحاسبة', icon: Calculator },
  { href: '/tour', label: 'جولتي', icon: MapPin },
  { href: '/guide', label: 'نصائح', icon: BookOpen },
] as const

/**
 * Primary navigation, at the bottom of the screen.
 *
 * It used to be a row of pills at the very top. On a phone held in one hand
 * the top is the hardest place to reach, and on Android 15 — which draws apps
 * edge to edge — that row ended up under the clock and signal icons. The
 * bottom bar is where the thumb already rests, and it is the pattern both
 * Android and iOS use for an app's handful of top-level places.
 *
 * The tour tab carries a count of the shops saved on this trip. It bumps when
 * one is added, which is the confirmation that "أضف للجولة" actually did
 * something — the saved shop itself lives on another screen.
 */
export default function BottomNav() {
  const pathname = usePathname()
  // Static export serves trailing-slash URLs, so normalise before comparing.
  const current = pathname.replace(/\/$/, '') || '/'

  const [count, setCount] = useState(0)
  useEffect(() => {
    const sync = () => setCount(getOffers().length)
    sync()
    window.addEventListener(OFFERS_CHANGED, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(OFFERS_CHANGED, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return (
    <nav
      aria-label="التنقّل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200/80 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-3 px-2">
        {TABS.map((tab) => {
          const active = current === tab.href
          const Icon = tab.icon
          const badge = tab.href === '/tour' && count > 0 ? count : null
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => {
                if (!active) tapFeedback('light')
              }}
              aria-current={active ? 'page' : undefined}
              className="relative flex flex-col items-center justify-center gap-1 touch-manipulation"
            >
              <span className="relative flex h-8 w-16 items-center justify-center">
                {active && (
                  <motion.span
                    layoutId="nav-indicator"
                    transition={SPRING}
                    className="absolute inset-0 rounded-full bg-amber-100"
                  />
                )}
                <motion.span
                  className="relative"
                  animate={active ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Icon
                    className={cn('h-5 w-5', active ? 'text-amber-700' : 'text-gray-500')}
                    strokeWidth={active ? 2.4 : 2}
                  />
                </motion.span>

                <AnimatePresence>
                  {badge !== null && (
                    <motion.span
                      key={badge}
                      initial={{ scale: 0.4 }}
                      animate={{ scale: [1.35, 1] }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 520, damping: 16 }}
                      className="absolute -top-1 end-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-white"
                    >
                      {badge}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span
                className={cn(
                  'text-[11px] leading-none',
                  active ? 'font-extrabold text-amber-800' : 'font-semibold text-gray-500'
                )}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
