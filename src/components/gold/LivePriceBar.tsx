'use client'

import { useState } from 'react'
import { AlertTriangle, Pencil, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import { CURRENCIES } from '@/lib/gold/constants'
import { formatAgeAr, formatMoney } from '@/lib/gold/format'
import { pricePerGram } from '@/lib/gold/calculator'
import { cn } from '@/lib/utils'
import type { CurrencyCode, Karat, MarketSnapshot } from '@/lib/gold/types'
import type { GoldMarketState } from './useGoldMarket'

/**
 * The live price header that sits at the top of every gold screen.
 *
 * It is deliberately loud about where the number came from. A calculator that
 * quietly shows a three-hour-old price is worse than one that admits it, so the
 * source, the age and any staleness are always on screen.
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

  if (failed && !market) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900">تعذّر جلب سعر الذهب</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              تأكد من اتصالك بالإنترنت، أو أدخل سعر الأونصة يدوياً بالدولار من الإعدادات أدناه.
            </p>
            <button
              onClick={refresh}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white active:bg-red-700"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!market) {
    return (
      <div className="animate-pulse rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 p-5">
        <div className="h-3 w-24 rounded bg-amber-200" />
        <div className="mt-3 h-8 w-40 rounded bg-amber-200" />
        <div className="mt-2 h-3 w-32 rounded bg-amber-200" />
      </div>
    )
  }

  const perGram = pricePerGram(market, karat)
  const isManual = market.spot.source === 'manual'
  const stale = market.spot.isStale

  const commitManualSpot = () => {
    const parsed = Number(draft.replace(/[^\d.]/g, ''))
    state.setManualSpot(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
    setEditingSpot(false)
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-700 text-white shadow-lg shadow-amber-500/20">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-100">سعر جرام عيار {karat} الآن</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums">
              {formatMoney(perGram, market.currency)}
            </p>
            <p className="mt-1 text-xs text-amber-100 tabular-nums">
              الأونصة: ${market.spot.usdPerOunce.toFixed(2)}
            </p>
          </div>

          <button
            onClick={refresh}
            disabled={refreshing || loading}
            aria-label="تحديث السعر"
            className="rounded-xl bg-white/15 p-2.5 backdrop-blur active:bg-white/25 disabled:opacity-60"
          >
            <RefreshCw className={cn('h-5 w-5', (refreshing || loading) && 'animate-spin')} />
          </button>
        </div>

        {/* Provenance: which source, how old, and whether to trust it. */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur',
              stale ? 'bg-red-900/40 text-red-50' : 'bg-white/15 text-amber-50'
            )}
          >
            {stale ? <AlertTriangle className="h-3 w-3" /> : <Wifi className="h-3 w-3" />}
            {isManual ? 'سعر يدوي' : market.spot.sourceLabelAr}
          </span>
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-amber-50 backdrop-blur">
            {formatAgeAr(market.spot.fetchedAt)}
          </span>
          {stale && (
            <span className="text-[11px] font-medium text-red-100">
              السعر قديم — اضغط تحديث
            </span>
          )}
        </div>
      </div>

      {/* Currency + manual override */}
      <div className="flex items-center gap-2 border-t border-white/15 bg-black/10 px-4 py-2.5">
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
          aria-label="العملة"
          className="rounded-lg border-0 bg-white/15 py-1 pe-7 ps-2 text-xs font-semibold text-white backdrop-blur focus:ring-2 focus:ring-white/40 [&>option]:text-gray-900"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.labelAr}
            </option>
          ))}
        </select>

        {editingSpot ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="سعر الأونصة بالدولار"
              className="min-w-0 flex-1 rounded-lg border-0 bg-white/20 py-1 px-2 text-xs font-semibold text-white placeholder:text-amber-100/70 focus:ring-2 focus:ring-white/40"
            />
            <button
              onClick={commitManualSpot}
              className="rounded-lg bg-white/25 px-2.5 py-1 text-xs font-bold active:bg-white/35"
            >
              حفظ
            </button>
            <button
              onClick={() => {
                state.setManualSpot(null)
                setEditingSpot(false)
              }}
              className="px-1.5 text-xs font-medium text-amber-100"
            >
              إلغاء
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setDraft(String(Math.round(market.spot.usdPerOunce)))
              setEditingSpot(true)
            }}
            className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-50 active:bg-white/15"
          >
            <Pencil className="h-3 w-3" />
            {isManual ? 'تعديل السعر اليدوي' : 'إدخال السعر يدوياً'}
          </button>
        )}
      </div>
    </div>
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
          <button
            key={k}
            type="button"
            onClick={() => onSelect?.(k)}
            disabled={!onSelect}
            className={cn(
              'rounded-xl border p-3 text-start transition-colors',
              active
                ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500'
                : 'border-gray-200 bg-white',
              onSelect && 'active:bg-gray-50'
            )}
          >
            <p className="text-xs font-semibold text-gray-500">عيار {k}</p>
            <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">
              {formatMoney(pricePerGram(market, k), market.currency)}
            </p>
          </button>
        )
      })}
    </div>
  )
}
