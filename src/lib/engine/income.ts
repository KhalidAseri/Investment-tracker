import type { Pick2, Settings, Snapshot } from '../types.ts'
import type { AssetView } from './valuation.ts'
import { allocateWithdrawal, type ContributionLine } from './guidance.ts'

// The income plan rests on one inequality:
//   expected return >= income withdrawn + zakat + inflation
// Whatever is left over is real growth. A negative remainder means capital is being consumed,
// even when dividends happen to cover the withdrawal.

export interface Balance {
  expectedReturn: number
  inflation: number
  zakatRate: number
  incomeRate: number
  /** Real growth left after inflation, zakat and income — percent of the portfolio per year. */
  growth: number
  /** Highest income rate that leaves growth at zero. */
  maxIncomeRate: number
  sustainable: boolean
}

export function balanceEquation(expectedReturn: number, inflation: number, zakatRate: number, incomeRate: number): Balance {
  const maxIncomeRate = expectedReturn - inflation - zakatRate
  const growth = maxIncomeRate - incomeRate
  return { expectedReturn, inflation, zakatRate, incomeRate, growth, maxIncomeRate, sustainable: growth >= -1e-9 }
}

/** Zakat as a percent of the investable portfolio: the user's planning figure, or what the holdings actually imply. */
export function effectiveZakatRate(zakatDue: number, investable: number, settings: Settings): number {
  if (settings.income.zakatRateOverride >= 0) return settings.income.zakatRateOverride
  return investable > 0 ? (zakatDue / investable) * 100 : 0
}

export function requiredPortfolio(monthlyIncome: number, incomeRate: number): number {
  return incomeRate > 0 ? (monthlyIncome * 12) / (incomeRate / 100) : 0
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
  suggested: number
}

export function guardrail(annualIncome: number, current: number, upper: number, lower: number): Guardrail {
  if (!(annualIncome > 0) || !(current > 0)) return { state: 'none', ratePct: 0, suggested: annualIncome }
  const ratePct = (annualIncome / current) * 100
  if (ratePct > upper) return { state: 'cut', ratePct, suggested: annualIncome * 0.9 }
  if (ratePct < lower) return { state: 'raise', ratePct, suggested: annualIncome * 1.1 }
  return { state: 'ok', ratePct, suggested: annualIncome }
}

// ---- The yearly transfer, done on the zakat date ----

export interface TransferPlan {
  smoothed: number
  smoothedMonths: number
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
  const baseIncome = smoothed * (inc.rate / 100)
  let income = baseIncome
  let rule: TransferPlan['rule'] = 'none'

  // No raise in a year the portfolio lost value.
  const yearAgo = new Date(now)
  yearAgo.setFullYear(yearAgo.getFullYear() - 1)
  const before = snapshots.find((s) => s.month === monthKey(yearAgo))
  if (inc.annualIncome > 0 && before && current < snapValue(before) && income > inc.annualIncome) {
    income = inc.annualIncome
    rule = 'held'
  }
  const g = guardrail(income, current, inc.upper, inc.lower)
  if (g.state === 'cut' || g.state === 'raise') {
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
    smoothed, smoothedMonths: months, baseIncome, income, monthly: income / 12, rule, zakat: zakatDue, transfer,
    inAccount: lay.income.value, need, drawdownPct, marketDown, fromReserve,
    sells: allocateWithdrawal(need - fromReserve, sellFrom, settings, L),
  }
}

/** Portfolio value in today's money while the plan runs, growing at whatever the equation leaves over. */
export function growthSeries(start: number, growthPct: number, years = 30, now = new Date()): { x: number; y: number }[] {
  return Array.from({ length: years + 1 }, (_, i) => ({ x: now.getFullYear() + i, y: start * Math.pow(1 + growthPct / 100, i) }))
}
