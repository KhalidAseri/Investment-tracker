'use client'

import { cn } from '@/lib/utils'

/** Label + hint wrapper so every input in the calculator lines up the same way. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label className="block text-sm font-semibold text-gray-700">{label}</label>
      {children}
      {hint && <p className="text-xs leading-relaxed text-gray-500">{hint}</p>}
    </div>
  )
}

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  sublabel?: string
}

/**
 * Horizontal pill picker. Scrolls on narrow screens rather than wrapping into a
 * tall block, which keeps the calculator above the fold on a phone.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex shrink-0 flex-col items-center justify-center rounded-xl border font-semibold transition-colors touch-manipulation',
              size === 'sm' ? 'min-w-[68px] px-3 py-2 text-xs' : 'min-w-[84px] px-4 py-2.5 text-sm',
              active
                ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-500'
                : 'border-gray-200 bg-white text-gray-600 active:bg-gray-50'
            )}
          >
            <span>{opt.label}</span>
            {opt.sublabel && (
              <span
                className={cn(
                  'mt-0.5 text-[10px] font-medium',
                  active ? 'text-amber-700' : 'text-gray-400'
                )}
              >
                {opt.sublabel}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Plain dropdown, used where the option list is too long to show as pills. */
export function Select<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-xl border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-900 shadow-sm focus:border-amber-500 focus:ring-amber-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/**
 * Numeric input with +/- steppers. Keeps its own draft string so the user can
 * clear the box or type "12." without the value snapping back mid-keystroke.
 */
export function NumberInput({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  suffix,
  placeholder,
  inputMode = 'decimal',
}: {
  value: number | null
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
}) {
  const clamp = (n: number) => {
    let out = n
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    // Kill float dust from repeated 0.1 steps.
    return Math.round(out * 1000) / 1000
  }

  const bump = (delta: number) => onChange(clamp((value ?? 0) + delta))

  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => bump(-step)}
        aria-label="إنقاص"
        className="w-11 shrink-0 rounded-xl border border-gray-200 bg-white text-lg font-bold text-gray-600 active:bg-gray-100 touch-manipulation"
      >
        −
      </button>
      <div className="relative flex-1">
        <input
          type="text"
          inputMode={inputMode}
          value={value === null || Number.isNaN(value) ? '' : String(value)}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '')
            const parsed = Number(raw)
            onChange(raw === '' || Number.isNaN(parsed) ? 0 : parsed)
          }}
          onBlur={(e) => {
            const parsed = Number(e.target.value.replace(/[^\d.]/g, ''))
            onChange(Number.isNaN(parsed) ? min ?? 0 : clamp(parsed))
          }}
          className={cn(
            'w-full rounded-xl border-gray-200 py-2.5 text-center text-base font-bold text-gray-900 shadow-sm focus:border-amber-500 focus:ring-amber-500',
            suffix && 'pe-12'
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium text-gray-400">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => bump(step)}
        aria-label="زيادة"
        className="w-11 shrink-0 rounded-xl border border-gray-200 bg-white text-lg font-bold text-gray-600 active:bg-gray-100 touch-manipulation"
      >
        +
      </button>
    </div>
  )
}

/** One line of the price breakdown: label on one side, money on the other. */
export function BreakdownRow({
  label,
  value,
  hint,
  emphasis = 'normal',
}: {
  label: string
  value: string
  hint?: string
  emphasis?: 'normal' | 'muted' | 'strong' | 'total'
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-2',
        emphasis === 'total' && 'border-t border-gray-200 pt-3 mt-1'
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm',
            emphasis === 'muted' && 'text-gray-500',
            emphasis === 'normal' && 'text-gray-600',
            (emphasis === 'strong' || emphasis === 'total') && 'font-semibold text-gray-900'
          )}
        >
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{hint}</p>}
      </div>
      <p
        className={cn(
          'shrink-0 tabular-nums',
          emphasis === 'muted' && 'text-sm text-gray-500',
          emphasis === 'normal' && 'text-sm font-medium text-gray-900',
          emphasis === 'strong' && 'text-base font-bold text-gray-900',
          emphasis === 'total' && 'text-lg font-extrabold text-amber-700'
        )}
      >
        {value}
      </p>
    </div>
  )
}
