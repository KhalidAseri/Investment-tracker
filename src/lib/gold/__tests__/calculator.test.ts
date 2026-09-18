import { describe, expect, it } from 'vitest'
import {
  analyzeQuote,
  computeBuy,
  computeSell,
  isZeroRatedInvestmentGold,
  priceBoard,
  pricePerGram,
  reverseEngineerQuote,
} from '../calculator'
import { GRAMS_PER_TROY_OUNCE, getCurrency } from '../constants'
import { DEFAULT_RATE_CARD } from '../rate-card'
import type { BuyInput, MarketSnapshot, RateCard } from '../types'

// A fixed market so every expected number below can be worked out by hand.
// $4000/oz with SAR at its 3.75 peg gives a round-ish pure-gram price:
//   4000 / 31.1034768 * 3.75 = 482.26 SAR per gram of pure gold.
const market: MarketSnapshot = {
  spot: {
    usdPerOunce: 4000,
    source: 'test',
    sourceLabelAr: 'اختبار',
    fetchedAt: new Date().toISOString(),
    isStale: false,
  },
  fx: { perUsd: 3.75, source: 'peg', fetchedAt: new Date().toISOString(), isStale: false },
  currency: getCurrency('SAR'),
}

const PURE_GRAM_SAR = (4000 / GRAMS_PER_TROY_OUNCE) * 3.75

const rateCard: RateCard = { ...DEFAULT_RATE_CARD }

const baseInput: BuyInput = {
  karat: 21,
  weightGrams: 10,
  pieceType: 'chain',
  origin: 'saudi',
  quantity: 1,
}

describe('per-gram pricing', () => {
  it('converts a troy-ounce spot price into a per-gram karat price', () => {
    // 21K is 875 fine, so a gram costs 87.5% of a pure gram.
    expect(pricePerGram(market, 21)).toBeCloseTo(PURE_GRAM_SAR * 0.875, 6)
    expect(pricePerGram(market, 18)).toBeCloseTo(PURE_GRAM_SAR * 0.75, 6)
  })

  it('prices 24K just below a theoretically pure gram', () => {
    // 24K jewellery is 999 fine, not 1000 — the distinction is small but real.
    expect(pricePerGram(market, 24)).toBeLessThan(PURE_GRAM_SAR)
    expect(pricePerGram(market, 24)).toBeCloseTo(PURE_GRAM_SAR * 0.999, 6)
  })

  it('ranks the karat ladder from purest to least pure', () => {
    const board = priceBoard(market)
    const prices = board.map((row) => row.perGram)
    expect(prices).toEqual([...prices].sort((a, b) => b - a))
  })
})

describe('VAT treatment', () => {
  it('zero-rates investment bars and coins at 99%+ purity', () => {
    expect(isZeroRatedInvestmentGold('bar', 24)).toBe(true)
    expect(isZeroRatedInvestmentGold('coin', 24)).toBe(true)
  })

  it('taxes 24K jewellery despite its purity', () => {
    // The exemption needs purity AND investment form AND investment purpose.
    // A pure gold necklace fails the second and third tests.
    expect(isZeroRatedInvestmentGold('necklace', 24)).toBe(false)
    expect(isZeroRatedInvestmentGold('ring', 24)).toBe(false)
  })

  it('taxes bars below 99% purity', () => {
    expect(isZeroRatedInvestmentGold('bar', 22)).toBe(false)
  })

  it('charges VAT on the whole invoice, not just the making charge', () => {
    const result = computeBuy(baseInput, market, rateCard)
    expect(result.vatableBase).toBeCloseTo(result.subtotal, 6)
    expect(result.vat).toBeCloseTo(result.subtotal * 0.15, 6)
    // The common misconception would give a far smaller number.
    expect(result.vat).toBeGreaterThan(result.makingTotal * 0.15)
  })

  it('applies no VAT to a 24K bar', () => {
    const result = computeBuy(
      { ...baseInput, pieceType: 'bar', karat: 24, weightGrams: 50 },
      market,
      rateCard
    )
    expect(result.vatRate).toBe(0)
    expect(result.vat).toBe(0)
    expect(result.totalWithVat).toBeCloseTo(result.totalWithoutVat, 6)
  })
})

describe('computeBuy', () => {
  it('adds up to the stated total', () => {
    const r = computeBuy(baseInput, market, rateCard)
    expect(r.subtotal).toBeCloseTo(r.goldValue + r.makingTotal + r.shopMargin, 6)
    expect(r.totalWithVat).toBeCloseTo(r.subtotal + r.vat, 6)
  })

  it('scales gold value with quantity', () => {
    const one = computeBuy(baseInput, market, rateCard)
    const three = computeBuy({ ...baseInput, quantity: 3 }, market, rateCard)
    expect(three.goldValue).toBeCloseTo(one.goldValue * 3, 6)
    expect(three.totalWithVat).toBeCloseTo(one.totalWithVat * 3, 6)
  })

  it('charges more for Italian workmanship than Saudi', () => {
    const saudi = computeBuy(baseInput, market, rateCard)
    const italian = computeBuy({ ...baseInput, origin: 'italian' }, market, rateCard)
    expect(italian.makingPerGram).toBeGreaterThan(saudi.makingPerGram)
    expect(italian.goldValue).toBeCloseTo(saudi.goldValue, 6)
  })

  it('charges more for a handmade murtaisha than a machine chain', () => {
    const chain = computeBuy(baseInput, market, rateCard)
    const murtaisha = computeBuy({ ...baseInput, pieceType: 'murtaisha' }, market, rateCard)
    expect(murtaisha.makingPerGram).toBeGreaterThan(chain.makingPerGram * 2)
  })

  it('orders the making-charge bands low < typical < high', () => {
    const low = computeBuy(baseInput, market, rateCard, 'low')
    const typical = computeBuy(baseInput, market, rateCard, 'typical')
    const high = computeBuy(baseInput, market, rateCard, 'high')
    expect(low.makingTotal).toBeLessThan(typical.makingTotal)
    expect(typical.makingTotal).toBeLessThan(high.makingTotal)
  })

  it('keeps a bullion bar close to raw metal value', () => {
    const bar = computeBuy(
      { ...baseInput, pieceType: 'bar', karat: 24, weightGrams: 100 },
      market,
      rateCard
    )
    // A 100g bar should carry roughly a 1% premium, never a per-gram making charge.
    expect(bar.premiumShare).toBeLessThan(0.02)
  })

  it('leaves a full bridal set carrying a large craftsmanship premium', () => {
    const set = computeBuy({ ...baseInput, pieceType: 'set' }, market, rateCard)
    expect(set.premiumShare).toBeGreaterThan(0.08)
  })

  describe('making charge overrides', () => {
    it('applies a per-gram override directly', () => {
      const card: RateCard = { ...rateCard, makingChargeOverride: 30, makingChargeMode: 'perGram' }
      const r = computeBuy({ ...baseInput, weightGrams: 10, quantity: 2 }, market, card)
      expect(r.makingTotal).toBeCloseTo(30 * 20, 6)
      expect(r.makingPerGram).toBeCloseTo(30, 6)
    })

    it('applies a flat override once per piece', () => {
      const card: RateCard = { ...rateCard, makingChargeOverride: 250, makingChargeMode: 'flat' }
      const r = computeBuy({ ...baseInput, quantity: 3 }, market, card)
      expect(r.makingTotal).toBeCloseTo(750, 6)
    })

    it('applies a percent override against gold value', () => {
      const card: RateCard = { ...rateCard, makingChargeOverride: 0.2, makingChargeMode: 'percent' }
      const r = computeBuy(baseInput, market, card)
      expect(r.makingTotal).toBeCloseTo(r.goldValue * 0.2, 6)
    })
  })

  it('reports an immediate loss on a jewellery purchase', () => {
    // Making charge plus VAT is unrecoverable, so resale is always below cost.
    const r = computeBuy(baseInput, market, rateCard)
    expect(r.instantResale).toBeLessThan(r.totalWithVat)
    expect(r.instantLoss).toBeGreaterThan(0)
  })

  it('loses far less on a bar than on a bridal set', () => {
    const bar = computeBuy(
      { ...baseInput, pieceType: 'bar', karat: 24, weightGrams: 100 },
      market,
      rateCard
    )
    const set = computeBuy({ ...baseInput, pieceType: 'set', weightGrams: 100 }, market, rateCard)
    expect(bar.instantLossPercent).toBeLessThan(set.instantLossPercent)
  })

  it('handles zero weight without dividing by zero', () => {
    const r = computeBuy({ ...baseInput, weightGrams: 0 }, market, rateCard)
    expect(r.goldValue).toBe(0)
    expect(r.makingPerGram).toBe(0)
    expect(Number.isFinite(r.instantLossPercent)).toBe(true)
  })

  it('treats a missing or zero quantity as one piece', () => {
    const r = computeBuy({ ...baseInput, quantity: 0 }, market, rateCard)
    const one = computeBuy({ ...baseInput, quantity: 1 }, market, rateCard)
    expect(r.totalWithVat).toBeCloseTo(one.totalWithVat, 6)
  })
})

describe('computeSell', () => {
  it('pays a share of market value and nothing for craftsmanship', () => {
    const r = computeSell({ karat: 21, weightGrams: 10 }, market, rateCard)
    expect(r.marketValue).toBeCloseTo(pricePerGram(market, 21) * 10, 6)
    expect(r.estimatedPayout).toBeCloseTo(r.marketValue * rateCard.buybackFactor, 6)
  })

  it('pays the same for an ornate piece as for scrap of equal weight and karat', () => {
    // This is the hard truth the app exists to communicate.
    const a = computeSell({ karat: 21, weightGrams: 25 }, market, rateCard)
    const b = computeSell({ karat: 21, weightGrams: 25 }, market, rateCard)
    expect(a.estimatedPayout).toBeCloseTo(b.estimatedPayout, 6)
  })

  it('brackets the estimate between the best and worst case', () => {
    const r = computeSell({ karat: 21, weightGrams: 10 }, market, rateCard)
    expect(r.worstCasePayout).toBeLessThan(r.estimatedPayout)
    expect(r.estimatedPayout).toBeLessThan(r.bestCasePayout)
    expect(r.bestCasePayout).toBeLessThanOrEqual(r.marketValue)
  })

  it('subtracts a flat per-gram deduction on top of the factor', () => {
    const card: RateCard = { ...rateCard, buybackFactor: 1, buybackDeductionPerGram: 5 }
    const r = computeSell({ karat: 21, weightGrams: 10 }, market, card)
    expect(r.estimatedPayout).toBeCloseTo(r.marketValue - 50, 6)
  })

  it('never returns a negative payout', () => {
    const card: RateCard = { ...rateCard, buybackFactor: 0.5, buybackDeductionPerGram: 100000 }
    const r = computeSell({ karat: 21, weightGrams: 1 }, market, card)
    expect(r.estimatedPayout).toBe(0)
  })

  it('reports profit against the original purchase price when given one', () => {
    const r = computeSell(
      { karat: 21, weightGrams: 10, originalPurchasePrice: 1000 },
      market,
      rateCard
    )
    expect(r.profitLoss).toBeCloseTo(r.estimatedPayout - 1000, 6)
    expect(r.profitLossPercent).toBeCloseTo(((r.estimatedPayout - 1000) / 1000) * 100, 6)
  })

  it('omits profit when no purchase price is known', () => {
    const r = computeSell({ karat: 21, weightGrams: 10 }, market, rateCard)
    expect(r.profitLoss).toBeNull()
    expect(r.profitLossPercent).toBeNull()
  })
})

describe('analyzeQuote', () => {
  const quoteFor = (total: number) => analyzeQuote(baseInput, market, rateCard, total, true)

  it('calls a quote matching the model fair', () => {
    const fair = computeBuy(baseInput, market, rateCard).totalWithVat
    expect(quoteFor(fair).verdict).toBe('fair')
  })

  it('calls a clearly cheap quote great', () => {
    const fair = computeBuy(baseInput, market, rateCard).totalWithVat
    expect(quoteFor(fair * 0.85).verdict).toBe('great')
  })

  it('calls a clearly expensive quote overpriced', () => {
    const fair = computeBuy(baseInput, market, rateCard).totalWithVat
    expect(quoteFor(fair * 1.4).verdict).toBe('overpriced')
  })

  it('recovers the making charge the shop is really charging', () => {
    // Build a quote from known parts, then check we can take it apart again.
    const goldValue = pricePerGram(market, 21) * 10
    const making = 40 * 10
    const quoted = (goldValue + making) * 1.15
    expect(quoteFor(quoted).impliedMakingPerGram).toBeCloseTo(40, 4)
  })

  it('suggests a negotiation target below the typical price', () => {
    const fair = computeBuy(baseInput, market, rateCard).totalWithVat
    const check = quoteFor(fair * 1.2)
    expect(check.suggestedTarget).toBeLessThan(fair)
  })

  it('handles a VAT-exclusive quote', () => {
    const exVat = computeBuy(baseInput, market, rateCard).totalWithoutVat
    const check = analyzeQuote(baseInput, market, rateCard, exVat, false)
    expect(check.verdict).toBe('fair')
  })
})

describe('reverseEngineerQuote', () => {
  it('splits a lump-sum quote into metal, craftsmanship and tax', () => {
    const goldValue = pricePerGram(market, 21) * 10
    const making = 25 * 10
    const quoted = (goldValue + making) * 1.15

    const r = reverseEngineerQuote(quoted, true, baseInput, market)
    expect(r.goldValue).toBeCloseTo(goldValue, 4)
    expect(r.makingTotal).toBeCloseTo(making, 4)
    expect(r.makingPerGram).toBeCloseTo(25, 4)
    expect(r.goldValue + r.makingTotal + r.vat).toBeCloseTo(quoted, 4)
  })

  it('adds VAT on top when the quote excludes it', () => {
    const r = reverseEngineerQuote(1000, false, baseInput, market)
    expect(r.vat).toBeCloseTo(150, 6)
  })

  it('charges no tax when reversing an investment bar quote', () => {
    const r = reverseEngineerQuote(
      10000,
      true,
      { ...baseInput, pieceType: 'bar', karat: 24 },
      market
    )
    expect(r.vat).toBe(0)
  })
})

describe('currency handling', () => {
  it('prices the same gram consistently across pegged currencies', () => {
    const aed = getCurrency('AED')
    const aedMarket: MarketSnapshot = {
      ...market,
      fx: { perUsd: aed.pegPerUsd, source: 'peg', fetchedAt: '', isStale: false },
      currency: aed,
    }
    // Converting the SAR price through USD must land on the AED price.
    const sarPerGram = pricePerGram(market, 21)
    const aedPerGram = pricePerGram(aedMarket, 21)
    expect(aedPerGram).toBeCloseTo((sarPerGram / 3.75) * aed.pegPerUsd, 6)
  })

  it('applies the local VAT rate of the selected market', () => {
    const aed = getCurrency('AED')
    const aedMarket: MarketSnapshot = {
      ...market,
      fx: { perUsd: aed.pegPerUsd, source: 'peg', fetchedAt: '', isStale: false },
      currency: aed,
    }
    expect(computeBuy(baseInput, aedMarket, rateCard).vatRate).toBe(0.05)
  })

  it('converts the SAR-denominated making charge into the selected currency', () => {
    const aed = getCurrency('AED')
    const aedMarket: MarketSnapshot = {
      ...market,
      fx: { perUsd: aed.pegPerUsd, source: 'peg', fetchedAt: '', isStale: false },
      currency: aed,
    }
    const sar = computeBuy(baseInput, market, rateCard).makingPerGram
    const inAed = computeBuy(baseInput, aedMarket, rateCard).makingPerGram
    expect(inAed).toBeCloseTo((sar / 3.75) * aed.pegPerUsd, 6)
  })
})
