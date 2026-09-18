import type { Account, Holding, Transaction, Dividend } from '@/types'

// LocalStorage-based data layer for static deployment
// All data persists on the user's device

const KEYS = {
  accounts: 'investtrack_accounts',
  holdings: 'investtrack_holdings',
  transactions: 'investtrack_transactions',
  dividends: 'investtrack_dividends',
  customAccountTypes: 'investtrack_custom_types',
  marketCache: 'investtrack_market_cache',
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9)
}

function getStore<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  const data = localStorage.getItem(key)
  return data ? JSON.parse(data) : []
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// ---- Accounts ----

export function getAccounts(): Account[] {
  return getStore<Account>(KEYS.accounts)
}

export function getAccount(id: string): Account | null {
  const accounts = getAccounts()
  const account = accounts.find((a) => a.id === id) ?? null
  if (!account) return null

  return {
    ...account,
    holdings: getHoldings(id),
    transactions: getTransactions(id),
  }
}

export function createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account {
  const accounts = getAccounts()
  const account: Account = {
    ...data,
    id: genId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  accounts.push(account)
  setStore(KEYS.accounts, accounts)
  return account
}

export function updateAccount(id: string, data: Partial<Omit<Account, 'id' | 'createdAt'>>): Account | null {
  const accounts = getAccounts()
  const idx = accounts.findIndex((a) => a.id === id)
  if (idx === -1) return null
  accounts[idx] = { ...accounts[idx], ...data, updatedAt: new Date().toISOString() }
  setStore(KEYS.accounts, accounts)
  return accounts[idx]
}

export function deleteAccount(id: string): void {
  setStore(KEYS.accounts, getAccounts().filter((a) => a.id !== id))
  setStore(KEYS.holdings, getAllHoldings().filter((h) => h.accountId !== id))
  setStore(KEYS.transactions, getAllTransactions().filter((t) => t.accountId !== id))
  // Also delete dividends for holdings in this account
  const holdingIds = new Set(getAllHoldings().filter((h) => h.accountId === id).map((h) => h.id))
  setStore(KEYS.dividends, getAllDividends().filter((d) => !holdingIds.has(d.holdingId)))
}

// ---- Holdings ----

export function getAllHoldings(): Holding[] {
  return getStore<Holding>(KEYS.holdings)
}

export function getHoldings(accountId?: string): Holding[] {
  const all = getAllHoldings()
  return accountId ? all.filter((h) => h.accountId === accountId) : all
}

export function createHolding(data: Omit<Holding, 'id' | 'createdAt' | 'updatedAt'>): Holding {
  const holdings = getAllHoldings()
  const holding: Holding = {
    ...data,
    id: genId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  holdings.push(holding)
  setStore(KEYS.holdings, holdings)
  return holding
}

export function updateHolding(id: string, data: Partial<Omit<Holding, 'id' | 'createdAt'>>): Holding | null {
  const holdings = getAllHoldings()
  const idx = holdings.findIndex((h) => h.id === id)
  if (idx === -1) return null
  holdings[idx] = { ...holdings[idx], ...data, updatedAt: new Date().toISOString() }
  setStore(KEYS.holdings, holdings)
  return holdings[idx]
}

export function deleteHolding(id: string): void {
  setStore(KEYS.holdings, getAllHoldings().filter((h) => h.id !== id))
  setStore(KEYS.dividends, getAllDividends().filter((d) => d.holdingId !== id))
  setStore(KEYS.transactions, getAllTransactions().filter((t) => t.holdingId !== id))
}

// ---- Transactions ----

export function getAllTransactions(): Transaction[] {
  return getStore<Transaction>(KEYS.transactions)
}

export function getTransactions(accountId?: string): Transaction[] {
  const all = getAllTransactions()
  const filtered = accountId ? all.filter((t) => t.accountId === accountId) : all
  return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function createTransaction(data: Omit<Transaction, 'id' | 'createdAt'>): Transaction {
  const transactions = getAllTransactions()
  const transaction: Transaction = {
    ...data,
    id: genId(),
    createdAt: new Date().toISOString(),
  }
  transactions.push(transaction)
  setStore(KEYS.transactions, transactions)

  // Update holding on BUY/SELL
  if (data.holdingId && data.shares && data.pricePerShare) {
    recalcHolding(data.holdingId)
  }

  return transaction
}

export function updateTransaction(id: string, data: Partial<Omit<Transaction, 'id' | 'createdAt'>>): Transaction | null {
  const transactions = getAllTransactions()
  const idx = transactions.findIndex((t) => t.id === id)
  if (idx === -1) return null
  const oldHoldingId = transactions[idx].holdingId
  transactions[idx] = { ...transactions[idx], ...data }
  setStore(KEYS.transactions, transactions)

  // Recalculate affected holdings
  if (oldHoldingId) recalcHolding(oldHoldingId)
  if (data.holdingId && data.holdingId !== oldHoldingId) recalcHolding(data.holdingId)

  return transactions[idx]
}

export function deleteTransaction(id: string): void {
  const transactions = getAllTransactions()
  const tx = transactions.find((t) => t.id === id)
  setStore(KEYS.transactions, transactions.filter((t) => t.id !== id))
  if (tx?.holdingId) recalcHolding(tx.holdingId)
}

// Recalculate holding shares/averageCost by replaying all BUY/SELL transactions
function recalcHolding(holdingId: string): void {
  const holdings = getAllHoldings()
  const idx = holdings.findIndex((h) => h.id === holdingId)
  if (idx === -1) return

  const txs = getAllTransactions()
    .filter((t) => t.holdingId === holdingId && (t.type === 'BUY' || t.type === 'SELL'))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  let shares = 0
  let totalCost = 0

  txs.forEach((tx) => {
    if (tx.type === 'BUY' && tx.shares && tx.pricePerShare) {
      totalCost += tx.shares * tx.pricePerShare
      shares += tx.shares
    } else if (tx.type === 'SELL' && tx.shares) {
      shares = Math.max(0, shares - tx.shares)
      // Proportionally reduce cost basis
      if (shares > 0 && (shares + tx.shares) > 0) {
        totalCost = totalCost * (shares / (shares + tx.shares))
      } else {
        totalCost = 0
      }
    }
  })

  holdings[idx] = {
    ...holdings[idx],
    shares,
    averageCost: shares > 0 ? totalCost / shares : 0,
    updatedAt: new Date().toISOString(),
  }
  setStore(KEYS.holdings, holdings)
}

// ---- Dividends ----

export function getAllDividends(): Dividend[] {
  return getStore<Dividend>(KEYS.dividends)
}

export function getDividends(holdingId?: string): Dividend[] {
  const all = getAllDividends()
  const filtered = holdingId ? all.filter((d) => d.holdingId === holdingId) : all
  return filtered.sort((a, b) => new Date(b.payDate).getTime() - new Date(a.payDate).getTime())
}

export function createDividend(data: Omit<Dividend, 'id' | 'createdAt'>): Dividend {
  const dividends = getAllDividends()
  const dividend: Dividend = {
    ...data,
    id: genId(),
    createdAt: new Date().toISOString(),
  }
  dividends.push(dividend)
  setStore(KEYS.dividends, dividends)
  return dividend
}

export function updateDividend(id: string, data: Partial<Omit<Dividend, 'id' | 'createdAt'>>): Dividend | null {
  const dividends = getAllDividends()
  const idx = dividends.findIndex((d) => d.id === id)
  if (idx === -1) return null
  dividends[idx] = { ...dividends[idx], ...data }
  setStore(KEYS.dividends, dividends)
  return dividends[idx]
}

export function deleteDividend(id: string): void {
  setStore(KEYS.dividends, getAllDividends().filter((d) => d.id !== id))
}

// ---- Data Export/Import ----

export function exportAllData(): string {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: getAccounts(),
    holdings: getAllHoldings(),
    transactions: getAllTransactions(),
    dividends: getAllDividends(),
  }, null, 2)
}

export function importAllData(json: string, merge: boolean = false): { success: boolean; error?: string } {
  try {
    const data = JSON.parse(json)
    if (!data.accounts || !data.holdings || !data.transactions || !data.dividends) {
      return { success: false, error: 'Invalid data format' }
    }

    if (!merge) {
      // Replace all data
      setStore(KEYS.accounts, data.accounts)
      setStore(KEYS.holdings, data.holdings)
      setStore(KEYS.transactions, data.transactions)
      setStore(KEYS.dividends, data.dividends)
    } else {
      // Merge: add records that don't exist yet
      const existingIds = new Set([
        ...getAccounts().map((a) => a.id),
        ...getAllHoldings().map((h) => h.id),
        ...getAllTransactions().map((t) => t.id),
        ...getAllDividends().map((d) => d.id),
      ])

      const accounts = getAccounts()
      data.accounts.forEach((a: Account) => { if (!existingIds.has(a.id)) accounts.push(a) })
      setStore(KEYS.accounts, accounts)

      const holdings = getAllHoldings()
      data.holdings.forEach((h: Holding) => { if (!existingIds.has(h.id)) holdings.push(h) })
      setStore(KEYS.holdings, holdings)

      const transactions = getAllTransactions()
      data.transactions.forEach((t: Transaction) => { if (!existingIds.has(t.id)) transactions.push(t) })
      setStore(KEYS.transactions, transactions)

      const dividends = getAllDividends()
      data.dividends.forEach((d: Dividend) => { if (!existingIds.has(d.id)) dividends.push(d) })
      setStore(KEYS.dividends, dividends)
    }

    return { success: true }
  } catch {
    return { success: false, error: 'Invalid JSON' }
  }
}

export function resetAllData(): void {
  if (typeof window === 'undefined') return
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key))
}
