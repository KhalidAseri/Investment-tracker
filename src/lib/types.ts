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
  note: string | null
  sort: number
}

export interface Holding {
  id: string
  user_id?: string
  account_id: string | null
  sleeve_id: string | null
  name: string
  symbol: string | null
  price_source: 'manual' | 'yahoo' | 'ibkr'
  currency: string
  quantity: number
  price: number
  price_updated_at: string | null
  ibkr_conid: string | null
  cost_basis: number | null
  note: string | null
  archived: boolean
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
  source: 'manual' | 'ibkr' | 'planner'
  external_id: string | null
  created_at?: string
}

export type EventKind = 'bonus' | 'advance' | 'vacation_bonus' | 'vesting' | 'zakat' | 'review' | 'withdrawal' | 'deposit' | 'other'

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
