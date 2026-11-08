// New asset in two steps: what kind of asset it is, then its amount, account and layer.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { rateOf } from '../lib/calc'
import { num2, sar } from '../lib/format'
import { guessSleeve, quoteSymbol, useMarketInputs, type SymbolResult } from '../lib/market'
import { usePlan } from '../lib/usePlan'
import { CATALOG, ZAKAT_METHOD_LABEL, findInstrument, type CatalogItem, type ZakatMethod } from '../lib/catalog'
import { customInstruments } from '../lib/lookthrough'
import { zakatRuleOf } from '../lib/calc'
import { DEFAULT_UPDATE_DAYS } from '../lib/staleness'
import { UpdateModeField } from './UpdateModeField'
import { zakatMethodText } from './ZakatMethodSheet'
import { guessRegion } from '../lib/wealth'
import { haptic, layerColor } from '../lib/ui'
import type { Account, Holding } from '../lib/types'
import { NumberField, Segmented, SelectField, Sheet, TextField } from './ui'
import { SymbolSearch } from './SymbolSearch'
import { Chev } from './kit'
import { IconBuilding, IconCash, IconChart, IconChevron, IconLayers, IconSearch } from './icons'
import { recordTransfer } from '../pages/Holdings'
import './AddAsset.css'

type Kind = 'market' | 'fund' | 'cash' | 'other'
type Mode = 'units' | 'total'

/** Saudi funds the owner already follows, priced each morning from their Mubasher page. */
const KNOWN_FUNDS = [
  { id: '5885', name: 'صندوق الراجحي للتوزيعات الشهرية' },
  { id: '6046', name: 'صندوق الراجحي للتوزيعات الشهرية 2' },
]

const TYPES: Array<{ k: Kind; title: string; text: string; icon: ReactNode; tone: string }> = [
  { k: 'market', title: 'سهم أو صندوق متداول', text: 'يتحدث سعره تلقائياً من السوق', icon: <IconChart />, tone: 'var(--growth)' },
  { k: 'fund', title: 'صندوق استثماري سعودي', text: 'مثل صناديق الراجحي، ويتحدث من مباشر', icon: <IconBuilding />, tone: 'var(--income)' },
  { k: 'cash', title: 'نقد أو مرابحة أو وديعة', text: 'تُدخل رصيده وتحدّثه بنفسك', icon: <IconCash />, tone: 'var(--safety)' },
  { k: 'other', title: 'أصل آخر', text: 'تُدخل قيمته بنفسك', icon: <IconLayers />, tone: 'var(--hedge)' },
]
const toneStyle = (tone: string): CSSProperties => ({ background: `color-mix(in srgb, ${tone} 15%, transparent)`, color: tone })
const curLabel = (c: string) => (c === 'SAR' ? 'ريال' : c)

interface Draft {
  name: string
  symbol: string
  source: Holding['price_source']
  currency: string
  price: number
  quote: 'none' | 'loading' | 'ok' | 'failed'
  mode: Mode
  units: number | null
  total: number | null
  account: string
  newAccount: string
  sleeve: string | null
  goal: string
  bucket: string | null
  cost: number | null
  freq: Holding['payout_freq']
  /** manual holdings: days between updates */
  every: number | null
  /** trailing distribution yield %, when the market data has one */
  rate: number | null
  catalog: string | null
  fee: number | null
  zakat: ZakatMethod | null
  zakatRatio: number | null
}

export function AddAssetSheet({ onClose }: { onClose: () => void }) {
  const { accounts, sleeves, goals, holdings, fx, upsert, insertMany, notify, refreshMarket } = useStore()
  // the sheet re-runs its focus handling when onClose changes, so hand it a stable one
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const close = useCallback(() => closeRef.current(), [])
  const box = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<1 | 2>(1)
  const [kind, setKind] = useState<Kind | null>(null)
  const [otherFund, setOtherFund] = useState(false)
  const [fundNo, setFundNo] = useState('')
  const [busy, setBusy] = useState(false)
  const firstAccount = accounts.find((a) => !a.is_ibkr && !a.exclude_from_portfolio)?.id ?? accounts[0]?.id ?? '__new'
  const [d, setD] = useState<Draft>(() => ({
    name: '', symbol: '', source: 'manual', currency: 'SAR', price: 0, quote: 'none', mode: 'total', units: null, total: null,
    account: firstAccount, newAccount: '', sleeve: null, goal: '', bucket: null, cost: null, freq: 'none',
    every: DEFAULT_UPDATE_DAYS, rate: null, catalog: null, fee: null, zakat: null, zakatRatio: null,
  }))
  const plan = usePlan()
  const market = useMarketInputs()
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))

  // every step starts at the top; the market search takes the keyboard straight away
  useEffect(() => {
    box.current?.closest('.sheet')?.scrollTo({ top: 0 })
    if (step === 1 && kind === 'market') requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>('input')?.focus())
  }, [step, kind])

  const safetySleeve = sleeves.find((s) => s.layer === 'safety')?.id ?? null
  const payoutSleeve = sleeves.find((s) => /توزيع/.test(s.name))?.id ?? sleeves.find((s) => s.layer === 'income')?.id ?? null
  const fresh = { symbol: '', currency: 'SAR', price: 0, quote: 'none' as const, units: null, total: null, freq: 'none' as const, rate: null, catalog: null, fee: null, zakat: null, zakatRatio: null }

  // instruments the plan recommends for this kind of asset, preferred first (each with the plan sleeve it serves)
  const suggestions = (() => {
    if (kind !== 'market' && kind !== 'fund') return []
    const doc = plan.doc
    const custom = customInstruments(doc)
    const want = (it: CatalogItem) => (kind === 'market' ? it.source === 'yahoo' && !!it.symbol : it.source === 'nav' && !!it.fund_id)
    const held = new Set(holdings.filter((h) => !h.archived && Number(h.quantity) > 0).map((h) => h.catalog_id ?? h.symbol ?? ''))
    const out: Array<{ it: CatalogItem; sleeve: string | null; sleeveName: string | null }> = []
    const seen = new Set<string>()
    for (const ps of doc?.sleeves ?? []) {
      for (const id of (ps.instruments ?? []).slice(0, 2)) {
        const it = findInstrument(id, custom)
        if (!it || !want(it) || seen.has(it.id)) continue
        seen.add(it.id)
        out.push({ it, sleeve: plan.ctx?.map[ps.key] ?? null, sleeveName: ps.name })
      }
    }
    if (!out.length) for (const it of CATALOG.filter(want).sort((a, b) => (a.ter ?? 9) - (b.ter ?? 9)).slice(0, 5)) out.push({ it, sleeve: null, sleeveName: null })
    return out.filter((x) => !held.has(x.it.id) && !held.has(x.it.symbol ?? x.it.fund_id ?? '')).slice(0, 4)
  })()
  const pickCatalog = async (it: CatalogItem, sleeve: string | null) => {
    haptic()
    const sym = it.source === 'nav' ? it.fund_id ?? '' : it.symbol ?? ''
    const q = market.quotes[sym] ?? market.quotes[sym.toUpperCase()]
    const sl = sleeve ?? guessSleeve({ symbol: sym, name: it.name_en ?? it.name, exchange: it.exchange ?? '', type: 'ETF' }, sleeves)
    const freq = it.distribution === 'dist' && it.pay_freq && it.pay_freq !== 'none' ? it.pay_freq : 'none'
    patch({ ...fresh, name: it.name, symbol: sym, source: it.source === 'manual' ? 'manual' : it.source, currency: it.currency || 'SAR', mode: 'units', sleeve: sl,
      catalog: it.id, fee: it.ter, freq, rate: freq !== 'none' ? market.yields[sym] ?? market.yields[sym.toUpperCase()] ?? null : null, price: q?.price ?? 0, quote: it.source === 'yahoo' ? 'loading' : 'none' })
    setStep(2)
    if (it.source === 'yahoo' && it.symbol) {
      const r = await quoteSymbol(it.symbol)
      setD((x) => (x.symbol !== sym ? x : r && r.price > 0 ? { ...x, price: r.price, currency: r.currency || x.currency, quote: 'ok' } : { ...x, quote: x.price > 0 ? 'ok' : 'failed' }))
    }
  }

  const choose = (k: Kind) => {
    haptic()
    setKind(k)
    if (k === 'cash') { patch({ ...fresh, name: '', source: 'manual', mode: 'total', sleeve: safetySleeve, every: DEFAULT_UPDATE_DAYS }); setStep(2) }
    if (k === 'other') { patch({ ...fresh, name: '', source: 'manual', mode: 'total', sleeve: null, every: DEFAULT_UPDATE_DAYS }); setStep(2) }
  }
  const pickMarket = async (r: SymbolResult) => {
    patch({ ...fresh, name: r.name, symbol: r.symbol, source: 'yahoo', quote: 'loading', mode: 'units', sleeve: guessSleeve(r, sleeves) })
    setStep(2)
    const q = await quoteSymbol(r.symbol)
    setD((x) => (x.symbol !== r.symbol ? x : q && q.price > 0 ? { ...x, price: q.price, currency: q.currency || x.currency, quote: 'ok' } : { ...x, quote: 'failed' }))
  }
  const pickFund = (id: string, name: string) => {
    haptic()
    const known = KNOWN_FUNDS.find((f) => f.id === id)
    // the same fund already in the portfolio gives today's unit price
    const same = holdings.find((h) => !h.archived && Number(h.price) > 0 && Number(h.quantity) !== 1 &&
      ((h.price_source === 'nav' && h.symbol === id) || (!!known && h.name.trim() === known.name)))
    patch({ ...fresh, name: name || known?.name || '', symbol: id, source: 'nav', price: same ? Number(same.price) : 0, mode: 'units',
      sleeve: known ? payoutSleeve : null, freq: known ? 'monthly' : 'none' })
    setStep(2)
  }
  const back = () => {
    haptic()
    if (step === 2) { setStep(1); if (kind === 'cash' || kind === 'other') setKind(null) }
    else { setKind(null); setOtherFund(false) }
  }

  // ---------- amounts ----------
  const priced = d.source !== 'manual' // value = units × a market or fund price
  const needPrice = d.source === 'nav' || (d.source === 'yahoo' && d.quote === 'failed') || (d.source === 'manual' && d.mode === 'units')
  const qty = d.mode === 'units' ? d.units ?? 0 : priced ? (d.price > 0 ? (d.total ?? 0) / d.price : 0) : 1
  const unitPrice = d.mode === 'total' && !priced ? d.total ?? 0 : d.price
  const value = qty * unitPrice * rateOf(d.currency, fx)
  const cur = curLabel(d.currency)
  const liveGoals = goals.filter((g) => !g.archived)
  const goal = liveGoals.find((g) => g.id === d.goal)

  const save = async () => {
    const name = d.name.trim()
    if (!name) { notify('اكتب اسم الأصل'); return }
    // units without a price would start at zero and the first price would then look like profit
    const amountGiven = d.mode === 'units' ? (d.units ?? 0) > 0 : priced && (d.total ?? 0) > 0
    if (amountGiven && !(d.price > 0)) { notify(d.quote === 'loading' ? 'لحظة، نجلب السعر' : 'أدخل سعر الوحدة'); return }
    if (d.account === '__new' && !d.newAccount.trim()) { notify('اكتب اسم الحساب الجديد'); return }
    setBusy(true)
    let accountId: string | null = d.account || null
    if (d.account === '__new') {
      const acc = await upsert<Partial<Account>>('accounts', { name: d.newAccount.trim(), kind: 'broker', is_ibkr: false, exclude_from_portfolio: false, country: 'SA', note: null, sort: accounts.length + 1 })
      if (!acc?.id) { setBusy(false); return }
      accountId = acc.id
    }
    const symbol = d.symbol.trim() || null
    const saved = await upsert<Partial<Holding>>('holdings', {
      name, account_id: accountId, sleeve_id: goal ? null : d.sleeve, symbol, price_source: d.source, currency: d.currency,
      quantity: qty, price: unitPrice, price_updated_at: d.source === 'yahoo' && d.quote !== 'ok' ? null : new Date().toISOString(), ibkr_conid: null,
      cost_basis: d.cost != null && d.cost > 0 ? d.cost : null, fee_pct: d.fee ?? null, purification_pct: null,
      catalog_id: d.catalog, update_every_days: d.source === 'manual' ? d.every ?? DEFAULT_UPDATE_DAYS : null,
      zakat_method: d.zakat, zakat_ratio: d.zakat === 'zakatable_assets' ? d.zakatRatio : null,
      region: guessRegion({ symbol, name, currency: d.currency }), note: null, archived: false, zakatable: d.zakat !== 'exempt', zakat_start: null,
      payout_freq: d.freq, payout_next: null, payout_basis: 'rate', payout_rate: d.freq !== 'none' ? d.rate : null, payout_per_unit: null, payout_nominal: null, maturity_date: null,
      goal_id: goal?.id ?? null, goal_bucket: goal ? d.bucket ?? goal.allocation?.[0]?.key ?? null : null, sort: holdings.length + 1,
    })
    if (!saved?.id) { setBusy(false); return }
    await recordTransfer({ fx, accounts, insertMany }, saved as Holding, 1)
    notify('أُضيف الأصل')
    close()
    location.hash = `/asset/${saved.id}`
    // a currency the app has no rate for yet: fetch it now rather than at the next daily run
    if (!(d.currency in fx)) refreshMarket('prices')
  }

  // the zakat method the app would apply (instrument, sleeve class or guide), and the owner's choice
  const zprobe = { catalog_id: d.catalog, symbol: d.symbol || null, sleeve_id: goal ? null : d.sleeve, profile: null, zakatable: true } as unknown as Holding
  const zbase = zakatRuleOf({ ...zprobe, zakat_method: null }, plan.ctx?.zakat ?? {})
  const zakatSum0 = zakatMethodText(zbase.method, zbase.ratio)
  const zakatSum = d.zakat ? zakatMethodText(d.zakat, d.zakat === 'zakatable_assets' ? d.zakatRatio : null) : zakatSum0
  const type = TYPES.find((t) => t.k === kind)
  return (
    <Sheet title={step === 2 ? 'التفاصيل' : 'ما نوع الأصل؟'} onClose={close}
      footer={step === 2 ? <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'أضف الأصل'}</button> : undefined}>
      <div className="aa" ref={box}>
        {type && (
          <button type="button" className="aa-back" onClick={back} aria-label={`رجوع: ${type.title}`}>
            <IconChevron className="aa-back-arrow" />
            <span className="aa-back-ico" style={toneStyle(type.tone)}>{type.icon}</span>
            {type.title}
          </button>
        )}

        {step === 1 && !kind && (
          <div className="aa-list">
            {TYPES.map((t) => (
              <button key={t.k} type="button" className="type-tile" onClick={() => choose(t.k)}>
                <span className="ico" style={toneStyle(t.tone)}>{t.icon}</span>
                <span className="tt-text"><b>{t.title}</b><span>{t.text}</span></span>
                <Chev />
              </button>
            ))}
          </div>
        )}

        {step === 1 && (kind === 'market' || kind === 'fund') && suggestions.length > 0 && (
          <div className="aa-sugg">
            <span className="aa-sugg-h">{plan.doc ? 'مقترحة في خطتك' : 'أدوات شائعة'}</span>
            {suggestions.map(({ it, sleeve, sleeveName }) => (
              <button key={it.id} type="button" className="type-tile aa-sugg-row" onClick={() => pickCatalog(it, sleeve)}>
                <span className="ico" style={toneStyle(layerColor(it.layer))}>{kind === 'fund' ? <IconBuilding /> : <IconChart />}</span>
                <span className="tt-text"><b>{it.name}</b><span>
                  <span className="ltr">{it.symbol ?? it.fund_id}</span>
                  {sleeveName ? ` · ${sleeveName}` : ''}{it.ter != null ? <> · رسوم <bdi dir="ltr">{it.ter}%</bdi></> : null}
                </span></span>
                <Chev />
              </button>
            ))}
          </div>
        )}

        {step === 1 && kind === 'market' && <SymbolSearch onPick={pickMarket} label="أو ابحث عن السهم أو الصندوق" />}

        {step === 1 && kind === 'fund' && (
          <div className="aa-list">
            {KNOWN_FUNDS.map((f) => (
              <button key={f.id} type="button" className="type-tile" onClick={() => pickFund(f.id, f.name)}>
                <span className="ico" style={toneStyle('var(--income)')}><IconBuilding /></span>
                <span className="tt-text"><b>{f.name}</b><span>رقمه في مباشر {f.id} · يوزّع شهرياً</span></span>
                <Chev />
              </button>
            ))}
            <button type="button" className="type-tile" aria-expanded={otherFund} onClick={() => setOtherFund((v) => !v)}>
              <span className="ico" style={toneStyle('var(--muted)')}><IconSearch /></span>
              <span className="tt-text"><b>صندوق آخر</b><span>برقمه في موقع مباشر</span></span>
            </button>
            {otherFund && (
              <div className="aa-other">
                <TextField label="رقم الصندوق في مباشر" value={fundNo} onChange={(v) => setFundNo(v.replace(/[^0-9]/g, ''))} ltr placeholder="مثال: 5885"
                  hint="تجده في رابط صفحة الصندوق على mubasher.info" />
                <button type="button" className="btn primary" disabled={!fundNo} onClick={() => pickFund(fundNo, '')}>متابعة</button>
              </div>
            )}
          </div>
        )}

        {step === 2 && <>
          {priced && (
            <div className="aa-picked">
              <span className="ltr aa-sym">{d.symbol}</span>
              <span className="grow">
                {d.source === 'nav' ? 'يتحدث سعره كل صباح من مباشر'
                  : d.quote === 'loading' ? 'نجلب السعر…'
                  : d.quote === 'ok' ? <>آخر سعر <b className="ltr">{num2(d.price)} {cur}</b></>
                  : 'تعذّر جلب السعر؛ أدخله بنفسك'}
              </span>
            </div>
          )}
          <TextField label="الاسم" value={d.name} onChange={(v) => patch({ name: v })}
            placeholder={kind === 'cash' ? 'مثال: صندوق مرابحة الراجحي' : kind === 'fund' ? 'اسم الصندوق' : 'مثال: صكوك صح'} />
          {kind !== 'cash' && (
            <div className="aa-seg">
              <Segmented label="طريقة إدخال المبلغ" value={d.mode} onChange={(v) => patch({ mode: v })}
                options={[{ value: 'units', label: 'عدد الوحدات' }, { value: 'total', label: 'القيمة الإجمالية' }]} />
            </div>
          )}
          {d.mode === 'units' ? (
            needPrice ? (
              <div className="grid2">
                <NumberField label="عدد الوحدات" value={d.units} decimals={4} onChange={(v) => patch({ units: v })} />
                <NumberField label="سعر الوحدة" value={d.price || null} decimals={4} suffix={cur} onChange={(v) => patch({ price: v })}
                  hint={d.source === 'nav' && !d.price ? 'من تطبيق الصندوق، ثم يتحدث آلياً' : undefined} />
              </div>
            ) : <NumberField label="عدد الوحدات" value={d.units} decimals={4} onChange={(v) => patch({ units: v })} />
          ) : priced && needPrice ? (
            <div className="grid2">
              <NumberField label="القيمة الإجمالية" value={d.total} decimals={2} suffix={cur} onChange={(v) => patch({ total: v })} />
              <NumberField label="سعر الوحدة" value={d.price || null} decimals={4} suffix={cur} onChange={(v) => patch({ price: v })}
                hint={d.source === 'nav' && !d.price ? 'من تطبيق الصندوق، ثم يتحدث آلياً' : undefined} />
            </div>
          ) : (
            <NumberField label={kind === 'cash' ? 'الرصيد الحالي' : 'القيمة الإجمالية'} value={d.total} decimals={2} suffix={cur} onChange={(v) => patch({ total: v })}
              hint={priced && d.price > 0 && (d.total ?? 0) > 0 ? `نحو ${num2(qty)} وحدة بسعر اليوم` : undefined} />
          )}

          <SelectField label="الحساب" value={d.account} onChange={(v) => patch({ account: v })}
            options={[...accounts.map((a) => ({ value: a.id, label: a.name })), { value: '__new', label: 'حساب جديد…' }]} />
          {d.account === '__new' && (
            <TextField label="اسم الحساب الجديد" value={d.newAccount} onChange={(v) => patch({ newAccount: v })} placeholder="مثال: الإنماء للاستثمار" />
          )}
          {liveGoals.length > 0 && (
            <SelectField label="يتبع" value={d.goal} onChange={(v) => patch({ goal: v, bucket: goals.find((g) => g.id === v)?.allocation?.[0]?.key ?? null })}
              options={[{ value: '', label: 'المحفظة الرئيسية' }, ...liveGoals.map((g) => ({ value: g.id, label: `هدف: ${g.name}` }))]} />
          )}
          {goal ? (goal.allocation?.length ?? 0) > 1 && (
            <div className="field">
              <span>الجزء</span>
              <div className="choice-chips">
                {goal.allocation.map((b) => (
                  <button key={b.key} type="button" aria-pressed={(d.bucket ?? goal.allocation[0].key) === b.key} onClick={() => patch({ bucket: b.key })}>{b.name}</button>
                ))}
              </div>
            </div>
          ) : sleeves.length > 0 && (
            <div className="field">
              <span>الطبقة</span>
              <div className="choice-chips">
                {sleeves.map((s) => (
                  <button key={s.id} type="button" aria-pressed={d.sleeve === s.id} onClick={() => { haptic(); patch({ sleeve: d.sleeve === s.id ? null : s.id }) }}>
                    <i className="dot" style={{ background: layerColor(s.layer), width: 8, height: 8 }} />{s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <UpdateModeField value={{ price_source: d.source, symbol: d.symbol || null, update_every_days: d.source === 'manual' ? d.every : null }}
            onChange={(p) => patch({ ...(p.price_source ? { source: p.price_source } : {}), ...(p.update_every_days !== undefined && p.update_every_days != null ? { every: p.update_every_days } : {}) })} />
          <NumberField label="كم دفعت فيه؟" value={d.cost} suffix="ريال" decimals={2} onChange={(v) => patch({ cost: v || null })} hint="اختياري، ليظهر ربحك أو خسارتك" />
          <details className="more">
            <summary>الزكاة<span className="sum-sub">{zakatSum}</span></summary>
            <div className="more-body">
              <SelectField label="طريقة الحساب" value={d.zakat ?? ''} onChange={(v) => patch({ zakat: (v || null) as ZakatMethod | null, zakatRatio: v === 'zakatable_assets' ? d.zakatRatio ?? 25 : null })}
                options={[{ value: '', label: `الافتراضي: ${zakatSum0}` }, ...(Object.keys(ZAKAT_METHOD_LABEL) as ZakatMethod[]).map((m) => ({ value: m, label: ZAKAT_METHOD_LABEL[m] }))]} />
              {d.zakat === 'zakatable_assets' && (
                <NumberField label="الجزء الزكوي من القيمة" value={d.zakatRatio} suffix="%" decimals={1} min={0} max={100} onChange={(v) => patch({ zakatRatio: v })} />
              )}
              <small className="muted">الإرشاد والمصادر في صفحة الأصل بعد إضافته.</small>
            </div>
          </details>
          <div className="aa-value" aria-live="polite"><span>القيمة</span><b className="figure">{sar(value)}</b></div>
        </>}
      </div>
    </Sheet>
  )
}
