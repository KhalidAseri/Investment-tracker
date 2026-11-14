// Core data model. One versioned store, ids + updatedAt on every record
// so a cloud sync layer can be added later without reshaping the data.

export type Locale = 'ar' | 'en'
export type AssetClass = 'EQUITY' | 'FIXED_INCOME' | 'CASH' | 'GOLD' | 'REAL_ESTATE' | 'CRYPTO' | 'OTHER'
export type Region = 'SA' | 'US' | 'DEV' | 'EM' | 'GCC' | 'GLOBAL' | 'NONE'
export type Pricing = 'live' | 'manual'
export type ZakatMode = 'FULL' | 'PERCENT' | 'PER_UNIT' | 'AMOUNT' | 'COMPANY_PAYS' | 'EXEMPT'
export type Liquidity = 'HIGH' | 'MEDIUM' | 'LOW'
export type AccountKind = 'BROKERAGE' | 'EMPLOYER' | 'ROBO' | 'BANK' | 'OTHER'
export type TxType = 'BUY' | 'SELL' | 'DIVIDEND' | 'DEPOSIT' | 'WITHDRAW' | 'VALUE_UPDATE'
export type ReviewFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI' | 'ANNUAL'
export type RiskProfile = 'CONSERVATIVE' | 'BALANCED' | 'GROWTH' | 'CUSTOM'

export interface Account {
  id: string
  name: string
  kind: AccountKind
  createdAt: string
  updatedAt: string
}

export interface Asset {
  id: string
  accountId: string
  name: string
  symbol: string | null
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  pricing: Pricing
  /** Multiplier applied to the quote price (e.g. gold oz -> gram of a given karat). */
  priceFactor: number
  quantity: number
  /** Total invested, in the asset currency. */
  costBasis: number
  /** Current value in the asset currency for manual assets (also last-known fallback for live). */
  manualValue: number
  /** Unit price typed in by the user for a live asset; used only while no quote is available. */
  lastPrice?: number
  valueUpdatedAt: string
  isFund: boolean
  isEmergencyFund: boolean
  /** Cash set aside as the income account the monthly salary is paid from. */
  isIncomeAccount?: boolean
  zakatMode: ZakatMode
  /** PERCENT: share of market value treated as zakatable. */
  zakatPercent: number
  /** PER_UNIT: zakat owed per share/unit, in the asset currency. */
  zakatPerUnit?: number
  /** AMOUNT: a yearly zakat amount in SAR entered by the user. */
  zakatAmount?: number
  domicile: string
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  assetId: string
  type: TxType
  date: string
  quantity: number
  price: number
  /** Cash amount of the transaction in the asset currency. */
  amount: number
  note: string
  /** Deltas applied to the asset, stored so a delete can reverse them exactly. */
  dQty: number
  dCost: number
  dValue: number
  createdAt: string
}

export interface Snapshot {
  /** YYYY-MM — one snapshot per month, last value wins. */
  month: string
  date: string
  netWorth: number
  invested: number
  /** Net worth minus the emergency fund; absent on snapshots from older versions. */
  investable?: number
}

export interface Review {
  id: string
  date: string
  netWorth: number
  note: string
}

export interface ZakatYear {
  date: string
  /** Investable portfolio value on the day. */
  value: number
  planned: number
  actual: number
  /** Income fixed for the following year. */
  income: number
  items: { name: string; amount: number }[]
}

export interface Settings {
  locale: Locale
  hideAmounts: boolean
  onboarded: boolean
  monthlyExpenses: number
  monthlyIncome: number
  monthlyContribution: number
  emergencyMonths: number
  riskProfile: RiskProfile
  targetsSet: boolean
  /** Target allocation by asset class, percent, sums to 100. */
  targets: Record<AssetClass, number>
  goal: {
    mode: 'AMOUNT' | 'INCOME'
    amount: number
    monthlyIncome: number
    targetYear: number
    expectedReturn: number
    inflation: number
  }
  income: {
    /** Real growth the user wants the portfolio to keep, percent per year. Income is what is left after it. */
    growthTarget: number
    /** Zakat assumed while planning, percent of the whole portfolio. The actual figure comes from the assets on zakat day. */
    planZakatRate: number
    /** Years of income kept in the low-volatility reserve layer. */
    reserveYears: number
    /** Market drop (percent from the 12-month peak) at which refills come from the reserve instead of sales. */
    drawdownTrigger: number
    /** Fixed annual income set at the last yearly transfer; 0 until the first one. */
    annualIncome: number
    /** Income rate (percent of the portfolio) that the last transfer was based on. */
    lastRate: number
    lastTransferDate: string
  }
  zakat: {
    hawlDate: string
    calendar: 'HIJRI' | 'GREGORIAN'
    goldPricePerGram: number
    lastPaidDate: string
    lastPaidAmount: number
    /** One record per zakat day, newest first. */
    history: ZakatYear[]
  }
  review: { frequency: ReviewFrequency; lastReviewAt: string }
  /** Value of 1 unit of a foreign currency in SAR. */
  fx: Record<string, number>
  /** Approximate look-through of a global equity fund, percent. */
  lookThrough: { US: number; DEV: number; EM: number }
  shariahFirst: boolean
  roadmap: { debtFree: boolean; employerMatch: boolean; automated: boolean }
}

export interface AppData {
  version: 3
  settings: Settings
  accounts: Account[]
  assets: Asset[]
  transactions: Transaction[]
  snapshots: Snapshot[]
  reviews: Review[]
}

export interface Quote {
  symbol: string
  price: number
  change: number
  changePercent: number
  currency: string
  name: string
  updatedAt: string
}

export type Quotes = Record<string, Quote>
/** Picks the string for the active locale. */
export type Pick2 = (ar: string, en: string) => string
