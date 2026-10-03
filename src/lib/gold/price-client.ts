import type { CurrencyCode, FxRate, SpotPrice } from './types'
import { getCurrency } from './constants'

/**
 * Live market data for the gold calculator.
 *
 * The app is a static export served from GitHub Pages: there is no server to
 * proxy through and no place to hide an API key, so every source here has to be
 * (a) free, (b) keyless, and (c) CORS-open to an arbitrary origin. Each of the
 * endpoints below was verified to send `Access-Control-Allow-Origin: *`.
 *
 * Every lookup degrades instead of failing: live source -> next source ->
 * cached value -> (for pegged currencies) the peg itself.
 */

const SPOT_CACHE_KEY = 'gold_spot_cache'
const FX_CACHE_KEY = 'gold_fx_cache'

/** How long a quote is considered fresh. Gold moves slowly enough for 5 min. */
const SPOT_TTL_MS = 5 * 60 * 1000
/** FX sources update daily, so an hour of cache is still accurate. */
const FX_TTL_MS = 60 * 60 * 1000

const REQUEST_TIMEOUT_MS = 8000

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeCache(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable — we just lose the offline fallback.
  }
}

function ageMs(iso: string): number {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? Infinity : Date.now() - t
}

// ===== Spot gold =====

interface SpotSource {
  id: string
  labelAr: string
  fetch: () => Promise<number>
}

const SPOT_SOURCES: SpotSource[] = [
  {
    id: 'gold-api',
    labelAr: 'Gold-API (السعر الفوري)',
    // { price: 4373.79, symbol: "XAU", currency: "USD", updatedAt: "..." }
    fetch: async () => {
      const data = await getJson('https://api.gold-api.com/price/XAU')
      return Number(data?.price)
    },
  },
  {
    id: 'paxg',
    labelAr: 'PAXG عبر CoinGecko (تقديري)',
    // PAXG is a token redeemable for one troy ounce of London Good Delivery
    // gold, so it tracks spot within a fraction of a percent. Good enough as a
    // backstop, and explicitly labelled as approximate in the UI.
    fetch: async () => {
      const data = await getJson(
        'https://api.coingecko.com/api/v3/simple/price?ids=pax-gold&vs_currencies=usd'
      )
      return Number(data?.['pax-gold']?.usd)
    },
  },
]

/**
 * Sanity band for a spot quote in USD per troy ounce. A source that returns
 * milligram prices or a stray `0` should never reach the calculator — a wrong
 * price here silently corrupts every number the user sees.
 */
const MIN_PLAUSIBLE_SPOT = 200
const MAX_PLAUSIBLE_SPOT = 100_000

function isPlausibleSpot(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_SPOT &&
    value <= MAX_PLAUSIBLE_SPOT
  )
}

export function getCachedSpot(): SpotPrice | null {
  const cached = readCache<SpotPrice>(SPOT_CACHE_KEY)
  if (!cached || !isPlausibleSpot(cached.usdPerOunce)) return null
  return { ...cached, isStale: ageMs(cached.fetchedAt) > SPOT_TTL_MS }
}

/**
 * Fetch the spot gold price, trying each source in order.
 *
 * @param force skip the freshness check and re-query the network.
 */
export async function fetchSpot(force = false): Promise<SpotPrice | null> {
  const cached = getCachedSpot()
  if (!force && cached && !cached.isStale) return cached

  for (const source of SPOT_SOURCES) {
    try {
      const price = await source.fetch()
      if (!isPlausibleSpot(price)) continue

      const previous = cached?.usdPerOunce
      const spot: SpotPrice = {
        usdPerOunce: price,
        source: source.id,
        sourceLabelAr: source.labelAr,
        fetchedAt: new Date().toISOString(),
        isStale: false,
        // Compared against our own last reading, not a true previous close —
        // the free sources don't publish one. Only meaningful once we have a
        // prior sample, so it stays undefined on a cold start.
        change: previous !== undefined ? price - previous : undefined,
        changePercent:
          previous !== undefined && previous > 0
            ? ((price - previous) / previous) * 100
            : undefined,
      }
      writeCache(SPOT_CACHE_KEY, spot)
      return spot
    } catch {
      // Try the next source.
    }
  }

  // Everything failed: a stale price clearly marked as stale beats no price.
  return cached ? { ...cached, isStale: true } : null
}

// ===== FX =====

interface FxSource {
  id: string
  fetch: () => Promise<Record<string, number>>
}

const FX_SOURCES: FxSource[] = [
  {
    id: 'open-er-api',
    fetch: async () => {
      const data = await getJson('https://open.er-api.com/v6/latest/USD')
      if (data?.result !== 'success') throw new Error('result != success')
      return data.rates ?? {}
    },
  },
  {
    id: 'exchangerate-api-v4',
    fetch: async () => {
      const data = await getJson('https://api.exchangerate-api.com/v4/latest/USD')
      return data?.rates ?? {}
    },
  },
  {
    id: 'fxratesapi',
    fetch: async () => {
      const data = await getJson('https://api.fxratesapi.com/latest?base=USD')
      if (data?.success === false) throw new Error('success false')
      return data?.rates ?? {}
    },
  },
]

interface FxCache {
  rates: Record<string, number>
  source: string
  fetchedAt: string
}

/**
 * Units of `code` per 1 USD.
 *
 * Gulf currencies are hard-pegged to the dollar, so for those the peg in
 * `constants.ts` is authoritative and we never need the network at all. Only
 * the floating ones (KWD basket, EGP) actually require a live lookup.
 */
export async function fetchFx(code: CurrencyCode, force = false): Promise<FxRate> {
  const currency = getCurrency(code)

  if (currency.pegged) {
    return {
      perUsd: currency.pegPerUsd,
      source: 'peg',
      fetchedAt: new Date().toISOString(),
      isStale: false,
    }
  }

  const cached = readCache<FxCache>(FX_CACHE_KEY)
  const cachedRate = cached?.rates?.[code]
  const cacheFresh = cached ? ageMs(cached.fetchedAt) <= FX_TTL_MS : false

  if (!force && cacheFresh && typeof cachedRate === 'number' && cachedRate > 0) {
    return { perUsd: cachedRate, source: cached!.source, fetchedAt: cached!.fetchedAt, isStale: false }
  }

  for (const source of FX_SOURCES) {
    try {
      const rates = await source.fetch()
      const rate = Number(rates?.[code])
      if (!Number.isFinite(rate) || rate <= 0) continue

      const fetchedAt = new Date().toISOString()
      writeCache(FX_CACHE_KEY, { rates, source: source.id, fetchedAt } satisfies FxCache)
      return { perUsd: rate, source: source.id, fetchedAt, isStale: false }
    } catch {
      // Try the next source.
    }
  }

  if (typeof cachedRate === 'number' && cachedRate > 0) {
    return { perUsd: cachedRate, source: cached!.source, fetchedAt: cached!.fetchedAt, isStale: true }
  }

  // Last resort: the indicative rate baked into the currency table.
  return {
    perUsd: currency.pegPerUsd,
    source: 'fallback',
    fetchedAt: new Date().toISOString(),
    isStale: true,
  }
}

export function clearPriceCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SPOT_CACHE_KEY)
  localStorage.removeItem(FX_CACHE_KEY)
}

/** Build a spot reading from a price the user typed in themselves. */
export function manualSpot(usdPerOunce: number): SpotPrice {
  return {
    usdPerOunce,
    source: 'manual',
    sourceLabelAr: 'سعر يدوي (أدخلته بنفسك)',
    fetchedAt: new Date().toISOString(),
    isStale: false,
  }
}
