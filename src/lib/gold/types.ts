// ===== Gold calculator domain types =====
// Everything the calculator needs is expressed here so the pricing engine
// stays a pure function of (market data + user inputs + rate card).

/** Karat codes we support. 24 = pure, 9 = lowest still stamped as gold. */
export type Karat = 24 | 22 | 21 | 18 | 14 | 10 | 9

/** Jewellery piece categories. Making charges differ a lot between them. */
export type PieceTypeId =
  | 'chain'
  | 'necklace'
  | 'pendant'
  | 'ring'
  | 'weddingBand'
  | 'bracelet'
  | 'bangle'
  | 'earrings'
  | 'murtaisha'
  | 'set'
  | 'anklet'
  | 'coin'
  | 'bar'
  | 'scrap'

/** "الدقة" — the workmanship origin/school a piece is sold under. */
export type OriginId =
  | 'saudi'
  | 'italian'
  | 'bahraini'
  | 'emirati'
  | 'kuwaiti'
  | 'turkish'
  | 'indian'
  | 'singaporean'
  | 'egyptian'
  | 'chinese'

export type CurrencyCode =
  | 'SAR'
  | 'AED'
  | 'KWD'
  | 'BHD'
  | 'QAR'
  | 'OMR'
  | 'JOD'
  | 'EGP'
  | 'USD'

/** How a shop quotes its making charge. */
export type MakingChargeMode =
  /** SAR per gram — the Gulf default. */
  | 'perGram'
  /** A flat amount for the whole piece — common for small/light items. */
  | 'flat'
  /** A percentage of the raw gold value — common for Indian/imported pieces. */
  | 'percent'

export interface KaratInfo {
  karat: Karat
  /** Fraction of pure gold, e.g. 21K = 0.875. */
  purity: number
  /** Hallmark number stamped on the piece, e.g. 875. */
  stamp: number
  labelAr: string
  labelEn: string
  /** Shown as a hint in the UI. */
  noteAr: string
}

export interface PieceType {
  id: PieceTypeId
  labelAr: string
  /** A shorter name for tight spaces such as the piece picker's tiles. */
  shortLabelAr?: string
  labelEn: string
  /** Common alternative names shoppers use, for search. */
  aliasesAr: string[]
  /** Typical making charge in SAR/gram before the origin multiplier. */
  baseMakingPerGram: { low: number; typical: number; high: number }
  /** Piece types sold at raw gold value with no craftsmanship premium. */
  bullion?: boolean
  /** Karats this piece is usually made in — used to warn on odd combos. */
  commonKarats: Karat[]
  noteAr: string
}

export interface Origin {
  id: OriginId
  labelAr: string
  labelEn: string
  /** Multiplier applied to a piece type's base making charge. */
  makingMultiplier: number
  /** Karats this workmanship is normally sold in. */
  commonKarats: Karat[]
  noteAr: string
}

export interface CurrencyInfo {
  code: CurrencyCode
  labelAr: string
  labelEn: string
  symbolAr: string
  /** Units of this currency per 1 USD. Pegged rates are exact and stable. */
  pegPerUsd: number
  /** True when the rate is a hard peg, so a live FX lookup is unnecessary. */
  pegged: boolean
  /** VAT rate applied to jewellery in this market, as a fraction. */
  vatRate: number
  /** Decimal places used when displaying money. */
  decimals: number
}

/** A live (or cached) spot gold reading, always normalised to USD per troy ounce. */
export interface SpotPrice {
  /** USD per troy ounce of pure gold. */
  usdPerOunce: number
  /** Identifier of the upstream source that answered. */
  source: string
  sourceLabelAr: string
  /** ISO timestamp of when we fetched it. */
  fetchedAt: string
  /** True when served from cache past its TTL, or from the offline fallback. */
  isStale: boolean
  /** Absolute + percent change vs previous close, when the source provides it. */
  change?: number
  changePercent?: number
}

export interface FxRate {
  /** Units of the target currency per 1 USD. */
  perUsd: number
  source: string
  fetchedAt: string
  isStale: boolean
}

/** Everything the engine needs to know about the market at calculation time. */
export interface MarketSnapshot {
  spot: SpotPrice
  fx: FxRate
  currency: CurrencyInfo
}

/** The user's shop-specific assumptions. Editable in Settings. */
export interface RateCard {
  /**
   * Override making charge; when null the built-in matrix is used.
   * Interpreted per `makingChargeMode`: currency per gram, currency per piece,
   * or — for `'percent'` — a FRACTION of gold value (0.25 = 25%).
   */
  makingChargeOverride: number | null
  makingChargeMode: MakingChargeMode
  /** Extra retail markup the shop adds on top of making charge, as a fraction. */
  shopMarginPercent: number
  /** Whether the displayed total includes VAT. */
  includeVat: boolean
  /** Fraction of spot the shop pays when buying gold back from you. */
  buybackFactor: number
  /** Flat SAR/gram the shop deducts on buy-back (refining/handling). */
  buybackDeductionPerGram: number
}

export interface BuyInput {
  karat: Karat
  /** Grams of gold. Stones must be excluded. */
  weightGrams: number
  pieceType: PieceTypeId
  origin: OriginId
  /** Number of identical pieces. */
  quantity: number
  /** Optional: the price the shop actually quoted, for a fairness check. */
  quotedTotal?: number | null
}

export interface BuyBreakdown {
  /** Price of one gram of pure (24K) gold in the display currency. */
  pricePerGram24: number
  /** Price of one gram at the chosen karat. */
  pricePerGramKarat: number
  /** Raw metal value of the piece(s). */
  goldValue: number
  /** Making charge per gram actually used. */
  makingPerGram: number
  makingTotal: number
  /** Shop's retail markup in currency. */
  shopMargin: number
  /** Total before tax. */
  subtotal: number
  /** Tax amount, per the market's VAT rule. */
  vat: number
  vatRate: number
  /** Portion of the subtotal that VAT was charged on. */
  vatableBase: number
  totalWithVat: number
  totalWithoutVat: number
  /** What share of the price is craftsmanship rather than metal, 0..1. */
  premiumShare: number
  /** Estimated immediate resale value, i.e. what you'd lose selling today. */
  instantResale: number
  instantLoss: number
  instantLossPercent: number
}

export type FairnessVerdict = 'great' | 'fair' | 'high' | 'overpriced'

export interface FairnessCheck {
  verdict: FairnessVerdict
  /** Quoted total minus our fair total, in currency. */
  difference: number
  differencePercent: number
  /** Making charge per gram implied by the shop's quote. */
  impliedMakingPerGram: number
  messageAr: string
  /** A concrete counter-offer to negotiate towards. */
  suggestedTarget: number
}

export interface SellInput {
  karat: Karat
  weightGrams: number
  /** What you originally paid, if known — enables a profit/loss figure. */
  originalPurchasePrice?: number | null
}

export interface SellBreakdown {
  pricePerGram24: number
  pricePerGramKarat: number
  /** Full market value of the metal, before any shop deduction. */
  marketValue: number
  /** Deduction the shop applies. */
  deduction: number
  deductionPercent: number
  /** Realistic cash you walk out with. */
  estimatedPayout: number
  /** Best case — a competitive shop paying near spot. */
  bestCasePayout: number
  /** Worst case — a shop treating the piece as scrap. */
  worstCasePayout: number
  profitLoss: number | null
  profitLossPercent: number | null
}

/** A saved shop quote, for side-by-side comparison. */
export interface SavedOffer {
  id: string
  shopName: string
  createdAt: string
  input: BuyInput
  /** Total the shop quoted, in the currency it was captured in. */
  quotedTotal: number
  currency: CurrencyCode
  /** Spot price at capture time, so the comparison stays meaningful. */
  spotUsdPerOunce: number
  notes: string
}
