'use client'

import { useEffect, useState } from 'react'
import { useLocale } from '@/components/shared/LocaleContext'
import TotalValueCard from '@/components/dashboard/TotalValueCard'
import AccountSummaryCard from '@/components/dashboard/AccountSummaryCard'
import AllocationChart from '@/components/dashboard/AllocationChart'
import DividendIncomeCard from '@/components/dashboard/DividendIncomeCard'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { getAccounts, getHoldings, getAllDividends } from '@/lib/storage'
import { fetchQuotes, type MarketQuote } from '@/lib/market-client'
import type { Account, AccountSummary } from '@/types'
import { Plus, TrendingUp, Building2, Wallet, RefreshCw } from 'lucide-react'
import { ACCOUNT_CONFIGS } from '@/lib/constants'
import Link from 'next/link'

export default function DashboardPage() {
  const { t, locale } = useLocale()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    try {
      const accs = getAccounts().map((a) => ({
        ...a,
        holdings: getHoldings(a.id),
      }))
      setAccounts(accs)

      // Fetch market data for all symbols
      const symbols = accs.flatMap((a) => (a.holdings ?? []).map((h) => h.symbol).filter(Boolean)) as string[]
      if (symbols.length > 0) {
        fetchQuotes(symbols).then(setQuotes).catch(() => {})
      }
    } catch (e) {
      console.error('Dashboard load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  async function refreshPrices() {
    setRefreshing(true)
    try {
      const symbols = accounts.flatMap((a) => (a.holdings ?? []).map((h) => h.symbol).filter(Boolean)) as string[]
      if (symbols.length > 0) {
        const q = await fetchQuotes(symbols)
        setQuotes(q)
      }
    } catch {}
    setRefreshing(false)
  }

  if (loading) return <LoadingSpinner />

  const accountSummaries: AccountSummary[] = accounts.map((account) => {
    const holdings = account.holdings ?? []
    let totalValue = 0
    let totalCost = 0
    let dailyChange = 0

    holdings.forEach((h) => {
      const quote = h.symbol ? quotes[h.symbol] : null
      const price = quote?.price ?? null
      const value = price ? h.shares * price : (h.currentValue ?? h.shares * h.averageCost)
      const cost = h.shares * h.averageCost
      totalValue += value
      totalCost += cost
      if (quote) {
        dailyChange += h.shares * quote.change
      }
    })

    return {
      id: account.id,
      name: account.name,
      nameAr: account.nameAr,
      type: account.type,
      totalValue,
      totalCost,
      gainLoss: totalValue - totalCost,
      gainLossPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      holdingsCount: holdings.length,
    }
  })

  const totalValue = accountSummaries.reduce((sum, a) => sum + a.totalValue, 0)
  const totalCost = accountSummaries.reduce((sum, a) => sum + a.totalCost, 0)

  // Calculate real daily change from market data
  let totalDailyChange = 0
  accounts.forEach((account) => {
    ;(account.holdings ?? []).forEach((h) => {
      const quote = h.symbol ? quotes[h.symbol] : null
      if (quote) totalDailyChange += h.shares * quote.change
    })
  })
  const totalDailyChangePercent = totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0

  const allDividends = getAllDividends()
  const currentYear = new Date().getFullYear()
  const annualIncome = allDividends
    .filter((d) => new Date(d.payDate).getFullYear() >= currentYear - 1)
    .reduce((sum, d) => sum + d.amount, 0)

  const allocationData = accountSummaries.map((a) => ({
    name: a.name,
    nameAr: a.nameAr,
    value: a.totalValue,
    type: a.type,
  }))

  // Quick start account types for onboarding
  const quickTypes = [
    { type: 'SAUDI_STOCKS', icon: TrendingUp, color: 'text-green-600 bg-green-50' },
    { type: 'EMPLOYER_SAVINGS', icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { type: 'MANAGED_PORTFOLIO', icon: Wallet, color: 'text-purple-600 bg-purple-50' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.dashboard}</h1>
        <div className="flex items-center gap-2">
          {accounts.length > 0 && Object.keys(quotes).length > 0 && (
            <button onClick={refreshPrices} disabled={refreshing}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors touch-manipulation disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          )}
          <Link
            href="/accounts/new"
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t.accounts.addAccount}</span>
            <span className="sm:hidden">{t.common.add}</span>
          </Link>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="space-y-6">
          <div className="card text-center py-8 sm:py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 flex items-center justify-center">
              <TrendingUp className="w-8 h-8 text-primary-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t.dashboard.welcomeTitle}</h2>
            <p className="text-gray-500 text-sm max-w-md mx-auto">{t.dashboard.welcomeDesc}</p>
          </div>

          <div>
            <h3 className="font-semibold text-gray-900 mb-3">{t.dashboard.quickStart}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {quickTypes.map(({ type, icon: Icon, color }) => {
                const config = ACCOUNT_CONFIGS[type]
                return (
                  <Link key={type} href={`/accounts/new?type=${type}`}
                    className="card-hover flex items-center gap-3 p-4">
                    <div className={`p-2.5 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
                    <div>
                      <p className="font-medium text-sm text-gray-900">{locale === 'ar' ? config.label.ar : config.label.en}</p>
                      <p className="text-xs text-gray-500">{locale === 'ar' ? config.description.ar : config.description.en}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <>
          <TotalValueCard
            totalValue={totalValue}
            totalCost={totalCost}
            dailyChange={totalDailyChange}
            dailyChangePercent={totalDailyChangePercent}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <h2 className="font-semibold text-gray-900">{t.dashboard.accounts}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accountSummaries.map((account) => (
                  <AccountSummaryCard key={account.id} account={account} />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <AllocationChart data={allocationData} />
              <DividendIncomeCard
                annualIncome={annualIncome}
                monthlyIncome={annualIncome / 12}
                yieldOnCost={totalCost > 0 ? (annualIncome / totalCost) * 100 : 0}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
