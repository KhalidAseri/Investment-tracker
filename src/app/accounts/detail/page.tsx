'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Plus, ArrowLeft, ArrowRight, Trash2, Pencil, RefreshCw, X } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import CurrencyDisplay from '@/components/shared/CurrencyDisplay'
import PercentBadge from '@/components/shared/PercentBadge'
import LoadingSpinner from '@/components/shared/LoadingSpinner'
import {
  getAccount, createHolding, updateHolding as updHolding, deleteHolding as delHolding,
  createTransaction, updateTransaction as updTx, deleteTransaction as delTx,
  getTransactions, updateAccount,
} from '@/lib/storage'
import { fetchQuotes, type MarketQuote } from '@/lib/market-client'
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
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null)
  const [editingTx, setEditingTx] = useState<string | null>(null)
  const [editingAccount, setEditingAccount] = useState(false)
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({})
  const [refreshing, setRefreshing] = useState(false)
  const BackArrow = locale === 'ar' ? ArrowRight : ArrowLeft

  function load() {
    if (!accountId) { router.push('/accounts'); return }
    const a = getAccount(accountId)
    if (!a) { router.push('/accounts'); return }
    a.transactions = getTransactions(a.id)
    setAccount(a)
    setLoading(false)

    // Fetch market prices
    const symbols = (a.holdings ?? []).map((h) => h.symbol).filter(Boolean) as string[]
    if (symbols.length > 0) {
      fetchQuotes(symbols).then(setQuotes).catch(() => {})
    }
  }

  useEffect(() => { load() }, [accountId])

  async function refreshPrices() {
    setRefreshing(true)
    const symbols = (account?.holdings ?? []).map((h) => h.symbol).filter(Boolean) as string[]
    if (symbols.length > 0) {
      try { const q = await fetchQuotes(symbols); setQuotes(q) } catch {}
    }
    setRefreshing(false)
  }

  function addHolding(data: any) { createHolding({ ...data, accountId }); setShowAddHolding(false); load() }
  function editHolding(data: any) {
    if (editingHolding) { updHolding(editingHolding.id, data); setEditingHolding(null); load() }
  }
  function removeHolding(id: string) { if (confirm(t.common.confirm)) { delHolding(id); load() } }
  function addTx(data: any) { createTransaction({ ...data, accountId }); setShowAddTx(false); load() }
  function editTxSubmit(id: string, data: any) { updTx(id, data); setEditingTx(null); load() }
  function removeTx(id: string) { if (confirm(t.common.confirm)) { delTx(id); load() } }
  function saveAccount(data: { name: string; nameAr: string; description: string }) {
    if (accountId) { updateAccount(accountId, data); setEditingAccount(false); load() }
  }

  if (loading || !account) return <LoadingSpinner />
  const holdings = account.holdings ?? []
  const transactions = account.transactions ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/accounts')} className="p-2 rounded-lg hover:bg-gray-100 touch-manipulation"><BackArrow className="w-5 h-5" /></button>
        {editingAccount ? (
          <AccountEditForm account={account} onSave={saveAccount} onCancel={() => setEditingAccount(false)} t={t} />
        ) : (
          <div className="flex-1 flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{locale === 'ar' ? account.nameAr : account.name}</h1>
              <p className="text-sm text-gray-500">{account.description}</p>
            </div>
            <button onClick={() => setEditingAccount(true)} className="p-2 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 touch-manipulation">
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Holdings */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{t.accounts.holdings}</h2>
          <div className="flex items-center gap-2">
            {Object.keys(quotes).length > 0 && (
              <button onClick={refreshPrices} disabled={refreshing} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 touch-manipulation disabled:opacity-50">
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button onClick={() => { setShowAddHolding(!showAddHolding); setEditingHolding(null) }}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
              <Plus className="w-4 h-4" /> {t.accounts.addHolding}
            </button>
          </div>
        </div>
        {showAddHolding && <HoldingForm onSubmit={addHolding} onCancel={() => setShowAddHolding(false)} t={t} locale={locale} />}
        {editingHolding && <HoldingForm initial={editingHolding} onSubmit={editHolding} onCancel={() => setEditingHolding(null)} t={t} locale={locale} />}
        {holdings.length === 0 ? <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p> : (
          <div className="space-y-3">
            {holdings.map((h) => {
              const quote = h.symbol ? quotes[h.symbol] : null
              const price = quote?.price ?? null
              const value = price ? h.shares * price : (h.currentValue ?? h.shares * h.averageCost)
              const cost = h.shares * h.averageCost
              const gl = value - cost
              const glp = cost > 0 ? (gl / cost) * 100 : 0
              return (
                <div key={h.id} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{locale === 'ar' ? (h.nameAr ?? h.name) : h.name}</p>
                      <p className="text-xs text-gray-400">
                        {h.symbol ?? '-'} · {h.shares} {t.holdings.shares}
                        {h.sector ? ` · ${h.sector}` : ''}
                        {h.indexTracked ? ` · ${h.indexTracked}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditingHolding(h); setShowAddHolding(false) }} className="p-1 text-gray-400 hover:text-primary-600 touch-manipulation"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => removeHolding(h.id)} className="p-1 text-gray-400 hover:text-red-600 touch-manipulation"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <CurrencyDisplay amount={value} className="text-sm font-semibold" />
                      {price && <p className="text-xs text-gray-400">{t.holdings.currentPrice}: {price.toFixed(2)}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <CurrencyDisplay amount={gl} showSign colorize className="text-xs" />
                      <PercentBadge value={glp} size="sm" />
                    </div>
                  </div>
                  {quote && (
                    <div className="mt-1 text-xs text-gray-400">
                      {t.dashboard.dailyChange}: <span className={quote.change >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  )}
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
          <button onClick={() => { setShowAddTx(!showAddTx); setEditingTx(null) }}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium touch-manipulation">
            <Plus className="w-4 h-4" /> {t.accounts.addTransaction}
          </button>
        </div>
        {showAddTx && <TxForm holdings={holdings} onSubmit={addTx} onCancel={() => setShowAddTx(false)} t={t} locale={locale} />}
        {transactions.length === 0 ? <p className="text-gray-500 text-sm py-4 text-center">{t.common.noData}</p> : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const typeLabels: Record<string, string> = { BUY: t.transactions.buy, SELL: t.transactions.sell, DIVIDEND: t.transactions.dividend, DEPOSIT: t.transactions.deposit, WITHDRAWAL: t.transactions.withdrawal }
              const typeColors: Record<string, string> = { BUY: 'badge-green', SELL: 'badge-red', DIVIDEND: 'badge-blue', DEPOSIT: 'badge-green', WITHDRAWAL: 'badge-red' }

              if (editingTx === tx.id) {
                return (
                  <div key={tx.id} className="p-3 bg-yellow-50 rounded-lg">
                    <TxForm holdings={holdings} initial={tx} onSubmit={(data) => editTxSubmit(tx.id, data)} onCancel={() => setEditingTx(null)} t={t} locale={locale} />
                  </div>
                )
              }

              return (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={typeColors[tx.type] ?? 'badge-blue'}>{typeLabels[tx.type] ?? tx.type}</span>
                      <span className="text-xs text-gray-400">{new Date(tx.date).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-US')}</span>
                    </div>
                    {tx.shares && tx.pricePerShare && (
                      <p className="text-xs text-gray-500 mt-0.5">{tx.shares} {t.transactions.shares} × {tx.pricePerShare.toFixed(2)}</p>
                    )}
                    {tx.notes && <p className="text-xs text-gray-500 mt-0.5">{tx.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <CurrencyDisplay amount={tx.totalAmount} className="font-semibold text-sm" />
                    <button onClick={() => { setEditingTx(tx.id); setShowAddTx(false) }} className="p-1 text-gray-400 hover:text-primary-600 touch-manipulation"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeTx(tx.id)} className="p-1 text-gray-400 hover:text-red-600 touch-manipulation"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountEditForm({ account, onSave, onCancel, t }: { account: Account; onSave: (d: any) => void; onCancel: () => void; t: any }) {
  const [f, setF] = useState({ name: account.name, nameAr: account.nameAr, description: account.description ?? '' })
  return (
    <div className="flex-1 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t.accounts.name} className="rounded-lg border-gray-300 text-sm" />
        <input value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} placeholder={t.accounts.nameAr} dir="rtl" className="rounded-lg border-gray-300 text-sm" />
      </div>
      <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t.accounts.description} className="w-full rounded-lg border-gray-300 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => onSave(f)} className="px-3 py-1 bg-primary-600 text-white rounded-lg text-sm">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-sm">{t.common.cancel}</button>
      </div>
    </div>
  )
}

function HoldingForm({ initial, onSubmit, onCancel, t, locale }: { initial?: Holding; onSubmit: (d: any) => void; onCancel: () => void; t: any; locale: string }) {
  const [f, setF] = useState({
    name: initial?.name ?? '', nameAr: initial?.nameAr ?? '', symbol: initial?.symbol ?? '',
    shares: initial?.shares ?? 0, averageCost: initial?.averageCost ?? 0,
    indexTracked: initial?.indexTracked ?? '', sector: initial?.sector ?? '',
    currentValue: initial?.currentValue ?? null as number | null,
    targetAllocation: initial?.targetAllocation ?? null as number | null,
  })
  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-700">{initial ? t.accounts.editHolding : t.accounts.addHolding}</h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <input placeholder={t.holdings.name} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="rounded-lg border-gray-300 text-sm" required />
        <input placeholder={t.holdings.name + ' (AR)'} dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input placeholder={t.holdings.symbol} value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input placeholder={t.holdings.sector} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input type="number" placeholder={t.holdings.shares} value={f.shares || ''} onChange={(e) => setF({ ...f, shares: Number(e.target.value) })} className="rounded-lg border-gray-300 text-sm" step="any" />
        <input type="number" placeholder={t.holdings.avgCost} value={f.averageCost || ''} onChange={(e) => setF({ ...f, averageCost: Number(e.target.value) })} className="rounded-lg border-gray-300 text-sm" step="any" />
        <input placeholder={t.holdings.index} value={f.indexTracked} onChange={(e) => setF({ ...f, indexTracked: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        <input type="number" placeholder={t.holdings.currentValue} value={f.currentValue ?? ''} onChange={(e) => setF({ ...f, currentValue: e.target.value ? Number(e.target.value) : null })} className="rounded-lg border-gray-300 text-sm" step="any" />
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSubmit(f)} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
      </div>
    </div>
  )
}

function TxForm({ holdings, initial, onSubmit, onCancel, t, locale }: { holdings: Holding[]; initial?: any; onSubmit: (d: any) => void; onCancel: () => void; t: any; locale: string }) {
  const [f, setF] = useState({
    type: initial?.type ?? 'BUY',
    holdingId: initial?.holdingId ?? '',
    shares: initial?.shares?.toString() ?? '',
    pricePerShare: initial?.pricePerShare?.toString() ?? '',
    totalAmount: initial?.totalAmount?.toString() ?? '',
    date: initial?.date ?? new Date().toISOString().split('T')[0],
    notes: initial?.notes ?? '',
    currency: initial?.currency ?? 'SAR',
  })

  const types = [
    { v: 'BUY', l: t.transactions.buy }, { v: 'SELL', l: t.transactions.sell },
    { v: 'DIVIDEND', l: t.transactions.dividend }, { v: 'DEPOSIT', l: t.transactions.deposit },
    { v: 'WITHDRAWAL', l: t.transactions.withdrawal },
  ]

  const isBuySell = f.type === 'BUY' || f.type === 'SELL'

  // Auto-calculate total when shares and price change
  function updateSharesPrice(shares: string, price: string) {
    const s = parseFloat(shares) || 0
    const p = parseFloat(price) || 0
    const total = s * p
    setF({ ...f, shares, pricePerShare: price, totalAmount: total > 0 ? total.toString() : f.totalAmount })
  }

  return (
    <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-gray-700">{initial ? t.accounts.editTransaction : t.accounts.addTransaction}</h3>
        <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="rounded-lg border-gray-300 text-sm">
          {types.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select>
        <select value={f.holdingId} onChange={(e) => setF({ ...f, holdingId: e.target.value })} className="rounded-lg border-gray-300 text-sm">
          <option value="">-- {t.holdings.name} --</option>
          {holdings.map((h) => <option key={h.id} value={h.id}>{locale === 'ar' ? (h.nameAr ?? h.name) : h.name}</option>)}</select>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="rounded-lg border-gray-300 text-sm" />
        {isBuySell ? (
          <>
            <input type="number" placeholder={t.transactions.shares} value={f.shares} onChange={(e) => updateSharesPrice(e.target.value, f.pricePerShare)} className="rounded-lg border-gray-300 text-sm" step="any" />
            <input type="number" placeholder={t.transactions.price} value={f.pricePerShare} onChange={(e) => updateSharesPrice(f.shares, e.target.value)} className="rounded-lg border-gray-300 text-sm" step="any" />
          </>
        ) : null}
        <input type="number" placeholder={t.transactions.amount} value={f.totalAmount} onChange={(e) => setF({ ...f, totalAmount: e.target.value })} className="rounded-lg border-gray-300 text-sm" step="any" />
      </div>
      <input placeholder={t.transactions.notes} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-full rounded-lg border-gray-300 text-sm" />
      <div className="flex gap-2">
        <button onClick={() => onSubmit({
          ...f,
          shares: f.shares ? Number(f.shares) : null,
          pricePerShare: f.pricePerShare ? Number(f.pricePerShare) : null,
          totalAmount: Number(f.totalAmount),
          holdingId: f.holdingId || null,
          symbol: null,
        })} className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm font-medium">{t.common.save}</button>
        <button onClick={onCancel} className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
      </div>
    </div>
  )
}

export default function AccountDetailPage() {
  return <Suspense fallback={<LoadingSpinner />}><AccountDetail /></Suspense>
}
