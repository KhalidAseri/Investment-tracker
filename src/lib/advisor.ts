// «المستشار»: the advisor on top of the plan (plan.ts). Pure functions, no React:
//   durationAdvice  how long the fixed income should be (from the US yield curve; the riyal is pegged to the dollar)
//   pickInstrument  which instrument to buy for an emergency fund / income account / sleeve purchase
//   buildRoadmap    the build order: emergency fund first, then the income account in its window, then the sleeves
//   allocateDeposit how to split a deposit: reserves first, then the sleeves with the largest gaps, in few lines
//   structureScore  how complete the structure is (weights vs effective targets, reserves filled)
//   planChecks      a plan compared with the designer's heuristics
// Inputs: the PlanContext (planContext) and real market data (MarketInputs; EMPTY_MARKET works). No return forecasts.
import { holdingValue, rateOf } from './calc'
import {
  ASSET_CLASS_LABEL, CASH_CLASSES, EQUITY_CLASSES, OPEN_PLATFORMS, PLATFORM_LABEL, SUKUK_CLASSES,
  findInstrument, hasGlobalAccess, holdingMatches, instrumentOfHolding, marketKey, rankedForClass,
  type AssetClass, type CatalogItem, type Platform,
} from './catalog'
import { EMPTY_MARKET, type Curve, type MarketInputs } from './marketTypes'
import {
  DEFAULT_RULES, activePhase, addDaysISO, contributionSchedule, countMonths, effectiveTargets, isLumpSum, ltr, monthsBetween, p0,
  type BandRow, type EffectiveTarget, type ISODate, type PlanContext, type PlanDoc,
} from './plan'
import { targetEquity } from './designer'
import { monthName } from './format'
import type { Fx, Holding, Layer } from './types'

export { effectiveTargets }
export type { EffectiveTarget, Curve, MarketInputs }

// =====================================================================================
// Small helpers
// =====================================================================================
const round1 = (v: number) => Math.round(v * 10) / 10
/** after a preposition: «سنة» · «سنتين» · «3 سنوات» · «2.5 سنة» · «12 سنة» */
const yrs = (n: number) => (n === 1 ? 'سنة' : n === 2 ? 'سنتين' : Number.isInteger(n) && n >= 3 && n <= 10 ? `${n} سنوات` : `${round1(n)} سنة`)
/** as a subject or predicate: «سنتان» */
const yrsNom = (n: number) => (n === 2 ? 'سنتان' : yrs(n))
function rangeText(min: number, max: number) {
  if (min <= 0 && max <= 1) return 'أقل من سنة'
  if (min <= 0) return `حتى ${yrs(max)}`
  if (Number.isInteger(min) && Number.isInteger(max) && min >= 3 && max <= 10) return `من ${min} إلى ${max} سنوات`
  return `من ${yrs(min)} إلى ${yrs(max)}`
}
const monthYear = (iso: ISODate) => `${monthName(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`
const SHORT_CASH: AssetClass[] = ['cash', 'money_market', 'murabaha']
const isFixedIncome = (cls: AssetClass) => CASH_CLASSES.includes(cls) || SUKUK_CLASSES.includes(cls)
/** duration used for matching: cash products without a figure count as overnight */
const durOf = (it: CatalogItem) => it.duration_years ?? (SHORT_CASH.includes(it.class) ? 0 : null)
/** «مدته 3 سنوات» · «مدته أقل من سنة» · «سيولة يومية» */
const durText = (it: CatalogItem) => {
  const d = it.duration_years
  if (d == null) return SHORT_CASH.includes(it.class) ? 'سيولة يومية' : 'مدته غير معروفة'
  return d < 1 ? 'مدته أقل من سنة' : `مدته ${yrsNom(round1(d))}`
}
/** SAR value of one unit (London quotes in pence: GBp / GBX) */
function unitSar(price: number, currency: string | null, fx: Fx) {
  const c = currency ?? 'SAR'
  if (c === 'GBp' || c.toUpperCase() === 'GBX') return (price / 100) * rateOf('GBP', fx)
  return price * rateOf(c, fx)
}
/** trailing distribution yield minus TER, else the 12-month return (money market NAVs are already net of fees) */
function netYield(it: CatalogItem, market: MarketInputs): number | null {
  const k = marketKey(it)
  if (!k) return null
  const y = market.yields[k]
  if (y != null && Number.isFinite(y)) return y - (it.ter ?? 0)
  const r = market.returns1y[k]
  return r != null && Number.isFinite(r) ? r : null
}
/** years until the income starts (the horizon of the portfolio's fixed income); null without a future start */
function horizonOf(ctx: PlanContext): number | null {
  const s = ctx.doc?.income?.start
  if (!s || s <= ctx.today) return null
  return Math.max(1, monthsBetween(ctx.today, s) / 12)
}
const uniqById = (list: CatalogItem[]) => list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i)

/** Holdings of the emergency fund: its goal's holdings, else the accounts kept outside the portfolio. */
function emergencyHoldings(ctx: PlanContext): Holding[] {
  const e = ctx.progress.emergency
  if (e.goal) return e.holdings
  const excluded = new Set(ctx.input.accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  return ctx.input.holdings.filter((h) => !h.archived && !h.goal_id && !!h.account_id && excluded.has(h.account_id))
}
/** Holdings of a sleeve that the owner can add to (payroll savings programs and excluded accounts left out). */
function sleeveHoldings(ctx: PlanContext, b: BandRow | undefined): Holding[] {
  if (!b?.sleeve) return []
  const locked = new Set(ctx.input.accounts.filter((a) => a.kind === 'savings_program' || a.exclude_from_portfolio).map((a) => a.id))
  return ctx.input.holdings.filter((h) => !h.archived && !h.goal_id && h.sleeve_id === b.sleeve!.id && !(h.account_id && locked.has(h.account_id)))
}

// =====================================================================================
// Duration
// =====================================================================================
export interface DurationAdvice { min: number; max: number; label: string; reason: string; curve: Curve | null }

/**
 * How long fixed income should run. Emergency → under a year (liquidity first); income account → a ladder up to 3 years;
 * portfolio → from the slope of the US curve (10 years − 3 months): < 0.25 → 1–3 y, 0.25–1.25 → 3–7 y, ≥ 1.25 → 5–10 y;
 * without a curve 2–5 y. The maximum never passes horizonYears (e.g. the years left before the income starts).
 */
export function durationAdvice(purpose: 'emergency' | 'treasury' | 'portfolio', curve: Curve | null, horizonYears: number | null): DurationAdvice {
  const peg = 'الريال مربوط بالدولار، فالمرجع منحنى العائد الأمريكي'
  let min = 2, max = 5, kind = 'أجل متوسط', reason = ''
  if (purpose === 'emergency') {
    min = 0; max = 1; kind = 'سيولة أو أجل قصير'
    reason = 'السيولة أولاً: مال الطوارئ يجب أن يكون متاحاً متى احتجته'
  } else if (purpose === 'treasury') {
    min = 0; max = 3; kind = 'سلّم استحقاقات'
    reason = 'تسحب منه كل شهر، فتُرتَّب الاستحقاقات على مواعيد السحب دون بيع وقت الهبوط'
  } else if (!curve || !Number.isFinite(curve.y10) || !Number.isFinite(curve.m3)) {
    reason = 'لا تتوفر بيانات منحنى العائد الآن، والأجل المتوسط توازن معقول بين العائد والتذبذب'
  } else {
    const spread = curve.y10 - curve.m3
    const sp = `${ltr(spread.toFixed(2))} نقطة`
    if (spread < 0.25) {
      min = 1; max = 3; kind = 'أجل قصير'
      reason = `${peg}. الفرق بين عائد 10 سنوات و3 أشهر ${sp} فقط، فلا يكافئ الأجل الطويل تذبذبه`
    } else if (spread < 1.25) {
      min = 3; max = 7; kind = 'أجل متوسط'
      reason = `${peg}. الفرق بين عائد 10 سنوات و3 أشهر ${sp}، فالأجل المتوسط يضيف عائداً بتذبذب مقبول`
    } else {
      min = 5; max = 10; kind = 'أجل أطول'
      reason = `${peg}. الفرق بين عائد 10 سنوات و3 أشهر ${sp}، فالأجل الأطول يدفع عائداً إضافياً واضحاً`
    }
  }
  if (horizonYears != null && horizonYears > 0 && max > horizonYears) {
    max = Math.max(1, Math.floor(horizonYears))
    min = Math.min(min, Math.max(0, max - 2))
    reason += `، ولا يتجاوز ${yrs(max)} لأن الدخل يبدأ بعدها`
  }
  return { min, max, label: `${kind}: ${rangeText(min, max)}`, reason, curve }
}

// =====================================================================================
// Instrument pick
// =====================================================================================
export interface InstrumentPick {
  item: CatalogItem | null
  /** the holding to add to (no new position), when the owner already holds the instrument */
  holding: Holding | null
  alternatives: CatalogItem[]
  reason: string
  /** for sukuk and cash purchases */
  duration: DurationAdvice | null
  /** latest price in `currency` (market data, else the holding's own price) */
  price: number | null
  currency: string | null
  /** ≈ units for the amount */
  units: number | null
  platform: Platform | null
}

/**
 * The instrument to buy for `amount` SAR in a reserve or a sleeve.
 * 1) the owner already holds one of its instruments → add to it (no fragmentation);
 * 2) else the plan's first instrument that is available (on the owner's platforms, minimum met); without instruments in the
 *    plan, the cheapest catalog items of its class; with nothing listed but a holding in the sleeve, add to that holding;
 * 3) for sukuk and cash: the item whose duration fits durationAdvice, then the higher trailing yield − TER.
 * An emergency fund whose liquid months are not full gets daily-liquidity items only.
 * Works with an empty catalog (item null with a clear reason) and with the plan's own instruments.
 */
export function pickInstrument(
  ctx: PlanContext, scope: { kind: 'emergency' | 'treasury' | 'sleeve'; key?: string }, amount: number, market: MarketInputs = EMPTY_MARKET,
): InstrumentPick {
  const doc = ctx.doc
  const custom = doc?.custom_instruments ?? []
  const platforms = doc?.profile?.platforms ?? []
  const fx = ctx.input.fx
  let ids: string[] = []
  let classes: AssetClass[] = []
  let held: Holding[] = []
  let purpose: 'emergency' | 'treasury' | 'portfolio' = 'portfolio'
  let liquidOnly = false
  let where = 'هذه الطبقة'
  if (scope.kind === 'emergency') {
    purpose = 'emergency'; where = 'صندوق الطوارئ'
    ids = doc?.emergency?.instruments ?? []
    classes = ['money_market', 'savings_sukuk']
    held = emergencyHoldings(ctx)
    const em = doc?.emergency
    if (em && em.liquid_months != null && em.liquid_months > 0 && em.monthly_expense > 0) {
      const liquid = held.reduce((a, h) => { const it = instrumentOfHolding(h, custom); return a + (!it || it.liquidity === 'daily' ? holdingValue(h, fx) : 0) }, 0)
      liquidOnly = liquid < em.liquid_months * em.monthly_expense - 0.5
    }
  } else if (scope.kind === 'treasury') {
    purpose = 'treasury'; where = 'حساب الدخل'
    ids = doc?.income?.instruments ?? []
    classes = ['money_market', 'sukuk_sar']
    held = ctx.progress.treasury.holdings
  } else {
    const key = (scope.key ?? '').replace(/^sleeve:/, '')
    const b = ctx.progress.bands.find((x) => x.key === key)
    ids = b?.planSleeve?.instruments ?? []
    const cls = b?.cls ?? null
    classes = cls ? [cls] : []
    held = sleeveHoldings(ctx, b)
  }
  const fixed = scope.kind !== 'sleeve' || (classes.length > 0 && classes.every(isFixedIncome))
  // a cash sleeve inside the portfolio stays short, like any cash
  const cashSleeve = scope.kind === 'sleeve' && classes.length > 0 && classes.every((c) => CASH_CLASSES.includes(c))
  const advice = !fixed ? null : cashSleeve
    ? { min: 0, max: 1, label: `سيولة أو أجل قصير: ${rangeText(0, 1)}`, reason: 'سيولة داخل المحفظة: الأجل القصير يحفظ قيمتها لإعادة التوازن واغتنام الفرص', curve: market.curve }
    : durationAdvice(purpose, market.curve, purpose === 'portfolio' ? horizonOf(ctx) : null)
  const soon = addDaysISO(ctx.today, 30)
  const usable = held.filter((h) => !(h.maturity_date && h.maturity_date <= soon)).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))

  const listed = ids.map((id) => findInstrument(id, custom)).filter((x): x is CatalogItem => !!x)
  const fromPlan = listed.length > 0
  const candidates = fromPlan ? listed : uniqById(classes.flatMap((c) => rankedForClass(c, platforms, CASH_CLASSES.includes(c) ? OPEN_PLATFORMS : [])))
  let pool: CatalogItem[] = candidates

  const finish = (item: CatalogItem | null, holding: Holding | null, reason: string): InstrumentPick => {
    const key = item ? marketKey(item) : holding?.symbol ?? null
    const q = key ? market.quotes[key] ?? market.quotes[key.toUpperCase()] : undefined
    let price: number | null = q && Number(q.price) > 0 ? Number(q.price) : null
    let currency: string | null = q?.currency ?? item?.currency ?? holding?.currency ?? null
    if (price == null && holding && !isLumpSum(holding) && Number(holding.price) > 0) { price = Number(holding.price); currency = holding.currency }
    const unit = price != null ? unitSar(price, currency, fx) : 0
    const units = unit > 0 && amount > 0 ? amount / unit : null
    const platform = item ? item.platforms.find((p) => platforms.includes(p)) ?? item.platforms[0] ?? null : null
    const alternatives = (pool.length > 1 ? pool : candidates).filter((c) => c.id !== item?.id).slice(0, 3)
    return { item, holding, alternatives, reason, duration: advice, price, currency, units, platform }
  }

  // 1) add to what the owner already holds
  for (const it of candidates) {
    if (liquidOnly && it.liquidity !== 'daily') continue
    const h = usable.find((x) => holdingMatches(x, it))
    if (h) return finish(it, h, `تملكه في ${where}؛ أضف إليه بدل فتح أداة جديدة`)
  }
  if (!candidates.length) {
    const h = usable[0]
    if (h) return finish(instrumentOfHolding(h, custom), h, scope.kind === 'sleeve' ? 'لا أداة محددة لهذه الطبقة؛ أضف إلى ما تملكه فيها، أو حدّد أدواتها في خطتك' : `أضفه إلى ما تملكه في ${where}`)
    return finish(null, null, classes.length
      ? `لا توجد أداة مقترحة لفئة «${ASSET_CLASS_LABEL[classes[0]]}» بعد؛ أضف أداتك في الخطة`
      : 'حدّد فئة هذه الطبقة وأداتها في الخطة')
  }
  if (!fromPlan && scope.kind === 'sleeve' && usable.length) {
    const h = usable[0]
    return finish(instrumentOfHolding(h, custom), h, 'تملك أداة في هذه الطبقة؛ أضف إليها، أو حدّد أدواتها في خطتك')
  }

  // 2) available on the owner's platforms, minimum met
  const onPlatform = (it: CatalogItem) => !platforms.length || it.platforms.some((p) => platforms.includes(p) || OPEN_PLATFORMS.includes(p))
  const minOk = (it: CatalogItem) => !(it.min_investment != null && amount > 0 && it.min_investment > amount)
  const extra: string[] = []
  pool = candidates.filter((it) => onPlatform(it) && minOk(it))
  if (!pool.length) {
    pool = candidates.filter(onPlatform)
    if (pool.length) extra.push('وأقل مبلغ له أعلى من هذا الشراء')
  }
  if (!pool.length) pool = candidates
  if (liquidOnly) {
    const liq = pool.filter((it) => it.liquidity === 'daily')
    if (liq.length) pool = liq
  }
  let item = pool[0]
  let reason: string
  if (liquidOnly && doc?.emergency?.liquid_months) {
    reason = `أول ${countMonths(doc.emergency.liquid_months)} من الطوارئ سيولة يومية متاحة متى احتجتها`
  } else if (advice) {
    // 3) duration fit, then the higher net yield
    const dist = (it: CatalogItem) => { const d = durOf(it); return d == null ? Infinity : d < advice.min ? advice.min - d : d > advice.max ? d - advice.max : 0 }
    const fit = pool.filter((it) => dist(it) === 0)
    let ranked = fit.length ? fit : [...pool].sort((a, b) => dist(a) - dist(b))
    const byYield = ranked.length > 1 && ranked.every((it) => netYield(it, market) != null)
    if (byYield) ranked = [...ranked].sort((a, b) => netYield(b, market)! - netYield(a, market)!)
    item = ranked[0]
    const net = netYield(item, market)
    const range = rangeText(advice.min, advice.max)
    reason = fit.length
      ? `${durText(item)} ضمن المدى المناسب (${range})${byYield && net != null ? `، وعائده بعد الرسوم ${p0(net)} الأعلى بين البدائل` : ''}`
      : `الأقرب إلى المدى المناسب (${range})`
  } else if (fromPlan) {
    reason = item.id === listed[0].id ? 'الأداة الأولى في خطتك لهذه الطبقة' : 'أول أداة متاحة لك من أدوات هذه الطبقة في خطتك'
  } else {
    reason = `الأقل رسوماً في «${ASSET_CLASS_LABEL[item.class]}»${platforms.length ? ' على منصاتك' : ''}`
  }
  if (platforms.length && !item.platforms.some((p) => platforms.includes(p) || OPEN_PLATFORMS.includes(p)) && item.platforms[0]) {
    extra.push(`ويحتاج حساباً في ${PLATFORM_LABEL[item.platforms[0]]}`)
  }
  return finish(item, null, extra.length ? `${reason}، ${extra.join('، ')}` : reason)
}

// =====================================================================================
// Roadmap
// =====================================================================================
export interface RoadmapItem {
  /** 'emergency' | 'treasury' | 'sleeve:<plan key>' */
  key: string
  kind: 'emergency' | 'sleeve' | 'treasury'
  order: number
  title: string
  layer: Layer | 'reserve'
  /**
   * done = value ≥ target − tolerance (max(1% of the portfolio, min_ticket)); next = the first item still to build;
   * building = the other items still to build; waiting = a sleeve before its start_at (or whose whole share is smaller than
   * one purchase); later = the income account before its window; missing = needs data (monthly expense, income start)
   */
  status: 'done' | 'building' | 'next' | 'waiting' | 'later' | 'missing'
  /** SAR (sleeves: effective target × main portfolio; waiting sleeves: their share at start_at) */
  target: number
  value: number
  remaining: number
  /** 0–100 */
  pct: number
  startAt: number | null
  /** waiting sleeve: when planned contributions alone (no returns) reach start_at; income account: its window start */
  startsOn: ISODate | null
  pick: InstrumentPick | null
  holdings: Holding[]
  why: string
}

type CoreItem = Omit<RoadmapItem, 'order' | 'status' | 'pick'> & {
  base: 'done' | 'pending' | 'waiting' | 'later' | 'missing'
  inWindow: boolean
  /** new money may go here (reserves always; a sleeve when it accepts new money) */
  open: boolean
}

/** When planned contributions alone lift the main portfolio to `value` (no returns assumed); null without contributions. */
function reachDate(ctx: PlanContext, value: number): ISODate | null {
  const doc = ctx.doc
  const need = value - ctx.progress.mainValue
  if (need <= 0) return ctx.today
  if (!doc) return null
  let sum = 0
  for (const o of contributionSchedule(doc, addDaysISO(ctx.today, 1), addDaysISO(ctx.today, 365 * 30))) {
    sum += o.amount
    if (sum >= need) return o.date
  }
  return null
}

function roadmapCore(ctx: PlanContext): CoreItem[] {
  const doc = ctx.doc
  if (!doc) return []
  const p = ctx.progress
  const V = p.mainValue
  const tol = Math.max(0.01 * V, Number(doc.rules.min_ticket) || 0)
  const pctOf = (value: number, target: number) => (target > 0 ? Math.min(100, (value / target) * 100) : value > 0 ? 100 : 0)
  const out: CoreItem[] = []

  // emergency fund
  if (doc.emergency || p.emergency.goal) {
    const e = p.emergency
    const missing = !(e.target > 0)
    const done = !missing && e.value >= e.target - tol
    const months = doc.emergency?.months ?? 0
    out.push({
      key: 'emergency', kind: 'emergency', title: 'صندوق الطوارئ', layer: 'reserve', base: missing ? 'missing' : done ? 'done' : 'pending', inWindow: true, open: true,
      target: e.target, value: e.value, remaining: missing ? 0 : Math.max(0, e.target - e.value), pct: missing ? 0 : pctOf(e.value, e.target),
      startAt: null, startsOn: null, holdings: emergencyHoldings(ctx),
      why: missing ? 'حدّد مصروفك الشهري ليُحسب هدفه'
        : done ? `مكتمل: يغطي ${countMonths(e.coverMonths ?? months)} من مصروفك`
        : `ابدأ به: يغطي مصروفك ${months ? countMonths(months) : 'عدة أشهر'} دون أن تبيع استثماراتك وقت الحاجة`,
    })
  }

  // income account
  if (doc.income) {
    const t = p.treasury
    const missing = !doc.income.start && !doc.income.build_from
    const later = !missing && !!t.buildFrom && ctx.today < t.buildFrom
    const done = t.value >= t.target - tol
    const months = doc.income.treasury_months
    out.push({
      key: 'treasury', kind: 'treasury', title: 'حساب الدخل', layer: 'reserve', base: missing ? 'missing' : later ? 'later' : done ? 'done' : 'pending',
      inWindow: !missing && !later, open: true, target: t.target, value: t.value, remaining: Math.max(0, t.target - t.value), pct: pctOf(t.value, t.target),
      startAt: null, startsOn: later ? t.buildFrom : null, holdings: t.holdings,
      why: missing ? 'حدّد تاريخ بدء الدخل ليبدأ بناؤه في موعده'
        : later ? `يبدأ بناؤه في ${monthYear(t.buildFrom!)} ليغطي دخل ${countMonths(months)}`
        : done ? `مكتمل: يغطي دخل ${countMonths(t.coverMonths ?? months)}`
        : `يحفظ دخل ${countMonths(months)} فيبقى دخلك الشهري ثابتاً حتى لو هبطت السوق`,
    })
  }

  // sleeves
  const sleeves: CoreItem[] = []
  for (const b of p.bands) {
    if (!b.planSleeve || !(b.planTarget > 0)) continue
    const holdings = sleeveHoldings(ctx, b)
    const base = { key: `sleeve:${b.key}`, kind: 'sleeve' as const, title: b.name, layer: b.layer as Layer | 'reserve', holdings, startAt: b.startAt, inWindow: true, open: b.accepts }
    if (!b.active) {
      const target = ((b.planTarget / 100) * (b.startAt ?? V))
      sleeves.push({ ...base, base: 'waiting', target, value: b.value, remaining: Math.max(0, target - b.value), pct: 0,
        startsOn: b.startAt != null ? reachDate(ctx, b.startAt) : null,
        why: `تبدأ حين تبلغ المحفظة حدّ البدء، وحتى ذلك تذهب حصتها ${p0(b.planTarget)} إلى الطبقات الأخرى` })
      continue
    }
    const target = (b.target / 100) * V
    const remaining = Math.max(0, target - b.value)
    const tiny = V > 0 && b.value <= 0 && target > 0 && target <= tol
    const done = V > 0 && !tiny && b.value >= target - tol
    sleeves.push({
      ...base, base: tiny ? 'waiting' : done ? 'done' : 'pending', target, value: b.value, remaining, pct: pctOf(b.value, target), startsOn: null,
      why: tiny ? 'حصتها أصغر من أصغر شراء؛ تبدأ حين تكبر المحفظة'
        : done ? `وصلت وزنها المستهدف ${p0(b.target)}`
        : !b.accepts ? `لا يُوجَّه إليها إيداع تلقائي في خطتك؛ تشتري لها حين تتوفر الفرصة (وزنها الآن ${p0(b.actual)} من ${p0(b.target)})`
        : V > 0 ? `الأولوية ${b.priority} في خطتك؛ وزنها الآن ${p0(b.actual)} من ${p0(b.target)}`
        : `الأولوية ${b.priority} في ترتيب البناء؛ وزنها المستهدف ${p0(b.target)}`,
    })
  }
  const prio = (k: string) => p.bands.find((b) => `sleeve:${b.key}` === k)?.priority ?? 999
  const active = sleeves.filter((s) => s.base !== 'waiting').sort((a, b) => prio(a.key) - prio(b.key) || b.remaining - a.remaining)
  const waiting = sleeves.filter((s) => s.base === 'waiting').sort((a, b) => (a.startAt ?? 0) - (b.startAt ?? 0) || prio(a.key) - prio(b.key))
  const em = out.find((x) => x.kind === 'emergency')
  const tr = out.find((x) => x.kind === 'treasury')
  return [
    ...(em ? [em] : []),
    ...(tr && tr.inWindow ? [tr] : []),
    ...active,
    ...waiting,
    ...(tr && !tr.inWindow ? [tr] : []),
  ]
}

/**
 * The build order with what each item still needs and the instrument to buy for it:
 * emergency fund first; then the income account during its window (build_from, else income start − treasury_months);
 * then the sleeves (waiting last, priority, larger gap first); the income account before its window comes last ('later').
 * 'next' is the first unfinished item that takes new money (a sleeve closed to new money is never next).
 */
export function buildRoadmap(ctx: PlanContext, market: MarketInputs = EMPTY_MARKET): RoadmapItem[] {
  let nextGiven = false
  return roadmapCore(ctx).map((c, i) => {
    let status: RoadmapItem['status']
    if (c.base === 'pending') {
      status = !nextGiven && c.open ? 'next' : 'building'
      if (status === 'next') nextGiven = true
    } else status = c.base
    const scope = c.kind === 'sleeve' ? { kind: 'sleeve' as const, key: c.key.slice('sleeve:'.length) } : { kind: c.kind }
    const pick = status === 'missing' ? null : pickInstrument(ctx, scope, c.remaining, market)
    const { base: _b, inWindow: _w, open: _o, ...rest } = c
    return { ...rest, order: i + 1, status, pick }
  })
}

/**
 * How complete the structure is, 0–100: 100 × (1 − ½ Σ|actual − target|) over the effective targets (weights as fractions,
 * money outside any sleeve counts as off-target), averaged with each reserve's fill (emergency fund, and the income account
 * once its window started). done/total count the roadmap items that are not waiting.
 */
export function structureScore(ctx: PlanContext): { pct: number; done: number; total: number } {
  const p = ctx.progress
  const V = p.mainValue
  let W = 0
  if (V > 0) {
    const dev = p.bands.reduce((a, b) => a + Math.abs(b.value / V - b.target / 100), 0) + Math.max(0, ctx.totals.unassigned) / V
    W = Math.max(0, 1 - dev / 2)
  }
  const core = roadmapCore(ctx)
  const reserves = core.filter((c) => c.kind !== 'sleeve' && c.base !== 'later')
  const fills = reserves.map((c) => (c.base === 'missing' ? 0 : c.target > 0 ? Math.min(1, c.value / c.target) : 1))
  const pct = Math.round((100 * (W + fills.reduce((a, b) => a + b, 0))) / (1 + fills.length))
  const counted = core.filter((c) => c.base !== 'waiting' && c.base !== 'later')
  return { pct: Math.min(100, Math.max(0, pct)), done: counted.filter((c) => c.base === 'done').length, total: counted.length }
}

// =====================================================================================
// Deposit split
// =====================================================================================
export interface DepositLine {
  /** 'emergency' | 'treasury' | 'sleeve:<key>' */
  key: string
  kind: 'emergency' | 'treasury' | 'sleeve'
  /** plan sleeve key (null for reserves and for sleeves outside a plan) */
  sleeveKey: string | null
  sleeveId: string | null
  name: string
  layer: Layer | 'reserve'
  amount: number
  /** value before and after, SAR */
  before: number
  after: number
  /** target after the deposit, SAR */
  targetAfter: number
  pick: InstrumentPick
  note: string | null
}
export interface DepositPlan {
  amount: number
  lines: DepositLine[]
  /** in the order reserve, growth, income, safety, hedge (non-zero only) */
  layers: Array<{ layer: Layer | 'reserve'; amount: number }>
  /** not placed (no sleeve accepts new money) */
  leftover: number
  notes: string[]
}

const LAYER_ORDER: Array<Layer | 'reserve'> = ['reserve', 'growth', 'income', 'safety', 'hedge']

/**
 * How to split a deposit. Reserves first (opts.reserveFirst, default true): the emergency fund's shortfall, then the
 * income account's shortfall during its window. The rest goes to the sleeves at their effective targets for the portfolio
 * after the deposit (a sleeve may start with it): active sleeves that accept new money and have a gap, ordered by
 * (priority, gap); up to max_lines with a gap ≥ min_ticket share the money in proportion to their gaps (never above a gap),
 * spilling to the next ones; once every gap is filled, the top max_lines sleeves share the rest by target weight.
 * Sleeve lines below min_ticket merge into the largest line. Amounts are rounded to 10 SAR and the rounding difference goes
 * to the largest line, so lines + leftover = amount.
 */
export function allocateDeposit(ctx: PlanContext, amount: number, market: MarketInputs = EMPTY_MARKET, opts: { reserveFirst?: boolean } = {}): DepositPlan {
  const A = Math.max(0, Math.round((Number(amount) || 0) * 100) / 100)
  const doc = ctx.doc
  const rules = doc?.rules ?? DEFAULT_RULES
  const minTicket = Math.max(0, Number(rules.min_ticket) || 0)
  const maxLines = Math.max(1, Math.round(Number(rules.max_lines) || 1))
  const p = ctx.progress
  const notes: string[] = []
  type Raw = Omit<DepositLine, 'after' | 'pick'> & { scope: { kind: 'emergency' | 'treasury' | 'sleeve'; key?: string } }
  const raws: Raw[] = []
  let left = A

  // 1) reserves
  if (opts.reserveFirst !== false) {
    const e = p.emergency
    if (e.target > 0 && e.shortfall > 0.5 && left > 0.5) {
      const a = Math.min(left, e.shortfall)
      raws.push({ key: 'emergency', kind: 'emergency', sleeveKey: null, sleeveId: null, name: 'صندوق الطوارئ', layer: 'reserve', amount: a, before: e.value,
        targetAfter: e.target, note: a >= e.shortfall - 0.5 ? 'يكتمل بهذا الإيداع' : 'يكمله إيداعك القادم', scope: { kind: 'emergency' } })
      left -= a
      if (left <= 0.5) notes.push('الإيداع كله لصندوق الطوارئ حتى يكتمل، ثم يتجه إلى المحفظة')
    }
    const t = p.treasury
    if (doc?.income && t.building && t.shortfall > 0.5 && left > 0.5) {
      const a = Math.min(left, t.shortfall)
      raws.push({ key: 'treasury', kind: 'treasury', sleeveKey: null, sleeveId: null, name: 'حساب الدخل', layer: 'reserve', amount: a, before: t.value,
        targetAfter: t.target, note: a >= t.shortfall - 0.5 ? 'يكتمل بهذا الإيداع' : 'يكمله إيداعك القادم', scope: { kind: 'treasury' } })
      left -= a
    }
  }

  // 2) sleeves at the effective targets of the portfolio after the deposit
  const rest = left
  const V1 = p.mainValue + rest
  const phase = doc ? activePhase(doc, ctx.today) : null
  const held = Object.fromEntries(p.bands.filter((b) => b.planSleeve).map((b) => [b.key, b.value]))
  const eff = doc ? effectiveTargets(doc, phase, V1, held) : null
  const rows = p.bands.map((b) => {
    const e = eff?.find((x) => x.key === b.key)
    const target = e ? e.target : b.target
    const active = e ? e.active : b.active
    return { b, target, active, startsNow: !!e && e.active && !b.active, gap: (target / 100) * V1 - b.value }
  })
  const live = rows.filter((r) => r.active && r.b.accepts && r.target > 0)
  const eligible = live.filter((r) => r.gap >= Math.max(0.5, minTicket)).sort((a, b) => a.b.priority - b.b.priority || b.gap - a.gap)
  const alloc = new Map<string, number>()
  const give = (r: (typeof rows)[number], a: number) => alloc.set(r.b.key, (alloc.get(r.b.key) ?? 0) + a)
  for (let i = 0; i < eligible.length && left > 0.5; i += maxLines) {
    const batch = eligible.slice(i, i + maxLines)
    const sum = batch.reduce((a, r) => a + r.gap, 0)
    if (left >= sum) { for (const r of batch) give(r, r.gap); left -= sum } else { for (const r of batch) give(r, (left * r.gap) / sum); left = 0 }
  }
  if (left > 0.5) {
    const top = [...live].sort((a, b) => a.b.priority - b.b.priority || b.target - a.target).slice(0, maxLines)
    const ws = top.reduce((a, r) => a + r.target, 0)
    if (ws > 0) { for (const r of top) give(r, (left * r.target) / ws); left = 0 }
  }
  if (left > 0.5 && rest > 0.5) notes.push(doc ? 'لا توجد طبقة نشطة تقبل أموالاً جديدة في خطتك' : 'لا توجد طبقة تقبل أموالاً جديدة')
  // lines below the smallest purchase merge into the largest one
  const small = [...alloc.entries()].filter(([, a]) => a > 0.005).map(([k, a]) => ({ k, a }))
  while (small.length > 1) {
    small.sort((x, y) => x.a - y.a)
    if (small[0].a >= minTicket) break
    const s = small.shift()!
    small[small.length - 1].a += s.a
  }
  if (small.length === 1 && small[0].a < minTicket && rest > 0.5) notes.push('مبلغ المحفظة أقل من أصغر شراء في خطتك؛ يمكنك جمعه مع إيداعك القادم')
  for (const { k, a } of small) {
    const r = rows.find((x) => x.b.key === k)!
    raws.push({
      key: `sleeve:${k}`, kind: 'sleeve', sleeveKey: r.b.planSleeve ? k : null, sleeveId: r.b.sleeve?.id ?? null, name: r.b.name, layer: r.b.layer,
      amount: a, before: r.b.value, targetAfter: (r.target / 100) * V1, note: r.startsNow ? 'تبدأ هذه الطبقة مع هذا الإيداع' : null, scope: { kind: 'sleeve', key: k },
    })
  }
  if (!doc && raws.some((r) => r.kind === 'sleeve')) notes.push('لا توجد خطة نشطة؛ وُزّع المبلغ على أوزانك الحالية')

  // 3) round to 10 SAR; the difference goes to the largest line
  for (const r of raws) r.amount = Math.round(r.amount / 10) * 10
  let leftover = Math.round(left / 10) * 10
  const drift = Math.round((A - leftover - raws.reduce((a, r) => a + r.amount, 0)) * 100) / 100
  const big = raws.reduce<Raw | null>((m, r) => (!m || r.amount > m.amount ? r : m), null)
  if (big) big.amount = Math.round((big.amount + drift) * 100) / 100
  else leftover = Math.round((leftover + drift) * 100) / 100
  const kept = raws.filter((r) => r.amount > 0.005)
  const dropped = raws.filter((r) => !(r.amount > 0.005)).reduce((a, r) => a + r.amount, 0)
  if (dropped !== 0) {
    const m = kept.reduce<Raw | null>((x, r) => (!x || r.amount > x.amount ? r : x), null)
    if (m) m.amount += dropped; else leftover += dropped
  }

  const lines: DepositLine[] = kept.map(({ scope, ...r }) => ({ ...r, after: r.before + r.amount, pick: pickInstrument(ctx, scope, r.amount, market) }))
  const layers = LAYER_ORDER.map((layer) => ({ layer, amount: lines.filter((l) => l.layer === layer).reduce((a, l) => a + l.amount, 0) })).filter((x) => x.amount > 0)
  return { amount: A, lines, layers, leftover: Math.max(0, leftover), notes }
}

// =====================================================================================
// Plan checks (the designer's heuristics)
// =====================================================================================
export interface PlanCheck {
  key: string
  level: 'ok' | 'warn' | 'bad'
  title: string
  detail: string
  fix: { label: string; route?: string } | null
}

const isEquity = (c: AssetClass | null | undefined) => !!c && EQUITY_CLASSES.includes(c)

/**
 * A plan compared with the designer's heuristics (its profile answers when present): weights sum to 100 (bad), phase dates,
 * equity share vs tolerance, Saudi share of equities with global access, any sleeve > 45%, gold > 15%, cash > 20% inside
 * the portfolio, emerging markets > 20% of equities, bands narrower than ±1 point, income account under 12 months,
 * missing monthly expense, sleeves without instruments, small sleeves without start_at. Problems first, then what is fine.
 */
export function planChecks(doc: PlanDoc, ctx: PlanContext | null): PlanCheck[] {
  const out: PlanCheck[] = []
  const today = ctx?.today ?? new Date().toISOString().slice(0, 10)
  const fixDoc = { label: 'عدّل الخطة', route: 'plan/doc' }
  const fixDesign = { label: 'صمّم خطتي', route: 'design' }
  const add = (key: string, level: PlanCheck['level'], title: string, detail: string, fix: PlanCheck['fix'] = null) => out.push({ key, level, title, detail, fix: level === 'ok' ? null : fix })
  const nameOf = (k: string) => doc.sleeves.find((s) => s.key === k)?.name ?? k

  // weights per phase
  const badSums = doc.phases.map((ph) => ({ ph, sum: doc.sleeves.reduce((a, s) => a + (Number(ph.weights[s.key]?.target) || 0), 0) })).filter((x) => Math.abs(x.sum - 100) > 0.5)
  if (badSums.length) add('weights', 'bad', `مجموع الأوزان ${p0(badSums[0].sum)} في «${badSums[0].ph.name}»`, 'يجب أن يكون المجموع 100% في كل مرحلة', fixDoc)
  else add('weights', 'ok', 'مجموع الأوزان 100%', 'في كل المراحل')

  // phase dates
  const starts = doc.phases.map((p) => p.start)
  const dup = starts.find((s, i) => starts.indexOf(s) !== i)
  const unsorted = starts.some((s, i) => i > 0 && s < starts[i - 1])
  if (dup) add('phases', 'bad', 'مرحلتان بالتاريخ نفسه', `تبدآن في ${dup}؛ اجعل لكل مرحلة تاريخاً مختلفاً`, fixDoc)
  else if (unsorted) add('phases', 'warn', 'المراحل ليست بترتيب تواريخها', 'رتّبها من الأقدم إلى الأحدث', fixDoc)
  if (doc.income?.start && doc.income.build_from && doc.income.build_from > doc.income.start) add('income-window', 'warn', 'بدء بناء حساب الدخل بعد بدء الدخل', 'ابدأ بناءه قبل الدخل ليكون جاهزاً', fixDoc)

  // composition of the current phase
  const ph = activePhase(doc, today)
  if (ph) {
    const w = (k: string) => Number(ph.weights[k]?.target) || 0
    const total = doc.sleeves.reduce((a, s) => a + w(s.key), 0) || 100
    const share = (pred: (c: AssetClass | null) => boolean) => doc.sleeves.filter((s) => pred(s.class)).reduce((a, s) => a + w(s.key), 0) * (100 / total)
    const equity = share((c) => isEquity(c))
    const profile = doc.profile
    if (profile) {
      const years = profile.income_year != null ? profile.income_year - Number(today.slice(0, 4)) : null
      const want = targetEquity(profile.drawdown, years)
      if (equity > want + 10) add('equity', 'warn', 'الأسهم أكثر من تحمّلك', `الأسهم ${p0(equity)} والمناسب لتحمّل هبوط ${p0(profile.drawdown)} نحو ${p0(want)}`, fixDesign)
      else if (equity < want - 15) add('equity', 'warn', 'الأسهم أقل مما يتيحه تحمّلك', `الأسهم ${p0(equity)} ويتيح تحمّلك نحو ${p0(want)}؛ قد ينمو المال أبطأ`, fixDesign)
      else add('equity', 'ok', 'نسبة الأسهم تناسب تحمّلك', `الأسهم ${p0(equity)} والمناسب نحو ${p0(want)}`)
    } else {
      add('profile', 'warn', 'لم تُقارَن خطتك بتحمّلك للهبوط', 'أجب عن أسئلة التصميم مرة واحدة لتظهر المقارنة', fixDesign)
    }
    const global = profile ? hasGlobalAccess(profile.platforms) : doc.sleeves.some((s) => s.class === 'equity_global' || s.class === 'equity_us' || s.class === 'equity_em' || s.class === 'sukuk_usd')
    if (equity > 0) {
      const saudi = (share((c) => c === 'equity_sa') / equity) * 100
      if (global && saudi > 50) add('saudi', 'warn', 'تركيز في السوق السعودية', `${p0(saudi)} من الأسهم سعودية؛ التنويع العالمي يخفف مخاطر سوق واحدة`, fixDoc)
      else if (global) add('saudi', 'ok', 'الأسهم موزعة بين السعودية والعالم', `السعودية ${p0(saudi)} من الأسهم`)
      const em = (share((c) => c === 'equity_em') / equity) * 100
      if (em > 20) add('em', 'warn', 'الأسواق الناشئة كثيرة', `${p0(em)} من الأسهم؛ تذبذبها أعلى، والمعتاد أقل من 20%`, fixDoc)
    }
    // a world index sleeve is diversified by itself (thousands of companies in dozens of countries): not a concentration
    const top = doc.sleeves.filter((s) => s.class !== 'equity_global').map((s) => ({ s, v: w(s.key) * (100 / total) })).sort((a, b) => b.v - a.v)[0]
    if (top && top.v > 45) {
      add('concentration', 'warn', `«${top.s.name}» ${p0(top.v)} من الخطة`, top.s.class === 'equity_sa' && !global
        ? 'منصاتك لا تتيح الأسواق العالمية؛ منصة عالمية توزع المخاطر على أسواق أكثر'
        : 'طبقة واحدة فوق 45% تركيز عالٍ؛ وزّع على طبقات أكثر', fixDoc)
    } else if (top) add('concentration', 'ok', 'لا تركيز في طبقة واحدة', `أكبر طبقة «${top.s.name}» ${p0(top.v)}`)
    const gold = share((c) => c === 'gold')
    if (gold > 15) add('gold', 'warn', `الذهب ${p0(gold)}`, 'الذهب لا يدر دخلاً؛ أكثر من 15% يبطئ نمو المحفظة', fixDoc)
    const cash = share((c) => !!c && CASH_CLASSES.includes(c))
    if (cash > 20) add('cash', 'warn', `سيولة ${p0(cash)} داخل المحفظة`, `التضخم (${p0(doc.rules.inflation_pct)} سنوياً) يأكل قيمتها؛ صندوق الطوارئ وحساب الدخل خارج هذه النسبة`, fixDoc)
  }

  // bands
  const narrow = new Set<string>()
  for (const p of doc.phases) for (const s of doc.sleeves) {
    const x = p.weights[s.key]
    if (x && x.target > 0 && x.max - x.min < 2) narrow.add(s.key)
  }
  if (narrow.size) add('bands', 'warn', 'نطاقات ضيقة جداً', `${[...narrow].map(nameOf).join('، ')}: نطاق أقل من نقطة في كل اتجاه يكثر إعادة التوازن`, fixDoc)

  // reserves
  if (!doc.emergency) add('emergency', 'warn', 'لا صندوق طوارئ في خطتك', 'يحميك من البيع وقت الحاجة؛ أضفه قبل الاستثمار', fixDoc)
  else if (doc.emergency.months > 0 && !(doc.emergency.monthly_expense > 0)) add('expense', 'warn', 'حدّد مصروفك الشهري', 'ليُحسب هدف صندوق الطوارئ', fixDoc)
  else add('emergency', 'ok', 'صندوق الطوارئ محدد', `يغطي ${countMonths(doc.emergency.months)} من مصروفك`)
  if (doc.income) {
    if (doc.income.treasury_months < 12) add('income-months', 'warn', `حساب الدخل يغطي ${countMonths(doc.income.treasury_months)}`, 'أقل من 12 شهراً قد يضطرك للبيع في هبوط', fixDoc)
    else add('income-months', 'ok', 'حساب الدخل كافٍ', `يغطي ${countMonths(doc.income.treasury_months)} من الدخل`)
  }

  // instruments and thresholds
  const active = ph ?? doc.phases[0] ?? null
  const weightOf = (k: string) => Number(active?.weights[k]?.target) || 0
  const noInst = doc.sleeves.filter((s) => weightOf(s.key) > 0 && !(s.instruments?.length))
  if (noInst.length) add('instruments', 'warn', noInst.length === 1 ? `«${noInst[0].name}» بلا أداة محددة` : 'طبقات بلا أداة محددة', noInst.length === 1 ? 'حدّد الأداة التي تشتريها لها' : noInst.map((s) => s.name).join('، '), fixDoc)
  const value = ctx?.progress.mainValue ?? null
  const minPos = Number(doc.rules.min_position) || 0
  const small = doc.sleeves.filter((s) => {
    const t = weightOf(s.key)
    if (!(t > 0) || s.start_at != null) return false
    return value != null && value > 0 ? (t / 100) * value < minPos : t < 8
  })
  if (small.length) add('start-at', 'warn', 'طبقات صغيرة بلا حد بدء', `${small.map((s) => s.name).join('، ')}: ابدأها حين تكبر المحفظة لتتجنب مشتريات صغيرة متفرقة`, fixDoc)

  const rank = { bad: 0, warn: 1, ok: 2 } as const
  return out.map((c, i) => ({ c, i })).sort((a, b) => rank[a.c.level] - rank[b.c.level] || a.i - b.i).map((x) => x.c)
}
