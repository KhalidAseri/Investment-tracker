// invest-quotes: public market prices for the Istithmarati app.
//
//   GET ?symbols=2222.SR,VOO,CSPX.L      latest price per symbol
//   GET ?history=2222.SR&range=1y        closing prices (1m | 3m | 1y | 5y | max)
//
// Prices come from Yahoo Finance, fetched server-side (no browser CORS limits) and cached in
// invest_quotes / invest_price_history. Symbols no provider carries (Saudi mutual funds) are written
// to the same tables by Claude's daily update and served from there. Public, read-only market data:
// no personal data passes through here, so no sign-in is required; inputs are validated and capped.

import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const SYMBOL = /^[A-Za-z0-9^.=_:-]{1,32}$/
const MAX_SYMBOLS = 40
const FRESH_MS = 10 * 60 * 1000
const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const RANGES: Record<string, { range: string; interval: string; days: number }> = {
  '1m': { range: '1mo', interval: '1d', days: 31 },
  '3m': { range: '3mo', interval: '1d', days: 92 },
  '1y': { range: '1y', interval: '1d', days: 366 },
  '5y': { range: '5y', interval: '1wk', days: 5 * 366 },
  'max': { range: 'max', interval: '1mo', days: 60 * 366 },
}
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info', 'access-control-allow-methods': 'GET, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=60' } })
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10)

interface Chart { meta: Record<string, unknown>; timestamp?: number[]; close: (number | null)[] }

async function yahooChart(symbol: string, range: string, interval: string): Promise<Chart | null> {
  for (const host of ['query1', 'query2']) {
    try {
      const res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`, {
        headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue
      const r = (await res.json())?.chart?.result?.[0]
      if (!r?.meta) continue
      return { meta: r.meta, timestamp: r.timestamp, close: r.indicators?.quote?.[0]?.close ?? [] }
    } catch { /* try the other host */ }
  }
  return null
}

/** London lists many funds in pence; everything downstream works in the currency's main unit. */
function unit(currency: unknown, value: number, symbol = ''): [number, string] {
  // Tadawul trades only in riyals; the provider occasionally labels a listed fund in USD.
  if (symbol.endsWith('.SR')) return [value, 'SAR']
  const c = String(currency ?? 'USD')
  return c === 'GBp' || c === 'GBX' ? [value / 100, 'GBP'] : [value, c]
}

async function quotes(symbols: string[]) {
  const { data: cached } = await db.from('invest_quotes').select('*').in('symbol', symbols)
  const bySymbol = new Map((cached ?? []).map((r) => [r.symbol, r]))
  const out: Record<string, unknown> = {}
  const failed: string[] = []
  const shape = (r: Record<string, unknown>) => ({ price: Number(r.price), prev: r.prev_close === null ? null : Number(r.prev_close), currency: r.currency, name: r.name, asOf: r.as_of, source: r.source, sourceUrl: r.source_url ?? null, fetchedAt: r.fetched_at })

  await Promise.all(symbols.map(async (s) => {
    const c = bySymbol.get(s)
    if (c && Date.now() - new Date(c.fetched_at).getTime() < FRESH_MS) { out[s] = shape(c); return }
    // MF: symbols are Saudi mutual funds no provider carries; only Claude's daily update prices them.
    const chart = s.startsWith('MF:') ? null : await yahooChart(s, '5d', '1d')
    const m = chart?.meta
    const raw = Number(m?.regularMarketPrice)
    if (m && raw > 0) {
      const [price, currency] = unit(m.currency, raw, s)
      const [prev] = unit(m.currency, Number(m.chartPreviousClose ?? m.previousClose ?? raw))
      // previous close of the last session: the close before the latest one in the series
      const closes = (chart!.close ?? []).filter((v): v is number => typeof v === 'number' && v > 0)
      const prevClose = closes.length >= 2 ? unit(m.currency, closes[closes.length - 2])[0] : prev
      const asOf = isoDay(Number(m.regularMarketTime ?? Date.now() / 1000))
      const row = { symbol: s, price, prev_close: prevClose, currency, name: String(m.shortName ?? m.longName ?? s), as_of: asOf, source: 'provider', source_url: null, fetched_at: new Date().toISOString() }
      // A provider price never replaces a newer price Claude recorded for a symbol the provider covers badly.
      if (!(c?.source === 'claude' && c.as_of > asOf)) {
        await db.from('invest_quotes').upsert(row)
        await db.from('invest_price_history').upsert({ symbol: s, day: asOf, close: price, source: 'provider' })
        out[s] = shape(row)
        return
      }
    }
    if (c) out[s] = shape(c)   // stale or Claude-written: still the best known price
    else failed.push(s)
  }))
  return { quotes: out, failed }
}

async function history(symbol: string, key: string) {
  const spec = RANGES[key] ?? RANGES['1y']
  const since = new Date(Date.now() - spec.days * 86400000).toISOString().slice(0, 10)
  const read = async () => (await db.from('invest_price_history').select('day, close').eq('symbol', symbol).gte('day', since).order('day')).data ?? []
  let rows = await read()
  const last = rows[rows.length - 1]?.day
  const covered = rows.length > 0 && rows[0].day <= new Date(Date.now() - (spec.days - 10) * 86400000).toISOString().slice(0, 10)
  const recent = !!last && Date.now() - new Date(last + 'T00:00:00Z').getTime() < 4 * 86400000
  let source = 'store'
  if (!symbol.startsWith('MF:') && !(covered && recent && rows.length >= Math.min(20, spec.days / 40))) {
    const chart = await yahooChart(symbol, spec.range, spec.interval)
    if (chart?.timestamp?.length) {
      const fresh = chart.timestamp.map((t, i) => [isoDay(t), chart.close[i]] as const)
        .filter((x): x is readonly [string, number] => typeof x[1] === 'number' && x[1] > 0)
        .map(([day, close]) => ({ symbol, day, close: unit(chart.meta.currency, close)[0], source: 'provider' }))
      // Never overwrite days Claude recorded (a fund's official NAV beats a provider estimate).
      const { data: own } = await db.from('invest_price_history').select('day').eq('symbol', symbol).eq('source', 'claude')
      const keep = new Set((own ?? []).map((r) => r.day))
      const write = fresh.filter((r) => !keep.has(r.day))
      for (let i = 0; i < write.length; i += 500) await db.from('invest_price_history').upsert(write.slice(i, i + 500))
      rows = await read()
      source = 'provider'
    }
  }
  return { symbol, range: key, source, points: rows.map((r) => [r.day, Number(r.close)]) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'GET') return json({ error: 'GET only' }, 405)
  const url = new URL(req.url)
  try {
    const h = url.searchParams.get('history')
    if (h) {
      if (!SYMBOL.test(h)) return json({ error: 'bad symbol' }, 400)
      return json(await history(h, url.searchParams.get('range') ?? '1y'))
    }
    const list = Array.from(new Set((url.searchParams.get('symbols') ?? '').split(',').map((s) => s.trim()).filter(Boolean)))
    if (list.length === 0 || list.length > MAX_SYMBOLS || !list.every((s) => SYMBOL.test(s))) return json({ error: `symbols: 1-${MAX_SYMBOLS} valid symbols` }, 400)
    return json(await quotes(list))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
