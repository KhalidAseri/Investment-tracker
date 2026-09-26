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
 * Part-to-whole with three named classes, so the colours carry identity:
 * gold `#d97706`, workmanship `#7c3aed`, tax `#0891b2`. That trio was checked
 * with a contrast validator rather than picked by eye — the amber-and-orange
 * pair it replaced sat at ΔE 4.2 for *normal* vision, which is to say nobody
 * could tell the metal from the making. Segments are separated by a surface
 * gap and every one is direct-labelled, so identity never rests on hue alone.
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
      <div className="flex h-4 w-full gap-0.5">
        {visible.map((slice, i) => (
          <motion.div
            key={slice.key}
            className={cn(
              'h-full',
              slice.bar,
              // Rounded ends on the outer edges only, so the run reads as one bar.
              i === 0 && 'rounded-s-md',
              i === visible.length - 1 && 'rounded-e-md'
            )}
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
            <bdi className="text-[10px] tabular-nums text-gray-400">
              {formatMoneyShort(slice.amount, currency)}
            </bdi>
          </div>
        ))}
      </div>
    </div>
  )
}

/** The validated categorical trio, so callers can't drift from it. */
export const COST_COLORS = {
  gold: { bar: 'bg-[#d97706]', dot: 'bg-[#d97706]' },
  making: { bar: 'bg-[#7c3aed]', dot: 'bg-[#7c3aed]' },
  vat: { bar: 'bg-[#0891b2]', dot: 'bg-[#0891b2]' },
} as const
