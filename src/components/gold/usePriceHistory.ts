'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchHistory, getCachedHistory, type PriceHistory } from '@/lib/gold/history'

/**
 * The year of prices behind the market screen. Paints the cached copy at once
 * (even if old) and replaces it when the network answers, like the live price.
 */
export function usePriceHistory() {
  const [history, setHistory] = useState<PriceHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (force: boolean) => {
    setLoading(true)
    const next = await fetchHistory(force)
    if (next) {
      setHistory(next)
      setFailed(false)
    } else {
      setFailed(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const cached = getCachedHistory()
    if (cached) setHistory(cached)
    load(false)
  }, [load])

  return { history, loading, failed, refresh: () => load(true) }
}
