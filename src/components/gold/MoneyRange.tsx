'use client'

import { formatMoney } from '@/lib/gold/format'
import type { CurrencyInfo } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'

/**
 * A low–high money range that reads in the right order in Arabic.
 *
 * This can't be left to the bidi algorithm. Written as one string, "537 – 560"
 * contains no strong-direction character, so an isolate around it resolves to
 * left-to-right and the right-to-left reader meets 560 first — "بين 560 و
 * 537". Whether it came out right depended on whether a currency symbol
 * happened to sit inside the same element, which is how the screen ended up
 * with some ranges the right way round and some backwards.
 *
 * So the order is fixed in the markup instead: a right-to-left row whose first
 * item is the low end. Each figure is its own left-to-right isolate so its
 * digits, commas and decimal point stay intact.
 */
export default function MoneyRange({
  low,
  high,
  currency,
  animate = true,
  withSymbol = true,
  className,
}: {
  low: number
  high: number
  currency: CurrencyInfo
  animate?: boolean
  withSymbol?: boolean
  className?: string
}) {
  // Whole units once the figures reach the hundreds: at that size the fils
  // only make a range harder to read. A gram priced in dinars (≈13.4) keeps
  // its decimals, or both ends would round to the same number.
  const decimals = Math.max(Math.abs(low), Math.abs(high)) >= 100 ? 0 : currency.decimals
  const fmt = (v: number) => formatMoney(v, currency, { decimals, withSymbol: false })
  const figure = (v: number) => (animate ? <AnimatedNumber value={v} format={fmt} /> : fmt(v))

  return (
    <span
      dir="rtl"
      aria-label={`من ${fmt(low)} إلى ${fmt(high)} ${currency.labelAr}`}
      className={cn('inline-flex items-baseline gap-[0.3em] whitespace-nowrap', className)}
    >
      <bdi dir="ltr" data-range-end="low">
        {figure(low)}
      </bdi>
      <span aria-hidden="true" className="opacity-60">
        –
      </span>
      <bdi dir="ltr" data-range-end="high">
        {figure(high)}
      </bdi>
      {withSymbol && <span aria-hidden="true">{currency.symbolAr}</span>}
    </span>
  )
}
