// Risk map («المخاطر»): which risks the portfolio is exposed to (high → low) and which it has avoided, each with the numbers
// behind it, one line of explanation and a tip (or «تفاديتها لأن …»). Pure functions, no React.
// Text is plain: numbers are written in Western digits inside the Arabic text and the UI wraps them for direction.
// Amounts in riyals are never put in the text (privacy mode hides <Money> only); they go in `amount`.
import { CASH_CLASSES, EQUITY_CLASSES, SECTOR_LABEL, SUKUK_CLASSES, type AssetClass, type SectorKey } from './catalog'
import { USD_PEGGED, countryLabel, countryOfListing } from './countries'
import type { Exposure, ExposureItem } from './lookthrough'
import type { PlanDoc } from './plan'
import { maxDrawdownOf, mixHistory, returnsMeta } from './sustain'
import type { Account, Fx, Holding } from './types'

export type RiskLevel = 'high' | 'medium' | 'low' | 'avoided'
export interface RiskItem {
  key: string
  title: string
  level: RiskLevel
  /** the numbers behind the level */
  metric: string
  /** one line */
  detail: string
  /** what to do, or «تفاديتها لأن …» for an avoided risk; null when nothing is needed */
  tip: string | null
  /** headline share for a bar, 0..100 (null = none) */
  value: number | null
  /** SAR amount for <Money> (null = none) */
  amount: number | null
}
export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = { high: 'مرتفعة', medium: 'متوسطة', low: 'منخفضة', avoided: 'تفاديتها' }

export interface RiskArgs {
  exposure: Exposure
  holdings: Holding[]
  accounts: Account[]
  fx: Fx
  doc: PlanDoc | null
  emergency: { value: number; target: number; monthsCovered: number } | null
  treasury: { months: number } | null
  returns: Partial<Record<AssetClass, number[]>>
  today?: string
}

// ---------- small Arabic helpers ----------
/** 62 · 4.5 · 0.8 (one decimal below 10) */
const n1 = (v: number) => { const a = Math.abs(v); return a >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10) }
const p = (v: number) => `${n1(v)}%`
const months = (n: number) => { const r = Math.round(n); return r === 1 ? 'شهراً واحداً' : r === 2 ? 'شهرين' : r >= 3 && r <= 10 ? `${r} أشهر` : `${r} شهراً` }
const years = (n: number) => (n === 1 ? 'سنة' : n === 2 ? 'سنتين' : n <= 10 ? `${n} سنوات` : `${n} سنة`)
const countries = (n: number) => (n === 1 ? 'دولة واحدة' : n === 2 ? 'دولتين' : n <= 10 ? `${n} دول` : `${n} دولة`)
const managers = (n: number) => (n === 1 ? 'مدير واحد' : n === 2 ? 'مديرَين' : n <= 10 ? `${n} مديرين` : `${n} مديراً`)
const places = (n: number) => (n === 1 ? 'جهة واحدة' : n === 2 ? 'جهتين' : n <= 10 ? `${n} جهات` : `${n} جهة`)
const assets = (n: number) => (n === 1 ? 'أصل واحد' : n === 2 ? 'أصلان' : n <= 10 ? `${n} أصول` : `${n} أصلاً`)
const stocks = (n: number) => (n === 1 ? 'سهم واحد' : n === 2 ? 'سهمان' : n <= 10 ? `${n} أسهم` : `${n} سهماً`)
const sectorsN = (n: number) => (n === 1 ? 'قطاع واحد' : n === 2 ? 'قطاعان' : n <= 10 ? `${n} قطاعات` : `${n} قطاعاً`)
/** months covered: «أقل من شهر» below one */
const coverMonths = (n: number) => (n < 0.95 ? 'أقل من شهر' : months(n))
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})
const up = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()
const share = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0)

const ORDER = ['market', 'emergency', 'sequence', 'holding', 'country', 'sector', 'currency', 'rates', 'credit', 'liquidity', 'inflation', 'manager', 'custody', 'us_estate', 'shariah']
const LEVEL_RANK: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2, avoided: 3 }
const GICS: SectorKey[] = ['energy', 'materials', 'industrials', 'consumer_disc', 'consumer_staples', 'health', 'financials', 'tech', 'communication', 'utilities', 'real_estate']

/** Known fund managers and issuers (Arabic and English names) for the manager concentration check. */
const MANAGERS: Array<[string, RegExp]> = [
  ['iShares', /ishares|blackrock/i], ['SPDR', /spdr|state street/i], ['Vanguard', /vanguard/i], ['Invesco', /invesco/i],
  ['HSBC', /hsbc/i], ['Wahed', /wahed|\bhlal\b/i], ['SP Funds', /sp funds|\bspus\b|\bspte\b|\bspsk\b|\bspre\b/i], ['Amundi', /amundi/i],
  ['Franklin', /franklin/i], ['UBS', /\bubs\b/i], ['Xtrackers', /xtrackers|\bdws\b/i], ['Saturna', /saturna|amana/i],
  ['الراجحي المالية', /الراجحي|al ?rajhi/i], ['البلاد المالية', /البلاد|albilad/i], ['الأهلي المالية', /الأهلي|الاهلي|\bsnb\b|alahli|\bncb\b/i],
  ['جدوى للاستثمار', /جدوى|jadwa/i], ['دراية المالية', /دراية|derayah/i], ['الإنماء للاستثمار', /الإنماء|الانماء|alinma/i],
  ['الرياض المالية', /الرياض المالية|riyad capital|riyad reit/i], ['الجزيرة كابيتال', /الجزيرة|aljazira/i], ['ملكية', /ملكية|mulkia/i],
  ['سدكو كابيتال', /سدكو|sedco/i], ['مشاركة المالية', /مشاركة|musharaka/i], ['الخبير المالية', /الخبير|alkhabeer/i], ['يقين المالية', /يقين|yaqeen/i],
  ['السعودي الفرنسي كابيتال', /الفرنسي|fransi/i], ['الاستثمار كابيتال', /الاستثمار كابيتال|alistithmar/i], ['ميفك كابيتال', /ميفك|mefic/i],
  ['أصول وبخيت', /بخيت|bakheet/i], ['سامبا كابيتال', /سامبا|samba/i], ['الأول كابيتال', /الأول كابيتال|alawwal/i], ['دراهم', /دراهم|drahim/i],
]
function managerOf(i: ExposureItem): string {
  const text = `${i.item?.name_en ?? ''} ${i.item?.name ?? ''} ${i.holding.name ?? ''}`
  for (const [name, re] of MANAGERS) if (re.test(text)) return name
  return `#${i.holding.id}` // unknown: counted on its own
}

/** Years to maturity, or the instrument's duration, or a class default (for the rate sensitivity). */
function durationOf(i: ExposureItem, today: string): number {
  const own = i.holding.profile?.duration_years
  if (own != null && Number.isFinite(Number(own))) return Math.max(0, Number(own))
  if (i.item?.duration_years != null) return Math.max(0, Number(i.item.duration_years))
  if (i.holding.maturity_date && i.holding.maturity_date > today) {
    return (Date.parse(i.holding.maturity_date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / (365.25 * 86400000)
  }
  const D: Partial<Record<AssetClass, number>> = { cash: 0, money_market: 0.25, murabaha: 0.25, savings_sukuk: 1, sukuk_sar: 5, sukuk_usd: 5, mixed_income: 2 }
  return D[i.cls] ?? 0
}
const FIXED_INCOME: AssetClass[] = [...CASH_CLASSES, ...SUKUK_CLASSES, 'mixed_income']
const LIQUID_CASH: AssetClass[] = ['cash', 'money_market', 'murabaha']

/** The risk map, most serious first; avoided risks last. Never throws. */
export function riskMap(args: RiskArgs): RiskItem[] {
  try { return build(args) } catch { return [] }
}

function build(a: RiskArgs): RiskItem[] {
  const today = a.today ?? new Date().toISOString().slice(0, 10)
  const ex = a.exposure
  const items = ex.items ?? []
  const all = ex.total || items.reduce((s, i) => s + i.value, 0)
  const main = items.filter((i) => i.main)
  const mainTotal = main.reduce((s, i) => s + i.value, 0)
  const doc = obj(a.doc as unknown)
  const out: RiskItem[] = []
  const add = (r: RiskItem) => out.push(r)
  const byCls = (list: ExposureItem[], set: AssetClass[]) => list.filter((i) => set.includes(i.cls)).reduce((s, i) => s + i.value, 0)

  // 1 · market fall: equity share and the largest historical fall of the current mix.
  // Levels: with the owner's tolerance T (plan profile): fall > T + 5 → high, > T → medium, else low;
  // without it: fall ≥ 35% → high, ≥ 20% → medium, else low; no history: equities ≥ 70% → high, ≥ 40% → medium.
  // Avoided: market-priced growth assets (equities, REITs, other) under 10% of the portfolio.
  {
    const eq = share(byCls(main, EQUITY_CLASSES), mainTotal)
    const growth = share(byCls(main, [...EQUITY_CLASSES, 'reit_sa', 'reit_global', 'other']), mainTotal)
    const w: Partial<Record<AssetClass, number>> = {}
    for (const i of main) w[i.cls] = (w[i.cls] ?? 0) + i.value
    const hist = mixHistory(w, a.returns ?? {})
    const dd = hist.rets.length >= 24 ? maxDrawdownOf(hist.rets) : null
    const meta = returnsMeta(a.returns ?? {})
    const from = meta?.end && hist.rets.length ? addMonthsYM(meta.end, -(hist.rets.length - 1)).slice(0, 4) : ''
    const tol = Number(obj(doc.profile).drawdown) || null
    let level: RiskLevel
    if (mainTotal <= 0 || growth < 10) level = 'avoided'
    else if (dd && tol) level = dd.pct > tol + 5 ? 'high' : dd.pct > tol ? 'medium' : 'low'
    else if (dd) level = dd.pct >= 35 ? 'high' : dd.pct >= 20 ? 'medium' : 'low'
    else level = eq >= 70 ? 'high' : eq >= 40 ? 'medium' : 'low'
    add({
      key: 'market', title: 'هبوط الأسواق', level,
      metric: dd ? `الأسهم ${p(eq)} من المحفظة · أكبر هبوط تاريخي لهذا المزيج ${p(dd.pct)}` : `الأسهم ${p(eq)} من المحفظة`,
      detail: dd
        ? `في أسوأ فترة${from ? ` منذ ${from}` : ''} هبط مزيج كهذا ${p(dd.pct)}${dd.recoverMonths ? ` واحتاج ${months(dd.recoverMonths)} ليعود` : ' ولم يعد بعد إلى قمته'}.`
        : 'لا تتوفر بيانات تاريخية كافية لقياس أكبر هبوط لهذا المزيج.',
      tip: level === 'avoided' ? 'تفاديتها لأن الأسهم والأصول المتقلبة أقل من 10% من محفظتك.'
        : level === 'high' ? (tol ? `الهبوط المتوقع يتجاوز حدّك (${p(tol)}): خفّف الأسهم أو زد الصكوك والنقد.` : 'خفّف الأسهم أو زد الصكوك والنقد إن كان هبوط كهذا سيدفعك إلى البيع.')
          : level === 'medium' ? 'لا تبع وقت الهبوط، وأعد التوازن بالإيداعات الجديدة.' : null,
      value: eq, amount: null,
    })
  }

  // 2 · single holding: the largest direct stock as a share of the main portfolio.
  // Levels: > 10% → high, > 5% → medium, any → low; no direct stocks → avoided.
  {
    const singles = main.filter((i) => i.single).sort((x, y) => y.value - x.value)
    const top = singles[0]
    const s = top ? share(top.value, mainTotal) : 0
    const all1 = share(singles.reduce((t, i) => t + i.value, 0), mainTotal)
    const level: RiskLevel = !top ? 'avoided' : s > 10 ? 'high' : s > 5 ? 'medium' : 'low'
    add({
      key: 'holding', title: 'التركّز في سهم واحد', level,
      metric: top ? `أكبر سهم مباشر: ${top.holding.name} ${p(s)} · كل الأسهم المباشرة ${p(all1)}` : 'لا أسهم مباشرة',
      detail: !top ? 'أسهمك عبر صناديق تضم مئات الشركات.' : level === 'low' ? 'حصص الأسهم المباشرة صغيرة نسبةً إلى المحفظة.' : 'هبوط هذه الشركة وحدها يؤثر في محفظتك كلها.',
      tip: !top ? 'تفاديتها لأنك لا تملك أسهماً منفردة؛ أسهمك عبر صناديق متنوعة.'
        : level === 'high' ? 'أبقِ السهم الواحد دون 5% من المحفظة، ووجّه الإيداعات إلى الصناديق.' : level === 'medium' ? 'لا تزد حصته بإيداعات جديدة.' : null,
      value: s, amount: top?.value ?? null,
    })
  }

  // 3 · single manager: funds and ETFs grouped by manager (unknown managers count on their own); cash, savings sukuk and
  // direct stocks are left out. Levels: largest > 70% of the portfolio → high, > 50% → medium, else low;
  // avoided: three managers or more and the largest ≤ 35%.
  {
    const funds = main.filter((i) => !i.single && !CASH_CLASSES.includes(i.cls))
    const by = new Map<string, number>()
    for (const i of funds) { const m = managerOf(i); by.set(m, (by.get(m) ?? 0) + i.value) }
    const ranked = [...by.entries()].sort((x, y) => y[1] - x[1])
    const [name, v] = ranked[0] ?? ['', 0]
    const s = share(v, mainTotal)
    const n = ranked.length
    const level: RiskLevel = !n ? 'avoided' : s > 70 ? 'high' : s > 50 ? 'medium' : n >= 3 && s <= 35 ? 'avoided' : 'low'
    const label = name.startsWith('#') ? funds.find((i) => `#${i.holding.id}` === name)?.holding.name ?? '' : name
    add({
      key: 'manager', title: 'التركّز لدى مدير واحد', level,
      metric: n ? `${label} يدير ${p(s)} من محفظتك · ${managers(n)}` : 'لا صناديق في المحفظة',
      detail: 'أصول الصناديق محفوظة لدى أمين حفظ مستقل، لكن قرارات المدير ورسومه تمس حصة كبيرة.',
      tip: level === 'avoided' ? (n ? `تفاديتها لأن أموالك موزعة على ${managers(n)} وأكبرهم ${p(s)}.` : 'تفاديتها لأنك لا تملك صناديق.')
        : level === 'low' ? null : 'وزّع الإيداعات القادمة على مدير آخر لفئة مماثلة.',
      value: s, amount: v || null,
    })
  }

  // 4 · single country (look-through, all investments; gold and unknown left out).
  // Levels: largest country > 70% → high, > 50% → medium, > 30% → low, ≤ 30% → avoided.
  {
    const entries = Object.entries(ex.byCountry ?? {}).filter(([c]) => c !== 'XX' && c !== 'XC').sort((x, y) => y[1] - x[1])
    const [c, v] = entries[0] ?? ['', 0]
    const s = share(v, all)
    const n = entries.filter(([, x]) => share(x, all) >= 1).length
    const unknown = share(ex.byCountry?.XX ?? 0, all)
    const level: RiskLevel = !c ? 'avoided' : s > 70 ? 'high' : s > 50 ? 'medium' : s > 30 ? 'low' : 'avoided'
    add({
      key: 'country', title: 'التركّز في دولة واحدة', level,
      metric: c ? `${countryLabel(c)} ${p(s)} من أموالك · ${countries(Math.max(1, n))}` : 'لا بيانات عن الدول',
      detail: `${level === 'avoided' ? 'أموالك موزعة على اقتصادات عدة.' : 'اقتصاد واحد وسوق واحدة تحدد معظم نتائجك.'}${unknown >= 10 ? ` (${p(unknown)} غير محدد)` : ''}`,
      tip: level === 'avoided' ? (c ? `تفاديتها لأن أكبر دولة ${p(s)} فقط من أموالك.` : 'تفاديتها لأن أموالك غير مرتبطة بدولة.')
        : level === 'low' ? null : c === 'SA' ? 'زد الأسهم العالمية تدريجياً من الإيداعات الجديدة.' : 'وزّع الإيداعات القادمة على أسواق أخرى.',
      value: s, amount: v || null,
    })
  }

  // 5 · single sector, within the equity and real-estate holdings whose sectors are known (a fund's unclassified part counts
  // in the base but is never "a sector"). Levels: largest sector ≥ 40% of that part → high, ≥ 25% → medium, else low;
  // equities and real estate under 10% of all money, or no sector data → avoided.
  {
    const growth = items.filter((i) => [...EQUITY_CLASSES, 'reit_sa', 'reit_global', 'other'].includes(i.cls))
    const by: Partial<Record<SectorKey, number>> = {}
    let base = 0
    for (const i of growth) {
      if (!i.sectors) continue
      base += i.value
      for (const [k0, f] of Object.entries(i.sectors) as Array<[SectorKey, number]>) by[k0] = (by[k0] ?? 0) + i.value * f
    }
    const ranked = GICS.map((k0) => [k0, by[k0] ?? 0] as const).filter(([, v0]) => v0 > 0).sort((x, y) => y[1] - x[1])
    const [k, v] = ranked[0] ?? [null, 0]
    const s = share(v, base)
    const eqPart = share(growth.reduce((t, i) => t + i.value, 0), all)
    const known = share(base, growth.reduce((t, i) => t + i.value, 0))
    const n = ranked.filter(([, v0]) => share(v0, base) >= 1).length
    const level: RiskLevel = eqPart < 10 || !k ? 'avoided' : s >= 40 ? 'high' : s >= 25 ? 'medium' : 'low'
    add({
      key: 'sector', title: 'التركّز في قطاع واحد', level,
      metric: k ? `${SECTOR_LABEL[k]} ${p(s)} من أسهمك · ${sectorsN(Math.max(1, n))}${known < 90 ? ` · القطاعات معروفة لـ ${p(known)} منها` : ''}` : 'لا بيانات عن القطاعات',
      detail: level === 'avoided' ? 'الأسهم والعقار جزء صغير من أموالك.' : level === 'low' ? 'أسهمك موزعة على قطاعات عدة.' : 'قطاع واحد يحرّك جزءاً كبيراً من أسهمك.',
      tip: level === 'avoided' ? 'تفاديتها لأن الأسهم والعقار أقل من 10% من أموالك أو لا قطاع يغلب عليها.'
        : level === 'low' ? null : k === 'financials' ? 'البنوك ثقيلة في السوق السعودية؛ الأسهم العالمية توازنها.' : 'اختر للإيداعات القادمة صناديق تغطي قطاعات أخرى.',
      value: s, amount: v || null,
    })
  }

  // 6 · currency: money invested in countries whose currency is not pegged to the dollar (the riyal is).
  // Levels: > 60% → high, > 30% → medium, > 10% → low, ≤ 10% → avoided.
  {
    const v = Object.entries(ex.byCountry ?? {}).filter(([c]) => c !== 'XX' && c !== 'XC' && !USD_PEGGED.has(c)).reduce((t, [, x]) => t + x, 0)
    const s = share(v, all)
    const level: RiskLevel = s > 60 ? 'high' : s > 30 ? 'medium' : s > 10 ? 'low' : 'avoided'
    add({
      key: 'currency', title: 'تقلّب العملات', level,
      metric: `${p(s)} من أموالك في دول عملاتها غير مربوطة بالدولار`,
      detail: 'الريال مربوط بالدولار؛ تغيّر اليورو والين وغيرهما يرفع قيمة هذا الجزء أو يخفضها.',
      tip: level === 'avoided' ? 'تفاديتها لأن أموالك بالريال أو في دول عملاتها مربوطة بالدولار.'
        : level === 'high' ? 'قلّل الأسواق غير المربوطة إن كان تقلّب العملة يقلقك؛ هو أيضاً تنويع على المدى الطويل.' : null,
      value: s, amount: v || null,
    })
  }

  // 7 · interest rates: value-weighted duration. Sensitivity = Σ value × duration / all money ≈ the fall, %, for a one-point rise.
  // Levels: ≥ 4% → high, ≥ 2% → medium, ≥ 0.5% → low, < 0.5% → avoided.
  {
    const fi = items.filter((i) => FIXED_INCOME.includes(i.cls))
    const fiValue = fi.reduce((t, i) => t + i.value, 0)
    const vd = fi.reduce((t, i) => t + i.value * durationOf(i, today), 0)
    const sens = all > 0 ? vd / all : 0
    const avgD = fiValue > 0 ? vd / fiValue : 0
    const level: RiskLevel = sens >= 4 ? 'high' : sens >= 2 ? 'medium' : sens >= 0.5 ? 'low' : 'avoided'
    const incomeStart = typeof obj(doc.income).start === 'string' ? String(obj(doc.income).start) : null
    const soon = !!incomeStart && yearsBetween(today, incomeStart) <= 3
    add({
      key: 'rates', title: 'تغيّر أسعار الفائدة', level,
      metric: fiValue > 0 ? `متوسط مدة الصكوك والنقد ${n1(avgD)} سنة · ارتفاع الفائدة نقطة واحدة ≈ −${p(sens)} من أموالك` : 'لا صكوك في المحفظة',
      detail: 'كلما طالت مدة الصك زاد أثر تغيّر الفائدة في سعره.',
      tip: level === 'avoided' ? 'تفاديتها لأن صكوكك قصيرة الأجل أو قليلة.'
        : soon && avgD > 5 ? 'قرّب آجال الصكوك من موعد حاجتك إلى المال باستحقاقات متدرجة.' : level === 'low' ? null : 'وزّع الصكوك على آجال متدرجة.',
      value: sens, amount: fiValue || null,
    })
  }

  // 8 · credit: corporate sukuk (look-through sectors). Levels: corporate > 20% → high, > 10% → medium,
  // any corporate or quasi-government > 10% → low, otherwise avoided.
  {
    const corp = share(ex.bySector?.corporate ?? 0, all)
    const quasi = share(ex.bySector?.quasi_sovereign ?? 0, all)
    const sukuk = items.filter((i) => SUKUK_CLASSES.includes(i.cls))
    const assumedGov = sukuk.some((i) => i.source === 'class')
    const level: RiskLevel = corp > 20 ? 'high' : corp > 10 ? 'medium' : corp > 0 || quasi > 10 ? 'low' : 'avoided'
    add({
      key: 'credit', title: 'تعثّر الجهة المصدرة', level,
      metric: `صكوك الشركات ${p(corp)} · شبه الحكومية ${p(quasi)}`,
      detail: `تعثّر جهة مصدرة يقطع أرباحها وقد يمس رأس المال.${assumedGov ? ' عدّدنا صكوكك اليدوية حكومية؛ عدّلها من صفحة الأصل إن لم تكن كذلك.' : ''}`,
      tip: level === 'avoided' ? (sukuk.length ? 'تفاديتها لأن صكوكك حكومية أو عبر صناديق متنوعة.' : 'تفاديتها لأنك لا تملك صكوك شركات.')
        : level === 'low' ? null : 'فضّل صناديق صكوك متنوعة أو صكوكاً حكومية.',
      value: corp, amount: ex.bySector?.corporate ?? null,
    })
  }

  // 9 · liquidity: locked or term money (instrument liquidity, savings programs, savings sukuk before maturity).
  // Levels: > 40% → high, > 20% → medium, any → low, none → avoided.
  {
    const acc = new Map(a.accounts.map((x) => [x.id, x]))
    const locked = items.filter((i) => i.item?.liquidity === 'locked' || i.item?.liquidity === 'term' ||
      (i.holding.account_id && acc.get(i.holding.account_id)?.kind === 'savings_program') ||
      (i.cls === 'savings_sukuk' && !!i.holding.maturity_date && i.holding.maturity_date > today))
    const v = locked.reduce((t, i) => t + i.value, 0)
    const s = share(v, all)
    const level: RiskLevel = s > 40 ? 'high' : s > 20 ? 'medium' : v > 0 ? 'low' : 'avoided'
    add({
      key: 'liquidity', title: 'صعوبة التسييل', level,
      metric: v > 0 ? `${p(s)} من أموالك لا يُسيَّل قبل موعد محدد · ${assets(locked.length)}` : 'كل الأصول قابلة للبيع',
      detail: 'هذه الأموال لا تصلح للطوارئ ولا لحساب الدخل حتى تستحق.',
      tip: level === 'avoided' ? 'تفاديتها لأن كل أصولك قابلة للبيع خلال أيام.' : level === 'low' ? null : 'اجعل الطوارئ وحساب الدخل في أدوات يومية السيولة.',
      value: s, amount: v || null,
    })
  }

  // 10 · inflation on cash kept outside the reserves (cash, money market and murabaha in the main portfolio).
  // Levels: > 20% → high (the plan checks use the same line), > 10% → medium, > 5% → low, ≤ 5% → avoided;
  // capped at low when the plan's own cash target accounts for it.
  {
    const v = byCls(main, LIQUID_CASH)
    const s = share(v, mainTotal)
    const target = planCashTarget(doc, today)
    let level: RiskLevel = s > 20 ? 'high' : s > 10 ? 'medium' : s > 5 ? 'low' : 'avoided'
    const byDesign = target != null && s <= target + 2
    if (byDesign && (level === 'high' || level === 'medium')) level = 'low'
    add({
      key: 'inflation', title: 'التضخم على النقد', level,
      metric: `النقد خارج الطوارئ وحساب الدخل ${p(s)} من المحفظة${target != null ? ` · هدف خطتك ${p(target)}` : ''}`,
      detail: 'النقد يحفظ قيمته الاسمية فقط، والتضخم ينقص قدرته الشرائية كل سنة.',
      tip: level === 'avoided' ? `تفاديتها لأن النقد خارج الاحتياطيات ${p(s)} فقط.`
        : byDesign ? null : level === 'low' ? null : 'انقل ما يزيد على هدف السيولة إلى الطبقات الناقصة في خطتك.',
      value: s, amount: v || null,
    })
  }

  // 11 · custody: one custodian holding nearly everything, or most money abroad.
  // Levels: largest custodian ≥ 90% or abroad ≥ 70% → medium (custodians are regulated and keep client assets apart, so
  // never high); avoided: two or more custodians, the largest ≤ 70% and abroad ≤ 50%; otherwise low.
  {
    const acc = new Map(a.accounts.map((x) => [x.id, x]))
    const by = new Map<string, number>()
    let abroad = 0
    for (const i of items) {
      const k = i.holding.account_id ?? 'none'
      by.set(k, (by.get(k) ?? 0) + i.value)
      const x = i.holding.account_id ? acc.get(i.holding.account_id) : undefined
      if ((x?.country ?? (x?.is_ibkr ? 'INTL' : 'SA')) === 'INTL') abroad += i.value
    }
    const ranked = [...by.entries()].sort((x, y) => y[1] - x[1])
    const [id, v] = ranked[0] ?? ['', 0]
    const s = share(v, all)
    const o = share(abroad, all)
    const n = ranked.length
    const name = acc.get(id)?.name ?? 'حساب واحد'
    const level: RiskLevel = !n ? 'avoided' : s >= 90 || o >= 70 ? 'medium' : n >= 2 && s <= 70 && o <= 50 ? 'avoided' : 'low'
    add({
      key: 'custody', title: 'جهة الحفظ', level,
      metric: n ? `${name} يحفظ ${p(s)} · خارج السعودية ${p(o)}` : 'لا أصول',
      detail: 'الأصول مفصولة عن أموال الوسيط، لكن تعطّل منصة واحدة أو إجراءات الورثة تمس معظم مالك.',
      tip: level === 'avoided' ? `تفاديتها لأن أصولك موزعة على ${places(n)} وأكبرها ${p(s)}.`
        : level === 'low' ? null : o >= 70 ? 'وثّق حساباتك الخارجية لورثتك، وأبقِ جزءاً من أموالك داخل السعودية.' : 'افتح حساباً لدى جهة ثانية لجزء من الإيداعات.',
      value: s, amount: v || null,
    })
  }

  // 12 · US estate tax: shares and ETFs listed in the US are US assets for a non-resident's estate (up to 40% above
  // $60,000; no estate-tax treaty with Saudi Arabia). Listed in the US = the catalog instrument's Yahoo symbol has no
  // exchange suffix, or (outside the catalog) a Yahoo-priced plain symbol in dollars. IBKR's own symbols carry no exchange,
  // so an IBKR position outside the catalog is not judged. Levels: above $60,000 → high, any → medium, none → avoided.
  {
    const usd = (a.fx?.USD ?? 3.75) || 3.75
    const plainUS = (sym: string | null | undefined, cur: string | null | undefined) => {
      const s = up(sym)
      return !!s && !s.includes('.') && !s.startsWith('^') && !s.endsWith('=X') && !/^\d+$/.test(s) && up(cur) === 'USD' && countryOfListing(s, null, cur) === 'US'
    }
    const us = items.filter((i) => !CASH_CLASSES.includes(i.cls) &&
      (i.item ? i.item.source === 'yahoo' && plainUS(i.item.symbol, i.item.currency) : i.holding.price_source === 'yahoo' && plainUS(i.holding.symbol, i.holding.currency)))
    const v = us.reduce((t, i) => t + i.value, 0)
    const level: RiskLevel = v / usd > 60000 ? 'high' : v > 0 ? 'medium' : 'avoided'
    add({
      key: 'us_estate', title: 'ضريبة التركات الأمريكية', level,
      metric: v > 0 ? `${p(share(v, all))} من أموالك في أسهم وصناديق مدرجة في أمريكا · ${assets(us.length)}` : 'لا أصول مدرجة في أمريكا',
      detail: 'على غير المقيمين في أمريكا ضريبة تركات تصل إلى 40% على ما يزيد على 60 ألف دولار من هذه الأصول.',
      tip: level === 'avoided' ? 'تفاديتها لأنك لا تملك أصولاً مدرجة في أمريكا.' : 'بدائلها المدرجة في أيرلندا (UCITS) تؤدي الغرض نفسه دون هذه الضريبة.',
      value: share(v, all), amount: v || null,
    })
  }

  // 13 · Shariah: holdings outside the catalog whose compliance the app cannot vouch for (funds or ETFs not in the catalog),
  // and direct stocks without a purification share. Levels: unknown > 20% of all money → medium, any unknown or a stock
  // without purification → low, none → avoided. (The app never states that a holding is not compliant.)
  {
    const unknown = items.filter((i) => !i.item && !i.single && !FIXED_INCOME.includes(i.cls) && i.cls !== 'gold' && i.cls !== 'other' &&
      (i.holding.price_source === 'yahoo' || i.holding.price_source === 'nav' || i.holding.price_source === 'ibkr'))
    const noPur = items.filter((i) => i.single && (i.holding.purification_pct == null))
    const s = share(unknown.reduce((t, i) => t + i.value, 0), all)
    const level: RiskLevel = s > 20 ? 'medium' : unknown.length || noPur.length ? 'low' : 'avoided'
    add({
      key: 'shariah', title: 'الضوابط الشرعية والتطهير', level,
      metric: `${unknown.length ? `${assets(unknown.length)} خارج الدليل المتوافق` : 'لا أصول خارج الدليل'} · ${noPur.length ? `${stocks(noPur.length)} بلا نسبة تطهير` : 'نسب التطهير مدخلة'}`,
      detail: 'لا يتحقق التطبيق من توافق الأصول التي ليست في دليله، والأسهم تحتاج نسبة تطهير لتوزيعاتها.',
      tip: level === 'avoided' ? 'تفاديتها لأن أصولك من الدليل المتوافق أو نقد وصكوك وذهب.' : 'راجع القوائم الشرعية لهذه الأصول وأدخل نسبة التطهير للأسهم.',
      value: s, amount: null,
    })
  }

  // 14 · emergency fund coverage. Levels: none set → medium; below half the target → high; below the target → medium;
  // complete (≥ 98%) → avoided.
  {
    const e = a.emergency
    const planMonths = Number(obj(doc.emergency).months) || null
    if (!e || !(e.target > 0)) {
      add({ key: 'emergency', title: 'صندوق الطوارئ', level: 'medium', metric: 'لم يُحدَّد صندوق الطوارئ بعد',
        detail: 'مصروف طارئ بلا احتياطي قد يضطرك إلى بيع استثماراتك في وقت سيئ.', tip: 'أدخل مصروفك الشهري في الخطة ليُحسب حجمه ومكانه.', value: null, amount: null })
    } else {
      const f = e.value / e.target
      const level: RiskLevel = f < 0.5 ? 'high' : f < 0.98 ? 'medium' : 'avoided'
      const covered = Math.max(0, e.monthsCovered || 0)
      add({
        key: 'emergency', title: 'صندوق الطوارئ', level,
        metric: `يغطي ${coverMonths(covered)}${planMonths ? ` من ${planMonths}` : ''} · ${p(Math.min(100, f * 100))} من هدفه`,
        detail: level === 'avoided' ? 'الطوارئ مغطاة دون المساس بالاستثمار.' : 'مصروف طارئ قد يضطرك إلى بيع استثماراتك في وقت سيئ.',
        tip: level === 'avoided' ? `تفاديتها لأن صندوق الطوارئ مكتمل ويغطي ${months(covered)}.` : 'أكمل الطوارئ قبل الإيداع في النمو؛ مخطط الإيداع يبدأ به.',
        value: Math.min(100, f * 100), amount: Math.max(0, e.target - e.value) || null,
      })
    }
  }

  // 15 · sequence of returns: once income has started or starts within 5 years, the income account must carry the months
  // set in the plan. Levels: income started and under 6 months → high; under the plan's months → medium; enough → avoided;
  // no income in the plan, or it starts more than 5 years away → avoided.
  {
    const inc = obj(doc.income)
    const start = typeof inc.start === 'string' ? inc.start : null
    const target = Number(inc.treasury_months) || 12
    const m = Math.max(0, a.treasury?.months ?? 0)
    if (!start) {
      add({ key: 'sequence', title: 'توقيت السحب', level: 'avoided', metric: 'لا دخل من المحفظة في خطتك', detail: 'لا سحب يتزامن مع هبوط الأسواق.',
        tip: 'تفاديتها لأنك لا تسحب دخلاً من المحفظة.', value: null, amount: null })
    } else {
      const started = start <= today
      const yrs = yearsBetween(today, start)
      if (!started && yrs > 5) {
        const y = Math.round(yrs)
        add({ key: 'sequence', title: 'توقيت السحب', level: 'avoided', metric: `يبدأ الدخل بعد ${years(y)}`,
          detail: 'يبدأ ملء حساب الدخل قبل موعده لتُدفع السنوات الأولى منه.', tip: `تفاديتها الآن لأن الدخل يبدأ بعد ${years(y)}.`, value: null, amount: null })
      } else {
        const level: RiskLevel = m >= target - 0.05 ? 'avoided' : started && m < 6 ? 'high' : 'medium'
        add({
          key: 'sequence', title: 'توقيت السحب', level,
          metric: `حساب الدخل يغطي ${coverMonths(m)} من ${target}${started ? '' : ` · يبدأ الدخل بعد ${years(Math.max(1, Math.round(yrs)))}`}`,
          detail: 'هبوط في أول سنوات السحب مع البيع لتغطية الدخل يقصّر عمر المحفظة.',
          tip: level === 'avoided' ? `تفاديتها لأن حساب الدخل يغطي ${months(m)} فلن تضطر إلى البيع وقت الهبوط.` : `املأ حساب الدخل من التوزيعات والإيداعات حتى ${target} شهراً.`,
          value: Math.min(100, share(m, target)), amount: null,
        })
      }
    }
  }

  return out.sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level] || ORDER.indexOf(x.key) - ORDER.indexOf(y.key))
}

// ---------- helpers ----------
function addMonthsYM(ym: string, n: number) {
  const i = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`
}
const yearsBetween = (a: string, b: string) => (Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / (365.25 * 86400000)

/** Target % of liquid cash classes in the active phase of the plan (null without a plan or class data). */
function planCashTarget(doc: Record<string, any>, today: string): number | null {
  const phases: Array<Record<string, any>> = Array.isArray(doc.phases) ? doc.phases : []
  const sleeves: Array<Record<string, any>> = Array.isArray(doc.sleeves) ? doc.sleeves : []
  if (!phases.length || !sleeves.length) return null
  const sorted = [...phases].filter((x) => typeof x?.start === 'string').sort((x, y) => String(x.start).localeCompare(String(y.start)))
  let ph: Record<string, any> | null = null
  for (const x of sorted) if (x.start <= today) ph = x
  ph = ph ?? sorted[0] ?? null
  if (!ph) return null
  const w = obj(ph.weights)
  let t = 0, any = false
  for (const s of sleeves) {
    if (!LIQUID_CASH.includes(s?.class)) continue
    any = true
    t += Number(obj(w[s.key]).target) || 0
  }
  return any ? t : null
}
