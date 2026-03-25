'use client'

import Link from 'next/link'
import { Building2, TrendingUp, Wallet, ChevronRight, ChevronLeft } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import { ACCOUNT_CONFIGS, type AccountType } from '@/lib/constants'
import type { AccountSummary } from '@/types'

const iconMap: Record<string, React.ElementType> = {
  Building2,
  TrendingUp,
  Wallet,
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  purple: 'bg-purple-100 text-purple-600',
}

export default function AccountSummaryCard({ account }: { account: AccountSummary }) {
  const { locale, t } = useLocale()
  const config = ACCOUNT_CONFIGS[account.type as AccountType]
  const Icon = config ? iconMap[config.icon] : Wallet
  const color = config ? colorMap[config.color] : colorMap.blue
  const Chevron = locale === 'ar' ? ChevronLeft : ChevronRight

  return (
    <Link href={`/accounts/${account.id}`} className="card-hover block">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {locale === 'ar' ? account.nameAr : account.name}
            </h3>
            <p className="text-xs text-gray-500">
              {account.holdingsCount} {t.accounts.holdings}
            </p>
          </div>
        </div>
        <Chevron className="w-5 h-5 text-gray-400" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-gray-500">{t.accounts.value}</p>
          <CurrencyDisplay amount={account.totalValue} className="text-sm font-semibold text-gray-900" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{t.accounts.gainLoss}</p>
          <div className="flex items-center gap-1">
            <CurrencyDisplay
              amount={account.gainLoss}
              showSign
              colorize
              className="text-sm font-semibold"
            />
          </div>
        </div>
      </div>

      {account.gainLossPercent !== 0 && (
        <div className="mt-2">
          <PercentBadge value={account.gainLossPercent} />
        </div>
      )}
    </Link>
  )
}
