/**
 * A year of daily gold prices, for the market chart and the forecast.
 *
 * Same constraints as the live price in `price-client.ts`: the app has no
 * server, so every source must be free, keyless and CORS-open, and the result
 * is cached on the device so the chart still draws offline.
 *
 * Sources, in order:
 *  1. CoinGecko's PAXG market chart — one request, a point per day for the
 *     last 365 days. PAXG is redeemable for a troy ounce of London gold and
 *     trades within a fraction of a percent of spot.
 *  2. The fawazahmed0 currency API's dated snapshots, which carry XAU. One file
 *     per day, so only a point a week is fetched — 53 small requests, enough
 *     for a chart and a volatility estimate when the first source is down.
 */

export interface HistoryPoint {
  /** Milliseconds since epoch. */
  t: number
  /** USD per troy ounce. */
  usd: number
}

export interface PriceHistory {
  points: HistoryPoint[]
  source: string
  sourceLabelAr: string
  fetchedAt: string
  isStale: boolean
}

const CACHE_KEY = 'gold_history_cache'
/** Daily data; refreshing a few times a day keeps "today" current. */
const TTL_MS = 3 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 12000

export const DAY_MS = 24 * 60 * 60 * 1000

const MIN_PLAUSIBLE = 200
const MAX_PLAUSIBLE = 100_000

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/**
 * Sorted, one point per calendar day (the latest reading of the day wins),
 * implausible values dropped. Every source goes through this so the maths
 * downstream can rely on a clean, increasing series.
 */
export function cleanSeries(raw: HistoryPoint[]): HistoryPoint[] {
  const byDay = new Map<number, HistoryPoint>()
  for (const p of raw) {
    if (!Number.isFinite(p.t) || !Number.isFinite(p.usd)) continue
    if (p.usd < MIN_PLAUSIBLE || p.usd > MAX_PLAUSIBLE) continue
    const day = Math.floor(p.t / DAY_MS)
    const prev = byDay.get(day)
    if (!prev || p.t >= prev.t) byDay.set(day, p)
  }
  return Array.from(byDay.values()).sort((a, b) => a.t - b.t)
}

interface HistorySource {
  id: string
  labelAr: string
  fetch: () => Promise<HistoryPoint[]>
}

function isoDay(t: number): string {
  return new Date(t).toISOString().slice(0, 10)
}

const SOURCES: HistorySource[] = [
  {
    id: 'coingecko-paxg',
    labelAr: 'CoinGecko (PAXG) — يومي',
    // { prices: [[ms, usd], ...] }
    fetch: async () => {
      const data = await getJson(
        'https://api.coingecko.com/api/v3/coins/pax-gold/market_chart?vs_currency=usd&days=365&interval=daily'
      )
      const prices: unknown = data?.prices
      if (!Array.isArray(prices)) throw new Error('no prices')
      return prices.map((row: any) => ({ t: Number(row?.[0]), usd: Number(row?.[1]) }))
    },
  },
  {
    id: 'currency-api',
    labelAr: 'Currency API — أسبوعي',
    // { date: "2025-10-03", xau: { usd: 3857.17, ... } } — units of USD per XAU.
    fetch: async () => {
      const now = Date.now()
      const dates = ['latest']
      for (let d = 7; d <= 364; d += 7) dates.push(isoDay(now - d * DAY_MS))

      const results: HistoryPoint[] = []
      // A handful at a time: 53 parallel requests on a phone signal is rude.
      for (let i = 0; i < dates.length; i += 8) {
        const batch = dates.slice(i, i + 8)
        const settled = await Promise.allSettled(
          batch.map((date) =>
            getJson(
              `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/xau.min.json`
            )
          )
        )
        for (const r of settled) {
          if (r.status !== 'fulfilled') continue
          const usd = Number(r.value?.xau?.usd)
          const t = Date.parse(`${r.value?.date}T12:00:00Z`)
          results.push({ t, usd })
        }
      }
      return results
    },
  },
]

/** A usable year needs a reasonable number of points spanning most of it. */
function isUsable(points: HistoryPoint[]): boolean {
  if (points.length < 30) return false
  return points[points.length - 1].t - points[0].t > 180 * DAY_MS
}

function readCache(): PriceHistory | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PriceHistory
    const points = cleanSeries(parsed.points ?? [])
    if (!isUsable(points)) return null
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    return { ...parsed, points, isStale: !(age <= TTL_MS) }
  } catch {
    return null
  }
}

function writeCache(history: PriceHistory): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(history))
  } catch {
    // No offline copy, but the chart still works while online.
  }
}

export function getCachedHistory(): PriceHistory | null {
  return readCache()
}

export async function fetchHistory(force = false): Promise<PriceHistory | null> {
  const cached = readCache()
  if (!force && cached && !cached.isStale) return cached

  for (const source of SOURCES) {
    try {
      const points = cleanSeries(await source.fetch())
      if (!isUsable(points)) continue
      const history: PriceHistory = {
        points,
        source: source.id,
        sourceLabelAr: source.labelAr,
        fetchedAt: new Date().toISOString(),
        isStale: false,
      }
      writeCache(history)
      return history
    } catch {
      // Next source.
    }
  }

  return cached ? { ...cached, isStale: true } : null
}
