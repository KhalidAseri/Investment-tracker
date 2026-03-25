'use client'

import type { Account, Holding, Transaction, Dividend } from '@/types'

// LocalStorage-based data layer for static deployment
// All data persists on the user's device

const KEYS = {
  accounts: 'investtrack_accounts',
  holdings: 'investtrack_holdings',
  transactions: 'investtrack_transactions',
  dividends: 'investtrack_dividends',
  initialized: 'investtrack_initialized',
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

export function deleteAccount(id: string): void {
  setStore(KEYS.accounts, getAccounts().filter((a) => a.id !== id))
  setStore(KEYS.holdings, getAllHoldings().filter((h) => h.accountId !== id))
  setStore(KEYS.transactions, getAllTransactions().filter((t) => t.accountId !== id))
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

export function deleteHolding(id: string): void {
  setStore(KEYS.holdings, getAllHoldings().filter((h) => h.id !== id))
  setStore(KEYS.dividends, getAllDividends().filter((d) => d.holdingId !== id))
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
    const holdings = getAllHoldings()
    const idx = holdings.findIndex((h) => h.id === data.holdingId)
    if (idx !== -1) {
      const h = holdings[idx]
      if (data.type === 'BUY') {
        const totalShares = h.shares + data.shares
        const totalCost = h.shares * h.averageCost + data.shares * data.pricePerShare
        holdings[idx] = { ...h, shares: totalShares, averageCost: totalShares > 0 ? totalCost / totalShares : 0 }
      } else if (data.type === 'SELL') {
        holdings[idx] = { ...h, shares: Math.max(0, h.shares - data.shares) }
      }
      setStore(KEYS.holdings, holdings)
    }
  }

  return transaction
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

// ---- Seed Data ----

export function initSeedData(): void {
  if (typeof window === 'undefined') return
  if (localStorage.getItem(KEYS.initialized)) return

  // Employer Savings
  const emp = createAccount({
    name: 'Employer Savings Program',
    nameAr: 'برنامج ادخار الموظفين',
    type: 'EMPLOYER_SAVINGS',
    currency: 'SAR',
    description: 'Central Bank supervised, 10% salary auto-deduction',
  } as any)

  createHolding({
    accountId: emp.id, symbol: 'ACWI', name: 'Al Ahli Bank Portfolio (Global Stocks)', nameAr: 'محفظة البنك الأهلي (أسهم عالمية)',
    shares: 150, averageCost: 95.5, currentValue: null, targetAllocation: 0.7, sector: null, indexTracked: 'MSCI ACWI',
  } as any)

  createHolding({
    accountId: emp.id, symbol: null, name: 'Central Bank Money Market Fund', nameAr: 'صندوق النقد - البنك المركزي',
    shares: 1, averageCost: 0, currentValue: 18500, targetAllocation: 0.3, sector: null, indexTracked: 'Money Market',
  } as any)

  // Saudi Stocks
  const saudi = createAccount({
    name: 'Saudi Stock Market (Tadawul)',
    nameAr: 'السوق السعودي (تداول)',
    type: 'SAUDI_STOCKS',
    currency: 'SAR',
    description: 'Direct stock investments focused on dividend growth',
  } as any)

  const aramco = createHolding({
    accountId: saudi.id, symbol: '2222.SR', name: 'Saudi Aramco', nameAr: 'أرامكو السعودية',
    shares: 200, averageCost: 30.5, currentValue: null, targetAllocation: null, sector: 'Energy', indexTracked: null,
  } as any)

  const rajhi = createHolding({
    accountId: saudi.id, symbol: '1120.SR', name: 'Al Rajhi Bank', nameAr: 'مصرف الراجحي',
    shares: 50, averageCost: 78, currentValue: null, targetAllocation: null, sector: 'Banking', indexTracked: null,
  } as any)

  const stc = createHolding({
    accountId: saudi.id, symbol: '7010.SR', name: 'STC', nameAr: 'الاتصالات السعودية',
    shares: 100, averageCost: 45, currentValue: null, targetAllocation: null, sector: 'Telecom', indexTracked: null,
  } as any)

  createHolding({
    accountId: saudi.id, symbol: '2010.SR', name: 'SABIC', nameAr: 'سابك',
    shares: 80, averageCost: 92, currentValue: null, targetAllocation: null, sector: 'Materials', indexTracked: null,
  } as any)

  // Darahem
  const darahem = createAccount({
    name: 'Darahem Portfolio',
    nameAr: 'محفظة دراهم',
    type: 'MANAGED_PORTFOLIO',
    currency: 'SAR',
    description: 'Managed portfolio - gold ETFs and US index funds',
  } as any)

  createHolding({
    accountId: darahem.id, symbol: 'GLD', name: 'SPDR Gold Shares', nameAr: 'صندوق الذهب SPDR',
    shares: 10, averageCost: 180, currentValue: null, targetAllocation: 0.1, sector: 'Commodities', indexTracked: null,
  } as any)

  createHolding({
    accountId: darahem.id, symbol: 'VOO', name: 'Vanguard S&P 500 ETF', nameAr: 'صندوق S&P 500',
    shares: 8, averageCost: 420, currentValue: null, targetAllocation: 0.5, sector: null, indexTracked: 'S&P 500',
  } as any)

  createHolding({
    accountId: darahem.id, symbol: 'DIA', name: 'SPDR Dow Jones ETF', nameAr: 'صندوق داو جونز',
    shares: 5, averageCost: 350, currentValue: null, targetAllocation: 0.4, sector: null, indexTracked: 'Dow Jones',
  } as any)

  // Dividends
  const divData = [
    { holdingId: aramco.id, amount: 380, perShare: 1.9, exDate: '2025-03-10', payDate: '2025-04-01', currency: 'SAR' },
    { holdingId: aramco.id, amount: 370, perShare: 1.85, exDate: '2024-09-10', payDate: '2024-10-01', currency: 'SAR' },
    { holdingId: aramco.id, amount: 360, perShare: 1.8, exDate: '2024-03-10', payDate: '2024-04-01', currency: 'SAR' },
    { holdingId: rajhi.id, amount: 187.5, perShare: 3.75, exDate: '2025-04-15', payDate: '2025-05-01', currency: 'SAR' },
    { holdingId: rajhi.id, amount: 175, perShare: 3.5, exDate: '2024-10-15', payDate: '2024-11-01', currency: 'SAR' },
    { holdingId: stc.id, amount: 400, perShare: 4, exDate: '2025-05-01', payDate: '2025-05-20', currency: 'SAR' },
    { holdingId: stc.id, amount: 380, perShare: 3.8, exDate: '2024-05-01', payDate: '2024-05-20', currency: 'SAR' },
  ]

  divData.forEach((d) => createDividend(d as any))

  // Transactions
  const txData = [
    { accountId: saudi.id, holdingId: aramco.id, type: 'BUY', symbol: '2222.SR', shares: 200, pricePerShare: 30.5, totalAmount: 6100, date: '2023-06-15', currency: 'SAR', notes: 'Initial purchase' },
    { accountId: saudi.id, holdingId: rajhi.id, type: 'BUY', symbol: '1120.SR', shares: 50, pricePerShare: 78, totalAmount: 3900, date: '2023-08-20', currency: 'SAR', notes: 'Dividend growth play' },
    { accountId: saudi.id, holdingId: stc.id, type: 'BUY', symbol: '7010.SR', shares: 100, pricePerShare: 45, totalAmount: 4500, date: '2023-10-05', currency: 'SAR', notes: 'Telecom sector' },
    { accountId: emp.id, holdingId: null, type: 'DEPOSIT', symbol: null, shares: null, pricePerShare: null, totalAmount: 2500, date: '2025-03-01', currency: 'SAR', notes: 'Monthly salary deduction 10%' },
    { accountId: darahem.id, holdingId: null, type: 'DEPOSIT', symbol: null, shares: null, pricePerShare: null, totalAmount: 5000, date: '2024-06-01', currency: 'SAR', notes: 'Initial deposit' },
  ]

  txData.forEach((tx) => createTransaction(tx as any))

  localStorage.setItem(KEYS.initialized, 'true')
}
