import type { Account, AppData, Asset, Quotes, Transaction, TxType } from '../types.ts'

export interface AssetView {
  asset: Asset
  account: Account | null
  /** Unit price in the asset currency (live assets only). */
  price: number | null
  /** Everything below is in the base currency (SAR). */
  value: number
  cost: number
  gain: number
  gainPct: number
  dayChange: number
  source: 'live' | 'cached' | 'manual' | 'cost'
}

export interface PortfolioView {
  rows: AssetView[]
  netWorth: number
  investable: number
  emergency: number
  cost: number
  gain: number
  gainPct: number
  dayChange: number
  dayChangePct: number
  hasLive: boolean
}

const QUOTE_FRESH_MS = 24 * 60 * 60 * 1000

export function fxRate(currency: string, fx: Record<string, number>): number {
  if (!currency || currency === 'SAR') return 1
  return fx[currency] ?? 1
}

export function valueAsset(asset: Asset, quotes: Quotes, fx: Record<string, number>, now = Date.now()): Omit<AssetView, 'account'> {
  const rate = fxRate(asset.currency, fx)
  const cost = asset.costBasis * rate
  let value: number
  let price: number | null = null
  let dayChange = 0
  let source: AssetView['source']

  const quote = asset.pricing === 'live' && asset.symbol ? quotes[asset.symbol] : undefined
  if (quote && quote.price > 0) {
    const factor = asset.priceFactor || 1
    const qRate = fxRate(quote.currency || asset.currency, fx)
    price = quote.price * factor
    value = asset.quantity * price * qRate
    const fresh = now - new Date(quote.updatedAt).getTime() < QUOTE_FRESH_MS
    dayChange = fresh ? asset.quantity * quote.change * factor * qRate : 0
    source = fresh ? 'live' : 'cached'
  } else if (asset.pricing === 'live' && (asset.lastPrice ?? 0) > 0) {
    price = asset.lastPrice as number
    value = asset.quantity * price * rate
    source = 'manual'
  } else if (asset.manualValue > 0 || asset.pricing === 'manual') {
    value = asset.manualValue * rate
    source = 'manual'
  } else {
    value = cost
    source = 'cost'
  }

  const gain = value - cost
  return { asset, price, value, cost, gain, gainPct: cost > 0 ? (gain / cost) * 100 : 0, dayChange, source }
}

export function computeView(data: Pick<AppData, 'assets' | 'accounts' | 'settings'>, quotes: Quotes, now = Date.now()): PortfolioView {
  const accounts = new Map(data.accounts.map((a) => [a.id, a]))
  const rows = data.assets
    .map((asset) => ({ ...valueAsset(asset, quotes, data.settings.fx, now), account: accounts.get(asset.accountId) ?? null }))
    .sort((a, b) => b.value - a.value)

  const sum = (f: (r: AssetView) => number, pred: (r: AssetView) => boolean = () => true) =>
    rows.filter(pred).reduce((s, r) => s + f(r), 0)

  const netWorth = sum((r) => r.value)
  const emergency = sum((r) => r.value, (r) => r.asset.isEmergencyFund)
  const cost = sum((r) => r.cost)
  const dayChange = sum((r) => r.dayChange)
  const gain = netWorth - cost
  const prev = netWorth - dayChange
  return {
    rows,
    netWorth,
    investable: netWorth - emergency,
    emergency,
    cost,
    gain,
    gainPct: cost > 0 ? (gain / cost) * 100 : 0,
    dayChange,
    dayChangePct: prev > 0 ? (dayChange / prev) * 100 : 0,
    hasLive: rows.some((r) => r.source === 'live'),
  }
}

// ---- Ledger: apply a transaction to an asset and remember the deltas ----

export interface TxInput {
  type: TxType
  date: string
  quantity?: number
  price?: number
  amount?: number
  note?: string
}

export function applyTransaction(asset: Asset, input: TxInput): { asset: Asset; tx: Omit<Transaction, 'id' | 'createdAt'> } {
  const qty = Math.max(0, input.quantity ?? 0)
  const price = Math.max(0, input.price ?? 0)
  let amount = Math.max(0, input.amount ?? 0)
  let dQty = 0
  let dCost = 0
  let dValue = 0

  switch (input.type) {
    case 'BUY':
      amount = qty * price
      dQty = qty
      dCost = amount
      break
    case 'SELL': {
      const sold = Math.min(qty, asset.quantity)
      amount = sold * price
      dQty = -sold
      dCost = asset.quantity > 0 ? -asset.costBasis * (sold / asset.quantity) : 0
      break
    }
    case 'DEPOSIT':
      dCost = amount
      dValue = amount
      break
    case 'WITHDRAW': {
      const out = Math.min(amount, asset.manualValue)
      amount = out
      dValue = -out
      dCost = asset.manualValue > 0 ? -asset.costBasis * (out / asset.manualValue) : 0
      break
    }
    case 'VALUE_UPDATE':
      dValue = amount - asset.manualValue
      break
    case 'DIVIDEND':
      break
  }

  const next: Asset = {
    ...asset,
    quantity: asset.quantity + dQty,
    costBasis: Math.max(0, asset.costBasis + dCost),
    manualValue: Math.max(0, asset.manualValue + dValue),
    valueUpdatedAt: dValue !== 0 || input.type === 'VALUE_UPDATE' ? new Date().toISOString() : asset.valueUpdatedAt,
    updatedAt: new Date().toISOString(),
  }
  return {
    asset: next,
    tx: { assetId: asset.id, type: input.type, date: input.date, quantity: qty, price, amount, note: input.note ?? '', dQty, dCost, dValue },
  }
}

export function revertTransaction(asset: Asset, tx: Pick<Transaction, 'dQty' | 'dCost' | 'dValue'>): Asset {
  return {
    ...asset,
    quantity: Math.max(0, asset.quantity - tx.dQty),
    costBasis: Math.max(0, asset.costBasis - tx.dCost),
    manualValue: Math.max(0, asset.manualValue - tx.dValue),
    updatedAt: new Date().toISOString(),
  }
}

// ---- Dividend income ----

export interface DividendStats {
  ttm: number
  monthlyAvg: number
  yieldOnCost: number
  byYear: { year: number; amount: number }[]
  byAsset: { assetId: string; name: string; amount: number; count: number }[]
  growthPct: number | null
}

export function dividendStats(data: Pick<AppData, 'assets' | 'transactions' | 'settings'>, investedCost: number, now = new Date()): DividendStats {
  const assets = new Map(data.assets.map((a) => [a.id, a]))
  const cutoff = new Date(now)
  cutoff.setFullYear(cutoff.getFullYear() - 1)
  let ttm = 0
  const years = new Map<number, number>()
  const perAsset = new Map<string, { assetId: string; name: string; amount: number; count: number }>()

  for (const tx of data.transactions) {
    if (tx.type !== 'DIVIDEND') continue
    const asset = assets.get(tx.assetId)
    const sar = tx.amount * fxRate(asset?.currency ?? 'SAR', data.settings.fx)
    const d = new Date(tx.date)
    if (d >= cutoff && d <= now) ttm += sar
    years.set(d.getFullYear(), (years.get(d.getFullYear()) ?? 0) + sar)
    const row = perAsset.get(tx.assetId) ?? { assetId: tx.assetId, name: asset?.name ?? '—', amount: 0, count: 0 }
    row.amount += sar
    row.count += 1
    perAsset.set(tx.assetId, row)
  }

  const byYear = Array.from(years, ([year, amount]) => ({ year, amount })).sort((a, b) => a.year - b.year)
  // Growth compares the last two *complete* years; the running year would understate it.
  const complete = byYear.filter((y) => y.year < now.getFullYear())
  const last = complete[complete.length - 1]
  const prev = complete[complete.length - 2]
  const growthPct = last && prev && prev.amount > 0 ? ((last.amount - prev.amount) / prev.amount) * 100 : null

  return {
    ttm,
    monthlyAvg: ttm / 12,
    yieldOnCost: investedCost > 0 ? (ttm / investedCost) * 100 : 0,
    byYear,
    byAsset: Array.from(perAsset.values()).sort((a, b) => b.amount - a.amount),
    growthPct,
  }
}

/** FX pairs to fetch: every held currency except SAR and the pegged USD. */
export function fxSymbolsNeeded(assets: Asset[]): string[] {
  const out = new Set<string>()
  for (const a of assets) if (a.currency !== 'SAR' && a.currency !== 'USD') out.add(`${a.currency}SAR=X`)
  return Array.from(out)
}
