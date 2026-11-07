// Ready-made starting points for «الخطة». Generic: no personal amounts, only weights, bands, rules and a few steps.
import { bandOf } from './calc'
import { todayISO } from './format'
import { emptyPlan, ymd, type ISODate, type PhaseWeight, type PlanDoc, type PlanSleeve } from './plan'
import type { PlanSettings, Sleeve } from './types'

export interface PlanTemplate { key: string; name: string; desc: string; build: (today?: ISODate) => PlanDoc }

const Y = (iso: ISODate) => Number(iso.slice(0, 4))
const M = (iso: ISODate) => Number(iso.slice(5, 7))

/** target with a band of ±20% of the weight, at least 2 points */
const w = (target: number, width?: number): PhaseWeight => {
  const d = width ?? Math.max(2, Math.round(target * 0.2))
  return { target, min: Math.max(0, target - d), max: Math.min(100, target + d) }
}
const weights = (keys: string[], targets: number[], widths: Array<number | undefined> = []) =>
  Object.fromEntries(keys.map((k, i) => [k, w(targets[i], widths[i])]))
const nextJanuary = (today: ISODate) => (M(today) === 1 && Number(today.slice(8, 10)) <= 15 ? ymd(Y(today), 1, 31) : ymd(Y(today) + 1, 1, 31))
const later = (today: ISODate, days: number) => new Date(new Date(today + 'T12:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10)

const BALANCED_SLEEVES: PlanSleeve[] = [
  { key: 'global', name: 'أسهم عالمية متوافقة', layer: 'growth', accepts_new_money: true, note: 'صندوق مؤشر عالمي متوافق مع الشريعة ومنخفض الرسوم' },
  { key: 'saudi', name: 'أسهم سعودية متوافقة', layer: 'growth', accepts_new_money: true, note: 'صندوق مؤشر أو صندوق متداول' },
  { key: 'direct', name: 'أسهم مباشرة نوعية', layer: 'growth', accepts_new_money: false, note: 'بشروط قائمة المراقبة فقط' },
  { key: 'sukuk', name: 'صكوك', layer: 'income', accepts_new_money: true, note: 'صكوك حكومية أو صندوق صكوك' },
  { key: 'reit', name: 'صناديق ريت', layer: 'income', accepts_new_money: true, note: 'أكثر من صندوق من قطاعات مختلفة' },
  { key: 'cash', name: 'سيولة ومرابحة', layer: 'safety', accepts_new_money: true, note: 'صندوق أسواق نقد' },
  { key: 'gold', name: 'ذهب', layer: 'hedge', accepts_new_money: true, note: 'صندوق ذهب متداول' },
]

function balanced(today: ISODate = todayISO()): PlanDoc {
  const keys = BALANCED_SLEEVES.map((s) => s.key)
  const doc = emptyPlan('خطة متوازنة للاستقلال المالي', today)
  return {
    ...doc,
    sleeves: BALANCED_SLEEVES,
    phases: [
      { key: 'build', name: 'البناء', start: today, note: 'نمو أعلى، والأموال الجديدة للفئات الناقصة', weights: weights(keys, [45, 15, 5, 15, 8, 5, 7], [5, 3, 5, 3, 3, 2, 2]) },
      { key: 'shift', name: 'الانتقال', start: ymd(Y(today) + 7, 1, 1), note: 'انتقال تدريجي نحو الدخل دون بيع دفعة واحدة', weights: weights(keys, [38, 13, 4, 22, 10, 6, 7], [5, 3, 4, 4, 3, 2, 2]) },
      { key: 'income', name: 'الدخل', start: ymd(Y(today) + 12, 1, 1), note: 'السيولة هي خزانة الدخل', weights: weights(keys, [32, 10, 3, 27, 12, 10, 6], [5, 3, 3, 4, 3, 3, 2]) },
    ],
    contributions: [
      { key: 'monthly', name: 'الإيداع الشهري', kind: 'monthly', amount: 0, day: 27, month: null, date: null, until: null, split_months: null, growth_pct: null, note: 'اكتب المبلغ الذي تستثمره كل شهر' },
    ],
    emergency: { months: 6, monthly_expense: 0 },
    income: { start: ymd(Y(today) + 12, 1, 1), method: 'percent', annual_pct: 4, fixed_monthly: null, band_pct: 10, treasury_months: 24, transfer_day: 27, no_sell_drawdown_pct: 20, build_from: null },
    rules: { review_month: 1, crash_pct: 25, crash_sleeves: ['global'], new_money_first: true },
    steps: [
      { key: 'emergency', title: 'افصل صندوق طوارئ يغطي ستة أشهر من مصروفك', detail: 'خارج المحفظة وفي سيولة متاحة', due: later(today, 30), done_at: null, recurring: 'none' },
      { key: 'account', title: 'افتح حساب استثمار منخفض الرسوم', detail: 'يتيح الصناديق المتداولة المحلية والعالمية', due: later(today, 45), done_at: null, recurring: 'none' },
      { key: 'auto', title: 'فعّل التحويل الشهري الآلي', detail: 'في يوم الراتب', due: later(today, 60), done_at: null, recurring: 'none' },
      { key: 'review', title: 'المراجعة السنوية', detail: 'الزكاة والتطهير، ثم إعادة التوازن، ثم تحديث الخطة', due: nextJanuary(today), done_at: null, recurring: 'yearly' },
    ],
  }
}

const INCOME_SLEEVES: PlanSleeve[] = [
  { key: 'global', name: 'أسهم عالمية متوافقة', layer: 'growth', accepts_new_money: true, note: 'تحمي الدخل من التضخم' },
  { key: 'saudi', name: 'أسهم سعودية توزيعية', layer: 'growth', accepts_new_money: true, note: 'شركات بتوزيعات منتظمة' },
  { key: 'sukuk', name: 'صكوك', layer: 'income', accepts_new_money: true, note: 'صكوك حكومية متوسطة الأجل' },
  { key: 'reit', name: 'صناديق ريت', layer: 'income', accepts_new_money: true, note: 'دخل إيجاري موزع' },
  { key: 'dist', name: 'صناديق التوزيعات', layer: 'income', accepts_new_money: true, note: 'توزيع شهري أو ربع سنوي' },
  { key: 'cash', name: 'سيولة ومرابحة', layer: 'safety', accepts_new_money: true, note: 'جزء من خزانة الدخل' },
  { key: 'gold', name: 'ذهب', layer: 'hedge', accepts_new_money: true, note: 'صندوق ذهب متداول' },
]

function income(today: ISODate = todayISO()): PlanDoc {
  const keys = INCOME_SLEEVES.map((s) => s.key)
  const doc = emptyPlan('خطة دخل', today)
  return {
    ...doc,
    sleeves: INCOME_SLEEVES,
    phases: [
      { key: 'income', name: 'الدخل', start: today, note: 'توزيعات نقدية أولاً، ثم البيع من الفئة الزائدة', weights: weights(keys, [30, 10, 25, 12, 8, 10, 5], [5, 3, 4, 3, 3, 3, 2]) },
      { key: 'late', name: 'الدخل المتأخر', start: ymd(Y(today) + 10, 1, 1), note: 'تذبذب أقل مع التقدم في العمر', weights: weights(keys, [25, 8, 30, 12, 8, 12, 5], [5, 3, 4, 3, 3, 3, 2]) },
    ],
    emergency: { months: 6, monthly_expense: 0 },
    income: { start: today, method: 'percent', annual_pct: 4, fixed_monthly: null, band_pct: 10, treasury_months: 24, transfer_day: 27, no_sell_drawdown_pct: 20, build_from: today },
    rules: { review_month: 1, crash_pct: 25, crash_sleeves: ['global'], new_money_first: true },
    steps: [
      { key: 'treasury', title: 'أنشئ خزانة الدخل', detail: 'صندوق أسواق نقد يغطي سنتين من الدخل', due: later(today, 30), done_at: null, recurring: 'none' },
      { key: 'transfer', title: 'حدّد يوم التحويل الشهري إلى حسابك', detail: null, due: later(today, 30), done_at: null, recurring: 'none' },
      { key: 'review', title: 'المراجعة السنوية واعتماد دخل السنة', detail: 'الزكاة والتطهير، ثم إعادة التوازن، ثم دخل السنة', due: nextJanuary(today), done_at: null, recurring: 'yearly' },
    ],
  }
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  { key: 'balanced', name: 'خطة متوازنة للاستقلال المالي', desc: 'بناء ثم انتقال ثم دخل، بأوزان ونطاقات لكل مرحلة', build: balanced },
  { key: 'income', name: 'خطة دخل', desc: 'لمن يعيش على دخل المحفظة: خزانة نقدية وسحب سنوي بسقف', build: income },
]

const slug = (s: Sleeve, i: number, used: Set<string>) => {
  let k = `${s.layer}-${i + 1}`
  while (used.has(k)) k += 'x'
  used.add(k)
  return k
}

/** «ابدأ من أوزانك الحالية»: one phase from today with the current sleeves, their targets and bands. */
export function planFromSleeves(sleeves: Sleeve[], settings: PlanSettings | null, today: ISODate = todayISO(), name = 'خطتي'): PlanDoc {
  const doc = emptyPlan(name, today)
  const used = new Set<string>()
  const rows = [...sleeves].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map((s, i) => ({ s, key: slug(s, i, used) }))
  return {
    ...doc,
    sleeves: rows.map(({ s, key }) => ({ key, name: s.name, layer: s.layer, accepts_new_money: !!s.accepts_new_money, note: s.note })),
    sleeve_map: Object.fromEntries(rows.map(({ s, key }) => [key, s.id])),
    phases: [{
      key: 'p1', name: 'الحالية', start: today, note: null,
      weights: Object.fromEntries(rows.map(({ s, key }) => { const b = bandOf(s, settings); return [key, { target: b.target, min: Math.min(b.min, b.target), max: Math.max(b.max, b.target) }] })),
    }],
    emergency: { months: 6, monthly_expense: 0 },
    rules: { review_month: settings?.income_review_month ?? 1, crash_pct: 25, crash_sleeves: rows.filter(({ s }) => s.layer === 'growth').slice(0, 1).map(({ key }) => key), new_money_first: true },
  }
}
