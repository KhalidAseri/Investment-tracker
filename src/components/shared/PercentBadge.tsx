'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PercentBadgeProps {
  value: number
  showIcon?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function PercentBadge({ value, showIcon = true, size = 'sm' }: PercentBadgeProps) {
  const isPositive = value > 0
  const isZero = value === 0

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        sizeClasses[size],
        isZero
          ? 'bg-gray-100 text-gray-600'
          : isPositive
          ? 'bg-green-100 text-green-800'
          : 'bg-red-100 text-red-800'
      )}
    >
      {showIcon &&
        (isZero ? (
          <Minus className="w-3 h-3" />
        ) : isPositive ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        ))}
      {value >= 0 ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}
