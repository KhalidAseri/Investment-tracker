import type { Quotes } from '../types.ts'
import type { AssetView } from './valuation.ts'

/**
 * How current an asset's figure is, and who has to act when it is not:
 *   live       a market price from the last few sessions
 *   published  a fund valuation its manager published recently
 *   stated     a value the holder entered recently
 *   stale      any of the above, too old
 *   missing    a priced asset with no price at all
 */
export type Fresh = 'live' | 'published' | 'stated' | 'stale' | 'missing'
export interface AssetFreshness {
  state: Fresh
  /** YYYY-MM-DD the figure refers to. */
  asOf: string | null
  ageDays: number | null
  /** Only the holder can fix it (a hand-entered value), as opposed to the next price update. */
  needsUser: boolean
}

const DAY = 86400000
/** A long weekend can leave a market price five days old and still be the latest. */
export const LIVE_MAX_DAYS = 5
/** Fund valuations are published a day or two late; ten days old means updates have stopped. */
export const PUBLISHED_MAX_DAYS = 10
export const STATED_MAX_DAYS = 30

const age = (iso: string | null | undefined, now: number): number | null => {
  if (!iso) return null
  const t = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / DAY)) : null
}
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null)

export function assetFreshness(row: AssetView, quotes: Quotes, now = Date.now()): AssetFreshness {
  const a = row.asset
  const stated = (): AssetFreshness => {
    const d = age(a.valueUpdatedAt, now)
    const old = d === null || d > STATED_MAX_DAYS
    return { state: old ? 'stale' : 'stated', asOf: day(a.valueUpdatedAt), ageDays: d, needsUser: old }
  }
  if (a.pricing !== 'live') return stated()
  if ((a.valueAnchor ?? 0) > 0) return stated()
  const q = a.symbol ? quotes[a.symbol] : undefined
  if (q && q.price > 0) {
    const asOf = q.asOf ?? day(q.updatedAt)
    const d = age(asOf, now)
    const published = q.origin === 'claude'
    const old = d === null || d > (published ? PUBLISHED_MAX_DAYS : LIVE_MAX_DAYS)
    return { state: old ? 'stale' : published ? 'published' : 'live', asOf, ageDays: d, needsUser: false }
  }
  if ((a.lastPrice ?? 0) > 0) return stated()
  return { state: 'missing', asOf: null, ageDays: null, needsUser: true }
}

export interface PortfolioFreshness {
  /** Share of the portfolio's value whose figure is current, 0–100. */
  pct: number
  stale: AssetView[]
  /** The stale ones only the holder can update, largest first. */
  needsUser: AssetView[]
}

export function portfolioFreshness(rows: AssetView[], quotes: Quotes, now = Date.now()): PortfolioFreshness {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0)
  const stale: AssetView[] = []
  const needsUser: AssetView[] = []
  let fresh = 0
  for (const r of rows) {
    if (r.value <= 0) continue
    const f = assetFreshness(r, quotes, now)
    if (f.state === 'stale' || f.state === 'missing') { stale.push(r); if (f.needsUser) needsUser.push(r) } else fresh += r.value
  }
  needsUser.sort((x, y) => y.value - x.value)
  return { pct: total > 0 ? (fresh / total) * 100 : 100, stale, needsUser }
}
