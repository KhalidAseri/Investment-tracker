// Client-side quotes. Yahoo's chart endpoint has no CORS headers, so requests go
// through public CORS relays with fallbacks. Every successful quote is cached in
// localStorage and kept indefinitely as a last-known price.

import type { Quote, Quotes } from './types.ts'

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

export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const target = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
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
  const batch = 4
  for (let i = 0; i < todo.length; i += batch) {
    await Promise.all(
      todo.slice(i, i + batch).map(async (s) => {
        const q = await fetchQuote(s)
        if (q) merged[s] = q
        else failed.push(s)
      }),
    )
  }
  if (todo.length > failed.length) saveQuoteCache(merged)
  return { quotes: merged, failed }
}
