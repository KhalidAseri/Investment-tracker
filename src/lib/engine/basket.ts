// A portfolio defined by weights: the holder states what their share is worth and how it is split;
// each component becomes a holding sized to its share, so the portfolio then moves with its prices.

import type { Asset, AssetClass, Quotes, Region } from '../types.ts'
import { DEFAULT_ZAKAT_PERCENT, defaultZakatMode } from '../labels.ts'
import { fxRate, unitsFromValue, type AssetView } from './valuation.ts'

export interface BasketPart {
  /** The existing asset when editing; absent for a new component. */
  id?: string
  name: string
  /** null = a component with no market price (cash, a private fund). */
  symbol: string | null
  /** Percent of the portfolio. */
  weight: number
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  isFund: boolean
  domicile: string
}

type Holding = Pick<Asset, 'quantity' | 'manualValue' | 'costBasis' | 'valueUpdatedAt' | 'unitsEstimated'> & Partial<Pick<Asset, 'lastPrice' | 'valueAnchor'>>
export type NewBasketAsset = Omit<Asset, 'id' | 'accountId' | 'createdAt' | 'updatedAt'>
export interface BasketPlan { create: NewBasketAsset[]; update: { id: string; patch: Partial<Asset> }[]; remove: string[] }

/** Splits a total by weights; the weights need not sum to exactly 100. */
export function shareValues(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  return weights.map((w) => (sum > 0 ? (total * Math.max(0, w)) / sum : 0))
}

/** Brings weights to exactly 100, keeping their proportions; the last one absorbs the rounding. */
export function normalizeWeights(weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + Math.max(0, w), 0)
  if (sum <= 0) return weights.map(() => 0)
  const out = weights.map((w) => Math.round((Math.max(0, w) / sum) * 10000) / 100)
  out[out.length - 1] = Math.round((100 - out.slice(0, -1).reduce((s, w) => s + w, 0)) * 100) / 100
  return out
}

/**
 * The holding that is worth `valueBase` (in the base currency) for one component. Priced: units at
 * the current price, or the stated value kept until a first price arrives. Unpriced: a manual value.
 */
export function holdingFor(c: { symbol: string | null; currency: string; priceFactor?: number }, valueBase: number, costBase: number, quotes: Quotes, fx: Record<string, number>): Holding {
  const rate = fxRate(c.currency, fx)
  const at = new Date().toISOString()
  const cost = Math.max(0, costBase / rate)
  if (!c.symbol) return { quantity: 0, manualValue: valueBase / rate, costBasis: cost, valueUpdatedAt: at, unitsEstimated: false, valueAnchor: undefined }
  const q = quotes[c.symbol]
  const unit = q && q.price > 0 ? q.price * (c.priceFactor || 1) * fxRate(q.currency || c.currency, fx) : 0
  if (unit > 0) return { quantity: unitsFromValue(valueBase, unit), manualValue: 0, costBasis: cost, valueUpdatedAt: at, unitsEstimated: true, lastPrice: q.price, valueAnchor: undefined }
  return { quantity: 0, manualValue: 0, costBasis: cost, valueUpdatedAt: at, unitsEstimated: true, valueAnchor: valueBase / rate }
}

/**
 * Sets the portfolio to `total` split by the parts' weights, at today's prices. Components that are
 * new are created, ones that are gone are removed, and the money invested is spread by weight.
 */
export function planBasket(existing: Asset[], parts: BasketPart[], total: number, costTotal: number, quotes: Quotes, fx: Record<string, number>): BasketPlan {
  const values = shareValues(total, parts.map((p) => p.weight))
  const costs = shareValues(costTotal, parts.map((p) => p.weight))
  const plan: BasketPlan = { create: [], update: [], remove: [] }
  const kept = new Set<string>()
  parts.forEach((p, i) => {
    const old = p.id ? existing.find((a) => a.id === p.id) : undefined
    if (old) {
      kept.add(old.id)
      plan.update.push({ id: old.id, patch: { ...holdingFor(old, values[i], costs[i], quotes, fx), basketWeight: p.weight } })
      return
    }
    const pricing = p.symbol ? 'live' as const : 'manual' as const
    plan.create.push({
      name: p.name.trim(), symbol: p.symbol, assetClass: p.assetClass, region: p.region, sector: p.sector, currency: p.currency, pricing,
      priceFactor: 1, isFund: p.isFund, isEmergencyFund: false, domicile: p.domicile,
      zakatMode: defaultZakatMode({ assetClass: p.assetClass, region: p.region, isFund: p.isFund, symbol: p.symbol, pricing }), zakatPercent: DEFAULT_ZAKAT_PERCENT,
      basketWeight: p.weight,
      ...holdingFor(p, values[i], costs[i], quotes, fx),
    })
  })
  plan.remove = existing.filter((a) => !kept.has(a.id)).map((a) => a.id)
  return plan
}

/**
 * Re-states what the whole portfolio is worth without touching its weights: every holding is
 * scaled by the same factor, so the proportions the prices have drifted to are kept.
 */
export function scaleBasket(rows: AssetView[], total: number, costTotal: number, quotes: Quotes, fx: Record<string, number>): BasketPlan {
  const now = rows.reduce((s, r) => s + r.value, 0)
  const costNow = rows.reduce((s, r) => s + r.cost, 0)
  const values = now > 0 ? rows.map((r) => (r.value / now) * total) : shareValues(total, rows.map(() => 1))
  const costs = costNow > 0 ? rows.map((r) => (r.cost / costNow) * costTotal) : values.map((v) => (total > 0 ? (v / total) * costTotal : 0))
  return { create: [], remove: [], update: rows.map((r, i) => ({ id: r.asset.id, patch: holdingFor(r.asset, values[i], costs[i], quotes, fx) })) }
}

/** What the money invested becomes when the portfolio's value is re-stated. */
export function costAfter(why: 'gain' | 'in' | 'out', costNow: number, valueNow: number, valueNew: number): number {
  if (why === 'in') return costNow + Math.max(0, valueNew - valueNow)
  if (why === 'out') return valueNow > 0 ? costNow * Math.min(1, valueNew / valueNow) : costNow
  return costNow
}
