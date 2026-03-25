'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'

interface TotalValueCardProps {
  totalValue: number
  totalCost: number
  dailyChange: number
  dailyChangePercent: number
}

export default function TotalValueCard({
  totalValue,
  totalCost,
  dailyChange,
  dailyChangePercent,
}: TotalValueCardProps) {
  const { t } = useLocale()
  const totalGain = totalValue - totalCost
  const totalGainPercent = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0

  return (
    <div className="card bg-gradient-to-br from-primary-600 to-primary-800 text-white">
      <p className="text-primary-100 text-sm font-medium">{t.dashboard.totalValue}</p>
      <p className="text-3xl font-bold mt-1">
        <CurrencyDisplay amount={totalValue} className="text-white" />
      </p>

      <div className="flex items-center gap-4 mt-4">
        <div>
          <p className="text-primary-200 text-xs">{t.dashboard.dailyChange}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            {dailyChange >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-300" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-300" />
            )}
            <CurrencyDisplay
              amount={dailyChange}
              showSign
              className={dailyChange >= 0 ? 'text-green-300 text-sm font-medium' : 'text-red-300 text-sm font-medium'}
            />
          </div>
        </div>

        <div className="border-l border-primary-400 pl-4">
          <p className="text-primary-200 text-xs">{t.dashboard.totalGain}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <CurrencyDisplay
              amount={totalGain}
              showSign
              className={totalGain >= 0 ? 'text-green-300 text-sm font-medium' : 'text-red-300 text-sm font-medium'}
            />
            <span className={`text-xs ${totalGainPercent >= 0 ? 'text-green-300' : 'text-red-300'}`}>
              ({totalGainPercent >= 0 ? '+' : ''}{totalGainPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
