interface HoldingWithPrice {
  shares: number
  averageCost: number
  currentPrice: number
  currency: string
}

export function calcTotalCost(holding: HoldingWithPrice): number {
  return holding.shares * holding.averageCost
}

export function calcMarketValue(holding: HoldingWithPrice): number {
  return holding.shares * holding.currentPrice
}

export function calcGainLoss(holding: HoldingWithPrice): number {
  return calcMarketValue(holding) - calcTotalCost(holding)
}

export function calcGainLossPercent(holding: HoldingWithPrice): number {
  const cost = calcTotalCost(holding)
  if (cost === 0) return 0
  return ((calcMarketValue(holding) - cost) / cost) * 100
}

export function calcYieldOnCost(annualDividendPerShare: number, averageCost: number): number {
  if (averageCost === 0) return 0
  return (annualDividendPerShare / averageCost) * 100
}

export function calcCurrentYield(annualDividendPerShare: number, currentPrice: number): number {
  if (currentPrice === 0) return 0
  return (annualDividendPerShare / currentPrice) * 100
}

export function calcDividendGrowthRate(dividends: { amount: number; year: number }[]): number {
  if (dividends.length < 2) return 0

  const sorted = [...dividends].sort((a, b) => a.year - b.year)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const years = last.year - first.year

  if (years === 0 || first.amount === 0) return 0

  return (Math.pow(last.amount / first.amount, 1 / years) - 1) * 100
}

export function calcPortfolioAllocation(
  holdings: { value: number; label: string }[]
): { label: string; value: number; percentage: number }[] {
  const total = holdings.reduce((sum, h) => sum + h.value, 0)
  if (total === 0) return holdings.map((h) => ({ ...h, percentage: 0 }))

  return holdings.map((h) => ({
    ...h,
    percentage: (h.value / total) * 100,
  }))
}

export function calcCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100
}

export function convertCurrency(amount: number, rate: number): number {
  return amount * rate
}
