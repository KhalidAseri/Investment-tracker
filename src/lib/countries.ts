// Countries and regions for the allocation map (lookthrough.ts, risk.ts and the «التوزيع» screen).
// Keys are ISO-3166 alpha-2 codes. Two pseudo codes (outside ISO, from the user-assigned X range) are used for money that has
// no country: 'XX' = not known, 'XC' = gold and commodities.

/** Arabic country names (~100 countries: the GCC, the Arab world, every MSCI market and the usual sukuk issuers). */
export const COUNTRY_AR: Record<string, string> = {
  // الخليج
  SA: 'السعودية', AE: 'الإمارات', KW: 'الكويت', QA: 'قطر', BH: 'البحرين', OM: 'عُمان',
  // الدول العربية الأخرى
  EG: 'مصر', JO: 'الأردن', MA: 'المغرب', TN: 'تونس', DZ: 'الجزائر', LB: 'لبنان', IQ: 'العراق', SY: 'سوريا', PS: 'فلسطين',
  YE: 'اليمن', SD: 'السودان', LY: 'ليبيا', MR: 'موريتانيا', SO: 'الصومال', DJ: 'جيبوتي', KM: 'جزر القمر',
  // أمريكا الشمالية
  US: 'الولايات المتحدة', CA: 'كندا', MX: 'المكسيك',
  // أوروبا
  GB: 'المملكة المتحدة', DE: 'ألمانيا', FR: 'فرنسا', CH: 'سويسرا', NL: 'هولندا', SE: 'السويد', DK: 'الدنمارك', NO: 'النرويج',
  FI: 'فنلندا', IE: 'أيرلندا', ES: 'إسبانيا', IT: 'إيطاليا', BE: 'بلجيكا', AT: 'النمسا', PT: 'البرتغال', LU: 'لوكسمبورغ',
  IS: 'آيسلندا', CY: 'قبرص', MT: 'مالطا', EE: 'إستونيا', LV: 'لاتفيا', LT: 'ليتوانيا', SI: 'سلوفينيا', SK: 'سلوفاكيا',
  HR: 'كرواتيا', PL: 'بولندا', CZ: 'التشيك', HU: 'المجر', GR: 'اليونان', RO: 'رومانيا', BG: 'بلغاريا', RS: 'صربيا',
  TR: 'تركيا', RU: 'روسيا', UA: 'أوكرانيا',
  // آسيا والمحيط الهادئ
  JP: 'اليابان', AU: 'أستراليا', NZ: 'نيوزيلندا', HK: 'هونغ كونغ', SG: 'سنغافورة',
  CN: 'الصين', IN: 'الهند', ID: 'إندونيسيا', KR: 'كوريا الجنوبية', MY: 'ماليزيا', PH: 'الفلبين', TW: 'تايوان', TH: 'تايلاند',
  VN: 'فيتنام', PK: 'باكستان', BD: 'بنغلاديش', LK: 'سريلانكا', KZ: 'كازاخستان', BN: 'بروناي', MV: 'المالديف',
  // أمريكا اللاتينية وأفريقيا
  BR: 'البرازيل', CL: 'تشيلي', CO: 'كولومبيا', PE: 'بيرو', AR: 'الأرجنتين', UY: 'الأوروغواي',
  ZA: 'جنوب أفريقيا', NG: 'نيجيريا', KE: 'كينيا', GH: 'غانا', MU: 'موريشيوس', ET: 'إثيوبيا', TZ: 'تنزانيا', SN: 'السنغال',
  CI: 'ساحل العاج',
  // أخرى
  IR: 'إيران', IL: 'إسرائيل',
}

/** Labels of the two pseudo codes (not countries, so they are kept out of COUNTRY_AR and ISO_NUMERIC). */
export const PSEUDO_COUNTRY_AR: Record<string, string> = { XX: 'غير محدد', XC: 'ذهب وسلع (بلا دولة)' }
export const UNKNOWN_COUNTRY = 'XX'
export const COMMODITY_COUNTRY = 'XC'

/** Arabic label of a country code (pseudo codes included); the code itself when unknown. */
export const countryLabel = (code: string | null | undefined) => {
  const c = (code ?? '').toUpperCase()
  return COUNTRY_AR[c] ?? PSEUDO_COUNTRY_AR[c] ?? (c || PSEUDO_COUNTRY_AR.XX)
}

/**
 * ISO-3166 numeric code (3 digits, zero-padded) for every country in COUNTRY_AR. world-atlas topojson keys its countries by
 * this id (e.g. "682" for Saudi Arabia, "036" for Australia). Small places (HK, SG, BH, MT, MU, MV, KM, …) exist in the
 * 50m map but not in the 110m one.
 */
export const ISO_NUMERIC: Record<string, string> = {
  SA: '682', AE: '784', KW: '414', QA: '634', BH: '048', OM: '512',
  EG: '818', JO: '400', MA: '504', TN: '788', DZ: '012', LB: '422', IQ: '368', SY: '760', PS: '275',
  YE: '887', SD: '729', LY: '434', MR: '478', SO: '706', DJ: '262', KM: '174',
  US: '840', CA: '124', MX: '484',
  GB: '826', DE: '276', FR: '250', CH: '756', NL: '528', SE: '752', DK: '208', NO: '578',
  FI: '246', IE: '372', ES: '724', IT: '380', BE: '056', AT: '040', PT: '620', LU: '442',
  IS: '352', CY: '196', MT: '470', EE: '233', LV: '428', LT: '440', SI: '705', SK: '703',
  HR: '191', PL: '616', CZ: '203', HU: '348', GR: '300', RO: '642', BG: '100', RS: '688',
  TR: '792', RU: '643', UA: '804',
  JP: '392', AU: '036', NZ: '554', HK: '344', SG: '702',
  CN: '156', IN: '356', ID: '360', KR: '410', MY: '458', PH: '608', TW: '158', TH: '764',
  VN: '704', PK: '586', BD: '050', LK: '144', KZ: '398', BN: '096', MV: '462',
  BR: '076', CL: '152', CO: '170', PE: '604', AR: '032', UY: '858',
  ZA: '710', NG: '566', KE: '404', GH: '288', MU: '480', ET: '231', TZ: '834', SN: '686',
  CI: '384',
  IR: '364', IL: '376',
}
/** numeric id (as world-atlas writes it) → alpha-2 */
export const ISO_ALPHA2_BY_NUMERIC: Record<string, string> = Object.fromEntries(Object.entries(ISO_NUMERIC).map(([a, n]) => [n, a]))

// ---------- regions ----------
/**
 * Regions shown in the map legend. MSCI market classification decides developed vs emerging; two buckets were added to the
 * list in the spec because some money fits none of the others: «أسواق متقدمة أخرى» (Canada, Israel) and «ذهب وسلع» (no country).
 */
export const REGION_AR: Record<string, string> = {
  SA: 'السعودية',
  GCC: 'الخليج',
  US: 'الولايات المتحدة',
  EU: 'أوروبا',
  JP: 'اليابان',
  APAC: 'آسيا والمحيط الهادئ المتقدمة',
  EM_ASIA: 'آسيا الناشئة',
  EM_OTHER: 'أسواق ناشئة أخرى',
  DEV_OTHER: 'أسواق متقدمة أخرى',
  COMMODITY: 'ذهب وسلع',
  XX: 'غير محدد',
}
/** display order of the regions */
export const REGION_ORDER: string[] = ['SA', 'GCC', 'US', 'EU', 'JP', 'APAC', 'EM_ASIA', 'EM_OTHER', 'DEV_OTHER', 'COMMODITY', 'XX']

const REGION_OF: Record<string, string> = {}
const put = (region: string, codes: string) => { for (const c of codes.split(' ')) REGION_OF[c] = region }
put('SA', 'SA')
put('GCC', 'AE KW QA BH OM')
put('US', 'US')
// developed Europe plus the small euro-area members
put('EU', 'GB DE FR CH NL SE DK NO FI IE ES IT BE AT PT LU IS CY MT EE LV LT SI SK HR')
put('JP', 'JP')
put('APAC', 'AU NZ HK SG')
put('EM_ASIA', 'CN IN ID KR MY PH TW TH VN PK BD LK KZ BN MV')
// emerging Europe (MSCI EM: PL, CZ, HU, GR, TR), the Arab world outside the GCC, Latin America and Africa
put('EM_OTHER', 'PL CZ HU GR RO BG RS TR RU UA EG JO MA TN DZ LB IQ SY PS YE SD LY MR SO DJ KM MX BR CL CO PE AR UY ZA NG KE GH MU ET TZ SN CI IR')
put('DEV_OTHER', 'CA IL')
put('COMMODITY', 'XC')

/** Region key of a country code ('XX' when unknown). */
export function regionOfCountry(iso2: string): string {
  return REGION_OF[(iso2 ?? '').toUpperCase()] ?? 'XX'
}

// ---------- currencies ----------
/**
 * Countries whose currency is pegged to the US dollar (so to the riyal as well), or held in a narrow managed band:
 * the GCC (Kuwait: a basket dominated by the dollar), Jordan, Hong Kong and Djibouti. Money invested elsewhere carries
 * exchange-rate risk for a riyal investor.
 */
export const USD_PEGGED = new Set(['US', 'SA', 'AE', 'QA', 'BH', 'OM', 'KW', 'JO', 'HK', 'DJ'])

const CURRENCY_COUNTRY: Record<string, string> = {
  SAR: 'SA', USD: 'US', AED: 'AE', KWD: 'KW', QAR: 'QA', BHD: 'BH', OMR: 'OM', EGP: 'EG', JOD: 'JO', MAD: 'MA',
  GBP: 'GB', GBX: 'GB', CHF: 'CH', SEK: 'SE', DKK: 'DK', NOK: 'NO', JPY: 'JP', AUD: 'AU', NZD: 'NZ', HKD: 'HK',
  SGD: 'SG', CNY: 'CN', INR: 'IN', IDR: 'ID', KRW: 'KR', MYR: 'MY', TWD: 'TW', THB: 'TH', TRY: 'TR', CAD: 'CA',
  BRL: 'BR', MXN: 'MX', ZAR: 'ZA', PKR: 'PK',
}
/** The country a currency belongs to (null for EUR and unknown codes). */
export const currencyCountry = (cur: string | null | undefined): string | null => CURRENCY_COUNTRY[(cur ?? '').toUpperCase()] ?? null

// ---------- listings ----------
/** Yahoo symbol suffix → country of the exchange (mirror of the server's countryOf in daily-update). */
export const SUFFIX_COUNTRY: Record<string, string> = {
  SR: 'SA', AE: 'AE', KW: 'KW', QA: 'QA', CA: 'EG',
  L: 'GB', IL: 'GB', DE: 'DE', F: 'DE', BE: 'DE', DU: 'DE', HM: 'DE', HA: 'DE', MU: 'DE', SG: 'DE', PA: 'FR', AS: 'NL', BR: 'BE',
  MI: 'IT', MC: 'ES', LS: 'PT', SW: 'CH', VX: 'CH', ST: 'SE', CO: 'DK', OL: 'NO', HE: 'FI', IR: 'IE', VI: 'AT',
  WA: 'PL', PR: 'CZ', BD: 'HU', AT: 'GR', IS: 'TR', ME: 'RU',
  T: 'JP', AX: 'AU', NZ: 'NZ', HK: 'HK', SI: 'SG',
  SS: 'CN', SZ: 'CN', NS: 'IN', BO: 'IN', JK: 'ID', KS: 'KR', KQ: 'KR', KL: 'MY', PS: 'PH', TW: 'TW', TWO: 'TW', BK: 'TH', VN: 'VN',
  TO: 'CA', V: 'CA', NE: 'CA', CN: 'CA', SA: 'BR', MX: 'MX', SN: 'CL', BA: 'AR', LM: 'PE', JO: 'ZA', TA: 'IL',
}
/** Yahoo exchange codes (from symbol search) → country. */
export const EXCHANGE_COUNTRY: Record<string, string> = {
  NMS: 'US', NGM: 'US', NCM: 'US', NYQ: 'US', NYS: 'US', ASE: 'US', PCX: 'US', BTS: 'US', PNK: 'US', OQB: 'US', OQX: 'US', NAS: 'US', CBO: 'US',
  SAU: 'SA', DFM: 'AE', ADX: 'AE', KUW: 'KW', DOH: 'QA', BAH: 'BH', MSM: 'OM', CAI: 'EG',
  LSE: 'GB', IOB: 'GB', GER: 'DE', FRA: 'DE', XETRA: 'DE', PAR: 'FR', AMS: 'NL', BRU: 'BE', MIL: 'IT', MCE: 'ES', LIS: 'PT',
  EBS: 'CH', VTX: 'CH', STO: 'SE', CPH: 'DK', OSL: 'NO', HEL: 'FI', ISE: 'IE', VIE: 'AT', WSE: 'PL', ATH: 'GR', IST: 'TR',
  JPX: 'JP', TYO: 'JP', ASX: 'AU', NZE: 'NZ', HKG: 'HK', SES: 'SG', SHH: 'CN', SHZ: 'CN', NSI: 'IN', BSE: 'IN', JKT: 'ID',
  KSC: 'KR', KOE: 'KR', KLS: 'MY', PHS: 'PH', TAI: 'TW', TWO: 'TW', SET: 'TH', TOR: 'CA', VAN: 'CA', CNQ: 'CA', NEO: 'CA',
  SAO: 'BR', MEX: 'MX', SGO: 'CL', BUE: 'AR', LIM: 'PE', JNB: 'ZA', TLV: 'IL',
}

/**
 * Country of an exchange listing from a Yahoo symbol (suffix) or exchange code; a plain symbol priced in dollars is a US
 * listing. Funds listed in one country may invest elsewhere, so callers use this for single stocks only.
 */
export function countryOfListing(symbol: string | null | undefined, exchange?: string | null, currency?: string | null): string | null {
  const s = (symbol ?? '').trim().toUpperCase()
  if (!s || /^\d+$/.test(s)) return /^\d+$/.test(s) ? 'SA' : null // a bare number is a Saudi fund id (Mubasher)
  const ex = (exchange ?? '').trim().toUpperCase()
  const dot = s.lastIndexOf('.')
  if (dot > 0) {
    const hit = SUFFIX_COUNTRY[s.slice(dot + 1)]
    if (hit) return hit
  }
  if (ex && EXCHANGE_COUNTRY[ex]) return EXCHANGE_COUNTRY[ex]
  if (dot < 0 && !s.startsWith('^') && (!currency || currency.toUpperCase() === 'USD')) return 'US'
  return null
}
