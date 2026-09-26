'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { TAP } from './motion'

/** Weights people actually buy, as one-tap chips. */
const PRESETS = [5, 10, 15, 20, 30, 50]

/** The slider covers the everyday range; heavier pieces are typed in. */
const SLIDER_MAX = 60

/**
 * Weight, as something you drag rather than type.
 *
 * Weight is the one input that moves the price most, and the one people are
 * least sure about — "about fifteen grams, maybe twenty". A slider answers
 * that uncertainty properly: you sweep it and watch the total move, which
 * turns a guess into a feel for the range. Typing is still there for a scale
 * reading you want entered exactly.
 *
 * A short pulse of haptic feedback on each whole gram gives the drag detents
 * it would otherwise lack on glass.
 */
export default function WeightPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (grams: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const [lastTick, setLastTick] = useState(Math.round(value))

  const commit = (grams: number) => {
    const safe = Math.max(0, Math.min(10000, Math.round(grams * 10) / 10))
    onChange(safe)
  }

  const slide = (raw: number) => {
    const tick = Math.round(raw)
    if (tick !== lastTick) {
      setLastTick(tick)
      tapFeedback('light')
    }
    setDraft(null)
    commit(raw)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          aria-label="الوزن بالجرام"
          value={draft ?? String(value)}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.]/g, '')
            setDraft(raw)
            const parsed = Number(raw)
            if (raw !== '' && !Number.isNaN(parsed)) commit(parsed)
          }}
          onBlur={() => setDraft(null)}
          className="w-32 border-0 border-b-2 border-amber-300 bg-transparent p-0 text-center text-4xl font-extrabold tabular-nums text-gray-900 focus:border-amber-500 focus:ring-0"
        />
        <span className="pb-1.5 text-base font-bold text-gray-400">جم</span>
      </div>

      <input
        type="range"
        min={0}
        max={SLIDER_MAX}
        step={0.5}
        value={Math.min(value, SLIDER_MAX)}
        onChange={(e) => slide(Number(e.target.value))}
        aria-label="اسحب لتغيير الوزن"
        className="weight-range w-full"
      />

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 scrollbar-none">
        {PRESETS.map((preset) => {
          const active = value === preset
          return (
            <motion.button
              key={preset}
              type="button"
              whileTap={TAP}
              onClick={() => {
                tapFeedback('light')
                setDraft(null)
                commit(preset)
              }}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold tabular-nums transition-colors touch-manipulation',
                active ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              )}
            >
              <bdi>{preset} جم</bdi>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
