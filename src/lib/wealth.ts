import { holdingValue, rateOf } from './calc'
import type { Account, DebtKind, Fx, Holding, Obligation, OtherAsset, OtherAssetKind, Region, Snapshot, Transaction } from './types'

// ---------- labels ----------
export const REGION_LABEL: Record<Region, string> = {
  SA: 'السعودية', GCC: 'الخليج', US: 'أمريكا', GLOBAL: 'عالمي متنوع', EM: 'أسواق ناشئة', OTHER: 'أخرى',
}
export const DEBT_LABEL: Record<DebtKind, string> = {
  mortgage: 'تمويل عقاري', personal_loan: 'تمويل شخصي', advance: 'سلفة', car: 'تمويل سيارة', card: 'بطاقة ائتمانية', other: 'أخرى',
}
export const ASSET_KIND_LABEL: Record<OtherAssetKind, string> = {
  real_estate: 'عقار', land: 'أرض', vehicle: 'سيارة', business: 'نشاط تجاري', other: 'أخرى',
}
const CUR_LABEL: Record<string, string> = { SAR: 'ريال سعودي', USD: 'دولار أمريكي', GBP: 'جنيه إسترليني', GBp: 'جنيه إسترليني', EUR: 'يورو', AED: 'درهم إماراتي', KWD: 'دينار كويتي' }
export const currencyLabel = (c: string) => CUR_LABEL[c] ?? CUR_LABEL[c.toUpperCase()] ?? c

// ---------- region ----------
/** Best guess of where a holding's money is invested; the owner can correct it per holding. */
export function guessRegion(h: Pick<Holding, 'symbol' | 'name' | 'currency'>): Region {
  const sym = (h.symbol ?? '').toUpperCase()
  const name = (h.name ?? '').toLowerCase()
  if (/world|global|عالمي|msci acwi|all.?country/.test(name)) return 'GLOBAL'
  if (/emerging|ناشئ/.test(name)) return 'EM'
  if (/gcc|خليج/.test(name)) return 'GCC'
  if (sym.endsWith('.SR') || /سعود|الراجحي|البلاد|الأهلي|الانماء|الإنماء|جدوى|دراهم|صكوك|مرابح|ريت/.test(name)) return 'SA'
  if (/s&p|usa|u\.s\.|nasdaq|america|أمريك/.test(name)) return 'US'
  if (sym.endsWith('.AE') || sym.endsWith('.KW') || sym.endsWith('.QA') || sym.endsWith('.AD')) return 'GCC'
  if (sym.endsWith('.L')) return 'GLOBAL'
  if (sym && !sym.includes('.') && (h.currency ?? '').toUpperCase() === 'USD') return 'US'
  if ((h.currency ?? 'SAR').toUpperCase() === 'SAR') return 'SA'
  return 'OTHER'
}
export const regionOf = (h: Holding): Region => h.region ?? guessRegion(h)

// ---------- exposure ----------
export interface Slice { key: string; label: string; value: number; pct: number }
const toSlices = (m: Map<string, { label: string; value: number }>, total: number): Slice[] =>
  [...m.entries()].map(([key, v]) => ({ key, label: v.label, value: v.value, pct: total ? (v.value / total) * 100 : 0 })).sort((a, b) => b.value - a.value)

/** Where the invested money is: by custodian location, by currency, and by market. Goal portfolios included. */
export function exposure(holdings: Holding[], accounts: Account[], fx: Fx) {
  const acc = new Map(accounts.map((a) => [a.id, a]))
  const custody = new Map<string, { label: string; value: number }>()
  const currency = new Map<string, { label: string; value: number }>()
  const region = new Map<string, { label: string; value: number }>()
  let total = 0
  const add = (m: Map<string, { label: string; value: number }>, key: string, label: string, v: number) => {
    const cur = m.get(key) ?? { label, value: 0 }
    cur.value += v
    m.set(key, cur)
  }
  for (const h of holdings) {
    const v = holdingValue(h, fx)
    if (v <= 0) continue
    total += v
    const a = h.account_id ? acc.get(h.account_id) : undefined
    const c = a?.country ?? (a?.is_ibkr ? 'INTL' : 'SA')
    add(custody, c, c === 'INTL' ? 'حسابات خارج السعودية' : 'حسابات داخل السعودية', v)
    const cur = (h.currency || 'SAR').toUpperCase() === 'GBP' ? 'GBP' : (h.currency || 'SAR').toUpperCase()
    add(currency, cur, currencyLabel(cur), v)
    const r = regionOf(h)
    add(region, r, REGION_LABEL[r], v)
  }
  return { total, custody: toSlices(custody, total), currency: toSlices(currency, total), region: toSlices(region, total) }
}

// ---------- debts ----------
export interface DebtView {
  debt: Obligation
  balance: number
  /** months left at the current instalment, null when it cannot be worked out */
  months: number | null
  payoffDate: string | null
  /** profit/interest still to be paid, estimated */
  interestLeft: number | null
}

/** Balance today, rolled forward from the date it was entered by the monthly instalments paid since. */
export function debtView(o: Obligation, today = new Date()): DebtView {
  const pay = Number(o.monthly_amount) || 0
  const r = (Number(o.rate_pct) || 0) / 100 / 12
  let bal = Number(o.balance) || 0
  if (o.balance != null && o.balance_date) {
    const d0 = new Date(o.balance_date + 'T12:00:00')
    let months = (today.getFullYear() - d0.getFullYear()) * 12 + (today.getMonth() - d0.getMonth())
    if (today.getDate() < d0.getDate()) months--
    for (let i = 0; i < Math.max(0, months) && bal > 0; i++) bal = Math.max(0, bal * (1 + r) - pay)
  }
  if (o.balance == null) {
    // only an instalment and an end year: remaining = instalments left
    if (!o.end_year || !pay) return { debt: o, balance: 0, months: null, payoffDate: null, interestLeft: null }
    const left = Math.max(0, (o.end_year - today.getFullYear()) * 12 + (12 - today.getMonth()))
    return { debt: o, balance: 0, months: left, payoffDate: `${o.end_year}-12-01`, interestLeft: null }
  }
  if (bal <= 0) return { debt: o, balance: 0, months: 0, payoffDate: null, interestLeft: 0 }
  if (!pay || pay <= bal * r) return { debt: o, balance: bal, months: null, payoffDate: null, interestLeft: null }
  let b = bal, n = 0, paid = 0
  while (b > 0.5 && n < 600) { const p = Math.min(pay, b * (1 + r)); b = b * (1 + r) - p; paid += p; n++ }
  const end = new Date(today.getFullYear(), today.getMonth() + n, 1)
  return { debt: o, balance: bal, months: n, payoffDate: `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-01`, interestLeft: Math.max(0, paid - bal) }
}

/** Months saved and profit saved by paying `extra` more each month. */
export function payoffWithExtra(o: Obligation, extra: number) {
  const base = debtView(o)
  if (base.months == null || !base.balance || extra <= 0) return null
  const faster = debtView({ ...o, balance: base.balance, balance_date: null, monthly_amount: Number(o.monthly_amount) + extra })
  if (faster.months == null) return null
  return { months: faster.months, saved: base.months - faster.months, interestSaved: (base.interestLeft ?? 0) - (faster.interestLeft ?? 0), payoffDate: faster.payoffDate }
}

// ---------- other assets ----------
/** Value today, grown from its entered date by its yearly change rate if one is set. */
export function otherAssetValue(a: OtherAsset, today = new Date()) {
  const v = Number(a.value) || 0
  const g = Number(a.appreciation_pct) || 0
  if (!g || !a.value_date) return v
  const yrs = (today.getTime() - new Date(a.value_date + 'T12:00:00').getTime()) / (365.25 * 86400000)
  return yrs > 0 ? v * Math.pow(1 + g / 100, yrs) : v
}

// ---------- net worth ----------
export function netWorth(args: { invested: number; goals: number; outside: number; otherAssets: OtherAsset[]; obligations: Obligation[] }) {
  const other = args.otherAssets.reduce((s, a) => s + otherAssetValue(a), 0)
  const debts = args.obligations.map((o) => debtView(o)).filter((d) => d.balance > 0)
  const owed = debts.reduce((s, d) => s + d.balance, 0)
  const assets = args.invested + args.goals + args.outside + other
  return { assets, other, owed, debts, net: assets - owed }
}

// ---------- performance ----------
/** Money that came in from outside (+) or went out to the owner (−). Buys, sells and dividends stay inside. */
export function externalFlow(t: Transaction): number {
  const a = Math.abs(Number(t.amount_sar) || 0)
  if (t.kind === 'deposit') return a
  if (t.kind === 'withdrawal' || t.kind === 'income') return -a
  // an asset you already owned, added to (or removed from) the app: not a gain or a loss
  if (t.kind === 'transfer') return Number(t.amount_sar) || 0
  return 0
}

export interface PerfPoint { date: string; value: number; /** cumulative time-weighted return, % */ twr: number }
export interface Performance {
  points: PerfPoint[]
  start: string | null
  startValue: number
  endValue: number
  netFlows: number
  /** gain in riyals after removing deposits and withdrawals */
  gain: number
  twr: number
  /** yearly rate, only when the period is long enough to mean something */
  annualized: number | null
  days: number
}

/**
 * Time-weighted return over the daily snapshots (Modified Dietz between snapshots, flows counted at half weight),
 * so deposits and withdrawals don't count as gains or losses.
 */
export function performance(snapshots: Snapshot[], transactions: Transaction[], fromISO?: string, currentValue?: number, today?: string): Performance {
  const snaps = snapshots.filter((s) => Number(s.total_sar) > 0 && (!fromISO || s.snap_date >= fromISO)).map((s) => ({ date: s.snap_date, value: Number(s.total_sar) }))
  const live = currentValue != null && !!today && currentValue > 0
  if (live && today && currentValue != null) {
    if (snaps.length && snaps[snaps.length - 1].date === today) snaps[snaps.length - 1].value = currentValue
    else if (!snaps.length || snaps[snaps.length - 1].date < today) snaps.push({ date: today, value: currentValue })
  }
  const empty: Performance = { points: [], start: null, startValue: 0, endValue: currentValue ?? 0, netFlows: 0, gain: 0, twr: 0, annualized: null, days: 0 }
  if (snaps.length < 2) return { ...empty, points: snaps.map((s) => ({ ...s, twr: 0 })), start: snaps[0]?.date ?? null, startValue: snaps[0]?.value ?? 0 }
  const flows = transactions.map((t) => ({ date: t.tx_date, f: externalFlow(t) })).filter((x) => x.f !== 0).sort((a, b) => a.date.localeCompare(b.date))
  let growth = 1
  let net = 0
  const points: PerfPoint[] = [{ ...snaps[0], twr: 0 }]
  for (let i = 1; i < snaps.length; i++) {
    const a = snaps[i - 1], b = snaps[i]
    // a snapshot is taken early in the day, so a flow dated d shows up in the snapshot after d
    // the live value (today, now) already includes anything recorded today
    const lastLive = live && i === snaps.length - 1
    const F = flows.filter((x) => x.date >= a.date && (x.date < b.date || (lastLive && x.date === b.date))).reduce((s, x) => s + x.f, 0)
    net += F
    const denom = a.value + 0.5 * F
    const r = denom > 0 ? (b.value - a.value - F) / denom : 0
    growth *= 1 + Math.max(-0.95, Math.min(5, r))
    points.push({ ...b, twr: (growth - 1) * 100 })
  }
  const first = snaps[0], last = snaps[snaps.length - 1]
  const days = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000))
  const twr = (growth - 1) * 100
  return {
    points, start: first.date, startValue: first.value, endValue: last.value, netFlows: net,
    gain: last.value - first.value - net, twr, annualized: days >= 300 ? (Math.pow(growth, 365 / days) - 1) * 100 : null, days,
  }
}

/** Benchmark closes turned into cumulative % from the first date, sampled on the portfolio's dates. */
export function benchmarkSeries(points: Array<{ d: string; c: number }>, dates: string[]) {
  if (!points.length || !dates.length) return []
  const sorted = [...points].sort((a, b) => a.d.localeCompare(b.d))
  const at = (iso: string) => { let v: number | null = null; for (const p of sorted) { if (p.d <= iso) v = p.c; else break } return v }
  const base = at(dates[0]) ?? sorted[0].c
  return dates.map((d) => { const v = at(d); return { date: d, pct: v == null || !base ? 0 : (v / base - 1) * 100 } })
}

// ---------- cost basis & fees ----------
export function holdingPnL(h: Holding, fx: Fx) {
  const v = holdingValue(h, fx)
  const cost = h.cost_basis == null ? null : Number(h.cost_basis)
  if (cost == null || cost <= 0) return { value: v, cost: null, gain: null, pct: null }
  return { value: v, cost, gain: v - cost, pct: ((v - cost) / cost) * 100 }
}

/** Yearly fee in riyals and how much less the holding would be worth after `years` because of it. */
export function feeDrag(value: number, feePct: number, grossReturn: number, years = 10) {
  const f = feePct / 100, r = grossReturn / 100
  const yearly = value * f
  const drag = value * (Math.pow(1 + r, years) - Math.pow(1 + r - f, years))
  return { yearly, drag }
}

export const priceInSar = (h: Holding, fx: Fx) => (Number(h.price) || 0) * rateOf(h.currency, fx)

// ---------- purification ----------
/** Dividends actually received per holding in a period, and the share to give away. */
export function purification(transactions: Transaction[], holdings: Holding[], fromISO: string, toISO: string) {
  const byId = new Map(holdings.map((h) => [h.id, h]))
  const rows = new Map<string, { holding: Holding; dividends: number; pct: number; due: number }>()
  for (const t of transactions) {
    if (t.kind !== 'dividend' || !t.holding_id || t.tx_date < fromISO || t.tx_date > toISO) continue
    const h = byId.get(t.holding_id)
    if (!h) continue
    const pct = Number(h.purification_pct) || 0
    const r = rows.get(h.id) ?? { holding: h, dividends: 0, pct, due: 0 }
    r.dividends += Math.abs(Number(t.amount_sar) || 0)
    r.due = (r.dividends * pct) / 100
    rows.set(h.id, r)
  }
  const list = [...rows.values()].sort((a, b) => b.due - a.due)
  return { rows: list, total: list.reduce((s, r) => s + r.due, 0), dividends: list.reduce((s, r) => s + r.dividends, 0) }
}

/** Transactions that move money in or out of the main portfolio (goal portfolios and excluded accounts left out). */
export function mainFlows(transactions: Transaction[], holdings: Holding[], accounts: Account[]) {
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const goalHoldings = new Set(holdings.filter((h) => h.goal_id).map((h) => h.id))
  return transactions.filter((t) => !(t.holding_id && goalHoldings.has(t.holding_id)) && !(t.account_id && excluded.has(t.account_id)) && !/لهدف/.test(t.note ?? ''))
}

export type Period = '1w' | '1m' | '3m' | 'ytd' | '1y' | 'all'
export const PERIODS: Array<{ k: Period; label: string; long: string }> = [
  { k: '1w', label: 'أسبوع', long: 'خلال الأسبوع' },
  { k: '1m', label: 'شهر', long: 'خلال الشهر' },
  { k: '3m', label: '3 أشهر', long: 'خلال 3 أشهر' },
  { k: 'ytd', label: 'السنة', long: 'منذ بداية السنة' },
  { k: 'all', label: 'الكل', long: 'منذ البداية' },
]
/** start date (ISO) of a period, or undefined for all history */
export function periodStart(p: Period, today = new Date()): string | undefined {
  const d = new Date(today)
  if (p === 'all') return undefined
  if (p === 'ytd') return `${d.getFullYear()}-01-01`
  const days = p === '1w' ? 7 : p === '1m' ? 30 : p === '3m' ? 91 : 365
  return new Date(d.getTime() - days * 86400000).toISOString().slice(0, 10)
}
