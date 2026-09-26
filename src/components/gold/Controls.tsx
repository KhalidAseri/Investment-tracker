'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown } from 'lucide-react'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { collapse, SPRING, TAP } from './motion'
import PieceIcon from './PieceIcon'
import type { PieceType, PieceTypeId } from '@/lib/gold/types'

/** Label + hint wrapper so every input in the calculator lines up the same way. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <label className="block text-sm font-bold text-gray-800">{label}</label>
      {children}
      {/* The hint changes as the selection changes, so it cross-fades rather
          than snapping — otherwise it reads as a flicker under the control. */}
      <AnimatePresence mode="wait" initial={false}>
        {hint && (
          <motion.p
            key={String(hint)}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18 }}
            className="text-xs leading-relaxed text-gray-500"
          >
            {hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

export interface SegmentOption<T extends string | number> {
  value: T
  label: string
  sublabel?: string
}

/**
 * Horizontal pill picker.
 *
 * The selected state is a single element that slides between options
 * (`layoutId`) rather than a colour that blinks on and off. That movement is
 * what tells the eye *which* option it came from — with seven karats in a row,
 * a static highlight leaves the user hunting for what just changed.
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
  // Scopes the sliding pill to this picker, so two Segmenteds on one screen
  // don't animate into each other.
  const groupId = useId()

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <motion.button
            key={String(opt.value)}
            type="button"
            whileTap={TAP}
            onClick={() => {
              if (!active) tapFeedback('light')
              onChange(opt.value)
            }}
            aria-pressed={active}
            className={cn(
              'relative flex shrink-0 flex-col items-center justify-center rounded-xl font-semibold touch-manipulation',
              size === 'sm' ? 'min-w-[74px] px-3 py-2 text-xs' : 'min-w-[86px] px-4 py-2.5 text-sm',
              active ? 'text-amber-950' : 'text-gray-600'
            )}
          >
            {active && (
              <motion.span
                layoutId={`segment-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-gradient-to-b from-amber-100 to-amber-200 ring-2 ring-amber-500"
              />
            )}
            {!active && (
              <span className="absolute inset-0 rounded-xl border border-gray-200 bg-white" />
            )}
            <span className="relative">{opt.label}</span>
            {opt.sublabel && (
              <span
                className={cn(
                  'relative mt-0.5 text-[10px] font-medium',
                  active ? 'text-amber-800' : 'text-gray-400'
                )}
              >
                {opt.sublabel}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * Piece picker as a visual grid.
 *
 * This replaced a fourteen-item dropdown. A dropdown hides every option but one
 * and gives no sense of which pieces are cheap to make — the thing the shopper
 * is actually deciding. Laid out as shapes with their making charge on the
 * face, the trade-off is visible before a single tap.
 */
export function PieceGrid({
  pieces,
  value,
  onChange,
  costLabel,
}: {
  pieces: PieceType[]
  value: PieceTypeId
  onChange: (value: PieceTypeId) => void
  /** Short making-charge tag rendered under each piece, e.g. "٢٥ ر.س/جم". */
  costLabel: (piece: PieceType) => string
}) {
  const groupId = useId()

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {pieces.map((piece) => {
        const active = piece.id === value
        return (
          <motion.button
            key={piece.id}
            type="button"
            whileTap={TAP}
            onClick={() => {
              if (!active) tapFeedback('light')
              onChange(piece.id)
            }}
            aria-pressed={active}
            className={cn(
              'relative flex flex-col items-center gap-1 rounded-2xl px-1.5 py-3 text-center touch-manipulation',
              active ? 'text-amber-950' : 'text-gray-600'
            )}
          >
            {active && (
              <motion.span
                layoutId={`piece-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-2xl bg-gradient-to-b from-amber-100 to-amber-200 ring-2 ring-amber-500"
              />
            )}
            {!active && (
              <span className="absolute inset-0 rounded-2xl border border-gray-200 bg-white" />
            )}

            <PieceIcon
              piece={piece.id}
              className={cn('relative h-7 w-7', active ? 'text-amber-700' : 'text-gray-400')}
            />
            <span className="relative text-[11px] font-bold leading-tight">{piece.labelAr}</span>
            <bdi
              className={cn(
                'relative text-[9.5px] font-medium tabular-nums',
                active ? 'text-amber-800' : 'text-gray-400'
              )}
            >
              {costLabel(piece)}
            </bdi>
          </motion.button>
        )
      })}
    </div>
  )
}

/** Plain dropdown, kept where the option list is long and purely nominal. */
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
      onChange={(e) => {
        tapFeedback('light')
        onChange(e.target.value as T)
      }}
      className="w-full rounded-xl border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-900 shadow-sm focus:border-amber-500 focus:ring-amber-500"
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
 * Numeric input with steppers and optional one-tap presets.
 *
 * Holding its own draft string matters: without it, clearing the box or typing
 * "12." snaps the value back mid-keystroke and the field fights the user.
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
  presets,
}: {
  value: number | null
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric'
  /** Common values offered as chips, e.g. typical gram weights. */
  presets?: number[]
}) {
  const [draft, setDraft] = useState<string | null>(null)

  const clamp = (n: number) => {
    let out = n
    if (min !== undefined) out = Math.max(min, out)
    if (max !== undefined) out = Math.min(max, out)
    // Kill float dust from repeated 0.1 steps.
    return Math.round(out * 1000) / 1000
  }

  const bump = (delta: number) => {
    tapFeedback('light')
    setDraft(null)
    onChange(clamp((value ?? 0) + delta))
  }

  const shown = draft ?? (value === null || Number.isNaN(value) ? '' : String(value))

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        {/* Numbers read left-to-right even here, so the stepper keeps the
            universal order: − on the left, + on the right. Under dir="rtl"
            that means the plus button comes first in the markup. */}
        <motion.button
          type="button"
          whileTap={TAP}
          onClick={() => bump(step)}
          aria-label="زيادة"
          className="w-12 shrink-0 rounded-xl border border-gray-200 bg-white text-xl font-bold text-gray-600 active:bg-gray-100 touch-manipulation"
        >
          +
        </motion.button>

        <div className="relative flex-1">
          <input
            type="text"
            inputMode={inputMode}
            value={shown}
            placeholder={placeholder}
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, '')
              setDraft(raw)
              const parsed = Number(raw)
              onChange(raw === '' || Number.isNaN(parsed) ? 0 : parsed)
            }}
            onBlur={(e) => {
              setDraft(null)
              const parsed = Number(e.target.value.replace(/[^\d.]/g, ''))
              onChange(Number.isNaN(parsed) ? min ?? 0 : clamp(parsed))
            }}
            className={cn(
              'w-full rounded-xl border-gray-200 py-2.5 text-center text-lg font-extrabold tabular-nums text-gray-900 shadow-sm focus:border-amber-500 focus:ring-amber-500',
              suffix && 'pe-12'
            )}
          />
          {suffix && (
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-semibold text-gray-400">
              {suffix}
            </span>
          )}
        </div>

        <motion.button
          type="button"
          whileTap={TAP}
          onClick={() => bump(-step)}
          aria-label="إنقاص"
          className="w-12 shrink-0 rounded-xl border border-gray-200 bg-white text-xl font-bold text-gray-600 active:bg-gray-100 touch-manipulation"
        >
          −
        </motion.button>

      </div>

      {presets && presets.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
          {presets.map((preset) => {
            const active = value === preset
            return (
              <motion.button
                key={preset}
                type="button"
                whileTap={TAP}
                onClick={() => {
                  tapFeedback('light')
                  setDraft(null)
                  onChange(preset)
                }}
                className={cn(
                  'shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold tabular-nums transition-colors touch-manipulation',
                  active
                    ? 'bg-amber-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                )}
              >
                <bdi>
                  {preset}
                  {suffix ? ` ${suffix}` : ''}
                </bdi>
              </motion.button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Checkbox styled as a switch-ish chip, used for the VAT toggles. */
export function ToggleChip({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <motion.button
      type="button"
      whileTap={TAP}
      role="switch"
      aria-checked={checked}
      onClick={() => {
        tapFeedback('light')
        onChange(!checked)
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors touch-manipulation',
        checked
          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
          : 'bg-gray-100 text-gray-500 ring-1 ring-transparent'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-md transition-colors',
          checked ? 'bg-amber-600 text-white' : 'bg-white ring-1 ring-gray-300'
        )}
      >
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Check className="h-3 w-3" strokeWidth={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {label}
    </motion.button>
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
  /** Pre-formatted, or an <AnimatedNumber> when the figure should count. */
  value: React.ReactNode
  hint?: string
  emphasis?: 'normal' | 'muted' | 'strong' | 'total'
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 py-2.5',
        emphasis === 'total' && 'mt-1 border-t-2 border-amber-200 pt-3'
      )}
    >
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm',
            emphasis === 'muted' && 'text-gray-500',
            emphasis === 'normal' && 'text-gray-600',
            (emphasis === 'strong' || emphasis === 'total') && 'font-bold text-gray-900'
          )}
        >
          {label}
        </p>
        {hint && <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{hint}</p>}
      </div>
      {/* <bdi> so a figure, its sign and its currency keep their own
          left-to-right order inside the surrounding Arabic text — without it
          "− 88.19 ر.س" is reordered into nonsense. */}
      <bdi
        className={cn(
          'shrink-0 tabular-nums',
          emphasis === 'muted' && 'text-sm text-gray-500',
          emphasis === 'normal' && 'text-sm font-semibold text-gray-900',
          emphasis === 'strong' && 'text-base font-bold text-gray-900',
          emphasis === 'total' && 'text-xl font-extrabold text-amber-700'
        )}
      >
        {value}
      </bdi>
    </div>
  )
}

/** Disclosure that actually animates its height open and shut. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        onClick={() => {
          tapFeedback('light')
          setOpen((v) => !v)
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-start"
      >
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING}>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={collapse}
            initial="hidden"
            animate="show"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
