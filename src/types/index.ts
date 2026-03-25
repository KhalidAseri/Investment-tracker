export interface Account {
  id: string
  name: string
  nameAr: string
  type: string
  currency: string
  description: string | null
  createdAt: string
  updatedAt: string
  holdings?: Holding[]
  transactions?: Transaction[]
  _count?: {
    holdings: number
    transactions: number
  }
}

export interface Holding {
  id: string
  accountId: string
  symbol: string | null
  name: string
  nameAr: string | null
  shares: number
  averageCost: number
  currentValue: number | null
  targetAllocation: number | null
  sector: string | null
  indexTracked: string | null
  createdAt: string
  updatedAt: string
  account?: Account
  dividends?: Dividend[]
  // Calculated fields from market data
  currentPrice?: number
  marketValue?: number
  gainLoss?: number
  gainLossPercent?: number
  dailyChange?: number
  dailyChangePercent?: number
}

export interface Transaction {
  id: string
  accountId: string
  holdingId: string | null
  type: string
  symbol: string | null
  shares: number | null
  pricePerShare: number | null
  totalAmount: number
  currency: string
  date: string
  notes: string | null
  createdAt: string
  account?: Account
  holding?: Holding
}

export interface Dividend {
  id: string
  holdingId: string
  amount: number
  perShare: number
  exDate: string
  payDate: string
  currency: string
  createdAt: string
  holding?: Holding
}

export interface MarketQuote {
  symbol: string
  price: number
  change: number
  changePercent: number
  currency: string
  name: string
  updatedAt: string
  isStale: boolean
}

export interface PortfolioSummary {
  totalValue: number
  totalCost: number
  totalGainLoss: number
  totalGainLossPercent: number
  dailyChange: number
  dailyChangePercent: number
  annualDividendIncome: number
  accounts: AccountSummary[]
}

export interface AccountSummary {
  id: string
  name: string
  nameAr: string
  type: string
  totalValue: number
  totalCost: number
  gainLoss: number
  gainLossPercent: number
  holdingsCount: number
}

export type Locale = 'en' | 'ar'
