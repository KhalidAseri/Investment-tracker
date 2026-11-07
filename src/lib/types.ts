export type Layer = 'safety' | 'income' | 'growth' | 'hedge'

export interface PlanSettings {
  user_id: string
  monthly_income_target: number
  withdrawal_rate: number
  safe_withdrawal_rate: number
  inflation_rate: number
  expected_return: number
  return_low: number
  return_high: number
  annual_contribution: number
  contribution_growth: number
  birth_year: number
  independence_year: number
  glide_start_year: number
  rebalance_band: number
  reserve_months: number
  guard_drawdown: number
  guard_cut: number
  guard_high_rate: number
  guard_low_rate: number
  include_mortgage: boolean
  mortgage_monthly: number
  mortgage_end_year: number
  baseline_value: number | null
  baseline_date: string | null
  extra: Record<string, unknown>
  income_method: 'value' | 'profit' | 'fixed'
  income_profit_share: number
  income_fixed_monthly: number | null
  income_transfer_day: number
  income_review_month: number
  income_start_year: number | null
  income_approved_annual: number | null
  income_approved_year: number | null
  /** typical monthly amount invested from salary; null = varies month to month */
  monthly_invest: number | null
  deposit_day: number
  contribution_mode: 'auto' | 'manual'
  reserve_account_id: string | null
  stock_cap: number
  /** Yahoo symbol of the index the portfolio is compared against */
  benchmark_symbol: string | null
  updated_at?: string
}

export interface Sleeve {
  id: string
  user_id?: string
  name: string
  layer: Layer
  target_now: number
  target_fi: number
  accepts_new_money: boolean
  expected_return: number | null
  yield_pct: number | null
  zakat_rate: number
  note: string | null
  sort: number
}

export interface Account {
  id: string
  user_id?: string
  name: string
  kind: 'broker' | 'bank' | 'savings_program' | 'other'
  is_ibkr: boolean
  exclude_from_portfolio: boolean
  /** where the custodian sits: inside Saudi Arabia or abroad */
  country: 'SA' | 'INTL'
  note: string | null
  sort: number
}

export type Region = 'SA' | 'GCC' | 'US' | 'GLOBAL' | 'EM' | 'OTHER'

export interface Holding {
  id: string
  user_id?: string
  account_id: string | null
  sleeve_id: string | null
  name: string
  symbol: string | null
  price_source: 'manual' | 'yahoo' | 'ibkr' | 'nav'
  currency: string
  quantity: number
  price: number
  price_updated_at: string | null
  ibkr_conid: string | null
  /** total paid for the current units, in SAR */
  cost_basis: number | null
  /** yearly management fee, % of value */
  fee_pct: number | null
  /** share of dividends that must be given away for purification, % */
  purification_pct: number | null
  region: Region | null
  note: string | null
  archived: boolean
  zakatable: boolean
  /** start of this holding's zakat year (haul), anniversaries follow the Hijri calendar */
  zakat_start: string | null
  payout_freq: 'none' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'
  payout_next: string | null
  /** 'rate' = annual % of value (or of nominal value if set); 'per_unit' = fixed SAR per unit per payment */
  payout_basis: 'rate' | 'per_unit'
  payout_rate: number | null
  payout_per_unit: number | null
  payout_nominal: number | null
  maturity_date: string | null
  /** belongs to a goal portfolio instead of the independence portfolio */
  goal_id: string | null
  goal_bucket: string | null
  sort: number
}

export type TxKind = 'deposit' | 'buy' | 'sell' | 'dividend' | 'withdrawal' | 'fee' | 'tax' | 'zakat' | 'transfer' | 'income'

export interface Transaction {
  id: string
  user_id?: string
  account_id: string | null
  holding_id: string | null
  sleeve_id: string | null
  tx_date: string
  kind: TxKind
  amount_sar: number
  quantity: number | null
  price: number | null
  currency: string
  note: string | null
  source: 'manual' | 'ibkr' | 'planner' | 'import'
  external_id: string | null
  created_at?: string
}

export type EventKind = 'bonus' | 'advance' | 'vacation_bonus' | 'vesting' | 'zakat' | 'review' | 'withdrawal' | 'deposit' | 'other' | 'payout'

export interface MoneyEvent {
  id: string
  user_id?: string
  title: string
  kind: EventKind
  event_date: string
  amount: number | null
  recurrence: 'none' | 'monthly' | 'yearly'
  done: boolean
  note: string | null
}

export interface Snapshot {
  user_id?: string
  snap_date: string
  total_sar: number
  by_sleeve: Record<string, number>
  by_account: Record<string, number>
}

export interface IbkrConnection {
  user_id: string
  query_id: string | null
  last_sync_at: string | null
  last_status: string | null
  last_message: string | null
}

export type Fx = Record<string, number>

export interface WatchItem {
  id: string
  user_id?: string
  name: string
  symbol: string | null
  currency: string
  price: number | null
  price_updated_at: string | null
  fair_value: number | null
  margin_pct: number
  c_size: boolean
  c_shariah: boolean
  c_quality: boolean
  c_thesis: boolean
  thesis: string | null
  exit_rule: string | null
  note: string | null
  sort: number
}

export interface Viewer {
  id: string
  owner_id: string
  viewer_email: string
  created_at: string
}

export type StreamKind = 'bonus' | 'vacation_bonus' | 'advance' | 'savings_program' | 'side' | 'rent' | 'other'
export interface IncomeStream {
  id: string
  user_id?: string
  name: string
  kind: StreamKind
  amount: number
  frequency: 'monthly' | 'yearly' | 'once' | 'irregular'
  month: number | null
  next_date: string | null
  invest_pct: number
  note: string | null
  sort: number
}

export type DebtKind = 'mortgage' | 'personal_loan' | 'advance' | 'car' | 'card' | 'other'
export interface Obligation {
  id: string
  user_id?: string
  name: string
  kind: DebtKind
  monthly_amount: number
  end_year: number | null
  /** remaining balance owed, SAR; null = a recurring commitment with no balance */
  balance: number | null
  balance_date: string | null
  rate_pct: number | null
  note: string | null
  sort: number
}

export type OtherAssetKind = 'real_estate' | 'land' | 'vehicle' | 'business' | 'other'
export interface OtherAsset {
  id: string
  user_id?: string
  name: string
  kind: OtherAssetKind
  value: number
  value_date: string | null
  appreciation_pct: number | null
  note: string | null
  sort: number
}

export interface GoalBucket { key: string; name: string; weight: number }
export interface Goal {
  id: string
  user_id?: string
  name: string
  target_amount: number
  target_date: string | null
  expected_return: number
  allocation: GoalBucket[]
  priority: number
  note: string | null
  archived: boolean
  sort: number
}
