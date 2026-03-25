'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import type { Dividend, Holding } from '@/types'

export default function DividendsPage() {
  const { t, locale } = useLocale()
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/dividends').then((r) => r.json()),
      fetch('/api/holdings').then((r) => r.json()),
    ])
      .then(([divs, holds]) => {
        setDividends(divs)
        setHoldings(holds)
      })
      .finally(() => setLoading(false))
  }, [])

  async function addDividend(data: Record<string, unknown>) {
    const res = await fetch('/api/dividends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      setShowAdd(false)
      const updated = await fetch('/api/dividends').then((r) => r.json())
      setDividends(updated)
    }
  }

  if (loading) return <LoadingSpinner />

  // Calculate summary
  const totalAnnualIncome = dividends.reduce((sum, d) => {
    const year = new Date(d.payDate).getFullYear()
    const currentYear = new Date().getFullYear()
    return year === currentYear ? sum + d.amount : sum
  }, 0)

  // Group by holding
  const byHolding: Record<string, { holding: string; holdingAr: string; symbol: string; total: number; count: number; dividends: Dividend[] }> = {}
  dividends.forEach((d) => {
    const key = d.holdingId
    if (!byHolding[key]) {
      byHolding[key] = {
        holding: d.holding?.name ?? 'Unknown',
        holdingAr: d.holding?.nameAr ?? d.holding?.name ?? 'Unknown',
        symbol: d.holding?.symbol ?? '',
        total: 0,
        count: 0,
        dividends: [],
      }
    }
    byHolding[key].total += d.amount
    byHolding[key].count++
    byHolding[key].dividends.push(d)
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t.dividends.title}</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t.common.add}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">{t.dividends.annualIncome}</p>
          <CurrencyDisplay amount={totalAnnualIncome} className="text-2xl font-bold text-gray-900 mt-1" />
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{t.dividends.annualIncome} / 12</p>
          <CurrencyDisplay amount={totalAnnualIncome / 12} className="text-2xl font-bold text-gray-900 mt-1" />
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">{t.dividends.history}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{dividends.length}</p>
          <p className="text-xs text-gray-400">{locale === 'ar' ? 'توزيعة مسجلة' : 'records'}</p>
        </div>
      </div>

      {/* Add Dividend Form */}
      {showAdd && (
        <div className="card space-y-3">
          <h3 className="font-semibold">{t.common.add} {t.dividends.title}</h3>
          <DividendForm
            holdings={holdings}
            onSubmit={addDividend}
            onCancel={() => setShowAdd(false)}
            t={t}
            locale={locale}
          />
        </div>
      )}

      {/* By Holding Summary */}
      {Object.keys(byHolding).length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">{t.dividends.yield}</h2>
          <div className="space-y-3">
            {Object.values(byHolding).map((group, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {locale === 'ar' ? group.holdingAr : group.holding}
                  </p>
                  <p className="text-xs text-gray-500">{group.symbol} &middot; {group.count} {locale === 'ar' ? 'توزيعات' : 'payments'}</p>
                </div>
                <CurrencyDisplay amount={group.total} className="font-semibold text-green-600" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full History */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t.dividends.history}</h2>
        {dividends.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">{t.dividends.noDividends}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-start py-2 font-medium">{t.holdings.name}</th>
                  <th className="text-start py-2 font-medium">{t.dividends.exDate}</th>
                  <th className="text-start py-2 font-medium">{t.dividends.payDate}</th>
                  <th className="text-end py-2 font-medium">{t.dividends.perShare}</th>
                  <th className="text-end py-2 font-medium">{t.dividends.amount}</th>
                </tr>
              </thead>
              <tbody>
                {dividends.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3">
                      <p className="font-medium text-gray-900">
                        {locale === 'ar' ? (d.holding?.nameAr ?? d.holding?.name) : d.holding?.name}
                      </p>
                      <p className="text-xs text-gray-400">{d.holding?.symbol}</p>
                    </td>
                    <td className="py-3 text-gray-600">
                      {new Date(d.exDate).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="py-3 text-gray-600">
                      {new Date(d.payDate).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
                    </td>
                    <td className="py-3 text-end">
                      <CurrencyDisplay amount={d.perShare} currency={d.currency} />
                    </td>
                    <td className="py-3 text-end font-medium">
                      <CurrencyDisplay amount={d.amount} currency={d.currency} className="text-green-600" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DividendForm({
  holdings,
  onSubmit,
  onCancel,
  t,
  locale,
}: {
  holdings: Holding[]
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  t: Record<string, any>
  locale: string
}) {
  const [form, setForm] = useState({
    holdingId: '',
    amount: '',
    perShare: '',
    exDate: new Date().toISOString().split('T')[0],
    payDate: new Date().toISOString().split('T')[0],
    currency: 'SAR',
  })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <select
          value={form.holdingId}
          onChange={(e) => setForm({ ...form, holdingId: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          required
        >
          <option value="">-- {t.holdings.name} --</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {locale === 'ar' ? (h.nameAr ?? h.name) : h.name} ({h.symbol})
            </option>
          ))}
        </select>
        <input
          type="number"
          placeholder={t.dividends.amount}
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          step="any"
          required
        />
        <input
          type="number"
          placeholder={t.dividends.perShare}
          value={form.perShare}
          onChange={(e) => setForm({ ...form, perShare: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          step="any"
          required
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t.dividends.exDate}</label>
          <input
            type="date"
            value={form.exDate}
            onChange={(e) => setForm({ ...form, exDate: e.target.value })}
            className="w-full rounded-lg border-gray-300 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t.dividends.payDate}</label>
          <input
            type="date"
            value={form.payDate}
            onChange={(e) => setForm({ ...form, payDate: e.target.value })}
            className="w-full rounded-lg border-gray-300 text-sm"
          />
        </div>
        <select
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value })}
          className="rounded-lg border-gray-300 text-sm self-end"
        >
          <option value="SAR">SAR</option>
          <option value="USD">USD</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              ...form,
              amount: Number(form.amount),
              perShare: Number(form.perShare),
            })
          }
          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
        >
          {t.common.save}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300"
        >
          {t.common.cancel}
        </button>
      </div>
    </div>
  )
}
