import type { Pick2, Settings, Snapshot } from '../types.ts'
import type { AssetView } from './valuation.ts'
import { allocateWithdrawal, type ContributionLine } from './guidance.ts'
import { incomeRate } from './plan.ts'

// The income plan is one subtraction:
//   income = expected return - zakat - inflation - the real growth the user wants to keep
// Zakat is a flat planning figure until zakat day, when the actual figure from the assets replaces it;
// a lower actual zakat therefore raises the income and leaves the growth target untouched.

export interface Balance {
  expectedReturn: number
  zakatRate: number
  inflation: number
  growthTarget: number
  /** What is left for income, percent of the portfolio per year (0 when nothing is left). */
  incomeRate: number
  /** The raw remainder; negative when the return cannot cover zakat, inflation and the growth target. */
  remainder: number
  feasible: boolean
}

export function balanceEquation(expectedReturn: number, zakatRate: number, inflation: number, growthTarget: number): Balance {
  const remainder = expectedReturn - zakatRate - inflation - growthTarget
  return { expectedReturn, zakatRate, inflation, growthTarget, incomeRate: incomeRate(expectedReturn, zakatRate, inflation, growthTarget), remainder, feasible: remainder > 1e-9 }
}

/** Zakat actually implied by the holdings, as a percent of the investable portfolio. */
export function actualZakatRate(zakatDue: number, investable: number): number {
  return investable > 0 ? (zakatDue / investable) * 100 : 0
}

export function requiredPortfolio(monthlyIncome: number, ratePct: number): number {
  return ratePct > 0 ? (monthlyIncome * 12) / (ratePct / 100) : 0
}

// ---- The three layers ----

export interface Layers {
  income: { value: number; target: number }
  reserve: { value: number; target: number }
  growth: { value: number }
}

export const isReserve = (r: AssetView) => !r.asset.isIncomeAccount && (r.asset.assetClass === 'FIXED_INCOME' || r.asset.assetClass === 'CASH')

/** `rows` is the investable portfolio (emergency fund already excluded). */
export function layers(rows: AssetView[], annualIncome: number, zakatDue: number, reserveYears: number): Layers {
  const sum = (pred: (r: AssetView) => boolean) => rows.filter(pred).reduce((s, r) => s + r.value, 0)
  return {
    income: { value: sum((r) => !!r.asset.isIncomeAccount), target: annualIncome + zakatDue },
    reserve: { value: sum(isReserve), target: annualIncome * reserveYears },
    growth: { value: sum((r) => !r.asset.isIncomeAccount && !isReserve(r)) },
  }
}

// ---- Smoothing and guardrails ----

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const snapValue = (s: Snapshot) => s.investable ?? s.netWorth

/** Average investable value over the last 36 months (monthly snapshots plus today), so income does not swing with the market. */
export function smoothedValue(snapshots: Snapshot[], current: number, now = new Date()): { value: number; months: number } {
  const from = new Date(now)
  from.setMonth(from.getMonth() - 35)
  const lo = monthKey(from)
  const cur = monthKey(now)
  const past = snapshots.filter((s) => s.month >= lo && s.month < cur).map(snapValue)
  const all = [...past, current]
  return { value: all.reduce((s, v) => s + v, 0) / all.length, months: all.length }
}

export interface Guardrail {
  state: 'none' | 'ok' | 'cut' | 'raise'
  /** The income as a percent of the current portfolio value. */
  ratePct: number
  upper: number
  lower: number
  suggested: number
}

// Bounds scale with the plan's own income rate (5% and 3% around a 3.5% plan).
const UPPER_FACTOR = 5 / 3.5
const LOWER_FACTOR = 3 / 3.5

/** Cut 10% when income has grown past the upper bound of today's value, raise 10% when it has fallen below the lower one. */
export function guardrail(annualIncome: number, current: number, planRatePct: number): Guardrail {
  const upper = planRatePct * UPPER_FACTOR
  const lower = planRatePct * LOWER_FACTOR
  if (!(annualIncome > 0) || !(current > 0) || !(planRatePct > 0)) return { state: 'none', ratePct: 0, upper, lower, suggested: annualIncome }
  const ratePct = (annualIncome / current) * 100
  if (ratePct > upper) return { state: 'cut', ratePct, upper, lower, suggested: annualIncome * 0.9 }
  if (ratePct < lower) return { state: 'raise', ratePct, upper, lower, suggested: annualIncome * 1.1 }
  return { state: 'ok', ratePct, upper, lower, suggested: annualIncome }
}

// ---- The yearly transfer, done on the zakat date ----

export interface TransferPlan {
  smoothed: number
  smoothedMonths: number
  /** Actual zakat as a percent of the portfolio, and the income rate left after it. */
  zakatRatePct: number
  ratePct: number
  /** rate x smoothed value, before any rule is applied. */
  baseIncome: number
  /** Income for the coming year after the rules. */
  income: number
  monthly: number
  rule: 'none' | 'cut' | 'raise' | 'held'
  zakat: number
  /** income + zakat: what the income account must hold after the transfer. */
  transfer: number
  inAccount: number
  /** What still has to be moved into the income account. */
  need: number
  drawdownPct: number
  marketDown: boolean
  fromReserve: number
  sells: ContributionLine[]
}

export function annualTransfer(
  rows: AssetView[],
  zakatDue: number,
  snapshots: Snapshot[],
  settings: Settings,
  L: Pick2,
  now = new Date(),
): TransferPlan {
  const inc = settings.income
  const current = rows.reduce((s, r) => s + r.value, 0)
  const { value: smoothed, months } = smoothedValue(snapshots, current, now)
  const zakatRatePct = actualZakatRate(zakatDue, current)
  const ratePct = incomeRate(settings.goal.expectedReturn, zakatRatePct, settings.goal.inflation, inc.growthTarget)
  const baseIncome = smoothed * (ratePct / 100)
  let income = baseIncome
  let rule: TransferPlan['rule'] = 'none'

  const yearAgo = new Date(now)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const before = snapshots.find((s) => s.month === monthKey(yearAgo))
  const lossYear = !!before && current < snapValue(before)
  // No raise in a year the portfolio lost value.
  if (inc.annualIncome > 0 && lossYear && income > inc.annualIncome) {
    income = inc.annualIncome
    rule = 'held'
  }
  const g = guardrail(income, current, ratePct)
  if (g.state === 'cut' || (g.state === 'raise' && !lossYear)) {
    income = g.suggested
    rule = g.state
  }

  const cutoff = monthKey(yearAgo)
  const peak = Math.max(current, ...snapshots.filter((s) => s.month >= cutoff).map(snapValue))
  const drawdownPct = peak > 0 ? ((peak - current) / peak) * 100 : 0
  const marketDown = drawdownPct >= inc.drawdownTrigger

  const lay = layers(rows, income, zakatDue, inc.reserveYears)
  const transfer = income + zakatDue
  const need = Math.max(0, transfer - lay.income.value)
  const outside = rows.filter((r) => !r.asset.isIncomeAccount)
  // In a deep drop the growth layer is left alone: refill from the reserve first.
  const fromReserve = marketDown ? Math.min(need, lay.reserve.value) : 0
  const sellFrom = marketDown ? outside.filter((r) => !isReserve(r)) : outside
  return {
    smoothed, smoothedMonths: months, zakatRatePct, ratePct, baseIncome, income, monthly: income / 12, rule, zakat: zakatDue, transfer,
    inAccount: lay.income.value, need, drawdownPct, marketDown, fromReserve,
    sells: allocateWithdrawal(need - fromReserve, sellFrom, settings, L),
  }
}

// ---- Plan vs actual, shown on zakat day ----

export interface YearEnd {
  zakatPlanned: number
  zakatActual: number
  zakatPlannedPct: number
  zakatActualPct: number
  incomeRatePlanned: number
  incomeRateActual: number
  incomePlanned: number
  incomeActual: number
  growthTarget: number
  /** Last year's return net of money added or withdrawn, then net of inflation; null without a snapshot from a year ago. */
  realizedPct: number | null
  realizedRealPct: number | null
  /** Change in income against last year's, and the same after inflation; null on the first transfer. */
  incomeChangePct: number | null
  incomeRealChangePct: number | null
}

export function yearEndSummary(t: TransferPlan, current: number, investedNow: number, snapshots: Snapshot[], settings: Settings, now = new Date()): YearEnd {
  const inc = settings.income
  const incomeRatePlanned = incomeRate(settings.goal.expectedReturn, inc.planZakatRate, settings.goal.inflation, inc.growthTarget)
  const yearAgo = new Date(now)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const before = snapshots.find((s) => s.month === monthKey(yearAgo))
  let realizedPct: number | null = null
  if (before && snapValue(before) > 0) {
    const added = investedNow - before.invested
    realizedPct = ((current - snapValue(before) - added) / snapValue(before)) * 100
  }
  const incomeChangePct = inc.annualIncome > 0 ? ((t.income - inc.annualIncome) / inc.annualIncome) * 100 : null
  return {
    zakatPlanned: current * (inc.planZakatRate / 100),
    zakatActual: t.zakat,
    zakatPlannedPct: inc.planZakatRate,
    zakatActualPct: t.zakatRatePct,
    incomeRatePlanned,
    incomeRateActual: t.ratePct,
    incomePlanned: t.smoothed * (incomeRatePlanned / 100),
    incomeActual: t.income,
    growthTarget: inc.growthTarget,
    realizedPct,
    realizedRealPct: realizedPct === null ? null : realizedPct - settings.goal.inflation,
    incomeChangePct,
    incomeRealChangePct: incomeChangePct === null ? null : incomeChangePct - settings.goal.inflation,
  }
}

/** Portfolio value in today's money while the plan runs, growing at whatever the equation leaves over. */
export function growthSeries(start: number, growthPct: number, years = 30, now = new Date()): { x: number; y: number }[] {
  return Array.from({ length: years + 1 }, (_, i) => ({ x: now.getFullYear() + i, y: start * Math.pow(1 + growthPct / 100, i) }))
}
