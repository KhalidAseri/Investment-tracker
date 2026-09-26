'use client'

import { useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { KARATS } from '@/lib/gold/constants'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import type { Karat, PieceType, PieceTypeId } from '@/lib/gold/types'
import { SPRING, TAP } from './motion'
import PieceIcon from './PieceIcon'

/*
 * Every picker in this file lays its options out in a grid that fits the
 * screen. None of them scrolls sideways.
 *
 * They used to: the karat picker was a strip wider than the phone, and so were
 * the weight presets. On a real Android WebView that cost three things — the
 * options past the edge were hidden and nothing said they existed, the
 * scroll container clipped the selected option's ring and border, and in
 * right-to-left layout the strip sometimes opened scrolled to its far end,
 * leaving an empty band where the presets should have been. A grid that fits
 * has none of those failure modes: every option is on screen, whole.
 */

/** Label over a control, with an optional note under it. */
export function Field({
  label,
  hint,
  aside,
  children,
  className,
}: {
  label: string
  hint?: React.ReactNode
  /** Right-aligned extra at the label's end — a toggle, a unit. */
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <label className="text-[13px] font-bold text-gray-800">{label}</label>
        {aside}
      </div>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-gray-500">{hint}</p>}
    </div>
  )
}

/**
 * The seven karats as one row of equal cells.
 *
 * The word "عيار" is left out of each cell because the field's own label
 * already says it; that is what lets all seven fit a 360-pixel phone at a
 * comfortable touch size, instead of four fitting and three being scrolled
 * out of sight.
 */
export function KaratGrid({
  value,
  onChange,
}: {
  value: Karat
  onChange: (karat: Karat) => void
}) {
  const groupId = useId()

  return (
    <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="العيار">
      {KARATS.map((k) => {
        const active = k.karat === value
        return (
          <motion.button
            key={k.karat}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`عيار ${k.karat}، دمغة ${k.stamp}`}
            whileTap={TAP}
            onClick={() => {
              if (!active) tapFeedback('light')
              onChange(k.karat)
            }}
            className="relative flex h-14 flex-col items-center justify-center rounded-xl touch-manipulation"
          >
            {active ? (
              <motion.span
                layoutId={`karat-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-amber-500 shadow-md shadow-amber-500/30"
              />
            ) : (
              <span className="absolute inset-0 rounded-xl border border-gray-200 bg-white" />
            )}
            <span
              className={cn(
                'relative text-base font-extrabold leading-none',
                active ? 'text-white' : 'text-gray-800'
              )}
            >
              {k.karat}
            </span>
            <span
              className={cn(
                'relative mt-1 text-[9px] font-semibold leading-none tabular-nums',
                active ? 'text-amber-50' : 'text-gray-400'
              )}
            >
              {k.stamp}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

/**
 * Piece picker as a grid of silhouettes, four across.
 *
 * Each tile carries its own making charge, so the trade-off the shopper is
 * actually weighing — a مرتعشة costs three times the workmanship of a دبلة —
 * is visible before a single tap.
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
  /** Short making-charge tag rendered under each piece, e.g. "22/جم". */
  costLabel: (piece: PieceType) => string
}) {
  const groupId = useId()

  return (
    <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="نوع القطعة">
      {pieces.map((piece) => {
        const active = piece.id === value
        return (
          <motion.button
            key={piece.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={piece.labelAr}
            whileTap={TAP}
            onClick={() => {
              if (!active) tapFeedback('light')
              onChange(piece.id)
            }}
            className="relative flex flex-col items-center gap-1 rounded-xl px-1 pb-2 pt-2.5 text-center touch-manipulation"
          >
            {active ? (
              <motion.span
                layoutId={`piece-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-amber-50 ring-2 ring-inset ring-amber-500"
              />
            ) : (
              <span className="absolute inset-0 rounded-xl border border-gray-200 bg-white" />
            )}

            <motion.span
              className="relative"
              animate={active ? { scale: [1, 1.18, 1], rotate: [0, -8, 0] } : { scale: 1, rotate: 0 }}
              transition={{ duration: 0.35 }}
            >
              <PieceIcon
                piece={piece.id}
                className={cn('h-6 w-6', active ? 'text-amber-600' : 'text-gray-400')}
              />
            </motion.span>
            <span
              className={cn(
                'relative text-[11px] font-bold leading-tight',
                active ? 'text-amber-900' : 'text-gray-700'
              )}
            >
              {piece.shortLabelAr ?? piece.labelAr}
            </span>
            <bdi
              className={cn(
                'relative text-[9.5px] font-semibold tabular-nums leading-none',
                active ? 'text-amber-700' : 'text-gray-400'
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
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => {
        tapFeedback('light')
        onChange(e.target.value as T)
      }}
      className="h-12 w-full rounded-xl border-gray-200 bg-white text-sm font-bold text-gray-900 shadow-sm focus:border-amber-500 focus:ring-amber-500"
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
 * A money amount, typed.
 *
 * These used to have − and + buttons that stepped by 50 or 100. Nobody gets
 * from 0 to 5,450 riyals by tapping plus fifty-four times, so the steppers
 * were two big targets that did nothing useful while crowding the field. What
 * a price field needs is a large number, the numeric keyboard, and a unit.
 */
export function MoneyInput({
  value,
  onChange,
  unit,
  placeholder = '0',
  label,
}: {
  value: number
  onChange: (value: number) => void
  unit?: string
  placeholder?: string
  label?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value > 0 ? String(value) : '')

  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={shown}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, '')
          setDraft(raw)
          const parsed = Number(raw)
          onChange(raw === '' || Number.isNaN(parsed) ? 0 : parsed)
        }}
        onBlur={() => setDraft(null)}
        className="h-14 w-full rounded-xl border-gray-200 pe-14 ps-4 text-start text-2xl font-extrabold tabular-nums text-gray-900 shadow-sm placeholder:text-gray-300 focus:border-amber-500 focus:ring-amber-500"
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-sm font-bold text-gray-400">
          {unit}
        </span>
      )}
    </div>
  )
}

/** A small switch-like chip for yes/no settings. */
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
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors touch-manipulation',
        checked ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-500'
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded transition-colors',
          checked ? 'bg-amber-600 text-white' : 'bg-white ring-1 ring-gray-300'
        )}
      >
        <AnimatePresence initial={false}>
          {checked && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ duration: 0.12 }}
            >
              <Check className="h-3 w-3" strokeWidth={4} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      {label}
    </motion.button>
  )
}

/** Two or three mutually exclusive options as equal halves of one control. */
export function SegmentSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string }> }[]
  value: T
  onChange: (value: T) => void
}) {
  const groupId = useId()

  return (
    <div
      className="grid gap-1 rounded-2xl bg-gray-200/70 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <motion.button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            whileTap={TAP}
            onClick={() => {
              if (!active) tapFeedback('medium')
              onChange(opt.value)
            }}
            className={cn(
              'relative flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-extrabold touch-manipulation',
              active ? 'text-gray-900' : 'text-gray-500'
            )}
          >
            {active && (
              <motion.span
                layoutId={`switch-${groupId}`}
                transition={SPRING}
                className="absolute inset-0 rounded-xl bg-white shadow-sm"
              />
            )}
            {Icon && <Icon className="relative h-4 w-4" />}
            <span className="relative">{opt.label}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
