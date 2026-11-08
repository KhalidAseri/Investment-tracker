// Instrument catalog: the investable universe the advisor recommends from (see ADVISOR-FEATURE.md).
// Generic for any Saudi-based investor who wants Shariah-compliant instruments; nothing here is personal.
// The data lives in catalog.data.ts (researched, with sources); zakat guidance in zakatGuide.data.ts.
import type { Layer } from './types'

export type AssetClass =
  | 'cash' | 'money_market' | 'savings_sukuk' | 'murabaha'
  | 'sukuk_sar' | 'sukuk_usd'
  | 'equity_global' | 'equity_us' | 'equity_em' | 'equity_sa' | 'equity_direct'
  | 'reit_sa' | 'reit_global'
  | 'gold' | 'mixed_income' | 'other'

/** GICS sectors plus fixed-income, cash and commodity buckets for look-through. */
export type SectorKey =
  | 'energy' | 'materials' | 'industrials' | 'consumer_disc' | 'consumer_staples' | 'health' | 'financials'
  | 'tech' | 'communication' | 'utilities' | 'real_estate'
  | 'sovereign' | 'quasi_sovereign' | 'corporate' | 'cash' | 'commodity' | 'other'

/** How zakat is worked out for a holding (see zakatGuide.data.ts for the guidance and sources). */
export type ZakatMethod =
  | 'market'            // 2.5% of market value (cash, sukuk, gold, trading intent)
  | 'zakatable_assets'  // 2.5% of the zakatable share of the value (long-term shares/funds), `ratio` %
  | 'paid_by_entity'    // the company or fund pays it (e.g. Saudi companies pay zakat to ZATCA)
  | 'income_only'       // zakat on the income received, not on the principal (e.g. rental real estate)
  | 'exempt'            // no zakat (personal use, or the owner's choice)

/** Where the instrument can be bought. */
export type Platform =
  | 'derayah' | 'derayah_global' | 'alrajhi' | 'alinma' | 'snb' | 'albilad' | 'sahm' | 'ibkr' | 'bank' | 'mof' | 'other'

export type Liquidity = 'daily' | 'T+2' | 'term' | 'locked'

export interface CatalogItem {
  /** stable slug, e.g. 'iswd' */
  id: string
  /** Arabic display name */
  name: string
  name_en: string | null
  class: AssetClass
  layer: Layer
  /** how its price is tracked: Yahoo symbol, Saudi fund NAV (Mubasher id) or manual */
  source: 'yahoo' | 'nav' | 'manual'
  /** exact Yahoo symbol when source = 'yahoo' (e.g. 'ISWD.L', '4330.SR', 'SPUS') */
  symbol: string | null
  /** Mubasher fund id when source = 'nav' */
  fund_id: string | null
  currency: string
  exchange: string | null
  platforms: Platform[]
  /** total expense ratio, % per year */
  ter: number | null
  distribution: 'acc' | 'dist' | null
  pay_freq: 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual' | null
  /** effective duration or tenor in years (sukuk, money market, savings sukuk) */
  duration_years: number | null
  liquidity: Liquidity
  /** SAR, if the product has a minimum */
  min_investment: number | null
  /** Shariah basis, e.g. 'MSCI Islamic index + Shariah board' */
  shariah: string
  /** look-through by country, ISO-3166 alpha-2 → % (sums to ~100; 'XX' = other/unallocated) */
  countries: Record<string, number> | null
  /** look-through by sector → % */
  sectors: Partial<Record<SectorKey, number>> | null
  /** date of the look-through snapshot (fact sheet date) */
  as_of: string | null
  /** issuer page or fact sheet the figures come from */
  source_url: string | null
  inception: string | null
  zakat: { method: ZakatMethod; ratio: number | null; note: string | null }
  /** one short Arabic line shown under the name */
  note: string | null
}

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  cash: 'نقد',
  money_market: 'صناديق أسواق النقد',
  savings_sukuk: 'صكوك ادخارية',
  murabaha: 'مرابحة وودائع',
  sukuk_sar: 'صكوك بالريال',
  sukuk_usd: 'صكوك بالدولار',
  equity_global: 'أسهم عالمية',
  equity_us: 'أسهم أمريكية',
  equity_em: 'أسهم الأسواق الناشئة',
  equity_sa: 'أسهم سعودية',
  equity_direct: 'أسهم مباشرة',
  reit_sa: 'صناديق ريت سعودية',
  reit_global: 'عقارات عالمية',
  gold: 'ذهب',
  mixed_income: 'صناديق دخل متنوعة',
  other: 'أخرى',
}

/** The portfolio layer an asset class normally belongs to. */
export const CLASS_LAYER: Record<AssetClass, Layer> = {
  cash: 'safety', money_market: 'safety', savings_sukuk: 'safety', murabaha: 'safety',
  sukuk_sar: 'income', sukuk_usd: 'income', reit_sa: 'income', reit_global: 'income', mixed_income: 'income',
  equity_global: 'growth', equity_us: 'growth', equity_em: 'growth', equity_sa: 'growth', equity_direct: 'growth',
  gold: 'hedge', other: 'growth',
}

/** Equity-like classes (for growth share, crash rule and drawdown). */
export const EQUITY_CLASSES: AssetClass[] = ['equity_global', 'equity_us', 'equity_em', 'equity_sa', 'equity_direct']
/** Cash-like classes (liquid, stable value). */
export const CASH_CLASSES: AssetClass[] = ['cash', 'money_market', 'savings_sukuk', 'murabaha']
export const SUKUK_CLASSES: AssetClass[] = ['sukuk_sar', 'sukuk_usd']

export const SECTOR_LABEL: Record<SectorKey, string> = {
  energy: 'الطاقة', materials: 'المواد الأساسية', industrials: 'الصناعة', consumer_disc: 'السلع الكمالية',
  consumer_staples: 'السلع الاستهلاكية الأساسية', health: 'الرعاية الصحية', financials: 'المالية', tech: 'التقنية',
  communication: 'الاتصالات والإعلام', utilities: 'المرافق العامة', real_estate: 'العقار',
  sovereign: 'صكوك حكومية', quasi_sovereign: 'صكوك شبه حكومية', corporate: 'صكوك شركات', cash: 'نقد ومرابحة',
  commodity: 'سلع (ذهب)', other: 'أخرى',
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  derayah: 'دراية (السوق السعودية)', derayah_global: 'دراية العالمية', alrajhi: 'الراجحي المالية', alinma: 'الإنماء للاستثمار',
  snb: 'الأهلي المالية', albilad: 'البلاد المالية', sahm: 'سهم', ibkr: 'Interactive Brokers', bank: 'البنك', mof: 'وزارة المالية (صح)', other: 'أخرى',
}

export const ZAKAT_METHOD_LABEL: Record<ZakatMethod, string> = {
  market: 'على القيمة السوقية كاملة',
  zakatable_assets: 'على الجزء الزكوي من القيمة',
  paid_by_entity: 'تدفعها الشركة أو الصندوق',
  income_only: 'على الدخل المقبوض فقط',
  exempt: 'لا زكاة عليه',
}

/**
 * Yahoo symbols with long histories that stand in for each class in the statistics (sustain.ts, risk.ts).
 * Several symbols = an equal-weight basket. '^IRX' is a yield (percent), not a price.
 * Owned by the market agent: it may refine these with a short justification in ADVISOR-FEATURE.md.
 */
export const CLASS_PROXY: Record<AssetClass, string[]> = {
  cash: ['^IRX'], money_market: ['^IRX'], savings_sukuk: ['^IRX'], murabaha: ['^IRX'],
  sukuk_sar: ['IEI'], sukuk_usd: ['IEI'],
  equity_global: ['ACWI'], equity_us: ['SPY'], equity_em: ['EEM'], equity_sa: ['^TASI.SR'], equity_direct: ['^TASI.SR'],
  reit_sa: ['4330.SR', '4340.SR', '4339.SR', '4342.SR'], reit_global: ['VNQ'],
  gold: ['GLD'], mixed_income: [], other: ['ACWI'],
}
/** Classes modelled as a blend of other classes (weights sum to 1). */
export const CLASS_BLEND: Partial<Record<AssetClass, Partial<Record<AssetClass, number>>>> = {
  mixed_income: { equity_sa: 0.4, reit_sa: 0.3, money_market: 0.3 },
}

export { CATALOG } from './catalog.data'
export { ZAKAT_GUIDE } from './zakatGuide.data'

// ---- helpers (the engine agent may add more below this line) ----
import { CATALOG } from './catalog.data'

export const catalogById = (id: string | null | undefined): CatalogItem | null => (id ? CATALOG.find((c) => c.id === id) ?? null : null)
export const catalogBySymbol = (symbol: string | null | undefined): CatalogItem | null => {
  if (!symbol) return null
  const s = symbol.trim().toUpperCase()
  return CATALOG.find((c) => (c.symbol ?? '').toUpperCase() === s || (c.fund_id ?? '') === symbol.trim()) ?? null
}
export const catalogForClass = (cls: AssetClass, platforms?: Platform[] | null): CatalogItem[] =>
  CATALOG.filter((c) => c.class === cls && (!platforms?.length || c.platforms.some((p) => platforms.includes(p))))

// ---- engine helpers (advisor / designer / purchase / zakat) ----
import { ZAKAT_GUIDE } from './zakatGuide.data'
import type { Holding } from './types'

/** Platforms that open the global markets (global equities, USD sukuk). */
export const GLOBAL_PLATFORMS: Platform[] = ['derayah_global', 'ibkr', 'sahm']
/** Open to any resident without a brokerage account: bank deposits and government savings sukuk. */
export const OPEN_PLATFORMS: Platform[] = ['bank', 'mof']
export const ALL_PLATFORMS = Object.keys(PLATFORM_LABEL) as Platform[]
export const hasGlobalAccess = (platforms: Platform[] | null | undefined) => !!platforms?.some((p) => GLOBAL_PLATFORMS.includes(p))

export const isAssetClass = (v: unknown): v is AssetClass => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ASSET_CLASS_LABEL, v)
export const isPlatform = (v: unknown): v is Platform => typeof v === 'string' && Object.prototype.hasOwnProperty.call(PLATFORM_LABEL, v)
export const isZakatMethod = (v: unknown): v is ZakatMethod => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ZAKAT_METHOD_LABEL, v)

/** The class a layer stands for when nothing else is known. */
export const LAYER_CLASS: Record<Layer, AssetClass> = { growth: 'equity_global', income: 'sukuk_sar', safety: 'money_market', hedge: 'gold' }

/** An instrument by id: the owner's own instruments first, then the catalog. */
export const findInstrument = (id: string | null | undefined, custom: CatalogItem[] = []): CatalogItem | null =>
  (id ? custom.find((c) => c.id === id) ?? catalogById(id) : null)

/** The key market data uses for an instrument (Yahoo symbol or Saudi fund id). */
export const marketKey = (it: Pick<CatalogItem, 'symbol' | 'fund_id'>): string | null => it.symbol ?? it.fund_id ?? null

const up = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()
/** Is this holding a position in that instrument (catalog link, Yahoo symbol or fund id)? */
export function holdingMatches(h: Pick<Holding, 'catalog_id' | 'symbol'>, it: Pick<CatalogItem, 'id' | 'symbol' | 'fund_id'>): boolean {
  if (h.catalog_id) return h.catalog_id === it.id
  const s = up(h.symbol)
  return !!s && (s === up(it.symbol) || s === up(it.fund_id))
}

/** The instrument a holding is in: its catalog link, else a symbol or fund id match (owner's instruments first). */
export function instrumentOfHolding(h: Pick<Holding, 'catalog_id' | 'symbol'>, custom: CatalogItem[] = []): CatalogItem | null {
  if (h.catalog_id) {
    const hit = findInstrument(h.catalog_id, custom)
    if (hit) return hit
  }
  if (!h.symbol) return null
  return custom.find((c) => holdingMatches({ catalog_id: null, symbol: h.symbol }, c)) ?? catalogBySymbol(h.symbol)
}

export interface ClassOpts {
  /** sleeves.id -> class of the plan sleeve it carries */
  sleeveClass?: Record<string, AssetClass | null | undefined>
  /** the plan's own instruments */
  custom?: CatalogItem[]
}
/** Asset class of a holding: the owner's override, then its instrument, then its plan sleeve. */
export function classOfHolding(h: Pick<Holding, 'profile' | 'catalog_id' | 'symbol' | 'sleeve_id'>, opts: ClassOpts = {}): AssetClass | null {
  const own = h.profile?.class
  if (own && isAssetClass(own)) return own
  const it = instrumentOfHolding(h, opts.custom)
  if (it) return it.class
  const s = h.sleeve_id ? opts.sleeveClass?.[h.sleeve_id] : null
  return s && isAssetClass(s) ? s : null
}

/** Catalog items of a class, cheapest first (TER), then the longest history. `extra` platforms are always accepted. */
export function rankedForClass(cls: AssetClass, platforms?: Platform[] | null, extra: Platform[] = []): CatalogItem[] {
  const allowed = platforms?.length ? [...platforms, ...extra] : null
  return catalogForClass(cls, allowed).slice().sort((a, b) =>
    (a.ter ?? 99) - (b.ter ?? 99) || (a.inception ?? '9999').localeCompare(b.inception ?? '9999') || a.id.localeCompare(b.id))
}

/** The zakat method the guide applies to a class by default. */
export function zakatDefault(cls: AssetClass | null | undefined): { method: ZakatMethod; ratio: number | null } | null {
  const g = cls ? ZAKAT_GUIDE[cls] : undefined
  return g && isZakatMethod(g.method) ? { method: g.method, ratio: g.ratio ?? null } : null
}

const normAr = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()
/** Best guess of a sleeve's class from its name, else from its layer. */
export function guessClass(name: string, layer: Layer): AssetClass {
  const n = normAr(name || '')
  const has = (...w: string[]) => w.some((x) => n.includes(x))
  if (has('ذهب', 'gold')) return 'gold'
  if (has('صكوك', 'sukuk', 'سندات', 'bond')) return has('ادخار') ? 'savings_sukuk' : has('دولار', 'usd', 'عالمي', 'global') ? 'sukuk_usd' : 'sukuk_sar'
  if (has('ريت', 'reit', 'عقار')) return has('عالمي', 'global') ? 'reit_global' : 'reit_sa'
  if (has('مرابحه', 'سيوله', 'نقد', 'cash', 'money market', 'ودائع')) return 'money_market'
  if (has('ناشئ', 'emerging')) return 'equity_em'
  if (has('مباشر', 'direct', 'فرص')) return 'equity_direct'
  if (has('توزيع', 'dividend')) return layer === 'growth' ? 'equity_sa' : 'mixed_income'
  if (has('سعودي', 'تاسي', 'محلي', 'saudi', 'tasi')) return layer === 'growth' ? 'equity_sa' : LAYER_CLASS[layer]
  if (has('امريك', 's&p', 'usa', 'nasdaq')) return 'equity_us'
  if (has('عالمي', 'العالم', 'متقدم', 'world', 'global')) return layer === 'growth' ? 'equity_global' : LAYER_CLASS[layer]
  return LAYER_CLASS[layer]
}

const LIQ: Liquidity[] = ['daily', 'T+2', 'term', 'locked']
const FREQS = ['none', 'monthly', 'quarterly', 'semiannual', 'annual'] as const
const numOr = (v: unknown, d: number | null = null) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d }
const strOr = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
const pctMap = (v: unknown): Record<string, number> | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, Number(x)]).filter(([, x]) => Number.isFinite(x as number)))
  return Object.keys(out).length ? (out as Record<string, number>) : null
}
/** Tolerant reader for an instrument written by the owner or read from a plan file; null when it has no id or name. */
export function normalizeCatalogItem(raw: unknown): CatalogItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, any>
  const id = strOr(r.id), name = strOr(r.name)
  if (!id || !name) return null
  const cls: AssetClass = isAssetClass(r.class) ? r.class : 'other'
  const z = r.zakat && typeof r.zakat === 'object' ? r.zakat : {}
  return {
    id, name, name_en: strOr(r.name_en), class: cls,
    layer: (['growth', 'income', 'safety', 'hedge'] as Layer[]).includes(r.layer) ? r.layer : CLASS_LAYER[cls],
    source: r.source === 'yahoo' || r.source === 'nav' ? r.source : 'manual',
    symbol: strOr(r.symbol), fund_id: strOr(r.fund_id), currency: strOr(r.currency) ?? 'SAR', exchange: strOr(r.exchange),
    platforms: Array.isArray(r.platforms) ? r.platforms.filter(isPlatform) : [],
    ter: numOr(r.ter), distribution: r.distribution === 'acc' || r.distribution === 'dist' ? r.distribution : null,
    pay_freq: (FREQS as readonly string[]).includes(r.pay_freq) ? r.pay_freq : null,
    duration_years: numOr(r.duration_years), liquidity: LIQ.includes(r.liquidity) ? r.liquidity : 'daily',
    min_investment: numOr(r.min_investment), shariah: typeof r.shariah === 'string' ? r.shariah : '',
    countries: pctMap(r.countries), sectors: pctMap(r.sectors) as CatalogItem['sectors'], as_of: strOr(r.as_of), source_url: strOr(r.source_url),
    inception: strOr(r.inception),
    zakat: { method: isZakatMethod(z.method) ? z.method : 'market', ratio: numOr(z.ratio), note: strOr(z.note) },
    note: strOr(r.note),
  }
}
