'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowDown, ArrowUp, Pencil, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { CURRENCIES } from '@/lib/gold/constants'
import { formatAgeAr, formatMoney } from '@/lib/gold/format'
import { pricePerGram } from '@/lib/gold/calculator'
import { tapFeedback } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import type { CurrencyCode, Karat, MarketSnapshot } from '@/lib/gold/types'
import AnimatedNumber from './AnimatedNumber'
import { SPRING, TAP } from './motion'
import type { GoldMarketState } from './useGoldMarket'

/**
 * The live price header that sits at the top of every screen.
 *
 * It is deliberately loud about where the number came from. A calculator that
 * quietly shows a three-hour-old price is worse than one that admits it, so the
 * source, the age and any staleness are always on screen.
 *
 * The gold sheen that crosses it is the one purely decorative animation in the
 * app, and it earns its place: this bar is the only surface showing a number
 * that moves on its own, and the sheen is what marks it as live.
 */
export default function LivePriceBar({
  state,
  karat,
}: {
  state: GoldMarketState
  karat: Karat
}) {
  const [editingSpot, setEditingSpot] = useState(false)
  const [draft, setDraft] = useState('')

  const { market, loading, failed, refreshing, refresh, currency, setCurrency } = state

  const perGram = market ? pricePerGram(market, karat) : 0

  // Direction of the last change, so a refresh that moves the price says which
  // way it went rather than just silently redrawing.
  const [direction, setDirection] = useState<'up' | 'down' | null>(null)
  const lastPerGram = useRef<number | null>(null)
  useEffect(() => {
    if (!market || perGram <= 0) return
    const previous = lastPerGram.current
    lastPerGram.current = perGram
    if (previous === null || Math.abs(perGram - previous) < 0.005) return
    setDirection(perGram > previous ? 'up' : 'down')
    const timer = setTimeout(() => setDirection(null), 4000)
    return () => clearTimeout(timer)
  }, [perGram, market])

  if (failed && !market) {
    return (
      <motion.div
        initial={{ y: 8 }}
        animate={{ y: 0 }}
        className="rounded-2xl border border-red-200 bg-red-50 p-4"
      >
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-bold text-red-900">تعذّر جلب سعر الذهب</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              تأكد من اتصالك بالإنترنت، أو أدخل سعر الأونصة يدوياً بالدولار من الزر أدناه.
            </p>
            <motion.button
              whileTap={TAP}
              onClick={refresh}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white active:bg-red-700"
            >
              إعادة المحاولة
            </motion.button>
          </div>
        </div>
      </motion.div>
    )
  }

  if (!market) {
    return (
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-28 rounded bg-white/30" />
          <div className="h-9 w-44 rounded bg-white/40" />
          <div className="h-3 w-32 rounded bg-white/30" />
        </div>
      </div>
    )
  }

  const isManual = market.spot.source === 'manual'
  const stale = market.spot.isStale

  const commitManualSpot = () => {
    const parsed = Number(draft.replace(/[^\d.]/g, ''))
    state.setManualSpot(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
    setEditingSpot(false)
  }

  return (
    <motion.div
      initial={{ y: -10 }}
      animate={{ y: 0 }}
      transition={SPRING}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-700 text-white shadow-lg shadow-amber-600/25"
    >
      {/* Slow sheen travelling across the metal. Purely CSS so it costs nothing. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gold-sheen absolute inset-y-0 -inset-x-full" />
      </div>

      <div className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-100">سعر جرام عيار {karat} الآن</p>

            <div className="mt-1 flex items-baseline gap-2">
              <AnimatedNumber
                value={perGram}
                format={(v) => formatMoney(v, market.currency)}
                countOnMount
                className="text-[2rem] font-extrabold leading-tight"
              />
              <AnimatePresence>
                {direction && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.6, y: direction === 'up' ? 6 : -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className={cn(
                      'inline-flex items-center rounded-full p-1',
                      direction === 'up' ? 'bg-red-500/30' : 'bg-emerald-400/30'
                    )}
                  >
                    {direction === 'up' ? (
                      <ArrowUp className="h-3.5 w-3.5" />
                    ) : (
                      <ArrowDown className="h-3.5 w-3.5" />
                    )}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* <bdi> keeps "$4,180.00" from being reordered to "4,180.00$"
                by the surrounding right-to-left text. */}
            <p className="mt-1 text-xs text-amber-100">
              الأونصة:{' '}
              <bdi>
                <AnimatedNumber
                  value={market.spot.usdPerOunce}
                  format={(v) => `$${v.toFixed(2)}`}
                />
              </bdi>
            </p>
          </div>

          <motion.button
            whileTap={TAP}
            onClick={() => {
              tapFeedback('medium')
              refresh()
            }}
            disabled={refreshing || loading}
            aria-label="تحديث السعر"
            className="rounded-xl bg-white/15 p-2.5 backdrop-blur active:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-5 w-5', (refreshing || loading) && 'animate-spin')} />
          </motion.button>
        </div>

        {/* Provenance: which source, how old, and whether to trust it. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur',
              stale ? 'bg-red-900/40 text-red-50' : 'bg-white/15 text-amber-50'
            )}
          >
            {stale ? <AlertTriangle className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            {isManual ? 'سعر يدوي' : market.spot.sourceLabelAr}
          </span>
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-amber-50 backdrop-blur">
            {formatAgeAr(market.spot.fetchedAt)}
          </span>
          {stale && (
            <span className="text-[11px] font-semibold text-red-100">السعر قديم — اضغط تحديث</span>
          )}
        </div>
      </div>

      {/* Currency + manual override */}
      <div className="relative flex items-center gap-2 border-t border-white/15 bg-black/10 px-4 py-2.5">
        <select
          value={currency}
          onChange={(e) => {
            tapFeedback('light')
            setCurrency(e.target.value as CurrencyCode)
          }}
          aria-label="العملة"
          className="rounded-lg border-0 bg-white/15 py-1 pe-7 ps-2 text-xs font-bold text-white backdrop-blur focus:ring-2 focus:ring-white/40 [&>option]:text-gray-900"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.labelAr}
            </option>
          ))}
        </select>

        <AnimatePresence mode="wait" initial={false}>
          {editingSpot ? (
            <motion.div
              key="editing"
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="flex flex-1 items-center gap-2"
            >
              <input
                autoFocus
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="سعر الأونصة بالدولار"
                className="min-w-0 flex-1 rounded-lg border-0 bg-white/20 px-2 py-1 text-xs font-bold text-white placeholder:text-amber-100/70 focus:ring-2 focus:ring-white/40"
              />
              <motion.button
                whileTap={TAP}
                onClick={commitManualSpot}
                className="rounded-lg bg-white/25 px-2.5 py-1 text-xs font-bold active:bg-white/35"
              >
                حفظ
              </motion.button>
              <button
                onClick={() => {
                  state.setManualSpot(null)
                  setEditingSpot(false)
                }}
                className="px-1.5 text-xs font-semibold text-amber-100"
              >
                إلغاء
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              whileTap={TAP}
              onClick={() => {
                setDraft(String(Math.round(market.spot.usdPerOunce)))
                setEditingSpot(true)
              }}
              className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-50 active:bg-white/15"
            >
              <Pencil className="h-3 w-3" />
              {isManual ? 'تعديل السعر اليدوي' : 'إدخال السعر يدوياً'}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

/** Compact karat ladder — every karat priced per gram at once. */
export function PriceLadder({
  market,
  karats,
  selected,
  onSelect,
}: {
  market: MarketSnapshot
  karats: Karat[]
  selected?: Karat
  onSelect?: (karat: Karat) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {karats.map((k) => {
        const active = k === selected
        return (
          <motion.button
            key={k}
            type="button"
            whileTap={onSelect ? TAP : undefined}
            onClick={() => {
              if (!onSelect) return
              tapFeedback('light')
              onSelect(k)
            }}
            disabled={!onSelect}
            className={cn(
              'rounded-xl border p-3 text-start transition-colors',
              active ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-gray-200 bg-white',
              onSelect && 'active:bg-gray-50'
            )}
          >
            <p className="text-xs font-bold text-gray-500">عيار {k}</p>
            <AnimatedNumber
              value={pricePerGram(market, k)}
              format={(v) => formatMoney(v, market.currency)}
              className="mt-0.5 block text-base font-bold text-gray-900"
            />
          </motion.button>
        )
      })}
    </div>
  )
}
