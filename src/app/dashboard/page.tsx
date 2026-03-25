'use client'

import { useEffect, useState } from 'react'
import { useLocale } from '@/components/shared/LocaleContext'
import TotalValueCard from '@/components/dashboard/TotalValueCard'
import AccountSummaryCard from '@/components/dashboard/AccountSummaryCard'
import AllocationChart from '@/components/dashboard/AllocationChart'
import DividendIncomeCard from '@/components/dashboard/DividendIncomeCard'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { getAccounts, getHoldings, getAllDividends, initSeedData } from '@/lib/storage'
import type { Account, AccountSummary } from '@/types'
import { Plus } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { t, locale } = useLocale()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initSeedData()
    const accs = getAccounts().map((a) => ({
      ...a,
      holdings: getHoldings(a.id),
    }))
    setAccounts(accs)
    setLoading(false)
  }, [])

  if (loading) return <LoadingSpinner />

  const accountSummaries: AccountSummary[] = accounts.map((account) => {
    const holdings = account.holdings ?? []
    let totalValue = 0
    let totalCost = 0

    holdings.forEach((h) => {
      const value = h.currentValue ?? h.shares * h.averageCost
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.nav.dashboard}</h1>
        <Link
          href="/accounts/new"
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium touch-manipulation"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">{t.accounts.addAccount}</span>
          <span className="sm:hidden">{t.common.add}</span>
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500">{t.dashboard.noData}</p>
        </div>
      ) : (
        <>
          <TotalValueCard
            totalValue={totalValue}
            totalCost={totalCost}
            dailyChange={0}
            dailyChangePercent={0}
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
