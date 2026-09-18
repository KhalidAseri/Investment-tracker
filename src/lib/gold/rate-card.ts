import type {
  Karat,
  Origin,
  OriginId,
  PieceType,
  PieceTypeId,
  RateCard,
} from './types'

/**
 * Making-charge ("المصنعية") reference data for the Saudi / Gulf market.
 *
 * ── How the model works ────────────────────────────────────────────────────
 * No shop or authority publishes a full (piece type × origin × karat) table, so
 * this is a three-factor model calibrated against the figures that ARE public:
 *
 *     makingPerGram = basePerGram[pieceType] × multiplier[origin] × karatFactor
 *
 * `basePerGram` is quoted in SAR per gram for the reference case: a Saudi-made
 * 21K piece. Bullion is the exception — bars and coins are charged as a small
 * percentage of metal value, not per gram, so they bypass the formula entirely.
 *
 * ── On accuracy ────────────────────────────────────────────────────────────
 * Entries carrying `estimated: true` are interpolated from the qualitative
 * evidence (e.g. "handmade pieces cost far more than machine-made") rather than
 * copied from a published number. They are defensible starting points, not
 * quotes. Every figure is editable by the user, and the UI shows a low/typical/
 * high band rather than pretending to a single true price.
 *
 * Sources for the anchored figures: gold-era.sa (18K ring up to 80 SAR/g vs 21K
 * at 30-35), masat-alsaada.com (15-55 SAR/g general Saudi range; 30-150 SAR/g
 * flat or 8-25% of metal value; Italian vs Saudi comparison), gold.saab.sa
 * (full sets and complex work priced higher), bullionsaudi.com (30-50 SAR/g),
 * gold-era.sa (bullion at 0.3%-3% of metal value).
 */

/** The reference karat the base rates are quoted at. */
export const REFERENCE_KARAT: Karat = 21
/** The currency the base rates are quoted in. */
export const RATE_CARD_CURRENCY = 'SAR'
/** SAR per USD, used to convert the SAR-denominated rate card to other markets. */
export const RATE_CARD_SAR_PER_USD = 3.75

export type MakingBand = 'low' | 'typical' | 'high'

export const PIECE_TYPES: PieceType[] = [
  {
    id: 'weddingBand',
    labelAr: 'دبلة',
    labelEn: 'Wedding band',
    aliasesAr: ['محبس', 'خاتم زواج'],
    baseMakingPerGram: { low: 10, typical: 18, high: 30 },
    commonKarats: [21, 18],
    noteAr: 'قطعة مصمتة بسيطة — أقل مصنعية بين قطع الزينة، وتحافظ على قيمتها عند البيع',
  },
  {
    id: 'chain',
    labelAr: 'سلسال آلي',
    labelEn: 'Machine chain',
    aliasesAr: ['سلسلة', 'تشين'],
    baseMakingPerGram: { low: 15, typical: 22, high: 35 },
    commonKarats: [21, 18, 22],
    noteAr: 'السلاسل الآلية البسيطة من أرخص القطع مصنعيةً',
  },
  {
    id: 'ring',
    labelAr: 'خاتم',
    labelEn: 'Ring',
    aliasesAr: ['محبس'],
    baseMakingPerGram: { low: 15, typical: 25, high: 45 },
    commonKarats: [21, 18, 22],
    noteAr: 'تختلف المصنعية كثيراً بين الخاتم المصمت والخاتم المفرغ أو المرصّع',
  },
  {
    id: 'bracelet',
    labelAr: 'أسورة',
    labelEn: 'Bracelet',
    aliasesAr: ['إسورة', 'سوار'],
    baseMakingPerGram: { low: 15, typical: 25, high: 40 },
    commonKarats: [21, 18, 22],
    noteAr: 'الأساور المصمتة خيار جيد للادخار لانخفاض مصنعيتها',
  },
  {
    id: 'bangle',
    labelAr: 'غويشة',
    labelEn: 'Bangle',
    aliasesAr: ['بنجري', 'كف'],
    baseMakingPerGram: { low: 18, typical: 28, high: 45 },
    commonKarats: [21, 22, 18],
    noteAr: 'تقدير — لا توجد أرقام منشورة للغويشة تحديداً، قيست على الأسورة',
  },
  {
    id: 'anklet',
    labelAr: 'خلخال',
    labelEn: 'Anklet',
    aliasesAr: [],
    baseMakingPerGram: { low: 20, typical: 30, high: 45 },
    commonKarats: [21, 18],
    noteAr: 'تقدير — قيس على السلسال والأسورة لعدم توفر أرقام منشورة',
  },
  {
    id: 'pendant',
    labelAr: 'تعليقة',
    labelEn: 'Pendant',
    aliasesAr: ['دلاية', 'ميدالية'],
    baseMakingPerGram: { low: 20, typical: 30, high: 50 },
    commonKarats: [21, 18, 22],
    noteAr: 'تقدير — القطع الصغيرة ترتفع مصنعية الجرام فيها لأن العمل ثابت والوزن قليل',
  },
  {
    id: 'earrings',
    labelAr: 'حلق',
    labelEn: 'Earrings',
    aliasesAr: ['أقراط', 'قرط'],
    baseMakingPerGram: { low: 25, typical: 35, high: 55 },
    commonKarats: [21, 18, 22],
    noteAr: 'تقدير — وزن صغير يوزَّع عليه عمل ثابت، فترتفع المصنعية لكل جرام',
  },
  {
    id: 'necklace',
    labelAr: 'سلسال مجدول / مفرغ',
    labelEn: 'Complex necklace',
    aliasesAr: ['عقد', 'قلادة', 'كوليه'],
    baseMakingPerGram: { low: 30, typical: 45, high: 70 },
    commonKarats: [21, 18, 22],
    noteAr: 'القطع المتشابكة والمفرغة مصنعيتها مرتفعة جداً مقارنة بالسلسال الآلي',
  },
  {
    id: 'set',
    labelAr: 'طقم كامل',
    labelEn: 'Full set',
    aliasesAr: ['طقم عروس', 'شبكة'],
    baseMakingPerGram: { low: 35, typical: 55, high: 90 },
    commonKarats: [21, 22, 18],
    noteAr: 'الأطقم الكاملة والمجوهرات المعقدة لها أعلى مصنعية بعد القطع اليدوية',
  },
  {
    id: 'murtaisha',
    labelAr: 'مرتعشة',
    labelEn: 'Murtaisha (tremblant)',
    aliasesAr: ['مرتعشه', 'رعاشة'],
    baseMakingPerGram: { low: 45, typical: 70, high: 120 },
    commonKarats: [21, 18],
    noteAr:
      'أعلى فئة مصنعية — عمل يدوي دقيق وأجزاء متحركة. للزينة لا للادخار (الرقم تقدير، والاتجاه مؤكد)',
  },
  {
    id: 'coin',
    labelAr: 'جنيه / ليرة ذهب',
    labelEn: 'Gold coin',
    aliasesAr: ['عملة ذهبية', 'ريال ذهب'],
    baseMakingPerGram: { low: 0, typical: 0, high: 0 },
    bullion: true,
    commonKarats: [24, 22, 21],
    noteAr: 'تُسعَّر بنسبة صغيرة من قيمة المعدن وليس بمصنعية الجرام',
  },
  {
    id: 'bar',
    labelAr: 'سبيكة',
    labelEn: 'Gold bar',
    aliasesAr: ['سبائك', 'بسكويت ذهب'],
    baseMakingPerGram: { low: 0, typical: 0, high: 0 },
    bullion: true,
    commonKarats: [24],
    noteAr: 'أقل تكلفة إضافية على الإطلاق — الخيار الأفضل إذا كان هدفك الادخار',
  },
  {
    id: 'scrap',
    labelAr: 'كسر (ذهب مستعمل)',
    labelEn: 'Scrap gold',
    aliasesAr: ['ذهب قديم', 'خردة'],
    baseMakingPerGram: { low: 0, typical: 0, high: 0 },
    bullion: true,
    commonKarats: [24, 22, 21, 18],
    noteAr: 'يُقيَّم بالوزن والعيار فقط، بلا أي مقابل للصنعة',
  },
]

/**
 * Origin multipliers applied to the base rate.
 *
 * The Italian figure is the widest and least certain: published comparisons put
 * local (Saudi/Bahraini) work at 5-65 SAR/g against Italian at 10-250 SAR/g, so
 * the true multiplier ranges from under 2× to over 4× depending on brand. 2.2
 * is a deliberately conservative middle — a branded Italian piece can easily
 * exceed it.
 */
export const ORIGINS: Origin[] = [
  {
    id: 'saudi',
    labelAr: 'سعودي',
    labelEn: 'Saudi',
    makingMultiplier: 1.0,
    commonKarats: [21, 18, 24],
    noteAr: 'خط الأساس في التسعير — تصاميم خليجية كلاسيكية بمصنعية معتدلة',
  },
  {
    id: 'bahraini',
    labelAr: 'بحريني',
    labelEn: 'Bahraini',
    makingMultiplier: 1.05,
    commonKarats: [21, 18],
    noteAr: 'قريب جداً من السعودي في التصميم والسعر، وسمعته جيدة في جودة العيار',
  },
  {
    id: 'emirati',
    labelAr: 'إماراتي',
    labelEn: 'Emirati',
    makingMultiplier: 1.0,
    commonKarats: [21, 22, 18],
    noteAr: 'دبي من أرخص الأسواق مصنعيةً للقطع الآلية، لكن القطع الفاخرة أعلى بكثير',
  },
  {
    id: 'kuwaiti',
    labelAr: 'كويتي',
    labelEn: 'Kuwaiti',
    makingMultiplier: 1.08,
    commonKarats: [21, 18],
    noteAr: 'تقدير — صُنِّف مع بقية دول الخليج لعدم توفر بيانات منشورة',
  },
  {
    id: 'turkish',
    labelAr: 'تركي',
    labelEn: 'Turkish',
    makingMultiplier: 1.25,
    commonKarats: [18, 21, 14],
    noteAr: 'تصاميم عصرية بأسعار متوسطة — أعلى من الخليجي وأقل بكثير من الإيطالي',
  },
  {
    id: 'italian',
    labelAr: 'إيطالي',
    labelEn: 'Italian',
    makingMultiplier: 2.2,
    commonKarats: [18, 14],
    noteAr:
      'الأغلى مصنعيةً وغالباً عيار 18 — خفيف وأنيق، لكن الفارق كله يضيع عند إعادة البيع',
  },
  {
    id: 'indian',
    labelAr: 'هندي',
    labelEn: 'Indian',
    makingMultiplier: 1.4,
    commonKarats: [22, 21],
    noteAr: 'نقش يدوي كثيف وتصاميم تراثية، وغالباً عيار 22',
  },
  {
    id: 'singaporean',
    labelAr: 'سنغافوري',
    labelEn: 'Singaporean',
    makingMultiplier: 1.15,
    commonKarats: [22, 21],
    noteAr: 'تقدير — شائع في الخليج بعيار 916، لم أجد أرقاماً منشورة لمصنعيته',
  },
  {
    id: 'egyptian',
    labelAr: 'مصري',
    labelEn: 'Egyptian',
    makingMultiplier: 1.1,
    commonKarats: [21, 18],
    noteAr: 'تقدير — تصاميم قريبة من الخليجي بمصنعية متقاربة',
  },
  {
    id: 'chinese',
    labelAr: 'صيني',
    labelEn: 'Chinese',
    makingMultiplier: 1.0,
    commonKarats: [18, 24],
    noteAr: 'تقدير ضعيف المصدر — إنتاج آلي بكميات كبيرة، تأكد من الدمغة جيداً',
  },
]

/**
 * Karat adjustment, relative to 21K = 1.0.
 *
 * Lower-karat pieces carry MORE making charge per gram, not less: they are
 * typically lighter and more finely finished, so the same amount of labour is
 * spread over fewer grams. The 18K factor is anchored on a shop quoting 80
 * SAR/g for an 18K ring against 30-35 SAR/g for the same design in 21K.
 */
export const KARAT_MAKING_FACTOR: Record<Karat, number> = {
  24: 0.9,
  22: 0.9,
  21: 1.0,
  18: 1.25,
  14: 1.35,
  10: 1.45,
  9: 1.5,
}

/**
 * Bullion premium as a fraction of metal value, by bar/coin weight. Small bars
 * carry a proportionally larger premium because the minting cost is fixed.
 */
const BULLION_FEE_TIERS: { maxGrams: number; low: number; typical: number; high: number }[] = [
  { maxGrams: 10, low: 0.01, typical: 0.02, high: 0.03 },
  { maxGrams: 100, low: 0.005, typical: 0.01, high: 0.015 },
  { maxGrams: 1000, low: 0.003, typical: 0.005, high: 0.008 },
  { maxGrams: Infinity, low: 0.002, typical: 0.003, high: 0.005 },
]

export function getBullionFeePercent(weightGrams: number, band: MakingBand = 'typical'): number {
  const tier = BULLION_FEE_TIERS.find((t) => weightGrams <= t.maxGrams) ?? BULLION_FEE_TIERS[BULLION_FEE_TIERS.length - 1]
  return tier[band]
}

const PIECE_BY_ID = new Map<PieceTypeId, PieceType>(PIECE_TYPES.map((p) => [p.id, p]))
const ORIGIN_BY_ID = new Map<OriginId, Origin>(ORIGINS.map((o) => [o.id, o]))

export function getPieceType(id: PieceTypeId): PieceType {
  const piece = PIECE_BY_ID.get(id)
  if (!piece) throw new Error(`Unknown piece type: ${id}`)
  return piece
}

export function getOrigin(id: OriginId): Origin {
  const origin = ORIGIN_BY_ID.get(id)
  if (!origin) throw new Error(`Unknown origin: ${id}`)
  return origin
}

/**
 * Reference making charge in **SAR per gram** for a given combination.
 * Returns 0 for bullion, which is priced as a percentage of metal value
 * instead — callers must handle that case separately.
 */
export function getMakingChargeSarPerGram(
  pieceTypeId: PieceTypeId,
  originId: OriginId,
  karat: Karat,
  band: MakingBand = 'typical'
): number {
  const piece = getPieceType(pieceTypeId)
  if (piece.bullion) return 0

  const base = piece.baseMakingPerGram[band]
  const originFactor = getOrigin(originId).makingMultiplier
  const karatFactor = KARAT_MAKING_FACTOR[karat] ?? 1

  return base * originFactor * karatFactor
}

/**
 * Defaults tuned for a Saudi buyer.
 *
 * `shopMarginPercent` is 0 on purpose. In the Saudi retail market the shop's
 * profit is already baked into the making charge rather than added as a
 * separate line, so counting it twice would overstate every total. The field
 * stays available for anyone whose shop does itemise it.
 *
 * `buybackFactor` of 0.98 reflects the 0.5%-2% margin shops take when buying
 * gold back; published per-gram deductions of 4-8 SAR/g work out to roughly the
 * same share, so only one of the two is applied by default.
 */
export const DEFAULT_RATE_CARD: RateCard = {
  makingChargeOverride: null,
  makingChargeMode: 'perGram',
  shopMarginPercent: 0,
  includeVat: true,
  buybackFactor: 0.98,
  buybackDeductionPerGram: 0,
}

/** A competitive shop paying close to spot, e.g. where you originally bought. */
export const BUYBACK_BEST_FACTOR = 0.995
/** Selling as scrap to an unfamiliar dealer, with no original invoice. */
export const BUYBACK_WORST_FACTOR = 0.92
