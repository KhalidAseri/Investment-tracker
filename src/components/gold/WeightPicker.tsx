'use client'

import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { TAP } from './motion'

/** Weights people actually buy, as one-tap chips. */
const PRESETS = [5, 10, 15, 20, 30, 50]

/** The slider covers the everyday range; heavier pieces are typed in. */
const SLIDER_MAX = 60

/**
 * Weight, typed exactly or dragged roughly.
 *
 * Weight moves the total more than anything else, and it is the input people
 * are least sure of — "about fifteen grams". Dragging answers that: sweep the
 * handle and watch the piece's price move with it. A scale reading can still
 * be typed in exactly, and the common weights are one tap away.
 *
 * The presets are a six-column grid, not a strip that scrolls. On the Android
 * WebView the scrolling strip sometimes opened at its far end in right-to-left
 * layout and showed nothing at all.
 *
 * Each whole gram crossed while dragging gives a light haptic tick, which is
 * what makes the slider feel like it has detents rather than sliding on glass.
 */
export default function WeightPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (grams: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const lastTick = useRef(Math.round(value))

  const commit = (grams: number) => {
    onChange(Math.max(0, Math.min(10000, Math.round(grams * 10) / 10)))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative w-28 shrink-0">
          <input
            type="text"
            inputMode="decimal"
            aria-label="الوزن بالجرام"
            value={draft ?? (value > 0 ? String(value) : '')}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.replace(/[^\d.]/g, '')
              setDraft(raw)
              const parsed = Number(raw)
              commit(raw === '' || Number.isNaN(parsed) ? 0 : parsed)
            }}
            onBlur={() => setDraft(null)}
            className="h-14 w-full rounded-xl border-gray-200 pe-10 ps-3 text-center text-2xl font-extrabold tabular-nums text-gray-900 shadow-sm placeholder:text-gray-300 focus:border-amber-500 focus:ring-amber-500"
          />
          <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-bold text-gray-400">
            جم
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={SLIDER_MAX}
          step={0.5}
          value={Math.min(value, SLIDER_MAX)}
          onChange={(e) => {
            const raw = Number(e.target.value)
            const tick = Math.round(raw)
            if (tick !== lastTick.current) {
              lastTick.current = tick
              tapFeedback('light')
            }
            setDraft(null)
            commit(raw)
          }}
          aria-label="اسحب لتغيير الوزن"
          className="weight-range min-w-0 flex-1"
        />
      </div>

      <div className="grid grid-cols-6 gap-1.5">
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
                lastTick.current = preset
                commit(preset)
              }}
              className={cn(
                'h-9 rounded-lg text-xs font-bold tabular-nums transition-colors touch-manipulation',
                active
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200'
              )}
            >
              {preset}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
