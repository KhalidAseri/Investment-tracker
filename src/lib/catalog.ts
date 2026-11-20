import type { AccountKind, AssetClass, Pricing, Region } from './types.ts'
import { similarity, tokens } from './engine/text.ts'

/** What the user picks first in the add-asset wizard. */
export type AssetKindId = 'SA_STOCK' | 'GLOBAL' | 'FUND' | 'CASH' | 'GOLD' | 'REAL_ESTATE' | 'CRYPTO' | 'OTHER'

export interface AssetKind {
  id: AssetKindId
  ar: string
  en: string
  hintAr: string
  hintEn: string
  icon: string
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  pricing: Pricing
  isFund: boolean
  accountKind: AccountKind
}

export const ASSET_KINDS: AssetKind[] = [
  { id: 'SA_STOCK', ar: 'سهم أو صندوق سعودي', en: 'Saudi stock or fund', hintAr: 'أسهم، صناديق متداولة وريت، وصناديق استثمارية', hintEn: 'Stocks, listed funds & REITs, mutual funds', icon: 'TrendingUp', assetClass: 'EQUITY', region: 'SA', sector: 'NA', currency: 'SAR', pricing: 'live', isFund: false, accountKind: 'BROKERAGE' },
  { id: 'GLOBAL', ar: 'سهم أو صندوق عالمي', en: 'Global stock / ETF', hintAr: 'أمريكي أو أيرلندي — سعر مباشر', hintEn: 'US or Irish — live price', icon: 'Globe', assetClass: 'EQUITY', region: 'US', sector: 'DIVERSIFIED', currency: 'USD', pricing: 'live', isFund: true, accountKind: 'BROKERAGE' },
  { id: 'FUND', ar: 'صندوق أو محفظة مُدارة', en: 'Fund / managed portfolio', hintAr: 'ادخار جهة العمل، صندوق استثماري — قيمة يدوية', hintEn: 'Employer plan, mutual fund — manual value', icon: 'Briefcase', assetClass: 'EQUITY', region: 'GLOBAL', sector: 'DIVERSIFIED', currency: 'SAR', pricing: 'manual', isFund: true, accountKind: 'EMPLOYER' },
  { id: 'CASH', ar: 'نقد وادخار', en: 'Cash & savings', hintAr: 'حساب ادخار، وديعة، صندوق مرابحة', hintEn: 'Savings, deposit, money-market fund', icon: 'Landmark', assetClass: 'CASH', region: 'SA', sector: 'NA', currency: 'SAR', pricing: 'manual', isFund: true, accountKind: 'BANK' },
  { id: 'GOLD', ar: 'ذهب', en: 'Gold', hintAr: 'سبائك بالجرام أو صندوق ذهب', hintEn: 'Bullion by gram or a gold fund', icon: 'Gem', assetClass: 'GOLD', region: 'NONE', sector: 'NA', currency: 'USD', pricing: 'live', isFund: true, accountKind: 'OTHER' },
  { id: 'REAL_ESTATE', ar: 'عقار', en: 'Real estate', hintAr: 'عقار مباشر أو مساهمة — قيمة يدوية', hintEn: 'Direct property — manual value', icon: 'Home', assetClass: 'REAL_ESTATE', region: 'SA', sector: 'REAL_ESTATE', currency: 'SAR', pricing: 'manual', isFund: false, accountKind: 'OTHER' },
  { id: 'CRYPTO', ar: 'عملة رقمية', en: 'Crypto', hintAr: 'بتكوين وغيرها — سعر مباشر', hintEn: 'Bitcoin and others — live price', icon: 'Coins', assetClass: 'CRYPTO', region: 'NONE', sector: 'NA', currency: 'USD', pricing: 'live', isFund: false, accountKind: 'OTHER' },
  { id: 'OTHER', ar: 'أصل آخر', en: 'Other asset', hintAr: 'أي أصل تحدّث قيمته يدويًا', hintEn: 'Anything you value by hand', icon: 'Package', assetClass: 'OTHER', region: 'SA', sector: 'NA', currency: 'SAR', pricing: 'manual', isFund: false, accountKind: 'OTHER' },
]

export interface CatalogItem {
  symbol: string
  ar: string
  en: string
  kind: AssetKindId
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  isFund: boolean
  domicile: string
  /** true = marketed as Shariah-compliant by its issuer; undefined = not stated here. */
  shariah?: boolean
  /** Saudi items only: a listed share, a fund listed on Tadawul, or an unlisted mutual fund priced by NAV. */
  group?: SaudiGroup
  manager?: string
}

export type SaudiGroup = 'stock' | 'listed' | 'mutual'
export const SAUDI_GROUPS: { id: SaudiGroup; ar: string; en: string }[] = [
  { id: 'stock', ar: 'الأسهم', en: 'Stocks' },
  { id: 'listed', ar: 'صناديق متداولة وريت', en: 'Listed funds & REITs' },
  { id: 'mutual', ar: 'صناديق استثمارية', en: 'Mutual funds' },
]

/** Unlisted Saudi mutual funds have no market symbol; they get an 'MF:' key that Claude's daily update prices. */
export const isMutualFund = (symbol: string | null | undefined) => !!symbol && symbol.startsWith('MF:')

const sa = (code: string, ar: string, en: string, sector: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  symbol: `${code}.SR`, ar, en, kind: 'SA_STOCK', assetClass: 'EQUITY', region: 'SA', sector, currency: 'SAR', isFund: false, domicile: 'SA', group: 'stock', ...extra,
})
const etf = (code: string, ar: string, en: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  symbol: `${code}.SR`, ar, en, kind: 'SA_STOCK', assetClass: 'EQUITY', region: 'SA', sector: 'DIVERSIFIED', currency: 'SAR', isFund: true, domicile: 'SA', group: 'listed', ...extra,
})
const reit = (code: string, ar: string, en: string): CatalogItem => etf(code, ar, en, { assetClass: 'REAL_ESTATE', sector: 'REAL_ESTATE' })
const mf = (key: string, manager: string, ar: string, en: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  symbol: `MF:${key}`, ar, en, kind: 'SA_STOCK', assetClass: 'EQUITY', region: 'SA', sector: 'DIVERSIFIED', currency: 'SAR', isFund: true, domicile: 'SA', group: 'mutual', manager, ...extra,
})
const cash = { assetClass: 'CASH' as const, sector: 'NA' }
const sukuk = { assetClass: 'FIXED_INCOME' as const, sector: 'NA' }
const pending = { assetClass: 'OTHER' as const }   // multi-asset or unclear mandate: classified when the fund is analysed

const gl = (symbol: string, ar: string, en: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  symbol, ar, en, kind: 'GLOBAL', assetClass: 'EQUITY', region: 'US', sector: 'DIVERSIFIED', currency: 'USD', isFund: true, domicile: 'US', ...extra,
})

export const CATALOG: CatalogItem[] = [
  // Tadawul
  sa('2222', 'أرامكو السعودية', 'Saudi Aramco', 'ENERGY'),
  sa('1120', 'مصرف الراجحي', 'Al Rajhi Bank', 'BANKS'),
  sa('1180', 'البنك الأهلي السعودي', 'Saudi National Bank', 'BANKS'),
  sa('1150', 'مصرف الإنماء', 'Alinma Bank', 'BANKS'),
  sa('1010', 'بنك الرياض', 'Riyad Bank', 'BANKS'),
  sa('1060', 'البنك السعودي الأول', 'Saudi Awwal Bank', 'BANKS'),
  sa('1140', 'بنك البلاد', 'Bank Albilad', 'BANKS'),
  sa('1080', 'البنك العربي الوطني', 'Arab National Bank', 'BANKS'),
  sa('1050', 'البنك السعودي الفرنسي', 'Banque Saudi Fransi', 'BANKS'),
  sa('2010', 'سابك', 'SABIC', 'MATERIALS'),
  sa('2020', 'سابك للمغذيات الزراعية', 'SABIC Agri-Nutrients', 'MATERIALS'),
  sa('1211', 'معادن', 'Maaden', 'MATERIALS'),
  sa('2310', 'سبكيم العالمية', 'Sipchem', 'MATERIALS'),
  sa('7010', 'الاتصالات السعودية stc', 'stc', 'TELECOM'),
  sa('7020', 'اتحاد اتصالات (موبايلي)', 'Mobily', 'TELECOM'),
  sa('7030', 'زين السعودية', 'Zain KSA', 'TELECOM'),
  sa('7203', 'علم', 'Elm', 'TECH'),
  sa('2280', 'المراعي', 'Almarai', 'FOOD'),
  sa('4190', 'جرير', 'Jarir', 'CONSUMER'),
  sa('4001', 'أسواق العثيم', 'Othaim Markets', 'CONSUMER'),
  sa('4164', 'النهدي الطبية', 'Nahdi Medical', 'CONSUMER'),
  sa('5110', 'السعودية للكهرباء', 'Saudi Electricity', 'UTILITIES'),
  sa('2082', 'أكوا باور', 'ACWA Power', 'UTILITIES'),
  sa('4013', 'سليمان الحبيب', 'Dr. Sulaiman Al Habib', 'HEALTH'),
  sa('4002', 'المواساة', 'Mouwasat', 'HEALTH'),
  sa('8210', 'بوبا العربية', 'Bupa Arabia', 'INSURANCE'),
  sa('8010', 'التعاونية', 'Tawuniya', 'INSURANCE'),
  sa('4030', 'البحري', 'Bahri', 'INDUSTRIALS'),
  sa('2223', 'لوبريف', 'Luberef', 'ENERGY'),
  sa('1111', 'مجموعة تداول', 'Saudi Tadawul Group', 'FINANCIALS'),
  sa('4300', 'دار الأركان', 'Dar Al Arkan', 'REAL_ESTATE'),

  // Funds listed on Tadawul. Every code checked against the price service on 2026-11-15.
  etf('9400', 'يقين للأسهم السعودية المتداول', 'Yaqeen Saudi Equity ETF'),
  etf('9401', 'يقين للبتروكيماويات المتداول', 'Yaqeen Petrochemical ETF', { sector: 'MATERIALS' }),
  etf('9402', 'ساب إنفست الكمي للأسهم السعودية المتداول', 'SAB Invest Saudi Quant ETF'),
  etf('9403', 'البلاد للصكوك السيادية السعودية المتداول', 'Albilad Saudi Sovereign Sukuk ETF', sukuk),
  etf('9404', 'الإنماء للصكوك الحكومية السعودية المتداول', 'Alinma Saudi Government Sukuk ETF', sukuk),
  etf('9405', 'البلاد للذهب المتداول', 'Albilad Gold ETF', { assetClass: 'GOLD', region: 'NONE', sector: 'NA' }),
  etf('9406', 'البلاد إم إس سي آي للأسهم الأمريكية المتداول', 'Albilad MSCI US Equity ETF', { region: 'US' }),
  etf('9407', 'البلاد إم إس سي آي لأسهم التقنية الأمريكية المتداول', 'Albilad MSCI US Tech ETF', { region: 'US', sector: 'TECH' }),
  etf('9408', 'البلاد إم إس سي آي لأسهم النمو السعودية المتداول', 'Albilad MSCI Saudi Growth ETF'),
  etf('9409', 'يقين إس آند بي للأسهم المستدامة في الشرق الأوسط وشمال أفريقيا', 'Yaqeen S&P ESG MENA ETF', { region: 'GCC' }),
  etf('9410', 'البلاد سي إس أو بي إم إس سي آي هونغ كونغ الصين المتداول', 'Albilad CSOP MSCI Hong Kong China ETF', { region: 'EM' }),
  etf('9411', 'ساب إنفست هانغ سنغ هونغ كونغ المتداول', 'SAB Invest Hang Seng Hong Kong ETF', { region: 'EM' }),
  etf('9412', 'البلاد إم إس سي آي للأسهم السعودية المتداول', 'Albilad MSCI Saudi Equity ETF'),
  etf('9413', 'الراجحي إم إس سي آي المتداول للأسهم السعودية', 'Al Rajhi MSCI Saudi Equity ETF', { shariah: true }),
  etf('9414', 'الراجحي إم إس سي آي المتداول للأسهم السعودية للتوزيعات', 'Al Rajhi MSCI Saudi Equity Dividend ETF', { shariah: true }),
  reit('4330', 'الرياض ريت', 'Riyad REIT'),
  reit('4331', 'الجزيرة ريت', 'Aljazira REIT'),
  reit('4332', 'جدوى ريت الحرمين', 'Jadwa REIT Al Haramain'),
  reit('4333', 'تعليم ريت', 'Taleem REIT'),
  reit('4334', 'المعذر ريت', 'Al Maather REIT'),
  reit('4335', 'مشاركة ريت', 'Musharaka REIT'),
  reit('4336', 'ملكية عقارات الخليج ريت', 'Mulkia Gulf Real Estate REIT'),
  reit('4337', 'العزيزية ريت', 'Al Aziziah REIT'),
  reit('4338', 'الأهلي ريت 1', 'AlAhli REIT 1'),
  reit('4339', 'دراية ريت', 'Derayah REIT'),
  reit('4340', 'الراجحي ريت', 'Al Rajhi REIT'),
  reit('4342', 'جدوى ريت السعودية', 'Jadwa REIT Saudi'),
  reit('4344', 'سدكو كابيتال ريت', 'SEDCO Capital REIT'),
  reit('4345', 'الإنماء ريت للتجزئة', 'Alinma Retail REIT'),
  reit('4346', 'ميفك ريت', 'MEFIC REIT'),
  reit('4347', 'بنيان ريت', 'Bonyan REIT'),
  reit('4348', 'الخبير ريت', 'Alkhabeer REIT'),
  reit('4349', 'الإنماء ريت للفندقة', 'Alinma Hospitality REIT'),
  reit('4350', 'الاستثمار ريت المتنوع', 'Alistithmar AREIC Diversified REIT'),
  etf('4700', 'الخبير للدخل المتنوع المتداول', 'Al Khabeer Diversified Income Traded Fund', pending),
  etf('4702', 'الخبير للدخل المتنوع المتداول (4702)', 'Al Khabeer Diversified Income Traded Fund (4702)', pending),
  etf('4703', 'سدكو كابيتال المتداول متعدد الأصول', 'SEDCO Capital Multi Asset Traded Fund', pending),

  // Saudi mutual funds (open-ended, not listed): priced by NAV through Claude's daily update.
  // Al Rajhi Capital list taken from the manager's site on 2026-11-15; others from public fund documents.
  mf('RAJHI-SAR-LIQ', 'الراجحي المالية', 'صندوق الراجحي للادخار والسيولة بالريال السعودي', 'Al Rajhi Saving & Liquidity Fund (SAR)', { ...cash, shariah: true }),
  mf('RAJHI-USD-LIQ', 'الراجحي المالية', 'صندوق الراجحي للادخار والسيولة بالدولار الأمريكي', 'Al Rajhi Saving & Liquidity Fund (USD)', { ...cash, currency: 'USD', shariah: true }),
  mf('RAJHI-SA-EQ', 'الراجحي المالية', 'صندوق الراجحي للأسهم السعودية', 'Al Rajhi Saudi Equity Fund', { shariah: true }),
  mf('RAJHI-SMID', 'الراجحي المالية', 'صندوق الراجحي للشركات المتوسطة والصغيرة', 'Al Rajhi Mid/Small-Cap Fund', { shariah: true }),
  mf('RAJHI-LEAD', 'الراجحي المالية', 'صندوق الراجحي القيادي', 'Al Rajhi Large-Cap Fund', { shariah: true }),
  mf('RAJHI-GROW-DIV', 'الراجحي المالية', 'صندوق الراجحي للنمو والتوزيعات', 'Al Rajhi Growth & Dividends Fund', { shariah: true }),
  mf('RAJHI-PETRO', 'الراجحي المالية', 'صندوق الراجحي للبتروكيماويات', 'Al Rajhi Petrochemical Fund', { sector: 'MATERIALS', shariah: true }),
  mf('RAJHI-MATERIALS', 'الراجحي المالية', 'صندوق الراجحي لأسهم قطاع المواد الأساسية', 'Al Rajhi Materials Equity Fund', { sector: 'MATERIALS', shariah: true }),
  mf('RAJHI-HEALTH', 'الراجحي المالية', 'صندوق الراجحي السعودي لأسهم القطاع الصحي', 'Al Rajhi Saudi Healthcare Equity Fund', { sector: 'HEALTH', shariah: true }),
  mf('RAJHI-GCC', 'الراجحي المالية', 'صندوق الراجحي للأسهم الخليجية', 'Al Rajhi GCC Equity Fund', { region: 'GCC', shariah: true }),
  mf('RAJHI-ARAB', 'الراجحي المالية', 'صندوق الراجحي لأسواق الأسهم العربية', 'Al Rajhi Arab Equity Markets Fund', { region: 'GCC', shariah: true }),
  mf('RAJHI-GLOBAL', 'الراجحي المالية', 'صندوق الراجحي للأسهم العالمية', 'Al Rajhi Global Equity Fund', { region: 'GLOBAL', shariah: true }),
  mf('RAJHI-SUKUK', 'الراجحي المالية', 'صندوق الراجحي للصكوك', 'Al Rajhi Sukuk Fund', { ...sukuk, shariah: true }),
  mf('RAJHI-SUKUK-DIV', 'الراجحي المالية', 'صندوق الراجحي للصكوك للتوزيعات', 'Al Rajhi Sukuk Distribution Fund', { ...sukuk, shariah: true }),
  mf('RAJHI-CONSERV', 'الراجحي المالية', 'صندوق الراجحي المحافظ', 'Al Rajhi Conservative Fund', { ...pending, shariah: true }),
  mf('RAJHI-BALANCED', 'الراجحي المالية', 'صندوق الراجحي المتوازن', 'Al Rajhi Balanced Fund', { ...pending, shariah: true }),
  mf('RAJHI-GROWTH', 'الراجحي المالية', 'صندوق الراجحي للنمو', 'Al Rajhi Growth Fund', { ...pending, shariah: true }),
  mf('RAJHI-ACTIVE', 'الراجحي المالية', 'صندوق الراجحي النشط', 'Al Rajhi Momentum Fund', { ...pending, shariah: true }),
  mf('RAJHI-NAMA', 'الراجحي المالية', 'صندوق الراجحي للنماء', 'Al Rajhi Namaa Fund', { ...pending, shariah: true }),
  mf('RAJHI-RETURNS', 'الراجحي المالية', 'صندوق الراجحي للعوائد', 'Al Rajhi Awaeed Fund', { ...cash, shariah: true }),
  mf('RAJHI-MONTHLY', 'الراجحي المالية', 'صندوق الراجحي للتوزيعات الشهرية', 'Al Rajhi Monthly Distribution Fund', { ...pending, shariah: true }),
  mf('RAJHI-MONTHLY-2', 'الراجحي المالية', 'صندوق الراجحي للتوزيعات الشهرية 2', 'Al Rajhi Monthly Distribution Fund 2', { ...pending, shariah: true }),
  mf('RAJHI-MONTHLY-3', 'الراجحي المالية', 'صندوق الراجحي للتوزيعات الشهرية 3', 'Al Rajhi Monthly Distribution Fund 3', { ...pending, shariah: true }),
  mf('RAJHI-RE-MONTHLY', 'الراجحي المالية', 'صندوق الراجحي العقاري للتوزيعات الشهرية', 'Al Rajhi Real Estate Monthly Distribution Fund', { assetClass: 'REAL_ESTATE', sector: 'REAL_ESTATE', shariah: true }),
  mf('RAJHI-FREESTYLE', 'الراجحي المالية', 'صندوق الراجحي المرن للأسهم السعودية', 'Al Rajhi Freestyle Saudi Equity Fund', { shariah: true }),
  mf('RAJHI-MSCI-MF', 'الراجحي المالية', 'صندوق الراجحي إم إس سي آي لمؤشر الأسهم السعودية متعدد العوامل', 'Al Rajhi MSCI Index Fund (multi-factor)', { shariah: true }),
  mf('RAJHI-INDEX-INCL', 'الراجحي المالية', 'صندوق الراجحي للإنضمام للمؤشرات', 'Al Rajhi Inclusion Fund', { shariah: true }),
  mf('SNB-SAR-TRADE', 'الأهلي المالية', 'صندوق الأهلي للمتاجرة بالريال السعودي', 'SNB Capital Saudi Riyal Trade Fund', { ...cash, shariah: true }),
  mf('SNB-SA-TRADE-EQ', 'الأهلي المالية', 'صندوق الأهلي للمتاجرة بالأسهم السعودية', 'SNB Capital Saudi Trading Equity Fund', { shariah: true }),
  mf('SNB-SMID', 'الأهلي المالية', 'صندوق الأهلي لأسهم الشركات الصغيرة والمتوسطة', 'SNB Capital Saudi Small & Mid Cap Equity Fund'),
  mf('SNB-GLOBAL', 'الأهلي المالية', 'صندوق الأهلي للأسهم العالمية', 'SNB Capital Global Equity Fund', { region: 'GLOBAL', shariah: true }),
  mf('SNB-RAED', 'الأهلي المالية', 'صندوق الأهلي الرائد للأسهم السعودية', 'SNB Capital Al Raed Saudi Equity Fund'),
  mf('SNB-ATAA', 'الأهلي المالية', 'صندوق الأهلي العطاء للأسهم السعودية', 'SNB Capital Al Ataa Saudi Equity Fund'),
  mf('SNB-MATN', 'الأهلي المالية', 'صندوق الأهلي المتن للأسهم السعودية', 'SNB Capital Al Matn Saudi Equity Fund'),
  mf('RIYAD-SAR-TRADE', 'الرياض المالية', 'صندوق الرياض للمتاجرة بالريال', 'Riyad SAR Trade Fund', cash),
  mf('RIYAD-SAR-DIV-TRADE', 'الرياض المالية', 'صندوق الرياض للمتاجرة المتنوع بالريال', 'Riyad SAR Diversified Trade Fund', cash),
  mf('RIYAD-USD-DIV-TRADE', 'الرياض المالية', 'صندوق الرياض للمتاجرة المتنوع بالدولار', 'Riyad USD Diversified Trade Fund', { ...cash, currency: 'USD' }),
  mf('RIYAD-SA-EQ', 'الرياض المالية', 'صندوق الرياض للأسهم السعودية', 'Riyad Saudi Equity Fund'),
  mf('RIYAD-LEAD', 'الرياض المالية', 'صندوق الرياض للأسهم القيادية', 'Riyad Blue Chip Equity Fund'),
  mf('ALINMA-SA-EQ', 'الإنماء للاستثمار', 'صندوق الإنماء للأسهم السعودية', 'Alinma Saudi Equity Fund', { shariah: true }),
  mf('ALINMA-FLEX', 'الإنماء للاستثمار', 'صندوق الإنماء المرن للأسهم السعودية', 'Alinma Free Style Saudi Equity Fund', { shariah: true }),
  mf('ALINMA-SAR-LIQ', 'الإنماء للاستثمار', 'صندوق الإنماء للسيولة بالريال السعودي', 'Alinma SAR Liquidity Fund', { ...cash, shariah: true }),
  mf('ALINMA-DIVERSIFIED', 'الإنماء للاستثمار', 'صندوق الإنماء المتنوع', 'Alinma Diversified Fund', { ...pending, shariah: true }),
  mf('ALBILAD-SAR-MURABAHA', 'البلاد المالية', 'صندوق البلاد للمرابحة بالريال السعودي', 'Albilad SAR Murabaha Fund', { ...cash, shariah: true }),

  // Irish-domiciled UCITS (London listings)
  gl('ISDU.L', 'iShares أمريكا الإسلامي (أيرلندي)', 'iShares MSCI USA Islamic UCITS', { domicile: 'IE', shariah: true }),
  gl('ISDW.L', 'iShares العالم الإسلامي (أيرلندي)', 'iShares MSCI World Islamic UCITS', { domicile: 'IE', shariah: true, region: 'GLOBAL' }),
  gl('ISDE.L', 'iShares الأسواق الناشئة الإسلامي (أيرلندي)', 'iShares MSCI EM Islamic UCITS', { domicile: 'IE', shariah: true, region: 'EM' }),
  gl('CSPX.L', 'iShares S&P 500 تراكمي (أيرلندي)', 'iShares Core S&P 500 UCITS Acc', { domicile: 'IE' }),
  gl('VUAA.L', 'Vanguard S&P 500 تراكمي (أيرلندي)', 'Vanguard S&P 500 UCITS Acc', { domicile: 'IE' }),
  gl('VWRA.L', 'Vanguard كل العالم تراكمي (أيرلندي)', 'Vanguard FTSE All-World UCITS Acc', { domicile: 'IE', region: 'GLOBAL' }),
  gl('IWDA.L', 'iShares العالم المتقدم تراكمي (أيرلندي)', 'iShares Core MSCI World UCITS Acc', { domicile: 'IE', region: 'GLOBAL' }),

  // US-listed funds
  gl('SPUS', 'SP Funds S&P 500 الشرعي', 'SP Funds S&P 500 Sharia ETF', { shariah: true }),
  gl('HLAL', 'Wahed FTSE USA الشرعي', 'Wahed FTSE USA Shariah ETF', { shariah: true }),
  gl('SPSK', 'SP Funds صكوك داو جونز', 'SP Funds Dow Jones Global Sukuk ETF', { shariah: true, assetClass: 'FIXED_INCOME', region: 'GLOBAL', sector: 'NA' }),
  gl('VOO', 'Vanguard S&P 500', 'Vanguard S&P 500 ETF'),
  gl('SPY', 'SPDR S&P 500', 'SPDR S&P 500 ETF'),
  gl('QQQ', 'Invesco ناسداك 100', 'Invesco QQQ (Nasdaq 100)', { sector: 'TECH' }),
  gl('DIA', 'SPDR داو جونز', 'SPDR Dow Jones ETF'),
  gl('VTI', 'Vanguard كامل السوق الأمريكي', 'Vanguard Total US Market ETF'),
  gl('VT', 'Vanguard كل العالم', 'Vanguard Total World ETF', { region: 'GLOBAL' }),
  gl('ACWI', 'iShares MSCI ACWI العالمي', 'iShares MSCI ACWI ETF', { region: 'GLOBAL' }),
  gl('VXUS', 'Vanguard العالم عدا أمريكا', 'Vanguard Total International ETF', { region: 'DEV' }),
  gl('SCHD', 'Schwab للتوزيعات الأمريكية', 'Schwab US Dividend Equity ETF'),

  // US stocks
  gl('AAPL', 'أبل', 'Apple', { isFund: false, sector: 'TECH' }),
  gl('MSFT', 'مايكروسوفت', 'Microsoft', { isFund: false, sector: 'TECH' }),
  gl('NVDA', 'إنفيديا', 'Nvidia', { isFund: false, sector: 'TECH' }),
  gl('GOOGL', 'ألفابت (قوقل)', 'Alphabet', { isFund: false, sector: 'TECH' }),
  gl('AMZN', 'أمازون', 'Amazon', { isFund: false, sector: 'CONSUMER' }),
  gl('TSLA', 'تسلا', 'Tesla', { isFund: false, sector: 'CONSUMER' }),

  // Gold funds
  { symbol: 'GLD', ar: 'SPDR للذهب', en: 'SPDR Gold Shares', kind: 'GOLD', assetClass: 'GOLD', region: 'NONE', sector: 'NA', currency: 'USD', isFund: true, domicile: 'US' },
  { symbol: 'IAU', ar: 'iShares للذهب', en: 'iShares Gold Trust', kind: 'GOLD', assetClass: 'GOLD', region: 'NONE', sector: 'NA', currency: 'USD', isFund: true, domicile: 'US' },
  { symbol: 'IGLN.L', ar: 'iShares ذهب فعلي (أيرلندي)', en: 'iShares Physical Gold ETC', kind: 'GOLD', assetClass: 'GOLD', region: 'NONE', sector: 'NA', currency: 'USD', isFund: true, domicile: 'IE' },

  // Crypto
  { symbol: 'BTC-USD', ar: 'بتكوين', en: 'Bitcoin', kind: 'CRYPTO', assetClass: 'CRYPTO', region: 'NONE', sector: 'NA', currency: 'USD', isFund: false, domicile: '' },
  { symbol: 'ETH-USD', ar: 'إيثيريوم', en: 'Ethereum', kind: 'CRYPTO', assetClass: 'CRYPTO', region: 'NONE', sector: 'NA', currency: 'USD', isFund: false, domicile: '' },
]

export function searchCatalog(kind: AssetKindId, query: string, shariahFirst: boolean, group?: SaudiGroup): CatalogItem[] {
  const q = query.trim().toLowerCase()
  const items = CATALOG.filter((c) => c.kind === kind && (!group || c.group === group)).filter(
    (c) => !q || c.symbol.toLowerCase().includes(q) || c.ar.includes(query.trim()) || c.en.toLowerCase().includes(q) || (c.manager ?? '').includes(query.trim()),
  )
  // Stable sort keeps the hand-ordered list; Shariah-labelled funds float up when asked.
  return shariahFirst ? [...items].sort((a, b) => Number(!!b.shariah) - Number(!!a.shariah)) : items
}

export const KARATS = [24, 22, 21, 18]

/**
 * The catalogue fund a hand-typed name most likely refers to, or null. Used to offer linking a
 * manually valued asset to its published price. A generic name («صندوق الأسهم العالمية») must not
 * match: the name has to carry the manager's own name plus one more word, or share three words;
 * in both cases every word of the shorter name is inside the longer one. Ties go to the fund in
 * the asset's own currency.
 */
export function findCatalogFund(name: string, currency = 'SAR'): CatalogItem | null {
  const words = tokens(name)
  let best: { item: CatalogItem; score: number } | null = null
  for (const item of CATALOG) {
    if (!item.isFund) continue
    const brand = item.manager ? tokens(item.manager)[0] : null
    for (const label of [item.ar, item.en]) {
      const m = similarity(name, label)
      if (!m.contained) continue
      const branded = !!brand && words.includes(brand) && m.shared >= 2
      if (!branded && !(m.shared >= 3 && m.jaccard >= 0.6)) continue
      const score = m.jaccard + (item.currency === currency ? 0.05 : 0)
      if (!best || score > best.score) best = { item, score }
    }
  }
  return best?.item ?? null
}
