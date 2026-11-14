import type {
  AccountKind, AppData, Asset, AssetClass, Liquidity, Region, ReviewFrequency, RiskProfile, Settings, ZakatMode,
} from './types.ts'

type Bi = { ar: string; en: string }

// Fixed order = fixed colour slot. Colour follows the class, never its rank.
export const ASSET_CLASSES: AssetClass[] = ['EQUITY', 'FIXED_INCOME', 'CASH', 'GOLD', 'REAL_ESTATE', 'CRYPTO', 'OTHER']

export const CLASS_LABEL: Record<AssetClass, Bi> = {
  EQUITY: { ar: 'أسهم', en: 'Equities' },
  FIXED_INCOME: { ar: 'صكوك ودخل ثابت', en: 'Sukuk & fixed income' },
  CASH: { ar: 'نقد وأسواق نقد', en: 'Cash & money market' },
  GOLD: { ar: 'ذهب', en: 'Gold' },
  REAL_ESTATE: { ar: 'عقار', en: 'Real estate' },
  CRYPTO: { ar: 'عملات رقمية', en: 'Crypto' },
  OTHER: { ar: 'أخرى', en: 'Other' },
}

// Validated categorical palette (dataviz reference palette, slots 1-7).
export const CLASS_COLOR: Record<AssetClass, string> = {
  EQUITY: '#2a78d6',
  FIXED_INCOME: '#eb6834',
  CASH: '#1baf7a',
  GOLD: '#eda100',
  REAL_ESTATE: '#e87ba4',
  CRYPTO: '#008300',
  OTHER: '#6250d6',
}

export const REGION_LABEL: Record<Region, Bi> = {
  SA: { ar: 'السعودية', en: 'Saudi Arabia' },
  US: { ar: 'أمريكا', en: 'United States' },
  DEV: { ar: 'أسواق متقدمة أخرى', en: 'Other developed' },
  EM: { ar: 'أسواق ناشئة', en: 'Emerging markets' },
  GCC: { ar: 'الخليج', en: 'GCC' },
  GLOBAL: { ar: 'عالمي', en: 'Global' },
  NONE: { ar: 'غير مرتبط بدولة', en: 'No country' },
}

export const SECTORS: Record<string, Bi> = {
  DIVERSIFIED: { ar: 'متنوع (صندوق)', en: 'Diversified (fund)' },
  BANKS: { ar: 'البنوك', en: 'Banks' },
  ENERGY: { ar: 'الطاقة', en: 'Energy' },
  MATERIALS: { ar: 'المواد الأساسية', en: 'Materials' },
  TELECOM: { ar: 'الاتصالات', en: 'Telecom' },
  TECH: { ar: 'التقنية', en: 'Technology' },
  HEALTH: { ar: 'الرعاية الصحية', en: 'Healthcare' },
  CONSUMER: { ar: 'السلع والتجزئة', en: 'Consumer & retail' },
  FOOD: { ar: 'الأغذية', en: 'Food' },
  UTILITIES: { ar: 'المرافق', en: 'Utilities' },
  INSURANCE: { ar: 'التأمين', en: 'Insurance' },
  REAL_ESTATE: { ar: 'العقار', en: 'Real estate' },
  INDUSTRIALS: { ar: 'الصناعة والنقل', en: 'Industrials & transport' },
  FINANCIALS: { ar: 'خدمات مالية', en: 'Financial services' },
  NA: { ar: 'غير قطاعي', en: 'Not sector-based' },
}

export const LIQUIDITY_LABEL: Record<Liquidity, Bi> = {
  HIGH: { ar: 'سيولة عالية (أيام)', en: 'High (days)' },
  MEDIUM: { ar: 'سيولة متوسطة (أسابيع)', en: 'Medium (weeks)' },
  LOW: { ar: 'سيولة منخفضة (أشهر+)', en: 'Low (months+)' },
}

export const KIND_LABEL: Record<AccountKind, Bi> = {
  BROKERAGE: { ar: 'محفظة تداول', en: 'Brokerage' },
  EMPLOYER: { ar: 'برنامج ادخار جهة العمل', en: 'Employer savings plan' },
  ROBO: { ar: 'محفظة مُدارة', en: 'Managed portfolio' },
  BANK: { ar: 'بنك / ادخار', en: 'Bank / savings' },
  OTHER: { ar: 'أخرى', en: 'Other' },
}

export const ZAKAT_MODES: ZakatMode[] = ['FULL', 'PERCENT', 'PER_UNIT', 'AMOUNT', 'COMPANY_PAYS', 'EXEMPT']

export const ZAKAT_LABEL: Record<ZakatMode, Bi> = {
  FULL: { ar: 'كامل القيمة السوقية', en: 'Full market value' },
  PERCENT: { ar: 'نسبة من القيمة', en: 'Share of value' },
  PER_UNIT: { ar: 'زكاة السهم', en: 'Zakat per share' },
  AMOUNT: { ar: 'مبلغ أحدده', en: 'Amount I set' },
  COMPANY_PAYS: { ar: 'الشركة تزكّي عني', en: 'Company pays zakat' },
  EXEMPT: { ar: 'لا زكاة على الأصل', en: 'Not zakatable' },
}

export const ZAKAT_HINT: Record<ZakatMode, Bi> = {
  FULL: { ar: 'نقد، ودائع، صكوك، ذهب، وأسهم المضاربة.', en: 'Cash, deposits, sukuk, gold and trading shares.' },
  PERCENT: { ar: 'استثمار طويل: حصتك من الأصول الزكوية كنسبة من القيمة.', en: 'Long-term holding: your share of zakatable assets as a share of value.' },
  PER_UNIT: { ar: 'حين تُعلن الشركة أو حاسبة موثوقة زكاة السهم الواحد.', en: 'When the company or a trusted calculator publishes zakat per share.' },
  AMOUNT: { ar: 'حسبتها خارج التطبيق. راجع المبلغ كل سنة لأنه لا يتغير مع القيمة.', en: 'Worked out elsewhere. Review it yearly: it does not move with the value.' },
  COMPANY_PAYS: { ar: 'أسهم سعودية مدرجة لمستثمر طويل الأجل.', en: 'Saudi-listed shares held for the long term.' },
  EXEMPT: { ar: 'عقار مؤجَّر وريت: الزكاة على الدخل لا على الأصل.', en: 'Rented property and REITs: zakat is on the income, not the asset.' },
}

export const FREQ_LABEL: Record<ReviewFrequency, Bi> = {
  MONTHLY: { ar: 'شهرية', en: 'Monthly' },
  QUARTERLY: { ar: 'ربع سنوية', en: 'Quarterly' },
  SEMI: { ar: 'نصف سنوية', en: 'Semi-annual' },
  ANNUAL: { ar: 'سنوية', en: 'Annual' },
}
export const FREQ_MONTHS: Record<ReviewFrequency, number> = { MONTHLY: 1, QUARTERLY: 3, SEMI: 6, ANNUAL: 12 }

export const PROFILE_LABEL: Record<RiskProfile, Bi> = {
  CONSERVATIVE: { ar: 'متحفظ', en: 'Conservative' },
  BALANCED: { ar: 'متوازن', en: 'Balanced' },
  GROWTH: { ar: 'نمو', en: 'Growth' },
  CUSTOM: { ar: 'مخصص', en: 'Custom' },
}

export const PROFILE_TARGETS: Record<Exclude<RiskProfile, 'CUSTOM'>, Record<AssetClass, number>> = {
  CONSERVATIVE: { EQUITY: 35, FIXED_INCOME: 35, CASH: 15, GOLD: 10, REAL_ESTATE: 5, CRYPTO: 0, OTHER: 0 },
  BALANCED: { EQUITY: 60, FIXED_INCOME: 20, CASH: 5, GOLD: 10, REAL_ESTATE: 5, CRYPTO: 0, OTHER: 0 },
  GROWTH: { EQUITY: 80, FIXED_INCOME: 5, CASH: 0, GOLD: 10, REAL_ESTATE: 5, CRYPTO: 0, OTHER: 0 },
}

export function defaultLiquidity(a: Pick<Asset, 'assetClass' | 'pricing'>): Liquidity {
  if (a.assetClass === 'REAL_ESTATE' && a.pricing === 'manual') return 'LOW'
  if (a.assetClass === 'CASH' || a.pricing === 'live') return 'HIGH'
  return 'MEDIUM'
}

/** Starting point only — every asset's treatment is editable by the user. */
export function defaultZakatMode(a: Pick<Asset, 'assetClass' | 'region' | 'isFund' | 'symbol' | 'pricing'>): ZakatMode {
  if (a.assetClass === 'EQUITY' && a.region === 'SA' && !a.isFund && !!a.symbol && a.symbol.endsWith('.SR')) return 'COMPANY_PAYS'
  // Rented property and REITs: zakat falls on the income received, not on the asset itself.
  if (a.assetClass === 'REAL_ESTATE') return 'EXEMPT'
  // Long-term shares and equity funds: zakat on the holder's share of the company's zakatable assets,
  // estimated as a share of market value. Traders switch the asset to FULL.
  if (a.assetClass === 'EQUITY') return 'PERCENT'
  return 'FULL'
}

/** Rough share of an equity holding's market value treated as zakatable when the real figure is unknown. An estimate the user should adjust. */
export const DEFAULT_ZAKAT_PERCENT = 30

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function defaultSettings(): Settings {
  const y = new Date().getFullYear()
  return {
    locale: 'ar',
    hideAmounts: false,
    onboarded: false,
    monthlyExpenses: 0,
    monthlyIncome: 0,
    monthlyContribution: 0,
    emergencyMonths: 6,
    riskProfile: 'BALANCED',
    targetsSet: false,
    targets: { ...PROFILE_TARGETS.BALANCED },
    goal: { mode: 'AMOUNT', amount: 0, monthlyIncome: 0, targetYear: y + 15, expectedReturn: 7, inflation: 2 },
    income: { growthTarget: 0, planZakatRate: 2.5, reserveYears: 1.5, drawdownTrigger: 15, annualIncome: 0, lastRate: 0, lastTransferDate: '' },
    zakat: { hawlDate: '', calendar: 'HIJRI', goldPricePerGram: 0, lastPaidDate: '', lastPaidAmount: 0, history: [] },
    review: { frequency: 'QUARTERLY', lastReviewAt: '' },
    fx: { USD: 3.75 },
    lookThrough: { US: 64, DEV: 25, EM: 11 },
    shariahFirst: true,
    roadmap: { debtFree: false, employerMatch: false, automated: false },
  }
}

export function emptyData(): AppData {
  return { version: 3, settings: defaultSettings(), accounts: [], assets: [], transactions: [], snapshots: [], reviews: [] }
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
