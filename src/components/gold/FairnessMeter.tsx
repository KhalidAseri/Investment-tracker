'use client'

import { useEffect } from 'react'
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import type { FairnessVerdict } from '@/lib/gold/types'
import { cn } from '@/lib/utils'

/**
 * Where the shop's price sits on the scale from bargain to daylight robbery.
 *
 * The verdict word alone ("سعر مرتفع") does not tell you how much room there is
 * to push. Seeing the needle sitting just inside the red, rather than deep in
 * it, is the difference between walking out and offering ten percent less —
 * so the meter shows the distance, not just the label.
 *
 * The needle travels on a spring: it is the one moment in the app that should
 * feel like a verdict landing.
 */

/** Track bounds, in percent difference from our fair price. */
const MIN = -20
const MAX = 35

/** Zone edges must match the thresholds in `analyzeQuote`. */
const ZONES: { verdict: FairnessVerdict; to: number; bar: string; label: string }[] = [
  { verdict: 'great', to: -5, bar: 'bg-emerald-400', label: 'ممتاز' },
  { verdict: 'fair', to: 5, bar: 'bg-sky-400', label: 'منطقي' },
  { verdict: 'high', to: 15, bar: 'bg-amber-400', label: 'مرتفع' },
  { verdict: 'overpriced', to: MAX, bar: 'bg-red-400', label: 'مبالغ فيه' },
]

export default function FairnessMeter({
  differencePercent,
  verdict,
  className,
}: {
  differencePercent: number
  verdict: FairnessVerdict
  className?: string
}) {
  const reduced = useReducedMotion()

  const clamped = Math.min(MAX, Math.max(MIN, differencePercent))
  const target = ((clamped - MIN) / (MAX - MIN)) * 100

  // Driven through a motion value so the needle can be positioned with a
  // logical offset — the scale runs from cheap to dear along the reading
  // direction, which in this Arabic UI is right to left.
  const progress = useSpring(target, { stiffness: 260, damping: 26 })
  useEffect(() => {
    if (reduced) progress.jump(target)
    else progress.set(target)
  }, [target, progress, reduced])
  const inset = useTransform(progress, (v) => `${v}%`)

  return (
    <div className={cn('select-none', className)}>
      <div className="relative">
        {/* Zones, laid out cheap → expensive; flex follows the RTL direction. */}
        <div className="flex h-2.5 overflow-hidden rounded-full">
          {ZONES.map((zone, i) => {
            const from = i === 0 ? MIN : ZONES[i - 1].to
            return (
              <div
                key={zone.verdict}
                className={cn(zone.bar, verdict === zone.verdict ? 'opacity-100' : 'opacity-35')}
                style={{ width: `${((zone.to - from) / (MAX - MIN)) * 100}%` }}
              />
            )
          })}
        </div>

        {/* The needle. */}
        <motion.div
          style={{ insetInlineStart: inset }}
          className="absolute -top-1.5"
        >
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="-ms-2.5 h-5 w-5 rounded-full border-[3px] border-gray-900 bg-white shadow-md"
          />
        </motion.div>
      </div>

      <div className="mt-3 flex justify-between text-[10px] font-bold">
        {ZONES.map((zone) => (
          <span
            key={zone.verdict}
            className={cn(
              'transition-colors',
              verdict === zone.verdict ? 'text-gray-900' : 'text-gray-400'
            )}
          >
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  )
}
