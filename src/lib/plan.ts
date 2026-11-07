// «الخطة»: the owner's written plan (phases, bands, milestones, contributions, reserves, income rule, steps)
// compared with actual balances and transactions. Pure functions only: no React, no Supabase.
// No return assumptions or projections: every planned number comes from the plan document itself.
import { bandOf, computeTotals, holdingValue, rateOf, type Totals } from './calc'
import { daysBetween, hijriLabel, isoOf, utc, zakatSchedule } from './income'
import { todayISO } from './format'
import { mainFlows, performance } from './wealth'
import type {
  Account, Fx, Goal, Holding, IbkrConnection, Layer, PlanSettings, Sleeve, Snapshot, Transaction, WatchItem,
} from './types'

// =====================================================================================
// Contract (PLAN-FEATURE.md)
// =====================================================================================
export type ISODate = string // 'YYYY-MM-DD'

export interface PlanSleeve { key: string; name: string; layer: Layer; accepts_new_money: boolean; note: string | null }
export interface PhaseWeight { target: number; min: number; max: number }
export interface PlanPhase {
  key: string; name: string; start: ISODate; note: string | null
  /** keyed by sleeve key, % */
  weights: Record<string, PhaseWeight>
}
export interface PlanMilestone { date: ISODate; value: number; label: string | null }
export type ContributionKind = 'monthly' | 'yearly' | 'once'
export interface PlanContribution {
  key: string; name: string; kind: ContributionKind; amount: number
  /** day of the month it arrives (monthly/yearly); null = the 1st */
  day: number | null
  /** month of a yearly contribution (1–12) */
  month: number | null
  /** once: its date. monthly/yearly: optional first date (default = plan creation) */
  date: ISODate | null
  until: ISODate | null
  /** spread a yearly/once amount over this many monthly parts */
  split_months: number | null
  /** yearly growth, % per full year since the start */
  growth_pct: number | null
  note: string | null
}
export interface PlanEmergency { months: number; monthly_expense: number }
export interface PlanIncome {
  start: ISODate | null; method: 'percent' | 'fixed'; annual_pct: number; fixed_monthly: number | null
  band_pct: number; treasury_months: number; transfer_day: number; no_sell_drawdown_pct: number; build_from: ISODate | null
}
export interface PlanRules { review_month: number; crash_pct: number; crash_sleeves: string[]; new_money_first: boolean }
export interface PlanStep {
  key: string; title: string; detail: string | null; due: ISODate | null; done_at: ISODate | null
  recurring: 'none' | 'yearly'
}
export interface PlanReview {
  year: number; date: ISODate; value: number; zakat_paid: number | null; purification_paid: number | null
  rebalanced: boolean; income_annual: number | null; notes: string | null
}
export interface PlanState { income_year: number | null; income_annual: number | null; dismissed: Record<string, ISODate> }
export interface PlanGoal { monthly_income: number | null; target_capital: number | null; target_date: ISODate | null; note: string | null }

export interface PlanDoc {
  version: 1
  name: string
  created: ISODate
  /** plan value when the plan was created (start of the milestone path) */
  baseline: { date: ISODate; value: number } | null
  goal: PlanGoal
  sleeves: PlanSleeve[]
  /** key -> sleeves.id (internal; stripped on export) */
  sleeve_map?: Record<string, string>
  phases: PlanPhase[]
  /** planned value of the plan portfolio */
  milestones: PlanMilestone[]
  contributions: PlanContribution[]
  /** target = months × monthly_expense */
  emergency: PlanEmergency | null
  income: PlanIncome | null
  rules: PlanRules
  steps: PlanStep[]
  reviews: PlanReview[]
  state: PlanState
}

export type ActionArea = 'reserve' | 'step' | 'deposit' | 'rebalance' | 'income' | 'review' | 'zakat' | 'data' | 'info'
export type ActionCta = 'rebalance' | 'treasury' | 'withdraw' | 'emergency' | 'review' | 'step' | 'update'
export interface PlanAction {
  key: string
  priority: 1 | 2 | 3 | 4
  tone: 'bad' | 'warn' | 'accent' | ''
  area: ActionArea
  title: string
  detail: string | null
  /** riyal amount to show with <Money> (kept out of the text so privacy mode hides it) */
  amount: number | null
  due: ISODate | null
  /** needs the owner (hide from read-only viewers) */
  owner: boolean
  dismissible: boolean
  cta: { label: string; route?: string; action?: ActionCta; param?: string } | null
}

export const PLAN_FILE_EXT = '.masar.json'
export const LAYERS: Layer[] = ['growth', 'income', 'safety', 'hedge']

// =====================================================================================
// Dates (ISO strings, noon UTC maths)
// =====================================================================================
const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** y, month 1–12 (overflow allowed), day clamped to the month */
export function ymd(y: number, m: number, d: number): ISODate {
  const base = new Date(Date.UTC(y, m - 1, 1, 12))
  const yy = base.getUTCFullYear(), mm = base.getUTCMonth() + 1
  return `${yy}-${pad(mm)}-${pad(Math.min(Math.max(1, Math.round(d) || 1), lastDay(yy, mm)))}`
}
const Y = (iso: ISODate) => Number(iso.slice(0, 4))
const M = (iso: ISODate) => Number(iso.slice(5, 7))
const D = (iso: ISODate) => Number(iso.slice(8, 10))
export const addMonthsISO = (iso: ISODate, n: number) => ymd(Y(iso), M(iso) + n, D(iso))
export const addDaysISO = (iso: ISODate, n: number) => isoOf(new Date(utc(iso).getTime() + n * DAY))
export const monthStartISO = (iso: ISODate) => `${iso.slice(0, 7)}-01`
export const monthEndISO = (iso: ISODate) => `${iso.slice(0, 7)}-${pad(lastDay(Y(iso), M(iso)))}`
export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(v + 'T12:00:00Z')
  return Number.isFinite(t) && isoOf(new Date(t)) === v
}
/** whole years from a to b (anniversaries passed) */
const fullYears = (a: ISODate, b: ISODate) => Math.max(0, Y(b) - Y(a) - (b.slice(5) < a.slice(5) ? 1 : 0))
/** whole months from a to b, at least 0 */
const monthsBetween = (a: ISODate, b: ISODate) => Math.max(0, (Y(b) - Y(a)) * 12 + (M(b) - M(a)) - (D(b) < D(a) ? 1 : 0))

// =====================================================================================
// Small Arabic helpers (short, plain)
// =====================================================================================
const n0 = (v: number) => Math.round(v).toLocaleString('en-US')
const r1 = (v: number) => (Math.round(v * 10) / 10).toString()
/** a percent kept left-to-right inside Arabic text (Unicode isolates) */
const p0 = (v: number) => `\u2066${r1(v)}%\u2069`
export const countAssets = (n: number) => (n === 1 ? 'أصل واحد' : n === 2 ? 'أصلان' : n <= 10 ? `${n} أصول` : `${n} أصلاً`)
const countMonths = (v: number) => {
  const r = Math.round(v * 10) / 10
  if (r === 1) return 'شهر واحد'
  if (r === 2) return 'شهران'
  if (Number.isInteger(r) && r > 10) return `${r} شهراً`
  return `${r} أشهر`
}
/** «اليوم» · «غداً» · «بعد يومين» · «بعد 5 أيام» · «بعد 12 يوماً» */
export function inDays(n: number) {
  if (n <= 0) return 'اليوم'
  if (n === 1) return 'غداً'
  if (n === 2) return 'بعد يومين'
  return n <= 10 ? `بعد ${n} أيام` : `بعد ${n} يوماً`
}
const lateBy = (n: number) => (n === 1 ? 'متأخرة يوماً واحداً' : n === 2 ? 'متأخرة يومين' : n <= 10 ? `متأخرة ${n} أيام` : `متأخرة ${n} يوماً`)

// =====================================================================================
// Document basics
// =====================================================================================
export function emptyPlan(name = 'خطتي', today: ISODate = todayISO()): PlanDoc {
  return {
    version: 1, name, created: today, baseline: null,
    goal: { monthly_income: null, target_capital: null, target_date: null, note: null },
    sleeves: [],
    phases: [{ key: 'p1', name: 'المرحلة الأولى', start: today, note: null, weights: {} }],
    milestones: [], contributions: [], emergency: null, income: null,
    rules: { review_month: 1, crash_pct: 25, crash_sleeves: [], new_money_first: true },
    steps: [], reviews: [],
    state: { income_year: null, income_annual: null, dismissed: {} },
  }
}

const num = (v: unknown, d = 0) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d }
const numOrNull = (v: unknown) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v))
const strOrNull = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const dateOrNull = (v: unknown) => (isISODate(v) ? v : null)
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})
const isLayer = (v: unknown): v is Layer => typeof v === 'string' && (LAYERS as string[]).includes(v)

/** Tolerant reader for stored or imported documents: fills defaults, never throws. */
export function normalizePlan(raw: unknown, today: ISODate = todayISO()): PlanDoc {
  const r = obj(raw)
  const base = emptyPlan(str(r.name, 'خطتي') || 'خطتي', dateOrNull(r.created) ?? today)
  const g = obj(r.goal)
  const b = obj(r.baseline)
  const rules = obj(r.rules)
  const st = obj(r.state)
  const inc = r.income == null ? null : obj(r.income)
  const em = r.emergency == null ? null : obj(r.emergency)
  const map = obj(r.sleeve_map)
  const doc: PlanDoc = {
    ...base,
    baseline: isISODate(b.date) && Number.isFinite(Number(b.value)) ? { date: b.date, value: num(b.value) } : null,
    goal: { monthly_income: numOrNull(g.monthly_income), target_capital: numOrNull(g.target_capital), target_date: dateOrNull(g.target_date), note: strOrNull(g.note) },
    sleeves: arr<any>(r.sleeves).filter((s) => s && typeof s.key === 'string' && s.key).map((s) => ({
      key: String(s.key), name: str(s.name, s.key) || String(s.key), layer: isLayer(s.layer) ? s.layer : 'growth',
      accepts_new_money: s.accepts_new_money !== false, note: strOrNull(s.note),
    })),
    phases: arr<any>(r.phases).filter((p) => p && typeof p === 'object').map((p, i) => ({
      key: str(p.key, `p${i + 1}`) || `p${i + 1}`, name: str(p.name, `المرحلة ${i + 1}`) || `المرحلة ${i + 1}`,
      start: dateOrNull(p.start) ?? base.created, note: strOrNull(p.note),
      weights: Object.fromEntries(Object.entries(obj(p.weights)).map(([k, w]) => {
        const o = obj(w)
        const target = num(o.target)
        return [k, { target, min: o.min == null ? target : num(o.min, target), max: o.max == null ? target : num(o.max, target) }]
      })),
    })),
    milestones: arr<any>(r.milestones).filter((m) => m && isISODate(m.date) && Number.isFinite(Number(m.value)))
      .map((m) => ({ date: m.date as string, value: num(m.value), label: strOrNull(m.label) })),
    contributions: arr<any>(r.contributions).filter((c) => c && typeof c === 'object').map((c, i) => ({
      key: str(c.key, `c${i + 1}`) || `c${i + 1}`, name: str(c.name, 'إيداع') || 'إيداع',
      kind: (['monthly', 'yearly', 'once'] as const).includes(c.kind) ? c.kind : 'monthly',
      amount: num(c.amount), day: numOrNull(c.day), month: numOrNull(c.month), date: dateOrNull(c.date), until: dateOrNull(c.until),
      split_months: numOrNull(c.split_months), growth_pct: numOrNull(c.growth_pct), note: strOrNull(c.note),
    })),
    emergency: em ? { months: num(em.months), monthly_expense: num(em.monthly_expense) } : null,
    income: inc ? {
      start: dateOrNull(inc.start), method: inc.method === 'fixed' ? 'fixed' : 'percent', annual_pct: num(inc.annual_pct, 4),
      fixed_monthly: numOrNull(inc.fixed_monthly), band_pct: num(inc.band_pct, 10), treasury_months: num(inc.treasury_months, 24),
      transfer_day: Math.min(28, Math.max(1, Math.round(num(inc.transfer_day, 27)))), no_sell_drawdown_pct: num(inc.no_sell_drawdown_pct, 20),
      build_from: dateOrNull(inc.build_from),
    } : null,
    rules: {
      review_month: Math.min(12, Math.max(1, Math.round(num(rules.review_month, 1)))), crash_pct: num(rules.crash_pct, 25),
      crash_sleeves: arr<unknown>(rules.crash_sleeves).filter((k): k is string => typeof k === 'string'),
      new_money_first: rules.new_money_first !== false,
    },
    steps: arr<any>(r.steps).filter((s) => s && typeof s === 'object').map((s, i) => ({
      key: str(s.key, `s${i + 1}`) || `s${i + 1}`, title: str(s.title, 'خطوة') || 'خطوة', detail: strOrNull(s.detail),
      due: dateOrNull(s.due), done_at: dateOrNull(s.done_at), recurring: s.recurring === 'yearly' ? 'yearly' : 'none',
    })),
    reviews: arr<any>(r.reviews).filter((x) => x && Number.isFinite(Number(x.year))).map((x) => ({
      year: Math.round(num(x.year)), date: dateOrNull(x.date) ?? `${Math.round(num(x.year))}-01-01`, value: num(x.value),
      zakat_paid: numOrNull(x.zakat_paid), purification_paid: numOrNull(x.purification_paid), rebalanced: !!x.rebalanced,
      income_annual: numOrNull(x.income_annual), notes: strOrNull(x.notes),
    })),
    state: {
      income_year: numOrNull(st.income_year), income_annual: numOrNull(st.income_annual),
      dismissed: Object.fromEntries(Object.entries(obj(st.dismissed)).filter(([, v]) => isISODate(v))) as Record<string, ISODate>,
    },
  }
  const cleanMap = Object.fromEntries(Object.entries(map).filter(([, v]) => typeof v === 'string' && v)) as Record<string, string>
  if (Object.keys(cleanMap).length) doc.sleeve_map = cleanMap
  if (!doc.phases.length) doc.phases = base.phases
  doc.phases.sort((a, b) => a.start.localeCompare(b.start))
  doc.milestones.sort((a, b) => a.date.localeCompare(b.date))
  return doc
}

/** Phases in start order. */
const phasesOf = (doc: PlanDoc) => [...doc.phases].sort((a, b) => a.start.localeCompare(b.start))
/** The last phase that has started; the first phase while none has started yet; null without phases. */
export function activePhase(doc: PlanDoc, today: ISODate = todayISO()): PlanPhase | null {
  const ps = phasesOf(doc)
  let cur: PlanPhase | null = null
  for (const p of ps) if (p.start <= today) cur = p
  return cur ?? ps[0] ?? null
}
/** The first phase that starts after today. */
export function nextPhase(doc: PlanDoc, today: ISODate = todayISO()): PlanPhase | null {
  return phasesOf(doc).find((p) => p.start > today) ?? null
}

/** Baseline and milestones as one path, in date order (for the milestone chart). */
export function milestonePath(doc: PlanDoc): Array<{ date: ISODate; value: number; label: string | null }> {
  const pts = [...doc.milestones].sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ date: m.date, value: m.value, label: m.label }))
  if (doc.baseline && !pts.some((p) => p.date <= doc.baseline!.date)) pts.unshift({ date: doc.baseline.date, value: doc.baseline.value, label: 'البداية' })
  return pts
}

/** Expected value at a date: straight lines between the baseline and the milestones, flat after the last one. */
export function expectedValueAt(doc: PlanDoc, date: ISODate): number | null {
  const pts = milestonePath(doc)
  if (!pts.length) return null
  if (date <= pts[0].date) return doc.baseline && date >= doc.baseline.date ? pts[0].value : doc.baseline ? doc.baseline.value : null
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (date <= b.date) {
      const span = daysBetween(a.date, b.date)
      const t = span > 0 ? daysBetween(a.date, date) / span : 1
      return a.value + (b.value - a.value) * t
    }
  }
  return pts[pts.length - 1].value
}

// =====================================================================================
// Contributions
// =====================================================================================
export interface ContributionOcc { key: string; name: string; kind: ContributionKind; date: ISODate; amount: number; part: number; parts: number }

/** Planned contributions dated between from and to (inclusive). Items without a usable date are skipped. */
export function contributionSchedule(doc: PlanDoc, fromISO: ISODate, toISO: ISODate): ContributionOcc[] {
  const out: ContributionOcc[] = []
  if (toISO < fromISO) return out
  for (const c of doc.contributions) {
    const amount = Number(c.amount) || 0
    if (amount <= 0) continue
    const start = c.kind === 'once' ? c.date : c.date ?? doc.created
    if (!start) continue
    const grow = (d: ISODate) => (c.growth_pct ? Math.pow(1 + c.growth_pct / 100, fullYears(start, d)) : 1)
    const push = (date: ISODate, amt: number, part: number, parts: number) => {
      if (date < fromISO || date > toISO) return
      out.push({ key: c.key, name: c.name, kind: c.kind, date, amount: amt, part, parts })
    }
    if (c.kind === 'monthly') {
      const day = c.day ?? 1
      for (let k = 0, d = ymd(Y(fromISO), M(fromISO), day); d <= toISO && k < 1200; k++, d = ymd(Y(fromISO), M(fromISO) + k, day)) {
        if (d < start || (c.until && d > c.until)) continue
        push(d, amount * grow(d), 1, 1)
      }
    } else if (c.kind === 'yearly') {
      const month = c.month ?? (c.date ? M(c.date) : null)
      if (!month) continue // month unknown: cannot be placed in time
      const parts = Math.max(1, Math.round(c.split_months ?? 1))
      for (let y = Y(fromISO) - 1; y <= Y(toISO); y++) {
        const first = ymd(y, month, c.day ?? 1)
        if (first < start || (c.until && first > c.until)) continue
        const each = (amount * grow(first)) / parts
        for (let i = 0; i < parts; i++) push(addMonthsISO(first, i), each, i + 1, parts)
      }
    } else {
      if (!c.date) continue
      const parts = Math.max(1, Math.round(c.split_months ?? 1))
      for (let i = 0; i < parts; i++) push(addMonthsISO(c.date, i), amount / parts, i + 1, parts)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key))
}

// =====================================================================================
// Income
// =====================================================================================
/**
 * Income approved at the yearly review: annual_pct% of the plan value, never more than band_pct above or below last year's.
 * fixed method: fixed_monthly × 12.
 */
export function annualIncome(income: PlanIncome, planValue: number, prevAnnual: number | null) {
  const raw = income.method === 'fixed' ? (Number(income.fixed_monthly) || 0) * 12 : (planValue * (Number(income.annual_pct) || 0)) / 100
  let annual = raw
  let clamped: 'up' | 'down' | null = null
  if (income.method === 'percent' && prevAnnual && prevAnnual > 0) {
    const band = (Number(income.band_pct) || 0) / 100
    const hi = prevAnnual * (1 + band), lo = prevAnnual * (1 - band)
    if (raw > hi) { annual = hi; clamped = 'up' } else if (raw < lo) { annual = lo; clamped = 'down' }
  }
  return { raw, annual, monthly: annual / 12, clamped, low: prevAnnual ? prevAnnual * (1 - (income.band_pct || 0) / 100) : null, high: prevAnnual ? prevAnnual * (1 + (income.band_pct || 0) / 100) : null }
}

// =====================================================================================
// Sleeves: map plan keys to sleeves rows and apply the active phase
// =====================================================================================
const norm = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase()

/** plan key -> sleeves.id: the stored sleeve_map when the sleeve still exists, otherwise the same name. */
export function resolveSleeveMap(doc: PlanDoc, sleeves: Sleeve[]): Record<string, string | null> {
  const ids = new Set(sleeves.map((s) => s.id))
  const used = new Set<string>()
  const out: Record<string, string | null> = {}
  for (const ps of doc.sleeves) {
    const m = doc.sleeve_map?.[ps.key]
    if (m && ids.has(m) && !used.has(m)) { out[ps.key] = m; used.add(m) }
  }
  for (const ps of doc.sleeves) {
    if (out[ps.key]) continue
    const hit = sleeves.find((s) => !used.has(s.id) && norm(s.name) === norm(ps.name))
    out[ps.key] = hit?.id ?? null
    if (hit) used.add(hit.id)
  }
  return out
}

const KEYWORDS: string[][] = [
  ['عالمي', 'العالم', 'متقدم', 'world', 'global'], ['ناشئ', 'emerging'], ['سعودي', 'تاسي', 'محلي', 'saudi'], ['مباشر', 'فرص', 'direct'],
  ['صكوك', 'sukuk'], ['دولار', 'usd'], ['حكومي', 'سيادي'], ['ريت', 'reit', 'عقار'], ['ذهب', 'gold'], ['سيوله', 'نقد', 'مرابحه', 'cash'],
  ['توزيع', 'dividend'],
]
/**
 * Best guess of the existing sleeve for each plan sleeve (exact map/name first, then keywords + layer), for the import screen
 * to confirm. A null value means "create a new sleeve".
 */
export function suggestSleeveMap(doc: PlanDoc, sleeves: Sleeve[]): Record<string, string | null> {
  const out = resolveSleeveMap(doc, sleeves)
  const used = new Set(Object.values(out).filter(Boolean) as string[])
  const tags = (s: string) => { const n = norm(s); return new Set(KEYWORDS.map((g, i) => (g.some((w) => n.includes(w)) ? i : -1)).filter((i) => i >= 0)) }
  for (const ps of doc.sleeves) {
    if (out[ps.key]) continue
    const want = tags(ps.name)
    let best: { id: string; score: number } | null = null
    for (const s of sleeves) {
      if (used.has(s.id)) continue
      const have = tags(s.name)
      let score = 0
      want.forEach((t) => { if (have.has(t)) score += 2 })
      have.forEach((t) => { if (!want.has(t)) score -= 1 })
      if (s.layer === ps.layer) score += 1
      if (score >= 3 && (!best || score > best.score)) best = { id: s.id, score }
    }
    out[ps.key] = best?.id ?? null
    if (best) used.add(best.id)
  }
  return out
}

export interface SleeveSync {
  /** existing sleeves whose targets/bands/layer/acceptance differ from the active phase */
  updates: Array<{ id: string; patch: Pick<Sleeve, 'target_now' | 'target_fi' | 'band_min' | 'band_max' | 'accepts_new_money' | 'layer'> }>
  /** plan sleeves with no sleeves row yet */
  inserts: Array<{ key: string; row: Omit<Sleeve, 'id' | 'user_id'> }>
  /** resolved key -> id (without the rows still to insert) */
  map: Record<string, string>
  /** the stored sleeve_map differs from the resolved one */
  mapChanged: boolean
  phase: PlanPhase | null
}

const same = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null ? a == null && b == null : Math.abs(Number(a) - Number(b)) < 1e-6)

/**
 * What must change in the sleeves rows so they show the active phase: target_now = target_fi = target, band_min/max,
 * accepts_new_money and layer from the plan. Sleeves that are not in the plan get target 0, no band, no new money.
 */
export function planSleeveSync(doc: PlanDoc, sleeves: Sleeve[], today: ISODate = todayISO()): SleeveSync {
  const phase = activePhase(doc, today)
  const resolved = resolveSleeveMap(doc, sleeves)
  const updates: SleeveSync['updates'] = []
  const inserts: SleeveSync['inserts'] = []
  const map: Record<string, string> = {}
  const inPlan = new Set<string>()
  let sort = Math.max(0, ...sleeves.map((s) => Number(s.sort) || 0))
  for (const ps of doc.sleeves) {
    const w = phase?.weights[ps.key] ?? { target: 0, min: 0, max: 0 }
    const patch = { target_now: w.target, target_fi: w.target, band_min: w.min, band_max: w.max, accepts_new_money: ps.accepts_new_money, layer: ps.layer }
    const id = resolved[ps.key]
    if (id) {
      map[ps.key] = id
      inPlan.add(id)
      const s = sleeves.find((x) => x.id === id)!
      if (!same(s.target_now, patch.target_now) || !same(s.target_fi, patch.target_fi) || !same(s.band_min, patch.band_min) || !same(s.band_max, patch.band_max) ||
        !!s.accepts_new_money !== patch.accepts_new_money || s.layer !== patch.layer) updates.push({ id, patch })
    } else {
      inserts.push({ key: ps.key, row: { name: ps.name, ...patch, expected_return: null, yield_pct: null, zakat_rate: 2.5, note: ps.note, sort: ++sort } })
    }
  }
  for (const s of sleeves) {
    if (inPlan.has(s.id)) continue
    const patch = { target_now: 0, target_fi: 0, band_min: null, band_max: null, accepts_new_money: false, layer: s.layer }
    if (!same(s.target_now, 0) || !same(s.target_fi, 0) || s.band_min != null || s.band_max != null || s.accepts_new_money) updates.push({ id: s.id, patch })
  }
  const stored = doc.sleeve_map ?? {}
  const mapChanged = Object.keys(map).length !== Object.keys(stored).length || Object.entries(map).some(([k, v]) => stored[k] !== v)
  return { updates, inserts, map, mapChanged, phase }
}

// =====================================================================================
// Context & progress
// =====================================================================================
export interface PlanInputs {
  doc: PlanDoc | null
  today?: ISODate
  settings: PlanSettings | null
  sleeves: Sleeve[]
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  snapshots: Snapshot[]
  goals: Goal[]
  watchlist?: WatchItem[]
  ibkr?: IbkrConnection | null
  fx: Fx
  /** viewer of someone else's portfolio: planActions() drops owner-only items */
  readOnly?: boolean
}

export interface BandRow {
  /** plan sleeve key, or 'id:<sleeve id>' for a sleeve outside the plan */
  key: string
  sleeve: Sleeve | null
  planSleeve: PlanSleeve | null
  name: string
  layer: Layer
  note: string | null
  accepts: boolean
  value: number
  /** % of the main portfolio */
  actual: number
  target: number
  min: number
  max: number
  status: 'below' | 'above' | 'ok'
  /** riyals to reach the target (negative = above it) */
  gap: number
}

export interface StepView { step: PlanStep; due: ISODate | null; done: boolean; overdue: boolean; days: number | null }
export interface ContributionItem { contribution: PlanContribution; plannedYtd: number; thisMonth: number; next: ContributionOcc | null; placeable: boolean }

export interface EmergencyStatus {
  enabled: boolean
  value: number
  target: number
  months: number
  monthlyExpense: number
  shortfall: number
  /** months of expenses covered; null without an expense figure */
  coverMonths: number | null
  /** 0..1 */
  pct: number
  goal: Goal | null
  /** cash holding that receives top-ups */
  holding: Holding | null
  source: 'goal' | 'accounts' | 'none'
}

export interface TreasuryStatus {
  enabled: boolean
  /** income has started (today ≥ income.start) */
  started: boolean
  /** filling the treasury has started (today ≥ build_from, or start) */
  building: boolean
  value: number
  target: number
  monthlyIncome: number
  annualIncome: number
  /** monthly income comes from the approved yearly amount (state.income_annual) */
  approved: boolean
  shortfall: number
  coverMonths: number | null
  goal: Goal | null
  holding: Holding | null
  holdings: Holding[]
  transferDate: ISODate | null
  transferredThisMonth: boolean
  movedThisMonth: boolean
  /** suggested move this month: the shortfall spread over the months left before income starts, or all of it after */
  monthlyMove: number
  /** drawdown ≥ no_sell_drawdown_pct: don't sell growth assets */
  holdSales: boolean
}

export interface PlanProgress {
  /** main portfolio + income treasury */
  planValue: number
  mainValue: number
  treasuryValue: number
  expected: number | null
  gap: number | null
  gapPct: number | null
  status: 'ahead' | 'behind' | 'on' | null
  prevMilestone: PlanMilestone | null
  nextMilestone: PlanMilestone | null
  phase: PlanPhase | null
  nextPhase: PlanPhase | null
  daysToNextPhase: number | null
  emergency: EmergencyStatus
  treasury: TreasuryStatus
  contributions: { year: number; planned: number; actual: number; diff: number; plannedThisMonth: number; actualThisMonth: number; items: ContributionItem[] }
  bands: BandRow[]
  outOfBand: BandRow[]
  steps: { done: number; total: number; overdue: StepView[]; dueSoon: StepView[]; next: StepView | null; list: StepView[] }
  /** fall of the main portfolio's time-weighted index from its peak, % */
  drawdown: number
  peakDate: ISODate | null
  /** fall of the crash sleeves (rules.crash_sleeves) from their peak, %; the portfolio's drawdown when their history is missing */
  crashDrawdown: number
  crashBasis: 'sleeves' | 'portfolio'
  review: { year: number; month: number; done: boolean; due: boolean; entry: PlanReview | null; last: PlanReview | null }
}

export interface PlanContext {
  doc: PlanDoc | null
  today: ISODate
  input: PlanInputs
  totals: Totals
  /** plan key -> sleeves.id (null = not created yet) */
  map: Record<string, string | null>
  incomeGoal: Goal | null
  emergencyGoal: Goal | null
  progress: PlanProgress
}

const PAYROLL = (a: Account) => a.kind === 'savings_program' || a.exclude_from_portfolio
/** a single-unit manual holding whose price is its whole value (cash, murabaha, a lump sum) */
export const isLumpSum = (h: Holding) => h.price_source === 'manual' && Number(h.quantity) === 1 && Number(h.price) > 50

function stepView(step: PlanStep, today: ISODate): StepView {
  let due = step.due
  let done = !!step.done_at
  if (step.recurring === 'yearly' && step.due) {
    let occ = ymd(Y(today), M(step.due), D(step.due))
    if (occ < step.due) occ = step.due
    due = occ
    done = !!step.done_at && Y(step.done_at) >= Y(occ)
  }
  const days = due ? daysBetween(today, due) : null
  return { step, due, done, overdue: !done && !!due && due < today, days }
}

function drawdownOf(points: Array<{ date: string; twr: number }>) {
  let peak = 1, peakDate: string | null = null, idx = 1
  for (const p of points) {
    idx = 1 + p.twr / 100
    if (idx >= peak) { peak = idx; peakDate = p.date }
  }
  return { drawdown: peak > 0 && points.length > 1 ? Math.max(0, (1 - idx / peak) * 100) : 0, peakDate }
}

export function planContext(input: PlanInputs): PlanContext {
  const today = input.today ?? todayISO()
  const { doc, sleeves, accounts, holdings, transactions, snapshots, goals, fx, settings } = input
  const totals = computeTotals(holdings, accounts, sleeves, fx)
  const live = goals.filter((g) => !g.archived)
  const incomeGoal = live.find((g) => g.kind === 'income') ?? null
  const emergencyGoal = live.find((g) => g.kind === 'emergency') ?? null
  const incomeGoalIds = new Set(live.filter((g) => g.kind === 'income').map((g) => g.id))
  const emergencyGoalIds = new Set(live.filter((g) => g.kind === 'emergency').map((g) => g.id))
  const treasuryHoldings = holdings.filter((h) => !h.archived && h.goal_id && incomeGoalIds.has(h.goal_id))
  const treasuryIds = new Set(treasuryHoldings.map((h) => h.id))
  const treasuryValue = treasuryHoldings.reduce((a, h) => a + holdingValue(h, fx), 0)
  const mainValue = totals.total
  const planValue = mainValue + treasuryValue
  const map = doc ? resolveSleeveMap(doc, sleeves) : {}
  const phase = doc ? activePhase(doc, today) : null
  const next = doc ? nextPhase(doc, today) : null
  const thisMonth = today.slice(0, 7)
  const year = Y(today)

  // ---- bands ----
  const bands: BandRow[] = []
  const used = new Set<string>()
  const mk = (key: string, sleeve: Sleeve | null, planSleeve: PlanSleeve | null, w: PhaseWeight): BandRow => {
    const value = sleeve ? totals.bySleeve[sleeve.id] ?? 0 : 0
    const actual = mainValue > 0 ? (value / mainValue) * 100 : 0
    const status = mainValue > 0 ? (actual < w.min - 1e-9 ? 'below' : actual > w.max + 1e-9 ? 'above' : 'ok') : 'ok'
    return {
      key, sleeve, planSleeve, name: planSleeve?.name ?? sleeve?.name ?? key, layer: planSleeve?.layer ?? sleeve?.layer ?? 'growth',
      note: planSleeve?.note ?? sleeve?.note ?? null, accepts: planSleeve ? planSleeve.accepts_new_money : !!sleeve?.accepts_new_money,
      value, actual, target: w.target, min: w.min, max: w.max, status, gap: (w.target / 100) * mainValue - value,
    }
  }
  if (doc && phase) {
    for (const ps of doc.sleeves) {
      const id = map[ps.key]
      const sl = id ? sleeves.find((s) => s.id === id) ?? null : null
      if (sl) used.add(sl.id)
      bands.push(mk(ps.key, sl, ps, phase.weights[ps.key] ?? { target: 0, min: 0, max: 0 }))
    }
    for (const sl of sleeves) {
      if (used.has(sl.id) || !(totals.bySleeve[sl.id] > 0)) continue
      bands.push(mk(`id:${sl.id}`, sl, null, bandOf({ target_now: 0, band_min: null, band_max: null }, settings)))
    }
  } else {
    for (const sl of sleeves) bands.push(mk(`id:${sl.id}`, sl, null, bandOf(sl, settings)))
  }
  const outOfBand = bands.filter((b) => b.status !== 'ok')

  // ---- drawdown ----
  const flows = mainFlows(transactions, holdings, accounts)
  const perf = performance(snapshots, flows, undefined, mainValue, today)
  const { drawdown, peakDate } = drawdownOf(perf.points)
  let crashDrawdown = drawdown
  let crashBasis: 'sleeves' | 'portfolio' = 'portfolio'
  const crashIds = doc ? doc.rules.crash_sleeves.map((k) => map[k]).filter((x): x is string => !!x) : []
  if (crashIds.length) {
    const ids = new Set(crashIds)
    const snaps = snapshots
      .map((s) => ({ ...s, total_sar: crashIds.reduce((a, id) => a + (Number((s.by_sleeve ?? {})[id]) || 0), 0) }))
      .filter((s) => s.total_sar > 0)
    if (snaps.length >= 2) {
      const deposits = new Set(transactions.filter((t) => t.kind === 'deposit').map((t) => `${t.holding_id}|${t.tx_date}|${Math.round(Math.abs(Number(t.amount_sar)))}`))
      const sleeveFlows: Transaction[] = []
      for (const t of transactions) {
        if (!t.sleeve_id || !ids.has(t.sleeve_id)) continue
        const a = Math.abs(Number(t.amount_sar) || 0)
        if (t.kind === 'buy') {
          if (deposits.has(`${t.holding_id}|${t.tx_date}|${Math.round(a)}`)) continue
          sleeveFlows.push({ ...t, kind: 'deposit', amount_sar: a })
        } else if (t.kind === 'sell') sleeveFlows.push({ ...t, kind: 'withdrawal', amount_sar: a })
        else if (t.kind === 'deposit' || t.kind === 'withdrawal' || t.kind === 'income' || t.kind === 'transfer') sleeveFlows.push(t)
      }
      const liveValue = crashIds.reduce((a, id) => a + (totals.bySleeve[id] ?? 0), 0)
      const p2 = performance(snaps, sleeveFlows, undefined, liveValue > 0 ? liveValue : undefined, today)
      crashDrawdown = drawdownOf(p2.points).drawdown
      crashBasis = 'sleeves'
    }
  }

  // ---- milestones ----
  const expected = doc ? expectedValueAt(doc, today) : null
  const gap = expected != null ? planValue - expected : null
  const gapPct = expected != null && expected > 0 && gap != null ? (gap / expected) * 100 : null
  const status = gapPct == null ? null : gapPct > 2 ? 'ahead' : gapPct < -2 ? 'behind' : 'on'
  const ms = doc ? [...doc.milestones].sort((a, b) => a.date.localeCompare(b.date)) : []
  const prevMilestone = [...ms].reverse().find((m) => m.date <= today) ?? null
  const nextMilestone = ms.find((m) => m.date > today) ?? null

  // ---- emergency ----
  const em = doc?.emergency ?? null
  const emHoldings = holdings.filter((h) => !h.archived && h.goal_id && emergencyGoalIds.has(h.goal_id))
  const emValue = emergencyGoal ? emHoldings.reduce((a, h) => a + holdingValue(h, fx), 0) : totals.outside
  const emPlanTarget = em ? (Number(em.months) || 0) * (Number(em.monthly_expense) || 0) : 0
  const emTarget = emPlanTarget > 0 ? emPlanTarget : emergencyGoal ? Number(emergencyGoal.target_amount) || 0 : 0
  const emHolding = [...emHoldings].sort((a, b) => Number(isLumpSum(b)) - Number(isLumpSum(a)) || holdingValue(b, fx) - holdingValue(a, fx))[0] ?? null
  const emergency: EmergencyStatus = {
    enabled: !!em || !!emergencyGoal, value: emValue, target: emTarget, months: em?.months ?? 0, monthlyExpense: em?.monthly_expense ?? 0,
    shortfall: Math.max(0, emTarget - emValue), coverMonths: em && em.monthly_expense > 0 ? emValue / em.monthly_expense : null,
    pct: emTarget > 0 ? Math.min(1, emValue / emTarget) : 0, goal: emergencyGoal, holding: emHolding,
    source: emergencyGoal ? 'goal' : totals.outside > 0 ? 'accounts' : 'none',
  }

  // ---- treasury ----
  const inc = doc?.income ?? null
  const started = !!inc?.start && today >= inc.start
  const buildFrom = inc ? inc.build_from ?? inc.start : null
  const building = !!buildFrom && today >= buildFrom
  const approved = !!inc && inc.method === 'percent' && doc!.state.income_annual != null
  const annual = !inc ? 0 : inc.method === 'fixed' ? (Number(inc.fixed_monthly) || 0) * 12 : doc!.state.income_annual ?? (planValue * (Number(inc.annual_pct) || 0)) / 100
  const monthlyIncome = annual / 12
  const tTarget = inc ? (Number(inc.treasury_months) || 0) * monthlyIncome : 0
  const tShort = Math.max(0, tTarget - treasuryValue)
  const tHolding = [...treasuryHoldings].sort((a, b) => Number(isLumpSum(b)) - Number(isLumpSum(a)) || holdingValue(b, fx) - holdingValue(a, fx))[0] ?? null
  const monthsLeft = inc?.start && !started ? Math.max(1, monthsBetween(today, inc.start)) : 1
  const treasury: TreasuryStatus = {
    enabled: !!inc, started, building, value: treasuryValue, target: tTarget, monthlyIncome, annualIncome: annual, approved, shortfall: tShort,
    coverMonths: monthlyIncome > 0 ? treasuryValue / monthlyIncome : null, goal: incomeGoal, holding: tHolding, holdings: treasuryHoldings,
    transferDate: inc && started ? ymd(year, M(today), inc.transfer_day) : null,
    transferredThisMonth: transactions.some((t) => t.kind === 'income' && t.tx_date.slice(0, 7) === thisMonth && (t.source === 'planner' || (!!t.holding_id && treasuryIds.has(t.holding_id)))),
    movedThisMonth: transactions.some((t) => t.tx_date.slice(0, 7) === thisMonth && !!t.holding_id && treasuryIds.has(t.holding_id) && (t.kind === 'transfer' || t.kind === 'deposit') && Number(t.amount_sar) > 0),
    monthlyMove: Math.round(tShort / monthsLeft / 100) * 100,
    holdSales: !!inc && drawdown >= (Number(inc.no_sell_drawdown_pct) || Infinity),
  }

  // ---- contributions ----
  const yearStart = `${year}-01-01`
  const ytd = doc ? contributionSchedule(doc, yearStart, today) : []
  const month = doc ? contributionSchedule(doc, monthStartISO(today), monthEndISO(today)) : []
  const ahead = doc ? contributionSchedule(doc, addDaysISO(today, 1), addDaysISO(today, 800)) : []
  const mainTxIds = new Set(flows.map((t) => t.id))
  const isPlanDeposit = (t: Transaction) => t.kind === 'deposit' && (mainTxIds.has(t.id) || (!!t.holding_id && treasuryIds.has(t.holding_id)))
  const depYtd = transactions.filter((t) => isPlanDeposit(t) && t.tx_date >= yearStart && t.tx_date <= today).reduce((a, t) => a + Math.abs(Number(t.amount_sar) || 0), 0)
  const depMonth = transactions.filter((t) => isPlanDeposit(t) && t.tx_date.slice(0, 7) === thisMonth).reduce((a, t) => a + Math.abs(Number(t.amount_sar) || 0), 0)
  const items: ContributionItem[] = (doc?.contributions ?? []).map((c) => ({
    contribution: c,
    plannedYtd: ytd.filter((o) => o.key === c.key).reduce((a, o) => a + o.amount, 0),
    thisMonth: month.filter((o) => o.key === c.key).reduce((a, o) => a + o.amount, 0),
    next: ahead.find((o) => o.key === c.key) ?? null,
    placeable: c.kind === 'once' ? !!c.date : c.kind === 'yearly' ? !!(c.month ?? (c.date ? M(c.date) : null)) : true,
  }))
  const planned = ytd.reduce((a, o) => a + o.amount, 0)

  // ---- steps ----
  const list = (doc?.steps ?? []).map((s) => stepView(s, today)).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  const soon = addDaysISO(today, 14)

  // ---- review ----
  const rm = doc?.rules.review_month ?? 1
  const reviewStart = ymd(year, rm, 1)
  const entry = doc?.reviews.find((r) => r.year === year) ?? null
  const last = doc ? [...doc.reviews].sort((a, b) => b.year - a.year)[0] ?? null : null

  const progress: PlanProgress = {
    planValue, mainValue, treasuryValue, expected, gap, gapPct, status, prevMilestone, nextMilestone,
    phase: doc ? phase : null, nextPhase: next, daysToNextPhase: next ? daysBetween(today, next.start) : null,
    emergency, treasury,
    contributions: { year, planned, actual: depYtd, diff: depYtd - planned, plannedThisMonth: month.reduce((a, o) => a + o.amount, 0), actualThisMonth: depMonth, items },
    bands, outOfBand,
    steps: {
      done: list.filter((s) => s.done).length, total: list.length,
      overdue: list.filter((s) => s.overdue), dueSoon: list.filter((s) => !s.done && !s.overdue && !!s.due && s.due <= soon),
      next: list.find((s) => !s.done) ?? null, list,
    },
    drawdown, peakDate, crashDrawdown, crashBasis,
    review: { year, month: rm, done: !!entry, due: !!doc && !entry && today >= reviewStart && doc.created < reviewStart, entry, last },
  }
  return { doc, today, input, totals, map, incomeGoal, emergencyGoal, progress }
}

// =====================================================================================
// Actions engine
// =====================================================================================
const watchBuyPrice = (w: WatchItem) => (w.fair_value ? Number(w.fair_value) * (1 - Number(w.margin_pct ?? 20) / 100) : null)
const watchMet = (w: WatchItem) => {
  const bp = watchBuyPrice(w)
  const priceOk = bp != null && w.price != null && Number(w.price) <= bp
  return { count: [w.c_size, w.c_shariah, w.c_quality, w.c_thesis].filter(Boolean).length + (priceOk ? 1 : 0), priceOk, bp }
}
const layersOut = (n: number) => (n === 2 ? 'طبقتان خارج نطاقهما' : n <= 10 ? `${n} طبقات خارج نطاقها` : `${n} طبقة خارج نطاقها`)

/**
 * Everything the owner should do to stay on plan, most urgent first (priority, then due date).
 * Works without a plan too (data items only), so the home screen always uses it.
 * Dismissed keys (doc.state.dismissed) and, for viewers, owner-only items are left out.
 */
export function planActions(ctx: PlanContext, opts: { includeDismissed?: boolean } = {}): PlanAction[] {
  const { doc, today, input, progress: p } = ctx
  const { holdings, accounts, sleeves, fx } = input
  const out: PlanAction[] = []
  const ym = today.slice(0, 7)
  const add = (a: PlanAction) => out.push(a)

  if (doc) {
    // 1 · crash
    if (doc.rules.crash_pct > 0 && p.crashDrawdown >= doc.rules.crash_pct) {
      add({ key: `crash:${ym}`, priority: 1, tone: 'bad', area: 'rebalance', title: 'هبوط كبير: أعد التوازن الآن',
        detail: `${p.crashBasis === 'sleeves' ? 'الأسهم دون قمتها' : 'المحفظة دون قمتها'} بـ ${p0(p.crashDrawdown)}`, amount: null, due: today,
        owner: false, dismissible: true, cta: { label: 'أعد التوازن', action: 'rebalance' } })
    }
    // 1 · emergency fund
    const e = p.emergency
    if (e.target > 0 && e.shortfall > 0.5) {
      add({ key: `emergency:${ym}`, priority: 1, tone: 'warn', area: 'reserve', title: 'أكمل صندوق الطوارئ',
        detail: e.coverMonths != null ? `يغطي ${countMonths(e.coverMonths)} من ${e.months}` : `اكتمل ${Math.round(e.pct * 100)}%`,
        amount: e.shortfall, due: null, owner: true, dismissible: true, cta: { label: 'أضف إليه', action: 'emergency' } })
    } else if (doc.emergency && doc.emergency.months > 0 && !(doc.emergency.monthly_expense > 0) && !(e.goal && Number(e.goal.target_amount) > 0)) {
      add({ key: 'emergency-expense', priority: 4, tone: '', area: 'data', title: 'حدّد مصروفك الشهري', detail: 'ليُحسب هدف صندوق الطوارئ',
        amount: null, due: null, owner: true, dismissible: true, cta: { label: 'حدّد', route: 'plan/doc' } })
    }
    // 2 · review (before steps so the January step is not shown twice)
    const reviewShown = p.review.due
    if (reviewShown) {
      add({ key: `review:${p.review.year}`, priority: 2, tone: 'warn', area: 'review', title: 'المراجعة السنوية',
        detail: 'الزكاة والتطهير وإعادة التوازن ودخل السنة', amount: null, due: ymd(p.review.year, p.review.month, 1), owner: true, dismissible: false,
        cta: { label: 'ابدأ', route: 'review', action: 'review' } })
    }
    // 2 · steps due within 14 days (overdue first)
    for (const s of [...p.steps.overdue, ...p.steps.dueSoon]) {
      if (reviewShown && s.step.recurring === 'yearly' && s.due && M(s.due) === doc.rules.review_month) continue
      add({ key: s.step.recurring === 'yearly' ? `step:${s.step.key}:${Y(s.due!)}` : `step:${s.step.key}`, priority: 2, tone: 'warn', area: 'step',
        title: s.step.title, detail: s.overdue ? lateBy(-(s.days ?? 0)) : `موعدها ${inDays(s.days ?? 0)}`, amount: null, due: s.due,
        owner: true, dismissible: false, cta: { label: 'تم', action: 'step', param: s.step.key } })
    }
    // 2 · monthly income transfer
    const t = p.treasury
    if (doc.income && t.started && t.transferDate && today >= t.transferDate && !t.transferredThisMonth && t.monthlyIncome > 0) {
      add({ key: `withdraw:${ym}`, priority: 2, tone: 'accent', area: 'income', title: 'حوّل دخلك الشهري', detail: 'من خزانة الدخل إلى حسابك',
        amount: t.monthlyIncome, due: t.transferDate, owner: true, dismissible: true, cta: { label: 'سجّل التحويل', action: 'withdraw' } })
    }
  }

  // 3 · bands (with or without a plan)
  if (p.outOfBand.length && p.mainValue > 0) {
    const f = p.outOfBand[0]
    add({ key: `rebalance:${ym}`, priority: 3, tone: 'warn', area: 'rebalance',
      title: p.outOfBand.length === 1 ? `«${f.name}» خارج نطاقها` : layersOut(p.outOfBand.length),
      detail: `«${f.name}» ${p0(f.actual)} والنطاق \u2066${r1(f.min)}–${r1(f.max)}%\u2069`, amount: null, due: null,
      owner: false, dismissible: true, cta: { label: 'أعد التوازن', action: 'rebalance' } })
  }

  if (doc) {
    // 3 · contributions
    const c = p.contributions
    const monthly = c.items.filter((i) => i.contribution.kind === 'monthly' && i.thisMonth > 0)
    const monthlyDue = monthly.filter((i) => ymd(Y(today), M(today), i.contribution.day ?? 1) <= today)
    if (monthlyDue.length && c.actualThisMonth <= 0) {
      add({ key: `deposit:monthly:${ym}`, priority: 3, tone: 'accent', area: 'deposit', title: 'إيداع هذا الشهر',
        detail: monthlyDue.map((i) => i.contribution.name).join('، '), amount: monthlyDue.reduce((a, i) => a + i.thisMonth, 0),
        due: ymd(Y(today), M(today), Math.min(...monthlyDue.map((i) => i.contribution.day ?? 1))), owner: true, dismissible: true,
        cta: { label: 'خطّط إيداعك', route: 'deposit' } })
    }
    if (c.actualThisMonth < c.plannedThisMonth - 0.5) {
      const occ = contributionSchedule(doc, monthStartISO(today), monthEndISO(today)).filter((o) => o.kind !== 'monthly')
      for (const o of occ) {
        add({ key: `deposit:${o.key}:${ym}`, priority: 3, tone: 'accent', area: 'deposit', title: `${o.name}: خطتك تستثمر هذا الشهر`,
          detail: o.parts > 1 ? `الدفعة ${o.part} من ${o.parts}` : null, amount: o.amount, due: o.date, owner: true, dismissible: true,
          cta: { label: 'خطّط إيداعك', route: 'deposit' } })
      }
    }
    // 3 · income treasury
    const t = p.treasury
    if (doc.income && t.building && t.shortfall > 0.5 && !t.movedThisMonth) {
      if (t.holdSales) {
        add({ key: `treasury-hold:${ym}`, priority: 3, tone: '', area: 'info', title: `أجّل البيع: المحفظة دون قمتها بـ ${p0(p.drawdown)}`,
          detail: 'اصرف من الخزانة والتوزيعات فقط', amount: null, due: null, owner: true, dismissible: true, cta: null })
      } else if (t.monthlyMove > 0) {
        add({ key: `treasury:${ym}`, priority: 3, tone: 'accent', area: 'income', title: 'انقل إلى خزانة الدخل',
          detail: t.coverMonths != null ? `الخزانة تغطي ${countMonths(t.coverMonths)} من ${doc.income.treasury_months}` : null,
          amount: t.monthlyMove, due: null, owner: true, dismissible: true, cta: { label: 'انقل', action: 'treasury' } })
      }
    }
  }

  // 3 · zakat within 14 days
  for (const z of zakatSchedule(holdings, fx, today, 14)) {
    add({ key: `zakat:${z.holding.id}:${z.date}`, priority: 3, tone: 'warn', area: 'zakat', title: `زكاة ${z.holding.name} ${inDays(daysBetween(today, z.date))}`,
      detail: hijriLabel(z.date) || null, amount: z.amount, due: z.date, owner: false, dismissible: true, cta: { label: 'التفاصيل', route: 'income' } })
  }

  // 4 · data quality (what the home screen used to compute)
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const stale = holdings.filter((h) => !h.archived && (h.price_source === 'manual' || h.price_source === 'nav') && Number(h.quantity) > 0 &&
    (!h.price_updated_at || utc(today).getTime() - new Date(h.price_updated_at).getTime() > 35 * DAY))
  if (stale.length) add({ key: 'data:stale', priority: 4, tone: 'warn', area: 'data', title: 'حدّث القيم اليدوية',
    detail: `${countAssets(stale.length)} · مضى أكثر من شهر على آخر تحديث`, amount: null, due: null, owner: true, dismissible: false,
    cta: { label: 'حدّث', route: 'update', action: 'update' } })
  const ibkr = input.ibkr ?? null
  if (ibkr?.last_status === 'error') add({ key: 'data:ibkr-error', priority: 4, tone: 'bad', area: 'data', title: 'تعذّرت مزامنة IBKR',
    detail: ibkr.last_message ?? null, amount: null, due: null, owner: true, dismissible: false, cta: { label: 'الإعدادات', route: 'settings' } })
  else if (!ibkr?.query_id && accounts.some((a) => a.is_ibkr)) add({ key: 'data:ibkr-link', priority: 4, tone: 'accent', area: 'data', title: 'اربط حساب IBKR',
    detail: 'ليتحدث الجزء العالمي تلقائياً', amount: null, due: null, owner: true, dismissible: true, cta: { label: 'اربط', route: 'settings' } })
  const unassigned = holdings.filter((h) => !h.archived && !h.sleeve_id && !h.goal_id && Number(h.quantity) !== 0 && !(h.account_id && excluded.has(h.account_id)))
  if (unassigned.length) add({ key: 'data:no-layer', priority: 4, tone: 'warn', area: 'data', title: 'أصول بلا طبقة',
    detail: `${countAssets(unassigned.length)} · حدّد طبقتها لتدخل في التوزيع`, amount: null, due: null, owner: true, dismissible: false,
    cta: { label: 'حدّد', route: 'portfolio' } })
  const targetSum = sleeves.reduce((a, s) => a + Number(s.target_now), 0)
  if (sleeves.length && Math.round(targetSum) !== 100) add({ key: 'data:targets', priority: 4, tone: 'bad', area: 'data', title: `مجموع الأوزان المستهدفة ${p0(targetSum)}`,
    detail: 'اجعله 100%', amount: null, due: null, owner: true, dismissible: false, cta: { label: 'عدّل', route: 'plan/doc' } })
  const noHaul = holdings.filter((h) => !h.archived && h.zakatable !== false && !h.zakat_start && Number(h.quantity) * Number(h.price) > 0)
  if (noHaul.length) add({ key: 'data:haul', priority: 4, tone: '', area: 'data', title: 'حدّد بداية الحول',
    detail: `${countAssets(noHaul.length)} · ليصلك تنبيه الزكاة في موعده`, amount: null, due: null, owner: true, dismissible: true,
    cta: { label: 'حدّد', route: 'income' } })
  for (const w of (input.watchlist ?? []).filter((x) => watchMet(x).priceOk).slice(0, 2)) {
    const m = watchMet(w)
    add({ key: `data:watch:${w.id}:${ym}`, priority: 4, tone: 'accent', area: 'data', title: `${w.name} تحت سعر الشراء`,
      detail: `سعر الشراء ${m.bp!.toFixed(2)}، اكتمل ${m.count} من 5 شروط`, amount: null, due: null, owner: false, dismissible: true,
      cta: { label: 'القائمة', route: 'watch' } })
  }

  // 4 · info
  if (doc) {
    if (p.nextPhase && p.daysToNextPhase != null && p.daysToNextPhase <= 60) {
      add({ key: `phase:${p.nextPhase.key}`, priority: 4, tone: '', area: 'info', title: `تبدأ مرحلة «${p.nextPhase.name}» ${inDays(p.daysToNextPhase)}`,
        detail: 'تتغير الأوزان المستهدفة', amount: null, due: p.nextPhase.start, owner: false, dismissible: true, cta: null })
    }
    if (p.gapPct != null && p.gapPct < -10 && p.gap != null) {
      const ref = p.nextMilestone ?? p.prevMilestone
      add({ key: `milestone:${ym}`, priority: 4, tone: '', area: 'info', title: ref ? `متأخر عن محطة ${Y(ref.date)}` : 'متأخر عن مسار الخطة',
        detail: `أقل من المسار المخطط بـ ${p0(-p.gapPct)}`, amount: -p.gap, due: null, owner: false, dismissible: true, cta: null })
    }
  }

  const dismissed = doc?.state.dismissed ?? {}
  return out
    .filter((a) => opts.includeDismissed || !(a.dismissible && dismissed[a.key]))
    .filter((a) => !input.readOnly || !a.owner)
    .sort((a, b) => a.priority - b.priority || (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.key.localeCompare(b.key))
}

// =====================================================================================
// Rebalance & treasury helpers
// =====================================================================================
export interface RebalancePick { holding: Holding; amount: number }
export interface RebalanceLine {
  key: string
  sleeve: Sleeve | null
  name: string
  layer: Layer
  /** current value, SAR */
  current: number
  actual: number
  target: number
  min: number
  max: number
  action: 'buy' | 'sell' | 'hold'
  amount: number
  picks: RebalancePick[]
  /** where to buy when the sleeve has no holding yet (its note) */
  hint: string | null
  after: number
  afterPct: number
}
export interface RebalancePlan { lines: RebalanceLine[]; newMoney: number; total: number; totalAfter: number; sells: number; buys: number; unplaced: number }

const r100 = (v: number) => Math.round(v / 100) * 100

function mainHoldingsBySleeve(ctx: PlanContext) {
  const { holdings, accounts, fx } = ctx.input
  const acc = new Map(accounts.map((a) => [a.id, a]))
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const by = new Map<string, Array<{ h: Holding; v: number; payroll: boolean }>>()
  for (const h of holdings) {
    if (h.archived || h.goal_id || !h.sleeve_id || (h.account_id && excluded.has(h.account_id))) continue
    const v = holdingValue(h, fx)
    const a = h.account_id ? acc.get(h.account_id) : undefined
    const list = by.get(h.sleeve_id) ?? []
    list.push({ h, v, payroll: !!a && PAYROLL(a) })
    by.set(h.sleeve_id, list)
  }
  for (const l of by.values()) l.sort((a, b) => b.v - a.v)
  return by
}

/**
 * Bring sleeves outside their band back to target. New money goes to under-target sleeves first (rules.new_money_first);
 * only sleeves above max are sold and only sleeves below min are bought up to target; the rest of the cash follows the gaps,
 * then the target weights. Amounts are rounded to 100 SAR.
 */
export function rebalancePlan(ctx: PlanContext, newMoney = 0): RebalancePlan {
  const p = ctx.progress
  const total = p.mainValue
  const money = Math.max(0, Number(newMoney) || 0)
  const T = total + money
  const firstGaps = ctx.doc?.rules.new_money_first ?? true
  const by = mainHoldingsBySleeve(ctx)
  const rows = p.bands.map((b) => ({ b, tgt: (b.target / 100) * T, sell: 0, buy: 0 }))
  for (const r of rows) if (r.b.status === 'above') r.sell = Math.max(0, r100(r.b.value - r.tgt))
  let cash = money + rows.reduce((a, r) => a + r.sell, 0)
  const budget = cash
  const eligible = rows.filter((r) => r.b.accepts)
  const room = (r: (typeof rows)[number]) => Math.max(0, r.tgt - r.b.value - r.buy)
  // 1) sleeves below their band, up to target
  const needs = eligible.filter((r) => r.b.status === 'below')
  const needSum = needs.reduce((a, r) => a + room(r), 0)
  if (needSum > 0) {
    const k = Math.min(1, cash / needSum)
    for (const r of needs) r.buy += room(r) * k
    cash -= needSum * k
  }
  // 2) the rest: gaps first (or straight to the weights)
  if (cash > 0.5 && firstGaps) {
    const gaps = eligible.reduce((a, r) => a + room(r), 0)
    if (gaps > 0) {
      const k = Math.min(1, cash / gaps)
      const take = eligible.map((r) => room(r) * k)
      eligible.forEach((r, i) => { r.buy += take[i] })
      cash -= take.reduce((a, b) => a + b, 0)
    }
  }
  if (cash > 0.5) {
    const wSum = eligible.reduce((a, r) => a + r.b.target, 0)
    if (wSum > 0) { for (const r of eligible) r.buy += (cash * r.b.target) / wSum; cash = 0 }
  }
  // round buys to 100 and keep their sum equal to what was placed
  for (const r of rows) r.buy = r100(r.buy)
  const placed = r100(budget - cash)
  const diff = placed - rows.reduce((a, r) => a + r.buy, 0)
  const biggest = rows.reduce<(typeof rows)[number] | null>((m, r) => (r.buy > 0 && (!m || r.buy > m.buy) ? r : m), null)
  if (biggest) biggest.buy = Math.max(0, biggest.buy + diff)
  const lines: RebalanceLine[] = rows.map((r) => {
    const net = r.buy - r.sell
    const action: RebalanceLine['action'] = net > 0 ? 'buy' : net < 0 ? 'sell' : 'hold'
    const amount = Math.abs(net)
    const hs = r.b.sleeve ? by.get(r.b.sleeve.id) ?? [] : []
    const picks: RebalancePick[] = []
    if (action === 'sell') {
      let left = amount
      for (const x of hs.filter((y) => !y.payroll)) { if (left <= 0) break; const a = Math.min(left, x.v); if (a > 0) { picks.push({ holding: x.h, amount: Math.round(a) }); left -= a } }
    } else if (action === 'buy') {
      const pick = hs.find((y) => !y.payroll)
      if (pick) picks.push({ holding: pick.h, amount })
    }
    const after = r.b.value + net
    return {
      key: r.b.key, sleeve: r.b.sleeve, name: r.b.name, layer: r.b.layer, current: r.b.value, actual: r.b.actual, target: r.b.target, min: r.b.min, max: r.b.max,
      action, amount, picks, hint: action === 'buy' && !picks.length ? r.b.note : null, after, afterPct: T > 0 ? (after / T) * 100 : 0,
    }
  })
  return { lines, newMoney: money, total, totalAfter: T, sells: rows.reduce((a, r) => a + r.sell, 0), buys: rows.reduce((a, r) => a + r.buy, 0), unplaced: Math.max(0, r100(cash)) }
}

export interface TreasurySaleLine { holding: Holding; sleeve: Sleeve | null; amount: number; /** units to sell; null for a lump-sum holding */ units: number | null }
export interface TreasurySale { lines: TreasurySaleLine[]; total: number; /** what could not be found to sell */ short: number; /** growth and hedge were left out because of the drawdown rule */ held: boolean }

/**
 * Holdings to sell for the income treasury: the sleeves furthest above target first, never the treasury or the emergency fund
 * (goal holdings) nor payroll/excluded accounts. While the drawdown is at or beyond no_sell_drawdown_pct, growth and hedge are left out.
 */
export function treasurySalePlan(ctx: PlanContext, amount: number): TreasurySale {
  const want = Math.max(0, Number(amount) || 0)
  const p = ctx.progress
  const inc = ctx.doc?.income ?? null
  const held = !!inc && p.drawdown >= (Number(inc.no_sell_drawdown_pct) || Infinity)
  const skip = new Set<Layer>(held ? ['growth', 'hedge'] : [])
  const by = mainHoldingsBySleeve(ctx)
  const pool = p.bands
    .filter((b) => b.sleeve && b.value > 0 && !skip.has(b.layer))
    .map((b) => {
      const hs = (by.get(b.sleeve!.id) ?? []).filter((x) => !x.payroll && x.v > 0)
      const sellable = hs.reduce((a, x) => a + x.v, 0)
      return { b, hs, sellable, over: Math.max(0, -b.gap), take: 0 }
    })
    .filter((x) => x.sellable > 0)
    .sort((a, b) => b.over - a.over)
  let left = want
  for (const x of pool) { if (left <= 0) break; const a = Math.min(left, x.over, x.sellable); x.take += a; left -= a }
  if (left > 0) {
    const roomSum = pool.reduce((a, x) => a + (x.sellable - x.take), 0)
    if (roomSum > 0) {
      const k = Math.min(1, left / roomSum)
      for (const x of pool) { const a = (x.sellable - x.take) * k; x.take += a; left -= a }
    }
  }
  const fx = ctx.input.fx
  const lines: TreasurySaleLine[] = []
  for (const x of pool) {
    let rest = Math.round(x.take)
    for (const y of x.hs) {
      if (rest <= 0) break
      const a = Math.min(rest, Math.floor(y.v))
      if (a <= 0) continue
      const unitPrice = (Number(y.h.price) || 0) * rateOf(y.h.currency, fx)
      lines.push({ holding: y.h, sleeve: x.b.sleeve, amount: a, units: isLumpSum(y.h) || unitPrice <= 0 ? null : a / unitPrice })
      rest -= a
    }
  }
  const total = lines.reduce((a, l) => a + l.amount, 0)
  return { lines, total, short: Math.max(0, want - total), held }
}

// =====================================================================================
// Export / import
// =====================================================================================
export interface PlanFile { app: 'masar'; kind: 'plan'; version: 1; exported_at: string; plan: PlanDoc }

/** Portable JSON text of a plan (internal sleeve ids and dismissed reminders removed). */
export function exportPlan(doc: PlanDoc, sleeves: Sleeve[] = []): string {
  const map = doc.sleeve_map ?? {}
  const plan: PlanDoc = {
    ...doc,
    sleeves: doc.sleeves.map((s) => ({ ...s, note: s.note ?? sleeves.find((x) => x.id === map[s.key])?.note ?? null })),
    state: { ...doc.state, dismissed: {} },
  }
  delete plan.sleeve_map
  const file: PlanFile = { app: 'masar', kind: 'plan', version: 1, exported_at: new Date().toISOString(), plan }
  return JSON.stringify(file, null, 2)
}

/** «خطة-<name>-<date>.masar.json» */
export const planFileName = (doc: PlanDoc, date: ISODate = todayISO()) => {
  const name = (doc.name || 'خطتي').trim().replace(/^خطة\s+/, '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') || 'خطتي'
  return `خطة-${name}-${date}${PLAN_FILE_EXT}`
}

export interface PlanCheck { errors: string[]; warnings: string[] }

/** Checks a plan before saving or importing. Errors block; warnings only inform. */
export function validatePlan(doc: PlanDoc): PlanCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const keys = new Set<string>()
  if (!doc.name.trim()) errors.push('اكتب اسم الخطة')
  if (!doc.sleeves.length) errors.push('أضف فئات الأصول (الشرائح)')
  for (const s of doc.sleeves) {
    if (keys.has(s.key)) errors.push(`المفتاح «${s.key}» مكرر`)
    keys.add(s.key)
    if (!s.name.trim()) errors.push(`اكتب اسم الشريحة «${s.key}»`)
  }
  if (!doc.phases.length) errors.push('أضف مرحلة واحدة على الأقل')
  const starts = new Set<string>()
  for (const ph of doc.phases) {
    if (!isISODate(ph.start)) errors.push(`تاريخ بداية مرحلة «${ph.name}» غير صحيح`)
    if (starts.has(ph.start)) errors.push(`مرحلتان تبدآن في التاريخ نفسه ${ph.start}`)
    starts.add(ph.start)
    let sum = 0
    for (const [k, w] of Object.entries(ph.weights)) {
      if (!keys.has(k)) { errors.push(`مرحلة «${ph.name}»: وزن لشريحة غير موجودة «${k}»`); continue }
      const vals = [w.target, w.min, w.max]
      if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) { errors.push(`مرحلة «${ph.name}»: أرقام «${k}» يجب أن تكون بين 0 و100`); continue }
      if (!(w.min <= w.target && w.target <= w.max)) errors.push(`مرحلة «${ph.name}»: «${doc.sleeves.find((s) => s.key === k)?.name ?? k}» يجب أن يكون الحد الأدنى ≤ المستهدف ≤ الحد الأعلى`)
      sum += w.target
    }
    if (Math.abs(sum - 100) > 0.5) errors.push(`مرحلة «${ph.name}»: مجموع الأوزان ${Math.round(sum * 10) / 10}% ويجب أن يكون 100%`)
    const missing = doc.sleeves.filter((s) => !ph.weights[s.key]).map((s) => s.name)
    if (missing.length) warnings.push(`مرحلة «${ph.name}»: لا وزن لـ ${missing.join('، ')} (تُعدّ 0%)`)
  }
  const today = todayISO()
  if (doc.phases.length && !doc.phases.some((p) => p.start <= today)) warnings.push('لم تبدأ أي مرحلة بعد؛ تُطبَّق أوزان المرحلة الأولى حتى تبدأ')
  if (doc.baseline && (!isISODate(doc.baseline.date) || !(doc.baseline.value >= 0))) errors.push('نقطة البداية غير صحيحة')
  for (const m of doc.milestones) if (!isISODate(m.date) || !(m.value >= 0)) errors.push(`محطة غير صحيحة: ${m.date}`)
  if (!doc.milestones.length) warnings.push('لا توجد محطات؛ لن تظهر المقارنة بالمسار المخطط')
  const ckeys = new Set<string>()
  for (const c of doc.contributions) {
    if (ckeys.has(c.key)) errors.push(`مفتاح الإيداع «${c.key}» مكرر`)
    ckeys.add(c.key)
    if (!(c.amount >= 0)) errors.push(`«${c.name}»: المبلغ غير صحيح`)
    else if (c.amount === 0) warnings.push(`«${c.name}»: المبلغ صفر`)
    if (c.day != null && !(c.day >= 1 && c.day <= 31)) errors.push(`«${c.name}»: اليوم يجب أن يكون بين 1 و31`)
    if (c.month != null && !(c.month >= 1 && c.month <= 12)) errors.push(`«${c.name}»: الشهر يجب أن يكون بين 1 و12`)
    if (c.split_months != null && !(c.split_months >= 1 && c.split_months <= 24)) errors.push(`«${c.name}»: عدد الدفعات بين 1 و24`)
    if (c.kind === 'once' && !c.date) errors.push(`«${c.name}»: حدّد تاريخ المبلغ`)
    if (c.kind === 'yearly' && !c.month && !c.date) warnings.push(`«${c.name}»: حدّد شهره ليدخل في المقارنة`)
    if (c.until && c.date && c.until < c.date) errors.push(`«${c.name}»: تاريخ الانتهاء قبل البداية`)
  }
  if (doc.emergency) {
    if (!(doc.emergency.months >= 0) || !(doc.emergency.monthly_expense >= 0)) errors.push('أرقام صندوق الطوارئ غير صحيحة')
    else if (doc.emergency.months > 0 && doc.emergency.monthly_expense === 0) warnings.push('صندوق الطوارئ: حدّد مصروفك الشهري')
  }
  const inc = doc.income
  if (inc) {
    if (inc.method === 'percent' && !(inc.annual_pct > 0 && inc.annual_pct <= 20)) errors.push('نسبة السحب السنوية يجب أن تكون بين 0 و20%')
    if (inc.method === 'fixed' && !(Number(inc.fixed_monthly) > 0)) errors.push('اكتب الدخل الشهري الثابت')
    if (!(inc.band_pct >= 0 && inc.band_pct <= 100)) errors.push('سقف تغيّر الدخل غير صحيح')
    if (!(inc.treasury_months >= 0 && inc.treasury_months <= 120)) errors.push('أشهر خزانة الدخل غير صحيحة')
    if (!(inc.transfer_day >= 1 && inc.transfer_day <= 28)) errors.push('يوم التحويل يجب أن يكون بين 1 و28')
    if (!(inc.no_sell_drawdown_pct >= 0 && inc.no_sell_drawdown_pct <= 100)) errors.push('نسبة إيقاف البيع غير صحيحة')
    if (!inc.start) warnings.push('خزانة الدخل: حدّد تاريخ بدء الدخل')
    if (inc.start && inc.build_from && inc.build_from > inc.start) warnings.push('بدء تعبئة الخزانة بعد بدء الدخل')
  }
  if (!(doc.rules.review_month >= 1 && doc.rules.review_month <= 12)) errors.push('شهر المراجعة بين 1 و12')
  if (!(doc.rules.crash_pct >= 0 && doc.rules.crash_pct <= 100)) errors.push('نسبة الهبوط الكبير غير صحيحة')
  for (const k of doc.rules.crash_sleeves) if (!keys.has(k)) errors.push(`قاعدة الهبوط: شريحة غير موجودة «${k}»`)
  const skeys = new Set<string>()
  for (const s of doc.steps) {
    if (skeys.has(s.key)) errors.push(`مفتاح الخطوة «${s.key}» مكرر`)
    skeys.add(s.key)
    if (!s.title.trim()) errors.push('خطوة بلا عنوان')
  }
  return { errors, warnings }
}

export interface ParsedPlan { ok: boolean; doc: PlanDoc | null; errors: string[]; warnings: string[] }

/** Reads an exported plan file (or a bare plan document), checks it, and returns the plan without device-specific data. */
export function parsePlanFile(text: string): ParsedPlan {
  let raw: unknown
  try { raw = JSON.parse(String(text ?? '').replace(/^﻿/, '')) } catch { return { ok: false, doc: null, errors: ['الملف ليس بصيغة صحيحة'], warnings: [] } }
  const r = obj(raw)
  const warnings: string[] = []
  let planRaw: unknown = r
  if ('plan' in r) {
    if (r.app !== 'masar' || r.kind !== 'plan') warnings.push('الملف لم يُصدَّر من مسار؛ تحقّق من محتواه')
    if (Number(r.version) > 1) return { ok: false, doc: null, errors: ['الملف من إصدار أحدث من التطبيق؛ حدّث التطبيق ثم أعد المحاولة'], warnings }
    planRaw = r.plan
  } else if (!('phases' in r) || !('sleeves' in r)) {
    return { ok: false, doc: null, errors: ['الملف لا يحتوي على خطة'], warnings }
  }
  const pr = obj(planRaw)
  if (pr.version != null && Number(pr.version) !== 1) return { ok: false, doc: null, errors: ['إصدار الخطة غير مدعوم'], warnings }
  // raw checks the normaliser would hide
  const errors: string[] = []
  for (const s of arr<any>(pr.sleeves)) if (s && s.layer != null && !isLayer(s.layer)) errors.push(`طبقة غير معروفة «${s.layer}» في «${s.name ?? s.key}»`)
  for (const ph of arr<any>(pr.phases)) if (ph && !isISODate(ph.start)) errors.push(`تاريخ بداية مرحلة «${ph.name ?? ''}» غير صحيح`)
  for (const m of arr<any>(pr.milestones)) if (m && (!isISODate(m.date) || !Number.isFinite(Number(m.value)))) errors.push('محطة بتاريخ أو قيمة غير صحيحة')
  for (const c of arr<any>(pr.contributions)) {
    for (const f of ['date', 'until']) if (c && c[f] != null && !isISODate(c[f])) errors.push(`«${c.name ?? c.key}»: تاريخ غير صحيح`)
    if (c && !['monthly', 'yearly', 'once'].includes(c.kind)) errors.push(`«${c.name ?? c.key}»: نوع الإيداع غير معروف`)
  }
  for (const s of arr<any>(pr.steps)) for (const f of ['due', 'done_at']) if (s && s[f] != null && !isISODate(s[f])) errors.push(`الخطوة «${s.title ?? s.key}»: تاريخ غير صحيح`)
  const doc = normalizePlan(planRaw)
  delete doc.sleeve_map
  doc.state = { ...doc.state, dismissed: {} }
  const check = validatePlan(doc)
  const all = [...new Set([...errors, ...check.errors])]
  return { ok: all.length === 0, doc, errors: all, warnings: [...warnings, ...check.warnings] }
}

/** Sets the plan's starting point to the current plan value when it has none. */
export const withBaseline = (doc: PlanDoc, value: number, today: ISODate = todayISO()): PlanDoc =>
  doc.baseline || !(value > 0) ? doc : { ...doc, baseline: { date: today, value: Math.round(value) } }

/** Keeps dismissed reminders for about a year. */
export function pruneDismissed(d: Record<string, ISODate>, today: ISODate = todayISO()): Record<string, ISODate> {
  const cut = addDaysISO(today, -400)
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v >= cut))
}
