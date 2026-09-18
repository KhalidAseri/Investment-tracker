'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCurrency } from '@/lib/gold/constants'
import { fetchFx, fetchSpot, getCachedSpot, manualSpot } from '@/lib/gold/price-client'
import { getPrefs, savePrefs } from '@/lib/gold/storage'
import type { CurrencyCode, FxRate, MarketSnapshot, SpotPrice } from '@/lib/gold/types'

export interface GoldMarketState {
  market: MarketSnapshot | null
  loading: boolean
  /** True when no source answered and we have nothing cached either. */
  failed: boolean
  currency: CurrencyCode
  setCurrency: (code: CurrencyCode) => void
  /** User-entered spot price in USD/oz; overrides the live feed when set. */
  manualSpotUsdPerOunce: number | null
  setManualSpot: (value: number | null) => void
  refresh: () => void
  refreshing: boolean
}

/**
 * Loads live spot gold + FX and keeps them in sync with the user's currency
 * choice. Renders a usable state as fast as possible: the cached price shows
 * immediately (flagged stale if old) while the network request is still in
 * flight, so the calculator is never blank.
 */
export function useGoldMarket(): GoldMarketState {
  const [currency, setCurrencyState] = useState<CurrencyCode>('SAR')
  const [spot, setSpot] = useState<SpotPrice | null>(null)
  const [fx, setFx] = useState<FxRate | null>(null)
  const [manualSpotValue, setManualSpotValue] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [failed, setFailed] = useState(false)

  // Restore saved preferences, then paint the cached price straight away.
  useEffect(() => {
    const prefs = getPrefs()
    setCurrencyState(prefs.currency)
    setManualSpotValue(prefs.manualSpotUsdPerOunce)
    const cached = getCachedSpot()
    if (cached) setSpot(cached)
  }, [])

  const load = useCallback(
    async (code: CurrencyCode, force: boolean) => {
      const [nextSpot, nextFx] = await Promise.all([fetchSpot(force), fetchFx(code, force)])
      setFx(nextFx)
      if (nextSpot) {
        setSpot(nextSpot)
        setFailed(false)
      } else {
        setFailed(true)
      }
    },
    []
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load(currency, false).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [currency, load])

  const refresh = useCallback(() => {
    setRefreshing(true)
    load(currency, true).finally(() => setRefreshing(false))
  }, [currency, load])

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code)
    savePrefs({ currency: code })
  }, [])

  const setManualSpot = useCallback((value: number | null) => {
    setManualSpotValue(value)
    savePrefs({ manualSpotUsdPerOunce: value })
  }, [])

  const effectiveSpot =
    manualSpotValue !== null && manualSpotValue > 0 ? manualSpot(manualSpotValue) : spot

  const market: MarketSnapshot | null =
    effectiveSpot && fx
      ? { spot: effectiveSpot, fx, currency: getCurrency(currency) }
      : null

  return {
    market,
    loading,
    failed: failed && !effectiveSpot,
    currency,
    setCurrency,
    manualSpotUsdPerOunce: manualSpotValue,
    setManualSpot,
    refresh,
    refreshing,
  }
}
