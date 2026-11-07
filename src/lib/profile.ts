// The user's financial situation: income streams, obligations, plan templates, and goal portfolios.
import type { Goal, GoalBucket, IncomeStream, Layer, MoneyEvent, Obligation, PlanSettings } from './types'
import { isoOf, utc } from './income'

// ---------- income streams ----------
export const STREAM_KINDS: Array<{ kind: IncomeStream['kind']; label: string; frequency: IncomeStream['frequency']; invest: number; hint: string }> = [
  { kind: 'bonus', label: 'مكافأة سنوية', frequency: 'yearly', invest: 70, hint: 'مكافأة الأداء أو الأرباح السنوية' },
  { kind: 'vacation_bonus', label: 'بدل أو مكافأة إجازة', frequency: 'yearly', invest: 100, hint: 'تُصرف مرة في السنة' },
  { kind: 'advance', label: 'سلفة أو قرض من جهة العمل', frequency: 'irregular', invest: 100, hint: 'المبلغ الصافي الذي تستثمره عند كل تجديد' },
  { kind: 'savings_program', label: 'برنامج ادخار جهة العمل', frequency: 'monthly', invest: 100, hint: 'المبلغ الشهري مع مساهمة جهة العمل، أو مبلغ الاستحقاق' },
  { kind: 'side', label: 'دخل من مشروع جانبي', frequency: 'monthly', invest: 50, hint: 'متجر، عمل حر، تطبيق' },
  { kind: 'rent', label: 'إيجار عقار', frequency: 'yearly', invest: 100, hint: 'الدفعات السنوية أو نصف السنوية' },
  { kind: 'other', label: 'أخرى', frequency: 'once', invest: 100, hint: 'ميراث، بيع أصل، مبلغ متوقع' },
]
export const STREAM_LABEL = Object.fromEntries(STREAM_KINDS.map((k) => [k.kind, k.label])) as Record<IncomeStream['kind'], string>
export const FREQUENCY_LABEL: Record<IncomeStream['frequency'], string> = { monthly: 'كل شهر', yearly: 'كل سنة', once: 'مرة واحدة', irregular: 'غير منتظم' }

/** How much of a stream is invested in a typical year. One-off amounts are not part of the yearly pace. */
export function streamYearly(st: IncomeStream) {
  const invested = (Number(st.amount) || 0) * ((Number(st.invest_pct) || 0) / 100)
  if (st.frequency === 'monthly') return invested * 12
  if (st.frequency === 'yearly' || st.frequency === 'irregular') return invested
  return 0
}

export interface ContributionBreakdown { monthly: number; streams: Array<{ stream: IncomeStream; yearly: number }>; total: number }
export function contributionFromProfile(s: PlanSettings, streams: IncomeStream[]): ContributionBreakdown {
  const monthly = (Number(s.monthly_invest) || 0) * 12
  const rows = streams.map((stream) => ({ stream, yearly: streamYearly(stream) })).filter((r) => r.yearly > 0)
  return { monthly, streams: rows, total: monthly + rows.reduce((a, r) => a + r.yearly, 0) }
}

/** Next date a stream arrives, from its fixed date or its usual month. Null when it has no date. */
export function nextStreamDate(st: IncomeStream, fromISO: string): string | null {
  if (st.next_date && st.next_date >= fromISO) return st.next_date
  if (st.frequency === 'once') return null
  if (st.frequency === 'yearly' && (st.month || st.next_date)) {
    const from = utc(fromISO)
    const m = st.month ?? Number(st.next_date!.slice(5, 7))
    const day = st.next_date ? Number(st.next_date.slice(8, 10)) : 1
    let d = new Date(Date.UTC(from.getUTCFullYear(), m - 1, day, 12))
    if (d < from) d = new Date(Date.UTC(from.getUTCFullYear() + 1, m - 1, day, 12))
    return isoOf(d)
  }
  return null
}

export const obligationsMonthly = (obligations: Obligation[], year = new Date().getFullYear()) =>
  obligations.filter((o) => !o.end_year || o.end_year >= year).reduce((a, o) => a + Number(o.monthly_amount || 0), 0)

/** Cached totals kept on plan_settings so the projections use them without another lookup. */
export const obligationsCache = (obligations: Obligation[]) => ({
  mortgage_monthly: obligationsMonthly(obligations),
  mortgage_end_year: Math.max(new Date().getFullYear(), ...obligations.map((o) => o.end_year ?? 0)),
})

// ---------- plan templates ----------
export interface TemplateSleeve { name: string; layer: Layer; target_now: number; target_fi: number; accepts?: boolean; expected_return: number; yield_pct: number; note: string; asset: AssetType }
export type AssetType = 'cash' | 'income_fund' | 'sukuk' | 'reit' | 'saudi_equity' | 'global_equity' | 'stocks' | 'gold'

export const ASSET_TYPES: Array<{ type: AssetType; label: string }> = [
  { type: 'cash', label: 'نقد أو مرابحة' },
  { type: 'income_fund', label: 'صندوق توزيعات' },
  { type: 'sukuk', label: 'صكوك أو صندوق صكوك' },
  { type: 'reit', label: 'صندوق ريت' },
  { type: 'saudi_equity', label: 'صندوق أسهم سعودية' },
  { type: 'global_equity', label: 'صندوق أسهم عالمية' },
  { type: 'stocks', label: 'أسهم مباشرة' },
  { type: 'gold', label: 'ذهب' },
]

const base = (now: number[], fi: number[]): TemplateSleeve[] => [
  { name: 'أسهم عالمية متوافقة', layer: 'growth', target_now: now[0], target_fi: fi[0], expected_return: 7.5, yield_pct: 1.5, note: 'صندوق مؤشر عالمي متوافق مع الشريعة', asset: 'global_equity' },
  { name: 'أسهم سعودية متوافقة', layer: 'growth', target_now: now[1], target_fi: fi[1], expected_return: 8, yield_pct: 3, note: 'صندوق مؤشر أو صندوق متداول منخفض الرسوم', asset: 'saudi_equity' },
  { name: 'أسهم مباشرة نوعية', layer: 'growth', target_now: now[2], target_fi: fi[2], accepts: false, expected_return: 8, yield_pct: 2, note: 'بشروط قائمة المراقبة فقط', asset: 'stocks' },
  { name: 'صكوك', layer: 'income', target_now: now[3], target_fi: fi[3], expected_return: 5, yield_pct: 5, note: 'صكوك حكومية أو صندوق صكوك', asset: 'sukuk' },
  { name: 'صناديق ريت', layer: 'income', target_now: now[4], target_fi: fi[4], expected_return: 6.5, yield_pct: 6.5, note: 'موزعة على أكثر من صندوق', asset: 'reit' },
  { name: 'صناديق التوزيعات', layer: 'income', target_now: now[5], target_fi: fi[5], expected_return: 6, yield_pct: 7, note: 'صناديق توزيع شهري أو ربع سنوي', asset: 'income_fund' },
  { name: 'سيولة ومرابحة', layer: 'safety', target_now: now[6], target_fi: fi[6], expected_return: 4.5, yield_pct: 4.5, note: 'احتياطي سيولة', asset: 'cash' },
  { name: 'ذهب', layer: 'hedge', target_now: now[7], target_fi: fi[7], expected_return: 4, yield_pct: 0, note: 'صندوق ذهب متداول', asset: 'gold' },
]

export const TEMPLATES: Array<{ key: string; name: string; desc: string; sleeves: TemplateSleeve[]; expected: number }> = [
  { key: 'balanced', name: 'متوازن', desc: 'مزيج من النمو والتوزيعات النقدية والسيولة', expected: 6.5,
    sleeves: base([45, 12, 8, 10, 5, 5, 5, 10], [33, 9, 5, 22, 8, 5, 10, 8]) },
  { key: 'income', name: 'يميل للدخل', desc: 'توزيعات نقدية أعلى من البداية، ونمو أبطأ', expected: 5.5,
    sleeves: base([25, 10, 5, 20, 10, 15, 7, 8], [20, 8, 4, 28, 10, 12, 10, 8]) },
  { key: 'growth', name: 'يميل للنمو', desc: 'نمو أعلى، وتذبذب أكبر', expected: 7.5,
    sleeves: base([55, 15, 8, 5, 3, 2, 4, 8], [40, 10, 5, 18, 7, 5, 8, 7]) },
]

// ---------- goal portfolios ----------
export const GOAL_PRESETS: Array<{ key: string; name: string; desc: string; expected: number; buckets: GoalBucket[] }> = [
  { key: 'cash', name: 'نقدي', desc: 'لهدف خلال سنتين: لا تذبذب', expected: 4.5, buckets: [{ key: 'cash', name: 'سيولة ومرابحة', weight: 100 }] },
  { key: 'conservative', name: 'متحفظ', desc: 'من سنتين إلى أربع', expected: 5, buckets: [{ key: 'cash', name: 'سيولة ومرابحة', weight: 60 }, { key: 'sukuk', name: 'صكوك', weight: 40 }] },
  { key: 'balanced', name: 'متوازن', desc: 'من أربع إلى سبع سنوات', expected: 6, buckets: [{ key: 'cash', name: 'سيولة ومرابحة', weight: 25 }, { key: 'sukuk', name: 'صكوك', weight: 35 }, { key: 'equity', name: 'أسهم وصناديق مؤشر', weight: 40 }] },
  { key: 'growth', name: 'نمو', desc: 'أكثر من سبع سنوات', expected: 7.5, buckets: [{ key: 'sukuk', name: 'صكوك', weight: 20 }, { key: 'equity', name: 'أسهم وصناديق مؤشر', weight: 80 }] },
]
export const presetForYears = (years: number) => GOAL_PRESETS[years < 2 ? 0 : years < 4 ? 1 : years < 7 ? 2 : 3]

export const monthsUntil = (iso: string | null) => {
  if (!iso) return null
  const now = new Date()
  const d = new Date(iso + 'T12:00:00')
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()) + (d.getDate() >= now.getDate() ? 0 : -1))
}

/** Monthly saving that reaches `target` in `months` from `pv` at `annualReturn` %. */
export function requiredMonthly(target: number, pv: number, months: number, annualReturn: number) {
  if (months <= 0) return Math.max(0, target - pv)
  const r = annualReturn / 100 / 12
  const fvPv = pv * Math.pow(1 + r, months)
  const gap = target - fvPv
  if (gap <= 0) return 0
  return r === 0 ? gap / months : (gap * r) / (Math.pow(1 + r, months) - 1)
}

export interface GoalStatus { goal: Goal; value: number; progress: number; months: number | null; need: number; projected: number | null; onTrack: boolean | null }
export function goalStatus(goal: Goal, value: number, monthlyPlan?: number): GoalStatus {
  const months = monthsUntil(goal.target_date)
  const need = months == null ? 0 : requiredMonthly(Number(goal.target_amount), value, months, Number(goal.expected_return))
  const r = Number(goal.expected_return) / 100 / 12
  const projected = months == null ? null : value * Math.pow(1 + r, months) + (monthlyPlan ?? 0) * (r ? (Math.pow(1 + r, months) - 1) / r : months)
  const progress = Number(goal.target_amount) > 0 ? Math.min(1, value / Number(goal.target_amount)) : 0
  return { goal, value, progress, months, need, projected, onTrack: projected == null || monthlyPlan == null ? null : projected >= Number(goal.target_amount) * 0.99 }
}

// ---------- calendar entries from the profile ----------
export interface ProfileOcc { event: MoneyEvent; date: string; route: 'profile' | 'goals' | 'deposit' }
const vEvent = (id: string, title: string, kind: MoneyEvent['kind'], date: string, amount: number | null, note: string | null): MoneyEvent =>
  ({ id: `v:${id}`, title, kind, event_date: date, amount, recurrence: 'none', done: false, note })
const KIND_EVENT: Record<IncomeStream['kind'], MoneyEvent['kind']> = {
  bonus: 'bonus', vacation_bonus: 'vacation_bonus', advance: 'advance', savings_program: 'vesting', side: 'deposit', rent: 'deposit', other: 'deposit',
}

export function profileOccurrences(args: { s: PlanSettings; streams: IncomeStream[]; goals: Goal[]; fromISO: string; days: number }): ProfileOcc[] {
  const { s, streams, goals, fromISO, days } = args
  const from = utc(fromISO)
  const to = new Date(from.getTime() + days * 86400000)
  const toISO = isoOf(to)
  const out: ProfileOcc[] = []
  for (const st of streams) {
    if (st.frequency === 'monthly') continue
    const invest = Math.round((Number(st.amount) || 0) * (Number(st.invest_pct) / 100))
    let next = nextStreamDate(st, fromISO)
    for (let k = 0; next && next <= toISO && k < 15; k++) {
      out.push({ route: 'deposit', date: next, event: vEvent(`s:${st.id}:${next}`, st.name, KIND_EVENT[st.kind], next, invest || null, `${STREAM_LABEL[st.kind]}، للاستثمار${st.frequency === 'irregular' ? '، التاريخ تقديري' : ''}`) })
      if (st.frequency !== 'yearly') break
      next = isoOf(new Date(Date.UTC(Number(next.slice(0, 4)) + 1, Number(next.slice(5, 7)) - 1, Number(next.slice(8, 10)), 12)))
    }
  }
  if (s.deposit_day) {
    for (let k = 0; k < Math.ceil(days / 28) + 1; k++) {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + k, s.deposit_day, 12))
      if (d < from || d > to) continue
      const date = isoOf(d)
      out.push({ route: 'deposit', date, event: vEvent(`d:${date}`, 'الإيداع الشهري', 'deposit', date, s.monthly_invest ? Math.round(Number(s.monthly_invest)) : null, s.monthly_invest ? 'من الراتب' : 'المبلغ يتغير؛ قسّمه من مخطط الإيداع') })
    }
  }
  for (const g of goals) {
    if (g.archived || !g.target_date || g.target_date < fromISO || g.target_date > toISO) continue
    out.push({ route: 'goals', date: g.target_date, event: vEvent(`g:${g.id}`, `موعد هدف ${g.name}`, 'other', g.target_date, Math.round(Number(g.target_amount)), 'المبلغ المستهدف') })
  }
  return out
}
