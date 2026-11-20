'use client'

import { useEffect, useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Asset, TxType } from '@/lib/types'
import { fxRate, linkToSymbol, rebaseToValue, unitsFromValue } from '@/lib/engine/valuation'
import { fetchQuotes } from '@/lib/market-client'
import { zakatDue, zakatRate } from '@/lib/engine/zakat'
import { ZakatSheet } from './ZakatControl'
import AssetPerformance from './AssetPerformance'
import { findCatalogFund, isMutualFund } from '@/lib/catalog'
import { CLASS_LABEL, REGION_LABEL, ZAKAT_LABEL, todayISO } from '@/lib/labels'
import { dateLabel, daysAgo, num, pct, unit } from '@/lib/format'
import { ClassFields } from './AssetWizard'
import { Chips, Confirm, Delta, Field, Money, Notice, NumberInput, Sheet, Stat } from './ui'

type Mode = null | TxType | 'EDIT' | 'PRICE' | 'LINK' | 'REBASE'

export default function AssetSheet({ assetId, initialMode, onClose }: { assetId: string | null; initialMode?: TxType | 'LINK'; onClose: () => void }) {
  const { L, data, view, settings, quotes, addTransaction, deleteTransaction, updateAsset, deleteAsset, refreshQuotes } = useStore()
  const row = view.rows.find((r) => r.asset.id === assetId) ?? null
  const [mode, setMode] = useState<Mode>(null)
  const [qty, setQty] = useState(0)
  const [price, setPrice] = useState(0)
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [edit, setEdit] = useState<Asset | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [zakatOpen, setZakatOpen] = useState(false)
  const [units, setUnits] = useState(0)
  const [estimated, setEstimated] = useState(false)
  const [why, setWhy] = useState<'fix' | 'in' | 'out'>('fix')
  const [nav, setNav] = useState<{ price: number; asOf?: string } | null>(null)

  // Opened from the quick-add button, the sheet goes straight to the chosen action.
  useEffect(() => {
    const r = view.rows.find((x) => x.asset.id === assetId)
    if (!initialMode || !r) { setMode(null); return }
    setQty(0)
    setPrice(initialMode === 'BUY' || initialMode === 'SELL' ? Number((r.price ?? 0).toFixed(4)) : 0)
    setAmount(initialMode === 'VALUE_UPDATE' ? r.asset.manualValue : 0)
    setDate(todayISO())
    setUnits(0); setEstimated(false)
    setMode(initialMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a different asset or action is opened
  }, [assetId, initialMode])
  // A manual asset whose name is a fund in the catalogue can follow that fund's published price.
  const manualAsset = row && row.asset.pricing === 'manual' ? row.asset : null
  const fund = useMemo(() => (manualAsset ? findCatalogFund(manualAsset.name, manualAsset.currency) : null), [manualAsset])
  useEffect(() => {
    if (mode !== 'LINK' || !fund) return
    let gone = false
    setNav(null)
    fetchQuotes([fund.symbol], {}, true).then(({ quotes: q }) => { if (!gone) setNav(q[fund.symbol] ? { price: q[fund.symbol].price, asOf: q[fund.symbol].asOf } : { price: 0 }) })
    return () => { gone = true }
  }, [mode, fund])
  if (!row) return null
  const a = row.asset
  const live = a.pricing === 'live'
  const weight = view.netWorth > 0 ? (row.value / view.netWorth) * 100 : 0
  const quote = a.symbol ? quotes[a.symbol] : undefined
  const txs = data.transactions.filter((t) => t.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt))
  const age = daysAgo(a.valueUpdatedAt)
  // In the asset's own currency: what the holding is worth and what one unit costs right now.
  const valueNow = row.value / fxRate(a.currency, settings.fx)
  const unitNow = row.price ?? 0
  const rebaseDiff = amount - valueNow
  const zakatNow = zakatDue(a, row.value, a.quantity, fxRate(a.currency, settings.fx), zakatRate(settings)).due

  const open = (m: Mode) => {
    setQty(0)
    setPrice(m === 'BUY' || m === 'SELL' ? Number((row.price ?? 0).toFixed(4)) : 0)
    setAmount(m === 'VALUE_UPDATE' ? a.manualValue : 0)
    setDate(todayISO())
    if (m === 'PRICE') setPrice(a.lastPrice ?? 0)
    if (m === 'LINK') { setUnits(0); setEstimated(false) }
    if (m === 'REBASE') { setAmount(Math.round(valueNow * 100) / 100); setWhy('fix') }
    setEdit(m === 'EDIT' ? { ...a } : null)
    setMode(m)
  }

  const TX_LABEL: Record<TxType, string> = {
    BUY: L('شراء', 'Buy'), SELL: L('بيع', 'Sell'), DIVIDEND: L('توزيعة / عائد', 'Dividend / income'),
    DEPOSIT: L('إيداع', 'Deposit'), WITHDRAW: L('سحب', 'Withdraw'), VALUE_UPDATE: L('تحديث القيمة', 'Value update'),
  }
  const isTrade = mode === 'BUY' || mode === 'SELL'
  const txValid = mode === 'REBASE' ? amount > 0 && (why === 'fix' || (why === 'in' && rebaseDiff > 0.005) || (why === 'out' && rebaseDiff < -0.005)) : mode === 'LINK' ? units > 0 : mode === 'PRICE' ? price > 0 : isTrade ? qty > 0 && price > 0 && (mode === 'BUY' || qty <= a.quantity) : amount > 0 || mode === 'VALUE_UPDATE'

  const submitTx = () => {
    if (mode === 'PRICE') {
      updateAsset(a.id, { lastPrice: price, valueUpdatedAt: new Date().toISOString() })
      setMode(null)
      return
    }
    if (mode === 'LINK') {
      if (!fund || !(units > 0)) return
      updateAsset(a.id, linkToSymbol(a, fund, units, nav?.price ?? 0, estimated))
      setMode(null)
      void refreshQuotes(true)
      return
    }
    if (mode === 'REBASE') {
      if (why === 'in' && unitNow > 0) addTransaction(a.id, { type: 'BUY', date: todayISO(), quantity: unitsFromValue(rebaseDiff, unitNow), price: unitNow, amount: rebaseDiff })
      else if (why === 'out' && unitNow > 0) addTransaction(a.id, { type: 'SELL', date: todayISO(), quantity: Math.min(a.quantity, unitsFromValue(-rebaseDiff, unitNow)), price: unitNow, amount: -rebaseDiff })
      else if (unitNow > 0) {
        // the difference is gain or loss: the value changes, the money invested does not
        addTransaction(a.id, { type: 'VALUE_UPDATE', date: todayISO(), quantity: 0, price: unitNow / (a.priceFactor || 1), amount })
        updateAsset(a.id, { unitsEstimated: true, valueAnchor: undefined })
      } else updateAsset(a.id, rebaseToValue(a, amount, 0))
      setMode(null)
      return
    }
    if (!mode || mode === 'EDIT') return
    addTransaction(a.id, { type: mode as TxType, date, quantity: qty, price, amount })
    setMode(null)
  }

  const title = mode === 'REBASE' ? L('تحديث القيمة', 'Update the value') : mode === 'LINK' ? L('ربط بالسعر المنشور', 'Link to the published price') : mode === 'EDIT' ? L('تعديل الأصل', 'Edit asset') : mode === 'PRICE' ? L('السعر يدويًا', 'Manual price') : mode ? `${TX_LABEL[mode as TxType]} — ${a.name}` : a.name

  return (
    <>
      <Sheet open={!!assetId} onClose={() => (mode ? setMode(null) : onClose())} title={title} footer={
        mode === 'EDIT' && edit ? (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!edit.name.trim()} onClick={() => { updateAsset(a.id, { ...edit, name: edit.name.trim(), unitsEstimated: edit.quantity !== a.quantity ? false : edit.unitsEstimated, valueUpdatedAt: edit.manualValue !== a.manualValue ? new Date().toISOString() : a.valueUpdatedAt }); setMode(null) }}>{L('حفظ', 'Save')}</button>
            <button className="btn-ghost flex-1" onClick={() => setMode(null)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        ) : mode ? (
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={!txValid} onClick={submitTx}>{mode === 'REBASE' ? L('حفظ القيمة', 'Save the value') : mode === 'LINK' ? L('اربط الصندوق', 'Link the fund') : mode === 'PRICE' ? L('حفظ السعر', 'Save price') : L('تسجيل', 'Record')}</button>
            <button className="btn-ghost flex-1" onClick={() => setMode(null)}>{L('إلغاء', 'Cancel')}</button>
          </div>
        ) : undefined
      }>
        {/* Overview */}
        {!mode && (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-ink-soft">{L('القيمة الحالية', 'Current value')}</p>
              <p className="text-3xl font-semibold"><Money value={row.value} /></p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <Delta value={row.gain} percent={row.gainPct} />
                {row.dayChange !== 0 && <span className="text-xs text-ink-soft">{quote?.origin === 'claude' ? L('آخر تقييم', 'Last valuation') : L('اليوم', 'Today')} <Delta value={row.dayChange} className="text-xs" /></span>}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-2xl bg-surface p-4">
              <Stat label={L('المستثمَر', 'Invested')}><span className="text-sm"><Money value={row.cost} /></span></Stat>
              <Stat label={L('الوزن', 'Weight')}><span className="num text-sm">{pct(weight)}</span></Stat>
              {live
                ? <Stat label={L('الكمية', 'Quantity')}><span className="num text-sm">{num(a.quantity, 'auto')}</span></Stat>
                : <Stat label={L('آخر تحديث', 'Updated')}><span className="text-sm">{age === null ? '—' : age === 0 ? L('اليوم', 'today') : L(`قبل ${age} يوم`, `${age}d ago`)}</span></Stat>}
            </div>

            {live && (
              <p className="text-xs text-ink-soft">
                {row.price !== null
                  ? <>{L('السعر', 'Price')} <span className="num font-semibold text-ink">{num(row.price, isMutualFund(a.symbol) ? 4 : 2)}</span>{!isMutualFund(a.symbol) && <> · <span className="num">{a.symbol}</span></>} · {row.source === 'manual' ? L('سعر أدخلتَه يدويًا', 'price you entered') : quote?.origin === 'claude' ? L('آخر تقييم منشور سجّله كلود', 'last published valuation, recorded by Claude') : row.source === 'live' ? L('سعر مباشر', 'live') : L('آخر سعر محفوظ', 'last saved price')}{quote?.asOf && <> · {L('بتاريخ', 'as of')} {dateLabel(quote.asOf, settings.locale)}</>}{quote?.sourceUrl && <> · <a className="font-semibold text-link" href={quote.sourceUrl} target="_blank" rel="noreferrer">{L('المصدر', 'source')}</a></>}</>
                  : isMutualFund(a.symbol)
                    ? L('لم يُسجَّل سعر وحدة لهذا الصندوق بعد؛ يسجّله كلود في التحديث اليومي القادم. تُعرض قيمة التكلفة مؤقتًا.', 'No unit price recorded for this fund yet; Claude records it in the next daily update. Showing cost for now.')
                    : L(`لم يتوفر سعر للرمز ${a.symbol} بعد؛ تُعرض قيمة التكلفة مؤقتًا.`, `No price for ${a.symbol} yet; showing cost for now.`)}
                {row.source !== 'live' && <button className="ms-2 font-semibold text-link underline-offset-2 hover:underline" onClick={() => open('PRICE')}>{L('أدخل السعر يدويًا', 'Enter price by hand')}</button>}
              </p>
            )}

            {fund && (
              <Notice tone="info" title={L('لهذا الصندوق سعر منشور يتحدث يوميًا', 'This fund has a published price that updates daily')}
                action={<button className="btn-primary min-h-[40px] px-4" onClick={() => open('LINK')}>{L('اربطه بسعره', 'Link it')}</button>}>
                {L(`سجّلته بقيمة تحدّثها يدويًا. اربطه بـ«${fund.ar}» فتتحدث قيمته وحدها ويظهر أداؤه.`, `You entered it as a value you update by hand. Link it to “${fund.en}” and its value updates on its own, with its performance.`)}
              </Notice>
            )}
            {live && a.unitsEstimated && (
              <Notice tone="info" title={(a.valueAnchor ?? 0) > 0 ? L('بانتظار أول سعر منشور', 'Waiting for the first published price') : L('القيمة تتحرك مع سعر الوحدة', 'The value moves with the unit price')}
                action={<div className="flex flex-wrap gap-2">
                  <button className="btn-soft min-h-[40px] px-4" onClick={() => open('REBASE')}>{L('حدّث القيمة', 'Update the value')}</button>
                  {!((a.valueAnchor ?? 0) > 0) && <button className="btn-ghost min-h-[40px] px-4" onClick={() => open('EDIT')}>{L('أدخل عدد الوحدات', 'Enter the unit count')}</button>}
                </div>}>
                {(a.valueAnchor ?? 0) > 0
                  ? L('تُعرض القيمة كما أدخلتها، وتبدأ تتحرك عند تسجيل أول سعر لهذا الصندوق.', 'The value shows as you entered it and starts moving once a price is recorded for this fund.')
                  : L('عدد الوحدات محسوب من القيمة التي أدخلتها. إن اختلفت عن كشف حسابك حدّثها بأي وقت.', 'The unit count was derived from the value you entered. If it differs from your statement, update it at any time.')}
              </Notice>
            )}

            <AssetPerformance asset={a} txs={txs} gainPct={row.gainPct} />

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
            {live && a.isFund && (a.priceFactor || 1) === 1 && !a.unitsEstimated && <button className="btn-soft w-full" onClick={() => open('REBASE')}>{L('حدّث القيمة من كشف حسابك', 'Update the value from your statement')}</button>}
            {!live && <button className="btn-ghost w-full" onClick={() => open('DIVIDEND')}>{L('سجّل عائدًا أو توزيعة', 'Record income / dividend')}</button>}

            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              {[
                [L('الجهة', 'Held at'), row.account?.name ?? '—'],
                [L('الفئة', 'Class'), L(CLASS_LABEL[a.assetClass].ar, CLASS_LABEL[a.assetClass].en)],
                [L('الجغرافيا', 'Geography'), L(REGION_LABEL[a.region].ar, REGION_LABEL[a.region].en)],
                ...(a.isEmergencyFund ? [[L('الدور', 'Role'), L('صندوق الطوارئ', 'Emergency fund')]] : []),
                ...(a.isIncomeAccount ? [[L('الدور', 'Role'), L('حساب الدخل', 'Income account')]] : []),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-3"><dt className="text-ink-soft">{k}</dt><dd className="text-end font-medium">{v}</dd></div>
              ))}
            </dl>
            <button className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2 text-start hover:bg-surface" onClick={() => setZakatOpen(true)}>
              <span><span className="block text-xs text-ink-soft">{L('الزكاة', 'Zakat')}</span><span className="text-sm font-semibold">{L(ZAKAT_LABEL[a.zakatMode].ar, ZAKAT_LABEL[a.zakatMode].en)}{a.zakatMode === 'PERCENT' ? ` (${a.zakatPercent}%)` : ''}</span></span>
              <span className="text-end"><Money value={zakatNow} className="block text-sm font-semibold" /><span className="text-xs font-semibold text-link">{L('تغيير', 'Change')}</span></span>
            </button>
            <button className="btn-soft w-full" onClick={() => open('EDIT')}>{L('تعديل الأصل والتصنيف', 'Edit asset & classification')}</button>

            <div>
              <h3 className="section-title mb-2">{L('السجل', 'History')}</h3>
              {txs.length === 0 ? <p className="hint">{L('لا عمليات مسجلة بعد.', 'No transactions yet.')}</p> : (
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {txs.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 px-4 py-2">
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

        {/* Link a manually valued fund to its published unit price */}
        {mode === 'LINK' && fund && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-surface p-4">
              <p className="text-sm font-semibold">{L(fund.ar, fund.en)}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {nav === null ? L('جاري جلب آخر سعر منشور…', 'Fetching the last published price…')
                  : nav.price > 0 ? <>{L('آخر سعر منشور للوحدة', 'Last published unit price')} <span className="num font-semibold text-ink">{num(nav.price, 4)}</span> {fund.currency}{nav.asOf && <> · {dateLabel(nav.asOf, settings.locale)}</>}</>
                  : L('لم يُسجَّل لهذا الصندوق سعر بعد. أدخل عدد الوحدات، ويظهر السعر مع التحديث اليومي القادم.', 'No price recorded for this fund yet. Enter your units; the price arrives with the next daily update.')}
              </p>
            </div>
            <Field label={L('عدد الوحدات التي تملكها', 'Units you hold')} hint={L('من كشف حساب الصندوق أو تطبيق البنك.', 'From your fund statement or bank app.')}>
              <NumberInput value={units} onChange={(n) => { setUnits(n); setEstimated(false) }} autoFocus />
            </Field>
            {nav && nav.price > 0 && (
              <button className="btn-soft w-full" onClick={() => { setUnits(unitsFromValue(a.manualValue, nav.price)); setEstimated(true) }}>
                {L(`استخدم قيمتي الحالية (${num(a.manualValue, 0)})`, `Use my current value (${num(a.manualValue, 0)})`)}
              </button>
            )}
            {units > 0 && nav && nav.price > 0 && (
              <p className="text-sm text-ink-soft">{L('القيمة بعد الربط', 'Value after linking')} <span className="num font-semibold text-ink">{num(units * nav.price, 2)} {fund.currency}</span>{estimated && <> · {L('ثم تتحرك يوميًا مع سعر الوحدة', 'then it moves daily with the unit price')}</>}</p>
            )}
            <p className="hint">{L('يبقى المبلغ المستثمَر ودور الأصل (استثماري أو طوارئ) كما هما. تقدر ترجع للقيمة اليدوية من «تعديل الأصل».', 'The amount invested and the asset’s role stay as they are.')}</p>
          </div>
        )}

        {/* Re-state what a priced fund is worth: its units follow, and the value keeps moving with the price */}
        {mode === 'REBASE' && (
          <div className="space-y-4">
            <Field label={L('قيمته عندي الآن', 'What it is worth now')} hint={L('من كشف حسابك أو تطبيق البنك.', 'From your statement or bank app.')}>
              <NumberInput value={amount} onChange={(n) => { setAmount(n); setWhy('fix') }} suffix={a.currency} autoFocus />
            </Field>
            <p className="text-sm text-ink-soft">{L('القيمة المحسوبة الآن', 'Value calculated now')} <span className="num font-semibold text-ink">{num(valueNow, 2)}</span>
              {Math.abs(rebaseDiff) >= 0.01 && amount > 0 && <> · {L('الفرق', 'difference')} <span className={`num font-semibold ${rebaseDiff > 0 ? 'text-gain' : 'text-loss'}`}>{rebaseDiff > 0 ? '+' : ''}{num(rebaseDiff, 2)}</span></>}</p>
            {unitNow > 0 && Math.abs(rebaseDiff) >= 0.01 && amount > 0 && (
              <Field group label={L('الفرق هو', 'The difference is')}
                hint={why === 'fix' ? (rebaseDiff > 0
                    ? L('يُحسب الفرق ربحًا: ترتفع القيمة ويبقى المبلغ المستثمَر كما هو، ويُسجَّل في سجل الأصل.', 'The difference counts as gain: the value rises, the amount invested stays as it is, and it is recorded in the asset’s history.')
                    : L('يُحسب الفرق خسارة: تنخفض القيمة ويبقى المبلغ المستثمَر كما هو، ويُسجَّل في سجل الأصل.', 'The difference counts as loss: the value falls, the amount invested stays as it is, and it is recorded in the asset’s history.'))
                  : why === 'in' ? L('يُسجَّل الفرق شراءً جديدًا بسعر اليوم، فيزيد المبلغ المستثمَر ولا يُحسب ربحًا.', 'The difference is recorded as a new purchase at today’s price: the amount invested goes up and it is not counted as gain.')
                  : L('يُسجَّل الفرق بيعًا بسعر اليوم.', 'The difference is recorded as a sale at today’s price.')}>
                <Chips wrap value={why} onChange={setWhy} options={[{ value: 'fix' as const, label: rebaseDiff > 0 ? L('ربح', 'Gain') : L('خسارة', 'Loss') }, ...(rebaseDiff > 0 ? [{ value: 'in' as const, label: L('أضفت مبلغًا', 'I added money') }] : [{ value: 'out' as const, label: L('سحبت مبلغًا', 'I took money out') }])]} />
              </Field>
            )}
            {why === 'fix' && amount > 0 && a.costBasis > 0 && Math.abs(rebaseDiff) >= 0.01 && (
              <p className="text-sm text-ink-soft">{L('إجمالي ربحك بعد التحديث', 'Your total gain after the update')} <span className={`num font-semibold ${amount >= a.costBasis ? 'text-gain' : 'text-loss'}`}>{amount >= a.costBasis ? '+' : ''}{num(amount - a.costBasis, 2)} ({pct((amount / a.costBasis - 1) * 100, 1, true)})</span></p>
            )}
            {!(unitNow > 0) && <p className="hint">{L('لا سعر منشور لهذا الصندوق بعد: تُحفظ القيمة كما هي إلى أن يُسجَّل أول سعر.', 'No published price for this fund yet: the value is kept as entered until the first price is recorded.')}</p>}
          </div>
        )}

        {/* Transaction form */}
        {mode && mode !== 'EDIT' && mode !== 'PRICE' && mode !== 'LINK' && mode !== 'REBASE' && (
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
              <input type="checkbox" className="h-5 w-5 rounded border-line text-link focus:ring-accent" checked={edit.isEmergencyFund} onChange={(e) => setEdit({ ...edit, isEmergencyFund: e.target.checked })} />
              <span className="text-sm">{L('جزء من صندوق الطوارئ', 'Part of the emergency fund')}</span>
            </label>
          </div>
        )}
      </Sheet>
      {zakatOpen && <ZakatSheet assetId={a.id} onClose={() => setZakatOpen(false)} />}
      <Confirm open={confirmDelete} onClose={() => setConfirmDelete(false)} title={L('حذف الأصل؟', 'Delete asset?')}
        body={L(`سيُحذف «${a.name}» وكل عملياته المسجلة نهائيًا.`, `“${a.name}” and all its recorded transactions will be permanently deleted.`)}
        confirmLabel={L('حذف', 'Delete')} onConfirm={() => { deleteAsset(a.id); onClose() }} />
    </>
  )
}
