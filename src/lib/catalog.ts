import type { AccountKind, AssetClass, Pricing, Region } from './types.ts'

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
  { id: 'SA_STOCK', ar: 'سهم سعودي', en: 'Saudi stock', hintAr: 'تداول — سعر مباشر', hintEn: 'Tadawul — live price', icon: 'TrendingUp', assetClass: 'EQUITY', region: 'SA', sector: 'NA', currency: 'SAR', pricing: 'live', isFund: false, accountKind: 'BROKERAGE' },
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
}

const sa = (code: string, ar: string, en: string, sector: string, extra: Partial<CatalogItem> = {}): CatalogItem => ({
  symbol: `${code}.SR`, ar, en, kind: 'SA_STOCK', assetClass: 'EQUITY', region: 'SA', sector, currency: 'SAR', isFund: false, domicile: 'SA', ...extra,
})
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
  sa('4330', 'الرياض ريت', 'Riyad REIT', 'REAL_ESTATE', { assetClass: 'REAL_ESTATE', isFund: true }),
  sa('4340', 'الراجحي ريت', 'Al Rajhi REIT', 'REAL_ESTATE', { assetClass: 'REAL_ESTATE', isFund: true }),
  sa('4342', 'جدوى ريت السعودية', 'Jadwa REIT Saudi', 'REAL_ESTATE', { assetClass: 'REAL_ESTATE', isFund: true }),

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

export function searchCatalog(kind: AssetKindId, query: string, shariahFirst: boolean): CatalogItem[] {
  const q = query.trim().toLowerCase()
  const items = CATALOG.filter((c) => c.kind === kind).filter(
    (c) => !q || c.symbol.toLowerCase().includes(q) || c.ar.includes(query.trim()) || c.en.toLowerCase().includes(q),
  )
  // Stable sort keeps the hand-ordered list; Shariah-labelled funds float up when asked.
  return shariahFirst ? [...items].sort((a, b) => Number(!!b.shariah) - Number(!!a.shariah)) : items
}

export const KARATS = [24, 22, 21, 18]
