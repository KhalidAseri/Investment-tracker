'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { useLocale } from '@/components/shared/LocaleContext'
import { ACCOUNT_CONFIGS, CHART_COLORS } from '@/lib/constants'

interface AllocationChartProps {
  data: { name: string; nameAr: string; value: number; type: string }[]
}

const FALLBACK_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#4f46e5', '#ea580c', '#0d9488', '#db2777', '#d97706', '#6b7280']

export default function AllocationChart({ data }: AllocationChartProps) {
  const { t, locale } = useLocale()
  const total = data.reduce((sum, d) => sum + d.value, 0)

  const chartData = data.map((d, i) => {
    const config = ACCOUNT_CONFIGS[d.type]
    const color = config ? (CHART_COLORS[config.color] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]) : FALLBACK_COLORS[i % FALLBACK_COLORS.length]
    return {
      name: locale === 'ar' ? d.nameAr : d.name,
      value: d.value,
      color,
      percentage: total > 0 ? ((d.value / total) * 100).toFixed(1) : '0',
    }
  })

  if (total === 0) {
    return (
      <div className="card">
        <h3 className="font-semibold text-gray-900 mb-4">{t.dashboard.allocation}</h3>
        <p className="text-gray-500 text-sm text-center py-8">{t.common.noData}</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h3 className="font-semibold text-gray-900 mb-4">{t.dashboard.allocation}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: any) =>
              new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-SA', {
                style: 'currency',
                currency: 'SAR',
              }).format(Number(value))
            }
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-2 space-y-2">
        {chartData.map((d, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-gray-700">{d.name}</span>
            </div>
            <span className="font-medium text-gray-900">{d.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
