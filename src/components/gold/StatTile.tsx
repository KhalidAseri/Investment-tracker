'use client'

import { cn } from '@/lib/utils'

/**
 * One figure on the dashboard, with its label and an optional note.
 *
 * Deliberately not a chart. Each of these is a single current value, and the
 * right form for a single value is the value — a one-bar bar chart would add
 * ink without adding meaning.
 *
 * The value uses the font's proportional figures rather than tabular ones:
 * tabular widths give every digit the width of a zero, which reads loose at
 * this size. Tabular is kept for the breakdown rows, where numbers stack in a
 * column and have to align. The exception is a figure that animates — a
 * number in flight must not resize its own box — and those opt in explicitly.
 */
export default function StatTile({
  label,
  value,
  note,
  tone = 'neutral',
  className,
}: {
  label: string
  value: React.ReactNode
  note?: string
  tone?: 'neutral' | 'gold' | 'warning'
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3.5',
        tone === 'gold' && 'border-amber-200 bg-amber-50/60',
        tone === 'warning' && 'border-orange-200 bg-orange-50/60',
        tone === 'neutral' && 'border-gray-200 bg-white',
        className
      )}
    >
      <p
        className={cn(
          'text-[11px] font-bold',
          tone === 'gold' ? 'text-amber-700' : tone === 'warning' ? 'text-orange-700' : 'text-gray-500'
        )}
      >
        {label}
      </p>
      <bdi
        className={cn(
          'mt-1 block text-lg font-extrabold leading-tight',
          tone === 'warning' ? 'text-orange-900' : 'text-gray-900'
        )}
      >
        {value}
      </bdi>
      {note && <p className="mt-0.5 text-[10px] leading-relaxed text-gray-400">{note}</p>}
    </div>
  )
}
