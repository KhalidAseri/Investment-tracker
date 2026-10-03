import { DAY_MS, type HistoryPoint } from './history'

/**
 * Where gold is likely to be a month from now — as a range, not a number.
 *
 * Nobody can call next month's gold price, and an app that pretended to would
 * be the least trustworthy thing in it. What *can* be estimated honestly is how
 * far the price usually moves in a month (its volatility), plus a small tilt
 * from the recent trend. So the forecast is a cone:
 *
 *   median(t) = P0 · exp(drift · t / H)
 *   band(t)   = median(t) · exp(± z · σ · √t)
 *
 * σ is the daily volatility of log returns (a blend of the last 60 days and
 * the whole year, so one calm or wild month doesn't swing it). The drift is
 * the last 60 days' trend, shrunk to 30% — momentum in gold persists only
 * weakly — and capped at half a standard deviation, so the trend can lean the
 * cone but never outweigh the uncertainty.
 *
 * `backtest` replays the same method over the year it was given and reports
 * how often the band actually held the price, and how often the direction was
 * right. The screen shows those numbers next to the forecast, so its accuracy
 * is stated, not implied.
 */

export type Direction = 'up' | 'down' | 'flat'

export interface ForecastPoint {
  t: number
  median: number
  lo80: number
  hi80: number
  lo50: number
  hi50: number
}

export interface Forecast {
  horizonDays: number
  /** The price the cone starts from, USD/oz. */
  start: HistoryPoint
  /** Daily volatility of log returns. */
  sigmaDaily: number
  /** Expected log change over the whole horizon. */
  drift: number
  /** Model probability the price ends the horizon higher than it starts. */
  pUp: number
  direction: Direction
  /** One point per day, day 0 (= start) to `horizonDays`. */
  path: ForecastPoint[]
  end: ForecastPoint
  signals: {
    /** Fractional change over the last 30 days, null if the series is short. */
    change30: number | null
    /** Fractional distance of the price above (+) or below (−) its 50-day average. */
    vsSma50: number | null
    /** The 60-day trend, as a fractional change per 30 days. */
    trendPerMonth: number
    /** One standard deviation of a month's move, as a fraction. */
    monthlyVol: number
  }
}

const Z80 = 1.2816
const Z50 = 0.6745
const TREND_WINDOW_DAYS = 60
const VOL_WINDOW_DAYS = 60
const TREND_SHRINK = 0.3
const DRIFT_CAP_SIGMAS = 0.5
/** pUp beyond 50% ± this reads as a lean; inside it, "no clear direction". */
const DIRECTION_DEADBAND = 0.05

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
  const erf = 1 - poly * Math.exp(-x * x)
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

function since(points: HistoryPoint[], days: number): HistoryPoint[] {
  const from = points[points.length - 1].t - days * DAY_MS
  return points.filter((p) => p.t >= from)
}

/**
 * Daily volatility from a possibly irregular series: each return is scaled by
 * √(days elapsed), so a weekly series gives the same σ as a daily one.
 */
function dailySigma(points: HistoryPoint[]): number {
  const scaled: number[] = []
  for (let i = 1; i < points.length; i++) {
    const days = (points[i].t - points[i - 1].t) / DAY_MS
    if (days <= 0) continue
    scaled.push(Math.log(points[i].usd / points[i - 1].usd) / Math.sqrt(days))
  }
  if (scaled.length < 2) return 0
  const mean = scaled.reduce((s, x) => s + x, 0) / scaled.length
  const variance = scaled.reduce((s, x) => s + (x - mean) ** 2, 0) / (scaled.length - 1)
  return Math.sqrt(variance)
}

/** Least-squares slope of log price against time, per day. */
function logSlopePerDay(points: HistoryPoint[]): number {
  if (points.length < 2) return 0
  const xs = points.map((p) => p.t / DAY_MS)
  const ys = points.map((p) => Math.log(p.usd))
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length
  const my = ys.reduce((s, y) => s + y, 0) / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  return den > 0 ? num / den : 0
}

/** The point at or just before `t`. */
function valueAt(points: HistoryPoint[], t: number): HistoryPoint | null {
  let found: HistoryPoint | null = null
  for (const p of points) {
    if (p.t <= t) found = p
    else break
  }
  return found
}

export function forecast(points: HistoryPoint[], horizonDays = 30): Forecast | null {
  if (points.length < 10) return null
  const start = points[points.length - 1]
  const P0 = start.usd

  const sigmaRecent = dailySigma(since(points, VOL_WINDOW_DAYS))
  const sigmaAll = dailySigma(points)
  const sigmaDaily =
    sigmaRecent > 0 ? Math.sqrt((sigmaRecent ** 2 + sigmaAll ** 2) / 2) : sigmaAll

  const slope = logSlopePerDay(since(points, TREND_WINDOW_DAYS))
  const horizonSigma = sigmaDaily * Math.sqrt(horizonDays)
  const cap = DRIFT_CAP_SIGMAS * horizonSigma
  const drift = Math.max(-cap, Math.min(cap, TREND_SHRINK * slope * horizonDays))

  const pUp = horizonSigma > 0 ? normalCdf(drift / horizonSigma) : 0.5
  const direction: Direction =
    pUp >= 0.5 + DIRECTION_DEADBAND ? 'up' : pUp <= 0.5 - DIRECTION_DEADBAND ? 'down' : 'flat'

  const path: ForecastPoint[] = []
  for (let d = 0; d <= horizonDays; d++) {
    const median = P0 * Math.exp((drift * d) / horizonDays)
    const spread = sigmaDaily * Math.sqrt(d)
    path.push({
      t: start.t + d * DAY_MS,
      median,
      lo80: median * Math.exp(-Z80 * spread),
      hi80: median * Math.exp(Z80 * spread),
      lo50: median * Math.exp(-Z50 * spread),
      hi50: median * Math.exp(Z50 * spread),
    })
  }

  const monthAgo = valueAt(points, start.t - 30 * DAY_MS)
  const last50 = since(points, 50)
  const sma50 = last50.reduce((s, p) => s + p.usd, 0) / last50.length
  const coversFifty = start.t - points[0].t >= 50 * DAY_MS

  return {
    horizonDays,
    start,
    sigmaDaily,
    drift,
    pUp,
    direction,
    path,
    end: path[path.length - 1],
    signals: {
      change30: monthAgo ? P0 / monthAgo.usd - 1 : null,
      vsSma50: coversFifty ? P0 / sma50 - 1 : null,
      trendPerMonth: Math.exp(slope * 30) - 1,
      monthlyVol: Math.exp(sigmaDaily * Math.sqrt(30)) - 1,
    },
  }
}

export interface Backtest {
  /** Forecasts replayed whose horizon has already passed. */
  samples: number
  /** Share of those where the actual price ended inside the 80% band. */
  coverage80: number
  /** Share where the direction call (when one was made) was right. */
  directionHitRate: number | null
  directionCalls: number
}

/**
 * Replay the forecast from every past day that had at least `warmupDays` of
 * history behind it and a full horizon after it, and score it against what
 * actually happened.
 */
export function backtest(
  points: HistoryPoint[],
  horizonDays = 30,
  warmupDays = 90
): Backtest | null {
  if (points.length < 10) return null
  const first = points[0].t
  let samples = 0
  let inside = 0
  let calls = 0
  let hits = 0

  for (let i = 0; i < points.length; i++) {
    if (points[i].t - first < warmupDays * DAY_MS) continue
    const target = points[i].t + horizonDays * DAY_MS
    const actual = points.find((p) => p.t >= target)
    // Skip if the series has a hole where the answer should be.
    if (!actual || actual.t - target > 10 * DAY_MS) break

    const f = forecast(points.slice(0, i + 1), horizonDays)
    if (!f) continue
    samples++
    if (actual.usd >= f.end.lo80 && actual.usd <= f.end.hi80) inside++
    if (f.direction !== 'flat') {
      calls++
      const wentUp = actual.usd > f.start.usd
      if (wentUp === (f.direction === 'up')) hits++
    }
  }

  if (samples === 0) return null
  return {
    samples,
    coverage80: inside / samples,
    directionHitRate: calls > 0 ? hits / calls : null,
    directionCalls: calls,
  }
}

export interface WindowStats {
  first: HistoryPoint
  last: HistoryPoint
  change: number
  high: HistoryPoint
  low: HistoryPoint
}

/** Change, high and low over the last `days` of the series. */
export function windowStats(points: HistoryPoint[], days: number): WindowStats | null {
  if (points.length === 0) return null
  const slice = since(points, days)
  const first = slice[0]
  const last = slice[slice.length - 1]
  let high = first
  let low = first
  for (const p of slice) {
    if (p.usd > high.usd) high = p
    if (p.usd < low.usd) low = p
  }
  return { first, last, change: last.usd / first.usd - 1, high, low }
}
