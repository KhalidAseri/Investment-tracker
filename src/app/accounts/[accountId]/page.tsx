'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import type { Account, Holding, Transaction } from '@/types'

export default function AccountDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { t, locale } = useLocale()
  const [account, setAccount] = useState<Account | null>(null)
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; changePercent: number }>>({})
  const [loading, setLoading] = useState(true)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [showAddTransaction, setShowAddTransaction] = useState(false)

  const BackArrow = locale === 'ar' ? ArrowRight : ArrowLeft

  useEffect(() => {
    fetchAccount()
  }, [params.accountId])

  async function fetchAccount() {
    try {
      const res = await fetch(`/api/accounts/${params.accountId}`)
      if (!res.ok) { router.push('/accounts'); return }
      const data = await res.json()
      setAccount(data)

      const symbols = data.holdings
        ?.map((h: Holding) => h.symbol)
        .filter(Boolean)
      if (symbols?.length > 0) {
        const qRes = await fetch(`/api/market/quote?symbols=${symbols.join(',')}`)
        if (qRes.ok) setQuotes(await qRes.json())
      }
    } catch { router.push('/accounts') }
    finally { setLoading(false) }
  }

  async function addHolding(data: Record<string, unknown>) {
    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, accountId: params.accountId }),
    })
    if (res.ok) {
      setShowAddHolding(false)
      fetchAccount()
    }
  }

  async function deleteHolding(id: string) {
    if (!confirm(t.common.confirm)) return
    await fetch(`/api/holdings/${id}`, { method: 'DELETE' })
    fetchAccount()
  }

  async function addTransaction(data: Record<string, unknown>) {
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, accountId: params.accountId }),
    })
    if (res.ok) {
      setShowAddTransaction(false)
      fetchAccount()
    }
  }

  if (loading || !account) return <LoadingSpinner />

  const holdings = account.holdings ?? []
  const transactions = account.transactions ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/accounts')} className="p-2 rounded-lg hover:bg-gray-100">
          <BackArrow className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {locale === 'ar' ? account.nameAr : account.name}
          </h1>
          <p className="text-sm text-gray-500">{account.description}</p>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.accounts.holdings}</h2>
          <button
            onClick={() => setShowAddHolding(!showAddHolding)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t.accounts.addHolding}
          </button>
        </div>

        {/* Add Holding Form */}
        {showAddHolding && (
          <HoldingForm onSubmit={addHolding} onCancel={() => setShowAddHolding(false)} t={t} />
        )}

        {holdings.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-start py-2 font-medium">{t.holdings.name}</th>
                  <th className="text-start py-2 font-medium">{t.holdings.symbol}</th>
                  <th className="text-end py-2 font-medium">{t.holdings.shares}</th>
                  <th className="text-end py-2 font-medium">{t.holdings.avgCost}</th>
                  <th className="text-end py-2 font-medium">{t.holdings.currentPrice}</th>
                  <th className="text-end py-2 font-medium">{t.holdings.marketValue}</th>
                  <th className="text-end py-2 font-medium">{t.holdings.gainLoss}</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => {
                  const quote = holding.symbol ? quotes[holding.symbol] : null
                  const currentPrice = quote?.price ?? 0
                  const marketValue = holding.currentValue ?? holding.shares * currentPrice
                  const totalCost = holding.shares * holding.averageCost
                  const gainLoss = marketValue - totalCost
                  const gainLossPercent = totalCost > 0 ? (gainLoss / totalCost) * 100 : 0

                  return (
                    <tr key={holding.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {locale === 'ar' ? (holding.nameAr ?? holding.name) : holding.name}
                          </p>
                          {holding.indexTracked && (
                            <p className="text-xs text-gray-400">{holding.indexTracked}</p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-gray-600">{holding.symbol ?? '-'}</td>
                      <td className="py-3 text-end">{holding.shares.toLocaleString()}</td>
                      <td className="py-3 text-end">
                        <CurrencyDisplay amount={holding.averageCost} currency={account.currency} />
                      </td>
                      <td className="py-3 text-end">
                        {currentPrice > 0 ? (
                          <CurrencyDisplay amount={currentPrice} currency={account.currency} />
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="py-3 text-end font-medium">
                        <CurrencyDisplay amount={marketValue} currency={account.currency} />
                      </td>
                      <td className="py-3 text-end">
                        <div className="flex flex-col items-end gap-0.5">
                          <CurrencyDisplay amount={gainLoss} showSign colorize className="text-sm" />
                          <PercentBadge value={gainLossPercent} size="sm" />
                        </div>
                      </td>
                      <td className="py-3">
                        <button
                          onClick={() => deleteHolding(holding.id)}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transactions Section */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.accounts.transactions}</h2>
          <button
            onClick={() => setShowAddTransaction(!showAddTransaction)}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            {t.accounts.addTransaction}
          </button>
        </div>

        {showAddTransaction && (
          <TransactionForm
            holdings={holdings}
            onSubmit={addTransaction}
            onCancel={() => setShowAddTransaction(false)}
            t={t}
            locale={locale}
          />
        )}

        {transactions.length === 0 ? (
          <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-start py-2 font-medium">{t.transactions.date}</th>
                  <th className="text-start py-2 font-medium">{t.transactions.type}</th>
                  <th className="text-start py-2 font-medium">{t.holdings.name}</th>
                  <th className="text-end py-2 font-medium">{t.transactions.shares}</th>
                  <th className="text-end py-2 font-medium">{t.transactions.price}</th>
                  <th className="text-end py-2 font-medium">{t.transactions.amount}</th>
                  <th className="text-start py-2 font-medium">{t.transactions.notes}</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const typeColors: Record<string, string> = {
                    BUY: 'badge-green',
                    SELL: 'badge-red',
                    DIVIDEND: 'badge-blue',
                    DEPOSIT: 'badge-green',
                    WITHDRAWAL: 'badge-red',
                  }
                  const typeLabels: Record<string, string> = {
                    BUY: t.transactions.buy,
                    SELL: t.transactions.sell,
                    DIVIDEND: t.transactions.dividend,
                    DEPOSIT: t.transactions.deposit,
                    WITHDRAWAL: t.transactions.withdrawal,
                  }

                  return (
                    <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 text-gray-600">
                        {new Date(tx.date).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}
                      </td>
                      <td className="py-3">
                        <span className={typeColors[tx.type] ?? 'badge-blue'}>
                          {typeLabels[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className="py-3 text-gray-700">{tx.holding?.name ?? tx.symbol ?? '-'}</td>
                      <td className="py-3 text-end">{tx.shares ?? '-'}</td>
                      <td className="py-3 text-end">
                        {tx.pricePerShare ? (
                          <CurrencyDisplay amount={tx.pricePerShare} currency={tx.currency} />
                        ) : '-'}
                      </td>
                      <td className="py-3 text-end font-medium">
                        <CurrencyDisplay amount={tx.totalAmount} currency={tx.currency} />
                      </td>
                      <td className="py-3 text-gray-500 text-xs max-w-[200px] truncate">
                        {tx.notes}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// Inline Holding Form component
function HoldingForm({
  onSubmit,
  onCancel,
  t,
}: {
  onSubmit: (data: Record<string, unknown>) => void
  onCancel: () => void
  t: Record<string, any>
}) {
  const [form, setForm] = useState({
    name: '',
    nameAr: '',
    symbol: '',
    shares: 0,
    averageCost: 0,
    currentValue: '',
    targetAllocation: '',
    sector: '',
    indexTracked: '',
  })

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <input
          placeholder={t.holdings.name}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          required
        />
        <input
          placeholder={t.holdings.name + ' (AR)'}
          dir="rtl"
          value={form.nameAr}
          onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
        <input
          placeholder={t.holdings.symbol + ' (e.g. 2222.SR)'}
          value={form.symbol}
          onChange={(e) => setForm({ ...form, symbol: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
        <input
          placeholder={t.holdings.index}
          value={form.indexTracked}
          onChange={(e) => setForm({ ...form, indexTracked: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <input
          type="number"
          placeholder={t.holdings.shares}
          value={form.shares || ''}
          onChange={(e) => setForm({ ...form, shares: Number(e.target.value) })}
          className="rounded-lg border-gray-300 text-sm"
          min={0}
          step="any"
        />
        <input
          type="number"
          placeholder={t.holdings.avgCost}
          value={form.averageCost || ''}
          onChange={(e) => setForm({ ...form, averageCost: Number(e.target.value) })}
          className="rounded-lg border-gray-300 text-sm"
          min={0}
          step="any"
        />
        <input
          type="number"
          placeholder={t.holdings.allocation + ' (0-1)'}
          value={form.targetAllocation || ''}
          onChange={(e) => setForm({ ...form, targetAllocation: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          min={0}
          max={1}
          step="0.01"
        />
        <input
          placeholder={t.holdings.sector}
          value={form.sector}
          onChange={(e) => setForm({ ...form, sector: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              ...form,
              currentValue: form.currentValue ? Number(form.currentValue) : undefined,
              targetAllocation: form.targetAllocation ? Number(form.targetAllocation) : undefined,
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

// Inline Transaction Form component
function TransactionForm({
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
    type: 'BUY',
    holdingId: '',
    shares: '',
    pricePerShare: '',
    totalAmount: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  })

  const typeOptions = [
    { value: 'BUY', label: t.transactions.buy },
    { value: 'SELL', label: t.transactions.sell },
    { value: 'DIVIDEND', label: t.transactions.dividend },
    { value: 'DEPOSIT', label: t.transactions.deposit },
    { value: 'WITHDRAWAL', label: t.transactions.withdrawal },
  ]

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        >
          {typeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          value={form.holdingId}
          onChange={(e) => setForm({ ...form, holdingId: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        >
          <option value="">-- {t.holdings.name} --</option>
          {holdings.map((h) => (
            <option key={h.id} value={h.id}>
              {locale === 'ar' ? (h.nameAr ?? h.name) : h.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
        <input
          type="number"
          placeholder={t.transactions.shares}
          value={form.shares}
          onChange={(e) => setForm({ ...form, shares: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          step="any"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <input
          type="number"
          placeholder={t.transactions.price}
          value={form.pricePerShare}
          onChange={(e) => setForm({ ...form, pricePerShare: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          step="any"
        />
        <input
          type="number"
          placeholder={t.transactions.amount}
          value={form.totalAmount}
          onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
          step="any"
          required
        />
        <input
          placeholder={t.transactions.notes}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="rounded-lg border-gray-300 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() =>
            onSubmit({
              ...form,
              shares: form.shares ? Number(form.shares) : undefined,
              pricePerShare: form.pricePerShare ? Number(form.pricePerShare) : undefined,
              totalAmount: Number(form.totalAmount),
              holdingId: form.holdingId || undefined,
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
