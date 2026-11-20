'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, ChevronLeft, ChevronRight, Gem, Home, Landmark, Package, Search, X } from 'lucide-react'
import { useStore, type NewAsset } from '@/lib/store'
import type { AccountKind, AssetClass, Quotes, Region } from '@/lib/types'
import { CATALOG, KARATS, SHELVES, findCatalogFund, isMutualFund, kindOf, searchAll, type AssetKind, type AssetKindId, type CatalogItem, type SaudiGroup, type Shelf } from '@/lib/catalog'
import { ASSET_CLASSES, CLASS_LABEL, KIND_LABEL, REGION_LABEL, SECTORS, ZAKAT_LABEL, DEFAULT_ZAKAT_PERCENT, defaultZakatMode, genId, todayISO } from '@/lib/labels'
import { fxRate, unitsFromValue } from '@/lib/engine/valuation'
import { priceOn } from '@/lib/engine/performance'
import type { ZakatFields } from '@/lib/engine/zakat'
import { ZakatControl } from './ZakatControl'
import { emergencyStatus } from '@/lib/engine/plan'
import { TROY_OUNCE_GRAMS, GOLD_SYMBOL } from '@/lib/engine/zakat'
import { fetchHistory, fetchQuotes, loadQuoteCache, rangeFor, searchMarket, type MarketHit } from '@/lib/market-client'
import { dateLabel, num, pct } from '@/lib/format'
import { Chips, Delta, Field, Notice, NumberInput, Sheet, cx, haptic } from './ui'

/** Assets with no market price: the user states their value. */
const MANUAL: { id: AssetKindId; ar: string; en: string; icon: React.ElementType }[] = [
  { id: 'CASH', ar: 'نقد أو وديعة', en: 'Cash or deposit', icon: Landmark },
  { id: 'FUND', ar: 'ادخار جهة العمل أو محفظة مُدارة', en: 'Employer plan or managed portfolio', icon: Briefcase },
  { id: 'REAL_ESTATE', ar: 'عقار', en: 'Property', icon: Home },
  { id: 'OTHER', ar: 'أصل آخر', en: 'Something else', icon: Package },
]
const IN_CATALOG = new Set(CATALOG.map((c) => c.symbol))
const PAGE = 30

interface Draft {
  kind: AssetKind
  name: string
  symbol: string
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  isFund: boolean
  domicile: string
  manager: string
  bullion: boolean
  karat: number
  /** How the holding is entered: a unit count, or the money paid and when. */
  entry: 'units' | 'amount' | 'value'
  quantity: number
  unitCost: number
  amount: number
  buyDate: string
  value: number
  invested: number
  isEmergencyFund: boolean
  accountId: string
  newAccount: string
  /** Mutual funds: today's unit price if the user knows it, used only while no published price exists. */
  navNow: number
  zakat: ZakatFields
  /** Once the user picks a treatment it no longer follows the asset class. */
  zakatTouched: boolean
}

export default function AssetWizard({ open, onClose, onExisting }: { open: boolean; onClose: () => void; onExisting?: (assetId: string) => void }) {
  const { L, data, settings, view, addAsset, addTransaction } = useStore()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [shelf, setShelf] = useState<Shelf>('saFunds')
  const [sub, setSub] = useState<SaudiGroup>('mutual')
  const [limit, setLimit] = useState(PAGE)
  const [px, setPx] = useState<Quotes>({})
  const pxRef = useRef<Quotes>({})
  const [hits, setHits] = useState<MarketHit[]>([])
  const [searching, setSearching] = useState(false)
  const [dup, setDup] = useState<{ assetId: string; name: string; go: () => void } | null>(null)
  const [buyPx, setBuyPx] = useState<{ price: number; day: string; exact: boolean } | null>(null)
  const [showClass, setShowClass] = useState(false)
  const [showZakat, setShowZakat] = useState(false)
  const Back = settings.locale === 'ar' ? ChevronRight : ChevronLeft
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const reset = () => { setDraft(null); setQuery(''); setShelf('saFunds'); setSub('mutual'); setLimit(PAGE); setHits([]); setDup(null); setBuyPx(null); setShowClass(false); setShowZakat(false) }
  const close = () => { reset(); onClose() }
  const q = query.trim()

  useEffect(() => { if (open) { pxRef.current = loadQuoteCache(); setPx(pxRef.current) } }, [open])
  const loadPrices = (symbols: string[]) => fetchQuotes(symbols, pxRef.current).then(({ quotes }) => { pxRef.current = quotes; setPx(quotes) })

  const efIncomplete = settings.monthlyExpenses > 0 && !emergencyStatus(view, settings).ready

  // ---- Step 1: find it ----
  const results = useMemo(() => {
    const all = searchAll(q, q ? null : shelf, settings.shariahFirst)
    return !q && shelf === 'saFunds' ? all.filter((c) => c.group === sub) : all
  }, [q, shelf, sub, settings.shariahFirst])
  const shown = results.slice(0, limit)
  const visible = shown.slice(0, 16).map((c) => c.symbol).join(',')
  useEffect(() => { setLimit(PAGE) }, [q, shelf, sub])
  useEffect(() => {
    if (!open || draft || !visible) return
    const t = setTimeout(() => { void loadPrices(visible.split(',')) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the visible symbols
  }, [open, draft, visible])

  // Anything listed that is not in the catalogue: ask the market, a moment after the typing stops.
  useEffect(() => {
    if (!open || draft || q.length < 2 || !/[A-Za-z0-9]/.test(q)) { setHits([]); setSearching(false); return }
    let gone = false
    setSearching(true)
    const t = setTimeout(() => {
      searchMarket(q).then((h) => {
        if (gone) return
        const fresh = h.filter((x) => !IN_CATALOG.has(x.symbol))
        setHits(fresh); setSearching(false)
        if (fresh.length) void loadPrices(fresh.slice(0, 8).map((x) => x.symbol))
      })
    }, 450)
    return () => { gone = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft, q])

  const startDraft = (k: AssetKind, item?: CatalogItem, custom?: { symbol: string; name?: string; isFund?: boolean }, bullion = false, carry?: { value: number }) => {
    const sameKind = data.accounts.find((a) => a.kind === k.accountKind)
    const symbol = k.pricing === 'live' ? (bullion ? GOLD_SYMBOL : item?.symbol ?? custom?.symbol ?? '') : ''
    const assetClass = item?.assetClass ?? k.assetClass
    const region = item?.region ?? (custom?.symbol.endsWith('.SR') ? 'SA' : k.region)
    const isFund = bullion ? true : item?.isFund ?? custom?.isFund ?? k.isFund
    setDraft({
      kind: k,
      zakat: { zakatMode: defaultZakatMode({ assetClass, region, isFund, symbol: symbol || null, pricing: k.pricing }), zakatPercent: DEFAULT_ZAKAT_PERCENT, zakatPerUnit: 0, zakatAmount: 0 },
      zakatTouched: false,
      name: item ? L(item.ar, item.en) : custom?.name ?? (bullion ? L('ذهب (سبائك)', 'Gold bullion') : ''),
      symbol, assetClass, region,
      sector: item?.sector ?? k.sector,
      currency: bullion ? 'SAR' : item?.currency ?? pxRef.current[symbol]?.currency ?? k.currency,
      isFund,
      domicile: item?.domicile ?? '',
      manager: item?.manager ?? '',
      bullion, karat: 24,
      // most people know what a mutual fund holding is worth, not how many units it is
      entry: carry || isMutualFund(symbol) ? 'value' : 'units',
      quantity: 0, unitCost: 0, amount: 0, buyDate: todayISO(), value: carry?.value ?? 0, invested: 0, navNow: 0,
      isEmergencyFund: k.id === 'CASH' && efIncomplete,
      accountId: sameKind?.id ?? data.accounts[0]?.id ?? '',
      newAccount: sameKind || data.accounts[0] ? '' : L(KIND_LABEL[k.accountKind].ar, KIND_LABEL[k.accountKind].en),
    })
    setBuyPx(null); setDup(null)
    if (symbol) void loadPrices([symbol])
  }

  /** Picking something already held offers to record a purchase on it instead of a second copy. */
  const pick = (symbol: string, name: string, go: () => void) => {
    const held = data.assets.find((a) => a.pricing === 'live' && a.symbol === symbol)
    if (held && onExisting) setDup({ assetId: held.id, name, go })
    else go()
  }
  const pickItem = (c: CatalogItem) => pick(c.symbol, L(c.ar, c.en), () => startDraft(kindOf(c.kind), c))
  const pickHit = (h: MarketHit) => pick(h.symbol, h.name, () =>
    startDraft(kindOf(h.symbol.endsWith('.SR') ? 'SA_STOCK' : h.type === 'CRYPTOCURRENCY' ? 'CRYPTO' : 'GLOBAL'), undefined, { symbol: h.symbol, name: h.name, isFund: h.type === 'ETF' || h.type === 'MUTUALFUND' }))
  // A Saudi mutual fund that is not in the list: a private key; Claude finds its valuation source on the next daily update.
  const otherFund = () => startDraft(kindOf('SA_STOCK'), undefined, { symbol: `MF:X-${genId().toUpperCase().slice(0, 12)}`, name: q, isFund: true })

  // ---- Step 2: how much ----
  const live = !!draft && draft.kind.pricing === 'live'
  const mutual = !!draft && isMutualFund(draft.symbol)
  const quote = draft && draft.symbol ? px[draft.symbol] : undefined
  const priced = live && !draft!.bullion

  // The provider's currency for a symbol picked from the market search arrives with its first quote.
  useEffect(() => {
    if (draft && priced && quote && !IN_CATALOG.has(draft.symbol) && !mutual && quote.currency !== draft.currency) set({ currency: quote.currency })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.currency])

  // Price on the purchase date, for the «amount and date» way of entering a holding.
  const wantBuyPx = !!draft && priced && draft.entry === 'amount'
  useEffect(() => {
    if (!draft || !wantBuyPx) { setBuyPx(null); return }
    if (draft.buyDate >= todayISO()) { setBuyPx(quote ? { price: quote.price, day: quote.asOf ?? todayISO(), exact: true } : null); return }
    let gone = false
    setBuyPx(null)
    fetchHistory(draft.symbol, rangeFor(draft.buyDate)).then((points) => {
      if (gone) return
      setBuyPx(priceOn(points, draft.buyDate) ?? (quote ? { price: quote.price, day: quote.asOf ?? todayISO(), exact: false } : null))
    })
    return () => { gone = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantBuyPx, draft?.symbol, draft?.buyDate, quote?.price])

  const nowPrice = quote?.price ?? (mutual && draft ? draft.navNow : 0)
  const byValue = !!draft && priced && draft.entry === 'value'
  const qty = !draft ? 0 : byValue ? unitsFromValue(draft.value, nowPrice) : draft.entry === 'amount' && priced ? unitsFromValue(draft.amount, buyPx?.price ?? 0) : draft.quantity
  const unitCost = !draft || byValue ? 0 : draft.entry === 'amount' && priced ? buyPx?.price ?? 0 : draft.unitCost
  const suggestion = draft && !live && draft.name.trim().length > 5 ? findCatalogFund(draft.name, draft.currency) : null

  // Until the user picks a treatment, it follows the class chosen in the classification fields.
  const zakatShown: ZakatFields = !draft ? { zakatMode: 'FULL', zakatPercent: DEFAULT_ZAKAT_PERCENT } : draft.zakatTouched ? draft.zakat
    : { ...draft.zakat, zakatMode: defaultZakatMode({ assetClass: draft.assetClass, region: draft.region, isFund: draft.isFund, symbol: live ? draft.symbol : null, pricing: draft.kind.pricing }) }
  const canSave = !!draft && draft.name.trim().length > 0 && (draft.accountId || draft.newAccount.trim()) && (byValue ? draft.value > 0 : live ? qty > 0 : draft.value > 0)

  const save = () => {
    if (!draft) return
    const kind = draft.kind
    const base = { assetClass: draft.assetClass, region: draft.region, isFund: draft.isFund, symbol: live ? draft.symbol : null, pricing: kind.pricing }
    // A priced holding with a known cost is recorded as a dated purchase, so its history starts on the right day.
    const asPurchase = priced && !byValue && qty > 0 && unitCost > 0
    const asset: NewAsset = {
      name: draft.name.trim(),
      ...base,
      sector: draft.sector,
      currency: draft.currency,
      priceFactor: draft.bullion ? draft.karat / 24 / TROY_OUNCE_GRAMS : 1,
      ...(priced && nowPrice > 0 ? { lastPrice: nowPrice } : {}),
      ...((priced && draft.entry === 'amount' && buyPx && !buyPx.exact) || byValue ? { unitsEstimated: true } : {}),
      // entered by value before the fund has any price: kept as stated, turned into units at the first price
      ...(byValue && !(nowPrice > 0) ? { valueAnchor: draft.value } : {}),
      quantity: live && !asPurchase ? qty : 0,
      costBasis: byValue ? draft.invested || draft.value : live ? (asPurchase ? 0 : qty * unitCost) : draft.invested || draft.value,
      manualValue: live ? 0 : draft.value,
      valueUpdatedAt: new Date().toISOString(),
      isEmergencyFund: draft.isEmergencyFund,
      ...(draft.zakatTouched ? draft.zakat : { ...draft.zakat, zakatMode: defaultZakatMode(base) }),
      domicile: draft.domicile,
    }
    const existing = data.accounts.find((a) => a.id === draft.accountId)
    const kindOfAccount: AccountKind = kind.accountKind
    const created = addAsset(asset, existing && !draft.newAccount.trim() ? { id: existing.id, name: existing.name, kind: existing.kind } : { name: draft.newAccount.trim(), kind: kindOfAccount })
    if (asPurchase) addTransaction(created.id, { type: 'BUY', date: draft.buyDate, quantity: qty, price: unitCost, amount: qty * unitCost })
    haptic()
    close()
  }

  const unitLabel = draft?.bullion ? L('جرام', 'g') : undefined
  const typeLabel = (t: MarketHit['type']) => (t === 'ETF' ? L('صندوق متداول', 'ETF') : t === 'MUTUALFUND' ? L('صندوق استثماري', 'Mutual fund') : t === 'CRYPTOCURRENCY' ? L('عملة رقمية', 'Crypto') : L('سهم', 'Stock'))

  /** Price column of a result row: the figure that tells the user it is the right thing. */
  const Price = ({ symbol }: { symbol: string }) => {
    const p = px[symbol]
    if (!p) return null
    return (
      <span className="shrink-0 text-end">
        <span className="num block text-sm font-semibold">{num(p.price, isMutualFund(symbol) ? 4 : 2)} <span className="text-[11px] font-normal text-ink-soft">{p.currency}</span></span>
        {p.origin === 'claude' && p.asOf ? <span className="text-[11px] text-ink-soft">{dateLabel(p.asOf, settings.locale)}</span> : <Delta percent={p.changePercent} className="text-[11px]" />}
      </span>
    )
  }
  const rowClass = 'flex min-h-[60px] w-full items-center justify-between gap-3 bg-card px-4 py-2 text-start hover:bg-surface'

  return (
    <Sheet open={open} onClose={close} title={draft ? draft.name || L(draft.kind.ar, draft.kind.en) : L('إضافة أصل', 'Add asset')} footer={draft ? (
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => { setDraft(null); setBuyPx(null) }} aria-label={L('رجوع', 'Back')}><Back className="h-5 w-5" /></button>
        <button className="btn-primary flex-1" disabled={!canSave} onClick={save}>{L('حفظ الأصل', 'Save asset')}</button>
      </div>
    ) : undefined}>
      {/* Step 1 — one search over everything, with the popular shelves underneath */}
      {!draft && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input className="input pe-11 ps-9" type="search" enterKeyHint="search" aria-label={L('بحث', 'Search')} placeholder={L('ابحث بالاسم أو الرمز', 'Search by name or symbol')} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-surface" aria-label={L('مسح البحث', 'Clear search')} onClick={() => setQuery('')}><X className="h-4 w-4" /></button>}
          </div>

          {dup && (
            <Notice tone="info" title={L(`تملك «${dup.name}» أصلًا`, `You already hold “${dup.name}”`)}
              action={<div className="flex flex-wrap gap-2">
                <button className="btn-primary min-h-[40px] px-4" onClick={() => { const id = dup.assetId; close(); onExisting?.(id) }}>{L('سجّل شراءً عليه', 'Record a purchase on it')}</button>
                <button className="btn-ghost min-h-[40px] px-4" onClick={dup.go}>{L('أضِفه كأصل منفصل', 'Add as a separate asset')}</button>
              </div>}>
              {L('تسجيل الشراء على نفس الأصل يبقي متوسط التكلفة والأداء في مكان واحد.', 'Recording the purchase on the same asset keeps its average cost and performance in one place.')}
            </Notice>
          )}

          {!q && <Chips value={shelf} onChange={setShelf} options={SHELVES.map((s) => ({ value: s.id, label: L(s.ar, s.en) }))} />}
          {!q && shelf === 'saFunds' && (
            <Chips wrap value={sub} onChange={setSub} options={[{ value: 'mutual' as SaudiGroup, label: L('استثمارية', 'Mutual') }, { value: 'listed' as SaudiGroup, label: L('متداولة وريت', 'Listed & REITs') }]} />
          )}
          {!q && shelf === 'saFunds' && sub === 'mutual' && (
            <p className="hint">{L('تُسعَّر بسعر الوحدة المنشور من مدير الصندوق، ويحدّثه كلود مساء كل يوم تداول.', 'Priced at the unit price the manager publishes; Claude updates it every trading-day evening.')}</p>
          )}
          {!q && shelf === 'metals' && (
            <button onClick={() => startDraft(kindOf('GOLD'), undefined, undefined, true)} className="flex w-full items-center justify-between rounded-2xl border border-line bg-card p-4 text-start hover:border-accent">
              <span>
                <span className="block text-sm font-semibold">{L('سبائك أو مشغولات بالجرام', 'Bullion or jewellery by gram')}</span>
                <span className="text-xs text-ink-soft">{L('يُسعَّر من سعر الذهب العالمي حسب العيار', 'Priced from the gold spot price by karat')}</span>
              </span>
              <Gem className="h-5 w-5 text-link" aria-hidden />
            </button>
          )}

          {shown.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              {shown.map((c) => (
                <li key={c.symbol}>
                  <button onClick={() => pickItem(c)} className={rowClass}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{L(c.ar, c.en)}</span>
                      <span className="flex items-center gap-2 text-xs text-ink-soft">
                        <span className="truncate">{isMutualFund(c.symbol) ? c.manager : <span className="num">{c.symbol}</span>}</span>
                        {c.shariah && <span className="shrink-0 text-gain">{L('شرعي', 'Shariah')}</span>}
                        {c.domicile === 'IE' && <span className="shrink-0">{L('أيرلندي', 'Irish')}</span>}
                      </span>
                    </span>
                    <Price symbol={c.symbol} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > shown.length && <button className="btn-ghost w-full" onClick={() => setLimit((n) => n + PAGE)}>{L(`عرض المزيد (${results.length - shown.length})`, `Show more (${results.length - shown.length})`)}</button>}

          {q && (hits.length > 0 || searching) && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-ink-soft">{L('من السوق مباشرة', 'Straight from the market')}</h3>
              {hits.length === 0 ? <div className="skeleton h-14" aria-busy="true" /> : (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                  {hits.map((h) => (
                    <li key={h.symbol}>
                      <button onClick={() => pickHit(h)} className={rowClass}>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium" dir="auto">{h.name}</span>
                          <span className="flex items-center gap-2 text-xs text-ink-soft"><span className="num">{h.symbol}</span><span className="truncate">{typeLabel(h.type)} · {h.exchange}</span></span>
                        </span>
                        <Price symbol={h.symbol} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {q && results.length === 0 && hits.length === 0 && !searching && (
            <p className="text-sm text-ink-soft">{L('لا نتيجة بهذا الاسم. إن كان صندوقًا سعوديًا غير مدرج أضِفه باسمه، وإلا أضِفه بقيمة تحدّثها أنت.', 'Nothing by that name. If it is an unlisted Saudi fund add it by name; otherwise add it with a value you update.')}</p>
          )}
          {q && /\p{L}/u.test(q) && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-ink-soft">{L('لم تجده؟', 'Not there?')}</h3>
              <div className="grid gap-2">
                <button className="btn-ghost w-full" onClick={otherFund}>{L(`أضِف «${q}» كصندوق سعودي غير مدرج`, `Add “${q}” as an unlisted Saudi fund`)}</button>
                <button className="btn-ghost w-full" onClick={() => { startDraft(kindOf('OTHER')); setDraft((d) => (d ? { ...d, name: q } : d)) }}>{L('أضِفه بقيمة تحدّثها أنت', 'Add it with a value you update')}</button>
              </div>
            </section>
          )}

          {!q && (
            <section>
              <h3 className="mb-2 text-xs font-medium text-ink-soft">{L('بدون سعر سوق — تحدّث قيمته أنت', 'No market price — you keep its value up to date')}</h3>
              <div className="grid grid-cols-2 gap-2">
                {MANUAL.map((m) => (
                  <button key={m.id} onClick={() => startDraft(kindOf(m.id))} className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-start hover:border-accent">
                    <m.icon className="h-5 w-5 shrink-0 text-ink-soft" aria-hidden />
                    <span className="text-sm font-medium leading-snug">{L(m.ar, m.en)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Step 2 — amounts and where it is held */}
      {draft && (
        <div className="space-y-4">
          {priced && (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4">
              <span className="min-w-0 text-xs text-ink-soft">
                <span className="block truncate">{mutual ? draft.manager || L('صندوق استثماري سعودي', 'Saudi mutual fund') : <span className="num">{draft.symbol}</span>}</span>
                <span>{quote ? (quote.origin === 'claude' ? L('آخر تقييم منشور', 'Last published valuation') : L('السعر الآن', 'Price now')) : mutual ? L('لم يُسجَّل له سعر بعد', 'No price recorded yet') : L('جاري جلب السعر…', 'Fetching price…')}{quote?.asOf && quote.origin === 'claude' && <> · {dateLabel(quote.asOf, settings.locale)}</>}</span>
              </span>
              {quote && <span className="num shrink-0 text-lg font-semibold">{num(quote.price, mutual ? 4 : 2)} <span className="text-xs font-normal text-ink-soft">{quote.currency}</span></span>}
            </div>
          )}

          <Field label={L('الاسم', 'Name')}>
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={L('مثال: حساب الادخار', 'e.g. Savings account')} />
          </Field>
          {suggestion && (
            <Notice tone="info" title={L('هذا الصندوق موجود بسعر يتحدث يوميًا', 'This fund is listed with a price that updates daily')}
              action={<button className="btn-primary min-h-[40px] px-4" onClick={() => startDraft(kindOf(suggestion.kind), suggestion, undefined, false, draft.value > 0 ? { value: draft.value } : undefined)}>{L('استخدم الصندوق المسعَّر', 'Use the priced fund')}</button>}>
              {L(`«${suggestion.ar}»: أضِفه من القائمة فتتحدث قيمته وحدها بدل أن تحدّثها يدويًا.`, `“${suggestion.en}”: add it from the list and its value updates on its own.`)}
            </Notice>
          )}

          {live ? (
            <>
              {draft.bullion && (
                <Field group label={L('العيار', 'Karat')}>
                  <Chips wrap value={draft.karat} onChange={(karat) => set({ karat })} options={KARATS.map((k) => ({ value: k, label: String(k) }))} />
                </Field>
              )}
              {priced && (
                <Field group label={L('كيف تُدخله؟', 'How do you want to enter it?')}>
                  <Chips wrap value={draft.entry} onChange={(entry) => set({ entry })} options={(() => {
                    const units = { value: 'units' as const, label: mutual ? L('بعدد الوحدات', 'By units') : L('بالكمية', 'By quantity') }
                    const amount = { value: 'amount' as const, label: L('بالمبلغ والتاريخ', 'By amount and date') }
                    const value = { value: 'value' as const, label: L('بقيمته الآن', 'By its value now') }
                    return mutual ? [value, units, amount] : [units, amount, value]
                  })()} />
                </Field>
              )}
              {byValue ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={L('قيمته عندي الآن', 'What it is worth now')}>
                      <NumberInput value={draft.value} onChange={(value) => set({ value })} suffix={draft.currency} />
                    </Field>
                    <Field label={L('المبلغ المستثمَر', 'Amount invested')} hint={L('اتركه فارغًا إن كان يساوي القيمة', 'Leave empty if equal to the value')}>
                      <NumberInput value={draft.invested} onChange={(invested) => set({ invested })} suffix={draft.currency} />
                    </Field>
                  </div>
                  <p className="hint">{nowPrice > 0
                    ? L('من كشف حسابك أو تطبيق البنك. بعدها تتحرك القيمة يوميًا مع سعر الوحدة، وتقدر تحدّثها بأي وقت من صفحة الأصل.', 'From your statement or bank app. From then on the value moves daily with the unit price, and you can re-state it at any time from the asset page.')
                    : L('لا سعر منشور لهذا الصندوق بعد. تُحفظ القيمة كما أدخلتها، وتبدأ تتحرك مع أول سعر يُسجَّل له.', 'No published price for this fund yet. The value is kept as entered and starts moving with the first price recorded for it.')}</p>
                </>
              ) : draft.entry === 'amount' && priced ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={L('المبلغ الذي دفعته', 'Amount you paid')}>
                      <NumberInput value={draft.amount} onChange={(amount) => set({ amount })} suffix={draft.currency} />
                    </Field>
                    <Field label={L('تاريخ الشراء', 'Purchase date')}>
                      <input type="date" className="input" value={draft.buyDate} max={todayISO()} onChange={(e) => set({ buyDate: e.target.value || todayISO() })} />
                    </Field>
                  </div>
                  <p className="hint">
                    {!buyPx ? (quote || !mutual ? L('جاري جلب سعر ذلك اليوم…', 'Fetching that day’s price…') : L('لا سعر منشور لهذا الصندوق بعد. أدخله بعدد الوحدات.', 'No published price for this fund yet. Enter it by units.'))
                      : <>{L('سعر الشراء المعتمد', 'Purchase price used')} <span className="num font-semibold text-ink">{num(buyPx.price, mutual ? 4 : 2)}</span> {L('بتاريخ', 'on')} {dateLabel(buyPx.day, settings.locale)}{!buyPx.exact && <> · {L('أقرب سعر متوفر، فعدد الوحدات تقريبي', 'the nearest price available, so the unit count is approximate')}</>}</>}
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={draft.bullion ? L('الوزن', 'Weight') : mutual ? L('عدد الوحدات', 'Units') : L('الكمية', 'Quantity')}>
                      <NumberInput value={draft.quantity} onChange={(quantity) => set({ quantity })} suffix={unitLabel} />
                    </Field>
                    <Field label={draft.bullion ? L('متوسط سعر الشراء للجرام', 'Avg. cost per gram') : mutual ? L('متوسط سعر شراء الوحدة', 'Average cost per unit') : L('متوسط سعر الشراء', 'Average cost')}>
                      <NumberInput value={draft.unitCost} onChange={(unitCost) => set({ unitCost })} suffix={draft.currency} />
                    </Field>
                  </div>
                  {mutual && !quote && (
                    <Field label={L('سعر الوحدة اليوم (اختياري)', 'Unit price today (optional)')} hint={L('من كشف حسابك. يُستخدم إلى أن يُسجَّل أول سعر منشور.', 'From your statement. Used until the first published price is recorded.')}>
                      <NumberInput value={draft.navNow} onChange={(navNow) => set({ navNow })} suffix={draft.currency} />
                    </Field>
                  )}
                  <p className="hint">{mutual
                    ? L('عدد الوحدات ومتوسط سعرها في كشف حساب الصندوق.', 'Units and their average cost are on your fund statement.')
                    : L('إن لم تعرف متوسط الشراء اتركه فارغًا وعدّله لاحقًا.', 'If you do not know your average cost, leave it empty and edit it later.')}</p>
                </>
              )}
              {priced && qty > 0 && nowPrice > 0 && (
                <div className="rounded-2xl border border-line p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs text-ink-soft">{L('قيمته اليوم', 'Worth today')}</span>
                    <span className="num text-lg font-semibold">{num(qty * nowPrice, 2)} <span className="text-xs font-normal text-ink-soft">{draft.currency}</span></span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3 text-xs text-ink-soft">
                    <span>{byValue && '≈ '}<span className="num">{num(qty, 4)}</span> {mutual ? L('وحدة', 'units') : L('سهم/وحدة', 'shares')}</span>
                    {byValue && draft.invested > 0 && <span>{L('منذ الشراء', 'Since purchase')} <span className={cx('num font-semibold', draft.value >= draft.invested ? 'text-gain' : 'text-loss')}>{pct((draft.value / draft.invested - 1) * 100, 1, true)}</span></span>}
                    {unitCost > 0 && <span>{L('منذ الشراء', 'Since purchase')} <span className={cx('num font-semibold', nowPrice >= unitCost ? 'text-gain' : 'text-loss')}>{pct((nowPrice / unitCost - 1) * 100, 1, true)}</span></span>}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L('القيمة الحالية', 'Current value')}>
                  <NumberInput value={draft.value} onChange={(value) => set({ value })} suffix={draft.currency} />
                </Field>
                <Field label={L('المبلغ المستثمَر', 'Amount invested')} hint={L('اتركه فارغًا إن كان يساوي القيمة', 'Leave empty if equal to the value')}>
                  <NumberInput value={draft.invested} onChange={(invested) => set({ invested })} suffix={draft.currency} />
                </Field>
              </div>
              <Field group label={L('العملة', 'Currency')}>
                <Chips wrap value={draft.currency} onChange={(currency) => set({ currency })} options={[{ value: 'SAR', label: L('ريال', 'SAR') }, { value: 'USD', label: L('دولار', 'USD') }]} />
              </Field>
            </>
          )}

          {(draft.assetClass === 'CASH' || draft.isEmergencyFund) && (
            <Field group label={L('كيف يُحتسب؟', 'How is it counted?')} hint={L('صندوق الطوارئ يُستثنى من تحليل الاستثمار ومن الهدف.', 'The emergency fund is left out of the investment analysis and the goal.')}>
              <Chips wrap value={draft.isEmergencyFund ? 'ef' : 'invest'} onChange={(v) => set({ isEmergencyFund: v === 'ef' })} options={[{ value: 'invest', label: L('استثماري', 'Investment') }, { value: 'ef', label: L('صندوق الطوارئ', 'Emergency fund') }]} />
            </Field>
          )}

          <Field group label={L('أين تحتفظ به؟', 'Where is it held?')}>
            <div className="space-y-2">
              {data.accounts.length > 0 && (
                <Chips wrap value={draft.newAccount ? '__new' : draft.accountId} onChange={(v) => (v === '__new' ? set({ newAccount: L(KIND_LABEL[draft.kind.accountKind].ar, KIND_LABEL[draft.kind.accountKind].en) }) : set({ accountId: v, newAccount: '' }))}
                  options={[...data.accounts.map((a) => ({ value: a.id, label: a.name })), { value: '__new', label: L('+ جهة جديدة', '+ New') }]} />
              )}
              {(draft.newAccount || data.accounts.length === 0) && (
                <input className="input" value={draft.newAccount} onChange={(e) => set({ newAccount: e.target.value })} placeholder={L('اسم المنصة أو البنك', 'Platform or bank name')} />
              )}
            </div>
          </Field>

          <div className="rounded-2xl border border-line">
            <button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-2 text-start" aria-expanded={showZakat} onClick={() => setShowZakat((v) => !v)}>
              <span><span className="block text-xs text-ink-soft">{L('الزكاة', 'Zakat')}</span><span className="text-sm font-semibold">{L(ZAKAT_LABEL[zakatShown.zakatMode].ar, ZAKAT_LABEL[zakatShown.zakatMode].en)}{zakatShown.zakatMode === 'PERCENT' ? ` (${zakatShown.zakatPercent}%)` : ''}</span></span>
              <span className="text-sm font-semibold text-link">{showZakat ? L('إخفاء', 'Hide') : L('تغيير', 'Change')}</span>
            </button>
            {showZakat && (
              <div className="border-t border-line p-4">
                <ZakatControl value={zakatShown} onChange={(patch) => set({ zakat: { ...zakatShown, ...patch }, zakatTouched: true })}
                  assetValue={(live ? qty * (nowPrice || unitCost) : draft.value) * fxRate(draft.currency, settings.fx)} quantity={qty} currency={draft.currency} live={live} />
              </div>
            )}
          </div>

          <button className="text-sm font-medium text-link" onClick={() => setShowClass((v) => !v)} aria-expanded={showClass}>
            {showClass ? L('إخفاء التصنيف', 'Hide classification') : L('تعديل التصنيف (الفئة، الجغرافيا، القطاع)', 'Edit classification (class, region, sector)')}
          </button>
          {showClass && <ClassFields value={draft} onChange={set} />}
        </div>
      )}
    </Sheet>
  )
}

/** Shared by the wizard and the edit form: how the asset is counted on each analysis axis. */
export function ClassFields({ value, onChange }: { value: { assetClass: AssetClass; region: Region; sector: string; isFund: boolean }; onChange: (p: { assetClass?: AssetClass; region?: Region; sector?: string; isFund?: boolean }) => void }) {
  const { L } = useStore()
  return (
    <div className={cx('space-y-3 rounded-2xl bg-surface p-4')}>
      <Field label={L('فئة الأصل', 'Asset class')}>
        <select className="input" value={value.assetClass} onChange={(e) => onChange({ assetClass: e.target.value as AssetClass })}>
          {ASSET_CLASSES.map((c) => <option key={c} value={c}>{L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en)}</option>)}
        </select>
      </Field>
      <Field label={L('الجغرافيا', 'Geography')} hint={L('«عالمي» يُفكَّك تقريبيًا إلى أمريكا ومتقدمة وناشئة في التحليل.', '“Global” is split approximately into US, developed and emerging in the analysis.')}>
        <select className="input" value={value.region} onChange={(e) => onChange({ region: e.target.value as Region })}>
          {(Object.keys(REGION_LABEL) as Region[]).map((r) => <option key={r} value={r}>{L(REGION_LABEL[r].ar, REGION_LABEL[r].en)}</option>)}
        </select>
      </Field>
      <Field label={L('القطاع', 'Sector')}>
        <select className="input" value={value.sector} onChange={(e) => onChange({ sector: e.target.value })}>
          {Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{L(v.ar, v.en)}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5 rounded border-line text-link focus:ring-accent" checked={value.isFund} onChange={(e) => onChange({ isFund: e.target.checked })} />
        <span className="text-sm">{L('صندوق متنوع (لا يُعد تركّزًا في أصل واحد)', 'Diversified fund (not counted as single-asset concentration)')}</span>
      </label>
    </div>
  )
}
