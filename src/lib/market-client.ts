// Quotes and price history. The first source is the app's own price service (Supabase edge
// function invest-quotes), which fetches server-side and also serves the prices Claude records for
// funds no provider carries. Fallbacks: a direct request inside the Android app, then public CORS
// relays. Every successful quote is cached in localStorage and kept as a last-known price.

import type { Quote, Quotes } from './types.ts'

export const PRICE_SERVICE = 'https://ivicgwjratcfcbmyrnld.supabase.co/functions/v1/invest-quotes'
const CACHE_KEY = 'investtrack_quotes_v3'
const FRESH_MS = 15 * 60 * 1000
const TIMEOUT_MS = 9000

type Relay = (url: string) => { url: string; unwrap: (res: Response) => Promise<unknown> }

const RELAYS: Relay[] = [
  (u) => ({ url: `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, unwrap: (r) => r.json() }),
  (u) => ({ url: `https://api.cors.lol/?url=${encodeURIComponent(u)}`, unwrap: (r) => r.json() }),
  (u) => ({
    url: `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    unwrap: async (r) => JSON.parse((await r.json()).contents),
  }),
  (u) => ({ url: `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, unwrap: (r) => r.json() }),
]
// The relay that answered last is tried first next time.
let preferred = 0

export function loadQuoteCache(): Quotes {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function saveQuoteCache(q: Quotes): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(q))
  } catch {
    /* storage full or blocked: quotes simply are not cached */
  }
}

export function isFresh(q: Quote | undefined, now = Date.now()): boolean {
  return !!q && now - new Date(q.updatedAt).getTime() < FRESH_MS
}

function parseChart(symbol: string, data: unknown): Quote | null {
  const meta = (data as { chart?: { result?: { meta?: Record<string, unknown> }[] } })?.chart?.result?.[0]?.meta
  if (!meta) return null
  let price = Number(meta.regularMarketPrice)
  if (!(price > 0)) return null
  let prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? price)
  let currency = String(meta.currency ?? 'USD')
  // London quotes many funds in pence.
  if (currency === 'GBp' || currency === 'GBX') {
    price /= 100
    prev /= 100
    currency = 'GBP'
  }
  const change = price - prev
  return {
    symbol,
    price,
    change,
    changePercent: prev > 0 ? (change / prev) * 100 : 0,
    currency,
    name: String(meta.shortName ?? meta.longName ?? symbol),
    updatedAt: new Date().toISOString(),
  }
}

/** Inside the Android app requests leave through the system, not the WebView, so no CORS relay is needed. */
function isNativeApp(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
}

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  if (isNativeApp()) {
    for (const host of ['query1', 'query2']) {
      try {
        const res = await fetch(target.replace('query1', host), { signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!res.ok) continue
        const quote = parseChart(symbol, await res.json())
        if (quote) return quote
      } catch {
        /* try the other host, then fall through to the relays */
      }
    }
  }
  for (let i = 0; i < RELAYS.length; i++) {
    const idx = (preferred + i) % RELAYS.length
    const { url, unwrap } = RELAYS[idx](target)
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) continue
      const quote = parseChart(symbol, await unwrap(res))
      if (quote) {
        preferred = idx
        return quote
      }
    } catch {
      /* try the next relay */
    }
  }
  return null
}

interface ServiceQuote { price: number; prev: number | null; currency: string; name: string; asOf: string; source: 'provider' | 'claude'; sourceUrl: string | null; fetchedAt: string }

export function fromService(symbol: string, q: ServiceQuote): Quote | null {
  if (!(q?.price > 0)) return null
  const prev = q.prev && q.prev > 0 ? q.prev : q.price
  const change = q.price - prev
  return {
    symbol, price: q.price, change, changePercent: prev > 0 ? (change / prev) * 100 : 0,
    currency: q.currency || 'SAR', name: q.name || symbol, updatedAt: q.fetchedAt || new Date().toISOString(),
    asOf: q.asOf, origin: q.source, sourceUrl: q.sourceUrl,
  }
}

/** One request for many symbols. Returns null when the service itself is unreachable. */
async function fetchFromService(symbols: string[]): Promise<Quotes | null> {
  const out: Quotes = {}
  try {
    for (let i = 0; i < symbols.length; i += 40) {
      const res = await fetch(`${PRICE_SERVICE}?symbols=${symbols.slice(i, i + 40).map(encodeURIComponent).join(',')}`, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) return i === 0 ? null : out
      const body = (await res.json()) as { quotes?: Record<string, ServiceQuote> }
      for (const [s, q] of Object.entries(body.quotes ?? {})) {
        const quote = fromService(s, q)
        if (quote) out[s] = quote
      }
    }
    return out
  } catch {
    return Object.keys(out).length ? out : null
  }
}

export type HistoryRange = '1m' | '3m' | '1y' | '5y' | 'max'
export interface PricePoint { day: string; close: number }

const HISTORY_KEY = 'investtrack_history_v1'
/** Closing prices for a symbol; cached on the device so the chart opens instantly and works offline. */
export async function fetchHistory(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
  const key = `${symbol}|${range}`
  let cache: Record<string, { at: number; points: PricePoint[] }> = {}
  try { cache = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') } catch { /* empty cache */ }
  const hit = cache[key]
  if (hit && Date.now() - hit.at < 6 * 3600 * 1000) return hit.points
  try {
    const res = await fetch(`${PRICE_SERVICE}?history=${encodeURIComponent(symbol)}&range=${range}`, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) throw new Error(String(res.status))
    const body = (await res.json()) as { points?: [string, number][] }
    const points = (body.points ?? []).filter((p) => p[1] > 0).map(([day, close]) => ({ day, close }))
    cache[key] = { at: Date.now(), points }
    // keep the cache small: the 30 most recent lookups
    const keys = Object.keys(cache).sort((a, b) => cache[b].at - cache[a].at)
    for (const k of keys.slice(30)) delete cache[k]
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(cache)) } catch { /* storage full */ }
    return points
  } catch {
    return hit?.points ?? []
  }
}

export interface FetchResult {
  quotes: Quotes
  failed: string[]
}

/** Fetches every symbol that is not fresh in `known`; returns the merged set. */
export async function fetchQuotes(symbols: string[], known: Quotes, force = false): Promise<FetchResult> {
  const unique = Array.from(new Set(symbols.filter(Boolean)))
  const todo = unique.filter((s) => force || !isFresh(known[s]))
  const merged: Quotes = { ...known }
  const failed: string[] = []
  if (todo.length === 0) return { quotes: merged, failed }

  // 1) the app's price service answers all symbols in one request
  const served = (await fetchFromService(todo)) ?? {}
  Object.assign(merged, served)
  // 2) whatever it could not answer: direct (Android) or public relays. Fund symbols (MF:) have no other source.
  const rest = todo.filter((s) => !served[s] && !s.startsWith('MF:'))
  failed.push(...todo.filter((s) => !served[s] && s.startsWith('MF:')))
  const batch = 4
  for (let i = 0; i < rest.length; i += batch) {
    await Promise.all(
      rest.slice(i, i + batch).map(async (s) => {
        const q = await fetchQuote(s)
        if (q) merged[s] = q
        else failed.push(s)
      }),
    )
  }
  if (todo.length > failed.length) saveQuoteCache(merged)
  return { quotes: merged, failed }
}
