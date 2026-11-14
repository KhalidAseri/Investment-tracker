import type { AppData, Pick2, Settings } from '../types.ts'
import type { PortfolioView } from './valuation.ts'

export interface EmergencyStatus {
  target: number
  current: number
  pct: number
  shortfall: number
  monthsCovered: number
  ready: boolean
}

export function emergencyStatus(view: PortfolioView, settings: Settings): EmergencyStatus {
  const target = settings.monthlyExpenses * settings.emergencyMonths
  const current = view.emergency
  return {
    target,
    current,
    pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    shortfall: Math.max(0, target - current),
    monthsCovered: settings.monthlyExpenses > 0 ? current / settings.monthlyExpenses : 0,
    ready: target > 0 && current >= target,
  }
}

// ---- Goal ----

/** Real (after-inflation) monthly growth rate, so every projection is in today's money. */
export function realMonthlyRate(settings: Settings): number {
  const real = (1 + settings.goal.expectedReturn / 100) / (1 + settings.goal.inflation / 100) - 1
  return Math.pow(1 + real, 1 / 12) - 1
}

/** Income is what is left of the expected return after zakat, inflation and the growth the user wants to keep. Never negative. */
export function incomeRate(expectedReturn: number, zakatRate: number, inflation: number, growthTarget: number): number {
  return Math.max(0, expectedReturn - zakatRate - inflation - growthTarget)
}

export function planIncomeRate(settings: Settings): number {
  return incomeRate(settings.goal.expectedReturn, settings.income.planZakatRate, settings.goal.inflation, settings.income.growthTarget)
}

export function goalTarget(settings: Settings): number {
  const g = settings.goal
  if (g.mode !== 'INCOME') return g.amount
  const rate = planIncomeRate(settings)
  return rate > 0 ? (g.monthlyIncome * 12) / (rate / 100) : 0
}

export function futureValue(current: number, monthly: number, months: number, r: number): number {
  if (months <= 0) return current
  if (r === 0) return current + monthly * months
  const growth = Math.pow(1 + r, months)
  return current * growth + monthly * ((growth - 1) / r)
}

/** Months until the balance reaches the target; null if it never does within 80 years. */
export function monthsToTarget(current: number, monthly: number, target: number, r: number): number | null {
  if (current >= target) return 0
  let v = current
  for (let m = 1; m <= 960; m++) {
    v = v * (1 + r) + monthly
    if (v >= target) return m
  }
  return null
}

export function requiredMonthly(current: number, target: number, months: number, r: number): number {
  if (months <= 0) return Math.max(0, target - current)
  const growth = Math.pow(1 + r, months)
  const need = target - current * growth
  if (need <= 0) return 0
  return r === 0 ? need / months : need / ((growth - 1) / r)
}

export interface GoalStatus {
  target: number
  current: number
  pct: number
  monthsLeft: number
  projectedAtDate: number
  monthsToReach: number | null
  reachYear: number | null
  requiredMonthly: number
  onTrack: boolean
  series: { x: number; y: number }[]
}

export function goalStatus(view: PortfolioView, settings: Settings, now = new Date()): GoalStatus {
  const target = goalTarget(settings)
  const current = view.investable
  const r = realMonthlyRate(settings)
  const monthsLeft = Math.max(0, (settings.goal.targetYear - now.getFullYear()) * 12 - now.getMonth())
  const monthly = settings.monthlyContribution
  const monthsToReach = target > 0 ? monthsToTarget(current, monthly, target, r) : null
  const horizonYears = Math.max(5, Math.min(40, Math.ceil(Math.max(monthsLeft, monthsToReach ?? 0) / 12) + 2))
  const series = Array.from({ length: horizonYears + 1 }, (_, i) => ({ x: now.getFullYear() + i, y: futureValue(current, monthly, i * 12, r) }))
  const projectedAtDate = futureValue(current, monthly, monthsLeft, r)
  return {
    target,
    current,
    pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
    monthsLeft,
    projectedAtDate,
    monthsToReach,
    reachYear: monthsToReach === null ? null : now.getFullYear() + Math.floor((now.getMonth() + monthsToReach) / 12),
    requiredMonthly: target > 0 ? requiredMonthly(current, target, monthsLeft, r) : 0,
    onTrack: target > 0 && projectedAtDate >= target,
    series,
  }
}

// ---- Building roadmap ----

export interface RoadmapStep {
  id: string
  title: string
  body: string
  status: 'done' | 'current' | 'todo'
  /** Steps the user ticks manually because the app cannot observe them. */
  manualKey?: 'debtFree' | 'employerMatch' | 'automated'
  href?: string
}

export function roadmap(
  data: Pick<AppData, 'accounts' | 'assets' | 'settings'>,
  view: PortfolioView,
  facts: { hasWarnings: boolean; maxDriftAbs: number },
  L: Pick2,
): RoadmapStep[] {
  const s = data.settings
  const ef = emergencyStatus(view, s)
  const goal = goalStatus(view, s)
  const hasEmployer = data.accounts.some((a) => a.kind === 'EMPLOYER' && data.assets.some((x) => x.accountId === a.id))
  const steps: (Omit<RoadmapStep, 'status'> & { done: boolean })[] = []
  const push = (step: Omit<RoadmapStep, 'status'>, done: boolean) => steps.push({ ...step, done })

  push({
    id: 'numbers',
    title: L('اعرف أرقامك', 'Know your numbers'),
    body: L('مصاريفك الشهرية وما تستطيع استثماره كل شهر. كل الخطة تُبنى عليهما.', 'Your monthly expenses and what you can invest each month. The whole plan builds on these.'),
    href: '/plan/#emergency',
  }, s.monthlyExpenses > 0 && s.monthlyContribution > 0)
  push({
    id: 'emergency',
    title: L('صندوق الطوارئ أولاً', 'Emergency fund first'),
    body: L(
      `${s.emergencyMonths} أشهر من المصاريف في وعاء سائل منخفض المخاطر، قبل أي استثمار متقلب — حتى لا تضطر للبيع وقت الهبوط.`,
      `${s.emergencyMonths} months of expenses in a liquid, low-risk place before any volatile investing — so you never sell in a downturn.`,
    ),
    href: '/plan/#emergency',
  }, ef.ready)
  push({
    id: 'debt',
    title: L('تخلّص من الديون مرتفعة التكلفة', 'Clear high-cost debt'),
    body: L('سداد بطاقة ائتمان أو تمويل شخصي بتكلفة عالية هو «عائد» مضمون يفوق أغلب الاستثمارات.', 'Paying off a credit card or costly personal loan is a guaranteed return that beats most investments.'),
    manualKey: 'debtFree',
  }, s.roadmap.debtFree)
  push({
    id: 'employer',
    title: L('استفد من مساهمة جهة العمل كاملة', 'Capture the full employer match'),
    body: L('إن كان لجهة عملك برنامج ادخار بمساهمة منها، فالاشتراك بالحد الذي يمنحك كامل المساهمة مال إضافي لا يُعوَّض.', 'If your employer has a savings plan with a match, contributing enough to get all of it is money you cannot get elsewhere.'),
    manualKey: 'employerMatch',
  }, s.roadmap.employerMatch || hasEmployer)
  push({
    id: 'targets',
    title: L('حدّد توزيعك المستهدف', 'Set your target allocation'),
    body: L('نسبة لكل فئة أصول تناسب مدتك وتحملك للتقلب. هي البوصلة لكل قرار شراء قادم.', 'A share for each asset class that fits your horizon and tolerance. It steers every future purchase.'),
    href: '/analysis/#targets',
  }, s.targetsSet)
  push({
    id: 'automate',
    title: L('استثمر شهريًا بشكل آلي', 'Invest monthly, automatically'),
    body: L('حوالة ثابتة بعد الراتب مباشرة. الانتظام يغلب محاولة توقيت السوق.', 'A standing transfer right after payday. Consistency beats timing the market.'),
    manualKey: 'automated',
  }, s.roadmap.automated)
  push({
    id: 'diversify',
    title: L('نوّع وأعد التوازن', 'Diversify and rebalance'),
    body: L('لا تركّزات مقلقة، والانحراف عن المستهدف أقل من 5 نقاط. صحّح بالمساهمات الجديدة قبل البيع.', 'No worrying concentrations and drift under 5 points. Correct with new money before selling.'),
    href: '/analysis/',
  }, view.investable > 0 && !facts.hasWarnings && facts.maxDriftAbs <= 5 && s.targetsSet)
  push({
    id: 'income',
    title: L('مرحلة الدخل', 'Income phase'),
    body: L('عند بلوغ هدفك تتحول المحفظة من البناء إلى صرف دخل منتظم بمعدل سحب مستدام.', 'Once you reach your goal the portfolio shifts from building to paying a steady income at a sustainable rate.'),
    href: '/plan/#income',
  }, goal.target > 0 && goal.pct >= 100)

  let currentAssigned = false
  return steps.map(({ done, ...step }) => {
    if (done) return { ...step, status: 'done' as const }
    if (!currentAssigned) {
      currentAssigned = true
      return { ...step, status: 'current' as const }
    }
    return { ...step, status: 'todo' as const }
  })
}
