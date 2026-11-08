import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { useStore } from './store'
import type { Holding, PlanRow, Sleeve } from './types'
import type { Curve, InstrumentProfile, MarketInputs, MonthPoint, MonthlySeries } from './marketTypes'
import { CASH_CLASSES, CATALOG, CLASS_PROXY, SUKUK_CLASSES, findInstrument, instrumentOfHolding, marketKey, type AssetClass, type CatalogItem } from './catalog'
import { normalizePlan, type PlanDoc } from './plan'
import { classReturns, sustainInputFromPlan, sustainableIncome, type SustainPlanInput, type SustainResult } from './sustain'
import { customInstruments, lookThrough, symbolsNeedingProfile, type Exposure } from './lookthrough'

export interface SymbolResult { symbol: string; name: string; exchange: string; type: string }
export interface SymbolQuote { price: number; currency: string; name: string; type: string; exchange: string }

export const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'سهم', ETF: 'صندوق متداول', MUTUALFUND: 'صندوق', INDEX: 'مؤشر', CURRENCY: 'عملة', CRYPTOCURRENCY: 'عملة رقمية',
}

export async function searchSymbols(q: string): Promise<SymbolResult[]> {
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'search', q } })
  if (error) throw error
  return (data?.results ?? []) as SymbolResult[]
}

export async function quoteSymbol(symbol: string): Promise<SymbolQuote | null> {
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'quote', symbol } })
  if (error) return null
  return (data?.quote ?? null) as SymbolQuote | null
}

/** Best-guess layer for a picked instrument; the user can change it. */
export function guessSleeve(r: SymbolResult, sleeves: Sleeve[]): string | null {
  const name = r.name.toLowerCase()
  const saudi = r.symbol.toUpperCase().endsWith('.SR')
  const find = (pred: (s: Sleeve) => boolean) => sleeves.find(pred)?.id ?? null
  if (/gold|ذهب/.test(name)) return find((s) => s.layer === 'hedge')
  if (/reit|ريت/.test(name)) return find((s) => /ريت/.test(s.name)) ?? find((s) => s.layer === 'income')
  if (/sukuk|صكوك|bond|treasury/.test(name)) return find((s) => /صكوك/.test(s.name)) ?? find((s) => s.layer === 'income')
  if (/murabaha|money market|مرابحة/.test(name)) return find((s) => s.layer === 'safety')
  if (r.type === 'EQUITY') return find((s) => /مباشر/.test(s.name)) ?? find((s) => s.layer === 'growth')
  if (saudi) return find((s) => /سعودي/.test(s.name)) ?? find((s) => s.layer === 'growth')
  return find((s) => /عالمي/.test(s.name)) ?? find((s) => s.layer === 'growth')
}

// =====================================================================================
// Market history cache («المستشار»)
// Reads market_series / market_facts / instrument_profiles (shared tables, written only by the server) and asks the
// daily-update function to refresh what is missing or old: series older than 7 days, profiles older than 30 days.
// Cached in memory for the session; every hook works in demo mode (mock client) and never throws while rendering.
// =====================================================================================
const DAY = 86400000
const SERIES_MAX_AGE = 7 * DAY
const PROFILE_MAX_AGE = 30 * DAY
/** a series the server could not find is asked for again after a day; a profile after a week */
const EMPTY_SERIES_RETRY = DAY
const EMPTY_PROFILE_RETRY = 7 * DAY
/** the function is asked about the same key at most once in this window (a failed call may retry after a minute) */
const ASK_WINDOW = 6 * 3600000
const ASK_RETRY = 60000
const MAX_PER_CALL = 20

const SERIES = new Map<string, MonthlySeries | null>()
const PROFILES = new Map<string, InstrumentProfile | null>()
const PENDING = new Set<string>()
const ASKED = new Map<string, number>()
const FACTS: { curve: Curve | null; loaded: boolean; loading: boolean } = { curve: null, loaded: false, loading: false }
let version = 0
const listeners = new Set<() => void>()
const emit = () => { version++; listeners.forEach((l) => { try { l() } catch { /* a listener failed */ } }) }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const getVersion = () => version
const useMarketVersion = () => useSyncExternalStore(subscribe, getVersion, getVersion)

const isFund = (k: string) => /^\d{1,10}$/.test(k)
const validSymbol = (k: string) => /^[A-Z0-9^.=_-]{1,30}$/.test(k)
/** Cache key of a Yahoo symbol (upper case) or a Saudi fund id (digits). */
export const seriesKey = (s: string | null | undefined) => { const t = String(s ?? '').trim(); return isFund(t) ? t : t.toUpperCase() }
const uniq = <T,>(a: T[]) => [...new Set(a)]
const chunks = <T,>(a: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out }
const ageOf = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Date.now() - t : Infinity }

/** A market_series row (points as [[month, close, adjclose, dividends]]) as a MonthlySeries. */
export function toSeries(row: unknown): MonthlySeries | null {
  const r = row as Record<string, any> | null
  if (!r || typeof r.symbol !== 'string') return null
  const points: MonthPoint[] = []
  for (const p of Array.isArray(r.points) ? r.points : []) {
    const [m, c, a, d] = Array.isArray(p) ? p : p && typeof p === 'object' ? [p.m, p.c, p.a, p.d] : []
    const cn = Number(c), an = Number(a), dn = Number(d)
    if (typeof m !== 'string' || !/^\d{4}-\d{2}$/.test(m) || !Number.isFinite(cn)) continue
    points.push({ m, c: cn, a: Number.isFinite(an) && an > 0 ? an : cn, d: Number.isFinite(dn) && dn > 0 ? dn : 0 })
  }
  points.sort((x, y) => (x.m < y.m ? -1 : x.m > y.m ? 1 : 0))
  return {
    symbol: seriesKey(r.symbol), kind: r.kind === 'nav' || r.kind === 'rate' ? r.kind : 'price',
    currency: typeof r.currency === 'string' && r.currency ? r.currency : null, points, updated_at: String(r.updated_at ?? ''),
  }
}

/** An instrument_profiles row as an InstrumentProfile. */
export function toProfile(row: unknown): InstrumentProfile | null {
  const r = row as Record<string, any> | null
  if (!r || typeof r.symbol !== 'string') return null
  const d = r.data && typeof r.data === 'object' ? r.data : {}
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return { symbol: seriesKey(r.symbol), quote_type: s(d.quote_type), sector: s(d.sector), industry: s(d.industry), country: s(d.country), exchange: s(d.exchange) }
}

async function readIn(table: string, col: string, keys: string[], select: string): Promise<any[]> {
  const out: any[] = []
  for (const part of chunks(keys, 50)) {
    const { data, error } = await supabase.from(table).select(select).in(col, part)
    if (error) throw error
    out.push(...((data ?? []) as any[]))
  }
  return out
}

const seriesFresh = (s: MonthlySeries | null | undefined) => !!s && ageOf(s.updated_at) < (s.points.length ? SERIES_MAX_AGE : EMPTY_SERIES_RETRY)

/** Loads series into the session cache: the table first, then the function for what is missing or older than 7 days. */
async function ensureSeries(symbols: string[], funds: string[]): Promise<void> {
  const want = uniq([...symbols.map(seriesKey).filter((k) => validSymbol(k) && !isFund(k)), ...funds.map(seriesKey).filter(isFund)])
  if (!want.length) return
  let changed = false
  const unread = want.filter((k) => !SERIES.has(k) && !PENDING.has(k))
  if (unread.length) {
    unread.forEach((k) => PENDING.add(k))
    try {
      for (const r of await readIn('market_series', 'symbol', unread, 'symbol,kind,currency,points,meta,updated_at')) {
        const s = toSeries(r)
        if (s) { SERIES.set(s.symbol, s.points.length || !SERIES.get(s.symbol) ? s : SERIES.get(s.symbol)!); changed = true }
      }
    } catch { /* offline or no table yet: the function may still answer */ }
    unread.forEach((k) => PENDING.delete(k))
  }
  const t = Date.now()
  const ask = want.filter((k) => !PENDING.has(k) && !seriesFresh(SERIES.get(k)) && t - (ASKED.get(k) ?? 0) > ASK_WINDOW)
  if (ask.length) {
    ask.forEach((k) => { PENDING.add(k); ASKED.set(k, t) })
    if (changed) emit()
    changed = true
    for (const part of chunks(ask, MAX_PER_CALL)) {
      try {
        const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'series', symbols: part.filter((k) => !isFund(k)), funds: part.filter(isFund) } })
        if (error || !data) { part.forEach((k) => ASKED.set(k, t - ASK_WINDOW + ASK_RETRY)); continue }
        for (const r of (data as { rows?: unknown[] }).rows ?? []) {
          const s = toSeries(r)
          // an empty answer never replaces history already held
          if (s && (s.points.length || !SERIES.get(s.symbol)?.points.length)) SERIES.set(s.symbol, s)
        }
      } catch { part.forEach((k) => ASKED.set(k, t - ASK_WINDOW + ASK_RETRY)) }
    }
    ask.forEach((k) => PENDING.delete(k))
  }
  for (const k of want) if (!SERIES.has(k) && !PENDING.has(k)) { SERIES.set(k, null); changed = true }
  if (changed) emit()
}

/** Monthly histories for Yahoo symbols and Saudi fund ids (keyed by seriesKey). Never throws. */
export async function fetchSeries(symbols: string[], funds: string[] = []): Promise<Record<string, MonthlySeries>> {
  try { await ensureSeries(symbols, funds) } catch { /* keep what is cached */ }
  const out: Record<string, MonthlySeries> = {}
  for (const k of [...symbols, ...funds].map(seriesKey)) { const s = SERIES.get(k); if (s) out[k] = s }
  return out
}

/**
 * Monthly histories (close, adjusted close, dividends per month) for Yahoo symbols and Saudi fund ids.
 * `series` is keyed by seriesKey (upper-case symbol, or the fund id); `loading` while any of them is being fetched.
 */
export function useSeries(symbols: string[], funds: string[] = []): { series: Record<string, MonthlySeries>; loading: boolean } {
  const v = useMarketVersion()
  const symKey = uniq(symbols.map(seriesKey)).sort().join('|')
  const fundKey = uniq(funds.map(seriesKey)).sort().join('|')
  useEffect(() => {
    const s = symKey ? symKey.split('|') : [], f = fundKey ? fundKey.split('|') : []
    if (s.length || f.length) void ensureSeries(s, f).catch(() => undefined)
  }, [symKey, fundKey])
  return useMemo(() => {
    const series: Record<string, MonthlySeries> = {}
    let loading = false
    for (const k of [...(symKey ? symKey.split('|') : []), ...(fundKey ? fundKey.split('|') : [])]) {
      const s = SERIES.get(k)
      if (s) series[k] = s
      if (s === undefined || PENDING.has(k)) loading = true
    }
    return { series, loading }
  }, [symKey, fundKey, v])
}

// ---------- the yield curve ----------
const CURVE_KEYS = ['us_3m', 'us_5y', 'us_10y', 'us_30y']
/** Yahoo yield indices behind the curve (13-week bill, 5, 10 and 30 years), used when market_facts has no fresh curve */
export const RATE_SYMBOLS = ['^IRX', '^FVX', '^TNX', '^TYX']
/** quotes in the old ×10 convention are brought back to % */
const yieldPct = (v: number) => (v > 25 ? v / 10 : v)

async function ensureFacts(): Promise<void> {
  if (FACTS.loaded || FACTS.loading) return
  FACTS.loading = true
  try {
    const rows = await readIn('market_facts', 'key', CURVE_KEYS, 'key,value,as_of,updated_at')
    const by = new Map(rows.map((r) => [String(r.key), r]))
    const val = (k: string) => { const n = Number(by.get(k)?.value); return by.has(k) && Number.isFinite(n) ? yieldPct(n) : null }
    const asOf = rows.map((r) => String(r.as_of ?? r.updated_at ?? '').slice(0, 10)).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop() ?? ''
    const m3 = val('us_3m'), y5 = val('us_5y'), y10 = val('us_10y')
    FACTS.curve = m3 != null && y5 != null && y10 != null && asOf && ageOf(asOf + 'T12:00:00Z') < 10 * DAY ? { m3, y5, y10, y30: val('us_30y'), as_of: asOf } : null
  } catch { FACTS.curve = null }
  FACTS.loaded = true
  FACTS.loading = false
  emit()
}

/** US Treasury yields (%) from market_facts (refreshed by the morning job), else from the yield series; null until known. */
export function useCurve(): Curve | null {
  const v = useMarketVersion()
  useEffect(() => { void ensureFacts() }, [])
  const fallback = FACTS.loaded && !FACTS.curve
  const { series } = useSeries(fallback ? RATE_SYMBOLS : [])
  return useMemo(() => {
    if (FACTS.curve) return FACTS.curve
    if (!fallback) return null
    const last = (k: string) => { const s = series[k]; return s?.points.length ? yieldPct(s.points[s.points.length - 1].c) : null }
    const m3 = last('^IRX'), y5 = last('^FVX'), y10 = last('^TNX')
    if (m3 == null || y5 == null || y10 == null) return null
    return { m3, y5, y10, y30: last('^TYX'), as_of: (series['^TNX']?.updated_at ?? '').slice(0, 10) }
  }, [v, series, fallback])
}

// ---------- instrument profiles ----------
const profileFresh = (p: InstrumentProfile | null | undefined, at: string | undefined) =>
  p !== undefined && ageOf(at) < (p && (p.quote_type || p.sector || p.country) ? PROFILE_MAX_AGE : EMPTY_PROFILE_RETRY)
const PROFILE_AT = new Map<string, string>()

async function ensureProfiles(symbols: string[]): Promise<void> {
  const want = uniq(symbols.map(seriesKey)).filter((k) => validSymbol(k) && !isFund(k))
  if (!want.length) return
  let changed = false
  const unread = want.filter((k) => !PROFILES.has(k) && !PENDING.has(`p:${k}`))
  if (unread.length) {
    unread.forEach((k) => PENDING.add(`p:${k}`))
    try {
      for (const r of await readIn('instrument_profiles', 'symbol', unread, 'symbol,data,source,updated_at')) {
        const p = toProfile(r)
        if (p) { PROFILES.set(p.symbol, p); PROFILE_AT.set(p.symbol, String(r.updated_at ?? '')); changed = true }
      }
    } catch { /* the function may still answer */ }
    unread.forEach((k) => PENDING.delete(`p:${k}`))
  }
  const t = Date.now()
  const ask = want.filter((k) => !PENDING.has(`p:${k}`) && !profileFresh(PROFILES.get(k), PROFILE_AT.get(k)) && t - (ASKED.get(`p:${k}`) ?? 0) > ASK_WINDOW)
  if (ask.length) {
    ask.forEach((k) => { PENDING.add(`p:${k}`); ASKED.set(`p:${k}`, t) })
    changed = true
    for (const part of chunks(ask, MAX_PER_CALL)) {
      try {
        const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'profile', symbols: part } })
        if (error || !data) { part.forEach((k) => ASKED.set(`p:${k}`, t - ASK_WINDOW + ASK_RETRY)); continue }
        for (const r of (data as { rows?: unknown[] }).rows ?? []) {
          const p = toProfile(r)
          if (p) { PROFILES.set(p.symbol, p); PROFILE_AT.set(p.symbol, String((r as Record<string, unknown>).updated_at ?? new Date().toISOString())) }
        }
      } catch { part.forEach((k) => ASKED.set(`p:${k}`, t - ASK_WINDOW + ASK_RETRY)) }
    }
    ask.forEach((k) => PENDING.delete(`p:${k}`))
  }
  for (const k of want) if (!PROFILES.has(k) && !PENDING.has(`p:${k}`)) { PROFILES.set(k, null); changed = true }
  if (changed) emit()
}

/** Yahoo facts (quote type, sector, industry, exchange, country) for listed instruments, keyed by upper-case symbol. */
export function useProfiles(symbols: string[]): Record<string, InstrumentProfile> {
  const v = useMarketVersion()
  const key = uniq(symbols.map(seriesKey)).sort().join('|')
  useEffect(() => { if (key) void ensureProfiles(key.split('|')).catch(() => undefined) }, [key])
  return useMemo(() => {
    const out: Record<string, InstrumentProfile> = {}
    for (const k of key ? key.split('|') : []) { const p = PROFILES.get(k); if (p) out[k] = p }
    return out
  }, [key, v])
}

// ---------- the active plan ----------
const docCache = new WeakMap<object, PlanDoc>()
/** The active plan's document, normalised (cached per row). */
export function activePlanDoc(plans: PlanRow[]): PlanDoc | null {
  const row = plans.find((p) => p.is_active)
  if (!row) return null
  const raw = (row.doc ?? {}) as object
  let d = docCache.get(raw)
  if (!d) { try { d = normalizePlan(row.doc) } catch { return null } docCache.set(raw, d) }
  return d
}

/**
 * Instruments the active plan refers to (sleeves, emergency fund and income account), plus the catalog's cash and sukuk
 * instruments of the classes the plan uses, so the advisor can compare their yields.
 */
export function planInstrumentItems(doc: PlanDoc | null): CatalogItem[] {
  if (!doc) return []
  const custom = customInstruments(doc)
  const ids = new Set<string>()
  const classes = new Set<AssetClass>()
  const d = doc as unknown as Record<string, any>
  for (const s of Array.isArray(d.sleeves) ? d.sleeves : []) {
    for (const id of Array.isArray(s?.instruments) ? s.instruments : []) if (typeof id === 'string') ids.add(id)
    if (typeof s?.class === 'string') classes.add(s.class as AssetClass)
  }
  for (const part of [d.emergency, d.income]) for (const id of Array.isArray(part?.instruments) ? part.instruments : []) if (typeof id === 'string') ids.add(id)
  if (d.emergency) { classes.add('money_market'); classes.add('savings_sukuk'); classes.add('murabaha') }
  if (d.income) { classes.add('money_market'); classes.add('sukuk_sar') }
  const out = new Map<string, CatalogItem>()
  for (const id of ids) { const it = findInstrument(id, custom); if (it) out.set(it.id, it) }
  for (const it of [...custom, ...CATALOG]) {
    if (out.has(it.id)) continue
    if (classes.has(it.class) && ((CASH_CLASSES as string[]).includes(it.class) || (SUKUK_CLASSES as string[]).includes(it.class))) out.set(it.id, it)
  }
  return [...out.values()]
}

/** Yahoo symbols and fund ids to load for these holdings and instruments. */
export function marketKeysFor(holdings: Holding[], items: CatalogItem[], custom: CatalogItem[] = []): { symbols: string[]; funds: string[] } {
  const symbols = new Set<string>(), funds = new Set<string>()
  const put = (k: string | null | undefined, fund: boolean) => {
    const x = seriesKey(k)
    if (!x) return
    if (fund || isFund(x)) { if (isFund(x)) funds.add(x) } else if (validSymbol(x)) symbols.add(x)
  }
  for (const it of items) {
    if (it.source === 'nav') put(it.fund_id, true)
    else if (it.source === 'yahoo') put(it.symbol, false)
  }
  for (const h of holdings) {
    if (h.archived) continue
    const it = instrumentOfHolding(h, custom)
    if (it) { if (it.source === 'nav') put(it.fund_id, true); else if (it.source === 'yahoo') put(it.symbol, false) }
    if (h.price_source === 'nav') put(h.symbol, true)
    else if (h.price_source === 'yahoo') put(h.symbol, false)
  }
  return { symbols: [...symbols].sort(), funds: [...funds].sort() }
}

const addMonthsYM = (ym: string, n: number) => {
  const i = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }

/**
 * MarketInputs from holdings, instruments, series and the curve (pure):
 * quotes = the newest of the holdings' own prices and the series' last close; yields = trailing-12-month distributions ÷
 * last close (else the holding's payout settings; accumulating cash and sukuk funds: their 12-month return);
 * returns1y = 12-month change of the adjusted close. Yields and returns are after the fund's own fees.
 */
export function buildMarketInputs(args: { holdings: Holding[]; items: CatalogItem[]; series: Record<string, MonthlySeries>; curve: Curve | null; custom?: CatalogItem[] }): MarketInputs {
  const quotes: MarketInputs['quotes'] = {}
  const yields: MarketInputs['yields'] = {}
  const returns1y: MarketInputs['returns1y'] = {}
  const itemByKey = new Map<string, CatalogItem>()
  for (const it of [...(args.custom ?? []), ...args.items]) { const k = marketKey(it); if (k && !itemByKey.has(seriesKey(k))) itemByKey.set(seriesKey(k), it) }
  const holdingKey = (h: Holding) => {
    const it = instrumentOfHolding(h, args.custom ?? [])
    const k = it ? marketKey(it) : null
    return seriesKey(k ?? (h.price_source === 'yahoo' || h.price_source === 'nav' ? h.symbol : null))
  }
  for (const h of args.holdings) {
    if (h.archived || !(Number(h.price) > 0)) continue
    const k = holdingKey(h)
    if (!k) continue
    const asOf = (h.price_updated_at ?? '').slice(0, 10)
    const cur = quotes[k]
    if (!cur || asOf > cur.as_of) quotes[k] = { price: Number(h.price), currency: (h.currency || 'SAR').toUpperCase(), as_of: asOf }
  }
  for (const [k0, s] of Object.entries(args.series)) {
    if (!s || s.kind === 'rate' || !s.points.length) continue
    const k = seriesKey(k0)
    const last = s.points[s.points.length - 1]
    const asOf = (s.updated_at || `${last.m}-28`).slice(0, 10)
    const cur = quotes[k]
    if (!cur || asOf > cur.as_of) quotes[k] = { price: last.c, currency: (s.currency ?? itemByKey.get(k)?.currency ?? 'SAR').toUpperCase(), as_of: asOf }
    const yearAgo = addMonthsYM(last.m, -12)
    const div = s.points.filter((p) => p.m > yearAgo).reduce((t, p) => t + (p.d || 0), 0)
    if (div > 0 && last.c > 0) yields[k] = Math.round((div / last.c) * 10000) / 100
    const base = s.points.find((p) => p.m === yearAgo)
    if (base && base.a > 0 && last.a > 0) returns1y[k] = Math.round((last.a / base.a - 1) * 10000) / 100
    const it = itemByKey.get(k)
    if (!(k in yields) && k in returns1y && it && ((CASH_CLASSES as string[]).includes(it.class) || (SUKUK_CLASSES as string[]).includes(it.class)) && it.distribution !== 'dist') {
      yields[k] = returns1y[k]
    }
  }
  // the owner's payout settings when the history has no distributions
  for (const h of args.holdings) {
    if (h.archived) continue
    const k = holdingKey(h)
    if (!k || k in yields || !PER_YEAR[h.payout_freq]) continue
    const price = Number(h.price) || 0
    if (h.payout_basis === 'per_unit' && h.payout_per_unit != null && price > 0) yields[k] = Math.round(((Number(h.payout_per_unit) * PER_YEAR[h.payout_freq]) / price) * 10000) / 100
    else if (h.payout_basis !== 'per_unit' && h.payout_rate != null) {
      const nominal = Number(h.payout_nominal) || 0
      yields[k] = Math.round(Number(h.payout_rate) * (nominal > 0 && price > 0 ? nominal / price : 1) * 100) / 100
    }
  }
  return { curve: args.curve, quotes, yields, returns1y }
}

/** Real market data for every holding and every instrument in the active plan (quotes, yields, 12-month returns, curve). */
export function useMarketInputs(): MarketInputs {
  const { holdings, plans } = useStore()
  const doc = activePlanDoc(plans)
  const custom = useMemo(() => customInstruments(doc), [doc])
  const items = useMemo(() => planInstrumentItems(doc), [doc])
  const keys = useMemo(() => marketKeysFor(holdings, items, custom), [holdings, items, custom])
  const { series } = useSeries(keys.symbols, keys.funds)
  const curve = useCurve()
  return useMemo(() => {
    try { return buildMarketInputs({ holdings, items, series, curve, custom }) } catch { return { curve, quotes: {}, yields: {}, returns1y: {} } }
  }, [holdings, items, series, curve, custom])
}

// ---------- statistics for the UI ----------
/** Every symbol CLASS_PROXY uses (the long histories behind the statistics). */
export const PROXY_SYMBOLS: string[] = uniq(Object.values(CLASS_PROXY).flat().map((s) => seriesKey(s)))
const returnsCache = new Map<string, Partial<Record<AssetClass, number[]>>>()

/** Monthly returns per asset class from the proxy histories (one shared object per data version). */
export function useClassReturns(): { returns: Partial<Record<AssetClass, number[]>>; loading: boolean } {
  const { series, loading } = useSeries(PROXY_SYMBOLS)
  const sig = PROXY_SYMBOLS.map((s) => (series[s] ? `${s}:${series[s].updated_at}:${series[s].points.length}` : '')).join('|') + new Date().toISOString().slice(0, 7)
  const returns = useMemo(() => {
    let r = returnsCache.get(sig)
    if (!r) {
      try { r = classReturns(series) } catch { r = {} }
      if (returnsCache.size > 4) returnsCache.clear()
      returnsCache.set(sig, r)
    }
    return r
  }, [sig])
  return { returns, loading }
}

/**
 * «كم تقتطع شهرياً؟» in one call: the active plan's income-phase weights (or today's holdings), the class histories and the
 * curve, simulated after the first paint. `loading` until the first result. result.levels = value kept after 10 years,
 * result.longevity = money lasts 30 years with a real-constant income (same confidences); about 0.2–0.3 s per new input.
 */
export function useSustain(opts: { basis?: 'income' | 'current'; value?: number; horizonYears?: number; enabled?: boolean } = {}): { result: SustainResult | null; input: SustainPlanInput | null; loading: boolean } {
  const { holdings, accounts, fx, sleeves, goals, plans } = useStore()
  const doc = activePlanDoc(plans)
  const { returns, loading } = useClassReturns()
  const curve = useCurve()
  const input = useMemo(() => {
    try { return sustainInputFromPlan({ doc, holdings, accounts, fx, sleeves, goals, returns, curve, basis: opts.basis, value: opts.value, horizonYears: opts.horizonYears }) } catch { return null }
  }, [doc, holdings, accounts, fx, sleeves, goals, returns, curve, opts.basis, opts.value, opts.horizonYears])
  const [result, setResult] = useState<SustainResult | null>(null)
  const haveData = Object.keys(returns).length > 0
  useEffect(() => {
    if (opts.enabled === false || !input || (loading && !haveData)) return
    let live = true
    const t = window.setTimeout(() => { if (live) setResult(sustainableIncome(input)) }, 30)
    return () => { live = false; window.clearTimeout(t) }
  }, [input, loading, haveData, opts.enabled])
  return { result, input, loading: !result }
}

/** Look-through exposure of the holdings (profiles fetched for stocks outside the catalog). */
export function useExposure(scope: 'all' | 'main' = 'all'): Exposure {
  const { holdings, accounts, fx, sleeves, goals, plans } = useStore()
  const doc = activePlanDoc(plans)
  const custom = useMemo(() => customInstruments(doc), [doc])
  const syms = useMemo(() => symbolsNeedingProfile(holdings, custom), [holdings, custom])
  const profiles = useProfiles(syms)
  return useMemo(() => {
    try { return lookThrough({ holdings, accounts, fx, profiles, doc, sleeves, goals, scope }) } catch { return EMPTY_EXPOSURE }
  }, [holdings, accounts, fx, profiles, doc, sleeves, goals, scope])
}
const EMPTY_EXPOSURE: Exposure = {
  total: 0, coverage: 0, byCountry: {}, byRegion: {}, bySector: {}, byIndustry: {}, byClass: {}, byCurrency: {},
  coverageCountry: 0, coverageSector: 0, coverageIndustry: 0, unknownSector: 0, unknownIndustry: 0, items: [], unknown: [],
}
