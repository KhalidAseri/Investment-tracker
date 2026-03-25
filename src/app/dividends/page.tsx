'use client'

import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { getAllDividends, getAllHoldings, createDividend, initSeedData } from '@/lib/storage'
import type { Dividend, Holding } from '@/types'

export default function DividendsPage() {
  const { t, locale } = useLocale()
  const [dividends, setDividends] = useState<Dividend[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  function load() {
    initSeedData()
    const holds = getAllHoldings()
    setHoldings(holds)
    const divs = getAllDividends().map((d) => ({ ...d, holding: holds.find((h) => h.id === d.holdingId) }))
    setDividends(divs)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function addDiv(data: any) { createDividend(data); setShowAdd(false); load() }

  if (loading) return <LoadingSpinner />

  const currentYear = new Date().getFullYear()
  const annualIncome = dividends.filter((d) => new Date(d.payDate).getFullYear() >= currentYear - 1).reduce((s, d) => s + d.amount, 0)

  const byHolding: Record<string, { name: string; nameAr: string; symbol: string; total: number; count: number }> = {}
  dividends.forEach((d) => {
    if (!byHolding[d.holdingId]) byHolding[d.holdingId] = { name: d.holding?.name ?? '', nameAr: d.holding?.nameAr ?? '', symbol: d.holding?.symbol ?? '', total: 0, count: 0 }
    byHolding[d.holdingId].total += d.amount; byHolding[d.holdingId].count++
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.dividends.title}</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
          <Plus className="w-4 h-4" />{t.common.add}</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card"><p className="text-sm text-gray-500">{t.dividends.annualIncome}</p>
          <CurrencyDisplay amount={annualIncome} className="text-xl sm:text-2xl font-bold text-gray-900 mt-1" /></div>
        <div className="card"><p className="text-sm text-gray-500">{locale === 'ar' ? 'الدخل الشهري' : 'Monthly Income'}</p>
          <CurrencyDisplay amount={annualIncome / 12} className="text-xl sm:text-2xl font-bold text-gray-900 mt-1" /></div>
        <div className="card"><p className="text-sm text-gray-500">{t.dividends.history}</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">{dividends.length}</p>
          <p className="text-xs text-gray-400">{locale === 'ar' ? 'توزيعة مسجلة' : 'records'}</p></div>
      </div>

      {showAdd && (
        <div className="card space-y-3">
          <h3 className="font-semibold">{t.common.add} {t.dividends.title}</h3>
          <DivForm holdings={holdings} onSubmit={addDiv} onCancel={() => setShowAdd(false)} t={t} locale={locale} />
        </div>
      )}

      {Object.keys(byHolding).length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">{t.dividends.yield}</h2>
          <div className="space-y-3">{Object.values(byHolding).map((g, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div><p className="font-medium text-gray-900">{locale === 'ar' ? g.nameAr : g.name}</p>
                <p className="text-xs text-gray-500">{g.symbol} · {g.count} {locale === 'ar' ? 'توزيعات' : 'payments'}</p></div>
              <CurrencyDisplay amount={g.total} className="font-semibold text-green-600" />
            </div>
          ))}</div>
        </div>
      )}

      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">{t.dividends.history}</h2>
        {dividends.length === 0 ? <p className="text-gray-500 text-sm text-center py-4">{t.dividends.noDividends}</p> : (
          <div className="space-y-2">
            {dividends.map((d) => (
              <div key={d.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div><p className="font-medium text-sm text-gray-900">{locale === 'ar' ? (d.holding?.nameAr ?? d.holding?.name) : d.holding?.name}</p>
                  <p className="text-xs text-gray-400">{d.holding?.symbol} · {new Date(d.payDate).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}</p></div>
                <div className="text-end"><CurrencyDisplay amount={d.amount} className="font-semibold text-green-600 text-sm" />
                  <p className="text-xs text-gray-400">{d.perShare} / {t.dividends.perShare}</p></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DivForm({ holdings, onSubmit, onCancel, t, locale }: { holdings: Holding[]; onSubmit: (d: any) => void; onCancel: () => void; t: any; locale: string }) {
  const [f, setF] = useState({ holdingId: '', amount: '', perShare: '', exDate: new Date().toISOString().split('T')[0], payDate: new Date().toISOString().split('T')[0], currency: 'SAR' })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select value={f.holdingId} onChange={(e) => setF({ ...f, holdingId: e.target.value })} className="rounded-lg border-gray-300 text-sm" required>
          <option value="">-- {t.holdings.name} --</option>
          {holdings.map((h) => <option key={h.id} value={h.id}>{locale === 'ar' ? (h.nameAr ?? h.name) : h.name}</option>)}</select>
        <input type="number" placeholder={t.dividends.amount} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="rounded-lg border-gray-300 text-sm" step="any" />
        <input type="number" placeholder={t.dividends.perShare} value={f.perShare} onChange={(e) => setF({ ...f, perShare: e.target.value })} className="rounded-lg border-gray-300 text-sm" step="any" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs text-gray-500 mb-1">{t.dividends.exDate}</label><input type="date" value={f.exDate} onChange={(e) => setF({ ...f, exDate: e.target.value })} className="w-full rounded-lg border-gray-300 text-sm" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">{t.dividends.payDate}</label><input type="date" value={f.payDate} onChange={(e) => setF({ ...f, payDate: e.target.value })} className="w-full rounded-lg border-gray-300 text-sm" /></div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit({ ...f, amount: Number(f.amount), perShare: Number(f.perShare) })} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
      </div>
    </div>
  )
}
