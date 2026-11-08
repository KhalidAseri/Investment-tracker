// Market data shapes shared by the engine (advisor.ts) and the market layer (market.ts, sustain.ts, lookthrough.ts).

/** US Treasury yields in % (the riyal is pegged to the dollar, so this is the reference curve). */
export interface Curve { m3: number; y5: number; y10: number; y30: number | null; as_of: string }

/** One month of a series: close, adjusted close (dividends reinvested) and dividends paid in the month. */
export interface MonthPoint { m: string /* 'YYYY-MM' */; c: number; a: number; d: number }

export interface MonthlySeries {
  symbol: string
  /** 'rate' = the value is a yield in % (e.g. ^IRX), not a price */
  kind: 'price' | 'nav' | 'rate'
  currency: string | null
  points: MonthPoint[]
  updated_at: string
}

/** Facts about a single listed instrument from the market data provider. */
export interface InstrumentProfile { symbol: string; quote_type: string | null; sector: string | null; industry: string | null; country: string | null; exchange: string | null }

/** Real market data the advisor uses to choose and size purchases. Keys are Yahoo symbols or Saudi fund ids. */
export interface MarketInputs {
  curve: Curve | null
  quotes: Record<string, { price: number; currency: string; as_of: string }>
  /** trailing-12-month distribution yield, % */
  yields: Record<string, number>
  /** total return over the last 12 months, % */
  returns1y: Record<string, number>
}

export const EMPTY_MARKET: MarketInputs = { curve: null, quotes: {}, yields: {}, returns1y: {} }
