// «اشتريته»: records a purchase the owner made at his broker or bank and starts tracking it (lib/purchase.ts).
// Opened with openAction('buy', <roadmap key> | buyParam({...})) from the roadmap, the deposit planner or a plan action.
// Prefilled from the advisor's pick: the instrument, an account on its platform, the amount, ≈ units × the latest price.
// Viewers see the suggestion only.
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan } from '../lib/usePlan'
import { usePurchase } from '../lib/purchase'
import { useMarketInputs, quoteSymbol, type SymbolResult } from '../lib/market'
import { pickInstrument, type InstrumentPick, type RoadmapItem } from '../lib/advisor'
import {
  CATALOG, PLATFORM_LABEL, findInstrument, holdingMatches, marketKey, normalizeCatalogItem,
  type AssetClass, type CatalogItem, type Platform,
} from '../lib/catalog'
import { rateOf } from '../lib/calc'
import { num2, todayISO } from '../lib/format'
import { haptic, readBuyParam } from '../lib/ui'
import type { Account, Holding } from '../lib/types'
import { Money, Pct } from './kit'
import { NumberField, Segmented, SelectField, Sheet, TextField } from './ui'
import { SymbolSearch } from './SymbolSearch'
import { InstrumentCard, Ticker, platformShort } from './InstrumentCard'
import { IconSearch } from './icons'
import './BuySheet.css'

/** SAR per unit of a currency (London quotes in pence) */
const unitRate = (cur: string | null | undefined, fx: Record<string, number>) => {
  const c = cur ?? 'SAR'
  return c === 'GBp' || c.toUpperCase() === 'GBX' ? rateOf('GBP', fx) / 100 : rateOf(c, fx)
}
const normAr = (s: string) => s.replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').toLowerCase()
const keyLabel = (r: RoadmapItem) => r.title

/** an account that looks like it sits on this platform */
function accountFor(accounts: Account[], platform: Platform | null): Account | null {
  if (!platform) return null
  const words: Record<Platform, string[]> = {
    derayah: ['دراية', 'derayah'], derayah_global: ['دراية', 'derayah'], alrajhi: ['الراجحي', 'rajhi'], alinma: ['الإنماء', 'الانماء', 'alinma'],
    snb: ['الأهلي', 'الاهلي', 'snb'], albilad: ['البلاد', 'albilad'], sahm: ['سهم', 'sahm'], ibkr: ['ibkr', 'interactive'], bank: ['بنك', 'مصرف', 'bank'],
    mof: ['صح', 'المالية'], other: [],
  }
  const w = words[platform]
  if (platform === 'ibkr') return accounts.find((a) => a.is_ibkr) ?? null
  return accounts.find((a) => w.some((x) => normAr(a.name).includes(normAr(x)))) ?? null
}

export function BuySheet({ param, onClose }: { param?: string; onClose: () => void }) {
  const req = useMemo(() => readBuyParam(param), [param])
  const market = useMarketInputs()
  const view = usePlan(market)
  const { accounts, holdings, sleeves, readOnly, upsert, notify, fx } = useStore()
  const { record, busy } = usePurchase()
  const custom = view.doc?.custom_instruments ?? []

  // ---- where it goes ----
  const scopes = useMemo(() => {
    if (view.roadmap.length) return view.roadmap.filter((r) => r.status !== 'missing').map((r) => ({ value: r.key, label: keyLabel(r) }))
    return [{ value: 'emergency', label: 'صندوق الطوارئ' }, ...sleeves.map((s) => ({ value: `sleeve:id:${s.id}`, label: s.name }))]
  }, [view.roadmap, sleeves])
  const firstKey = req.key ?? view.roadmap.find((r) => r.status === 'next')?.key ?? scopes[0]?.value ?? 'emergency'
  const [key, setKey] = useState(firstKey)
  const road = view.roadmap.find((r) => r.key === key) ?? null
  const scope = key === 'emergency' || key === 'treasury' ? { kind: key as 'emergency' | 'treasury' } : { kind: 'sleeve' as const, key: key.replace(/^sleeve:/, '') }

  // ---- amount ----
  const [amount, setAmount] = useState<number>(() => Math.round(Number(req.amount) || 0))
  useEffect(() => { if (!req.amount && road && amount === 0 && road.remaining > 0) setAmount(Math.round(road.remaining / 10) * 10) }, [road?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- what was bought ----
  const pick: InstrumentPick | null = useMemo(() => {
    if (!view.ctx) return null
    if (road?.pick && !amount) return road.pick
    try { return pickInstrument(view.ctx, scope, amount || road?.remaining || 0, market) } catch { return road?.pick ?? null }
  }, [view.ctx, road, amount, market, key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [chosen, setChosen] = useState<CatalogItem | null | undefined>(() => (req.item ? findInstrument(req.item, custom) : undefined))
  const [holdingId, setHoldingId] = useState<string | null | undefined>(() => req.holding ?? undefined)
  const item: CatalogItem | null = chosen !== undefined ? chosen : pick?.item ?? null
  const holding: Holding | null = holdingId !== undefined
    ? holdings.find((h) => h.id === holdingId) ?? null
    : chosen !== undefined ? null : pick?.holding ?? null
  const [freeName, setFreeName] = useState('')
  const [picking, setPicking] = useState(false)

  // ---- price ----
  const qKey = item ? marketKey(item) : holding?.symbol ?? null
  const quote = qKey ? market.quotes[qKey] ?? market.quotes[qKey.toUpperCase()] : undefined
  const [live, setLive] = useState<{ price: number; currency: string } | null>(null)
  const basePrice = req.price ?? (quote ? Number(quote.price) : holding && Number(holding.price) > 0 && !(holding.price_source === 'manual' && Number(holding.quantity) === 1) ? Number(holding.price) : live?.price ?? null)
  const currency = quote?.currency ?? live?.currency ?? item?.currency ?? holding?.currency ?? 'SAR'
  const rate = unitRate(currency, fx)
  const [mode, setMode] = useState<'amount' | 'units'>(req.units ? 'units' : 'amount')
  const [units, setUnits] = useState<number>(Number(req.units) || 0)
  const [price, setPrice] = useState<number>(Number(basePrice) || 0)
  useEffect(() => { setPrice(Number(basePrice) || 0) }, [basePrice, item?.id, holding?.id])
  const lumpOnly = (!item || item.source === 'manual') && !(price > 0)
  const total = mode === 'units' ? Math.round(units * price * rate * 100) / 100 : amount
  const estUnits = mode === 'amount' && price > 0 ? amount / (price * rate) : null

  // ---- account ----
  const platform = pick?.platform && item && pick.item?.id === item.id ? pick.platform : item?.platforms[0] ?? null
  const suggested = (holding?.account_id && accounts.some((a) => a.id === holding.account_id) ? holding.account_id : null)
    ?? accountFor(accounts, platform)?.id ?? null
  const [account, setAccount] = useState<string>(() => suggested ?? (platform ? `new:${platform}` : accounts.find((a) => !a.exclude_from_portfolio)?.id ?? ''))
  useEffect(() => { setAccount(suggested ?? (platform ? `new:${platform}` : accounts.find((a) => !a.exclude_from_portfolio)?.id ?? '')) }, [item?.id, holding?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const accountOptions = [
    ...accounts.map((a) => ({ value: a.id, label: a.name })),
    ...(platform && !accountFor(accounts, platform) ? [{ value: `new:${platform}`, label: `حساب جديد: ${platformShort(platform)}` }] : []),
    { value: '', label: 'بلا حساب' },
  ]
  const [date, setDate] = useState(todayISO())

  const name = item?.name ?? holding?.name ?? freeName.trim()
  const canSave = !readOnly && !busy && total > 0 && !!name && (mode === 'amount' ? amount > 0 : units > 0 && price > 0)

  const save = async () => {
    if (!canSave) return
    haptic()
    let accountId: string | null = account || null
    if (account.startsWith('new:')) {
      const p = account.slice(4) as Platform
      const row = await upsert<Account>('accounts', {
        name: platformShort(p) ?? PLATFORM_LABEL[p], kind: p === 'bank' || p === 'mof' ? 'bank' : 'broker', is_ibkr: p === 'ibkr', exclude_from_portfolio: false,
        country: p === 'ibkr' ? 'INTL' : 'SA', note: null, sort: Math.max(0, ...accounts.map((a) => Number(a.sort) || 0)) + 1,
      } as unknown as Account)
      if (!row) return
      accountId = row.id
    }
    const r = await record({
      item, scope, holding, account_id: accountId, amount: total, date,
      units: mode === 'units' ? units : estUnits && !lumpOnly ? estUnits : null,
      price: !lumpOnly && price > 0 ? price : null, currency: !lumpOnly ? currency : 'SAR',
      name: item ? null : holding ? holding.name : freeName.trim(), symbol: item ? null : holding?.symbol ?? null,
      yieldPct: qKey ? market.yields[qKey] ?? null : null,
    })
    if (!r) return
    if (r.created) notify(`بدأت متابعة ${r.holding.name}`)
    onClose()
  }

  const footer = readOnly
    ? <button type="button" className="btn primary" onClick={onClose}>حسناً</button>
    : <>
      <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
      <button type="button" className="btn primary" disabled={!canSave} onClick={save}>{busy ? 'يحفظ…' : 'سجّل الشراء'}</button>
    </>

  return (
    <Sheet title={readOnly ? 'ما يُشترى' : 'سجّل ما اشتريته'} onClose={onClose} footer={footer}>
      <div className="stack bs">
        {scopes.length > 1 && !readOnly
          ? <SelectField label="إلى" value={key} onChange={(v) => { setKey(v); setChosen(undefined); setHoldingId(undefined); setAmount(0) }} options={scopes} />
          : road && <p className="bs-where">{road.title}</p>}
        {road && road.remaining > 0.5 && <p className="bs-need">ينقصه <Money v={road.remaining} /></p>}

        {picking && !readOnly ? (
          <InstrumentChooser cls={pick?.item?.class ?? road?.pick?.item?.class ?? null} platforms={view.doc?.profile?.platforms ?? []} custom={custom}
            alternatives={pick ? [pick.item, ...pick.alternatives].filter((x): x is CatalogItem => !!x) : []}
            heldIn={holdings.filter((h) => !h.archived)}
            onPick={(it, h) => { setChosen(it); setHoldingId(h?.id ?? null); setFreeName(''); setPicking(false) }}
            onFree={(n, it) => { setChosen(it); setHoldingId(null); setFreeName(n); setPicking(false); if (it?.symbol) quoteSymbol(it.symbol).then((q) => q && setLive({ price: q.price, currency: q.currency })) }}
            onCancel={() => setPicking(false)} />
        ) : (
          <InstrumentCard pick={chosen === undefined && holdingId === undefined ? pick : null} item={item} holding={holding} market={market}
            amount={total} reason={chosen !== undefined ? (holding ? 'تضيف إلى ما تملكه' : 'اخترتها بنفسك') : undefined}
            action={!readOnly ? <button type="button" className="btn ghost small" onClick={() => { haptic(); setPicking(true) }}><IconSearch />أداة أخرى</button> : undefined} />
        )}
        {!item && !holding && !readOnly && !picking && (
          <TextField label="اسم ما اشتريته" value={freeName} onChange={setFreeName} placeholder="مثال: وديعة مرابحة 6 أشهر" />
        )}

        {!readOnly && <>
          <SelectField label="الحساب" value={account} onChange={setAccount} options={accountOptions} />
          {!lumpOnly && (
            <Segmented label="طريقة الإدخال" value={mode} onChange={(v) => { haptic(); setMode(v); if (v === 'units' && !units && estUnits) setUnits(Math.round(estUnits * 1000) / 1000) }}
              options={[{ value: 'amount', label: 'المبلغ' }, { value: 'units', label: 'الوحدات والسعر' }]} />
          )}
          {mode === 'amount' || lumpOnly ? (
            <NumberField label="المبلغ المدفوع" value={amount} suffix="ريال" min={0} onChange={(v) => setAmount(Math.max(0, v))}
              hint={estUnits != null && !lumpOnly ? <>≈ <bdi dir="ltr">{num2(estUnits)}</bdi> وحدة بسعر <bdi dir="ltr">{num2(price)}</bdi> {currency === 'SAR' ? 'ريال' : <bdi dir="ltr">{currency}</bdi>}</> : 'شاملاً الرسوم'} />
          ) : (
            <div className="grid2">
              <NumberField label="عدد الوحدات" value={units} decimals={4} min={0} onChange={(v) => setUnits(Math.max(0, v))} />
              <NumberField label={`سعر الوحدة (${currency === 'SAR' ? 'ريال' : currency})`} value={price} decimals={2} min={0} onChange={(v) => setPrice(Math.max(0, v))} />
            </div>
          )}
          {mode === 'units' && total > 0 && <div className="bs-total"><span>المبلغ بالريال</span><Money v={total} /></div>}
          <label className="field"><span>تاريخ الشراء</span>
            <input className="input" type="date" dir="ltr" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} />
          </label>
          <p className="bs-hint">{item && item.source !== 'manual' ? 'يتابع التطبيق سعره تلقائياً كل يوم بعد التسجيل.' : 'تحدّث قيمته يدوياً من «تحديث القيم».'}</p>
        </>}
      </div>
    </Sheet>
  )
}

/** Choose another instrument: the advisor's alternatives, the catalog (search), what he already holds, or one not listed. */
function InstrumentChooser({ cls, platforms, custom, alternatives, heldIn, onPick, onFree, onCancel }: {
  cls: AssetClass | null; platforms: Platform[]; custom: CatalogItem[]; alternatives: CatalogItem[]; heldIn: Holding[]
  onPick: (it: CatalogItem | null, h: Holding | null) => void; onFree: (name: string, it: CatalogItem | null) => void; onCancel: () => void
}) {
  const [q, setQ] = useState('')
  const [free, setFree] = useState(false)
  const [fname, setFname] = useState('')
  const [fund, setFund] = useState('')
  const all = useMemo(() => [...custom, ...CATALOG.filter((c) => !custom.some((x) => x.id === c.id))], [custom])
  const term = normAr(q.trim())
  const list = term.length >= 2
    ? all.filter((c) => normAr(`${c.name} ${c.name_en ?? ''} ${c.symbol ?? ''} ${c.fund_id ?? ''}`).includes(term)).slice(0, 12)
    : (alternatives.length ? alternatives : all.filter((c) => !cls || c.class === cls)).slice(0, 8)
  const held = heldIn.filter((h) => list.some((c) => holdingMatches(h, c)))
  if (free) {
    const fromSymbol = (r: SymbolResult) => onFree(fname.trim() || r.name, normalizeCatalogItem({ id: `custom-${r.symbol}`, name: fname.trim() || r.name, class: cls ?? 'other', source: 'yahoo', symbol: r.symbol, currency: 'USD', platforms }))
    return (
      <div className="bs-choose">
        <TextField label="الاسم" value={fname} onChange={setFname} placeholder="اسم الأداة كما يظهر لدى الوسيط" />
        <SymbolSearch label="رمز السوق (إن كانت مدرجة)" onPick={fromSymbol} hint="يتابع التطبيق سعرها تلقائياً" />
        <TextField label="أو رقم الصندوق" value={fund} onChange={setFund} ltr placeholder="مثال: 1888" hint="صناديق الاستثمار السعودية: يتابع التطبيق سعر الوحدة" />
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn ghost small" onClick={() => setFree(false)}>رجوع</button>
          <button type="button" className="btn soft small grow" disabled={!fname.trim()} onClick={() => onFree(fname.trim(), fund.trim()
            ? normalizeCatalogItem({ id: `custom-fund-${fund.trim()}`, name: fname.trim(), class: cls ?? 'other', source: 'nav', fund_id: fund.trim(), currency: 'SAR', platforms })
            : null)}>استخدمها</button>
        </div>
      </div>
    )
  }
  return (
    <div className="bs-choose">
      <label className="field"><span>ابحث بالاسم أو الرمز</span>
        <input className="input" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="مثال: صكوك، ذهب، SPUS" autoFocus />
      </label>
      <div className="bs-list" role="listbox" aria-label="الأدوات">
        {held.map((h) => (
          <button key={`h:${h.id}`} type="button" className="bs-opt" onClick={() => onPick(list.find((c) => holdingMatches(h, c)) ?? null, h)}>
            <b>{h.name}</b><span>تملكه · تضيف إليه</span>
          </button>
        ))}
        {list.map((c) => (
          <button key={c.id} type="button" className="bs-opt" onClick={() => onPick(c, null)}>
            <b>{c.name}</b>
            <span>{[
              c.symbol ? <Ticker key="t" v={c.symbol} /> : c.fund_id ? <span key="t">صندوق <Ticker v={c.fund_id} /></span> : null,
              c.platforms[0] ? <span key="p">{platformShort(c.platforms[0])}</span> : null,
              c.ter != null ? <span key="r">رسوم <Pct v={c.ter} digits={2} /></span> : null,
            ].filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]))}</span>
          </button>
        ))}
        {!list.length && <p className="small muted bs-pad">لا نتائج.</p>}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn ghost small" onClick={onCancel}>إلغاء</button>
        <button type="button" className="btn quiet small grow" onClick={() => { haptic(); setFree(true) }}>غير موجودة في القائمة</button>
      </div>
    </div>
  )
}

