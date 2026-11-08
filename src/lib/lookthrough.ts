// Look-through: where the money really is (country, region, sector, industry, asset class, currency), holding by holding.
// Pure functions, no React. Source of each holding's breakdown, first match wins per dimension:
//   holding.profile (owner override) → catalog instrument (catalog_id, else symbol / fund id) → instrument_profiles
//   (single stocks: Yahoo sector/industry, country of the listing) → class defaults (cash → its currency's country,
//   gold → no country, Saudi classes and Saudi funds → SA) → unknown.
import {
  CASH_CLASSES, CLASS_BLEND, LAYER_CLASS, classOfHolding as baseClassOf, guessClass, instrumentOfHolding, isAssetClass,
  normalizeCatalogItem, type AssetClass, type CatalogItem, type SectorKey,
} from './catalog'
import { holdingValue } from './calc'
import { COMMODITY_COUNTRY, UNKNOWN_COUNTRY, countryOfListing, currencyCountry, regionOfCountry } from './countries'
import type { InstrumentProfile } from './marketTypes'
import type { PlanDoc } from './plan'
import type { Account, Fx, Goal, Holding, Layer, Sleeve } from './types'

// =====================================================================================
// Context
// =====================================================================================
export interface HoldingContext {
  /** the owner's own instruments (plan custom_instruments) */
  custom?: CatalogItem[]
  /** instrument_profiles by upper-case Yahoo symbol */
  profiles?: Record<string, InstrumentProfile>
  /** sleeves.id → class of the plan sleeve it carries */
  sleeveClass?: Record<string, AssetClass | null | undefined>
  /** sleeves.id → layer (last hint when nothing else is known) */
  sleeveLayer?: Record<string, Layer>
  /** ids of the emergency fund and income account goals: their unnamed balances are cash */
  reserveGoals?: Set<string>
}

const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {})
const up = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

/** The plan's own instruments (doc.custom_instruments), read defensively. */
export function customInstruments(doc: PlanDoc | null | undefined): CatalogItem[] {
  const raw = obj(doc as unknown).custom_instruments
  return Array.isArray(raw) ? raw.map(normalizeCatalogItem).filter((x): x is CatalogItem => !!x) : []
}

/** sleeves.id → class of the plan sleeve (its class field, else a guess from its name and layer). */
export function planSleeveClasses(doc: PlanDoc | null | undefined, sleeves: Sleeve[]): Record<string, AssetClass> {
  const out: Record<string, AssetClass> = {}
  if (!doc) return out
  const d = obj(doc as unknown)
  const map = obj(d.sleeve_map)
  const ids = new Set(sleeves.map((s) => s.id))
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  for (const ps of Array.isArray(d.sleeves) ? d.sleeves : []) {
    const p = obj(ps)
    if (typeof p.key !== 'string') continue
    const layer: Layer = ['growth', 'income', 'safety', 'hedge'].includes(p.layer) ? p.layer : 'growth'
    const cls: AssetClass = isAssetClass(p.class) ? p.class : guessClass(String(p.name ?? ''), layer)
    let id: string | undefined = typeof map[p.key] === 'string' && ids.has(map[p.key]) ? map[p.key] : undefined
    if (!id) id = sleeves.find((s) => norm(s.name) === norm(String(p.name ?? '')))?.id
    if (id && !out[id]) out[id] = cls
  }
  return out
}

/** Everything breakdownOf() needs, from the store's rows and the active plan. */
export function holdingContext(args: {
  doc?: PlanDoc | null; sleeves?: Sleeve[]; goals?: Goal[]; profiles?: Record<string, InstrumentProfile>; custom?: CatalogItem[]
}): HoldingContext {
  const sleeves = args.sleeves ?? []
  return {
    custom: [...(args.custom ?? []), ...customInstruments(args.doc)],
    profiles: args.profiles ?? {},
    sleeveClass: planSleeveClasses(args.doc, sleeves),
    sleeveLayer: Object.fromEntries(sleeves.map((s) => [s.id, s.layer])),
    reserveGoals: new Set((args.goals ?? []).filter((g) => g.kind === 'emergency' || g.kind === 'income').map((g) => g.id)),
  }
}

// =====================================================================================
// Class of a holding
// =====================================================================================
/**
 * Tadawul code ranges: 4330–4349 are listed REIT funds, 9400–9499 exchange-traded funds; other 4-digit codes are companies
 * (main market and Nomu).
 */
export function tadawulKind(symbol: string | null | undefined): 'stock' | 'reit' | 'etf' | null {
  const m = up(symbol).match(/^(\d{4})\.SR$/)
  if (!m) return null
  const n = Number(m[1])
  if (n >= 9400 && n <= 9499) return 'etf'
  if (n >= 4330 && n <= 4349) return 'reit'
  return 'stock'
}

const isReitProfile = (p?: InstrumentProfile | null) => !!p && /reit/i.test(p.industry ?? '')

/** A single company's shares (not a fund): the owner's direct stocks. */
export function isSingleStock(h: Pick<Holding, 'symbol'>, profile?: InstrumentProfile | null): boolean {
  const k = tadawulKind(h.symbol)
  if (k) return k === 'stock'
  return profile?.quote_type === 'EQUITY' && !isReitProfile(profile)
}

const normAr = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()

/** Best guess from the holding's own name and symbol (Arabic or English); null when nothing matches. */
export function guessHoldingClass(h: Pick<Holding, 'name' | 'symbol' | 'currency' | 'price_source'>): AssetClass | null {
  const t = normAr(`${h.name ?? ''} ${h.symbol ?? ''}`)
  const sym = up(h.symbol)
  const local = sym.endsWith('.SR') || /^\d+$/.test(sym) || up(h.currency || 'SAR') === 'SAR'
  const has = (re: RegExp) => re.test(t)
  if (has(/ذهب|gold|bullion/)) return 'gold'
  if (has(/صكوك.*ادخار|ادخار.*صكوك|\bصح\b|savings sukuk/)) return 'savings_sukuk'
  if (has(/مرابح|murabaha|اسواق النقد|سوق النقد|money market|liquidity/)) return 'money_market'
  if (has(/صكوك|sukuk|سندات|bond|treasur/)) return local ? 'sukuk_sar' : 'sukuk_usd'
  if (has(/ريت|reit|عقار/)) return local ? 'reit_sa' : 'reit_global'
  if (has(/ناشئ|emerging/)) return 'equity_em'
  if (has(/s&p|sp ?500|nasdaq|امريك|\busa\b|u\.s\./)) return 'equity_us'
  if (has(/عالمي|العالم|world|global|acwi|all.?country|international|developed/)) return 'equity_global'
  if (has(/\bنقد|cash|حساب|وديعه|ودائع|deposit|savings account/)) return 'cash'
  if (has(/توزيع|دخل|income|dividend/)) return 'mixed_income'
  if (has(/سعودي|تاسي|tasi|saudi/) || sym.endsWith('.SR')) return 'equity_sa'
  return null
}

/**
 * Asset class of a holding, never null: the owner's override, its instrument, a stock or REIT listing (instrument profile or
 * Tadawul code), its plan sleeve, its name, a reserve balance (cash), the sleeve's layer, and finally 'other'.
 */
export function holdingClass(h: Holding, ctx: HoldingContext = {}): AssetClass {
  const base = baseClassOf(h, { custom: ctx.custom })
  if (base) return base
  const prof = ctx.profiles?.[up(h.symbol)] ?? null
  const tk = tadawulKind(h.symbol)
  if (tk === 'reit' || (prof?.quote_type === 'EQUITY' && isReitProfile(prof))) {
    return (prof?.country ?? countryOfListing(h.symbol, prof?.exchange, h.currency)) === 'SA' ? 'reit_sa' : 'reit_global'
  }
  if (isSingleStock(h, prof)) return 'equity_direct'
  const sc = h.sleeve_id ? ctx.sleeveClass?.[h.sleeve_id] : null
  if (sc && isAssetClass(sc)) return sc
  const g = guessHoldingClass(h)
  if (g) return g
  if (h.goal_id && ctx.reserveGoals?.has(h.goal_id)) return 'cash'
  const layer = h.sleeve_id ? ctx.sleeveLayer?.[h.sleeve_id] : undefined
  if (layer) return LAYER_CLASS[layer]
  return 'other'
}

// =====================================================================================
// Sectors and industries
// =====================================================================================
/** Yahoo sector names (search results) → GICS-style sector keys. */
export const YAHOO_SECTOR: Record<string, SectorKey> = {
  'technology': 'tech', 'information technology': 'tech',
  'financial services': 'financials', 'financial': 'financials', 'financials': 'financials',
  'healthcare': 'health', 'health care': 'health',
  'consumer cyclical': 'consumer_disc', 'consumer discretionary': 'consumer_disc',
  'consumer defensive': 'consumer_staples', 'consumer staples': 'consumer_staples',
  'energy': 'energy', 'basic materials': 'materials', 'materials': 'materials', 'industrials': 'industrials',
  'communication services': 'communication', 'telecommunication services': 'communication',
  'utilities': 'utilities', 'real estate': 'real_estate',
}
export const sectorFromYahoo = (s: string | null | undefined): SectorKey | null => (s ? YAHOO_SECTOR[s.trim().toLowerCase()] ?? null : null)

const indKey = (s: string) => s.toLowerCase().replace(/\s*[—–-]\s*/g, ' - ').replace(/\s+/g, ' ').trim()
const IND: Array<[string, string]> = [
  ['Banks - Regional', 'البنوك'], ['Banks - Diversified', 'البنوك'], ['Credit Services', 'التمويل والائتمان'],
  ['Capital Markets', 'أسواق المال والوساطة'], ['Asset Management', 'إدارة الأصول'], ['Financial Data & Stock Exchanges', 'البورصات وبيانات الأسواق'],
  ['Insurance - Diversified', 'التأمين'], ['Insurance - Life', 'التأمين'], ['Insurance - Property & Casualty', 'التأمين'],
  ['Insurance - Specialty', 'التأمين'], ['Insurance - Reinsurance', 'إعادة التأمين'], ['Insurance Brokers', 'وساطة التأمين'],
  ['Financial Conglomerates', 'المجموعات المالية'], ['Mortgage Finance', 'التمويل العقاري'],
  ['Oil & Gas Integrated', 'النفط والغاز المتكاملة'], ['Oil & Gas E&P', 'استكشاف النفط والغاز وإنتاجهما'],
  ['Oil & Gas Refining & Marketing', 'تكرير النفط وتسويقه'], ['Oil & Gas Midstream', 'نقل النفط والغاز وتخزينهما'],
  ['Oil & Gas Equipment & Services', 'خدمات حقول النفط'], ['Oil & Gas Drilling', 'حفر الآبار'],
  ['Specialty Chemicals', 'الكيماويات المتخصصة'], ['Chemicals', 'الكيماويات'], ['Agricultural Inputs', 'الأسمدة والمدخلات الزراعية'],
  ['Building Materials', 'مواد البناء والإسمنت'], ['Steel', 'الحديد والصلب'], ['Aluminum', 'الألمنيوم'], ['Gold', 'تعدين الذهب'],
  ['Other Industrial Metals & Mining', 'التعدين'], ['Copper', 'النحاس'], ['Other Precious Metals & Mining', 'المعادن النفيسة'],
  ['Paper & Paper Products', 'الورق'], ['Packaging & Containers', 'التغليف'],
  ['Telecom Services', 'خدمات الاتصالات'], ['Communication Equipment', 'معدات الاتصالات'],
  ['Internet Content & Information', 'خدمات الإنترنت والمحتوى'], ['Entertainment', 'الترفيه والإعلام'], ['Electronic Gaming & Multimedia', 'الألعاب الإلكترونية'],
  ['Advertising Agencies', 'الإعلان'], ['Publishing', 'النشر'], ['Broadcasting', 'البث'],
  ['Semiconductors', 'أشباه الموصلات'], ['Semiconductor Equipment & Materials', 'معدات أشباه الموصلات'],
  ['Software - Infrastructure', 'برمجيات البنية التحتية'], ['Software - Application', 'البرمجيات التطبيقية'],
  ['Information Technology Services', 'خدمات تقنية المعلومات'], ['Consumer Electronics', 'الإلكترونيات الاستهلاكية'],
  ['Computer Hardware', 'أجهزة الحاسب'], ['Electronic Components', 'المكونات الإلكترونية'], ['Scientific & Technical Instruments', 'الأجهزة العلمية'],
  ['Internet Retail', 'التجارة الإلكترونية'], ['Specialty Retail', 'التجزئة المتخصصة'], ['Apparel Retail', 'تجزئة الملابس'],
  ['Department Stores', 'المتاجر الكبرى'], ['Discount Stores', 'متاجر الخصم'], ['Home Improvement Retail', 'تجزئة مستلزمات المنازل'],
  ['Grocery Stores', 'متاجر الأغذية'], ['Pharmaceutical Retailers', 'الصيدليات'], ['Auto & Truck Dealerships', 'وكالات السيارات'],
  ['Auto Manufacturers', 'صناعة السيارات'], ['Auto Parts', 'قطع غيار السيارات'], ['Restaurants', 'المطاعم'], ['Lodging', 'الفنادق'],
  ['Travel Services', 'خدمات السفر'], ['Leisure', 'الترفيه'], ['Education & Training Services', 'التعليم والتدريب'],
  ['Packaged Foods', 'الأغذية المصنعة'], ['Food Distribution', 'توزيع الأغذية'], ['Farm Products', 'المنتجات الزراعية'],
  ['Beverages - Non-Alcoholic', 'المشروبات'], ['Household & Personal Products', 'المنتجات المنزلية والشخصية'], ['Confectioners', 'الحلويات'],
  ['Drug Manufacturers - General', 'صناعة الأدوية'], ['Drug Manufacturers - Specialty & Generic', 'صناعة الأدوية'],
  ['Biotechnology', 'التقنية الحيوية'], ['Medical Devices', 'الأجهزة الطبية'], ['Medical Instruments & Supplies', 'المستلزمات الطبية'],
  ['Medical Care Facilities', 'المستشفيات والرعاية الطبية'], ['Healthcare Plans', 'التأمين الصحي'], ['Diagnostics & Research', 'التشخيص والأبحاث'],
  ['Medical Distribution', 'توزيع الأدوية'], ['Health Information Services', 'خدمات المعلومات الصحية'],
  ['Utilities - Regulated Electric', 'الكهرباء'], ['Utilities - Regulated Water', 'المياه'], ['Utilities - Regulated Gas', 'الغاز'],
  ['Utilities - Diversified', 'المرافق العامة'], ['Utilities - Independent Power Producers', 'إنتاج الكهرباء'], ['Utilities - Renewable', 'الطاقة المتجددة'],
  ['Airlines', 'الطيران'], ['Airports & Air Services', 'المطارات وخدمات الطيران'], ['Marine Shipping', 'الشحن البحري'],
  ['Integrated Freight & Logistics', 'النقل والخدمات اللوجستية'], ['Railroads', 'السكك الحديدية'], ['Trucking', 'النقل البري'],
  ['Engineering & Construction', 'الهندسة والإنشاءات'], ['Conglomerates', 'المجموعات المتنوعة'], ['Specialty Industrial Machinery', 'المعدات الصناعية'],
  ['Aerospace & Defense', 'الطيران والدفاع'], ['Electrical Equipment & Parts', 'المعدات الكهربائية'], ['Building Products & Equipment', 'منتجات البناء'],
  ['Farm & Heavy Construction Machinery', 'المعدات الثقيلة'], ['Industrial Distribution', 'التوزيع الصناعي'], ['Rental & Leasing Services', 'التأجير'],
  ['Specialty Business Services', 'خدمات الأعمال'], ['Consulting Services', 'الاستشارات'], ['Staffing & Employment Services', 'التوظيف'],
  ['Security & Protection Services', 'الأمن والحماية'], ['Waste Management', 'إدارة النفايات'], ['Tools & Accessories', 'الأدوات'],
  ['REIT - Diversified', 'صناديق الريت'], ['REIT - Retail', 'صناديق الريت'], ['REIT - Office', 'صناديق الريت'], ['REIT - Industrial', 'صناديق الريت'],
  ['REIT - Residential', 'صناديق الريت'], ['REIT - Healthcare Facilities', 'صناديق الريت'], ['REIT - Specialty', 'صناديق الريت'],
  ['REIT - Hotel & Motel', 'صناديق الريت'], ['REIT - Mortgage', 'صناديق الريت'],
  ['Real Estate - Development', 'التطوير العقاري'], ['Real Estate - Diversified', 'العقار المتنوع'], ['Real Estate Services', 'الخدمات العقارية'],
]
/** Yahoo industry → Arabic (keys normalised so 'Banks—Regional' and 'Banks - Regional' match). */
export const INDUSTRY_AR: Record<string, string> = Object.fromEntries(IND.map(([en, ar]) => [indKey(en), ar]))
/** Arabic label of an industry (Yahoo English names are translated; the owner's own text is kept). */
export const industryLabel = (s: string | null | undefined) => (s ? INDUSTRY_AR[indKey(s)] ?? s.trim() : '')

// =====================================================================================
// Breakdown of one holding
// =====================================================================================
export type BreakdownSource = 'holding' | 'catalog' | 'profile' | 'class' | 'unknown'
export interface Breakdown {
  cls: AssetClass
  /** fractions summing to 1; null = not known */
  countries: Record<string, number> | null
  sectors: Partial<Record<SectorKey, number>> | null
  industry: string | null
  /** the best source that contributed */
  source: BreakdownSource
  item: CatalogItem | null
  /** a single company's shares */
  single: boolean
}

const SECTOR_KEYS: SectorKey[] = ['energy', 'materials', 'industrials', 'consumer_disc', 'consumer_staples', 'health', 'financials', 'tech',
  'communication', 'utilities', 'real_estate', 'sovereign', 'quasi_sovereign', 'corporate', 'cash', 'commodity', 'other']
const RANK: Record<BreakdownSource, number> = { unknown: 0, class: 1, profile: 2, catalog: 3, holding: 4 }

/** a % map → fractions (positive values only); null when empty */
function fractions(m: Record<string, number> | null | undefined, keyFix: (k: string) => string | null): Record<string, number> | null {
  if (!m || typeof m !== 'object') return null
  const out: Record<string, number> = {}
  let sum = 0
  for (const [k0, v0] of Object.entries(m)) {
    const v = Number(v0)
    const k = keyFix(k0)
    if (!k || !(v > 0)) continue
    out[k] = (out[k] ?? 0) + v
    sum += v
  }
  if (!(sum > 0)) return null
  for (const k of Object.keys(out)) out[k] /= sum
  return out
}
const countryKey = (k: string) => { const c = k.trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) ? c : null }
const sectorKey = (k: string) => ((SECTOR_KEYS as string[]).includes(k) ? k : sectorFromYahoo(k) ?? 'other')

const one = (k: string | null | undefined): Record<string, number> | null => (k ? { [k]: 1 } : null)

/** Saudi-managed fund: a Mubasher NAV fund or anything listed on Tadawul. */
const isSaudiFund = (h: Pick<Holding, 'price_source' | 'symbol'>) => h.price_source === 'nav' || up(h.symbol).endsWith('.SR')

function classCountries(cls: AssetClass, h: Holding): Record<string, number> | null {
  if ((CASH_CLASSES as string[]).includes(cls)) return one(currencyCountry(h.currency) ?? 'SA')
  if (cls === 'gold') return one(COMMODITY_COUNTRY)
  if (cls === 'sukuk_sar' || cls === 'savings_sukuk' || cls === 'reit_sa' || cls === 'equity_sa') return one('SA')
  if (cls === 'equity_us') return one('US')
  if (cls === 'equity_direct') return one(countryOfListing(h.symbol, null, h.currency))
  if ((cls === 'mixed_income' || cls === 'other') && isSaudiFund(h)) return one('SA')
  return null
}

function classSectors(cls: AssetClass, depth = 0): Partial<Record<SectorKey, number>> | null {
  if ((CASH_CLASSES as string[]).includes(cls) && cls !== 'savings_sukuk') return { cash: 1 }
  if (cls === 'gold') return { commodity: 1 }
  // savings sukuk and riyal sukuk funds are mostly government paper (an assumption; the catalog has the real split)
  if (cls === 'savings_sukuk' || cls === 'sukuk_sar') return { sovereign: 1 }
  if (cls === 'reit_sa' || cls === 'reit_global') return { real_estate: 1 }
  const blend = CLASS_BLEND[cls]
  if (blend && depth < 2) {
    const out: Partial<Record<SectorKey, number>> = {}
    let sum = 0
    for (const [c, w] of Object.entries(blend) as Array<[AssetClass, number]>) {
      const s = classSectors(c, depth + 1)
      if (!s || !(w > 0)) return null
      for (const [k, f] of Object.entries(s) as Array<[SectorKey, number]>) out[k] = (out[k] ?? 0) + w * f
      sum += w
    }
    if (sum > 0) for (const k of Object.keys(out) as SectorKey[]) out[k] = out[k]! / sum
    return out
  }
  return null
}

/** Breakdown of one holding by country, sector and industry, with the source used (see the header). */
export function breakdownOf(h: Holding, ctx: HoldingContext = {}): Breakdown {
  const own = h.profile ?? null
  const item = instrumentOfHolding(h, ctx.custom)
  const cls = holdingClass(h, ctx)
  const prof = ctx.profiles?.[up(h.symbol)] ?? null
  // a direct stock, also when linked to the catalog's generic «direct stocks» entry
  const single = cls === 'equity_direct' || (!item && isSingleStock(h, prof))
  let source: BreakdownSource = 'unknown'
  const mark = (s: BreakdownSource) => { if (RANK[s] > RANK[source]) source = s }

  let countries = fractions(own?.countries ?? null, countryKey)
  if (countries) mark('holding')
  if (!countries && item) { countries = fractions(item.countries, countryKey); if (countries) mark('catalog') }
  if (!countries && single) {
    const c = prof?.country ?? countryOfListing(h.symbol, prof?.exchange, h.currency)
    countries = one(c)
    if (countries) mark(prof?.country ? 'profile' : 'class')
  }
  if (!countries) { countries = classCountries(cls, h); if (countries) mark('class') }

  let sectors = fractions(own?.sectors as Record<string, number> | null ?? null, sectorKey) as Partial<Record<SectorKey, number>> | null
  if (sectors) mark('holding')
  if (!sectors && item) { sectors = fractions(item.sectors as Record<string, number> | null, sectorKey) as Partial<Record<SectorKey, number>> | null; if (sectors) mark('catalog') }
  if (!sectors && single && prof?.sector) { const s = sectorFromYahoo(prof.sector); sectors = s ? { [s]: 1 } : null; if (sectors) mark('profile') }
  if (!sectors) { sectors = classSectors(cls); if (sectors) mark('class') }

  let industry: string | null = own?.industry?.trim() || null
  if (industry) mark('holding')
  if (!industry && single && prof?.industry) { industry = prof.industry; mark('profile') }
  if (!industry && (cls === 'reit_sa' || cls === 'reit_global')) industry = 'REIT - Diversified'

  if (own?.class && isAssetClass(own.class)) mark('holding')
  else if (item) mark('catalog')
  return { cls, countries, sectors, industry, source, item, single }
}

// =====================================================================================
// Portfolio exposure
// =====================================================================================
export interface ExposureItem {
  holding: Holding
  /** SAR */
  value: number
  cls: AssetClass
  countries: Record<string, number> | null
  sectors: Partial<Record<SectorKey, number>> | null
  industry: string | null
  source: BreakdownSource
  item: CatalogItem | null
  single: boolean
  /** part of the main portfolio (not a goal, emergency fund or income account, not in an excluded account) */
  main: boolean
}

export interface Exposure {
  /** SAR */
  total: number
  /** share of the value whose country and sector are both known, 0..1 */
  coverage: number
  /** SAR by ISO country; 'XX' = not known, 'XC' = gold and commodities */
  byCountry: Record<string, number>
  /** SAR by region key (countries.ts REGION_AR), 'XX' = not known */
  byRegion: Record<string, number>
  /** SAR by sector, known part only (total − Σ = unknownSector) */
  bySector: Partial<Record<SectorKey, number>>
  /** SAR by industry (Yahoo English names or the owner's text; label with industryLabel), known part only */
  byIndustry: Record<string, number>
  byClass: Partial<Record<AssetClass, number>>
  /** SAR by the currency each holding is priced in */
  byCurrency: Record<string, number>
  coverageCountry: number
  coverageSector: number
  coverageIndustry: number
  unknownSector: number
  unknownIndustry: number
  items: ExposureItem[]
  /** holdings whose country or sector is not known, largest first (to ask the owner) */
  unknown: Array<{ id: string; name: string; value: number }>
}

export interface LookThroughArgs {
  holdings: Holding[]
  accounts: Account[]
  fx: Fx
  profiles: Record<string, InstrumentProfile>
  custom?: CatalogItem[]
  /** the active plan (sleeve classes, its own instruments) */
  doc?: PlanDoc | null
  sleeves?: Sleeve[]
  goals?: Goal[]
  /** 'all' (default): everything invested, goals included; 'main': the main portfolio only */
  scope?: 'all' | 'main'
}

/** Where the money is, by country, region, sector, industry, class and currency (SAR values). */
export function lookThrough(args: LookThroughArgs): Exposure {
  const ctx = holdingContext({ doc: args.doc, sleeves: args.sleeves, goals: args.goals, profiles: normProfiles(args.profiles), custom: args.custom })
  const excluded = new Set(args.accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const ex: Exposure = {
    total: 0, coverage: 0, byCountry: {}, byRegion: {}, bySector: {}, byIndustry: {}, byClass: {}, byCurrency: {},
    coverageCountry: 0, coverageSector: 0, coverageIndustry: 0, unknownSector: 0, unknownIndustry: 0, items: [], unknown: [],
  }
  let both = 0, cKnown = 0, sKnown = 0, iKnown = 0
  const add = <K extends string>(m: Partial<Record<K, number>>, k: K, v: number) => { m[k] = (m[k] ?? 0) + v }
  for (const h of args.holdings) {
    if (h.archived) continue
    const main = !h.goal_id && !(h.account_id && excluded.has(h.account_id))
    if (args.scope === 'main' && !main) continue
    const v = holdingValue(h, args.fx)
    if (!(v > 0)) continue
    const b = breakdownOf(h, ctx)
    ex.total += v
    add(ex.byClass, b.cls, v)
    const cur = up(h.currency || 'SAR')
    add(ex.byCurrency, cur === 'GBX' ? 'GBP' : cur, v)
    if (b.countries) {
      cKnown += v
      for (const [c, f] of Object.entries(b.countries)) { add(ex.byCountry, c, v * f); add(ex.byRegion, regionOfCountry(c), v * f) }
    } else { add(ex.byCountry, UNKNOWN_COUNTRY, v); add(ex.byRegion, 'XX', v) }
    if (b.sectors) {
      sKnown += v
      for (const [s, f] of Object.entries(b.sectors) as Array<[SectorKey, number]>) add(ex.bySector, s, v * f)
    } else ex.unknownSector += v
    if (b.industry) { iKnown += v; add(ex.byIndustry, b.industry, v) } else ex.unknownIndustry += v
    if (b.countries && b.sectors) both += v
    else ex.unknown.push({ id: h.id, name: h.name, value: v })
    ex.items.push({ holding: h, value: v, cls: b.cls, countries: b.countries, sectors: b.sectors, industry: b.industry, source: b.source, item: b.item, single: b.single, main })
  }
  if (ex.total > 0) {
    ex.coverage = both / ex.total
    ex.coverageCountry = cKnown / ex.total
    ex.coverageSector = sKnown / ex.total
    ex.coverageIndustry = iKnown / ex.total
  }
  ex.unknown.sort((a, b) => b.value - a.value)
  ex.items.sort((a, b) => b.value - a.value)
  return ex
}

/** profiles keyed by upper-case symbol */
function normProfiles(p: Record<string, InstrumentProfile> | null | undefined): Record<string, InstrumentProfile> {
  const out: Record<string, InstrumentProfile> = {}
  for (const [k, v] of Object.entries(p ?? {})) if (v) out[up(k)] = v
  return out
}

/** Yahoo symbols of holdings whose breakdown would come from instrument_profiles (stocks not in the catalog). */
export function symbolsNeedingProfile(holdings: Holding[], custom: CatalogItem[] = []): string[] {
  const out = new Set<string>()
  for (const h of holdings) {
    if (h.archived || !h.symbol || /^\d+$/.test(h.symbol.trim())) continue
    if (h.price_source !== 'yahoo' && h.price_source !== 'ibkr') continue
    const it = instrumentOfHolding(h, custom)
    if (it && it.class !== 'equity_direct') continue
    if (h.profile?.countries && h.profile?.sectors && h.profile?.industry) continue
    const k = tadawulKind(h.symbol)
    if (k === 'etf') continue
    out.add(up(h.symbol))
  }
  return [...out].sort()
}

/** Share of `part` in `total`, 0..100. */
export const sharePct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0)
