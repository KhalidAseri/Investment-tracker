// Ready-made starting points for «الخطة», built by the designer (designer.ts) with generic answers: no personal amounts
// (no income, expense or contribution figures), only weights, bands, build order, reserves, rules and a few steps.
import { bandOf } from './calc'
import { todayISO } from './format'
import { ALL_PLATFORMS } from './catalog'
import { designPlan, type DesignAnswers } from './designer'
import { emptyPlan, normalizePlan, type ISODate, type PlanDoc } from './plan'
import type { PlanSettings, Sleeve } from './types'

export interface PlanTemplate { key: string; name: string; desc: string; build: (today?: ISODate) => PlanDoc }

const Y = (iso: ISODate) => Number(iso.slice(0, 4))

/**
 * A designer plan with generic answers; platforms = all, so instruments come from the whole catalog. The profile is left
 * empty: the owner has not answered the designer's questions yet (the plan checks then invite him to).
 */
const designed = (name: string, answers: (today: ISODate) => Omit<DesignAnswers, 'today'>) => (today: ISODate = todayISO()): PlanDoc => {
  const doc = designPlan({ ...answers(today), today }).doc
  return { ...doc, name, profile: null }
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    key: 'balanced', name: 'خطة متوازنة للاستقلال المالي', desc: 'بناء ثم انتقال ثم دخل، بأوزان ونطاقات وترتيب بناء لكل مرحلة',
    build: designed('خطة متوازنة للاستقلال المالي', (today) => ({
      monthly_income: null, income_year: Y(today) + 12, monthly_expense: null, emergency_months: 6, drawdown: 25,
      platforms: ALL_PLATFORMS, direct_pct: 5, safe_rate_pct: null,
    })),
  },
  {
    key: 'income', name: 'خطة دخل', desc: 'لمن يعيش على دخل المحفظة: حساب دخل وسحب سنوي بسقف',
    build: designed('خطة دخل', (today) => ({
      monthly_income: null, income_year: Y(today), monthly_expense: null, emergency_months: 6, drawdown: 25,
      platforms: ALL_PLATFORMS, direct_pct: 0, safe_rate_pct: null,
    })),
  },
  {
    key: 'growth', name: 'خطة نمو', desc: 'لبناء الثروة دون موعد للدخل، بأسهم أكثر',
    build: designed('خطة نمو', () => ({
      monthly_income: null, income_year: null, monthly_expense: null, emergency_months: 6, drawdown: 35,
      platforms: ALL_PLATFORMS, direct_pct: 5, safe_rate_pct: null,
    })),
  },
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
  return normalizePlan({
    ...doc,
    // class is guessed from the name and layer, priority follows the current order
    sleeves: rows.map(({ s, key }, i) => ({ key, name: s.name, layer: s.layer, accepts_new_money: !!s.accepts_new_money, note: s.note, class: null, priority: i + 1, start_at: null, instruments: [] })),
    sleeve_map: Object.fromEntries(rows.map(({ s, key }) => [key, s.id])),
    phases: [{
      key: 'p1', name: 'الحالية', start: today, note: null,
      weights: Object.fromEntries(rows.map(({ s, key }) => { const b = bandOf(s, settings); return [key, { target: b.target, min: Math.min(b.min, b.target), max: Math.max(b.max, b.target) }] })),
    }],
    emergency: { months: 6, monthly_expense: 0, instruments: [], liquid_months: null },
    rules: { ...doc.rules, review_month: settings?.income_review_month ?? 1, crash_sleeves: rows.filter(({ s }) => s.layer === 'growth').slice(0, 1).map(({ key }) => key) },
  }, today)
}
