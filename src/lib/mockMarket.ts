// Demo-mode market data (owned by the market agent). Development only: used by the mock client (mock.ts) with ?demo.
// Deterministic synthetic monthly histories (15 years or more) for every CLASS_PROXY symbol, the catalog's instruments and the
// demo holdings: shared market factors with the real crisis months (2006 Saudi crash, 2008, 2011, 2015, 2018, 2020, 2022),
// each series shifted to a plausible yearly growth; a yield curve in market_facts; profiles for a few stocks.
// mockMarketInvoke answers the function's 'series' and 'profile' modes with the same shapes the server returns.
// Nothing is computed at import time (the module stays in production bundles through mock.ts): the tables are built on
// first access.
import { CATALOG, CLASS_PROXY, type AssetClass, type CatalogItem } from './catalog'

type Row = Record<string, unknown>
type Point = [string, number, number, number]
type TableName = 'market_series' | 'market_facts' | 'instrument_profiles'

const START = '2005-01'
const mIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
const mKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const r6 = (n: number) => Number(n.toPrecision(7))

// ---------- deterministic randomness ----------
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0 }
function normals(seed: number, n: number): number[] {
  const r = rng(seed)
  const out: number[] = []
  while (out.length < n) {
    const u = r() || 1e-12, v = r()
    const m = Math.sqrt(-2 * Math.log(u))
    out.push(m * Math.cos(2 * Math.PI * v), m * Math.sin(2 * Math.PI * v))
  }
  return out.slice(0, n)
}

// ---------- market events and paths (plain data) ----------
/** world equity crisis months (added to the equity factor) */
const SHOCK: Record<string, number> = {
  '2007-11': -0.04, '2008-01': -0.06, '2008-06': -0.08, '2008-09': -0.1, '2008-10': -0.17, '2008-11': -0.07, '2009-02': -0.1,
  '2009-03': 0.08, '2009-04': 0.1, '2010-05': -0.08, '2011-08': -0.07, '2011-09': -0.07, '2015-08': -0.06, '2016-01': -0.05,
  '2018-10': -0.07, '2018-12': -0.08, '2020-02': -0.08, '2020-03': -0.13, '2020-04': 0.11, '2022-01': -0.05, '2022-04': -0.08,
  '2022-06': -0.08, '2022-09': -0.09, '2023-11': 0.08,
}
/** Saudi market crisis months */
const SAUDI_SHOCK: Record<string, number> = { '2006-02': -0.15, '2006-03': -0.2, '2006-05': -0.15, '2008-10': -0.2, '2014-12': -0.15, '2020-03': -0.12, '2022-09': -0.08 }
/** yield paths (%), straight lines between these months */
const IRX_PATH: Array<[string, number]> = [['2005-01', 2.3], ['2006-07', 5.0], ['2007-07', 4.9], ['2008-03', 1.3], ['2008-12', 0.05], ['2015-11', 0.1],
  ['2016-12', 0.5], ['2018-12', 2.4], ['2019-07', 2.1], ['2020-03', 0.1], ['2021-12', 0.05], ['2022-06', 1.6], ['2022-12', 4.3], ['2023-07', 5.3],
  ['2024-08', 5.1], ['2024-12', 4.3], ['2025-12', 3.9], ['2026-11', 3.8]]
const TNX_PATH: Array<[string, number]> = [['2005-01', 4.2], ['2007-06', 5.1], ['2008-12', 2.2], ['2010-03', 3.8], ['2012-07', 1.5], ['2013-12', 3.0],
  ['2016-07', 1.4], ['2018-10', 3.2], ['2020-03', 0.7], ['2020-08', 0.55], ['2021-12', 1.5], ['2022-10', 4.1], ['2023-10', 4.9], ['2024-09', 3.7],
  ['2025-01', 4.6], ['2025-12', 4.2], ['2026-11', 4.15]]
function pathAt(path: Array<[string, number]>, m: string): number {
  const i = mIndex(m)
  if (i <= mIndex(path[0][0])) return path[0][1]
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k]
    if (i <= mIndex(b[0])) { const t = (i - mIndex(a[0])) / Math.max(1, mIndex(b[0]) - mIndex(a[0])); return a[1] + (b[1] - a[1]) * t }
  }
  return path[path.length - 1][1]
}

// ---------- series specs ----------
interface Spec {
  start: string; base: number; currency: string; kind: 'price' | 'nav'
  /** yearly price growth the series is shifted to, % */
  growth: number
  beta: number; saudi: number; gold: number; idio: number
  /** % a year, paid in divMonths */
  div: number; divMonths: number[]
  /** sukuk-like: price moves with the 5-year yield by this duration, distributions follow the yield */
  duration?: number
  /** money market: NAV grows with the 3-month yield */
  cash?: boolean
  name: string
}
const Q = [3, 6, 9, 12], S2 = [6, 12], ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const DEFAULT_SPEC: Spec = { start: START, base: 100, currency: 'USD', kind: 'price', growth: 6, beta: 1, saudi: 0, gold: 0, idio: 0.012, div: 0, divMonths: Q, name: '' }
const SPECS: Record<string, Partial<Spec> & { name: string }> = {
  SPY: { name: 'SPDR S&P 500 ETF', base: 120, growth: 8, beta: 1, idio: 0.008, div: 1.7, divMonths: Q },
  ACWI: { name: 'iShares MSCI ACWI ETF', start: '2008-04', base: 50, growth: 5.5, beta: 1, idio: 0.008, div: 2, divMonths: S2 },
  EEM: { name: 'iShares MSCI Emerging Markets ETF', base: 25, growth: 2.5, beta: 1.2, idio: 0.03, div: 2.4, divMonths: S2 },
  '^TASI.SR': { name: 'Tadawul All Share Index', base: 10000, currency: 'SAR', growth: 3.5, beta: 0.55, saudi: 1, idio: 0.01, div: 0 },
  IEI: { name: 'iShares 3-7 Year Treasury Bond ETF', start: '2007-01', base: 100, growth: 0, beta: -0.03, idio: 0.004, duration: 4.5, divMonths: ALL },
  VNQ: { name: 'Vanguard Real Estate ETF', base: 60, growth: 3, beta: 1.15, idio: 0.025, div: 4, divMonths: Q },
  GLD: { name: 'SPDR Gold Shares', base: 43, growth: 7.5, beta: 0.1, gold: 1, idio: 0.005, div: 0 },
  '4330.SR': { name: 'Riyad REIT', start: '2010-01', base: 10, currency: 'SAR', growth: -2, beta: 0.15, saudi: 0.35, idio: 0.03, div: 6, divMonths: [3, 9] },
  '4340.SR': { name: 'Al Rajhi REIT', start: '2010-01', base: 10, currency: 'SAR', growth: -1, beta: 0.15, saudi: 0.35, idio: 0.03, div: 6.5, divMonths: Q },
  '4339.SR': { name: 'Derayah REIT', start: '2010-06', base: 10, currency: 'SAR', growth: -3, beta: 0.15, saudi: 0.35, idio: 0.035, div: 6, divMonths: Q },
  '4342.SR': { name: 'Jadwa REIT Saudi', start: '2011-01', base: 10, currency: 'SAR', growth: -1.5, beta: 0.15, saudi: 0.35, idio: 0.03, div: 6, divMonths: S2 },
  'ISWD.L': { name: 'iShares MSCI World Islamic UCITS ETF', start: '2007-12', base: 25, growth: 6.5, beta: 0.95, idio: 0.012, div: 1.8, divMonths: S2 },
  '9405.SR': { name: 'Albilad Gold ETF', start: '2022-02', base: 15, currency: 'SAR', growth: 12, beta: 0.1, gold: 1, idio: 0.006, div: 0 },
  '1120.SR': { name: 'Al Rajhi Bank', base: 30, currency: 'SAR', growth: 9, beta: 0.4, saudi: 1, idio: 0.05, div: 3, divMonths: S2 },
  '2222.SR': { name: 'Saudi Arabian Oil Co.', start: '2019-12', base: 35, currency: 'SAR', growth: -1, beta: 0.3, saudi: 0.7, idio: 0.035, div: 5, divMonths: Q },
  '7010.SR': { name: 'Saudi Telecom Co.', base: 40, currency: 'SAR', growth: 3, beta: 0.3, saudi: 0.8, idio: 0.04, div: 4, divMonths: Q },
  '1150.SR': { name: 'Alinma Bank', start: '2008-06', base: 10, currency: 'SAR', growth: 6, beta: 0.4, saudi: 1, idio: 0.055, div: 2.5, divMonths: S2 },
  '5885': { name: 'صندوق الراجحي للتوزيعات الشهرية', start: '2019-01', base: 10, currency: 'SAR', kind: 'nav', growth: -1, beta: 0.1, saudi: 0.2, idio: 0.006, div: 0 },
}
/** class templates for instruments without their own spec */
const CLASS_SPEC: Record<AssetClass, Partial<Spec>> = {
  cash: { cash: true, currency: 'SAR', kind: 'nav' }, money_market: { cash: true, currency: 'SAR', kind: 'nav' },
  savings_sukuk: { cash: true, currency: 'SAR', kind: 'nav' }, murabaha: { cash: true, currency: 'SAR', kind: 'nav' },
  sukuk_sar: { duration: 4, currency: 'SAR', idio: 0.004, beta: 0, divMonths: S2 }, sukuk_usd: { duration: 5, idio: 0.005, beta: 0.03, divMonths: S2 },
  equity_global: { growth: 6, beta: 1, idio: 0.01, div: 1.8, divMonths: S2 }, equity_us: { growth: 8, beta: 1, idio: 0.01, div: 1.2, divMonths: Q },
  equity_em: { growth: 3, beta: 1.2, idio: 0.03, div: 2.2, divMonths: S2 }, equity_sa: { growth: 4, beta: 0.5, saudi: 1, idio: 0.012, currency: 'SAR', div: 2.5, divMonths: S2 },
  equity_direct: { growth: 5, beta: 0.4, saudi: 1, idio: 0.05, currency: 'SAR', div: 3, divMonths: S2 },
  reit_sa: { growth: -1.5, beta: 0.15, saudi: 0.35, idio: 0.03, currency: 'SAR', div: 6, divMonths: Q }, reit_global: { growth: 3, beta: 1.1, idio: 0.025, div: 3.5, divMonths: Q },
  gold: { growth: 7.5, beta: 0.1, gold: 1, idio: 0.005 }, mixed_income: { growth: 0, beta: 0.2, saudi: 0.2, idio: 0.008, currency: 'SAR', kind: 'nav' },
  other: { growth: 5, beta: 1, idio: 0.015 },
}
const RATE_SYMBOLS = ['^IRX', '^FVX', '^TNX', '^TYX']
const PROFILE_ROWS: Array<[string, string | null, string | null, string | null, string, string]> = [
  ['1120.SR', 'EQUITY', 'Financial Services', 'Banks—Regional', 'SAU', 'SA'],
  ['1150.SR', 'EQUITY', 'Financial Services', 'Banks—Regional', 'SAU', 'SA'],
  ['2222.SR', 'EQUITY', 'Energy', 'Oil & Gas Integrated', 'SAU', 'SA'],
  ['7010.SR', 'EQUITY', 'Communication Services', 'Telecom Services', 'SAU', 'SA'],
  ['4340.SR', 'EQUITY', 'Real Estate', 'REIT—Diversified', 'SAU', 'SA'],
  ['AAPL', 'EQUITY', 'Technology', 'Consumer Electronics', 'NMS', 'US'],
  ['ISWD.L', 'ETF', null, null, 'LSE', 'GB'],
]

// ---------- the model: shared factors, built once on first use ----------
interface Model { now: Date; months: string[]; eq: number[]; sa: number[]; gold: number[]; irx: number[]; fvx: number[]; tnx: number[]; tyx: number[] }
let MODEL: Model | null = null
function model(): Model {
  if (MODEL) return MODEL
  const now = new Date()
  const months: string[] = []
  for (let i = mIndex(START); i <= mIndex(now.toISOString().slice(0, 7)); i++) months.push(mKey(i))
  const n = months.length
  const jitter = normals(14, n)
  const tnx = months.map((m, i) => Math.max(0.3, pathAt(TNX_PATH, m) + 0.08 * jitter[i]))
  const irx = months.map((m, i) => Math.max(0.01, pathAt(IRX_PATH, m) + 0.03 * jitter[(i + 7) % n]))
  return (MODEL = {
    now, months,
    eq: normals(11, n).map((z, i) => 0.042 * z + (SHOCK[months[i]] ?? 0)),
    sa: normals(12, n).map((z, i) => 0.04 * z + (SAUDI_SHOCK[months[i]] ?? 0)),
    gold: normals(13, n).map((z) => 0.045 * z),
    irx, tnx,
    // the 5-year sits below the 10-year, except while the curve was inverted (late 2022 to mid 2024)
    fvx: months.map((m, i) => Math.max(0.2, tnx[i] + (m >= '2022-11' && m <= '2024-06' ? 0.1 : -0.35))),
    tyx: tnx.map((v) => v + 0.3),
  })
}

function build(symbol: string, part: Partial<Spec> & { name: string }): Row {
  const M = model()
  const s: Spec = { ...DEFAULT_SPEC, ...part }
  const i0 = Math.max(0, M.months.indexOf(s.start))
  const months = M.months.slice(i0)
  const noise = normals(hash(symbol), months.length)
  const pts: Point[] = []
  if (s.cash) {
    // money market NAV: the 3-month yield less 0.5% a year of fees
    let nav = s.base
    months.forEach((m, k) => { if (k > 0) nav *= 1 + Math.max(0, M.irx[i0 + k - 1] - 0.5) / 1200 + 0.0002 * noise[k]; pts.push([m, r6(nav), r6(nav), 0]) })
  } else {
    // raw monthly log price changes from the factors, then shifted so the series grows `growth` % a year
    const raw = months.map((_, k) => {
      const i = i0 + k
      if (s.duration) return k === 0 ? 0 : (-s.duration * (M.fvx[i] - M.fvx[i - 1])) / 100 + s.idio * noise[k]
      return s.beta * (M.eq[i] - 0.004) + s.saudi * M.sa[i] + s.gold * M.gold[i] + s.idio * noise[k]
    })
    const shift = Math.log(1 + s.growth / 100) / 12 - raw.slice(1).reduce((a, b) => a + b, 0) / Math.max(1, raw.length - 1)
    let price = s.base, tr = 1
    const closes: number[] = [], trs: number[] = [], divs: number[] = []
    months.forEach((m, k) => {
      let d = 0
      if (k > 0) {
        const prev = price
        price = prev * Math.exp(raw[k] + shift)
        const yieldPct = s.duration ? M.fvx[i0 + k] : s.div
        if (yieldPct > 0 && s.divMonths.includes(Number(m.slice(5, 7)))) d = (prev * yieldPct) / 100 / s.divMonths.length
        tr *= (price + d) / prev
      }
      closes.push(price); trs.push(tr); divs.push(d)
    })
    const scale = closes[closes.length - 1] / trs[trs.length - 1]
    months.forEach((m, k) => pts.push([m, r6(closes[k]), r6(trs[k] * scale), r6(divs[k])]))
  }
  return {
    symbol, kind: s.kind, currency: s.currency, points: pts,
    meta: { name: s.name, source: 'demo', first: pts[0]?.[0] ?? null, last: pts[pts.length - 1]?.[0] ?? null, count: pts.length }, updated_at: M.now.toISOString(),
  }
}

function rateRow(symbol: string): Row {
  const M = model()
  const vals = symbol === '^IRX' ? M.irx : symbol === '^FVX' ? M.fvx : symbol === '^TYX' ? M.tyx : M.tnx
  const pts: Point[] = M.months.map((m, i) => [m, Math.round(vals[i] * 1000) / 1000, Math.round(vals[i] * 1000) / 1000, 0])
  return { symbol, kind: 'rate', currency: 'USD', points: pts, meta: { name: symbol, source: 'demo', count: pts.length }, updated_at: M.now.toISOString() }
}

/** A series for any symbol or fund id: its own spec, its catalog class, else a guess from the symbol. */
function makeRow(key: string): Row {
  const k = /^\d+$/.test(key) ? key : key.toUpperCase()
  if (RATE_SYMBOLS.includes(k)) return rateRow(k)
  if (SPECS[k]) return build(k, SPECS[k])
  const it: CatalogItem | undefined = CATALOG.find((c) => (c.symbol ?? '').toUpperCase() === k || c.fund_id === k)
  const h = hash(k)
  const vary = ((h % 1000) / 1000 - 0.5) * 2 // −1..1
  if (it) {
    const t = CLASS_SPEC[it.class] ?? CLASS_SPEC.other
    const start = it.inception && /^\d{4}-\d{2}/.test(it.inception) && it.inception.slice(0, 7) > START ? it.inception.slice(0, 7) : START
    return build(k, { ...t, name: it.name_en ?? it.name, currency: it.currency, start, base: 10 + (h % 40), kind: it.source === 'nav' ? 'nav' : t.kind ?? 'price', growth: (t.growth ?? 5) + vary })
  }
  if (/^\d+$/.test(k)) return build(k, { ...CLASS_SPEC.money_market, name: `Fund ${k}` })
  if (k.endsWith('.SR')) return build(k, { ...CLASS_SPEC.equity_direct, name: k, base: 20 + (h % 60), growth: 4 + 3 * vary })
  return build(k, { ...CLASS_SPEC.equity_us, name: k, base: 30 + (h % 200), growth: 6 + 3 * vary, idio: 0.04 })
}

// ---------- tables ----------
let TABLES: Record<TableName, Row[]> | null = null
function tables(): Record<TableName, Row[]> {
  if (TABLES) return TABLES
  const M = model()
  const keys = new Set<string>([...Object.values(CLASS_PROXY).flat(), ...RATE_SYMBOLS, ...Object.keys(SPECS)])
  for (const c of CATALOG) { const k = c.source === 'nav' ? c.fund_id : c.source === 'yahoo' ? c.symbol : null; if (k) keys.add(/^\d+$/.test(k) ? k : k.toUpperCase()) }
  const now = M.now.toISOString(), today = now.slice(0, 10)
  const last = (arr: number[]) => Math.round(arr[arr.length - 1] * 100) / 100
  const fact = (key: string, value: number, symbol: string) => ({ key, value, meta: { symbol, source: 'demo' }, as_of: today, updated_at: now })
  return (TABLES = {
    market_series: [...keys].map(makeRow),
    market_facts: [fact('us_3m', last(M.irx), '^IRX'), fact('us_5y', last(M.fvx), '^FVX'), fact('us_10y', last(M.tnx), '^TNX'), fact('us_30y', last(M.tyx), '^TYX')],
    instrument_profiles: PROFILE_ROWS.map(([symbol, quote_type, sector, industry, exchange, country]) => ({
      symbol, data: { quote_type, sector, industry, exchange, country }, source: 'demo', updated_at: now,
    })),
  })
}

/** Rows for the mock client's tables, built on first access (the engine agent spreads a copy into the demo fixture). */
export const MOCK_MARKET_TABLES: Record<TableName, Array<Record<string, unknown>>> = {
  get market_series() { return tables().market_series },
  get market_facts() { return tables().market_facts },
  get instrument_profiles() { return tables().instrument_profiles },
}

const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : [])

/** Answers edge-function calls in demo mode for the market modes ('series', 'profile') with the `data` the server sends; null = not handled. */
export function mockMarketInvoke(mode: string, body: Record<string, unknown>): unknown | null {
  if (mode === 'series') {
    const t = tables()
    const keys = [...new Set([...list(body.funds).filter((k) => /^\d+$/.test(k)), ...list(body.symbols).map((s) => s.toUpperCase())])].slice(0, 20)
    const rows = keys.map((k) => {
      let row = t.market_series.find((r) => r.symbol === k)
      if (!row) { row = makeRow(k); t.market_series.push(row) }
      return row
    })
    return { ok: true, rows, refreshed: [], failed: [] }
  }
  if (mode === 'profile') {
    const t = tables()
    const now = model().now.toISOString()
    const rows = [...new Set(list(body.symbols).map((s) => s.toUpperCase()))].slice(0, 20).map((k) => {
      let row = t.instrument_profiles.find((r) => r.symbol === k)
      if (!row) {
        const sa = k.endsWith('.SR')
        row = { symbol: k, data: { quote_type: 'EQUITY', sector: null, industry: null, exchange: sa ? 'SAU' : 'NMS', country: sa ? 'SA' : k.includes('.') ? null : 'US' }, source: 'demo', updated_at: now }
        t.instrument_profiles.push(row)
      }
      return row
    })
    return { ok: true, rows, failed: [] }
  }
  return null
}
