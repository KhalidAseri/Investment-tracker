'use client'

import { useLocale } from '@/components/shared/LocaleContext'
import { cn } from '@/lib/utils'

interface CurrencyDisplayProps {
  amount: number
  currency?: string
  className?: string
  showSign?: boolean
  colorize?: boolean
}

export default function CurrencyDisplay({
  amount,
  currency = 'SAR',
  className,
  showSign = false,
  colorize = false,
}: CurrencyDisplayProps) {
  const { locale } = useLocale()

  const formatted = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))

  const sign = amount >= 0 ? (showSign ? '+' : '') : '-'

  return (
    <span
      className={cn(
        colorize && amount > 0 && 'text-green-600',
        colorize && amount < 0 && 'text-red-600',
        className
      )}
    >
      {sign}
      {formatted}
    </span>
  )
}
