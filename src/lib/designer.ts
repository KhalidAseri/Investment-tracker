// «صمّم خطتي»: the "lead me" brain. From a few answers (goal, expense, tolerance to a fall, platforms, direct stocks) it
// proposes the whole plan: phases with weights and bands, the build order and start thresholds, instruments, the emergency
// fund, the income account, zakat, and one plain line explaining each decision.
// Generic rules only: no personal numbers and no return forecasts. Works with an empty catalog (no instruments).
import {
  ASSET_CLASS_LABEL, CASH_CLASSES, CLASS_LAYER, OPEN_PLATFORMS, PLATFORM_LABEL, ZAKAT_METHOD_LABEL,
  findInstrument, hasGlobalAccess, rankedForClass, zakatDefault,
  type AssetClass, type Platform, type ZakatMethod,
} from './catalog'
import {
  DEFAULT_RULES, addDaysISO, countMonths, emptyPlan, p0, ymd,
  type ISODate, type PhaseWeight, type PlanDoc, type PlanPhase, type PlanSleeve, type PlanStep,
} from './plan'
import { todayISO } from './format'

export interface DesignAnswers {
  /** the goal; null with income_year null = grow wealth only */
  monthly_income: number | null
  income_year: number | null
  monthly_expense: number | null
  emergency_months: 3 | 6 | 9 | 12
  /** largest temporary fall tolerated without selling, % */
  drawdown: 15 | 25 | 35 | 45
  platforms: Platform[]
  direct_pct: 0 | 5 | 10
  /** from sustain.ts at design time (the UI passes it); default 4 */
  safe_rate_pct: number | null
  today?: ISODate
}
export interface DesignResult {
  doc: PlanDoc
  /** one line per decision, in reading order */
  explain: Array<{ key: string; title: string; text: string }>
  /** today's mix by country (ISO alpha-2, 'XX' = other or unknown), % of the portfolio */
  geography: Record<string, number>
}

// =====================================================================================
// Equity share by tolerance
// =====================================================================================
const EQ_BUILD: Array<[number, number]> = [[15, 30], [25, 50], [35, 70], [45, 85]]
const EQ_INCOME: Array<[number, number]> = [[15, 25], [25, 40], [35, 50], [45, 55]]
function interp(table: Array<[number, number]>, x: number) {
  const v = Number(x)
  if (!Number.isFinite(v) || v <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i]
    if (v <= x1) return y0 + ((y1 - y0) * (v - x0)) / (x1 - x0)
  }
  return table[table.length - 1][1]
}
/** equity share while building wealth, % */
export const buildEquity = (drawdown: number) => interp(EQ_BUILD, drawdown)
/** equity share once the income has started, % */
export const incomeEquity = (drawdown: number) => interp(EQ_INCOME, drawdown)
/** the cap near the income start: ≤ 3 years → 40%, ≤ 7 years → 60% */
const capFor = (years: number | null) => (years == null ? 100 : years <= 3 ? 40 : years <= 7 ? 60 : 100)
const midEquity = (drawdown: number) => (buildEquity(drawdown) + incomeEquity(drawdown)) / 2
/** The equity share the designer gives TODAY for a tolerance and the years left before the income (null = no income goal). */
export function targetEquity(drawdown: number, yearsToIncome: number | null): number {
  if (yearsToIncome == null) return buildEquity(drawdown)
  if (yearsToIncome <= 2) return incomeEquity(drawdown)
  if (yearsToIncome <= 6) return Math.min(midEquity(drawdown), capFor(yearsToIncome))
  return Math.min(buildEquity(drawdown), capFor(yearsToIncome))
}

// =====================================================================================
// Sleeves
// =====================================================================================
type Key = 'global' | 'em' | 'saudi' | 'direct' | 'sukuk_sar' | 'sukuk_usd' | 'reit' | 'cash' | 'gold'
const KEY_ORDER: Key[] = ['global', 'em', 'saudi', 'direct', 'sukuk_sar', 'sukuk_usd', 'reit', 'cash', 'gold']
const DEF: Record<Key, { cls: AssetClass; name: string; note: string }> = {
  global: { cls: 'equity_global', name: 'أسهم عالمية متقدمة', note: 'صندوق مؤشر عالمي متوافق مع الشريعة ومنخفض الرسوم' },
  em: { cls: 'equity_em', name: 'أسهم الأسواق الناشئة', note: 'صندوق مؤشر للأسواق الناشئة متوافق مع الشريعة' },
  saudi: { cls: 'equity_sa', name: 'أسهم سعودية', note: 'صندوق مؤشر أو صندوق متداول للسوق السعودية' },
  direct: { cls: 'equity_direct', name: 'أسهم مباشرة مختارة', note: 'أسهم تختارها بشروط قائمة المراقبة' },
  sukuk_sar: { cls: 'sukuk_sar', name: 'صكوك بالريال', note: 'صكوك حكومية أو صندوق صكوك بالريال' },
  sukuk_usd: { cls: 'sukuk_usd', name: 'صكوك بالدولار', note: 'صندوق صكوك دولارية متداول' },
  reit: { cls: 'reit_sa', name: 'صناديق ريت سعودية', note: 'أكثر من صندوق ريت من قطاعات مختلفة' },
  cash: { cls: 'money_market', name: 'سيولة ومرابحة', note: 'صندوق أسواق نقد داخل المحفظة' },
  gold: { cls: 'gold', name: 'ذهب', note: 'صندوق ذهب متداول' },
}
const EQUITY_KEYS: Key[] = ['global', 'em', 'saudi', 'direct']

const r05 = (v: number) => Math.round(v * 2) / 2
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The mix for an equity share (raw, before rounding). */
function mix(E: number, directPct: number, global: boolean): Record<Key, number> {
  const def = 100 - E
  const gold = clamp(Math.round(0.25 * def), 5, 10)
  const cash = def >= 25 ? 5 : 3
  const reit = Math.min(12, Math.round(0.3 * Math.max(0, def - gold - cash)))
  const sukuk = Math.max(0, def - gold - cash - reit)
  const direct = Math.min(Math.max(0, directPct), E)
  const rest = E - direct
  const saudi = global ? 0.25 * rest : rest
  const nonSa = rest - saudi
  return {
    global: 0.85 * nonSa, em: 0.15 * nonSa, saudi, direct,
    sukuk_sar: global ? sukuk / 2 : sukuk, sukuk_usd: global ? sukuk / 2 : 0, reit, cash, gold,
  }
}
/** rounded to 0.5, the sum fixed to 100 on the largest sleeve */
function rounded(m: Record<Key, number>): Record<Key, number> {
  const out = Object.fromEntries(KEY_ORDER.map((k) => [k, r05(m[k])])) as Record<Key, number>
  const drift = Math.round((100 - KEY_ORDER.reduce((a, k) => a + out[k], 0)) * 2) / 2
  if (drift !== 0) {
    const big = KEY_ORDER.reduce((b, k) => (out[k] > out[b] ? k : b), KEY_ORDER[0])
    out[big] = r05(out[big] + drift)
  }
  return out
}
/** ± max(2, round(25% of the target)); targets under 4 → ± 1.5; direct stocks → 0 to target + 3 */
function band(key: Key, t: number): PhaseWeight {
  if (!(t > 0)) return { target: 0, min: 0, max: 0 }
  if (key === 'direct') return { target: t, min: 0, max: Math.min(100, t + 3) }
  const d = t < 4 ? 1.5 : Math.max(2, Math.round(0.25 * t))
  return { target: t, min: Math.max(0, r05(t - d)), max: Math.min(100, r05(t + d)) }
}

/** top catalog ids of a class on the platforms (cheapest first, then the longest history); cash-like products also from banks and the MoF */
const topIds = (cls: AssetClass, platforms: Platform[], n = 3) =>
  rankedForClass(cls, platforms, CASH_CLASSES.includes(cls) ? OPEN_PLATFORMS : []).slice(0, n).map((c) => c.id)

const SA_CLASSES: AssetClass[] = ['cash', 'money_market', 'savings_sukuk', 'murabaha', 'sukuk_sar', 'equity_sa', 'equity_direct', 'reit_sa', 'mixed_income']
/** look-through by country of a sleeve: its first instrument, else SA for Saudi classes, else unknown */
function countriesOf(cls: AssetClass, ids: string[]): Record<string, number> {
  const c = findInstrument(ids[0])?.countries
  if (c) {
    const sum = Object.values(c).reduce((a, v) => a + (Number(v) || 0), 0)
    if (sum > 0) return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, ((Number(v) || 0) / sum) * 100]))
  }
  return SA_CLASSES.includes(cls) ? { SA: 100 } : { XX: 100 }
}

const Y = (iso: ISODate) => Number(iso.slice(0, 4))
const yearsText = (n: number) => (n === 1 ? 'سنة' : n === 2 ? 'سنتين' : n >= 3 && n <= 10 ? `${n} سنوات` : `${n} سنة`)

// =====================================================================================
// Design
// =====================================================================================
/**
 * The whole plan from the answers. Equity by tolerance (15→30, 25→50, 35→70, 45→85; ≤ 40 within 3 years of the income,
 * ≤ 60 within 7); income-phase equity 15→25, 25→40, 35→50, 45→55; the transition takes the midpoint. Phases: more than 6
 * years to the income → البناء, الانتقال (5 years before), الدخل; 3–6 years → الانتقال + الدخل; ≤ 2 → الدخل; no goal → النمو.
 * Defensive part: gold 5–10, cash 5 (3 when the defensive part is under 25), REIT up to 12, sukuk the rest (half in USD with
 * a global platform). Equities: direct stocks first, then Saudi 25% of the rest with global access (else all of it), and
 * 85/15 developed/emerging for the rest. Every weight is rounded to 0.5 and the sum fixed to 100 on the largest sleeve.
 */
export function designPlan(a: DesignAnswers): DesignResult {
  const today = a.today ?? todayISO()
  const year = Y(today)
  const dd = Number(a.drawdown) || 25
  const platforms = [...new Set(a.platforms ?? [])]
  const global = hasGlobalAccess(platforms)
  const hasGoal = a.income_year != null
  const iy = hasGoal ? Math.round(Number(a.income_year)) : null
  const years = iy != null ? iy - year : null
  const direct = Math.max(0, Number(a.direct_pct) || 0)
  const build = buildEquity(dd), inc = incomeEquity(dd), mid = midEquity(dd)

  // ---- phases ----
  type Ph = { key: string; name: string; start: ISODate; note: string; E: number }
  let phs: Ph[]
  if (iy == null || years == null) {
    phs = [{ key: 'growth', name: 'النمو', start: today, note: 'بناء الثروة دون موعد للدخل', E: build }]
  } else if (years > 6) {
    phs = [
      { key: 'build', name: 'البناء', start: today, note: 'نمو أعلى، والأموال الجديدة للطبقات الناقصة', E: Math.min(build, capFor(years)) },
      { key: 'shift', name: 'الانتقال', start: ymd(iy - 5, 1, 1), note: 'تخفيف الأسهم تدريجياً بالأموال الجديدة قبل بدء الدخل', E: Math.min(mid, capFor(5)) },
      { key: 'income', name: 'الدخل', start: ymd(iy, 1, 1), note: 'حساب الدخل يغطي السحب الشهري، والتوزيعات تعيد تعبئته', E: inc },
    ]
  } else if (years > 2) {
    phs = [
      { key: 'shift', name: 'الانتقال', start: today, note: 'تخفيف الأسهم تدريجياً بالأموال الجديدة قبل بدء الدخل', E: Math.min(mid, capFor(years)) },
      { key: 'income', name: 'الدخل', start: ymd(iy, 1, 1), note: 'حساب الدخل يغطي السحب الشهري، والتوزيعات تعيد تعبئته', E: inc },
    ]
  } else {
    phs = [{ key: 'income', name: 'الدخل', start: today, note: 'حساب الدخل يغطي السحب الشهري، والتوزيعات تعيد تعبئته', E: inc }]
  }
  const mixes = phs.map((p) => rounded(mix(p.E, direct, global)))
  const first = mixes[0]
  const present = KEY_ORDER.filter((k) => mixes.some((m) => m[k] > 0))

  // ---- sleeves: build order by weight (direct last), start thresholds for small weights ----
  const minPosition = DEFAULT_RULES.min_position
  const order = [...present].sort((x, y) => Number(x === 'direct') - Number(y === 'direct') || first[y] - first[x]
    || Math.max(...mixes.map((m) => m[y])) - Math.max(...mixes.map((m) => m[x])) || KEY_ORDER.indexOf(x) - KEY_ORDER.indexOf(y))
  const sleeves: PlanSleeve[] = present.map((k) => {
    const w = first[k]
    const cls = DEF[k].cls
    return {
      key: k, name: DEF[k].name, layer: CLASS_LAYER[cls], accepts_new_money: k !== 'direct', note: DEF[k].note,
      class: cls, priority: order.indexOf(k) + 1,
      start_at: w > 0 && w < 8 ? Math.ceil(minPosition / (w / 100) / 10000) * 10000 : null,
      instruments: topIds(cls, platforms),
    }
  })
  const phases: PlanPhase[] = phs.map((p, i) => ({
    key: p.key, name: p.name, start: p.start, note: p.note,
    weights: Object.fromEntries(present.map((k) => [k, band(k, mixes[i][k])])),
  }))

  // ---- reserves and the income account ----
  const months = Number(a.emergency_months) || 6
  const expense = Math.max(0, Number(a.monthly_expense) || 0)
  const rate = a.safe_rate_pct != null && a.safe_rate_pct > 0 ? Math.round(a.safe_rate_pct * 100) / 100 : 4
  const treasuryMonths = inc >= 45 ? 24 : 12
  const shortSukuk = (() => {
    const all = rankedForClass('sukuk_sar', platforms)
    const short = all.filter((c) => c.duration_years != null && c.duration_years <= 3)
    return (short.length ? short : all).slice(0, 1).map((c) => c.id)
  })()
  const doc: PlanDoc = {
    ...emptyPlan(iy != null ? 'خطة الاستقلال المالي' : 'خطة النمو', today),
    goal: {
      monthly_income: a.monthly_income != null && a.monthly_income > 0 ? a.monthly_income : null,
      target_capital: iy != null && a.monthly_income != null && a.monthly_income > 0 ? Math.round((a.monthly_income * 12) / (rate / 100)) : null,
      target_date: iy != null ? ymd(iy, 1, 1) : null,
      note: null,
    },
    sleeves,
    phases,
    contributions: [],
    emergency: { months, monthly_expense: expense, instruments: [...topIds('money_market', platforms, 2), ...topIds('savings_sukuk', platforms, 1)], liquid_months: Math.min(2, months) },
    income: iy != null ? {
      start: ymd(iy, 1, 1), method: 'percent', annual_pct: rate, fixed_monthly: null, band_pct: 10, treasury_months: treasuryMonths,
      transfer_day: 27, no_sell_drawdown_pct: 20, build_from: ymd(iy - 2, 1, 1),
      instruments: [...new Set([...topIds('money_market', platforms, 2), ...shortSukuk])],
    } : null,
    rules: { ...DEFAULT_RULES, crash_sleeves: present.filter((k) => EQUITY_KEYS.includes(k)) },
    steps: designSteps(today, months, platforms),
    profile: { drawdown: dd, income_year: iy, platforms, direct_pct: direct, emergency_months: months, source: 'designer' },
    custom_instruments: [],
  }

  // ---- geography (today's mix) ----
  const geo: Record<string, number> = {}
  for (const s of sleeves) {
    const w = first[s.key as Key]
    if (!(w > 0)) continue
    for (const [c, v] of Object.entries(countriesOf(s.class!, s.instruments))) geo[c] = (geo[c] ?? 0) + (w * v) / 100
  }
  const geography = Object.fromEntries(Object.entries(geo).map(([k, v]) => [k, Math.round(v * 10) / 10]).filter(([, v]) => (v as number) > 0)
    .sort((x, y) => (y[1] as number) - (x[1] as number))) as Record<string, number>

  return { doc, explain: explainDesign({ a, dd, years, iy, phs, mixes, global, direct, sleeves, order, months, expense, rate, treasuryMonths, inc, build }), geography }
}

function designSteps(today: ISODate, months: number, platforms: Platform[]): PlanStep[] {
  const nextJanuary = Number(today.slice(5, 7)) === 1 && Number(today.slice(8, 10)) <= 15 ? ymd(Y(today), 1, 31) : ymd(Y(today) + 1, 1, 31)
  const accounts = platforms.filter((p) => p !== 'bank' && p !== 'mof' && p !== 'other').map((p) => PLATFORM_LABEL[p])
  return [
    { key: 'emergency', title: 'جهّز صندوق الطوارئ أولاً', detail: `${countMonths(months)} من مصروفك في سيولة وصندوق أسواق نقد`, due: addDaysISO(today, 30), done_at: null, recurring: 'none' },
    { key: 'platforms', title: 'افتح الحسابات التي تحتاجها', detail: accounts.length ? accounts.join('، ') : null, due: addDaysISO(today, 45), done_at: null, recurring: 'none' },
    { key: 'build', title: 'ابنِ المحفظة بالترتيب المقترح', detail: 'كل إيداع يوزّعه التطبيق على الأولويات', due: null, done_at: null, recurring: 'none' },
    { key: 'review', title: 'المراجعة السنوية', detail: 'الزكاة والتطهير، ثم إعادة التوازن، ثم تحديث الخطة', due: nextJanuary, done_at: null, recurring: 'yearly' },
  ]
}

function explainDesign(x: {
  a: DesignAnswers; dd: number; years: number | null; iy: number | null; phs: Array<{ name: string; start: ISODate; E: number }>
  mixes: Array<Record<Key, number>>; global: boolean; direct: number; sleeves: PlanSleeve[]; order: Key[]; months: number; expense: number
  rate: number; treasuryMonths: number; inc: number; build: number
}): DesignResult['explain'] {
  const out: DesignResult['explain'] = []
  const m = x.mixes[0]
  const E = EQUITY_KEYS.reduce((a, k) => a + m[k], 0)
  // equity
  let eq = `تتحمّل هبوطاً مؤقتاً حتى ${p0(x.dd)} دون أن تبيع، فالمناسب لك نحو ${p0(x.build)} أسهماً`
  if (x.years != null && E < x.build - 0.25) eq += `، وتقل الآن إلى ${p0(E)} لأن الدخل يبدأ بعد ${yearsText(Math.max(0, x.years))}`
  if (x.iy != null && x.phs.length > 1) eq += `، ثم ${p0(x.inc)} حين يبدأ الدخل لتخفيف أثر الهبوط على السحب`
  out.push({ key: 'equity', title: `الأسهم ${p0(E)} الآن`, text: eq })
  // Saudi / global split
  const eqNoDirect = E - m.direct
  if (x.global) {
    out.push({ key: 'saudi', title: `السعودية ${p0(eqNoDirect > 0 ? (m.saudi / eqNoDirect) * 100 : 0)} من الأسهم`,
      text: 'ربع الأسهم في السوق السعودية والباقي عالمي: 85% أسواق متقدمة و15% ناشئة، لتوزيع المخاطر على اقتصادات كثيرة' })
  } else {
    out.push({ key: 'saudi', title: 'الأسهم كلها سعودية', text: 'منصاتك لا تتيح الأسواق العالمية؛ افتح منصة عالمية لتنويع أوسع وصكوك بالدولار' })
  }
  if (m.direct > 0) out.push({ key: 'direct', title: `أسهم مباشرة ${p0(m.direct)}`, text: 'تختارها بنفسك بشروط قائمة المراقبة، ولا يُوجَّه إليها إيداع تلقائي، وتأتي آخر الأولويات' })
  out.push({ key: 'gold', title: `الذهب ${p0(m.gold)}`, text: 'للتحوط من الأزمات وتقلب العملات، ولا يزيد على 10% لأنه لا يدر دخلاً' })
  if (m.reit > 0) out.push({ key: 'reit', title: `صناديق الريت ${p0(m.reit)}`, text: 'دخل إيجاري منتظم من عقارات مدرجة، بحد أقصى 12%' })
  const sukuk = m.sukuk_sar + m.sukuk_usd
  if (sukuk > 0) out.push({ key: 'sukuk', title: `الصكوك ${p0(sukuk)}`, text: x.global ? 'نصفها بالريال ونصفها بالدولار، لتخفيف تذبذب المحفظة' : 'بالريال، لتخفيف تذبذب المحفظة' })
  out.push({ key: 'cash', title: `السيولة ${p0(m.cash)}`, text: 'داخل المحفظة لإعادة التوازن واغتنام الفرص، وهي غير صندوق الطوارئ' })
  // reserves
  out.push({ key: 'emergency', title: `صندوق الطوارئ ${countMonths(x.months)}`,
    text: x.expense > 0 ? 'من مصروفك، منها شهران سيولة فورية والباقي في أدوات قصيرة أعلى عائداً؛ تبني المحفظة بعد اكتماله' : 'اكتب مصروفك الشهري ليُحسب مبلغه؛ تبني المحفظة بعد اكتماله' })
  if (x.iy != null) {
    out.push({ key: 'income', title: `حساب الدخل ${countMonths(x.treasuryMonths)}`,
      text: `تسحب ${p0(x.rate)} من قيمة الخطة سنوياً: يُنقل دخل السنة إلى الحساب مرة واحدة في المراجعة، وتسحب منه مبلغاً ثابتاً كل شهر؛ ويبدأ بناؤه قبل الدخل بسنتين` })
  }
  // build order and thresholds
  out.push({ key: 'order', title: 'ترتيب البناء', text: ['صندوق الطوارئ', ...x.order.map((k) => DEF[k].name)].join('، ثم ') })
  const waiting = x.sleeves.filter((s) => s.start_at != null)
  if (waiting.length) out.push({ key: 'thresholds', title: 'حدود البدء', text: `${waiting.map((s) => s.name).join('، ')}: تبدأ حين تكبر المحفظة حتى لا تشتري مبالغ صغيرة متفرقة، وحتى ذلك تذهب حصتها إلى الطبقات الأخرى` })
  // phases
  if (x.phs.length > 1) out.push({ key: 'phases', title: `${x.phs.length === 2 ? 'مرحلتان' : `${x.phs.length} مراحل`}`, text: x.phs.map((p, i) => (i === 0 ? `${p.name} الآن` : `${p.name} في ${Y(p.start)}`)).join('، ثم ') })
  // zakat
  const groups = new Map<ZakatMethod, string[]>()
  for (const s of x.sleeves) {
    const z = zakatDefault(s.class)
    if (!z || !s.class) continue
    const list = groups.get(z.method) ?? []
    const label = ASSET_CLASS_LABEL[s.class]
    if (!list.includes(label)) list.push(label)
    groups.set(z.method, list)
  }
  out.push({ key: 'zakat', title: 'الزكاة', text: groups.size
    ? `${[...groups].map(([method, names]) => `${names.join(' و')}: ${ZAKAT_METHOD_LABEL[method]}`).join('؛ ')}. تختار الطريقة لكل أصل عند إضافته`
    : '2.5% من قيمة الأصول الزكوية، وتختار طريقة كل أصل عند إضافته من دليل الزكاة' })
  return out
}
