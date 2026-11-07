import type { Account, Fx, Holding, Layer, MoneyEvent, PlanSettings, Sleeve, Snapshot } from './types'

export const LAYER_NAMES: Record<Layer, string> = {
  growth: 'النمو',
  income: 'الدخل',
  safety: 'الأمان والسيولة',
  hedge: 'التحوط',
}
export const LAYER_ORDER: Layer[] = ['growth', 'income', 'safety', 'hedge']

// ---------- values ----------
export const rateOf = (cur: string | null | undefined, fx: Fx) => fx[String(cur || 'SAR').toUpperCase()] ?? 1

export const holdingValue = (h: Holding, fx: Fx) =>
  h.archived ? 0 : (Number(h.quantity) || 0) * (Number(h.price) || 0) * rateOf(h.currency, fx)

export interface Totals {
  total: number
  bySleeve: Record<string, number>
  byLayer: Record<Layer, number>
  byAccount: Record<string, number>
  outside: number
  unassigned: number
  /** value held in each goal portfolio (not part of the independence total) */
  goals: Record<string, number>
}

export function computeTotals(holdings: Holding[], accounts: Account[], sleeves: Sleeve[], fx: Fx): Totals {
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const sleeveLayer = new Map(sleeves.map((s) => [s.id, s.layer]))
  const t: Totals = {
    total: 0, bySleeve: {}, byLayer: { growth: 0, income: 0, safety: 0, hedge: 0 }, byAccount: {}, outside: 0, unassigned: 0, goals: {},
  }
  for (const h of holdings) {
    const v = holdingValue(h, fx)
    if (!v) continue
    if (h.goal_id) { t.goals[h.goal_id] = (t.goals[h.goal_id] ?? 0) + v; continue }
    if (h.account_id && excluded.has(h.account_id)) { t.outside += v; continue }
    t.total += v
    if (h.account_id) t.byAccount[h.account_id] = (t.byAccount[h.account_id] ?? 0) + v
    const layer = h.sleeve_id ? sleeveLayer.get(h.sleeve_id) : undefined
    if (h.sleeve_id && layer) {
      t.bySleeve[h.sleeve_id] = (t.bySleeve[h.sleeve_id] ?? 0) + v
      t.byLayer[layer] += v
    } else t.unassigned += v
  }
  return t
}

// ---------- time ----------
export const yearFrac = (d = new Date()) => {
  const start = new Date(d.getFullYear(), 0, 1).getTime()
  const end = new Date(d.getFullYear() + 1, 0, 1).getTime()
  return d.getFullYear() + (d.getTime() - start) / (end - start)
}

// ---------- targets & glide path ----------
/** 0 before the glide starts, 1 at the independence year, linear in between. */
export function glideProgress(s: PlanSettings, at = yearFrac()) {
  const a = s.glide_start_year
  const b = s.independence_year
  if (at <= a) return 0
  if (at >= b || b <= a) return 1
  return (at - a) / (b - a)
}

export function currentTarget(sl: Sleeve, s: PlanSettings, at = yearFrac()) {
  const p = glideProgress(s, at)
  return sl.target_now + (sl.target_fi - sl.target_now) * p
}

export interface Drift {
  sleeve: Sleeve
  value: number
  actual: number // %
  target: number // %
  diff: number // percentage points
  gapValue: number // SAR needed to reach target (negative = over)
}

export function drifts(sleeves: Sleeve[], totals: Totals, s: PlanSettings): Drift[] {
  const total = totals.total || 0
  return sleeves.map((sl) => {
    const value = totals.bySleeve[sl.id] ?? 0
    const actual = total ? (value / total) * 100 : 0
    const target = currentTarget(sl, s)
    return { sleeve: sl, value, actual, target, diff: actual - target, gapValue: (target / 100) * total - value }
  })
}

// ---------- goal & projection ----------
export function annualNeedToday(s: PlanSettings) {
  return s.monthly_income_target * 12 + (s.include_mortgage ? s.mortgage_monthly * 12 : 0)
}
export const targetCapitalToday = (s: PlanSettings, rate = s.withdrawal_rate) => annualNeedToday(s) / (rate / 100)
export const targetNominal = (s: PlanSettings, year: number, rate = s.withdrawal_rate) =>
  targetCapitalToday(s, rate) * Math.pow(1 + s.inflation_rate / 100, Math.max(0, year - yearFrac()))

export interface ProjPoint { year: number; low: number; mid: number; high: number; target: number; contributing: boolean }

/** Year-end values from today, contributions stop once the mid path reaches the target if stopAtFi. */
export function project(s: PlanSettings, startValue: number, years = 22, contributionOverride?: number): ProjPoint[] {
  const now = new Date()
  const y0 = now.getFullYear()
  const remain = 1 - (yearFrac(now) - y0) // fraction of this year left
  const c0 = contributionOverride ?? s.annual_contribution
  const g = s.contribution_growth / 100
  const rates = [s.return_low, s.expected_return, s.return_high].map((r) => r / 100)
  const vals = [startValue, startValue, startValue]
  const out: ProjPoint[] = [{ year: yearFrac(now), low: startValue, mid: startValue, high: startValue, target: targetNominal(s, yearFrac(now)), contributing: true }]
  for (let k = 0; k <= years; k++) {
    const year = y0 + k
    const span = k === 0 ? remain : 1
    const contrib = k === 0 ? c0 * remain : c0 * Math.pow(1 + g, k)
    for (let i = 0; i < 3; i++) vals[i] = vals[i] * Math.pow(1 + rates[i], span) + contrib
    out.push({ year: year + 1, low: vals[0], mid: vals[1], high: vals[2], target: targetNominal(s, year + 1), contributing: true })
  }
  return out
}

export function fiYear(points: ProjPoint[], key: 'low' | 'mid' | 'high' = 'mid'): number | null {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (b[key] >= b.target) {
      // interpolate inside the year
      const da = a[key] - a.target
      const db = b[key] - b.target
      const t = da >= 0 ? 0 : -da / (db - da)
      return a.year + (b.year - a.year) * t
    }
  }
  return null
}

/** Annual contribution (first year, growing) needed to reach the target by `year` on the mid path. */
export function requiredContribution(s: PlanSettings, startValue: number, year: number): number {
  let lo = 0, hi = 5_000_000
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2
    const pts = project(s, startValue, Math.max(1, Math.ceil(year - new Date().getFullYear()) + 1), c)
    const p = pts.find((x) => x.year >= year) ?? pts[pts.length - 1]
    if (p.mid >= p.target) hi = c
    else lo = c
  }
  return hi
}

/** Planned value at a date, following the plan from the baseline with the expected return. */
export function plannedValueAt(s: PlanSettings, at = new Date()): number | null {
  if (s.baseline_value == null || !s.baseline_date) return null
  const b = new Date(s.baseline_date + 'T12:00:00')
  const t = (at.getTime() - b.getTime()) / (365.25 * 86400000)
  if (t <= 0) return s.baseline_value
  const r = s.expected_return / 100
  const g = s.contribution_growth / 100
  let v = s.baseline_value
  let c = s.annual_contribution
  let left = t
  while (left > 0) {
    const span = Math.min(1, left)
    v = v * Math.pow(1 + r, span) + c * span
    c *= 1 + g
    left -= span
  }
  return v
}

export function plannedPath(s: PlanSettings, untilYear: number): Array<{ year: number; value: number }> {
  if (s.baseline_value == null || !s.baseline_date) return []
  const b = new Date(s.baseline_date + 'T12:00:00')
  const out: Array<{ year: number; value: number }> = []
  for (let y = yearFrac(b); y <= untilYear + 0.001; y += 0.25) {
    const d = new Date(b.getTime() + (y - yearFrac(b)) * 365.25 * 86400000)
    out.push({ year: y, value: plannedValueAt(s, d) ?? 0 })
  }
  return out
}

// ---------- income after independence ----------
export interface IncomeYear { year: number; value: number; incomeMonthlyReal: number; incomeMonthlyNominal: number; rate: number }

/**
 * Withdrawal rule from the guide: take `withdrawal_rate` of the January value,
 * but never change income by more than `guard_cut` % from the previous year.
 */
export function simulateIncome(s: PlanSettings, startValue: number, annualReturn: number, years = 35, shockFirstYear = 0): IncomeYear[] {
  const infl = s.inflation_rate / 100
  const band = s.guard_cut / 100
  const out: IncomeYear[] = []
  let v = startValue
  let prev = 0
  for (let k = 0; k < years; k++) {
    const base = v * (s.withdrawal_rate / 100)
    let w = k === 0 ? base : Math.min(prev * (1 + band), Math.max(prev * (1 - band), base))
    w = Math.min(w, v)
    const r = k === 0 && shockFirstYear ? shockFirstYear / 100 : annualReturn / 100
    out.push({ year: k, value: v, incomeMonthlyNominal: w / 12, incomeMonthlyReal: w / 12 / Math.pow(1 + infl, k), rate: v > 0 ? (w / v) * 100 : 0 })
    v = Math.max(0, (v - w) * (1 + r))
    prev = w
  }
  return out
}

// ---------- current withdrawal status ----------
export function withdrawalStatus(s: PlanSettings, snapshots: Snapshot[], total: number, safetyValue: number) {
  const last12 = snapshots.filter((x) => new Date(x.snap_date).getTime() >= Date.now() - 365 * 86400000)
  const avg = last12.length ? last12.reduce((a, x) => a + Number(x.total_sar), 0) / last12.length : total
  const peak = Math.max(total, ...snapshots.map((x) => Number(x.total_sar)))
  const drawdown = peak > 0 ? ((peak - total) / peak) * 100 : 0
  const annual = avg * (s.withdrawal_rate / 100)
  const monthly = annual / 12
  const reserveMonths = monthly > 0 ? safetyValue / monthly : 0
  const guard = drawdown > s.guard_drawdown ? 'cut' : 'normal'
  return { avg, peak, drawdown, annual, monthly, reserveMonths, guard }
}

// ---------- deposit planner ----------
export interface DepositLine { sleeve: Sleeve; amount: number; after: number; afterPct: number; target: number }

export function planDeposit(amount: number, sleeves: Sleeve[], totals: Totals, s: PlanSettings, mode: 'gaps' | 'weights'): DepositLine[] {
  const eligible = sleeves.filter((x) => x.accepts_new_money)
  const newTotal = totals.total + amount
  const targets = new Map(sleeves.map((x) => [x.id, currentTarget(x, s)]))
  const alloc = new Map<string, number>()
  const wSum = eligible.reduce((a, x) => a + (targets.get(x.id) ?? 0), 0) || 1
  if (mode === 'weights') {
    for (const x of eligible) alloc.set(x.id, (amount * (targets.get(x.id) ?? 0)) / wSum)
  } else {
    const gaps = eligible.map((x) => ({ x, gap: Math.max(0, ((targets.get(x.id) ?? 0) / 100) * newTotal - (totals.bySleeve[x.id] ?? 0)) }))
    const gapSum = gaps.reduce((a, g) => a + g.gap, 0)
    if (gapSum >= amount && gapSum > 0) {
      for (const g of gaps) alloc.set(g.x.id, (amount * g.gap) / gapSum)
    } else {
      const rest = amount - gapSum
      for (const g of gaps) alloc.set(g.x.id, g.gap + (rest * (targets.get(g.x.id) ?? 0)) / wSum)
    }
  }
  // round to 100 SAR, push the rounding remainder into the largest line
  const lines = sleeves.map((x) => ({ x, a: Math.round((alloc.get(x.id) ?? 0) / 100) * 100 }))
  const diff = Math.round(amount) - lines.reduce((a, l) => a + l.a, 0)
  const biggest = lines.reduce((m, l) => (l.a > m.a ? l : m), lines[0])
  if (biggest) biggest.a += diff
  return lines.map(({ x, a }) => {
    const after = (totals.bySleeve[x.id] ?? 0) + a
    return { sleeve: x, amount: Math.max(0, a), after, afterPct: newTotal ? (after / newTotal) * 100 : 0, target: targets.get(x.id) ?? 0 }
  })
}

// ---------- zakat ----------
export const ZAKAT_RATE = 2.5
/** 2.5% of every holding marked zakatable (the owner decides per holding; Saudi stocks are his call). */
export function zakatEstimate(holdings: Holding[], fx: Fx) {
  let base = 0
  let exempt = 0
  const items: Array<{ holding: Holding; value: number }> = []
  for (const h of holdings) {
    const v = holdingValue(h, fx)
    if (v <= 0) continue
    if (h.zakatable === false) { exempt += v; continue }
    base += v
    items.push({ holding: h, value: v })
  }
  return { amount: (base * ZAKAT_RATE) / 100, base, exempt, items: items.sort((a, b) => b.value - a.value) }
}

// ---------- calendar ----------
export interface Occurrence { event: MoneyEvent; date: string }

export function upcoming(events: MoneyEvent[], fromISO: string, days: number): Occurrence[] {
  const from = new Date(fromISO + 'T00:00:00')
  const to = new Date(from.getTime() + days * 86400000)
  const out: Occurrence[] = []
  for (const e of events) {
    let d = new Date(e.event_date + 'T12:00:00')
    if (e.recurrence === 'none') {
      if (!e.done && d >= from && d <= to) out.push({ event: e, date: e.event_date })
      continue
    }
    let guard = 0
    while (d < from && guard++ < 600) d = step(d, e.recurrence)
    while (d <= to && guard++ < 1200) {
      out.push({ event: e, date: iso(d) })
      d = step(d, e.recurrence)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
const step = (d: Date, r: 'monthly' | 'yearly') => {
  const n = new Date(d)
  if (r === 'monthly') n.setMonth(n.getMonth() + 1)
  else n.setFullYear(n.getFullYear() + 1)
  return n
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const ageAt = (s: PlanSettings, year: number) => Math.floor(year - s.birth_year)
