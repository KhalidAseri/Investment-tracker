// One holding in full: value and gain, price chart, quick actions, facts and its own transactions.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Go } from '../App'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ZAKAT_RATE, holdingValue, rateOf } from '../lib/calc'
import { ago, dateLong, dateShort, num0, num1, num2, pct, relativeDays, sar, signedPct, todayISO } from '../lib/format'
import { FREQ_LABEL, hijriLabel, nextHaul, payoutAnnual, payoutPerPayment } from '../lib/income'
import { REGION_LABEL, holdingPnL, regionOf } from '../lib/wealth'
import { benchmarkHistory } from '../lib/tools'
import { assetColor, haptic, layerColor } from '../lib/ui'
import type { Holding, Transaction } from '../lib/types'
import { Avatar, Card, DateBadge, Empty, KV, Money, Pill } from '../components/kit'
import { AreaChart } from '../components/viz'
import { NumberField, Segmented, Sheet, TextField } from '../components/ui'
import { IconCoins, IconPencil, IconPlus, IconRefresh, IconWallet } from '../components/icons'
import { HoldingSheet } from './Holdings'
import { RecordPayoutSheet } from './Payouts'
import { TX_LABEL } from './Activity'
import './Asset.css'

// ---------- helpers shared with the quick-update screen ----------
const SOURCE_LABEL: Record<Holding['price_source'], string> = { yahoo: 'آلي من السوق', nav: 'آلي من مباشر', manual: 'يدوي', ibkr: 'من IBKR' }
export const curLabel = (c?: string | null) => (!c || c === 'SAR' ? 'ريال' : c)
/** a manual holding kept as one total value rather than units × price */
export const isLump = (h: Holding) => h.price_source === 'manual' && Number(h.quantity) === 1
export const isStale = (h: Holding) =>
  (h.price_source === 'manual' || h.price_source === 'nav') && (!h.price_updated_at || Date.now() - new Date(h.price_updated_at).getTime() > 35 * 86400000)
const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** "آخر تحديث قبل 3 أيام": minutes or hours within a day, days after that */
export function updatedLabel(iso: string | null | undefined) {
  if (!iso) return 'لم يُحدَّث بعد'
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000
  return `آخر تحديث ${hours < 24 ? ago(iso) : relativeDays(localDay(iso))}`
}
/** A riyal amount whose +/− stays beside its digits inside Arabic text; blurred in privacy mode. */
export function SignedSar({ v, plain }: { v: number; plain?: boolean }) {
  const sign = v < 0 ? '−' : !plain && v > 0 ? '+' : ''
  return <span className="money"><bdi dir="ltr">{sign}{num0(Math.abs(v))}</bdi> ريال</span>
}
/** time left until a far date, e.g. "بعد 2.6 سنة" */
function untilLabel(iso: string) {
  const days = Math.round((new Date(iso + 'T12:00:00').getTime() - Date.now()) / 86400000)
  if (days <= 60) return relativeDays(iso)
  if (days < 365) { const m = Math.round(days / 30.4); return m === 2 ? 'بعد شهرين' : m < 11 ? `بعد ${m} أشهر` : `بعد ${m} شهراً` }
  const y = Math.round((days / 365) * 10) / 10
  return y === 1 ? 'بعد سنة' : y === 2 ? 'بعد سنتين' : Number.isInteger(y) && y <= 10 ? `بعد ${y} سنوات` : `بعد ${num1(y)} سنة`
}

type SheetKind = 'update' | 'buy' | 'payout' | 'edit'

export default function Asset({ id, go }: { id: string; go: Go }) {
  const { holdings, sleeves, accounts, goals, transactions, fx, readOnly } = useStore()
  const d = useDerived()
  const [sheet, setSheet] = useState<SheetKind | null>(null)
  const [allTx, setAllTx] = useState(false)
  const close = useCallback(() => setSheet(null), [])
  const onDeleted = useCallback(() => { if (history.length > 1) history.back(); else go('portfolio') }, [go])
  const h = holdings.find((x) => x.id === id)

  if (!h) return (
    <div className="card">
      <Empty icon={<IconWallet />} title="لم نجد هذا الأصل" text="ربما حُذف، أو أن الرابط قديم." action={{ label: 'العودة إلى المحفظة', href: '#/portfolio' }} />
    </div>
  )

  const sleeve = sleeves.find((s) => s.id === h.sleeve_id)
  const goal = goals.find((g) => g.id === h.goal_id)
  const account = accounts.find((a) => a.id === h.account_id)
  const value = holdingValue(h, fx)
  const pnl = holdingPnL(h, fx)
  const total = d?.totals.total ?? 0
  const inMain = !h.goal_id && !account?.exclude_from_portfolio
  const weight = inMain && total > 0 && value > 0 ? (value / total) * 100 : null
  const lump = isLump(h)
  const chart = h.price_source === 'yahoo' && !!h.symbol
  const txs = transactions.filter((t) => t.holding_id === h.id)
    .sort((a, b) => b.tx_date.localeCompare(a.tx_date) || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  const perPayment = payoutPerPayment(h, fx)
  const due = h.payout_next && h.payout_next <= todayISO() ? h.payout_next : null

  return (
    <>
      <div className={`asset-grid ${chart ? '' : 'no-chart'}`}>
        <section className="card asset-head">
          <div className="asset-id">
            <Avatar name={h.name} symbol={h.price_source === 'yahoo' ? h.symbol : null} color={assetColor(h, sleeves)} size={52} />
            <div className="grow">
              <h2>{h.name}</h2>
              <div className="asset-chips">
                {goal ? <span className="chip accent">هدف: {goal.name}</span>
                  : sleeve ? <span className="chip"><i className="dot" style={{ background: layerColor(sleeve.layer) }} />{sleeve.name}</span>
                  : inMain ? <span className="chip warn">بلا طبقة</span> : <span className="chip">خارج المحفظة</span>}
                {account && <span className="chip">{account.name}</span>}
                <span className="chip">{SOURCE_LABEL[h.price_source]}</span>
                {h.archived && <span className="chip">مؤرشف</span>}
              </div>
            </div>
          </div>
          <div className="asset-value">
            <span className="asset-label">القيمة الحالية</span>
            <div className="figure asset-figure">{num0(value)}<small>ريال</small></div>
            {(pnl.gain != null || weight != null || (Number(h.quantity) === 0 && !h.archived)) && (
              <div className="asset-sub">
                {Number(h.quantity) === 0 && !h.archived && <span className="chip">لم يُشترَ بعد</span>}
                {pnl.gain != null && <span className="asset-gain"><Pill pct={pnl.pct} /><span><SignedSar v={pnl.gain} /> منذ الشراء</span></span>}
                {weight != null && <span>{pct(weight)} من المحفظة</span>}
              </div>
            )}
            <p className={`asset-updated ${isStale(h) ? 'warn' : ''}`}>{updatedLabel(h.price_updated_at)}</p>
          </div>
          {!readOnly && <Actions h={h} lump={lump} onPick={setSheet} />}
        </section>

        {chart && <PriceChart h={h} />}

        <Facts h={h} value={value} weight={weight} />

        <Card title="العمليات" flush className="asset-tx"
          action={txs.length > 6 ? { label: allTx ? 'عرض أقل' : `عرض الكل (${txs.length})`, onClick: () => setAllTx((v) => !v) } : null}>
          {txs.length === 0
            ? <Empty title="لا عمليات بعد" text="تظهر هنا الإيداعات والتوزيعات الخاصة بهذا الأصل." />
            : <div className="list">{(allTx ? txs : txs.slice(0, 6)).map((t) => <TxRow key={t.id} t={t} />)}</div>}
        </Card>
      </div>

      {sheet === 'update' && <UpdateSheet h={h} onClose={close} />}
      {sheet === 'buy' && <BuySheet h={h} onClose={close} />}
      {sheet === 'payout' && <RecordPayoutSheet initial={{ holding: h, date: due ?? todayISO(), ...(perPayment ? { amount: perPayment } : {}) }} onClose={close} />}
      {sheet === 'edit' && <HoldingSheet initial={h} onClose={close} onDeleted={onDeleted} />}
    </>
  )
}

function Actions({ h, lump, onPick }: { h: Holding; lump: boolean; onPick: (k: SheetKind) => void }) {
  const items: Array<{ k: SheetKind; icon: ReactNode; label: string }> = h.price_source === 'ibkr'
    ? [{ k: 'edit', icon: <IconPencil />, label: 'تعديل' }]
    : [
      { k: 'update', icon: <IconRefresh />, label: 'تحديث' },
      { k: 'buy', icon: <IconPlus />, label: lump ? 'إضافة مبلغ' : 'إضافة وحدات' },
      { k: 'payout', icon: <IconCoins />, label: 'توزيع' },
      { k: 'edit', icon: <IconPencil />, label: 'تعديل' },
    ]
  return (
    <div className="asset-actions">
      {items.map((a) => (
        <button key={a.k} type="button" onClick={() => { haptic(); onPick(a.k) }}>
          <span className="ico">{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
      {h.price_source === 'ibkr' && <p className="asset-auto">تتحدث وحداته وسعره من IBKR كل يوم.</p>}
    </div>
  )
}

// ---------- price chart (market-priced holdings) ----------
type Range = '1m' | '3m' | '1y'
const RANGES: Array<{ value: Range; label: string; long: string; days: number }> = [
  { value: '1m', label: 'شهر', long: 'خلال شهر', days: 30 },
  { value: '3m', label: '3 أشهر', long: 'خلال 3 أشهر', days: 91 },
  { value: '1y', label: 'سنة', long: 'خلال سنة', days: 365 },
]
type Pt = { date: string; value: number }

function PriceChart({ h }: { h: Holding }) {
  const [range, setRange] = useState<Range>('3m')
  const [data, setData] = useState<{ key: string; pts: Pt[] | null } | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const cache = useRef(new Map<string, Pt[]>())
  const key = `${h.symbol}|${range}`
  useEffect(() => {
    const hit = cache.current.get(key)
    if (hit) { setData({ key, pts: hit }); return }
    let live = true
    const days = RANGES.find((r) => r.value === range)?.days ?? 91
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    benchmarkHistory(h.symbol ?? '', from).catch(() => null).then((r) => {
      let pts: Pt[] = (r?.points ?? []).filter((p) => Number(p.c) > 0).map((p) => ({ date: p.d, value: Number(p.c) })).sort((a, b) => a.date.localeCompare(b.date))
      // London listings come back in pence while the holding is kept in pounds
      const last = pts[pts.length - 1]?.value ?? 0
      const price = Number(h.price) || 0
      if (price > 0 && last / price > 50 && last / price < 200) pts = pts.map((p) => ({ ...p, value: p.value / 100 }))
      if (pts.length > 1) cache.current.set(key, pts)
      if (live) setData({ key, pts: pts.length > 1 ? pts : null })
    })
    return () => { live = false }
  }, [key])

  const loading = data?.key !== key
  const pts = loading ? null : data?.pts ?? null
  const active = pts && scrub != null ? pts[scrub] : null
  const shown = active ? active.value : Number(h.price) || pts?.[pts.length - 1]?.value || 0
  const change = pts ? (pts[pts.length - 1].value / pts[0].value - 1) * 100 : null
  return (
    <section className="card asset-chart">
      <div className="asset-chart-top">
        <div>
          <span className="asset-label">{active ? dateLong(active.date) : 'سعر الوحدة'}</span>
          <div className="asset-price"><span className="num">{num2(shown)}</span><small>{curLabel(h.currency)}</small></div>
        </div>
        {!active && change != null && <Pill pct={change} label={RANGES.find((r) => r.value === range)?.long} />}
      </div>
      <div className="asset-chart-box">
        {loading ? <div className="skeleton" style={{ height: 150 }} />
          : pts ? <AreaChart points={pts} tone="plain" height={150} onScrub={setScrub} title={`سعر ${h.name}`} />
          : <div className="asset-chart-empty">تعذّر جلب الأسعار الآن</div>}
      </div>
      <div className="asset-seg">
        <Segmented label="المدة" value={range} onChange={(v) => { setScrub(null); setRange(v) }} options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
      </div>
    </section>
  )
}

// ---------- facts ----------
function Facts({ h, value, weight }: { h: Holding; value: number; weight: number | null }) {
  const { fx } = useStore()
  const pnl = holdingPnL(h, fx)
  const lump = isLump(h)
  const cur = curLabel(h.currency)
  const qty = Number(h.quantity) || 0
  const price = Number(h.price) || 0
  const freq = h.payout_freq ?? 'none'
  const per = freq === 'none' ? null : payoutPerPayment(h, fx)
  const annual = freq === 'none' ? null : payoutAnnual(h, fx)
  const how = h.payout_basis === 'per_unit'
    ? h.payout_per_unit != null ? `${num2(Number(h.payout_per_unit))} ${cur} للوحدة` : null
    : h.payout_rate != null ? `${num2(Number(h.payout_rate))}% سنوياً` : null
  const zakatable = h.zakatable !== false
  const haul = zakatable && h.zakat_start ? nextHaul(h.zakat_start, todayISO()) : null
  const fee = Number(h.fee_pct) || 0
  const purify = Number(h.purification_pct) || 0
  return (
    <Card title="التفاصيل" className="asset-facts">
      {!lump && qty > 0 && <KV label="الوحدات" value={num2(qty)} />}
      {!lump && price > 0 && <KV label="سعر الوحدة" value={`${num2(price)} ${cur}`} sub={h.currency !== 'SAR' ? sar(price * rateOf(h.currency, fx)) : undefined} />}
      {pnl.cost != null && <KV label="التكلفة" value={<Money v={pnl.cost} />} sub={!lump && qty > 0 ? `متوسط ${num2(pnl.cost / qty)} ريال للوحدة` : undefined} />}
      {pnl.gain != null && (
        <KV label="الربح أو الخسارة" value={<span className={pnl.gain >= 0 ? 'good' : 'bad'}><SignedSar v={pnl.gain} /></span>} sub={<bdi dir="ltr">{signedPct(pnl.pct ?? 0)}</bdi>} />
      )}
      {weight != null && <KV label="الوزن من المحفظة" value={pct(weight)} />}
      {freq !== 'none' && <KV label="التوزيع" value={FREQ_LABEL[freq]} sub={how ?? 'لم تُحدَّد النسبة'} />}
      {freq !== 'none' && h.payout_next && (
        <KV label="التوزيع القادم" value={dateLong(h.payout_next)} sub={per ? <>نحو <Money v={per} />، {relativeDays(h.payout_next)}</> : relativeDays(h.payout_next)} />
      )}
      {annual != null && annual > 0 && <KV label="التوزيعات السنوية" value={<Money v={annual} />} />}
      {h.maturity_date && <KV label="تاريخ الاستحقاق" value={dateLong(h.maturity_date)} sub={untilLabel(h.maturity_date)} />}
      {!zakatable ? <KV label="الزكاة" value="لا زكاة عليه" /> : value > 0 && (
        <KV label="الزكاة" value={<Money v={(value * ZAKAT_RATE) / 100} />}
          sub={haul ? `${hijriLabel(haul)}، ${dateShort(haul)}` : <span className="warn">لم تُحدَّد بداية الحول</span>} />
      )}
      {fee > 0 && <KV label="رسوم الإدارة السنوية" value={`${num2(fee)}%`} sub={<>نحو <Money v={(value * fee) / 100} /> في السنة</>} />}
      {purify > 0 && <KV label="نسبة التطهير" value={`${num2(purify)}%`} sub="من التوزيعات المستلمة" />}
      <KV label="السوق" value={REGION_LABEL[regionOf(h)]} />
      {h.symbol && (h.price_source === 'yahoo' || h.price_source === 'nav') && (
        <KV label={h.price_source === 'nav' ? 'رقمه في مباشر' : 'رمز التداول'} value={<span className="ltr">{h.symbol}</span>} />
      )}
      {h.note && <p className="asset-note">{h.note}</p>}
    </Card>
  )
}

// ---------- transactions ----------
const OUT_KINDS = new Set(['sell', 'withdrawal', 'fee', 'tax', 'zakat'])
function TxRow({ t }: { t: Transaction }) {
  const a = Number(t.amount_sar) || 0
  const income = t.kind === 'dividend' || t.kind === 'income'
  const out = OUT_KINDS.has(t.kind) || (t.kind === 'transfer' && a < 0)
  const year = t.tx_date.slice(0, 4)
  const meta = [year !== String(new Date().getFullYear()) ? year : null, t.quantity ? `${num2(Math.abs(Number(t.quantity)))} وحدة` : null, t.note]
    .filter(Boolean).join(' · ')
  return (
    <div className="asset-tx-row">
      <DateBadge iso={t.tx_date} />
      <div className="t"><b>{TX_LABEL[t.kind]}</b>{meta && <span>{meta}</span>}</div>
      <span className={`amt ${income ? 'good' : ''}`}><SignedSar v={out ? -Math.abs(a) : Math.abs(a)} plain={!income && !out} /></span>
    </div>
  )
}

// ---------- sheets ----------
function Preview({ label, v, diff }: { label: string; v: number; diff?: number }) {
  return (
    <div className="asset-preview" aria-live="polite">
      <span className="lbl">{label}</span>
      <b className="figure">{sar(v)}</b>
      {diff != null && Math.abs(diff) >= 1 && <Pill value={diff} />}
    </div>
  )
}

/** Today's value: one total for lump-sum holdings, otherwise units and unit price (market prices stay automatic). */
function UpdateSheet({ h, onClose }: { h: Holding; onClose: () => void }) {
  const { upsert, notify, fx } = useStore()
  const lump = isLump(h)
  const auto = h.price_source === 'yahoo'
  const [price, setPrice] = useState(Number(h.price) || 0)
  const [qty, setQty] = useState(Number(h.quantity) || 0)
  const [busy, setBusy] = useState(false)
  const cur = curLabel(h.currency)
  const before = holdingValue(h, fx)
  const after = (lump ? price : qty * price) * rateOf(h.currency, fx)
  const save = async () => {
    setBusy(true)
    const now = new Date().toISOString()
    const ok = await upsert('holdings', lump ? { id: h.id, price, quantity: 1, price_updated_at: now }
      : auto ? { id: h.id, quantity: qty }
      : { id: h.id, price, quantity: qty, price_updated_at: now })
    setBusy(false)
    if (ok) { notify(Math.abs(after - before) < 0.5 ? 'أُكّدت القيمة' : 'حُدّثت القيمة'); onClose() }
  }
  return (
    <Sheet title={lump ? 'تحديث القيمة' : 'تحديث الوحدات والسعر'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>}>
      <div className="stack">
        {lump ? (
          <NumberField label="القيمة الحالية" value={price} suffix={cur} decimals={2} onChange={setPrice} hint={updatedLabel(h.price_updated_at)} />
        ) : (
          <div className="grid2">
            {auto
              ? <div className="field"><span>سعر الوحدة</span><div className="input num hs-ro"><small>{cur}</small>{num2(price)}</div><small>يتحدث تلقائياً</small></div>
              : <NumberField label="سعر الوحدة" value={price} decimals={4} suffix={cur} onChange={setPrice} hint={h.price_source === 'nav' ? 'يتحدث كل صباح من مباشر' : undefined} />}
            <NumberField label="عدد الوحدات" value={qty} decimals={4} onChange={setQty} />
          </div>
        )}
        <Preview label="القيمة بعد التحديث" v={after} diff={after - before} />
      </div>
    </Sheet>
  )
}

/** More units (or more money in a lump-sum holding). New money counts as a deposit, money moved from cash as a purchase. */
function BuySheet({ h, onClose }: { h: Holding; onClose: () => void }) {
  const { upsert, insertMany, notify, fx } = useStore()
  const lump = isLump(h)
  const rate = rateOf(h.currency, fx)
  const unitSar = (Number(h.price) || 0) * rate
  const [units, setUnits] = useState(0)
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(todayISO())
  const [from, setFrom] = useState<'new' | 'cash'>('new')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const estimate = !lump && !(units > 0) && amount > 0 && unitSar > 0 ? amount / unitSar : null
  const add = lump ? 0 : units > 0 ? units : estimate ?? 0
  const save = async () => {
    if (lump ? !(amount > 0) : !(add > 0)) { notify(lump ? 'اكتب المبلغ' : 'اكتب عدد الوحدات أو المبلغ'); return }
    setBusy(true)
    // what was paid grows with each purchase; unknown stays unknown unless the holding started empty
    const costKnown = h.cost_basis != null || Number(h.quantity) === 0
    const ok = await insertMany('transactions', [{
      tx_date: date, kind: from === 'new' ? 'deposit' : 'buy', amount_sar: amount, quantity: lump ? null : add,
      price: lump ? null : amount > 0 ? amount / add : unitSar, holding_id: h.id, account_id: h.account_id, sleeve_id: h.sleeve_id,
      currency: 'SAR', source: 'manual', external_id: null, note: note.trim() || null,
    }])
    if (ok) {
      const cost = costKnown && amount > 0 ? { cost_basis: (Number(h.cost_basis) || 0) + amount } : {}
      await upsert('holdings', lump
        ? { id: h.id, price: Number(h.price) + amount / rate, price_updated_at: new Date().toISOString(), ...cost }
        : { id: h.id, quantity: Number(h.quantity) + add, ...cost })
      notify(lump ? 'أُضيف المبلغ' : 'أُضيفت الوحدات')
      onClose()
    }
    setBusy(false)
  }
  return (
    <Sheet title={lump ? 'إضافة مبلغ' : 'إضافة وحدات'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>}>
      <div className="stack">
        {lump ? (
          <NumberField label="المبلغ" value={amount || null} suffix="ريال" decimals={2} onChange={setAmount} />
        ) : (
          <div className="grid2">
            <NumberField label="الوحدات المضافة" value={units || null} decimals={4} onChange={setUnits}
              hint={estimate != null ? `نحو ${num2(estimate)} بسعر اليوم` : undefined} />
            <NumberField label="المبلغ المدفوع" value={amount || null} suffix="ريال" decimals={2} onChange={setAmount} />
          </div>
        )}
        <label className="field"><span>التاريخ</span>
          <input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
        </label>
        <div className="field asset-seg">
          <span>من أين المبلغ؟</span>
          <Segmented label="من أين المبلغ؟" value={from} onChange={setFrom} options={[{ value: 'new', label: 'مال جديد' }, { value: 'cash', label: 'من نقد في المحفظة' }]} />
          {from === 'cash' && <small>أنقص رصيد النقد بالمبلغ نفسه من «تحديث القيم».</small>}
        </div>
        <TextField label="ملاحظة" value={note} onChange={setNote} />
        {lump
          ? <Preview label="الرصيد بعد الإضافة" v={holdingValue(h, fx) + amount} />
          : <Preview label={`بعد الإضافة: ${num2(Number(h.quantity) + add)} وحدة`} v={(Number(h.quantity) + add) * unitSar} />}
      </div>
    </Sheet>
  )
}
