'use client'

import { motion } from 'framer-motion'
import { formatMoneyShort } from '@/lib/gold/format'
import type { CurrencyInfo } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import { SPRING_SOFT } from './motion'

export interface CostSlice {
  key: string
  label: string
  amount: number
  /** Tailwind background for the bar segment. */
  bar: string
  /** Tailwind background for the legend dot. */
  dot: string
}

/**
 * Where the money actually goes, as one proportional bar.
 *
 * This is the fastest honest answer to the question the app exists for. A
 * column of figures makes you do the division yourself; a bar where the making
 * charge is visibly a third of the width settles the question before you have
 * read a single number — and it is the same picture whether the piece costs
 * 900 or 9,000.
 *
 * Segments animate their width, so changing to a heavier-workmanship piece
 * shows the craftsmanship block growing rather than simply reprinting.
 */
export default function CostBar({
  slices,
  currency,
  className,
}: {
  slices: CostSlice[]
  currency: CurrencyInfo
  className?: string
}) {
  const visible = slices.filter((s) => s.amount > 0)
  const total = visible.reduce((sum, s) => sum + s.amount, 0)
  if (total <= 0) return null

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-gray-100">
        {visible.map((slice) => (
          <motion.div
            key={slice.key}
            className={cn('h-full', slice.bar)}
            initial={{ width: 0 }}
            animate={{ width: `${(slice.amount / total) * 100}%` }}
            transition={SPRING_SOFT}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((slice) => (
          <div key={slice.key} className="flex items-center gap-1.5">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', slice.dot)} />
            <span className="text-[11px] font-semibold text-gray-600">{slice.label}</span>
            <span className="text-[11px] font-bold tabular-nums text-gray-900">
              {Math.round((slice.amount / total) * 100)}%
            </span>
            <span className="text-[10px] tabular-nums text-gray-400">
              {formatMoneyShort(slice.amount, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
