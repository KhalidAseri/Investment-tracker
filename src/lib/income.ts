// Distributions, per-holding zakat (Hijri haul), and the annual income engine.
import { ZAKAT_RATE, currentTarget, holdingValue, rateOf, type Totals } from './calc'
import type { Fx, Holding, MoneyEvent, PlanSettings, Sleeve, Snapshot, Transaction } from './types'

// ---------- dates ----------
const DAY = 86400000
/** Noon UTC keeps calendar maths stable across time zones. */
export const utc = (iso: string) => new Date(iso.slice(0, 10) + 'T12:00:00Z')
export const isoOf = (d: Date) => d.toISOString().slice(0, 10)
const addMonthsUtc = (base: Date, n: number) => {
  const y = base.getUTCFullYear(), m = base.getUTCMonth() + n, day = base.getUTCDate()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m, Math.min(day, last), 12))
}
export const daysBetween = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / DAY)

// ---------- Hijri ----------
let hijriParts: Intl.DateTimeFormat | null = null
let hijriLong: Intl.DateTimeFormat | null = null
try {
  hijriParts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' })
  hijriLong = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
} catch { /* very old browsers: fall back to 354-day years */ }

function hijri(d: Date): { y: number; m: number; d: number } | null {
  if (!hijriParts) return null
  const p = Object.fromEntries(hijriParts.formatToParts(d).map((x) => [x.type, x.value]))
  const y = parseInt(String(p.year), 10), m = parseInt(String(p.month), 10), day = parseInt(String(p.day), 10)
  return Number.isFinite(y + m + day) ? { y, m, d: day } : null
}
export const hijriLabel = (iso: string) => (hijriLong ? hijriLong.format(utc(iso)).replace(/\s*هـ$/, '') + ' هـ' : '')

/** Zakat anniversaries of `startISO` (same Hijri day and month) that fall between from and to. */
export function haulDates(startISO: string, fromISO: string, toISO: string): string[] {
  const start = utc(startISO), from = utc(fromISO), to = utc(toISO)
  const hs = hijri(start)
  const out: string[] = []
  let n = Math.max(1, Math.floor((from.getTime() - start.getTime()) / (354.367 * DAY)))
  for (let guard = 0; guard < 80; guard++, n++) {
    const approx = start.getTime() + n * 354.367 * DAY
    let hit: Date | null = null
    if (hs) {
      const day = Math.min(hs.d, 29)
      for (let k = -4; k <= 4 && !hit; k++) {
        const c = new Date(approx + k * DAY)
        const h = hijri(c)
        if (h && h.y === hs.y + n && h.m === hs.m && h.d === day) hit = c
      }
    }
    if (!hit) hit = new Date(approx)
    if (hit > to) break
    if (hit >= from) out.push(isoOf(hit))
  }
  return out
}
export const nextHaul = (startISO: string, fromISO: string) => haulDates(startISO, fromISO, isoOf(new Date(utc(fromISO).getTime() + 400 * DAY)))[0] ?? null

export interface ZakatDue { holding: Holding; date: string; amount: number }
export function zakatSchedule(holdings: Holding[], fx: Fx, fromISO: string, days: number): ZakatDue[] {
  const to = isoOf(new Date(utc(fromISO).getTime() + days * DAY))
  const out: ZakatDue[] = []
  for (const h of holdings) {
    if (h.archived || h.zakatable === false || !h.zakat_start) continue
    const v = holdingValue(h, fx)
    if (v <= 0) continue
    for (const date of haulDates(h.zakat_start, fromISO, to)) out.push({ holding: h, date, amount: (v * ZAKAT_RATE) / 100 })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- distributions ----------
export type PayoutFreq = Holding['payout_freq']
export const FREQ_LABEL: Record<PayoutFreq, string> = {
  none: 'لا يوزّع', monthly: 'شهرياً', quarterly: 'كل 3 أشهر', semiannual: 'كل 6 أشهر', annual: 'سنوياً',
}
export const PER_YEAR: Record<PayoutFreq, number> = { none: 0, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }
const STEP: Record<PayoutFreq, number> = { none: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }

/** SAR per payment; null when the rate or amount has not been entered yet. */
export function payoutPerPayment(h: Holding, fx: Fx): number | null {
  const per = PER_YEAR[h.payout_freq ?? 'none']
  if (!per || h.archived) return 0
  const q = Number(h.quantity) || 0
  if (q <= 0) return 0
  const r = rateOf(h.currency, fx)
  if (h.payout_basis === 'per_unit') return h.payout_per_unit == null ? null : q * Number(h.payout_per_unit) * r
  if (h.payout_rate == null) return null
  const unit = h.payout_nominal ? Number(h.payout_nominal) : Number(h.price) || 0
  return (q * unit * r * (Number(h.payout_rate) / 100)) / per
}
export const payoutAnnual = (h: Holding, fx: Fx) => {
  const p = payoutPerPayment(h, fx)
  return p == null ? null : p * PER_YEAR[h.payout_freq ?? 'none']
}
export const nominalValue = (h: Holding, fx: Fx) =>
  (Number(h.quantity) || 0) * (h.payout_nominal ? Number(h.payout_nominal) : Number(h.price) || 0) * rateOf(h.currency, fx)

export interface PayoutItem { holding: Holding; date: string; amount: number | null; kind: 'payout' | 'maturity' }

export function payoutSchedule(holdings: Holding[], fx: Fx, fromISO: string, days: number): PayoutItem[] {
  const from = utc(fromISO)
  const to = new Date(from.getTime() + days * DAY)
  const out: PayoutItem[] = []
  for (const h of holdings) {
    if (h.archived || !(Number(h.quantity) > 0)) continue
    const mat = h.maturity_date ? utc(h.maturity_date) : null
    const freq = h.payout_freq ?? 'none'
    if (freq !== 'none' && h.payout_next) {
      const base = utc(h.payout_next)
      const amount = payoutPerPayment(h, fx)
      for (let n = 0; n < 1200; n++) {
        const d = addMonthsUtc(base, n * STEP[freq])
        if (d > to || (mat && d > mat)) break
        if (d >= from) out.push({ holding: h, date: isoOf(d), amount, kind: 'payout' })
      }
    }
    if (mat && mat >= from && mat <= to) out.push({ holding: h, date: isoOf(mat), amount: nominalValue(h, fx), kind: 'maturity' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** The payment date after `dateISO` for this holding (used after recording a received payment). */
export const nextPayoutAfter = (h: Holding, dateISO: string) => isoOf(addMonthsUtc(utc(dateISO), STEP[h.payout_freq ?? 'none'] || 1))

export const isIncomeTx = (t: Transaction) => t.kind === 'dividend' || t.kind === 'income'

// ---------- annual income engine ----------
export interface SellLine { sleeve: Sleeve; amount: number; over: number }
export interface EngineStep { key: string; date: string; title: string; detail?: string; amount?: number; kind: 'review' | 'sell' | 'transfer' | 'monthly' }
export interface EngineLine { label: string; value: string; note?: string; strong?: boolean }

export interface IncomeEngine {
  started: boolean
  year: number
  startYear: number
  base: number
  baseLabel: string
  raw: number
  prev: number | null
  annual: number
  monthly: number
  effRate: number
  approved: boolean
  guardNote: string | null
  estimateNote: string | null
  need: number
  coverage: number
  distributions: number
  distributionsUnknown: number
  distributionsEstimated: boolean
  reserveTarget: number
  reserveNow: number
  reserveMonths: number
  sellAmount: number
  sells: SellLine[]
  skipSale: boolean
  spent: number
  ledger: EngineLine[]
  steps: EngineStep[]
  drawdown: number
}

const fmt = (v: number) => Math.round(v).toLocaleString('en-US')

/** Sell from the sleeves furthest above target first, never from the safety layer (that is where the money goes). */
export function planSell(amount: number, sleeves: Sleeve[], totals: Totals, s: PlanSettings): SellLine[] {
  const pool = sleeves.filter((x) => x.layer !== 'safety' && (totals.bySleeve[x.id] ?? 0) > 0)
  if (amount <= 0 || !pool.length) return []
  const total = totals.total || 1
  const rows = pool.map((x) => {
    const value = totals.bySleeve[x.id] ?? 0
    return { sleeve: x, value, over: Math.max(0, value - (currentTarget(x, s) / 100) * total), take: 0 }
  })
  let left = amount
  const overSum = rows.reduce((a, r) => a + r.over, 0)
  if (overSum > 0) {
    const part = Math.min(left, overSum)
    for (const r of rows) r.take += (part * r.over) / overSum
    left -= part
  }
  if (left > 0) {
    const room = rows.reduce((a, r) => a + Math.max(0, r.value - r.take), 0) || 1
    for (const r of rows) r.take += (left * Math.max(0, r.value - r.take)) / room
  }
  return rows
    .map((r) => ({ sleeve: r.sleeve, amount: Math.round(Math.min(r.take, r.value) / 100) * 100, over: r.over }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

export function incomeEngine(args: {
  s: PlanSettings; totals: Totals; sleeves: Sleeve[]; holdings: Holding[]; fx: Fx; snapshots: Snapshot[]; transactions: Transaction[]
  projectedAt: (year: number) => number; events?: MoneyEvent[]
}): IncomeEngine {
  const { s, totals, sleeves, holdings, fx, snapshots, transactions, projectedAt } = args
  const now = new Date()
  const thisYear = now.getFullYear()
  const startYear = s.income_start_year ?? s.independence_year
  const started = thisYear >= startYear
  const year = started ? thisYear : startYear
  const infl = Math.pow(1 + s.inflation_rate / 100, Math.max(0, year - thisYear))
  const base = started ? totals.total : projectedAt(startYear)
  const baseLabel = started ? 'قيمة المحفظة الآن' : `القيمة المتوقعة في يناير ${startYear}`
  const ledger: EngineLine[] = [{ label: baseLabel, value: `${fmt(base)} ريال` }]
  let estimateNote: string | null = null

  // 1) raw amount by method
  let raw = 0
  if (s.income_method === 'fixed') {
    const m = (s.income_fixed_monthly ?? s.monthly_income_target) * infl
    raw = m * 12
    ledger.push({ label: 'مبلغ ثابت تختاره', value: `${fmt(m)} ريال شهرياً`, note: infl > 1.001 ? 'بعد إضافة التضخم حتى سنة البدء' : undefined })
  } else if (s.income_method === 'profit') {
    let gain: number
    const yearAgo = isoOf(new Date(now.getTime() - 365 * DAY))
    const old = started ? [...snapshots].reverse().find((x) => x.snap_date <= yearAgo) : undefined
    if (old) {
      const flows = transactions
        .filter((t) => t.tx_date > old.snap_date && (t.kind === 'deposit' || t.kind === 'withdrawal'))
        .reduce((a, t) => a + (t.kind === 'deposit' ? Number(t.amount_sar) : -Number(t.amount_sar)), 0)
      gain = totals.total - Number(old.total_sar) - flows
      ledger.push({ label: 'ربح آخر 12 شهراً', value: `${fmt(gain)} ريال`, note: 'التغير في القيمة بعد استبعاد الإيداعات والسحوبات' })
    } else {
      gain = (base * s.expected_return) / 100
      estimateNote = 'لا يوجد سجل لسنة كاملة بعد، فحُسب الربح بالعائد المتوقع.'
      ledger.push({ label: `ربح سنة بالعائد المتوقع ${s.expected_return}%`, value: `${fmt(gain)} ريال`, note: 'تقديري' })
    }
    raw = Math.max(0, (gain * s.income_profit_share) / 100)
    ledger.push({ label: `حصتك من الربح ${s.income_profit_share}%`, value: `${fmt(raw)} ريال سنوياً` })
  } else {
    raw = (base * s.withdrawal_rate) / 100
    ledger.push({ label: `نسبة السحب ${s.withdrawal_rate}%`, value: `${fmt(raw)} ريال سنوياً` })
  }

  // 2) guardrails (value method smooths year to year; all methods respect the drawdown rule)
  const prev = s.income_approved_year === year - 1 && s.income_approved_annual ? Number(s.income_approved_annual) : null
  const peak = Math.max(totals.total, ...snapshots.filter((x) => x.snap_date >= isoOf(new Date(now.getTime() - 400 * DAY))).map((x) => Number(x.total_sar)))
  const drawdown = started && peak > 0 ? ((peak - totals.total) / peak) * 100 : 0
  let annual = raw
  let guardNote: string | null = null
  if (prev && s.income_method === 'value') {
    const band = s.guard_cut / 100
    const hi = prev * (1 + band), lo = prev * (1 - band)
    const rateNow = base > 0 ? (raw / base) * 100 : 0
    if (raw > hi) { annual = hi; guardNote = `زيادة الدخل محدودة بـ ${s.guard_cut}% عن العام الماضي.` }
    else if (raw < lo) { annual = lo; guardNote = `الخفض محدود بـ ${s.guard_cut}% عن العام الماضي.` }
    if (rateNow > s.guard_high_rate) { annual = Math.min(annual, lo); guardNote = `السحب تجاوز ${s.guard_high_rate}% من المحفظة، فخُفّض الدخل ${s.guard_cut}%.` }
    else if (rateNow < s.guard_low_rate && raw >= prev) { annual = Math.max(annual, hi); guardNote = `السحب أقل من ${s.guard_low_rate}% من المحفظة، فرُفع الدخل ${s.guard_cut}%.` }
  }
  if (drawdown > s.guard_drawdown && prev) {
    annual = Math.min(annual, prev)
    guardNote = `المحفظة أقل من أعلى قيمة لها بـ ${drawdown.toFixed(0)}%، فيبقى الدخل كما هو بلا زيادة.`
  }
  if (guardNote) ledger.push({ label: 'قاعدة الحماية', value: `${fmt(annual)} ريال سنوياً`, note: guardNote })

  const approved = started && s.income_approved_year === year && s.income_approved_annual != null
  if (approved) {
    annual = Number(s.income_approved_annual)
    ledger.push({ label: 'الدخل المعتمد لهذا العام', value: `${fmt(annual)} ريال سنوياً`, strong: true })
  }
  const monthly = annual / 12
  ledger.push({ label: 'الدخل الشهري', value: `${fmt(monthly)} ريال`, strong: true })
  const effRate = base > 0 ? (annual / base) * 100 : 0

  // 3) need vs income
  const mortgage = s.include_mortgage && year <= s.mortgage_end_year ? s.mortgage_monthly * 12 : 0
  const need = s.monthly_income_target * 12 * infl + mortgage
  const coverage = need > 0 ? annual / need : 0

  // 4) funding: distributions first, then the cash reserve, refilled once a year by selling
  const pays = payoutSchedule(holdings, fx, isoOf(now), 365).filter((p) => p.kind === 'payout')
  const distributionsUnknown = new Set(pays.filter((p) => p.amount == null).map((p) => p.holding.id)).size
  const fiShare = (pick: (x: Sleeve) => number) => sleeves.reduce((a, x) => a + (Number(x.target_fi) / 100) * pick(x), 0)
  let distributions: number
  let distributionsEstimated = false
  if (started && pays.some((p) => p.amount)) {
    distributions = pays.reduce((a, p) => a + (p.amount ?? 0), 0)
  } else {
    // not started, or nothing entered yet: each layer's expected cash yield on its target weight
    distributions = started
      ? sleeves.reduce((a, x) => a + (totals.bySleeve[x.id] ?? 0) * ((x.yield_pct ?? 0) / 100), 0)
      : base * fiShare((x) => (x.yield_pct ?? 0) / 100)
    distributionsEstimated = true
  }
  const reserveTarget = monthly * s.reserve_months
  const reserveNow = started ? totals.byLayer.safety : base * fiShare((x) => (x.layer === 'safety' ? 1 : 0))
  const reserveMonths = monthly > 0 ? reserveNow / monthly : 0
  const skipSale = drawdown > s.guard_drawdown && reserveMonths >= 12
  const sellAmount = skipSale ? 0 : Math.max(0, Math.round((reserveTarget - reserveNow - distributions) / 1000) * 1000)
  const sells = started ? planSell(sellAmount, sleeves, totals, s) : []

  // 5) spent this year
  const spent = transactions.filter((t) => t.kind === 'withdrawal' && t.source !== 'ibkr' && t.tx_date.startsWith(String(year))).reduce((a, t) => a + Number(t.amount_sar), 0)

  // 6) the year's schedule
  const rm = s.income_review_month
  const d = (m: number, day: number) => isoOf(new Date(Date.UTC(year + Math.floor((m - 1) / 12), (m - 1) % 12, day, 12)))
  const steps: EngineStep[] = [
    { key: 'review', kind: 'review', date: d(rm, 5), title: 'راجع واعتمد دخل السنة', detail: 'احسب الدخل بالقاعدة، وقارن الأوزان، وحدّد ما يُباع' },
  ]
  if (sellAmount > 0 || !started) {
    steps.push({ key: 'sell', kind: 'sell', date: d(rm, 7), title: 'البيع لتعبئة احتياطي الدخل', amount: sellAmount || undefined, detail: 'من الطبقات الأعلى من وزنها، في IBKR غالباً' })
    steps.push({ key: 'move', kind: 'transfer', date: d(rm, 10), title: 'تحويل حصيلة البيع إلى الراجحي المالية', detail: 'تُحفظ في صندوق مرابحة أو سيولة ضمن الاحتياطي' })
  }
  for (let k = 0; k < 12; k++) {
    steps.push({ key: `m${k}`, kind: 'monthly', date: d(rm + k, s.income_transfer_day), title: 'التحويل الشهري', amount: monthly })
  }

  return {
    started, year, startYear, base, baseLabel, raw, prev, annual, monthly, effRate, approved, guardNote, estimateNote, need, coverage,
    distributions, distributionsUnknown, distributionsEstimated, reserveTarget, reserveNow, reserveMonths, sellAmount, sells, skipSale, spent, ledger, steps, drawdown,
  }
}

/** Was a monthly transfer recorded in this step's month? */
export const monthDone = (transactions: Transaction[], dateISO: string) =>
  transactions.some((t) => t.kind === 'withdrawal' && t.tx_date.slice(0, 7) === dateISO.slice(0, 7))

// ---------- calendar entries computed from the plan ----------
export interface VirtualOcc { event: MoneyEvent; date: string; route: 'payouts' | 'income' | 'holdings' }
const vEvent = (id: string, title: string, kind: MoneyEvent['kind'], date: string, amount: number | null, note: string | null): MoneyEvent =>
  ({ id: `v:${id}`, title, kind, event_date: date, amount, recurrence: 'none', done: false, note })

export function virtualOccurrences(args: { holdings: Holding[]; fx: Fx; s: PlanSettings; engine: IncomeEngine | null; fromISO: string; days: number }): VirtualOcc[] {
  const { holdings, fx, s, engine, fromISO, days } = args
  const out: VirtualOcc[] = []
  for (const p of payoutSchedule(holdings, fx, fromISO, days)) {
    out.push({
      route: 'payouts', date: p.date,
      event: vEvent(`p:${p.holding.id}:${p.date}`, p.kind === 'maturity' ? `استحقاق ${p.holding.name}` : `توزيع ${p.holding.name}`, 'payout', p.date,
        p.amount == null ? null : Math.round(p.amount), p.kind === 'maturity' ? 'يعود رأس المال' : 'متوقع'),
    })
  }
  for (const z of zakatSchedule(holdings, fx, fromISO, days)) {
    out.push({ route: 'holdings', date: z.date, event: vEvent(`z:${z.holding.id}:${z.date}`, `زكاة ${z.holding.name}`, 'zakat', z.date, Math.round(z.amount), `${hijriLabel(z.date)}، تقديرية بقيمة اليوم`) })
  }
  if (engine?.started) {
    const from = utc(fromISO)
    const to = new Date(from.getTime() + days * DAY)
    for (let k = 0; k < Math.ceil(days / 28) + 1; k++) {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + k, s.income_transfer_day, 12))
      if (d < from || d > to) continue
      const date = isoOf(d)
      out.push({ route: 'income', date, event: vEvent(`t:${date}`, 'التحويل الشهري إلى حسابك', 'withdrawal', date, Math.round(engine.monthly), 'من احتياطي الدخل في الراجحي المالية') })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
