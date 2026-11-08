// Researched instrument data (owned by the research agent). Every figure is sourced in CATALOG-SOURCES.md; unknown = null.
// Researched 2026-11-08. Generic Shariah-compliant universe for a Saudi-based investor; nothing here is personal.
// Conventions: Yahoo symbols — LSE «TICKER.L» (always the USD line), Euronext Amsterdam «.AS», Tadawul «CODE.SR».
// `ter`: the published TER when there is one, otherwise the published management fee (a floor of the true cost; see the md).
// `countries`/`sectors`: look-through from the latest fact sheet or index sheet, top countries ≥ 1%, the rest in 'XX'.
import type { AssetClass, CatalogItem, Platform } from './catalog'
import { ZAKAT_GUIDE } from './zakatGuide.data'

/** The class default zakat treatment (kept in step with ZAKAT_GUIDE). */
const zk = (cls: AssetClass, note: string | null = null): CatalogItem['zakat'] => ({ method: ZAKAT_GUIDE[cls].method, ratio: ZAKAT_GUIDE[cls].ratio, note })

/** Saudi brokers that trade Tadawul-listed securities (ETFs, REITs, sukuk). */
const TADAWUL: Platform[] = ['derayah', 'alrajhi', 'alinma', 'snb', 'albilad', 'sahm']
/** Platforms with US market access (NYSE Arca / Nasdaq listings). */
const US_LISTED: Platform[] = ['derayah_global', 'sahm', 'ibkr']
/** London / Amsterdam UCITS lines: only IBKR is confirmed; Derayah Global's coverage of these exchanges is unverified. */
const EU_LISTED: Platform[] = ['ibkr']
const FUND_ZAKAT_NOTE = 'ينشر مدير الصندوق «الزكاة لكل وحدة» سنوياً'

export const CATALOG: CatalogItem[] = [
  // ───────────── cash ─────────────
  {
    id: 'cash', name: 'نقد في الحساب', name_en: 'Cash (bank or broker account)', class: 'cash', layer: 'safety',
    source: 'manual', symbol: null, fund_id: null, currency: 'SAR', exchange: null, platforms: ['bank'],
    ter: null, distribution: null, pay_freq: null, duration_years: null, liquidity: 'daily', min_investment: null,
    shariah: 'حساب جارٍ بلا فوائد', countries: { SA: 100 }, sectors: { cash: 100 }, as_of: null, source_url: null, inception: null,
    zakat: zk('cash'), note: 'رصيد جاهز للصرف في أي وقت، بلا عائد يُذكر',
  },

  // ───────────── money market (Saudi riyal) ─────────────
  {
    id: 'alrajhi-sar-mm', name: 'صندوق الراجحي للادخار والسيولة بالريال السعودي', name_en: 'Al Rajhi Saving and Liquidity Fund – SAR',
    class: 'money_market', layer: 'safety', source: 'nav', symbol: null, fund_id: '1888', currency: 'SAR', exchange: null,
    platforms: ['alrajhi'], ter: 0.41, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: null,
    shariah: 'مرابحات سلع قصيرة الأجل متوافقة مع الشريعة (الراجحي المالية)', countries: null, sectors: null, as_of: '2025-12-31',
    source_url: 'https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/PDFs/2026/fund-annual-report2026/09-Al-Rajhi-Commodity-Murabaha-Fund---SAR---Annual-Report-Final-2025.pdf',
    inception: '2000-05-31', zakat: zk('money_market'),
    note: 'صندوق النقد بالريال لدى الراجحي المالية؛ صافي أصوله نحو 3 مليارات ريال وعائده 4.58% في 2025',
  },
  {
    id: 'snb-sar-trade', name: 'صندوق الأهلي للمتاجرة بالريال السعودي', name_en: 'SNB Capital Saudi Riyal Trade Fund',
    class: 'money_market', layer: 'safety', source: 'nav', symbol: null, fund_id: '2033', currency: 'SAR', exchange: null,
    platforms: ['snb'], ter: 0.65, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: 5000,
    shariah: 'صندوق أسواق نقد متوافق مع الشريعة (مرابحة ووكالة وصكوك قصيرة)', countries: null, sectors: null, as_of: null,
    source_url: 'https://snbcapital.com/w/snb-capital-saudi-riyal-trade-fund', inception: '1995-04-03', zakat: zk('money_market'),
    note: 'من أقدم صناديق النقد بالريال (منذ 1995)؛ رسوم الإدارة 0.65% والحد الأدنى 5,000 ريال',
  },
  {
    id: 'alinma-sar-liquidity', name: 'صندوق الإنماء للسيولة بالريال السعودي', name_en: 'Alinma Saudi Riyal Liquidity Fund',
    class: 'money_market', layer: 'safety', source: 'nav', symbol: null, fund_id: '1875', currency: 'SAR', exchange: null,
    platforms: ['alinma'], ter: null, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: 1,
    shariah: 'معتمد من الهيئة الشرعية لمصرف الإنماء', countries: null, sectors: null, as_of: '2026-06-30',
    source_url: 'https://alinmacapital.com/-/media/Project/Alinma/PDF/July-2026/Factsheet-JUN2026/2026-06-JUN-LIQUIDITY-Fund-Factsheet-EN.pdf',
    inception: '2011-01-01', zakat: zk('money_market', FUND_ZAKAT_NOTE),
    note: 'أصوله نحو 5.5 مليار ريال (يونيو 2026)؛ رسومه 20% من الأرباح بدل نسبة ثابتة',
  },
  {
    id: 'albilad-sar-murabaha', name: 'صندوق البلاد للمرابحة بالريال السعودي', name_en: 'Albilad SAR Murabaha Fund',
    class: 'money_market', layer: 'safety', source: 'nav', symbol: null, fund_id: '1862', currency: 'SAR', exchange: null,
    platforms: ['albilad'], ter: null, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: null,
    shariah: 'استثمار مباشر في مرابحات متوافقة مع الشريعة (البلاد المالية)', countries: null, sectors: null, as_of: null,
    source_url: 'https://www.mubasher.info/countries/SA/funds/1862/', inception: '2006-01-01', zakat: zk('money_market'),
    note: 'صندوق مرابحة بالريال من البلاد المالية؛ لم نجد نشرة حديثة برسومه وحجمه',
  },

  // ───────────── government savings sukuk ─────────────
  {
    id: 'sah', name: 'صكوك «صح» الادخارية', name_en: 'Sah – Saudi Government Savings Sukuk', class: 'savings_sukuk', layer: 'safety',
    source: 'manual', symbol: null, fund_id: null, currency: 'SAR', exchange: null, platforms: ['mof', 'alrajhi', 'snb', 'alinma', 'other'],
    ter: 0, distribution: 'dist', pay_freq: 'annual', duration_years: 1, liquidity: 'term', min_investment: 1000,
    shariah: 'صكوك حكومية بالريال يصدرها المركز الوطني لإدارة الدين ضمن برنامج الصكوك المحلية', countries: { SA: 100 }, sectors: { sovereign: 100 },
    as_of: '2026-09-06', source_url: 'https://www.arabnews.pk/business/saudi-arabia-opens-september-sah-sukuk-with-48-annual-return-3000428',
    inception: '2024-02-04', zakat: zk('savings_sukuk'),
    note: 'للسعوديين من 18 سنة: مدة سنة بعائد ثابت يُعلن مع كل إصدار شهري ويُصرف عند الاستحقاق، من 1,000 حتى 200,000 ريال',
  },

  // ───────────── bank murabaha ─────────────
  {
    id: 'bank-murabaha', name: 'وديعة مرابحة بنكية', name_en: 'Bank murabaha / Islamic time deposit (generic)', class: 'murabaha', layer: 'safety',
    source: 'manual', symbol: null, fund_id: null, currency: 'SAR', exchange: null, platforms: ['bank'],
    ter: null, distribution: null, pay_freq: null, duration_years: null, liquidity: 'term', min_investment: null,
    shariah: 'مرابحة سلع معتمدة من الهيئة الشرعية للبنك', countries: { SA: 100 }, sectors: { cash: 100 }, as_of: null, source_url: null, inception: null,
    zakat: zk('murabaha'), note: 'ربح متفق عليه لمدة محددة؛ تختلف المدد والحد الأدنى وشروط الكسر المبكر من بنك لآخر',
  },

  // ───────────── sukuk in riyals ─────────────
  {
    id: 'albilad-sukuk-etf', name: 'صندوق البلاد المتداول للصكوك السيادية السعودية', name_en: 'Albilad Saudi Sovereign Sukuk ETF',
    class: 'sukuk_sar', layer: 'income', source: 'yahoo', symbol: '9403.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul',
    platforms: TADAWUL, ter: 0.3, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر البلاد أيديل ريتينجز للصكوك السيادية السعودية المحلية + لجنة شرعية للصندوق', countries: { SA: 100 }, sectors: { sovereign: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/12047_1561_2026-07-14_12-10-36_en.pdf',
    inception: '2019-08-21', zakat: zk('sukuk_sar'),
    note: 'صكوك حكومية سعودية بالريال بكل الآجال، بتوزيع شهري؛ حجمه صغير (نحو 65 مليون ريال)',
  },
  {
    id: 'alinma-sukuk-etf', name: 'صندوق الإنماء للصكوك الحكومية السعودية المتداول (قصيرة الأجل)', name_en: 'Alinma Saudi Government Sukuk ETF – Short Maturity',
    class: 'sukuk_sar', layer: 'income', source: 'yahoo', symbol: '9404.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul',
    platforms: TADAWUL, ter: 0.25, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صكوك حكومية سعودية، معتمد من الهيئة الشرعية لمصرف الإنماء', countries: { SA: 100 }, sectors: { sovereign: 100 },
    as_of: '2026-03-31', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/1581_0_2026-04-14_14-18-24_En.pdf',
    inception: '2020-02-24', zakat: zk('sukuk_sar', FUND_ZAKAT_NOTE),
    note: 'صكوك حكومية سعودية قصيرة الأجل (حتى 5 سنوات عند الإدراج)؛ نحو 430 مليون ريال، ووزّع مرتين في السنة مؤخراً',
  },
  {
    id: 'alrajhi-sukuk-fund', name: 'صندوق الراجحي للصكوك', name_en: 'Al Rajhi Sukuk Fund',
    class: 'sukuk_sar', layer: 'income', source: 'nav', symbol: null, fund_id: '4902', currency: 'SAR', exchange: null,
    platforms: ['alrajhi'], ter: 0.5, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: 100000,
    shariah: 'صكوك متوافقة مع الشريعة (الراجحي المالية)', countries: null, sectors: null, as_of: '2024-09-30',
    source_url: 'https://alrajhi-capital.com/-/media/Feature/AlRajhiCapital/PDFs/Fact-Sheets/October-2024/Al-Rajhi-Sukuk-Fund.pdf',
    inception: '2014-09-14', zakat: zk('sukuk_sar'),
    note: 'صندوق صكوك مُدار بحد أدنى 100,000 ريال ورسوم اشتراك حتى 1%؛ مؤشره الاسترشادي سوفر 3 أشهر',
  },
  {
    id: 'snb-diversified-sar', name: 'صندوق الأهلي المتنوع بالريال السعودي', name_en: 'SNB Capital Diversified Saudi Riyal Fund',
    class: 'sukuk_sar', layer: 'income', source: 'nav', symbol: null, fund_id: '2013', currency: 'SAR', exchange: null,
    platforms: ['snb'], ter: null, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: null,
    shariah: 'أدوات مالية متوافقة مع الشريعة قصيرة ومتوسطة وطويلة الأجل (الأهلي المالية)', countries: null, sectors: null, as_of: null,
    source_url: 'https://english.mubasher.info/countries/sa/funds/2013/', inception: '2003-10-01', zakat: zk('sukuk_sar'),
    note: 'دخل ثابت بالريال بآجال أطول من صناديق النقد فيتذبذب أكثر؛ لم نجد نشرة حديثة برسومه',
  },
  {
    id: 'sa-gov-sukuk', name: 'صكوك حكومية سعودية مدرجة في تداول', name_en: 'Saudi Government SAR Sukuk (direct, Tadawul-listed)',
    class: 'sukuk_sar', layer: 'income', source: 'manual', symbol: null, fund_id: null, currency: 'SAR', exchange: 'Tadawul',
    platforms: ['other'], ter: null, distribution: 'dist', pay_freq: null, duration_years: null, liquidity: 'T+2', min_investment: 1000,
    shariah: 'صكوك سيادية بالريال ضمن برنامج الصكوك المحلية للحكومة السعودية', countries: { SA: 100 }, sectors: { sovereign: 100 },
    as_of: '2026-07-05', source_url: 'https://www.arabnews.com/node/2649725/business-economy', inception: null, zakat: zk('sukuk_sar'),
    note: 'تُشترى من سوق الصكوك في تداول بقيمة اسمية 1,000 ريال؛ شرائح يونيو 2026 تستحق بين 2029 و2041. تحقق من سيولة الإصدار ومن دعم وسيطك له',
  },

  // ───────────── sukuk in dollars ─────────────
  {
    id: 'spsk', name: 'صندوق إس بي فندز للصكوك العالمية (داو جونز)', name_en: 'SP Funds Dow Jones Global Sukuk ETF',
    class: 'sukuk_usd', layer: 'income', source: 'yahoo', symbol: 'SPSK', fund_id: null, currency: 'USD', exchange: 'NYSE Arca',
    platforms: US_LISTED, ter: 0.5, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر داو جونز للصكوك + شهادة اعتماد شرعي وتقرير تدقيق شرعي (ضوابط أيوفي)', countries: null, sectors: null,
    as_of: '2026-11-05', source_url: 'https://www.sp-funds.com/spsk/', inception: '2019-12-27', zakat: zk('sukuk_usd'),
    note: 'صكوك دولارية عالمية مدرجة في أمريكا، بتوزيع شهري؛ حجمه نحو 490 مليون دولار',
  },
  {
    id: 'hsbc-sukuk', name: 'صندوق إتش إس بي سي للصكوك العالمية (UCITS)', name_en: 'HSBC Global Sukuk UCITS ETF (USD, Dist)',
    class: 'sukuk_usd', layer: 'income', source: 'yahoo', symbol: 'HSKD.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.37, distribution: 'dist', pay_freq: 'semiannual', duration_years: 4.41, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر فوتسي أيديل ريتينجز للصكوك + لجنة شرعية تجيز الصكوك المستثمر فيها',
    countries: { SA: 49.92, AE: 18.89, ID: 10.93, OM: 2.97, MY: 2.95, QA: 2.14, XX: 12.2 },
    sectors: { sovereign: 37.3, quasi_sovereign: 42.94, corporate: 19.63, cash: 0.13 },
    as_of: '2026-09-30', source_url: 'https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/ie0009u8ibu8/gb/en/factsheet',
    inception: '2025-01-13', zakat: zk('sukuk_usd'),
    note: 'خط الدولار الموزِّع في لندن (نسخته المجمِّعة HBKU.L منذ 2023)؛ نحو نصفه صكوك سعودية',
  },
  {
    id: 'skuk', name: 'صندوق آي شيرز للصكوك الدولارية (UCITS)', name_en: 'iShares $ Sukuk UCITS ETF (USD, Dist)',
    class: 'sukuk_usd', layer: 'income', source: 'yahoo', symbol: 'SKUK.AS', fund_id: null, currency: 'USD', exchange: 'Euronext Amsterdam',
    platforms: EU_LISTED, ter: 0.4, distribution: 'dist', pay_freq: 'quarterly', duration_years: 4.05, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر جي بي مورغان للصكوك في الأسواق الناشئة (صكوك متوافقة مع معايير أيوفي)؛ النشرة لا تذكر شهادة شرعية للصندوق نفسه',
    countries: null, sectors: null, as_of: '2026-10-31',
    source_url: 'https://blackrock.com/uk/literature/fact-sheet/skuk-ishares-sukuk-ucits-etf-fund-fact-sheet-en-gb.pdf',
    inception: '2024-01-17', zakat: zk('sukuk_usd'),
    note: 'غير مدرج في لندن: يتداول بالدولار في أمستردام وسويسرا؛ مدته الفعلية نحو 4 سنوات',
  },

  // ───────────── global equities ─────────────
  {
    id: 'iswd', name: 'صندوق آي شيرز للأسهم العالمية الإسلامية (MSCI World Islamic)', name_en: 'iShares MSCI World Islamic UCITS ETF (USD, Dist)',
    class: 'equity_global', layer: 'growth', source: 'yahoo', symbol: 'ISDW.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.3, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI World Islamic (فحص شرعي من MSCI)',
    countries: { US: 68.36, JP: 6.65, GB: 4.22, FR: 3.73, CA: 3.71, XX: 13.33 },
    sectors: { tech: 42.43, energy: 13.1, industrials: 12.53, health: 11.07, materials: 8.52, consumer_disc: 7.23, consumer_staples: 3.31, real_estate: 0.85, utilities: 0.82, communication: 0.15 },
    as_of: '2026-10-30', source_url: 'https://www.ishares.com/uk/professional/en/literature/fact-sheet/iswd-ishares-msci-world-islamic-ucits-etf-fund-fact-sheet-en-gb.pdf',
    inception: '2007-12-07', zakat: zk('equity_global'),
    note: 'أسهم الدول المتقدمة المتوافقة (نحو 390 شركة)؛ خط الدولار ISDW، أما ISWD فخط الجنيه',
  },
  {
    id: 'hiwo', name: 'صندوق إتش إس بي سي للأسهم العالمية الإسلامية (MSCI World Islamic Screened)', name_en: 'HSBC MSCI World Islamic Screened UCITS ETF (USD, Acc)',
    class: 'equity_global', layer: 'growth', source: 'yahoo', symbol: 'HIWO.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.3, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI World Islamic Universal Screened Select + لجنة شرعية تصدر شهادة سنوية',
    countries: { US: 65.08, JP: 8.96, FR: 4.47, NL: 4.45, GB: 3.87, DE: 2.44, CA: 2.39, CH: 2.13, SE: 1.61, XX: 4.61 },
    sectors: { tech: 54.06, industrials: 13.09, health: 10.3, materials: 7.85, energy: 6.61, consumer_disc: 5.44, consumer_staples: 1.47, utilities: 0.48, communication: 0.23, real_estate: 0.17, cash: 0.31 },
    as_of: '2026-09-30', source_url: 'https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/ie000x9fti22/gb/en/factsheet',
    inception: '2022-11-30', zakat: zk('equity_global'),
    note: 'خط الدولار HIWO (أما HIWS فخط الجنيه)؛ يعيد استثمار الأرباح، وتركيزه على التقنية أعلى (54%)',
  },
  {
    id: 'umma', name: 'صندوق واحد للأسهم الإسلامية العالمية خارج أمريكا', name_en: 'Wahed Dow Jones Islamic World ETF',
    class: 'equity_global', layer: 'growth', source: 'yahoo', symbol: 'UMMA', fund_id: null, currency: 'USD', exchange: 'Nasdaq',
    platforms: US_LISTED, ter: 0.65, distribution: 'dist', pay_freq: 'quarterly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'أسهم عالمية خارج أمريكا مفحوصة شرعياً (واحد للاستثمار)',
    countries: { JP: 16, CA: 13, KR: 11.7, CH: 9.3, DE: 8.2, GB: 7.6, FR: 6, TW: 5.4, NL: 4.8, AU: 4, XX: 14 },
    sectors: null, as_of: null, source_url: 'https://etfrc.com/UMMA', inception: '2022-01-07', zakat: zk('equity_global'),
    note: 'لا يشمل الأسهم الأمريكية، فهو مكمّل لصندوق أمريكي مثل SPUS أو HLAL؛ رسومه أعلى (0.65%)',
  },

  // ───────────── US equities ─────────────
  {
    id: 'spus', name: 'صندوق إس بي فندز لأسهم إس آند بي 500 الشرعية', name_en: 'SP Funds S&P 500 Sharia Industry Exclusions ETF',
    class: 'equity_us', layer: 'growth', source: 'yahoo', symbol: 'SPUS', fund_id: null, currency: 'USD', exchange: 'NYSE Arca',
    platforms: US_LISTED, ter: 0.45, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر S&P 500 Sharia Industry Exclusions + شهادة اعتماد شرعي (ضوابط أيوفي)',
    countries: { US: 99.43, XX: 0.57 },
    sectors: { tech: 59.5, health: 13.1, industrials: 6.8, consumer_disc: 6.6, communication: 4.3, energy: 3.3, consumer_staples: 2.8, materials: 2.7, real_estate: 0.8, utilities: 0.2 },
    as_of: '2026-03-30', source_url: 'https://www.sp-funds.com/spus/', inception: '2019-12-17', zakat: zk('equity_us'),
    note: 'نحو 220 شركة أمريكية متوافقة من مؤشر S&P 500؛ حجمه نحو 3.2 مليار دولار',
  },
  {
    id: 'hlal', name: 'صندوق واحد لأسهم فوتسي الأمريكية الشرعية', name_en: 'Wahed FTSE USA Shariah ETF',
    class: 'equity_us', layer: 'growth', source: 'yahoo', symbol: 'HLAL', fund_id: null, currency: 'USD', exchange: 'Nasdaq',
    platforms: US_LISTED, ter: 0.5, distribution: 'dist', pay_freq: 'quarterly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر FTSE USA Shariah', countries: { US: 94.6, IE: 1.6, XX: 3.8 }, sectors: null, as_of: null,
    source_url: 'https://etfrc.com/HLAL', inception: '2019-07-15', zakat: zk('equity_us'),
    note: 'نحو 200 شركة أمريكية متوافقة، بتوزيع ربع سنوي',
  },
  {
    id: 'isus', name: 'صندوق آي شيرز للأسهم الأمريكية الإسلامية (MSCI USA Islamic)', name_en: 'iShares MSCI USA Islamic UCITS ETF (USD, Dist)',
    class: 'equity_us', layer: 'growth', source: 'yahoo', symbol: 'ISDU.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.3, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI USA Islamic (فحص شرعي من MSCI)',
    countries: { US: 95.02, IE: 2.97, GB: 1.49, XX: 0.52 },
    sectors: { tech: 50.1, energy: 12.62, health: 10.56, industrials: 8.53, consumer_disc: 8.49, materials: 4.52, consumer_staples: 3.6, real_estate: 1.08, utilities: 0.49 },
    as_of: '2026-10-30', source_url: 'https://www.ishares.com/uk/professional/en/literature/fact-sheet/isus-ishares-msci-usa-islamic-ucits-etf-fund-fact-sheet-en-gb.pdf',
    inception: '2007-12-07', zakat: zk('equity_us'),
    note: 'نحو 140 شركة أمريكية متوافقة؛ خط الدولار ISDU، أما ISUS فخط الجنيه',
  },
  {
    id: 'hiua', name: 'صندوق إتش إس بي سي للأسهم الأمريكية الإسلامية (MSCI USA Islamic Screened)', name_en: 'HSBC MSCI USA Islamic Screened UCITS ETF (USD, Acc)',
    class: 'equity_us', layer: 'growth', source: 'yahoo', symbol: 'HIUA.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.3, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI USA Islamic Universal Screened Select',
    countries: { US: 100 },
    sectors: { tech: 65.39, health: 9.77, industrials: 7.04, consumer_disc: 6.28, energy: 5.3, materials: 5.04, consumer_staples: 0.49, utilities: 0.37, real_estate: 0.13, cash: 0.18 },
    as_of: '2026-09-30', source_url: 'https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/ie000i5nv504/gb/en/factsheet',
    inception: '2022-11-17', zakat: zk('equity_us'),
    note: 'خط الدولار HIUA (أما HIUS فخط الجنيه)؛ صغير (نحو 98 مليون دولار) ومركّز في التقنية (65%)',
  },

  // ───────────── emerging-market equities ─────────────
  {
    id: 'isde', name: 'صندوق آي شيرز لأسهم الأسواق الناشئة الإسلامية (MSCI EM Islamic)', name_en: 'iShares MSCI EM Islamic UCITS ETF (USD, Dist)',
    class: 'equity_em', layer: 'growth', source: 'yahoo', symbol: 'ISDE.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.35, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI Emerging Markets Islamic (فحص شرعي من MSCI)',
    countries: { KR: 40.12, TW: 18.87, IN: 10.57, CN: 7.96, XX: 22.48 },
    sectors: { tech: 55.25, materials: 11.37, energy: 8.11, industrials: 5.8, other: 19.47 },
    as_of: '2026-09-30', source_url: 'https://www.justetf.com/en-be/etf-profile.html?isin=IE00B27YCP72',
    inception: '2007-12-07', zakat: zk('equity_em'),
    note: 'نحو 400 شركة في الأسواق الناشئة؛ كوريا وتايوان قرابة 60% منه',
  },
  {
    id: 'hiem', name: 'صندوق إتش إس بي سي لأسهم الأسواق الناشئة الإسلامية', name_en: 'HSBC MSCI Emerging Markets Islamic Screened Capped UCITS ETF (USD, Acc)',
    class: 'equity_em', layer: 'growth', source: 'yahoo', symbol: 'HIEM.L', fund_id: null, currency: 'USD', exchange: 'LSE',
    platforms: EU_LISTED, ter: 0.35, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI EM Islamic Universal Screened Select Capped',
    countries: { KR: 40.55, TW: 21.35, CN: 11.57, IN: 8.11, SA: 4.64, ZA: 3.03, MX: 2.08, BR: 2.02, PL: 1.02, XX: 5.63 },
    sectors: { tech: 58.98, materials: 10.54, industrials: 5.77, energy: 5.6, consumer_disc: 4.82, health: 4.43, financials: 4.22, consumer_staples: 2.7, utilities: 1.08, real_estate: 0.89, communication: 0.59, cash: 0.39 },
    as_of: '2026-09-30', source_url: 'https://www.assetmanagement.hsbc.co.uk/api/v1/download/document/ie0009bc6k22/gb/en/factsheet',
    inception: '2023-01-12', zakat: zk('equity_em'),
    note: 'يعيد استثمار الأرباح؛ فيه نحو 4.6% أسهم سعودية',
  },

  // ───────────── Saudi equities ─────────────
  {
    id: 'albilad-msci-sa', name: 'صندوق البلاد إم إس سي آي المتداول للأسهم السعودية', name_en: 'Albilad MSCI Saudi Equity ETF',
    class: 'equity_sa', layer: 'growth', source: 'yahoo', symbol: '9412.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul',
    platforms: TADAWUL, ter: 0.35, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI Saudi Arabia Domestic Total Market Islamic M-Series + لجنة رقابة شرعية للصندوق', countries: { SA: 100 }, sectors: null,
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/29775_8147_2026-07-14_12-47-08_en.pdf',
    inception: '2025-10-21', zakat: zk('equity_sa'),
    note: 'صندوق مؤشر للسوق السعودية المتوافقة برسوم تشمل التشغيل (0.35%)؛ يعيد استثمار التوزيعات، وبدأ في أكتوبر 2025',
  },
  {
    id: 'alrajhi-msci-sa', name: 'صندوق الراجحي إم إس سي آي المتداول للأسهم السعودية', name_en: 'Al Rajhi MSCI Saudi Equity ETF',
    class: 'equity_sa', layer: 'growth', source: 'yahoo', symbol: '9413.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul',
    platforms: TADAWUL, ter: 0.25, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر MSCI Saudi Arabia Domestic Total Market Islamic M-Series + لجنة رقابة شرعية', countries: { SA: 100 }, sectors: null,
    as_of: '2026-08-10', source_url: 'https://alrajhi-capital.sa/-/media/Feature/AlRajhiCapital/PDFs/Brochure/2026/alrajhi-MSCI-Saudi-Equity-ETF-Brochure.pdf',
    inception: '2026-08-10', zakat: zk('equity_sa'),
    note: 'المؤشر نفسه برسوم إدارة 0.25%؛ جديد (أغسطس 2026) وحجمه نحو 100 مليون ريال',
  },
  {
    id: 'alrajhi-sa-equity', name: 'صندوق الراجحي للأسهم السعودية', name_en: 'Al Rajhi Saudi Equity Fund',
    class: 'equity_sa', layer: 'growth', source: 'nav', symbol: null, fund_id: '1895', currency: 'SAR', exchange: null,
    platforms: ['alrajhi'], ter: 1.75, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: null,
    shariah: 'أسهم سعودية متوافقة مع الشريعة؛ المؤشر الاسترشادي S&P Saudi Shariah', countries: { SA: 100 }, sectors: null, as_of: null,
    source_url: 'https://alrajhi-capital.sa/asset-management/al-rajhi-saudi-equity-fund', inception: '1992-08-05', zakat: zk('equity_sa'),
    note: 'صندوق مُدار منذ 1992 برسوم إدارة 1.75% ورسوم اشتراك حتى 2%',
  },
  {
    id: 'alinma-sa-equity', name: 'صندوق الإنماء للأسهم السعودية', name_en: 'Alinma Saudi Equity Fund',
    class: 'equity_sa', layer: 'growth', source: 'nav', symbol: null, fund_id: '1874', currency: 'SAR', exchange: null,
    platforms: ['alinma'], ter: 1.75, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'daily', min_investment: 1,
    shariah: 'معتمد من الهيئة الشرعية لمصرف الإنماء؛ المؤشر الاسترشادي مؤشر الإنماء الإسلامي للأسهم السعودية', countries: { SA: 100 }, sectors: null,
    as_of: '2026-06-30', source_url: 'https://alinmacapital.com/-/media/Project/Alinma/PDF/July-2026/Factsheet-JUN2026/2026-06-JUN-EQUITY-Fund-Factsheet-EN.pdf',
    inception: '2011-01-01', zakat: zk('equity_sa', FUND_ZAKAT_NOTE),
    note: 'صندوق مُدار برسوم 1.75%؛ أصوله نحو 88 مليون ريال (يونيو 2026)',
  },

  // ───────────── direct shares ─────────────
  {
    id: 'direct-stocks', name: 'أسهم شركات مباشرة', name_en: 'Direct shares (generic)', class: 'equity_direct', layer: 'growth',
    source: 'manual', symbol: null, fund_id: null, currency: 'SAR', exchange: null,
    platforms: ['derayah', 'alrajhi', 'alinma', 'snb', 'albilad', 'sahm', 'derayah_global', 'ibkr'],
    ter: null, distribution: null, pay_freq: null, duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'تحقق من توافق كل شركة مع الشريعة دورياً (قوائم الهيئات الشرعية وأدوات الفرز)', countries: null, sectors: null,
    as_of: null, source_url: null, inception: null, zakat: zk('equity_direct'),
    note: 'سجّل كل سهم برمزه ليُتابع سعره تلقائياً',
  },

  // ───────────── Saudi REITs (largest by market value, Nov 2026) ─────────────
  {
    id: 'alrajhi-reit', name: 'صندوق الراجحي ريت', name_en: 'Al Rajhi REIT Fund', class: 'reit_sa', layer: 'income',
    source: 'yahoo', symbol: '4340.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: 0.8, distribution: 'dist', pay_freq: 'quarterly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صندوق عقاري متداول متوافق مع الشريعة (الراجحي المالية)', countries: { SA: 100 }, sectors: { real_estate: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/22672_1121_2026-07-13_13-22-12_en.pdf',
    inception: '2018-03-20', zakat: zk('reit_sa'),
    note: 'من أكبر صناديق الريت السعودية (نحو 2.2 مليار ريال)؛ 20 عقاراً متنوعاً وتوزيع ربع سنوي',
  },
  {
    id: 'jadwa-reit', name: 'صندوق جدوى ريت السعودية', name_en: 'Jadwa REIT Saudi Fund', class: 'reit_sa', layer: 'income',
    source: 'yahoo', symbol: '4342.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: 0.75, distribution: 'dist', pay_freq: 'quarterly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صندوق عقاري متداول متوافق مع الشريعة (جدوى للاستثمار)', countries: { SA: 100 }, sectors: { real_estate: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/3962_1101_2026-08-10_20-27-04_en.pdf',
    inception: '2018-02-11', zakat: zk('reit_sa'),
    note: 'تسعة عقارات في الرياض وجدة والدمام وتوزيع ربع سنوي؛ قيمته السوقية نحو 1.4 مليار ريال',
  },
  {
    id: 'sedco-reit', name: 'صندوق سدكو كابيتال ريت', name_en: 'SEDCO Capital REIT Fund', class: 'reit_sa', layer: 'income',
    source: 'yahoo', symbol: '4344.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: null, distribution: 'dist', pay_freq: 'quarterly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صندوق عقاري متداول مقفل متوافق مع الشريعة (سدكو كابيتال)', countries: null, sectors: { real_estate: 100 },
    as_of: '2024-12-31', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/1201_0_2025-01-14_09-43-52_En.pdf',
    inception: '2018-05-01', zakat: zk('reit_sa'),
    note: '21 عقاراً (مدارس وتجزئة ومجمعات سكنية)، وتوزيع ربع سنوي؛ قيمته السوقية نحو 1.2 مليار ريال',
  },
  {
    id: 'bonyan-reit', name: 'صندوق بنيان ريت', name_en: 'Bonyan REIT Fund', class: 'reit_sa', layer: 'income',
    source: 'yahoo', symbol: '4347.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: null, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صندوق عقاري متداول مقفل متوافق مع الشريعة (السعودي الفرنسي كابيتال)', countries: { SA: 100 }, sectors: { real_estate: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/28453_1221_2026-07-13_17-48-37_en.pdf',
    inception: '2018-07-25', zakat: zk('reit_sa'),
    note: '13 عقاراً في الرياض والمدينة وجازان وأبها وتوزيع نصف سنوي؛ قيمته السوقية نحو 1.3 مليار ريال',
  },
  {
    id: 'riyad-reit', name: 'صندوق الرياض ريت', name_en: 'Riyad REIT Fund', class: 'reit_sa', layer: 'income',
    source: 'yahoo', symbol: '4330.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: null, distribution: 'dist', pay_freq: 'semiannual', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'صندوق عقاري متداول مقفل متوافق مع الشريعة (الرياض المالية)', countries: null, sectors: { real_estate: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/19174_821_2026-07-14_17-28-42_en.pdf',
    inception: '2016-11-13', zakat: zk('reit_sa'),
    note: 'مدرج منذ 2016؛ أغلب عقاراته سعودية مع استثمارات في أمريكا وبلجيكا، وتمويله أعلى من نظرائه',
  },

  // ───────────── global REITs ─────────────
  {
    id: 'spre', name: 'صندوق إس بي فندز للريت العالمية الشرعية', name_en: 'SP Funds S&P Global REIT Sharia ETF', class: 'reit_global', layer: 'income',
    source: 'yahoo', symbol: 'SPRE', fund_id: null, currency: 'USD', exchange: 'NYSE Arca', platforms: US_LISTED,
    ter: 0.5, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'مؤشر S&P Global All Equity REIT Shariah Capped + شهادة اعتماد شرعي', countries: null, sectors: { real_estate: 100 },
    as_of: '2026-11-05', source_url: 'https://www.sp-funds.com/spre/', inception: '2020-12-29', zakat: zk('reit_global'),
    note: 'نحو 22 صندوق ريت عالمياً متوافقاً، بتوزيع شهري؛ حجمه نحو 200 مليون دولار',
  },

  // ───────────── gold ─────────────
  {
    id: 'sgld', name: 'إنفيسكو للذهب المادي (ETC)', name_en: 'Invesco Physical Gold ETC (USD)', class: 'gold', layer: 'hedge',
    source: 'yahoo', symbol: 'SGLD.L', fund_id: null, currency: 'USD', exchange: 'LSE', platforms: EU_LISTED,
    ter: 0.12, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'تصفه إنفيسكو بأنه متوافق مع الشريعة؛ سبائك في حسابات منفصلة بخزائن جي بي مورغان في لندن', countries: null, sectors: { commodity: 100 },
    as_of: null, source_url: 'https://www.invesco.com/uk/en/invesco-physical-gold-etc.html', inception: '2009-06-25', zakat: zk('gold'),
    note: 'خط الدولار SGLD (أما SGLP فخط الجنيه)؛ أقل الرسوم بين خيارات الذهب هنا (0.12%)',
  },
  {
    id: 'rmau', name: 'رويال مينت للذهب المادي (ETC)', name_en: 'The Royal Mint Responsibly Sourced Physical Gold ETC (USD)', class: 'gold', layer: 'hedge',
    source: 'yahoo', symbol: 'RMAU.L', fund_id: null, currency: 'USD', exchange: 'LSE', platforms: EU_LISTED,
    ter: 0.25, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'ذهب مادي مخصص في خزائن دار سك العملة الملكية بويلز، مع شهادة توافق شرعي سنوية (أماني للاستشارات)', countries: null, sectors: { commodity: 100 },
    as_of: '2026-11-05', source_url: 'https://hanetf.com/fund/rmau-physical-gold-etc/', inception: '2020-02-14', zakat: zk('gold'),
    note: 'خط الدولار RMAU (أما RMAP فخط الجنيه)؛ حجمه نحو 1.6 مليار دولار',
  },
  {
    id: 'albilad-gold', name: 'صندوق البلاد المتداول للذهب', name_en: 'Albilad Gold ETF', class: 'gold', layer: 'hedge',
    source: 'yahoo', symbol: '9405.SR', fund_id: null, currency: 'SAR', exchange: 'Tadawul', platforms: TADAWUL,
    ter: 0.41, distribution: 'acc', pay_freq: 'none', duration_years: null, liquidity: 'T+2', min_investment: null,
    shariah: 'عقود ذهب فوري متوافقة مع المعايير الشرعية للبلاد المالية؛ سبائك مخصصة', countries: null, sectors: { commodity: 100 },
    as_of: '2026-06-30', source_url: 'https://www.saudiexchange.sa/Resources/fsPdf/12046_1661_2026-08-11_09-24-42_ar.pdf',
    inception: '2020-06-02', zakat: zk('gold'),
    note: 'ذهب مادي يُشترى من تداول بالريال، محفوظ في خزينة برينكس بدبي؛ حجمه نحو 226 مليون ريال',
  },

  // ───────────── mixed income ─────────────
  {
    id: 'alrajhi-mdf', name: 'صندوق الراجحي للتوزيعات الشهرية', name_en: 'Al Rajhi Monthly Distribution Fund', class: 'mixed_income', layer: 'income',
    source: 'nav', symbol: null, fund_id: '5885', currency: 'SAR', exchange: null, platforms: ['alrajhi'],
    ter: 1.25, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'daily', min_investment: 10,
    shariah: 'صندوق متعدد الأصول متوافق مع الشريعة (الراجحي المالية)', countries: null, sectors: null, as_of: null,
    source_url: 'https://alrajhi-capital.sa/asset-management/Al-Rajhi-Monthly-Distribution-Fund', inception: null, zakat: zk('mixed_income'),
    note: 'متعدد الأصول (أسهم وريت وصكوك ونقد) ومخاطره عالية حسب مديره؛ التوزيع الشهري غير مضمون ورسوم الإدارة 1.25%',
  },
  {
    id: 'alrajhi-mdf2', name: 'صندوق الراجحي للتوزيعات الشهرية 2', name_en: 'Al Rajhi Monthly Distribution Fund 2', class: 'mixed_income', layer: 'income',
    source: 'nav', symbol: null, fund_id: '6046', currency: 'SAR', exchange: null, platforms: ['alrajhi'],
    ter: 1.25, distribution: 'dist', pay_freq: 'monthly', duration_years: null, liquidity: 'daily', min_investment: 10,
    shariah: 'صندوق متعدد الأصول متوافق مع الشريعة (الراجحي المالية)', countries: null, sectors: null, as_of: null,
    source_url: 'https://alrajhi-capital.com/asset-management/Al-Rajhi-Monthly-Distribution-Fund-2', inception: '2023-09-18', zakat: zk('mixed_income'),
    note: 'مؤشره الاسترشادي 40% أسهم توزيعات سعودية و30% ريت و30% سايبور، ومخاطره عالية؛ رسوم الإدارة 1.25%',
  },
]
