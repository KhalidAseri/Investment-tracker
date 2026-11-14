import type { AssetClass, Pick2, Settings } from '../types.ts'
import { ASSET_CLASSES, CLASS_LABEL } from '../labels.ts'
import { classTotals } from './exposure.ts'
import type { AssetView } from './valuation.ts'

export const DRIFT_THRESHOLD = 5

export interface DriftRow {
  assetClass: AssetClass
  label: string
  value: number
  actualPct: number
  targetPct: number
  /** Percentage points above (+) or below (-) target. */
  drift: number
}

export function driftRows(rows: AssetView[], settings: Settings, L: Pick2): DriftRow[] {
  const totals = classTotals(rows)
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  return ASSET_CLASSES.map((c) => {
    const actualPct = total > 0 ? (totals[c] / total) * 100 : 0
    const targetPct = settings.targets[c] ?? 0
    return { assetClass: c, label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), value: totals[c], actualPct, targetPct, drift: actualPct - targetPct }
  }).filter((r) => r.value > 0 || r.targetPct > 0)
}

export function maxDrift(rows: DriftRow[]): DriftRow | null {
  return rows.reduce<DriftRow | null>((m, r) => (!m || Math.abs(r.drift) > Math.abs(m.drift) ? r : m), null)
}

export interface ContributionLine {
  assetClass: AssetClass
  label: string
  amount: number
  /** Share of the class after the contribution. */
  afterPct: number
  targetPct: number
  suggestions: string[]
}

/**
 * Splits new money across asset classes to move toward the target allocation
 * without selling anything: the money goes to the classes that are short of
 * their target, in proportion to how short they are.
 */
export function allocateContribution(amount: number, rows: AssetView[], settings: Settings, L: Pick2): ContributionLine[] {
  if (!(amount > 0)) return []
  const totals = classTotals(rows)
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  const after = total + amount
  const targetSum = ASSET_CLASSES.reduce((s, c) => s + (settings.targets[c] ?? 0), 0) || 100

  const gaps = ASSET_CLASSES.map((c) => {
    const desired = (after * (settings.targets[c] ?? 0)) / targetSum
    return { c, gap: Math.max(0, desired - totals[c]) }
  })
  const gapSum = gaps.reduce((s, g) => s + g.gap, 0)

  const alloc = new Map<AssetClass, number>()
  if (gapSum <= 0) {
    for (const c of ASSET_CLASSES) alloc.set(c, (amount * (settings.targets[c] ?? 0)) / targetSum)
  } else {
    // gapSum always >= amount when targets sum to 100, so this never over-allocates.
    for (const g of gaps) alloc.set(g.c, (amount * g.gap) / gapSum)
  }

  return ASSET_CLASSES.map((c) => {
    const amt = alloc.get(c) ?? 0
    const held = rows.filter((r) => r.asset.assetClass === c && !r.asset.isEmergencyFund)
    // Prefer diversified funds, then the smallest existing positions, as destinations.
    const suggestions = [...held]
      .sort((a, b) => Number(b.asset.isFund) - Number(a.asset.isFund) || a.value - b.value)
      .slice(0, 3)
      .map((r) => r.asset.name)
    return {
      assetClass: c,
      label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en),
      amount: amt,
      afterPct: after > 0 ? ((totals[c] + amt) / after) * 100 : 0,
      targetPct: ((settings.targets[c] ?? 0) / targetSum) * 100,
      suggestions,
    }
  }).filter((l) => l.amount > 0.5)
}

/** Where to take a withdrawal from: overweight classes first, then pro-rata. */
export function allocateWithdrawal(amount: number, rows: AssetView[], settings: Settings, L: Pick2): ContributionLine[] {
  if (!(amount > 0)) return []
  const totals = classTotals(rows)
  const total = Object.values(totals).reduce((s, v) => s + v, 0)
  if (total <= 0) return []
  const after = Math.max(0, total - amount)
  const targetSum = ASSET_CLASSES.reduce((s, c) => s + (settings.targets[c] ?? 0), 0) || 100
  const excess = ASSET_CLASSES.map((c) => ({ c, x: Math.max(0, totals[c] - (after * (settings.targets[c] ?? 0)) / targetSum) }))
  const excessSum = excess.reduce((s, e) => s + e.x, 0)
  return ASSET_CLASSES.map((c) => {
    const share = excessSum > 0 ? (excess.find((e) => e.c === c)!.x / excessSum) : totals[c] / total
    const amt = Math.min(totals[c], amount * share)
    return {
      assetClass: c,
      label: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en),
      amount: amt,
      afterPct: after > 0 ? ((totals[c] - amt) / after) * 100 : 0,
      targetPct: ((settings.targets[c] ?? 0) / targetSum) * 100,
      suggestions: [],
    }
  }).filter((l) => l.amount > 0.5)
}
