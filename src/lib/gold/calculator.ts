import {
  GRAMS_PER_TROY_OUNCE,
  getPurity,
  KARATS,
} from './constants'
import {
  BUYBACK_BEST_FACTOR,
  BUYBACK_TYPICAL,
  BUYBACK_WORST_FACTOR,
  getBullionFeePercent,
  getMakingChargeSarPerGram,
  getPieceType,
  RATE_CARD_SAR_PER_USD,
  type MakingBand,
} from './rate-card'
import type {
  BuyBreakdown,
  BuyInput,
  FairnessCheck,
  FairnessVerdict,
  Karat,
  MarketSnapshot,
  PieceTypeId,
  RateCard,
  SellBreakdown,
  SellInput,
} from './types'

/**
 * The pricing engine. Every function here is pure: give it a market snapshot,
 * the user's inputs and a rate card, and it returns numbers. No fetching, no
 * storage, no React — which is what makes it testable.
 */

// ===== Per-gram prices =====

/** Price of one gram of *absolutely pure* gold in the display currency. */
function pricePerGramPure(market: MarketSnapshot): number {
  return (market.spot.usdPerOunce / GRAMS_PER_TROY_OUNCE) * market.fx.perUsd
}

/** Price of one gram at a given karat, in the display currency. */
export function pricePerGram(market: MarketSnapshot, karat: Karat): number {
  return pricePerGramPure(market) * getPurity(karat)
}

/** The whole karat ladder at once, for the live price board. */
export function priceBoard(market: MarketSnapshot): { karat: Karat; perGram: number }[] {
  return KARATS.map((k) => ({ karat: k.karat, perGram: pricePerGram(market, k.karat) }))
}

/** Convert a SAR-denominated rate-card figure into the display currency. */
/**
 * Converts a rate-card figure, which is quoted in SAR, into the display
 * currency. Exported so the UI can label its piece picker with live
 * making charges instead of raw Saudi riyals.
 */
export function sarToDisplay(amountSar: number, market: MarketSnapshot): number {
  return amountSar * (market.fx.perUsd / RATE_CARD_SAR_PER_USD)
}

// ===== VAT =====

/**
 * Whether a purchase is zero-rated as investment gold.
 *
 * ZATCA's exemption requires all three of: purity at or above 99%, an
 * investment form (bar, wafer or tradable coin), and an investment purpose.
 * The common misreading is that 99% purity alone is enough — it is not. A 24K
 * *necklace* is still taxed at the full rate, because its form and purpose are
 * ornamental. That is exactly the case this function gets right.
 */
export function isZeroRatedInvestmentGold(pieceTypeId: PieceTypeId, karat: Karat): boolean {
  const investmentForm = pieceTypeId === 'bar' || pieceTypeId === 'coin'
  return investmentForm && getPurity(karat) >= 0.99
}

// ===== Buying =====

/**
 * Full price breakdown for a purchase.
 *
 * @param band which end of the making-charge range to assume. 'low' models a
 *             well-negotiated price, 'high' an expensive boutique.
 */
export function computeBuy(
  input: BuyInput,
  market: MarketSnapshot,
  rateCard: RateCard,
  band: MakingBand = 'typical'
): BuyBreakdown {
  const piece = getPieceType(input.pieceType)
  const quantity = Math.max(1, Math.floor(input.quantity || 1))
  const weightGrams = Math.max(0, input.weightGrams || 0)
  const totalWeight = weightGrams * quantity

  const perGramPure = pricePerGramPure(market)
  const pricePerGram24 = perGramPure * getPurity(24)
  const pricePerGramKarat = perGramPure * getPurity(input.karat)
  const goldValue = pricePerGramKarat * totalWeight

  // ---- Making charge ----
  let makingTotal: number
  if (rateCard.makingChargeOverride !== null && rateCard.makingChargeOverride >= 0) {
    const override = rateCard.makingChargeOverride
    switch (rateCard.makingChargeMode) {
      case 'flat':
        makingTotal = override * quantity
        break
      case 'percent':
        makingTotal = goldValue * override
        break
      case 'perGram':
      default:
        makingTotal = override * totalWeight
    }
  } else if (piece.bullion) {
    // Bars and coins carry a percentage premium, not a per-gram making charge.
    makingTotal = goldValue * getBullionFeePercent(weightGrams, band)
  } else {
    const perGram = sarToDisplay(
      getMakingChargeSarPerGram(input.pieceType, input.origin, input.karat, band),
      market
    )
    makingTotal = perGram * totalWeight
  }

  const makingPerGram = totalWeight > 0 ? makingTotal / totalWeight : 0

  // ---- Shop margin, tax, totals ----
  const shopMargin = (goldValue + makingTotal) * Math.max(0, rateCard.shopMarginPercent)
  const subtotal = goldValue + makingTotal + shopMargin

  const vatRate = isZeroRatedInvestmentGold(input.pieceType, input.karat)
    ? 0
    : market.currency.vatRate
  // Saudi VAT applies to the whole invoice — metal and craftsmanship alike —
  // not only to the making charge, which is a common misconception.
  const vatableBase = subtotal
  const vat = vatableBase * vatRate

  const totalWithoutVat = subtotal
  const totalWithVat = subtotal + vat

  const premiumShare = subtotal > 0 ? (makingTotal + shopMargin) / subtotal : 0

  // ---- What you'd get back if you sold it again today ----
  const resale = computeSell({ karat: input.karat, weightGrams: totalWeight }, market, rateCard)
  const paid = rateCard.includeVat ? totalWithVat : totalWithoutVat
  const instantLoss = paid - resale.estimatedPayout

  return {
    pricePerGram24,
    pricePerGramKarat,
    goldValue,
    makingPerGram,
    makingTotal,
    shopMargin,
    subtotal,
    vat,
    vatRate,
    vatableBase,
    totalWithVat,
    totalWithoutVat,
    premiumShare,
    instantResale: resale.estimatedPayout,
    instantLoss,
    instantLossPercent: paid > 0 ? (instantLoss / paid) * 100 : 0,
  }
}

// ===== Selling =====

/**
 * What a shop will realistically pay you for a piece.
 *
 * The making charge you originally paid is gone: shops buy by weight and karat
 * and do not pay for craftsmanship, however fine. Nor is VAT recoverable by a
 * private individual. Both facts are reflected by simply not appearing here.
 */
export function computeSell(
  input: SellInput,
  market: MarketSnapshot,
  rateCard: RateCard
): SellBreakdown {
  const weightGrams = Math.max(0, input.weightGrams || 0)
  const perGramPure = pricePerGramPure(market)
  const pricePerGram24 = perGramPure * getPurity(24)
  const pricePerGramKarat = perGramPure * getPurity(input.karat)

  const marketValue = pricePerGramKarat * weightGrams

  const factor = Math.min(1, Math.max(0, rateCard.buybackFactor))
  const flatDeduction = Math.max(0, rateCard.buybackDeductionPerGram) * weightGrams
  const estimatedPayout = Math.max(0, marketValue * factor - flatDeduction)

  const deduction = marketValue - estimatedPayout

  const original = input.originalPurchasePrice ?? null
  const profitLoss = original !== null ? estimatedPayout - original : null

  return {
    pricePerGram24,
    pricePerGramKarat,
    marketValue,
    deduction,
    deductionPercent: marketValue > 0 ? (deduction / marketValue) * 100 : 0,
    estimatedPayout,
    bestCasePayout: marketValue * BUYBACK_BEST_FACTOR,
    worstCasePayout: marketValue * BUYBACK_WORST_FACTOR,
    profitLoss,
    profitLossPercent:
      profitLoss !== null && original !== null && original > 0
        ? (profitLoss / original) * 100
        : null,
  }
}

// ===== Is the shop's quote fair? =====

const VERDICT_THRESHOLDS: { max: number; verdict: FairnessVerdict }[] = [
  { max: -5, verdict: 'great' },
  { max: 5, verdict: 'fair' },
  { max: 15, verdict: 'high' },
  { max: Infinity, verdict: 'overpriced' },
]

/**
 * Compare a shop's actual quote against what the piece should cost.
 *
 * The useful output isn't the verdict — it's `impliedMakingPerGram`, the making
 * charge the shop is really charging once the metal value is stripped out. That
 * single number is what makes two shops comparable, and it's what to negotiate
 * on.
 */
/** A figure the market doesn't pin to one value: where it usually falls. */
export interface Range {
  low: number
  typical: number
  high: number
}

export interface BuyRange {
  low: BuyBreakdown
  typical: BuyBreakdown
  high: BuyBreakdown
  /** One gram of metal at this karat, before any workmanship or tax. */
  metalPerGram: number
  /** Workmanship per gram across the three bands. */
  makingPerGram: Range
  /** VAT per gram at the typical band. */
  vatPerGram: number
  /** All-in price of one gram, VAT included, across the three bands. */
  perGram: Range
  /** What a shop would pay per gram if you sold it straight back. */
  resalePerGram: Range
}

/**
 * The buy price as a range, per gram and for the piece.
 *
 * The workmanship a shop charges varies more between shops than anything else
 * in the price, and the buyer can't know in advance which end a given shop
 * sits at. So instead of asking them to pick a band, this prices all three and
 * lets the screen say "usually between X and Y" — the honest answer.
 *
 * Per-gram figures don't depend on weight, with one exception: bars and coins
 * are priced by weight tier. A piece with no weight entered yet is priced as a
 * single gram, so the dashboard has something to show before the user has
 * typed anything.
 */
export function buyRange(input: BuyInput, market: MarketSnapshot, rateCard: RateCard): BuyRange {
  const low = computeBuy(input, market, rateCard, 'low')
  const typical = computeBuy(input, market, rateCard, 'typical')
  const high = computeBuy(input, market, rateCard, 'high')

  const hasWeight = (input.weightGrams || 0) > 0
  const unitInput: BuyInput = hasWeight ? input : { ...input, weightGrams: 1 }
  const unit = hasWeight
    ? { low, typical, high }
    : {
        low: computeBuy(unitInput, market, rateCard, 'low'),
        typical: computeBuy(unitInput, market, rateCard, 'typical'),
        high: computeBuy(unitInput, market, rateCard, 'high'),
      }

  const grams = unitInput.weightGrams * Math.max(1, Math.floor(unitInput.quantity || 1))
  const per = (value: number) => value / grams

  const metalPerGram = unit.typical.pricePerGramKarat

  return {
    low,
    typical,
    high,
    metalPerGram,
    makingPerGram: {
      low: unit.low.makingPerGram,
      typical: unit.typical.makingPerGram,
      high: unit.high.makingPerGram,
    },
    vatPerGram: per(unit.typical.vat),
    perGram: {
      low: per(unit.low.totalWithVat),
      typical: per(unit.typical.totalWithVat),
      high: per(unit.high.totalWithVat),
    },
    resalePerGram: {
      low: metalPerGram * BUYBACK_TYPICAL.low,
      typical: metalPerGram * ((BUYBACK_TYPICAL.low + BUYBACK_TYPICAL.high) / 2),
      high: metalPerGram * BUYBACK_TYPICAL.high,
    },
  }
}

export interface SellRange {
  /** One gram of metal at this karat, at the market price. */
  metalPerGram: number
  /** What a shop usually pays you for each gram. */
  perGram: Range
  /** What a shop usually pays you for the whole piece. */
  total: Range
  /** Against what you paid, when that is known. */
  profitLoss: Range | null
}

/**
 * What selling is likely to pay, as the band shops usually offer.
 *
 * Replaces a single payout computed from a buy-back percentage the seller had
 * to type in. They never know that percentage, so the screen now states the
 * range a typical shop lands in — 98% to 99.5% of metal value — and lets them
 * judge an offer against it.
 */
export function sellRange(input: SellInput, market: MarketSnapshot): SellRange {
  const weightGrams = Math.max(0, input.weightGrams || 0)
  const metalPerGram = pricePerGramPure(market) * getPurity(input.karat)

  const typicalFactor = (BUYBACK_TYPICAL.low + BUYBACK_TYPICAL.high) / 2
  const perGram: Range = {
    low: metalPerGram * BUYBACK_TYPICAL.low,
    typical: metalPerGram * typicalFactor,
    high: metalPerGram * BUYBACK_TYPICAL.high,
  }
  const total: Range = {
    low: perGram.low * weightGrams,
    typical: perGram.typical * weightGrams,
    high: perGram.high * weightGrams,
  }

  const original = input.originalPurchasePrice
  const profitLoss =
    original !== null && original !== undefined && original > 0
      ? {
          low: total.low - original,
          typical: total.typical - original,
          high: total.high - original,
        }
      : null

  return { metalPerGram, perGram, total, profitLoss }
}

export function analyzeQuote(
  input: BuyInput,
  market: MarketSnapshot,
  rateCard: RateCard,
  quotedTotal: number,
  quotedIncludesVat: boolean
): FairnessCheck {
  const typical = computeBuy(input, market, rateCard, 'typical')
  const low = computeBuy(input, market, rateCard, 'low')

  const fairTotal = quotedIncludesVat ? typical.totalWithVat : typical.totalWithoutVat
  const difference = quotedTotal - fairTotal
  const differencePercent = fairTotal > 0 ? (difference / fairTotal) * 100 : 0

  // Strip VAT and metal value back out of the quote to expose the workmanship.
  const quotedExVat = quotedIncludesVat ? quotedTotal / (1 + typical.vatRate) : quotedTotal
  const quantity = Math.max(1, Math.floor(input.quantity || 1))
  const totalWeight = Math.max(0, input.weightGrams || 0) * quantity
  const impliedMakingPerGram =
    totalWeight > 0 ? (quotedExVat - typical.goldValue) / totalWeight : 0

  const verdict =
    VERDICT_THRESHOLDS.find((t) => differencePercent <= t.max)?.verdict ?? 'overpriced'

  const suggestedTarget = quotedIncludesVat ? low.totalWithVat : low.totalWithoutVat

  return {
    verdict,
    difference,
    differencePercent,
    impliedMakingPerGram,
    messageAr: verdictMessage(verdict, impliedMakingPerGram, market.currency.symbolAr),
    suggestedTarget,
  }
}

function verdictMessage(
  verdict: FairnessVerdict,
  impliedMakingPerGram: number,
  symbol: string
): string {
  const making = `${impliedMakingPerGram.toFixed(0)} ${symbol}/جم`

  switch (verdict) {
    case 'great':
      return `عرض ممتاز — المصنعية الفعلية ${making}، وهي أقل من المتوسط المتوقع لهذا النوع. لو العيار والوزن مؤكدين، هذي صفقة جيدة.`
    case 'fair':
      return `سعر منطقي — المصنعية الفعلية ${making}، قريبة من المتوقع. تقدر تفاوض شوي لكن ما أنت مغبون.`
    case 'high':
      return `أعلى من المتوقع — المصنعية الفعلية ${making}. فاوض على المصنعية تحديداً، أو قارن مع محل ثاني قبل ما تشتري.`
    case 'overpriced':
      return `السعر مرتفع بشكل واضح — المصنعية الفعلية ${making}. لا تشتري قبل ما تقارن مع محلين على الأقل، واطلب تفصيل الفاتورة.`
  }
}

/**
 * Break a quoted total back down into its parts. Useful when a shop gives you
 * one number and refuses to itemise the invoice.
 */
export function reverseEngineerQuote(
  quotedTotal: number,
  quotedIncludesVat: boolean,
  input: BuyInput,
  market: MarketSnapshot
): { goldValue: number; makingTotal: number; makingPerGram: number; vat: number } {
  const quantity = Math.max(1, Math.floor(input.quantity || 1))
  const totalWeight = Math.max(0, input.weightGrams || 0) * quantity
  const vatRate = isZeroRatedInvestmentGold(input.pieceType, input.karat)
    ? 0
    : market.currency.vatRate

  const exVat = quotedIncludesVat ? quotedTotal / (1 + vatRate) : quotedTotal
  const vat = quotedIncludesVat ? quotedTotal - exVat : quotedTotal * vatRate
  const goldValue = pricePerGram(market, input.karat) * totalWeight
  const makingTotal = exVat - goldValue

  return {
    goldValue,
    makingTotal,
    makingPerGram: totalWeight > 0 ? makingTotal / totalWeight : 0,
    vat,
  }
}
