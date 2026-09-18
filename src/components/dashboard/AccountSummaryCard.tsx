'use client'

import Link from 'next/link'
import { Building2, TrendingUp, Wallet, Globe, Coins, Home, PiggyBank, Shield, Briefcase, ChevronRight, ChevronLeft } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import { ACCOUNT_CONFIGS, COLOR_MAP } from '@/lib/constants'
import type { AccountSummary } from '@/types'

const iconMap: Record<string, React.ElementType> = {
  Building2, TrendingUp, Wallet, Globe, Coins, Home, PiggyBank, Shield, Briefcase,
}

export default function AccountSummaryCard({ account }: { account: AccountSummary }) {
  const { locale, t } = useLocale()
  const config = ACCOUNT_CONFIGS[account.type]
  const Icon = config ? (iconMap[config.icon] ?? Briefcase) : Briefcase
  const color = config ? (COLOR_MAP[config.color] ?? COLOR_MAP.gray) : COLOR_MAP.gray
  const Chevron = locale === 'ar' ? ChevronLeft : ChevronRight

  return (
    <Link href={`/accounts/detail?id=${account.id}`} className="card-hover block">
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
