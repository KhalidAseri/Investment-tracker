// «كم تقتطع شهرياً؟» — how much income the plan can pay through the income account so that zakat is covered and the plan keeps
// its value after inflation, as a probability statement from historical data. Pure functions, no React.
//
// Method (ADVISOR-FEATURE.md, lib/sustain.ts):
//  1. classReturns(): monthly total returns per asset class from the CLASS_PROXY series (adjusted close for prices; '^IRX'
//     yield / 1200 for cash classes; equal-weight baskets; CLASS_BLEND for blended classes), aligned to a common last month.
//  2. Per class: mean and volatility of monthly log returns over its full history (histories under ten years are pulled
//     toward a class prior); correlations over the window all classes share (pairwise when that window is short).
//  3. Multivariate Student-t (df 5) monthly returns, 4000 paths (2000 antithetic pairs), fixed seed; the mix is rebalanced
//     monthly and fees above the proxy's own fee are taken monthly. The portfolio's monthly returns are computed once.
//  4. Each year: income = rate × (portfolio + account), kept within last year's ± band; zakat (2.5% a Hijri year ≈ 2.577% a
//     Gregorian year) on the zakatable part; the account is topped up to `treasuryMonths` of income from the portfolio
//     unless the portfolio is ≥ noSellDrawdownPct below its peak (then the account carries the income alone); every month
//     income/12 leaves the account, which earns mmRate; if it runs dry, units are sold.
//  5. Success = real value (portfolio + account) after the horizon ≥ today's value («levels»); a second set («longevity»)
//     counts success as the money never running out over 30 years with the income held constant in real terms. Success falls as the rate rises, so the
//     highest safe rate is found per path (bisection) and the rate for confidence c is the (1 − c) quantile across paths.
import {
  ASSET_CLASS_LABEL, CASH_CLASSES, CLASS_BLEND, CLASS_PROXY, findInstrument, guessClass, instrumentOfHolding, isAssetClass, zakatDefault,
  type AssetClass, type CatalogItem,
} from './catalog'
import { holdingValue, zakatRuleOf } from './calc'
import { customInstruments, holdingClass, holdingContext, planSleeveClasses } from './lookthrough'
import type { Curve, InstrumentProfile, MonthlySeries } from './marketTypes'
import type { PlanDoc } from './plan'
import type { Account, Fx, Goal, Holding, Layer, Sleeve } from './types'

// =====================================================================================
// Contract
// =====================================================================================
export interface SustainInput {
  /** starting plan value (SAR): main portfolio + income account */
  value: number
  /** weight %, ter % a year, zakatFactor 0..1 (share of the value zakat is due on) */
  weights: Array<{ cls: AssetClass; weight: number; ter: number; zakatFactor: number }>
  /** monthly total returns (decimal) per class, from classReturns() */
  returns: Partial<Record<AssetClass, number[]>>
  /** % a year */
  inflation: number
  /** default 10 */
  horizonYears: number
  /** the income-account mechanism; bandPct, noSellDrawdownPct and mmRate in % (mmRate = yearly return of the account) */
  rule: { bandPct: number; treasuryMonths: number; noSellDrawdownPct: number; mmRate: number }
  paths?: number
  seed?: number
}
export interface SustainLevel {
  confidence: number
  /** % of the plan value a year */
  annualPct: number
  annual: number
  monthly: number
  /** short Arabic name of the level */
  label: string
  /** median change of the plan's real value after the horizon at this rate, % */
  medianGrowth: number
}
export interface SustainResult {
  /** confidence 0.9, 0.75, 0.5: the real value (portfolio + account) after the horizon is at least today's */
  levels: SustainLevel[]
  /**
   * Same confidences, mechanism, zakat and inflation, but success = the money never runs out over `longevityYears`: portfolio +
   * income account stay above zero every month. The income is kept constant in real terms (today's amount grown with
   * inflation), within last year's ± band. medianGrowth = median change of the real value after those years (−100 when spent).
   */
  longevity: SustainLevel[]
  longevityYears: number
  /** SAR a Hijri year at today's value: 2.5% of the zakatable share of the mix */
  zakatAnnual: number
  /**
   * At the most cautious level that pays an income (`confidence`, 0 when none does): % of years with a lower income than the
   * year before, and worstChange = the 5th percentile of the yearly change, % (never below −band).
   */
  stability: { cutYears: number; worstChange: number; confidence: number }
  /**
   * The mix: meanReal = yearly real return %, vol = yearly volatility % (both from the simulation), maxDrawdown = the largest
   * fall % of this mix in the monthly history, over `months` months from `from` to `to` ('YYYY-MM').
   */
  stats: { meanReal: number; vol: number; maxDrawdown: number; months: number; from: string; to: string }
  /** one plain line on the data used */
  note: string
  /** classes without usable history (general assumptions used instead) */
  assumed: AssetClass[]
  /** share of paths where even taking nothing does not keep the real value, % */
  failAtZero: number
}

export const CONFIDENCES = [0.9, 0.75, 0.5] as const
const LEVEL_LABEL: Record<number, string> = { 0.9: 'الأكثر أماناً', 0.75: 'متوازن', 0.5: 'متفائل' }
/** zakat: 2.5% a Hijri year expressed a Gregorian year (365.2425 / 354.367 days) */
export const ZAKAT_GREGORIAN = (0.025 * 365.2425) / 354.367
const DF = 5
const MAX_RATE = 0.2
/** horizon of the «never runs out» levels */
export const LONGEVITY_YEARS = 30
const ALL_CLASSES = Object.keys(CLASS_PROXY) as AssetClass[]

/**
 * Price-only indices have no dividends in their history; their known dividend yield is added back (% a year).
 * TASI's dividend yield has run at about 3–4%; 3 is the cautious end.
 */
export const PRICE_INDEX_YIELD: Record<string, number> = { '^TASI.SR': 3 }
/**
 * Fee already inside each proxy's history (% a year): an instrument's fee only drags beyond this. Indices and yields carry no
 * fee; Saudi REIT prices are after their management fees (about 1%).
 */
export const PROXY_TER: Record<string, number> = {
  '^IRX': 0, '^TASI.SR': 0, IEI: 0.15, ACWI: 0.32, SPY: 0.09, EEM: 0.7, VNQ: 0.13, GLD: 0.4,
  '4330.SR': 1, '4340.SR': 1, '4339.SR': 1, '4342.SR': 1,
}
/** Fee assumed when an instrument's is unknown (% a year). */
export const DEFAULT_TER: Record<AssetClass, number> = {
  cash: 0, money_market: 0.5, savings_sukuk: 0, murabaha: 0.4, sukuk_sar: 0.5, sukuk_usd: 0.4,
  equity_global: 0.3, equity_us: 0.25, equity_em: 0.5, equity_sa: 0.5, equity_direct: 0, reit_sa: 1, reit_global: 0.4,
  gold: 0.4, mixed_income: 1, other: 0.5,
}
/**
 * General assumptions, used only for a class without usable history and as the prior short histories are pulled toward:
 * [yearly compound return %, yearly volatility %] in dollar/riyal terms.
 */
export const CLASS_PRIOR: Record<AssetClass, [number, number]> = {
  cash: [3, 0.6], money_market: [3, 0.6], savings_sukuk: [3.5, 1], murabaha: [3, 0.6],
  sukuk_sar: [4, 4.5], sukuk_usd: [4, 5],
  equity_global: [7, 15], equity_us: [8, 16], equity_em: [6.5, 20], equity_sa: [7, 20], equity_direct: [7, 25],
  reit_sa: [5.5, 15], reit_global: [6.5, 19], gold: [5, 15], mixed_income: [5, 7], other: [6.5, 16],
}
/** months of prior history a short class history (under 120 months) is blended with (n / (n + PRIOR_MONTHS) weight on the data) */
const PRIOR_MONTHS = 36

type Family = 'cash' | 'bond' | 'eq' | 'reit' | 'gold' | 'mix'
const FAMILY: Record<AssetClass, Family> = {
  cash: 'cash', money_market: 'cash', savings_sukuk: 'cash', murabaha: 'cash', sukuk_sar: 'bond', sukuk_usd: 'bond',
  equity_global: 'eq', equity_us: 'eq', equity_em: 'eq', equity_sa: 'eq', equity_direct: 'eq', other: 'eq',
  reit_sa: 'reit', reit_global: 'reit', gold: 'gold', mixed_income: 'mix',
}
/** prior correlations between families (used only for classes without data) */
function priorCorr(a: Family, b: Family): number {
  if (a === b) return a === 'cash' ? 0.9 : a === 'bond' ? 0.85 : a === 'eq' ? 0.75 : a === 'reit' ? 0.7 : a === 'gold' ? 0.9 : 0.8
  const k = [a, b].sort().join('-')
  const T: Record<string, number> = {
    'bond-cash': 0.1, 'cash-eq': 0, 'cash-gold': 0, 'cash-mix': 0.1, 'cash-reit': 0, 'bond-eq': 0.15, 'bond-gold': 0.2, 'bond-mix': 0.6,
    'bond-reit': 0.25, 'eq-gold': 0.1, 'eq-mix': 0.45, 'eq-reit': 0.6, 'gold-mix': 0.15, 'gold-reit': 0.1, 'mix-reit': 0.6,
  }
  return T[k] ?? 0
}

// =====================================================================================
// Months
// =====================================================================================
const mIndex = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1
const mKey = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
const addMonths = (ym: string, n: number) => mKey(mIndex(ym) + n)
const currentMonth = () => new Date().toISOString().slice(0, 7)

// =====================================================================================
// 1 · Class returns
// =====================================================================================
interface ReturnsMeta { end: string; start: Partial<Record<AssetClass, string>> }
/** month labels of classReturns() output (kept out of the arrays so the output stays a plain record) */
const RET_META = new WeakMap<object, ReturnsMeta>()
/** First and last month of each class array built by classReturns() (null for a record built by hand). */
export const returnsMeta = (r: object): ReturnsMeta | null => RET_META.get(r) ?? null

/** Monthly returns of one series keyed by month; months before `cutoff` only (the running month is incomplete). */
function seriesReturns(s: MonthlySeries, cutoff: string, extraYield = 0): Map<string, number> {
  const out = new Map<string, number>()
  const pts = (s.points ?? []).filter((p) => p && /^\d{4}-\d{2}$/.test(p.m) && p.m < cutoff && Number.isFinite(p.c)).sort((a, b) => (a.m < b.m ? -1 : a.m > b.m ? 1 : 0))
  if (pts.length < 2) return out
  if (s.kind === 'rate') {
    // a yield in % known at the start of the month earns yield/12 over it
    for (let i = 1; i < pts.length; i++) {
      const gap = mIndex(pts[i].m) - mIndex(pts[i - 1].m)
      if (gap < 1 || gap > 3) continue
      const r = Math.max(-0.01, pts[i - 1].c) / 1200
      for (let k = 1; k <= gap; k++) out.set(addMonths(pts[i - 1].m, k), r)
    }
    return out
  }
  const useAdj = pts.every((p) => Number(p.a) > 0)
  const extra = extraYield / 1200
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const gap = mIndex(b.m) - mIndex(a.m)
    if (gap < 1 || gap > 3 || !(a.c > 0)) continue
    const R = useAdj ? b.a / a.a - 1 : (b.c + (Number(b.d) || 0)) / a.c - 1
    if (!Number.isFinite(R) || R <= -0.95 || R > 4) continue
    const r = gap === 1 ? R : Math.pow(1 + R, 1 / gap) - 1
    for (let k = 1; k <= gap; k++) out.set(addMonths(a.m, k), r + extra)
  }
  return out
}

/** Equal-weight basket, rebalanced monthly, over the members available each month. */
function basket(parts: Array<Map<string, number>>): Map<string, number> {
  const sum = new Map<string, [number, number]>()
  for (const m of parts) for (const [k, v] of m) { const s = sum.get(k) ?? [0, 0]; s[0] += v; s[1]++; sum.set(k, s) }
  return new Map([...sum].map(([k, [s, n]]) => [k, s / n]))
}
const lastKey = (m: Map<string, number>) => { let x = ''; for (const k of m.keys()) if (k > x) x = k; return x }

/**
 * Monthly total returns (decimal) per asset class from the CLASS_PROXY series, oldest first, every class ending at the
 * same month (the last complete month all of them have; a class more than a year behind the others is left out).
 * `series` is keyed by symbol (upper case). asOf = first month to leave out ('YYYY-MM', default: the running month).
 */
export function classReturns(series: Record<string, MonthlySeries>, opts: { asOf?: string } = {}): Partial<Record<AssetClass, number[]>> {
  const cutoff = opts.asOf ?? currentMonth()
  const find = (sym: string) => series[sym] ?? series[sym.toUpperCase()] ?? null
  const bySymbol = new Map<string, Map<string, number>>()
  const symRet = (sym: string) => {
    let m = bySymbol.get(sym)
    if (!m) { const s = find(sym); m = s ? seriesReturns(s, cutoff, PRICE_INDEX_YIELD[sym] ?? 0) : new Map(); bySymbol.set(sym, m) }
    return m
  }
  const maps: Partial<Record<AssetClass, Map<string, number>>> = {}
  for (const cls of ALL_CLASSES) {
    const parts = (CLASS_PROXY[cls] ?? []).map(symRet).filter((m) => m.size > 0)
    if (!parts.length) continue
    const m = parts.length === 1 ? parts[0] : basket(parts)
    if (m.size >= 12) maps[cls] = m
  }
  for (const [cls, blend] of Object.entries(CLASS_BLEND) as Array<[AssetClass, Partial<Record<AssetClass, number>>]>) {
    if (maps[cls]) continue
    const comps = Object.entries(blend).filter(([, w]) => Number(w) > 0) as Array<[AssetClass, number]>
    if (!comps.length || comps.some(([c]) => !maps[c])) continue
    const wsum = comps.reduce((a, [, w]) => a + w, 0)
    const m = new Map<string, number>()
    for (const k of maps[comps[0][0]]!.keys()) {
      if (!comps.every(([c]) => maps[c]!.has(k))) continue
      m.set(k, comps.reduce((a, [c, w]) => a + w * maps[c]!.get(k)!, 0) / wsum)
    }
    if (m.size >= 12) maps[cls] = m
  }
  const out: Partial<Record<AssetClass, number[]>> = {}
  const classes = Object.keys(maps) as AssetClass[]
  if (!classes.length) { RET_META.set(out, { end: '', start: {} }); return out }
  const maxEnd = classes.map((c) => lastKey(maps[c]!)).sort().pop()!
  const live = classes.filter((c) => lastKey(maps[c]!) >= addMonths(maxEnd, -12))
  const end = live.map((c) => lastKey(maps[c]!)).sort()[0]
  const start: Partial<Record<AssetClass, string>> = {}
  for (const c of live) {
    const m = maps[c]!
    const arr: number[] = []
    let k = end
    while (m.has(k)) { arr.push(m.get(k)!); k = addMonths(k, -1) }
    if (arr.length < 12) continue
    out[c] = arr.reverse()
    start[c] = addMonths(end, -(arr.length - 1))
  }
  RET_META.set(out, { end, start })
  return out
}

// =====================================================================================
// 2 · Statistics helpers
// =====================================================================================
/** Largest fall from a peak, % (positive), of a sequence of monthly returns; with the months it took to recover. */
export function maxDrawdownOf(rets: ArrayLike<number>): { pct: number; peakAt: number; troughAt: number; recoverMonths: number | null } {
  // wealth index after i months; peakAt / troughAt are month counts from the start
  let w = 1, peak = 1, peakAt = 0, best = 0, bPeakAt = 0, bTroughAt = 0, bPeakW = 1
  for (let i = 0; i < rets.length; i++) {
    w *= 1 + rets[i]
    if (w > peak) { peak = w; peakAt = i + 1 }
    const dd = 1 - w / peak
    if (dd > best) { best = dd; bPeakAt = peakAt; bTroughAt = i + 1; bPeakW = peak }
  }
  let recover: number | null = null
  if (best > 0) {
    // the first month after the trough when wealth is back at the old peak
    let x = 1
    for (let i = 0; i < rets.length; i++) {
      x *= 1 + rets[i]
      if (i + 1 > bTroughAt && x >= bPeakW) { recover = i + 1 - bTroughAt; break }
    }
  }
  return { pct: best * 100, peakAt: bPeakAt, troughAt: bTroughAt, recoverMonths: recover }
}

/**
 * Monthly returns of a mix over the months all its classes share (classes without history are left out and the others
 * reweighted). Weights in any unit. Fees (% a year) are taken monthly.
 */
export function mixHistory(weights: Partial<Record<AssetClass, number>>, returns: Partial<Record<AssetClass, number[]>>, feePct = 0): { rets: number[]; used: AssetClass[]; missing: AssetClass[] } {
  const used = (Object.keys(weights) as AssetClass[]).filter((c) => (weights[c] ?? 0) > 0 && (returns[c]?.length ?? 0) >= 12)
  const missing = (Object.keys(weights) as AssetClass[]).filter((c) => (weights[c] ?? 0) > 0 && !used.includes(c))
  if (!used.length) return { rets: [], used, missing }
  const L = Math.min(...used.map((c) => returns[c]!.length))
  const W = used.reduce((a, c) => a + weights[c]!, 0)
  const rets: number[] = new Array(L).fill(0)
  for (const c of used) {
    const arr = returns[c]!, off = arr.length - L, w = weights[c]! / W
    for (let i = 0; i < L; i++) rets[i] += w * arr[off + i]
  }
  const fee = feePct / 1200
  if (fee) for (let i = 0; i < L; i++) rets[i] -= fee
  return { rets, used, missing }
}

const mean = (a: ArrayLike<number>, from = 0) => { let s = 0; for (let i = from; i < a.length; i++) s += a[i]; return s / Math.max(1, a.length - from) }
function corrOf(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length)
  if (n < 3) return 0
  const xo = x.length - n, yo = y.length - n
  let mx = 0, my = 0
  for (let i = 0; i < n; i++) { mx += x[xo + i]; my += y[yo + i] }
  mx /= n; my /= n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) { const a = x[xo + i] - mx, b = y[yo + i] - my; sxy += a * b; sxx += a * a; syy += b * b }
  return sxx > 0 && syy > 0 ? Math.max(-0.99, Math.min(0.99, sxy / Math.sqrt(sxx * syy))) : 0
}
/** lower-triangular Cholesky factor (row-major k×k), null when the matrix is not positive definite */
function cholesky(m: Float64Array, k: number): Float64Array | null {
  const L = new Float64Array(k * k)
  for (let i = 0; i < k; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i * k + j]
      for (let p = 0; p < j; p++) s -= L[i * k + p] * L[j * k + p]
      if (i === j) { if (s <= 1e-10) return null; L[i * k + i] = Math.sqrt(s) } else L[i * k + j] = s / L[j * k + j]
    }
  }
  return L
}

/** Inverse of the standard normal distribution (Acklam; relative error about 1e-9). */
export function invNorm(p: number): number {
  if (!(p > 0)) return -8.3
  if (!(p < 1)) return 8.3
  const pl = 0.02425
  if (p < pl || p > 1 - pl) {
    const q = Math.sqrt(-2 * Math.log(p < pl ? p : 1 - p))
    const x = (((((-7.784894002430293e-3 * q - 3.223964580411365e-1) * q - 2.400758277161838) * q - 2.549732539343734) * q + 4.374664141464968) * q + 2.938163982698783) /
      ((((7.784695709041462e-3 * q + 3.224671290700398e-1) * q + 2.445134137142996) * q + 3.754408661907416) * q + 1)
    return p < pl ? x : -x
  }
  const q = p - 0.5, r = q * q
  return (((((-3.969683028665376e1 * r + 2.209460984245205e2) * r - 2.759285104469687e2) * r + 1.38357751867269e2) * r - 3.066479806614716e1) * r + 2.506628277459239) * q /
    (((((-5.447609879822406e1 * r + 1.615858368580409e2) * r - 1.556989798598866e2) * r + 6.680131188771972e1) * r - 1.328068155288572e1) * r + 1)
}
/** Normal quantiles at u = i / 65536 (built once): a 32-bit random number gives a normal draw by one lookup. */
let NORM_TABLE: Float64Array | null = null
function normTable(): Float64Array {
  if (NORM_TABLE) return NORM_TABLE
  const t = new Float64Array(65537)
  for (let i = 1; i < 65536; i++) t[i] = invNorm(i / 65536)
  t[0] = t[1]; t[65536] = t[65535]
  return (NORM_TABLE = t)
}

const yearsAr = (n: number) => (n === 1 ? 'سنة واحدة' : n === 2 ? 'سنتين' : n <= 10 ? `${n} سنوات` : `${n} سنة`)
const r2 = (v: number) => Math.round(v * 100) / 100

// =====================================================================================
// 3–5 · Simulation
// =====================================================================================
interface Factor { classes: AssetClass[]; weight: number; mu: number; sigma: number; logs: number[] | null; family: Family; proxyTer: number }

function sameArray(a: number[] | undefined, b: number[] | undefined) {
  if (!a || !b || a.length !== b.length) return false
  if (a === b) return true
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

function proxyTerOf(cls: AssetClass): number {
  const syms = CLASS_PROXY[cls] ?? []
  if (!syms.length) {
    const blend = CLASS_BLEND[cls]
    if (!blend) return 0
    let s = 0, w = 0
    for (const [c, x] of Object.entries(blend) as Array<[AssetClass, number]>) { s += x * proxyTerOf(c); w += x }
    return w > 0 ? s / w : 0
  }
  return syms.reduce((a, s) => a + (PROXY_TER[s] ?? 0), 0) / syms.length
}

const EMPTY_STATS = { meanReal: 0, vol: 0, maxDrawdown: 0, months: 0, from: '', to: '' }
function emptyResult(note: string): SustainResult {
  return {
    levels: CONFIDENCES.map((c) => ({ confidence: c, annualPct: 0, annual: 0, monthly: 0, label: LEVEL_LABEL[c], medianGrowth: 0 })),
    longevity: CONFIDENCES.map((c) => ({ confidence: c, annualPct: 0, annual: 0, monthly: 0, label: LEVEL_LABEL[c], medianGrowth: 0 })), longevityYears: LONGEVITY_YEARS,
    zakatAnnual: 0, stability: { cutYears: 0, worstChange: 0, confidence: 0 }, stats: { ...EMPTY_STATS }, note, assumed: [], failAtZero: 0,
  }
}

const memo = new WeakMap<object, Map<string, SustainResult>>()
/** milliseconds spent in the last simulation (generation, solving, levels); for tests */
export const lastTimings = { generate: 0, prep: 0, solve: 0, levels: 0, total: 0 }
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** Safe yearly income rates at 90%, 75% and 50% confidence (see the header for the method). Never throws. */
export function sustainableIncome(input: SustainInput): SustainResult {
  try {
    const key = JSON.stringify({ ...input, returns: undefined })
    const box = input.returns && typeof input.returns === 'object' ? input.returns : {}
    let cache = memo.get(box)
    const hit = cache?.get(key)
    if (hit) return hit
    const res = simulate(input)
    if (!cache) { cache = new Map(); memo.set(box, cache) }
    if (cache.size > 12) cache.clear()
    cache.set(key, res)
    return res
  } catch {
    return emptyResult('تعذّر الحساب الآن.')
  }
}

/**
 * Fills R (paths × months) with monthly portfolio returns: multivariate Student-t (df 5) log returns per factor through the
 * packed Cholesky factor Lp, antithetic pairs (paths 2i and 2i+1 use opposite normal draws and the same chi-square draw).
 * Random numbers: xorshift128 in local variables; normal draws from the quantile table (exact formula in the two outermost
 * cells); e^±y for |y| < 0.5 from the even and odd parts of its series (error < 2e-6).
 */
function generatePaths(R: Float32Array, P: number, T: number, k: number, Lp: Float64Array, wts: Float64Array, emu: Float64Array, sig: Float64Array, base0: number, seed: number): void {
  const NT = normTable()
  // int32 state from the start (uint32 values above 2^31 would be stored as doubles and slow every step)
  let sx = (seed ^ 0x9e3779b9) | 0 || 1, sy = 362436069, sz = 521288629, sw = Math.imul(seed | 0, 0x9e3779b1) | 0 || 88675123
  for (let i = 0; i < 16; i++) { const t0 = sx ^ (sx << 11); sx = sy; sy = sz; sz = sw; sw = (sw ^ (sw >>> 19)) ^ (t0 ^ (t0 >>> 8)) }
  const z = new Float64Array(k + 1)
  const tScale = Math.sqrt(DF - 2)
  const U32 = 2.3283064365386963e-10
  for (let p = 0; p < P; p += 2) {
    const o1 = p * T, o2 = (p + 1) * T, pair = p + 1 < P
    for (let t = 0; t < T; t++) {
      for (let i = 0; i <= k; i++) {
        const t0 = sx ^ (sx << 11); sx = sy; sy = sz; sz = sw; sw = (sw ^ (sw >>> 19)) ^ (t0 ^ (t0 >>> 8))
        const r32 = sw >>> 0
        const cell = r32 >>> 16
        z[i] = cell === 0 || cell === 65535 ? invNorm((r32 + 0.5) * U32) : NT[cell] + ((r32 & 0xffff) / 65536) * (NT[cell + 1] - NT[cell])
      }
      // chi-square with 5 degrees of freedom = −2 ln(U1·U2) + Z²; the t draw is scaled to variance 1
      let t1 = sx ^ (sx << 11); sx = sy; sy = sz; sz = sw; sw = (sw ^ (sw >>> 19)) ^ (t1 ^ (t1 >>> 8))
      const u1 = ((sw >>> 0) + 0.5) * U32
      t1 = sx ^ (sx << 11); sx = sy; sy = sz; sz = sw; sw = (sw ^ (sw >>> 19)) ^ (t1 ^ (t1 >>> 8))
      const u2 = ((sw >>> 0) + 0.5) * U32
      const zc = z[k]
      const sc = tScale / Math.sqrt(-2 * Math.log(u1 * u2) + zc * zc)
      let r1 = base0, r2 = base0
      for (let f = 0, n = 0; f < k; f++) {
        let acc = 0
        for (let j = 0; j <= f; j++) acc += Lp[n++] * z[j]
        // a draw is capped at 10 standard deviations
        let x = acc * sc
        if (x > 10) x = 10
        else if (x < -10) x = -10
        const y = sig[f] * x
        let e: number, ie: number
        if (y < 0.5 && y > -0.5) {
          const y2 = y * y
          const even = 1 + y2 * (0.5 + y2 * (0.041666666666666664 + y2 * 0.001388888888888889))
          const odd = y * (1 + y2 * (0.16666666666666666 + y2 * 0.008333333333333333))
          e = even + odd
          ie = even - odd
        } else { e = Math.exp(y); ie = 1 / e }
        r1 += wts[f] * (emu[f] * e - 1)
        r2 += wts[f] * (emu[f] * ie - 1)
      }
      R[o1 + t] = r1
      if (pair) R[o2 + t] = r2
    }
  }
}

/** Growth of each path over each year, the yearly-review drawdown hold flags, and the mean/variance of monthly returns. */
function yearly(R: Float32Array, P: number, T: number, H: number, noSellThr: number) {
  const G = new Float64Array(P * H)
  const hold = new Uint8Array(P * H)
  let logSum = 0, sum = 0, sumSq = 0
  for (let p = 0; p < P; p++) {
    let idx = 1, peak = 1
    for (let y = 0; y < H; y++) {
      if (noSellThr > 0 && 1 - idx / peak >= noSellThr) hold[p * H + y] = 1
      let g = 1
      const base = p * T + y * 12
      for (let m = 0; m < 12; m++) {
        const r = R[base + m]
        g *= 1 + r
        idx *= 1 + r
        if (idx > peak) peak = idx
        sum += r
        sumSq += r * r
      }
      G[p * H + y] = g
      logSum += Math.log(Math.max(1e-12, g))
    }
  }
  const N = P * T
  return { G, hold, meanLog: logSum / N, varR: Math.max(0, sumSq / N - (sum / N) ** 2) }
}

function simulate(input: SustainInput): SustainResult {
  const V0 = Number(input.value) || 0
  if (!(V0 > 0)) return emptyResult('أضف قيمة المحفظة أولاً ليُحسب الدخل الممكن.')
  const P = Math.max(200, Math.min(20000, Math.round(input.paths ?? 4000)))
  const H = Math.max(1, Math.min(40, Math.round(input.horizonYears || 10)))
  const seed = (input.seed ?? 20261108) >>> 0
  const infl = (Number(input.inflation) || 0) / 100
  const band = Math.max(0, Number(input.rule?.bandPct) || 0) / 100
  const tmY = Math.max(0, Number(input.rule?.treasuryMonths) || 0) / 12
  const noSellThr = (Number(input.rule?.noSellDrawdownPct) || 0) / 100
  const mm = Math.max(-0.02, (Number(input.rule?.mmRate) || 0) / 100)
  const returns = input.returns ?? {}

  // ---- weights by class ----
  const byClass = new Map<AssetClass, { w: number; ter: number; zf: number }>()
  for (const x of input.weights ?? []) {
    const w = Number(x.weight) || 0
    if (!(w > 0) || !isAssetClass(x.cls)) continue
    const cur = byClass.get(x.cls) ?? { w: 0, ter: 0, zf: 0 }
    cur.ter += w * Math.max(0, Number(x.ter) || 0)
    cur.zf += w * Math.min(1, Math.max(0, Number.isFinite(Number(x.zakatFactor)) ? Number(x.zakatFactor) : 1))
    cur.w += w
    byClass.set(x.cls, cur)
  }
  const Wsum = [...byClass.values()].reduce((a, x) => a + x.w, 0)
  if (!(Wsum > 0)) return emptyResult('حدّد أوزان المحفظة أولاً ليُحسب الدخل الممكن.')
  let feeDrag = 0, zf = 0
  for (const [cls, x] of byClass) {
    const ter = x.ter / x.w
    feeDrag += (x.w / Wsum) * Math.max(0, ter - proxyTerOf(cls))
    zf += x.zf / Wsum
  }

  // ---- factors: classes with identical return histories share one ----
  const factors: Factor[] = []
  const assumed: AssetClass[] = []
  for (const [cls, x] of byClass) {
    const arr = returns[cls]
    const usable = !!arr && arr.length >= 12 && arr.every((v) => Number.isFinite(v) && v > -1)
    const f = usable ? factors.find((g) => g.logs && sameArray(returns[g.classes[0]], arr)) : undefined
    if (f) { f.classes.push(cls); f.weight += x.w / Wsum; continue }
    const [g0, s0] = CLASS_PRIOR[cls]
    const mu0 = Math.log(1 + g0 / 100) / 12, var0 = (s0 / 100) ** 2 / 12
    if (!usable) {
      assumed.push(cls)
      factors.push({ classes: [cls], weight: x.w / Wsum, mu: mu0, sigma: Math.sqrt(var0), logs: null, family: FAMILY[cls], proxyTer: 0 })
      continue
    }
    const logs = arr!.map((v) => Math.log(1 + v))
    const n = logs.length
    const m = mean(logs)
    let v = 0
    for (const l of logs) v += (l - m) ** 2
    v /= Math.max(1, n - 1)
    // a history shorter than ten years is pulled toward the class prior (36 months' weight); longer ones stand alone
    const k0 = n >= 120 ? 0 : PRIOR_MONTHS
    const mu = (n * m + k0 * mu0) / (n + k0)
    const variance = (n * v + k0 * var0) / (n + k0)
    factors.push({ classes: [cls], weight: x.w / Wsum, mu, sigma: Math.sqrt(Math.max(1e-10, variance)), logs, family: FAMILY[cls], proxyTer: proxyTerOf(cls) })
  }
  // Nearly riskless factors (cash: monthly volatility under 0.25%) add their mean every month instead of a random draw.
  const steady = factors.filter((f) => f.sigma < 0.0025)
  const risky = factors.filter((f) => f.sigma >= 0.0025)
  const steadyRet = steady.reduce((a, f) => a + f.weight * (Math.exp(f.mu + (f.sigma * f.sigma) / 2) - 1), 0)
  const k = risky.length

  // ---- correlations: the shared window when it is long enough, otherwise pairwise ----
  const C = new Float64Array(k * k)
  const withData = factors.filter((f) => f.logs)
  const riskyData = risky.filter((f) => f.logs)
  const common = riskyData.length ? Math.min(...riskyData.map((f) => f.logs!.length)) : 0
  for (let i = 0; i < k; i++) {
    C[i * k + i] = 1
    for (let j = 0; j < i; j++) {
      const a = risky[i], b = risky[j]
      let c: number
      if (a.logs && b.logs) {
        const n = common >= 36 ? common : Math.min(a.logs.length, b.logs.length)
        c = n >= 24 ? corrOf(a.logs.slice(a.logs.length - n), b.logs.slice(b.logs.length - n)) : priorCorr(a.family, b.family)
      } else c = priorCorr(a.family, b.family)
      C[i * k + j] = C[j * k + i] = c
    }
  }
  let L = cholesky(C, k)
  for (let s = 1; !L && s <= 20; s++) {
    const shrink = 1 - s * 0.05
    const D = new Float64Array(C)
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) if (i !== j) D[i * k + j] *= shrink
    L = cholesky(D, k)
  }
  if (!L) { L = new Float64Array(k * k); for (let i = 0; i < k; i++) L[i * k + i] = 1 }
  // packed lower triangle, row by row
  const Lp = new Float64Array((k * (k + 1)) / 2)
  for (let i = 0, n = 0; i < k; i++) for (let j = 0; j <= i; j++) Lp[n++] = L[i * k + j]

  const tStart = now()
  // ---- monthly portfolio returns, once per path ----
  // paths cover the longer of the two horizons; the value-preserving levels use their first H years
  const HS = Math.max(H, LONGEVITY_YEARS)
  const TS = HS * 12
  const R = new Float32Array(P * TS)
  generatePaths(R, P, TS, k, Lp, Float64Array.from(risky.map((f) => f.weight)), Float64Array.from(risky.map((f) => Math.exp(f.mu))),
    Float64Array.from(risky.map((f) => f.sigma)), steadyRet - feeDrag / 1200, seed)
  const tPaths = now()
  // ---- per path and year: growth over the year and whether sales are on hold (drawdown at the yearly review) ----
  const { G, hold, meanLog, varR } = yearly(R, P, TS, HS, noSellThr)

  // ---- the income-account cash flows for one path at a starting rate x; returns real end value / today's value ----
  const gm = 1 + mm / 12
  const g12 = Math.pow(gm, 12)
  const ann12 = Math.abs(mm) < 1e-9 ? 12 : (g12 - 1) / (mm / 12)
  const defl = Math.pow(1 + infl, H)
  const ZK = ZAKAT_GREGORIAN
  const run = (p: number, x: number, rec: Float64Array | null): number => {
    let Pv = V0, A = 0, prev = 0
    for (let y = 0; y < H; y++) {
      let I = x * (Pv + A)
      if (y > 0) { const lo = prev * (1 - band), hi = prev * (1 + band); if (I < lo) I = lo; else if (I > hi) I = hi }
      if (rec) rec[y] = I
      Pv -= (Pv * zf + A) * ZK
      if (Pv < 0) Pv = 0
      const target = tmY * I
      if (A < target && !hold[p * HS + y]) { let s = target - A; if (s > Pv) s = Pv; Pv -= s; A += s }
      const W = I / 12
      const Aend = A * g12 - W * ann12
      if (Aend >= 0) { A = Aend; Pv *= G[p * HS + y] }
      else {
        const base = p * TS + y * 12
        for (let m = 0; m < 12; m++) { Pv *= 1 + R[base + m]; A = A * gm - W; if (A < 0) { Pv += A; A = 0 } }
      }
      if (Pv <= 0) return 0
      prev = I
    }
    return (Pv + A) / defl / V0
  }

  // ---- «never runs out»: income constant in real terms for LONGEVITY_YEARS; real end value / today's, or −1 once spent ----
  const LY = LONGEVITY_YEARS
  const deflL = Math.pow(1 + infl, LY)
  const runLife = (p: number, x: number): number => {
    let Pv = V0, A = 0, prev = 0, grow = 1
    for (let y = 0; y < LY; y++) {
      let I = x * V0 * grow
      if (y > 0) { const lo = prev * (1 - band), hi = prev * (1 + band); if (I < lo) I = lo; else if (I > hi) I = hi }
      grow *= 1 + infl
      Pv -= (Pv * zf + A) * ZK
      if (Pv < 0) Pv = 0
      if (Pv + A <= 0) return -1
      const target = tmY * I
      if (A < target && !hold[p * HS + y]) { let s = target - A; if (s > Pv) s = Pv; Pv -= s; A += s }
      const W = I / 12
      const Aend = A * g12 - W * ann12
      if (Aend >= 0) { A = Aend; Pv *= G[p * HS + y] }
      else {
        const base = p * TS + y * 12
        for (let m = 0; m < 12; m++) {
          Pv *= 1 + R[base + m]
          A = A * gm - W
          if (A < 0) { Pv += A; A = 0 }
          if (Pv <= 0) return -1
        }
      }
      prev = I
    }
    return (Pv + A) / deflL / V0
  }

  const tGen = now()
  // ---- highest safe rate per path (bisection) ----
  const maxRate = new Float64Array(P)
  let failZero = 0
  for (let p = 0; p < P; p++) {
    if (run(p, 0, null) < 1) { maxRate[p] = 0; failZero++; continue }
    if (run(p, MAX_RATE, null) >= 1) { maxRate[p] = MAX_RATE; continue }
    let lo = 0, hi = MAX_RATE
    for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (run(p, mid, null) >= 1) lo = mid; else hi = mid }
    maxRate[p] = lo
  }
  const sorted = Float64Array.from(maxRate).sort()
  const rateAt = (c: number) => sorted[Math.min(P - 1, Math.max(0, Math.floor((1 - c) * P)))]
  // highest rate per path that never runs out (taking nothing never does)
  const lifeRate = new Float64Array(P)
  for (let p = 0; p < P; p++) {
    if (runLife(p, MAX_RATE) >= 0) { lifeRate[p] = MAX_RATE; continue }
    let lo = 0, hi = MAX_RATE
    for (let it = 0; it < 12; it++) { const mid = (lo + hi) / 2; if (runLife(p, mid) >= 0) lo = mid; else hi = mid }
    lifeRate[p] = lo
  }
  const lifeSorted = lifeRate.sort()
  const lifeAt = (c: number) => lifeSorted[Math.min(P - 1, Math.max(0, Math.floor((1 - c) * P)))]

  const tSolve = now()
  // ---- levels, with the median real growth at each rate ----
  const ends = new Float64Array(P)
  const levels: SustainLevel[] = CONFIDENCES.map((c) => {
    const x = rateAt(c)
    for (let p = 0; p < P; p++) ends[p] = run(p, x, null)
    const med = Float64Array.from(ends).sort()[Math.floor(P / 2)]
    // the amounts follow the rate as shown (rounded to 0.01 point)
    const pct = r2(x * 100)
    return { confidence: c, annualPct: pct, annual: (pct / 100) * V0, monthly: ((pct / 100) * V0) / 12, label: LEVEL_LABEL[c], medianGrowth: r2((med - 1) * 100) }
  })

  const longevity: SustainLevel[] = CONFIDENCES.map((c) => {
    const x = lifeAt(c)
    for (let p = 0; p < P; p++) ends[p] = runLife(p, x)
    const med = Float64Array.from(ends).sort()[Math.floor(P / 2)]
    const pct = r2(x * 100)
    return { confidence: c, annualPct: pct, annual: (pct / 100) * V0, monthly: ((pct / 100) * V0) / 12, label: LEVEL_LABEL[c], medianGrowth: r2(med < 0 ? -100 : (med - 1) * 100) }
  })

  // ---- stability at the most cautious level that pays an income ----
  const stableAt = CONFIDENCES.find((c) => rateAt(c) > 0) ?? 0
  const x90 = stableAt ? rateAt(stableAt) : 0
  const rec = new Float64Array(H)
  const changes = new Float64Array(P * Math.max(1, H - 1))
  let cuts = 0, nCh = 0
  if (x90 > 0 && H > 1) {
    for (let p = 0; p < P; p++) {
      run(p, x90, rec)
      for (let y = 1; y < H; y++) {
        const ch = rec[y - 1] > 0 ? rec[y] / rec[y - 1] - 1 : 0
        if (ch < -1e-9) cuts++
        changes[nCh++] = ch
      }
    }
  }
  const chSorted = changes.subarray(0, nCh).sort()
  const worst = nCh ? chSorted[Math.floor(0.05 * nCh)] : 0

  const tLevels = now()
  lastTimings.generate = tPaths - tStart; lastTimings.prep = tGen - tPaths; lastTimings.solve = tSolve - tGen; lastTimings.levels = tLevels - tSolve; lastTimings.total = tLevels - tStart
  // ---- the mix in history ----
  const wByClass: Partial<Record<AssetClass, number>> = {}
  for (const [cls, x] of byClass) wByClass[cls] = x.w
  const hist = mixHistory(wByClass, returns, feeDrag)
  const dd = hist.rets.length >= 12 ? maxDrawdownOf(hist.rets).pct : 0
  const meta = returnsMeta(returns)
  const months = hist.rets.length
  const to = meta?.end ?? ''
  const from = to && months ? addMonths(to, -(months - 1)) : ''

  // ---- zakat a Hijri year at today's value, on the zakatable share of the mix ----
  const zakatAnnual = V0 * zf * 0.025

  const stats = {
    meanReal: r2(((Math.exp(meanLog * 12)) / (1 + infl) - 1) * 100),
    vol: r2(Math.sqrt(varR) * Math.sqrt(12) * 100),
    maxDrawdown: r2(dd),
    months, from, to,
  }
  const inflTxt = `${r2(infl * 100)}%`
  let note: string
  if (!withData.length) note = `لا تتوفر بيانات تاريخية بعد؛ الأرقام من افتراضات عامة للفئات و${P} سيناريو لمدة ${yearsAr(H)}، بعد الزكاة وتضخم ${inflTxt} سنوياً.`
  else {
    const span = from && to ? `من ${from.slice(0, 4)} إلى ${to.slice(0, 4)}` : ''
    note = `من بيانات شهرية فعلية ${span} لمؤشرات تمثّل فئات خطتك، و${P} سيناريو لمدة ${yearsAr(H)}، بعد الزكاة وتضخم ${inflTxt} سنوياً.`.replace(/\s+/g, ' ')
    if (assumed.length) note = note.replace(/\.$/, `؛ ولـ«${assumed.map((c) => ASSET_CLASS_LABEL[c]).join('، ')}» افتراضات عامة لنقص البيانات.`)
  }
  return {
    levels, longevity, longevityYears: LONGEVITY_YEARS, zakatAnnual,
    stability: { cutYears: r2(nCh ? (cuts / nCh) * 100 : 0), worstChange: r2(worst * 100), confidence: stableAt },
    stats, note, assumed, failAtZero: r2((failZero / P) * 100),
  }
}

// =====================================================================================
// Building the input from a plan
// =====================================================================================
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})
const numOr = (v: unknown, d: number) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d }

/** Share of the value zakat is due on for a class, from the zakat guide (the cautious 1 when the guide has nothing). */
export function classZakatFactor(cls: AssetClass): number {
  const g = zakatDefault(cls)
  if (!g) return 1
  if (g.method === 'market') return 1
  if (g.method === 'zakatable_assets') return Math.min(100, Math.max(0, g.ratio ?? 100)) / 100
  return 0
}

export interface SustainPlanArgs {
  doc: PlanDoc | null
  holdings: Holding[]
  accounts: Account[]
  fx: Fx
  returns: Partial<Record<AssetClass, number[]>>
  sleeves?: Sleeve[]
  goals?: Goal[]
  curve?: Curve | null
  profiles?: Record<string, InstrumentProfile>
  /** 'income' = the weights of the phase in force when income starts; 'current' = today's holdings. Default: 'income' when the plan has weights */
  basis?: 'income' | 'current'
  /** plan value (SAR); default = main portfolio + income account */
  value?: number
  horizonYears?: number
}
export interface SustainPlanInput extends SustainInput { basis: 'income' | 'current'; phase: string | null }

/** The phase in force at `date` (phases sorted by start), else the last one. */
function phaseAt(phases: Array<Record<string, any>>, date: string | null): Record<string, any> | null {
  const ps = phases.filter((p) => typeof p?.start === 'string').sort((a, b) => String(a.start).localeCompare(String(b.start)))
  if (!ps.length) return null
  if (!date) return ps[ps.length - 1]
  let cur: Record<string, any> | null = null
  for (const p of ps) if (p.start <= date) cur = p
  return cur ?? ps[0]
}

/**
 * One call for the UI: SustainInput from the active plan (income-phase weights, its instruments' fees, zakat by class guide,
 * the income-account rule, inflation) or from today's holdings, plus the plan value.
 */
export function sustainInputFromPlan(a: SustainPlanArgs): SustainPlanInput {
  const doc = obj(a.doc as unknown)
  const income = a.doc ? obj(doc.income) : {}
  const rules = obj(doc.rules)
  const custom = customInstruments(a.doc)
  const excluded = new Set(a.accounts.filter((x) => x.exclude_from_portfolio).map((x) => x.id))
  const incomeGoals = new Set((a.goals ?? []).filter((g) => g.kind === 'income' && !g.archived).map((g) => g.id))
  const main = a.holdings.filter((h) => !h.archived && !h.goal_id && !(h.account_id && excluded.has(h.account_id)))
  const mainValue = main.reduce((s, h) => s + Math.max(0, holdingValue(h, a.fx)), 0)
  const accountValue = a.holdings.filter((h) => !h.archived && h.goal_id && incomeGoals.has(h.goal_id)).reduce((s, h) => s + Math.max(0, holdingValue(h, a.fx)), 0)
  const value = a.value ?? mainValue + accountValue

  // income-phase weights
  const planWeights: SustainInput['weights'] = []
  const phase = phaseAt(Array.isArray(doc.phases) ? doc.phases : [], typeof income.start === 'string' ? income.start : null)
  if (phase) {
    const w = obj(phase.weights)
    for (const ps of Array.isArray(doc.sleeves) ? doc.sleeves : []) {
      const s = obj(ps)
      const target = numOr(obj(w[s.key]).target, 0)
      if (!(target > 0)) continue
      const layer: Layer = ['growth', 'income', 'safety', 'hedge'].includes(s.layer) ? s.layer : 'growth'
      const cls: AssetClass = isAssetClass(s.class) ? s.class : guessClass(String(s.name ?? ''), layer)
      const ids: string[] = Array.isArray(s.instruments) ? s.instruments.filter((x: unknown): x is string => typeof x === 'string') : []
      const item = ids.map((id) => findInstrument(id, custom)).find((it): it is CatalogItem => !!it && it.ter != null) ?? null
      planWeights.push({ cls, weight: target, ter: item?.ter ?? DEFAULT_TER[cls], zakatFactor: item ? factorOfMethod(item.zakat?.method, item.zakat?.ratio, cls) : classZakatFactor(cls) })
    }
  }

  // today's holdings
  const curWeights: SustainInput['weights'] = []
  if (a.basis === 'current' || !planWeights.length) {
    const ctx = holdingContext({ doc: a.doc, sleeves: a.sleeves, goals: a.goals, profiles: a.profiles })
    const sleeveClass = planSleeveClasses(a.doc, a.sleeves ?? [])
    for (const h of main) {
      const v = holdingValue(h, a.fx)
      if (!(v > 0)) continue
      const cls = holdingClass(h, ctx)
      const it = instrumentOfHolding(h, ctx.custom)
      const ter = h.fee_pct != null && Number.isFinite(Number(h.fee_pct)) ? Number(h.fee_pct) : it?.ter ?? DEFAULT_TER[cls]
      curWeights.push({ cls, weight: v, ter, zakatFactor: zakatRuleOf(h, { custom, sleeveClass }).factor })
    }
  }
  const basis: 'income' | 'current' = a.basis === 'current' || !planWeights.length ? 'current' : 'income'
  const weights = basis === 'income' ? planWeights : curWeights

  const cash = a.returns.money_market ?? a.returns.cash
  const m3 = a.curve?.m3 ?? (cash && cash.length >= 12 ? mean(cash, cash.length - 12) * 1200 : 3)
  return {
    value,
    weights,
    returns: a.returns,
    inflation: numOr(rules.inflation_pct, 2),
    horizonYears: a.horizonYears ?? 10,
    rule: {
      bandPct: numOr(income.band_pct, 10),
      treasuryMonths: numOr(income.treasury_months, 12),
      noSellDrawdownPct: numOr(income.no_sell_drawdown_pct, 20),
      // the account sits in a money market fund: the 3-month yield less about half a point of fees
      mmRate: Math.max(0, r2(m3 - 0.5)),
    },
    basis,
    phase: basis === 'income' && phase ? String(phase.name ?? '') || null : null,
  }
}

function factorOfMethod(method: unknown, ratio: unknown, cls: AssetClass): number {
  if (method === 'market') return 1
  if (method === 'zakatable_assets') return Math.min(100, Math.max(0, numOr(ratio, 100))) / 100
  if (method === 'paid_by_entity' || method === 'income_only' || method === 'exempt') return 0
  return classZakatFactor(cls)
}

/** Cash classes earn the money-market rate; exported for the UI's labels. */
export const isCashClass = (c: AssetClass) => (CASH_CLASSES as string[]).includes(c)
