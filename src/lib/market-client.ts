// Client-side market data fetching with localStorage cache
// Uses Yahoo Finance chart API via CORS proxy

export interface MarketQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  previousClose: number
  currency: string
  name: string
  updatedAt: string
  isStale: boolean
}

const CACHE_KEY = 'investtrack_market_cache'
const CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes

function getCache(): Record<string, MarketQuote> {
  if (typeof window === 'undefined') return {}
  try {
    const data = localStorage.getItem(CACHE_KEY)
    return data ? JSON.parse(data) : {}
  } catch {
    return {}
  }
}

function setCache(cache: Record<string, MarketQuote>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage full, clear old cache
    localStorage.removeItem(CACHE_KEY)
  }
}

export function getCachedQuote(symbol: string): MarketQuote | null {
  const cache = getCache()
  const cached = cache[symbol]
  if (!cached) return null

  const age = Date.now() - new Date(cached.updatedAt).getTime()
  return { ...cached, isStale: age > CACHE_TTL_MS }
}

export async function fetchQuote(symbol: string): Promise<MarketQuote | null> {
  // Check cache first
  const cached = getCachedQuote(symbol)
  if (cached && !cached.isStale) return cached

  try {
    // Try Yahoo Finance chart API via CORS proxy
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahooUrl)}`

    const response = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = await response.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error('No data')

    const meta = result.meta
    const price = meta.regularMarketPrice ?? 0
    const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? price
    const change = price - previousClose
    const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0

    const quote: MarketQuote = {
      symbol,
      price,
      change,
      changePercent,
      previousClose,
      currency: meta.currency ?? 'USD',
      name: meta.shortName ?? meta.longName ?? symbol,
      updatedAt: new Date().toISOString(),
      isStale: false,
    }

    // Save to cache
    const cache = getCache()
    cache[symbol] = quote
    setCache(cache)

    return quote
  } catch {
    // Return stale cache as fallback
    if (cached) return { ...cached, isStale: true }
    return null
  }
}

export async function fetchQuotes(symbols: string[]): Promise<Record<string, MarketQuote>> {
  const results: Record<string, MarketQuote> = {}
  const unique = Array.from(new Set(symbols.filter(Boolean)))

  // Fetch in parallel with concurrency limit of 3
  const batchSize = 3
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize)
    const promises = batch.map(async (symbol) => {
      const quote = await fetchQuote(symbol)
      if (quote) results[symbol] = quote
    })
    await Promise.all(promises)
  }

  return results
}

export function clearMarketCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(CACHE_KEY)
}
