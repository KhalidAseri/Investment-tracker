import { describe, expect, it } from 'vitest'
import { backtest, forecast, normalCdf, windowStats } from '../forecast'
import { cleanSeries, DAY_MS, type HistoryPoint } from '../history'

/** Deterministic PRNG so the random walks are the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** Standard normal draws via Box–Muller. */
function normals(seed: number) {
  const r = rng(seed)
  return () => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r())
}

const T0 = Date.UTC(2025, 9, 1)

function walk({
  days = 366,
  start = 4000,
  sigma = 0.012,
  driftPerDay = 0,
  seed = 1,
  stepDays = 1,
}: Partial<{ days: number; start: number; sigma: number; driftPerDay: number; seed: number; stepDays: number }>) {
  const z = normals(seed)
  const points: HistoryPoint[] = []
  let price = start
  for (let d = 0; d < days; d += stepDays) {
    points.push({ t: T0 + d * DAY_MS, usd: price })
    for (let k = 0; k < stepDays; k++) price *= Math.exp(driftPerDay + sigma * z())
  }
  return points
}

describe('normalCdf', () => {
  it('matches known values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.2816)).toBeCloseTo(0.9, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
})

describe('cleanSeries', () => {
  it('sorts, keeps the latest reading per day and drops nonsense', () => {
    const cleaned = cleanSeries([
      { t: T0 + DAY_MS + 5, usd: 4010 },
      { t: T0, usd: 4000 },
      { t: T0 + DAY_MS + 9, usd: 4020 },
      { t: T0 + 2 * DAY_MS, usd: 0 },
      { t: Number.NaN, usd: 4000 },
    ])
    expect(cleaned.map((p) => p.usd)).toEqual([4000, 4020])
  })
})

describe('forecast', () => {
  it('returns null for a series too short to say anything', () => {
    expect(forecast(walk({ days: 5 }))).toBeNull()
  })

  it('starts at the last price and widens with the square root of time', () => {
    const points = walk({ seed: 3 })
    const f = forecast(points)!
    expect(f.path).toHaveLength(31)
    expect(f.path[0].median).toBeCloseTo(points[points.length - 1].usd, 6)
    expect(f.path[0].lo80).toBeCloseTo(f.path[0].hi80, 6)

    const width = (d: number) => Math.log(f.path[d].hi80 / f.path[d].median)
    expect(width(28) / width(7)).toBeCloseTo(2, 5)
    for (const p of f.path) {
      expect(p.lo80).toBeLessThanOrEqual(p.lo50)
      expect(p.lo50).toBeLessThanOrEqual(p.median)
      expect(p.median).toBeLessThanOrEqual(p.hi50)
      expect(p.hi50).toBeLessThanOrEqual(p.hi80)
    }
  })

  it('recovers the volatility it was generated with', () => {
    const f = forecast(walk({ sigma: 0.012, seed: 7 }))!
    expect(f.sigmaDaily).toBeGreaterThan(0.010)
    expect(f.sigmaDaily).toBeLessThan(0.014)
  })

  it('gives the same volatility from a weekly series as a daily one', () => {
    const daily = forecast(walk({ sigma: 0.012, seed: 11 }))!
    const weekly = forecast(walk({ sigma: 0.012, seed: 11, stepDays: 7 }))!
    expect(weekly.sigmaDaily / daily.sigmaDaily).toBeGreaterThan(0.7)
    expect(weekly.sigmaDaily / daily.sigmaDaily).toBeLessThan(1.3)
  })

  it('leans with a strong trend but never past the cap', () => {
    const up = forecast(walk({ sigma: 0.004, driftPerDay: 0.004, seed: 5 }))!
    expect(up.direction).toBe('up')
    expect(up.pUp).toBeGreaterThan(0.55)
    // Drift is capped at half a standard deviation of the month's move.
    expect(up.pUp).toBeLessThanOrEqual(normalCdf(0.5) + 1e-9)

    const down = forecast(walk({ sigma: 0.004, driftPerDay: -0.004, seed: 5 }))!
    expect(down.direction).toBe('down')
    expect(down.pUp).toBeLessThan(0.45)
  })

  it('calls no direction on a dead-flat market', () => {
    const flat = Array.from({ length: 200 }, (_, d) => ({
      t: T0 + d * DAY_MS,
      usd: 4000 * (1 + 0.001 * Math.sin(d)),
    }))
    const f = forecast(flat)!
    expect(f.direction).toBe('flat')
    expect(f.pUp).toBeCloseTo(0.5, 1)
  })

  it('reports the recent signals', () => {
    const points = walk({ seed: 9 })
    const f = forecast(points)!
    const last = points[points.length - 1].usd
    const monthAgo = points[points.length - 31].usd
    expect(f.signals.change30).toBeCloseTo(last / monthAgo - 1, 9)
    expect(f.signals.vsSma50).not.toBeNull()
    expect(f.signals.monthlyVol).toBeGreaterThan(0)
  })
})

describe('backtest', () => {
  it('finds the 80% band holds about 80% of the time on a random walk', () => {
    // Average over several walks — one year is only ~245 overlapping months.
    const runs = [1, 2, 3, 4, 5, 6].map((seed) => backtest(walk({ seed, days: 500 }))!)
    const coverage = runs.reduce((s, r) => s + r.coverage80, 0) / runs.length
    expect(coverage).toBeGreaterThan(0.7)
    expect(coverage).toBeLessThan(0.92)
    expect(runs[0].samples).toBeGreaterThan(300)
  })

  it('returns null when no forecast has matured yet', () => {
    expect(backtest(walk({ days: 100 }))).toBeNull()
  })
})

describe('windowStats', () => {
  it('finds change, high and low within the window only', () => {
    const points = [4000, 5000, 4200, 4400, 4100].map((usd, d) => ({ t: T0 + d * 10 * DAY_MS, usd }))
    const s = windowStats(points, 25)!
    expect(s.first.usd).toBe(4200)
    expect(s.high.usd).toBe(4400)
    expect(s.low.usd).toBe(4100)
    expect(s.change).toBeCloseTo(4100 / 4200 - 1, 9)
  })
})
