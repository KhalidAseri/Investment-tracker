'use client'

import { Banknote } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'

interface DividendIncomeCardProps {
  annualIncome: number
  monthlyIncome: number
  yieldOnCost: number
}

export default function DividendIncomeCard({
  annualIncome,
  monthlyIncome,
  yieldOnCost,
}: DividendIncomeCardProps) {
  const { t } = useLocale()

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-green-100 text-green-600">
          <Banknote className="w-5 h-5" />
        </div>
        <h3 className="font-semibold text-gray-900">{t.dashboard.dividendIncome}</h3>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-gray-500">{t.dividends.annualIncome}</p>
          <CurrencyDisplay
            amount={annualIncome}
            className="text-xl font-bold text-gray-900"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500">
              {/* Monthly */}
              {t.dividends.annualIncome} / 12
            </p>
            <CurrencyDisplay
              amount={monthlyIncome}
              className="text-sm font-semibold text-gray-900"
            />
          </div>
          <div>
            <p className="text-xs text-gray-500">{t.dividends.yieldOnCost}</p>
            <p className="text-sm font-semibold text-green-600">{yieldOnCost.toFixed(2)}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}
