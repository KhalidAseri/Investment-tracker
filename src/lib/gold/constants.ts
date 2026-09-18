import type { CurrencyCode, CurrencyInfo, Karat, KaratInfo } from './types'

/** Grams in one troy ounce. Every spot quote in the world uses this unit. */
export const GRAMS_PER_TROY_OUNCE = 31.1034768

/**
 * Karat table. `purity` is the fraction of pure gold by weight and is what the
 * pricing engine multiplies by — the hallmark `stamp` is only what's engraved
 * on the piece. Note 24K is treated as 0.999, not 1.0: "24 قيراط" jewellery in
 * the Gulf is 999 fine, not absolutely pure.
 */
export const KARATS: KaratInfo[] = [
  {
    karat: 24,
    purity: 0.999,
    stamp: 999,
    labelAr: 'عيار 24',
    labelEn: '24K',
    noteAr: 'ذهب شبه نقي — طري جداً، يُستخدم للسبائك والجنيهات أكثر من الزينة',
  },
  {
    karat: 22,
    purity: 0.916,
    stamp: 916,
    labelAr: 'عيار 22',
    labelEn: '22K',
    noteAr: 'شائع في المشغولات الهندية والآسيوية، لونه أصفر غامق',
  },
  {
    karat: 21,
    purity: 0.875,
    stamp: 875,
    labelAr: 'عيار 21',
    labelEn: '21K',
    noteAr: 'العيار الأكثر انتشاراً في السعودية والخليج للذهب الزينة',
  },
  {
    karat: 18,
    purity: 0.75,
    stamp: 750,
    labelAr: 'عيار 18',
    labelEn: '18K',
    noteAr: 'الأكثر استخداماً في القطع الإيطالية والماركات العالمية، أقوى وأخف',
  },
  {
    karat: 14,
    purity: 0.585,
    stamp: 585,
    labelAr: 'عيار 14',
    labelEn: '14K',
    noteAr: 'أقل نسبة ذهب، شائع في القطع الأوروبية والأمريكية',
  },
  {
    karat: 10,
    purity: 0.4167,
    stamp: 417,
    labelAr: 'عيار 10',
    labelEn: '10K',
    noteAr: 'نسبة ذهب أقل من النصف — تأكد من الدمغة قبل الشراء',
  },
  {
    karat: 9,
    purity: 0.375,
    stamp: 375,
    labelAr: 'عيار 9',
    labelEn: '9K',
    noteAr: 'أدنى عيار يُباع كذهب، نادر في السوق الخليجي',
  },
]

const KARAT_BY_CODE = new Map<Karat, KaratInfo>(KARATS.map((k) => [k.karat, k]))

export function getKarat(karat: Karat): KaratInfo {
  const info = KARAT_BY_CODE.get(karat)
  if (!info) throw new Error(`Unknown karat: ${karat}`)
  return info
}

export function getPurity(karat: Karat): number {
  return getKarat(karat).purity
}

/**
 * Supported markets. Gulf currencies are hard-pegged to the dollar, so the
 * peg is exact and a live FX call is only needed for the floating ones.
 * `vatRate` is the consumption tax applied to gold jewellery locally.
 */
export const CURRENCIES: CurrencyInfo[] = [
  {
    code: 'SAR',
    labelAr: 'ريال سعودي',
    labelEn: 'Saudi Riyal',
    symbolAr: 'ر.س',
    pegPerUsd: 3.75,
    pegged: true,
    vatRate: 0.15,
    decimals: 2,
  },
  {
    code: 'AED',
    labelAr: 'درهم إماراتي',
    labelEn: 'UAE Dirham',
    symbolAr: 'د.إ',
    pegPerUsd: 3.6725,
    pegged: true,
    vatRate: 0.05,
    decimals: 2,
  },
  {
    code: 'KWD',
    labelAr: 'دينار كويتي',
    labelEn: 'Kuwaiti Dinar',
    symbolAr: 'د.ك',
    pegPerUsd: 0.3065,
    pegged: false,
    vatRate: 0,
    decimals: 3,
  },
  {
    code: 'BHD',
    labelAr: 'دينار بحريني',
    labelEn: 'Bahraini Dinar',
    symbolAr: 'د.ب',
    pegPerUsd: 0.376,
    pegged: true,
    vatRate: 0.1,
    decimals: 3,
  },
  {
    code: 'QAR',
    labelAr: 'ريال قطري',
    labelEn: 'Qatari Riyal',
    symbolAr: 'ر.ق',
    pegPerUsd: 3.64,
    pegged: true,
    vatRate: 0,
    decimals: 2,
  },
  {
    code: 'OMR',
    labelAr: 'ريال عماني',
    labelEn: 'Omani Rial',
    symbolAr: 'ر.ع',
    pegPerUsd: 0.3845,
    pegged: true,
    vatRate: 0.05,
    decimals: 3,
  },
  {
    code: 'JOD',
    labelAr: 'دينار أردني',
    labelEn: 'Jordanian Dinar',
    symbolAr: 'د.أ',
    pegPerUsd: 0.709,
    pegged: true,
    vatRate: 0.16,
    decimals: 3,
  },
  {
    code: 'EGP',
    labelAr: 'جنيه مصري',
    labelEn: 'Egyptian Pound',
    symbolAr: 'ج.م',
    pegPerUsd: 48.5,
    pegged: false,
    vatRate: 0.14,
    decimals: 2,
  },
  {
    code: 'USD',
    labelAr: 'دولار أمريكي',
    labelEn: 'US Dollar',
    symbolAr: '$',
    pegPerUsd: 1,
    pegged: true,
    vatRate: 0,
    decimals: 2,
  },
]

const CURRENCY_BY_CODE = new Map<CurrencyCode, CurrencyInfo>(
  CURRENCIES.map((c) => [c.code, c])
)

export function getCurrency(code: CurrencyCode): CurrencyInfo {
  const info = CURRENCY_BY_CODE.get(code)
  if (!info) throw new Error(`Unknown currency: ${code}`)
  return info
}

export const DEFAULT_CURRENCY: CurrencyCode = 'SAR'
