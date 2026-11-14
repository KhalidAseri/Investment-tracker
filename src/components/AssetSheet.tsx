'use client'

import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Asset, TxType, ZakatMode } from '@/lib/types'
import { CLASS_LABEL, REGION_LABEL, ZAKAT_LABEL, todayISO } from '@/lib/labels'
import { dateLabel, daysAgo, num, pct, unit } from '@/lib/format'
import { ClassFields } from './AssetWizard'
import { Confirm, Delta, Field, Money, NumberInput, Sheet, Stat } from './ui'

type Mode = null | TxType | 'EDIT' | 'PRICE'

export default function AssetSheet({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const { L, data, view, settings, addTransaction, deleteTransaction, updateAsset, deleteAsset } = useStore()
  const row = view.rows.find((r) => r.asset.id === assetId) ?? null
  const [mode, setMode] = useState<Mode>(null)
  const [qty, setQty] = useState(0)
  const [price, setPrice] = useState(0)
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [edit, setEdit] = useState<Asset | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { setMode(null) }, [assetId])
  if (!row) return null
  const a = row.asset
  const live = a.pricing === 'live'
  const weight = view.netWorth > 0 ? (row.value / view.netWorth) * 100 : 0
  const txs = data.transactions.filter((t) => t.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt))
  const age = daysAgo(a.valueUpdatedAt)

  const open = (m: Mode) => {
    setQty(0)
    setPrice(m === 'BUY' || m === 'SELL' ? Number((row.price ?? 0).toFixed(4)) : 0)
    setAmount(m === 'VALUE_UPDATE' ? a.manualValue : 0)
    setDate(todayISO())
    if (m === 'PRICE') setPrice(a.lastPrice ?? 0)
    setEdit(m === 'EDIT' ? { ...a } : null)
    setMode(m)
  }

  const TX_LABEL: Record<TxType, string> = {
    BUY: L('شراء', 'Buy'), SELL: L('بيع', 'Sell'), DIVIDEND: L('توزيعة / عائد', 'Dividend / income'),
    DEPOSIT: L('إيداع', 'Deposit'), WITHDRAW: L('سحب', 'Withdraw'), VALUE_UPDATE: L('تحديث القيمة', 'Update value'),
  }
  const isTrade = mode === 'BUY' || mode === 'SELL'
  const txValid = mode === 'PRICE' ? price > 0 : isTrade ? qty > 0 && price > 0 && (mode === 'BUY' || qty <= a.quantity) : amount > 0 || mode === 'VALUE_UPDATE'

  const submitTx = () => {
    if (mode === 'PRICE') {
      updateAsset(a.id, { lastPrice: price, valueUpdatedAt: new Date().toISOString() })
      setMode(null)
      return
    }
    if (!mode || mode === 'EDIT') return
    addTransaction(a.id, { type: mode as TxType, date, quantity: qty, price, amount })
    setMode(null)
  }

  const title = mode === 'EDIT' ? L('تعديل الأصل', 'Edit asset') : mode === 'PRICE' ? L('السعر يدويًا', 'Manual price') : mode ? `${TX_LABEL[mode as TxType]} — ${a.name}` : a.name

  return (
    <>
      <Sheet open={!!assetId} onClose={() => (mode ? setMode(null) : onClose())} title={title} footer={
        mode === 'EDIT' && edit ? (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!edit.name.trim()} onClick={() => { updateAsset(a.id, { ...edit, name: edit.name.trim(), valueUpdatedAt: edit.manualValue !== a.manualValue ? new Date().toISOString() : a.valueUpdatedAt }); setMode(null) }}>{L('حفظ', 'Save')}</button>
            <button className="btn-ghost flex-1" onClick={() => setMode(null)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        ) : mode ? (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!txValid} onClick={submitTx}>{mode === 'PRICE' ? L('حفظ السعر', 'Save price') : L('تسجيل', 'Record')}</button>
            <button className="btn-ghost flex-1" onClick={() => setMode(null)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        ) : undefined
      }>
        {/* Overview */}
        {!mode && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-ink-soft">{L('القيمة الحالية', 'Current value')}</p>
              <p className="text-3xl font-bold"><Money value={row.value} /></p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Delta value={row.gain} percent={row.gainPct} />
                {row.dayChange !== 0 && <span className="text-xs text-ink-soft">{L('اليوم', 'Today')} <Delta value={row.dayChange} className="text-xs" /></span>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-2xl bg-surface p-3.5">
              <Stat label={L('المستثمَر', 'Invested')}><span className="text-sm"><Money value={row.cost} /></span></Stat>
              <Stat label={L('الوزن', 'Weight')}><span className="num text-sm">{pct(weight)}</span></Stat>
              {live
                ? <Stat label={L('الكمية', 'Quantity')}><span className="num text-sm">{num(a.quantity, 'auto')}</span></Stat>
                : <Stat label={L('آخر تحديث', 'Updated')}><span className="text-sm">{age === null ? '—' : age === 0 ? L('اليوم', 'today') : L(`قبل ${age} يوم`, `${age}d ago`)}</span></Stat>}
            </div>

            {live && (
              <p className="text-xs text-ink-soft">
                {row.price !== null
                  ? <>{L('السعر', 'Price')} <span className="num font-semibold text-ink">{num(row.price, 2)}</span> · <span className="num">{a.symbol}</span> · {row.source === 'live' ? L('سعر مباشر', 'live') : row.source === 'manual' ? L('سعر أدخلتَه يدويًا', 'price you entered') : L('آخر سعر محفوظ', 'last saved price')}</>
                  : L(`لم يتوفر سعر للرمز ${a.symbol} بعد؛ تُعرض قيمة التكلفة مؤقتًا.`, `No price for ${a.symbol} yet; showing cost for now.`)}
                {row.source !== 'live' && <button className="ms-2 font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => open('PRICE')}>{L('أدخل السعر يدويًا', 'Enter price by hand')}</button>}
              </p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {live ? (
                <>
                  <button className="btn-primary" onClick={() => open('BUY')}>{TX_LABEL.BUY}</button>
                  <button className="btn-ghost" onClick={() => open('SELL')} disabled={a.quantity <= 0}>{TX_LABEL.SELL}</button>
                  <button className="btn-ghost" onClick={() => open('DIVIDEND')}>{L('توزيعة', 'Dividend')}</button>
                </>
              ) : (
                <>
                  <button className="btn-primary" onClick={() => open('VALUE_UPDATE')}>{L('حدّث القيمة', 'Update')}</button>
                  <button className="btn-ghost" onClick={() => open('DEPOSIT')}>{TX_LABEL.DEPOSIT}</button>
                  <button className="btn-ghost" onClick={() => open('WITHDRAW')} disabled={a.manualValue <= 0}>{TX_LABEL.WITHDRAW}</button>
                </>
              )}
            </div>
            {!live && <button className="btn-ghost w-full" onClick={() => open('DIVIDEND')}>{L('سجّل عائدًا أو توزيعة', 'Record income / dividend')}</button>}

            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              {[
                [L('الجهة', 'Held at'), row.account?.name ?? '—'],
                [L('الفئة', 'Class'), L(CLASS_LABEL[a.assetClass].ar, CLASS_LABEL[a.assetClass].en)],
                [L('الجغرافيا', 'Geography'), L(REGION_LABEL[a.region].ar, REGION_LABEL[a.region].en)],
                [L('الزكاة', 'Zakat'), L(ZAKAT_LABEL[a.zakatMode].ar, ZAKAT_LABEL[a.zakatMode].en) + (a.zakatMode === 'PERCENT' ? ` (${a.zakatPercent}%)` : '')],
                ...(a.isEmergencyFund ? [[L('الدور', 'Role'), L('صندوق الطوارئ', 'Emergency fund')]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-3.5 py-2.5"><dt className="text-ink-soft">{k}</dt><dd className="text-end font-medium">{v}</dd></div>
              ))}
            </dl>
            <button className="btn-soft w-full" onClick={() => open('EDIT')}>{L('تعديل الأصل والتصنيف', 'Edit asset & classification')}</button>

            <div>
              <h3 className="section-title mb-2">{L('السجل', 'History')}</h3>
              {txs.length === 0 ? <p className="hint">{L('لا عمليات مسجلة بعد.', 'No transactions yet.')}</p> : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {txs.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 px-3.5 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{TX_LABEL[t.type]}</p>
                        <p className="text-xs text-ink-soft">{dateLabel(t.date, settings.locale)}{t.quantity > 0 && <span className="num"> · {num(t.quantity, 'auto')} × {num(t.price, 2)}</span>}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="num text-sm font-semibold">{settings.hideAmounts ? '••••' : `${num(t.amount)} ${unit(a.currency, settings.locale)}`}</span>
                        <button onClick={() => deleteTransaction(t.id)} className="flex h-11 w-9 items-center justify-center text-ink-faint hover:text-loss" aria-label={L('حذف العملية والتراجع عن أثرها', 'Delete and undo this transaction')}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button className="btn-danger w-full" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" />{L('حذف الأصل', 'Delete asset')}</button>
          </div>
        )}

        {/* Manual price for a live asset whose quote could not be fetched */}
        {mode === 'PRICE' && (
          <Field label={L('السعر الحالي للوحدة', 'Current unit price')} hint={L('يُستخدم فقط إلى أن يتوفر السعر المباشر من جديد.', 'Used only until the live price is available again.')}>
            <NumberInput value={price} onChange={setPrice} suffix={a.currency} autoFocus />
          </Field>
        )}

        {/* Transaction form */}
        {mode && mode !== 'EDIT' && mode !== 'PRICE' && (
          <div className="space-y-4">
            {isTrade ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label={L('الكمية', 'Quantity')} hint={mode === 'SELL' ? L(`المتاح ${num(a.quantity, 'auto')}`, `Available ${num(a.quantity, 'auto')}`) : undefined}>
                  <NumberInput value={qty} onChange={setQty} autoFocus />
                </Field>
                <Field label={L('السعر', 'Price')}><NumberInput value={price} onChange={setPrice} suffix={a.currency} /></Field>
              </div>
            ) : (
              <Field label={mode === 'VALUE_UPDATE' ? L('القيمة الحالية الجديدة', 'New current value') : L('المبلغ', 'Amount')}
                hint={mode === 'DEPOSIT' ? L('يزيد القيمة والمبلغ المستثمَر معًا.', 'Increases both the value and the amount invested.') : mode === 'VALUE_UPDATE' ? L('من كشف الحساب أو التطبيق. لا يغيّر المبلغ المستثمَر.', 'From your statement or app. Does not change the amount invested.') : undefined}>
                <NumberInput value={amount} onChange={setAmount} suffix={a.currency} autoFocus />
              </Field>
            )}
            {isTrade && qty > 0 && price > 0 && <p className="text-sm text-ink-soft">{L('الإجمالي', 'Total')} <span className="num font-semibold text-ink">{num(qty * price)} {a.currency}</span></p>}
            <Field label={L('التاريخ', 'Date')}><input type="date" className="input" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        )}

        {/* Edit form */}
        {mode === 'EDIT' && edit && (
          <div className="space-y-4">
            <Field label={L('الاسم', 'Name')}><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label={L('الجهة', 'Held at')}>
              <select className="input" value={edit.accountId} onChange={(e) => setEdit({ ...edit, accountId: e.target.value })}>
                {data.accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              {live ? (
                <>
                  <Field label={L('الكمية', 'Quantity')}><NumberInput value={edit.quantity} onChange={(quantity) => setEdit({ ...edit, quantity })} /></Field>
                  <Field label={L('إجمالي المستثمَر', 'Total invested')}><NumberInput value={edit.costBasis} onChange={(costBasis) => setEdit({ ...edit, costBasis })} suffix={edit.currency} /></Field>
                </>
              ) : (
                <>
                  <Field label={L('القيمة الحالية', 'Current value')}><NumberInput value={edit.manualValue} onChange={(manualValue) => setEdit({ ...edit, manualValue })} suffix={edit.currency} /></Field>
                  <Field label={L('إجمالي المستثمَر', 'Total invested')}><NumberInput value={edit.costBasis} onChange={(costBasis) => setEdit({ ...edit, costBasis })} suffix={edit.currency} /></Field>
                </>
              )}
            </div>
            <ClassFields value={edit} onChange={(p) => setEdit({ ...edit, ...p })} />
            <label className="flex items-center gap-3">
              <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={edit.isEmergencyFund} onChange={(e) => setEdit({ ...edit, isEmergencyFund: e.target.checked })} />
              <span className="text-sm">{L('جزء من صندوق الطوارئ', 'Part of the emergency fund')}</span>
            </label>
            <Field label={L('معالجة الزكاة', 'Zakat treatment')}>
              <select className="input" value={edit.zakatMode} onChange={(e) => setEdit({ ...edit, zakatMode: e.target.value as ZakatMode })}>
                {(Object.keys(ZAKAT_LABEL) as ZakatMode[]).map((z) => <option key={z} value={z}>{L(ZAKAT_LABEL[z].ar, ZAKAT_LABEL[z].en)}</option>)}
              </select>
            </Field>
            {edit.zakatMode === 'PERCENT' && (
              <Field label={L('نسبة الوعاء الزكوي من القيمة', 'Zakatable share of value')}><NumberInput value={edit.zakatPercent} onChange={(zakatPercent) => setEdit({ ...edit, zakatPercent })} suffix="%" /></Field>
            )}
          </div>
        )}
      </Sheet>
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} title={L('حذف الأصل؟', 'Delete asset?')}
        body={L(`سيُحذف «${a.name}» وكل عملياته المسجلة نهائيًا.`, `“${a.name}” and all its recorded transactions will be permanently deleted.`)}
        confirmLabel={L('حذف', 'Delete')} onConfirm={() => { deleteAsset(a.id); onClose() }} />
    </>
  )
}
