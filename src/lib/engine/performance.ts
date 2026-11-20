export interface Point { day: string; close: number }

export interface Performance {
  /** First and last points of the window. */
  start: Point
  end: Point
  /** Price return over the window, percent. */
  returnPct: number
  /** Compound annual rate over the window, percent; null for windows under ~11 months (annualising them misleads). */
  cagrPct: number | null
  high: Point
  low: Point
  /** Largest fall from a running peak to a later trough, percent (negative or 0). */
  maxDrawdownPct: number
  drawdownPeak: Point | null
  drawdownTrough: Point | null
  /** Distance of the last price below the window's high, percent (negative or 0). */
  fromHighPct: number
}

const DAY = 86400000
const t = (d: string) => new Date(d + 'T00:00:00Z').getTime()

/** Keeps the points on or after `since` (YYYY-MM-DD), sorted, de-duplicated by day, positive closes only. */
export function window(points: Point[], since?: string): Point[] {
  const byDay = new Map<string, number>()
  for (const p of points) if (p.close > 0 && (!since || p.day >= since)) byDay.set(p.day, p.close)
  return Array.from(byDay, ([day, close]) => ({ day, close })).sort((a, b) => a.day.localeCompare(b.day))
}

export function performance(points: Point[]): Performance | null {
  const s = window(points)
  if (s.length < 2) return null
  const start = s[0], end = s[s.length - 1]
  const years = (t(end.day) - t(start.day)) / (365.25 * DAY)
  let high = start, low = start, peak = start
  let maxDd = 0, ddPeak: Point | null = null, ddTrough: Point | null = null
  for (const p of s) {
    if (p.close > high.close) high = p
    if (p.close < low.close) low = p
    if (p.close > peak.close) peak = p
    const dd = (p.close / peak.close - 1) * 100
    if (dd < maxDd) { maxDd = dd; ddPeak = peak; ddTrough = p }
  }
  return {
    start, end,
    returnPct: (end.close / start.close - 1) * 100,
    cagrPct: years >= 0.9 ? (Math.pow(end.close / start.close, 1 / years) - 1) * 100 : null,
    high, low,
    maxDrawdownPct: maxDd,
    drawdownPeak: ddPeak,
    drawdownTrough: ddTrough,
    fromHighPct: (end.close / high.close - 1) * 100,
  }
}

/** Start date of a look-back window ending on `asOf`. */
export function since(range: '1m' | '3m' | '1y' | '5y' | 'max', asOf = new Date()): string | undefined {
  if (range === 'max') return undefined
  const d = new Date(asOf)
  if (range === '1m') d.setMonth(d.getMonth() - 1)
  if (range === '3m') d.setMonth(d.getMonth() - 3)
  if (range === '1y') d.setFullYear(d.getFullYear() - 1)
  if (range === '5y') d.setFullYear(d.getFullYear() - 5)
  return d.toISOString().slice(0, 10)
}

/**
 * A manual asset has no market prices; its value history is the sequence of value updates the
 * user recorded, adjusted for money added or taken out so deposits are not mistaken for growth.
 * Returns an index that starts at 100.
 */
export function manualIndex(events: { day: string; type: 'DEPOSIT' | 'WITHDRAW' | 'VALUE_UPDATE'; amount: number; valueAfter: number }[]): Point[] {
  const sorted = [...events].sort((a, b) => a.day.localeCompare(b.day))
  const out: Point[] = []
  let index = 100
  let prevValue = 0
  for (const e of sorted) {
    if (e.type === 'VALUE_UPDATE' && prevValue > 0) index *= e.valueAfter / prevValue
    // a deposit or withdrawal changes the value but not the index
    if (prevValue > 0 || e.valueAfter > 0) out.push({ day: e.day, close: index })
    prevValue = e.valueAfter
  }
  return window(out)
}

/**
 * The price to use for a purchase made on `day`: the last close on or before it, or the first
 * close after it when the series starts later. `exact` is false when that close is more than a
 * week away from the day, so the caller can say the units are approximate.
 */
export function priceOn(points: Point[], day: string): { price: number; day: string; exact: boolean } | null {
  const s = window(points)
  if (s.length === 0) return null
  let pick = s[0]
  for (const p of s) { if (p.day <= day) pick = p; else break }
  return { price: pick.close, day: pick.day, exact: Math.abs(t(pick.day) - t(day)) <= 7 * DAY }
}

export interface Holding { symbol: string | null; /** Units × price factor × FX to the base currency. */ unitsInBase: number; /** Value today in the base currency. */ value: number }

/**
 * What today's holdings were worth on each of `days`: priced holdings at that day's close (on a
 * line between closes where the series has gaps), everything else at its value today. The last day is today's actual value.
 * It answers «how did what I own now move», not «what did I own then».
 */
export function holdingsSeries(holdings: Holding[], histories: Record<string, Point[]>, days: string[]): Point[] {
  const sorted: Record<string, Point[]> = {}
  for (const [k, v] of Object.entries(histories)) sorted[k] = window(v)
  return days.map((day, i) => {
    let total = 0
    for (const h of holdings) {
      const series = h.symbol ? sorted[h.symbol] : undefined
      if (i === days.length - 1 || !series || series.length < 2) { total += h.value; continue }
      total += between(series, day) * h.unitsInBase
    }
    return { day, close: total }
  })
}

/**
 * A price for a day inside a series that may be sparse (a fund valued monthly): on a straight line
 * between the closes either side of it, so the curve does not move in steps. Outside the series,
 * the nearest close.
 */
export function between(series: Point[], day: string): number {
  if (day <= series[0].day) return series[0].close
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i]
    if (day <= b.day) {
      const span = t(b.day) - t(a.day)
      return span > 0 ? a.close + ((b.close - a.close) * (t(day) - t(a.day))) / span : b.close
    }
  }
  return series[series.length - 1].close
}

/** The last `n` calendar days ending today, oldest first. */
export function lastDays(n: number, now = new Date()): string[] {
  return Array.from({ length: n }, (_, i) => new Date(now.getTime() - (n - 1 - i) * DAY).toISOString().slice(0, 10))
}
