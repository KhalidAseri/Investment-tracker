'use client'

import { useEffect, useState } from 'react'
import { useLocale } from '@/components/shared/LocaleContext'
import TotalValueCard from '@/components/dashboard/TotalValueCard'
import AccountSummaryCard from '@/components/dashboard/AccountSummaryCard'
import AllocationChart from '@/components/dashboard/AllocationChart'
import DividendIncomeCard from '@/components/dashboard/DividendIncomeCard'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import type { Account, AccountSummary } from '@/types'
import { ACCOUNT_CONFIGS, type AccountType } from '@/lib/constants'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { t, locale } = useLocale()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      setAccounts(data)

      // Fetch market quotes for all symbols
      const allSymbols = data
        .flatMap((a: Account) => a.holdings?.map((h) => h.symbol).filter(Boolean) ?? [])

      if (allSymbols.length > 0) {
        const quoteRes = await fetch(`/api/market/quote?symbols=${allSymbols.join(',')}`)
        const quoteData = await quoteRes.json()
        setQuotes(quoteData)
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingSpinner />

  // Calculate summaries
  const accountSummaries: AccountSummary[] = accounts.map((account) => {
    const holdings = account.holdings ?? []
    let totalValue = 0
    let totalCost = 0

    holdings.forEach((h) => {
      const quote = h.symbol ? quotes[h.symbol] : null
      const price = quote?.price ?? 0
      const value = h.currentValue ?? h.shares * price
      const cost = h.shares * h.averageCost

      totalValue += value
      totalCost += cost
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

  let dailyChange = 0
  accounts.forEach((account) => {
    account.holdings?.forEach((h) => {
      if (h.symbol && quotes[h.symbol]) {
        dailyChange += h.shares * quotes[h.symbol].change
      }
    })
  })
  const dailyChangePercent = totalValue > 0 ? (dailyChange / totalValue) * 100 : 0

  const allocationData = accountSummaries.map((a) => ({
    name: a.name,
    nameAr: a.nameAr,
    value: a.totalValue,
    type: a.type,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t.nav.dashboard}</h1>
        <Link
          href="/accounts/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t.accounts.addAccount}
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t.dashboard.noData}</p>
          <Link
            href="/accounts/new"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t.accounts.addAccount}
          </Link>
        </div>
      ) : (
        <>
          {/* Total Value */}
          <TotalValueCard
            totalValue={totalValue}
            totalCost={totalCost}
            dailyChange={dailyChange}
            dailyChangePercent={dailyChangePercent}
          />

          {/* Account Summaries & Allocation */}
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
                annualIncome={0}
                monthlyIncome={0}
                yieldOnCost={0}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
