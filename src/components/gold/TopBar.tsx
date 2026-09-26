'use client'

import { AnimatePresence, motion } from 'framer-motion'

/**
 * The per-gram price, pinned to the top once the dashboard has scrolled away.
 *
 * Editing the piece below — its weight, the shop's price — pushes the gold
 * card off screen, and with it the one number everything else is measured
 * against. Rather than make the card itself sticky (a tall sticky card eats
 * half a phone screen), this slim bar slides down in its place and slides
 * back up when the card returns.
 *
 * It is `fixed`, not in the flow, so appearing never nudges the content under
 * the user's thumb.
 */
export default function TopBar({
  show,
  label,
  value,
  tone,
}: {
  show: boolean
  label: string
  value: React.ReactNode
  tone: 'gold' | 'green'
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: '-110%' }}
          animate={{ y: 0 }}
          exit={{ y: '-110%' }}
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 top-0 z-40 px-3"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <div
            className={
              'mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-white shadow-lg ' +
              (tone === 'gold'
                ? 'bg-gradient-to-l from-amber-500 to-amber-600 shadow-amber-700/25'
                : 'bg-gradient-to-l from-emerald-500 to-emerald-600 shadow-emerald-700/25')
            }
          >
            <span className="min-w-0 truncate text-xs font-bold text-white/90">{label}</span>
            <bdi className="shrink-0 text-base font-extrabold">{value}</bdi>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
