'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Building2, TrendingUp, Wallet, Trash2 } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { ACCOUNT_CONFIGS, type AccountType } from '@/lib/constants'
import { getAccounts, getHoldings, deleteAccount as deleteAcc, initSeedData } from '@/lib/storage'
import type { Account } from '@/types'

const iconMap: Record<string, React.ElementType> = { Building2, TrendingUp, Wallet }
const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
}

export default function AccountsPage() {
  const { t, locale } = useLocale()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  function load() {
    initSeedData()
    const accs = getAccounts().map((a) => ({ ...a, holdings: getHoldings(a.id) }))
    setAccounts(accs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleDelete(id: string) {
    if (!confirm(t.common.confirm)) return
    deleteAcc(id)
    load()
  }

  if (loading) return <LoadingSpinner />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.accounts.title}</h1>
        <Link href="/accounts/new" className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
          <Plus className="w-4 h-4" /> {t.accounts.addAccount}
        </Link>
      </div>

      {accounts.length === 0 ? (
        <div className="card text-center py-12"><p className="text-gray-500">{t.accounts.noAccounts}</p></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const config = ACCOUNT_CONFIGS[account.type as AccountType]
            const Icon = config ? iconMap[config.icon] : Wallet
            const color = config ? colorMap[config.color] : colorMap.blue
            const holdings = account.holdings ?? []
            const totalCost = holdings.reduce((sum, h) => sum + h.shares * h.averageCost, 0)
            const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue ?? h.shares * h.averageCost), 0)
            const gainLoss = totalValue - totalCost
            const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0

            return (
              <div key={account.id} className="card-hover relative group">
                <Link href={`/accounts/detail?id=${account.id}`} className="block">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${color}`}><Icon className="w-5 h-5" /></div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{locale === 'ar' ? account.nameAr : account.name}</h3>
                      <p className="text-xs text-gray-500">{config ? (locale === 'ar' ? config.label.ar : config.label.en) : account.type}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div><p className="text-xs text-gray-500">{t.accounts.value}</p><CurrencyDisplay amount={totalValue} className="text-sm font-semibold" /></div>
                    <div><p className="text-xs text-gray-500">{t.accounts.cost}</p><CurrencyDisplay amount={totalCost} className="text-sm font-semibold" /></div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <CurrencyDisplay amount={gainLoss} showSign colorize className="text-sm font-medium" />
                    <PercentBadge value={gainLossPercent} />
                  </div>
                  <p className="text-xs text-gray-400 mt-3">{holdings.length} {t.accounts.holdings}</p>
                </Link>
                <button onClick={(e) => { e.preventDefault(); handleDelete(account.id) }}
                  className="absolute top-4 end-4 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
