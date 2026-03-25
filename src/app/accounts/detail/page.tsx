'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import { getAccount, createHolding, deleteHolding as delHolding, createTransaction, getTransactions } from '@/lib/storage'
import type { Account, Holding } from '@/types'

function AccountDetail() {
  const searchParams = useSearchParams()
  const accountId = searchParams.get('id')
  const router = useRouter()
  const { t, locale } = useLocale()
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [showAddTx, setShowAddTx] = useState(false)
  const BackArrow = locale === 'ar' ? ArrowRight : ArrowLeft

  function load() {
    if (!accountId) { router.push('/accounts'); return }
    const a = getAccount(accountId)
    if (!a) { router.push('/accounts'); return }
    a.transactions = getTransactions(a.id)
    setAccount(a)
    setLoading(false)
  }

  useEffect(() => { load() }, [accountId])

  function addHolding(data: any) { createHolding({ ...data, accountId }); setShowAddHolding(false); load() }
  function removeHolding(id: string) { if (confirm(t.common.confirm)) { delHolding(id); load() } }
  function addTx(data: any) { createTransaction({ ...data, accountId }); setShowAddTx(false); load() }

  if (loading || !account) return <LoadingSpinner />
  const holdings = account.holdings ?? []
  const transactions = account.transactions ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/accounts')} className="p-2 rounded-lg hover:bg-gray-100 touch-manipulation"><BackArrow className="w-5 h-5" /></button>
        <div><h1 className="text-xl sm:text-2xl font-bold text-gray-900">{locale === 'ar' ? account.nameAr : account.name}</h1>
          <p className="text-sm text-gray-500">{account.description}</p></div>
      </div>

      {/* Holdings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.accounts.holdings}</h2>
          <button onClick={() => setShowAddHolding(!showAddHolding)} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
            <Plus className="w-4 h-4" /> {t.accounts.addHolding}
          </button>
        </div>
        {showAddHolding && <HoldingForm onSubmit={addHolding} onCancel={() => setShowAddHolding(false)} t={t} />}
        {holdings.length === 0 ? <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p> : (
          <div className="space-y-3">
            {holdings.map((h) => {
              const value = h.currentValue ?? h.shares * h.averageCost
              const cost = h.shares * h.averageCost
              const gl = value - cost
              const glp = cost > 0 ? (gl / cost) * 100 : 0
              return (
                <div key={h.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div><p className="font-medium text-gray-900">{locale === 'ar' ? (h.nameAr ?? h.name) : h.name}</p>
                      <p className="text-xs text-gray-400">{h.symbol ?? '-'} · {h.shares} {t.holdings.shares}{h.indexTracked ? ` · ${h.indexTracked}` : ''}</p></div>
                    <button onClick={() => removeHolding(h.id)} className="p-1 text-gray-400 hover:text-red-600 touch-manipulation"><Trash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <CurrencyDisplay amount={value} className="text-sm font-semibold" />
                    <div className="flex items-center gap-2"><CurrencyDisplay amount={gl} showSign colorize className="text-xs" /><PercentBadge value={glp} size="sm" /></div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Transactions */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.accounts.transactions}</h2>
          <button onClick={() => setShowAddTx(!showAddTx)} className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
            <Plus className="w-4 h-4" /> {t.accounts.addTransaction}
          </button>
        </div>
        {showAddTx && <TxForm holdings={holdings} onSubmit={addTx} onCancel={() => setShowAddTx(false)} t={t} locale={locale} />}
        {transactions.length === 0 ? <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p> : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const typeLabels: Record<string, string> = { BUY: t.transactions.buy, SELL: t.transactions.sell, DIVIDEND: t.transactions.dividend, DEPOSIT: t.transactions.deposit, WITHDRAWAL: t.transactions.withdrawal }
              const typeColors: Record<string, string> = { BUY: 'badge-green', SELL: 'badge-red', DIVIDEND: 'badge-blue', DEPOSIT: 'badge-green', WITHDRAWAL: 'badge-red' }
              return (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div><div className="flex items-center gap-2"><span className={typeColors[tx.type] ?? 'badge-blue'}>{typeLabels[tx.type] ?? tx.type}</span>
                    <span className="text-xs text-gray-400">{new Date(tx.date).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}</span></div>
                    {tx.notes && <p className="text-xs text-gray-500 mt-1">{tx.notes}</p>}</div>
                  <CurrencyDisplay amount={tx.totalAmount} className="font-semibold text-sm" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function HoldingForm({ onSubmit, onCancel, t }: { onSubmit: (d: any) => void; onCancel: () => void; t: any }) {
  const [f, setF] = useState({ name: '', nameAr: '', symbol: '', shares: 0, averageCost: 0, indexTracked: '', sector: '', currentValue: null as number | null, targetAllocation: null as number | null })
  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input placeholder={t.holdings.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input placeholder={t.holdings.name + ' (AR)'} dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input placeholder={t.holdings.symbol} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input placeholder={t.holdings.index} value={f.indexTracked} onChange={(e) => setF({ ...f, indexTracked: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input type="number" placeholder={t.holdings.shares} value={f.shares || ''} onChange={(e) => setF({ ...f, shares: Number(e.target.value) })} className="rounded-lg border-gray-300 text-sm" step="any" />
        <input type="number" placeholder={t.holdings.avgCost} value={f.averageCost || ''} onChange={(e) => setF({ ...f, averageCost: Number(e.target.value) })} className="rounded-lg border-gray-300 text-sm" step="any" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(f)} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
      </div>
    </div>
  )
}

function TxForm({ holdings, onSubmit, onCancel, t, locale }: { holdings: Holding[]; onSubmit: (d: any) => void; onCancel: () => void; t: any; locale: string }) {
  const [f, setF] = useState({ type: 'BUY', holdingId: '', shares: '', pricePerShare: '', totalAmount: '', date: new Date().toISOString().split('T')[0], notes: '', currency: 'SAR' })
  const types = [{ v: 'BUY', l: t.transactions.buy }, { v: 'SELL', l: t.transactions.sell }, { v: 'DIVIDEND', l: t.transactions.dividend }, { v: 'DEPOSIT', l: t.transactions.deposit }, { v: 'WITHDRAWAL', l: t.transactions.withdrawal }]
  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="rounded-lg border-gray-300 text-sm">
          {types.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <select value={f.holdingId} onChange={(e) => setF({ ...f, holdingId: e.target.value })} className="rounded-lg border-gray-300 text-sm">
          <option value="">-- {t.holdings.name} --</option>
          {holdings.map((h) => <option key={h.id} value={h.id}>{locale === 'ar' ? (h.nameAr ?? h.name) : h.name}</option>)}</select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input type="number" placeholder={t.transactions.amount} value={f.totalAmount} onChange={(e) => setF({ ...f, totalAmount: e.target.value })} className="rounded-lg border-gray-300 text-sm" step="any" />
      </div>
      <input placeholder={t.transactions.notes} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full rounded-lg border-gray-300 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => onSubmit({ ...f, shares: f.shares ? Number(f.shares) : null, pricePerShare: f.pricePerShare ? Number(f.pricePerShare) : null, totalAmount: Number(f.totalAmount), holdingId: f.holdingId || null, symbol: null })}
          className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
      </div>
    </div>
  )
}

export default function AccountDetailPage() {
  return <Suspense fallback={<LoadingSpinner />}><AccountDetail /></Suspense>
}
