import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { LAYER_NAMES, LAYER_ORDER, ZAKAT_RATE, holdingValue, rateOf } from '../lib/calc'
import { ago, dateLong, num2, pct, relativeDays, sar, signedPct, todayISO } from '../lib/format'
import { FREQ_LABEL, PER_YEAR, hijriLabel, nextHaul, payoutPerPayment } from '../lib/income'
import type { Holding, Region } from '../lib/types'
import { REGION_LABEL, guessRegion } from '../lib/wealth'
import { NumberField, Segmented, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus, IconRefresh } from '../components/icons'
import { SymbolSearch } from '../components/SymbolSearch'
import { guessSleeve, quoteSymbol, type SymbolResult } from '../lib/market'

const CURRENCIES = ['SAR', 'USD', 'GBP', 'EUR', 'AED', 'HKD', 'SGD', 'JPY']
const SOURCE_LABEL = { manual: 'يدوي', yahoo: 'آلي من السوق', ibkr: 'من IBKR', nav: 'آلي من تقرير الصندوق' } as const

export default function Holdings() {
  const { holdings, sleeves, accounts, fx, refreshMarket, refreshing, notify, readOnly, upsert, goals } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const [editing, setEditing] = useState<Partial<Holding> | null>(null)
  if (!d) return null
  const total = d.totals.total || 1
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'بلا حساب'
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const visible = holdings.filter((h) => !h.archived)
  const inPortfolio = visible.filter((h) => !h.goal_id && (!h.account_id || !excluded.has(h.account_id)))
  const outside = visible.filter((h) => !h.goal_id && h.account_id && excluded.has(h.account_id))
  const goalGroups = goals.filter((g) => !g.archived).map((g) => ({ g, items: visible.filter((h) => h.goal_id === g.id) })).filter((x) => x.items.length)
  const unassigned = inPortfolio.filter((h) => !h.sleeve_id || !sleeves.some((s) => s.id === h.sleeve_id))
  const noHaul = visible.filter((h) => h.zakatable !== false && !h.zakat_start && holdingValue(h, fx) > 0)

  const row = (h: Holding) => {
    const v = holdingValue(h, fx)
    const stale = (h.price_source === 'manual' || h.price_source === 'nav') && Number(h.quantity) > 0 && (!h.price_updated_at || Date.now() - new Date(h.price_updated_at).getTime() > 35 * 86400000)
    return (
      <button key={h.id} className="list-item" onClick={() => !readOnly && setEditing(h)} style={readOnly ? { cursor: 'default' } : undefined}>
        <div className="grow">
          <div>{h.name}</div>
          <div className="meta">
            {accountName(h.account_id)}، {SOURCE_LABEL[h.price_source]}
            {h.price_source !== 'manual' || Number(h.quantity) !== 1 ? <>، {num2(Number(h.quantity))} وحدة بسعر <span className="ltr">{num2(Number(h.price))} {h.currency}</span></> : null}
            {' '}<span className={stale ? 'stale' : ''}>({ago(h.price_updated_at)})</span>
            {h.zakatable === false && <span className="chip" style={{ marginInlineStart: 6, padding: '1px 8px', fontSize: 11.5 }}>بلا زكاة</span>}
          </div>
        </div>
        <div className="amount">{Number(h.quantity) === 0 ? <span className="chip">لم يُشترَ بعد</span> : sar(v)}</div>
      </button>
    )
  }

  return (
    <>
      <div className="row wrap" style={{ gap: 10, marginBottom: 14 }}>
        <p className="grow muted">إجمالي المحفظة <b className="figure" style={{ color: 'var(--ink)' }}>{sar(d.totals.total)}</b></p>
        {!readOnly && <>
          <button className="btn ghost small" disabled={refreshing} onClick={async () => notify((await refreshMarket('prices')).message)}>
            <IconRefresh className={refreshing ? 'spin' : ''} /> حدّث الأسعار
          </button>
          <button className="btn primary small" onClick={() => setEditing({ name: '', price_source: 'manual', currency: 'SAR', quantity: 0, price: 0, zakatable: true, account_id: accounts[0]?.id ?? null, sleeve_id: sleeves[0]?.id ?? null })}>
            <IconPlus /> أصل جديد
          </button>
        </>}
      </div>

      {LAYER_ORDER.map((layer) => {
        const layerSleeves = sleeves.filter((s) => s.layer === layer)
        if (!layerSleeves.length) return null
        return (
          <section className="section" key={layer} style={{ marginTop: 22 }}>
            <div className="section-head"><h2>{LAYER_NAMES[layer]}</h2><p>{pct((d.totals.byLayer[layer] / total) * 100)} من المحفظة</p></div>
            <div className="panel flush">
              {layerSleeves.map((s) => {
                const items = inPortfolio.filter((h) => h.sleeve_id === s.id)
                return (
                  <div key={s.id}>
                    <div className="group-head">
                      <span className="dot" style={{ background: colors[s.id]?.color, opacity: colors[s.id]?.opacity }} />
                      <h3>{s.name}</h3>
                      <span className="figure">{sar(d.totals.bySleeve[s.id] ?? 0)}</span>
                    </div>
                    {items.length ? items.map(row) : readOnly ? (
                      <div className="list-item" style={{ cursor: 'default' }}><span className="muted small">لا أصول هنا بعد</span></div>
                    ) : (
                      <button className="list-item" onClick={() => setEditing({ name: '', price_source: 'manual', currency: 'SAR', quantity: 0, price: 0, zakatable: true, sleeve_id: s.id, account_id: accounts[0]?.id ?? null })}>
                        <span className="muted small">لا أصول هنا بعد. أضف أصلاً</span>
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {unassigned.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>بلا طبقة</h2><p>حدّد طبقة كل أصل ليُحسب في التوزيع</p></div>
          <div className="panel flush">{unassigned.map(row)}</div>
        </section>
      )}
      {goalGroups.map(({ g, items }) => (
        <section className="section" key={g.id}>
          <div className="section-head"><h2>هدف: {g.name}</h2><p><a href="#/goals">{sar(d.totals.goals[g.id] ?? 0)} من {sar(Number(g.target_amount))}</a></p></div>
          <div className="panel flush">{items.map(row)}</div>
        </section>
      ))}
      {outside.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>خارج المحفظة</h2><p>لا يدخل في الأوزان ولا في الهدف</p></div>
          <div className="panel flush">{outside.map(row)}</div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>الزكاة التقديرية</h2><p>{pct(ZAKAT_RATE)} من الأصول التي عليها زكاة</p></div>
        <div className="panel stack">
          <div className="zakat-head">
            <span className="v">{sar(d.zakat.amount)}</span>
            <span className="small muted">على {sar(d.zakat.base)}{d.zakat.exempt > 0 ? `، ومستثنى ${sar(d.zakat.exempt)}` : ''}</span>
          </div>
          <p className="small muted">كل الأصول عليها زكاة افتراضياً، والأسهم السعودية تحدّد أنت حكمها. لكل أصل حوله الخاص يبدأ من التاريخ الذي تحدّده له، ويتكرر بالتقويم الهجري.</p>
          {d.zakatDue.length > 0 && (
            <div className="panel flush">
              {d.zakatDue.map((z) => (
                <button key={z.holding.id + z.date} className="list-item" onClick={() => !readOnly && setEditing(z.holding)} style={readOnly ? { cursor: 'default' } : undefined}>
                  <div className="grow"><div>{z.holding.name}</div><div className="meta">{hijriLabel(z.date)}، {dateLong(z.date)} ({relativeDays(z.date)})</div></div>
                  <div className="amount">{sar(z.amount)}</div>
                </button>
              ))}
            </div>
          )}
          {noHaul.length > 0 && (
            <p className="small warn">{noHaul.length === 1 ? `«${noHaul[0].name}» لم تُحدَّد بداية حوله.` : `${noHaul.length} أصول لم تُحدَّد بداية حولها: ${noHaul.slice(0, 3).map((h) => h.name).join('، ')}${noHaul.length > 3 ? '…' : ''}.`} {readOnly ? '' : 'افتح الأصل وحدّدها ليظهر موعد زكاته وتصلك تنبيهاته.'}</p>
          )}
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{readOnly ? 'الأصول وحكم زكاتها' : 'حدّد الأصول التي عليها زكاة'}</summary>
            <div className="stack" style={{ marginTop: 10, gap: 0 }}>
              {visible.filter((h) => holdingValue(h, fx) > 0).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx)).map((h) => (
                <div key={h.id} style={{ borderBottom: '1px solid var(--line)' }}>
                  <Switch label={h.name} hint={`${sar(holdingValue(h, fx))}${h.zakatable !== false ? `، زكاته ${sar((holdingValue(h, fx) * ZAKAT_RATE) / 100)}` : ''}`}
                    checked={h.zakatable !== false} onChange={(v) => { if (!readOnly) upsert('holdings', { id: h.id, zakatable: v }) }} />
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      {editing && <HoldingSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )

}

export function HoldingSheet({ initial, onClose }: { initial: Partial<Holding>; onClose: () => void }) {
  const { upsert, remove, fx, notify, accounts, sleeves, holdings, goals, refreshMarket, insertMany } = useStore()
  const [h, setH] = useState<Partial<Holding>>(initial)
  const [lumpSum, setLumpSum] = useState(initial.price_source === 'manual' && Number(initial.quantity) === 1 && Number(initial.price) > 50)
  const set = (patch: Partial<Holding>) => setH((x) => ({ ...x, ...patch }))
  const isIbkr = h.price_source === 'ibkr'
  const [showSearch, setShowSearch] = useState(!initial.id)
  const [quoting, setQuoting] = useState(false)
  const pick = async (r: SymbolResult) => {
    const keepName = !!h.name?.trim()
    set({ symbol: r.symbol, price_source: 'yahoo', ...(keepName ? {} : { name: r.name }), ...(h.sleeve_id || h.goal_id ? {} : { sleeve_id: guessSleeve(r, sleeves) }) })
    setLumpSum(false)
    setShowSearch(false)
    setQuoting(true)
    const q = await quoteSymbol(r.symbol)
    setQuoting(false)
    if (q) set({ price: q.price, currency: q.currency, price_updated_at: new Date().toISOString() })
    else notify('تعذّر جلب السعر الآن؛ يتحدث مع التحديث القادم')
  }
  const value = Number(h.quantity ?? 0) * Number(h.price ?? 0) * rateOf(h.currency, fx)
  /** adding an asset you already own (or deleting one) moves the portfolio value without a gain or loss */
  const recordTransfer = async (x: Holding, sign: 1 | -1) => {
    const v = holdingValue(x, fx)
    const outside = x.goal_id || (x.account_id && accounts.find((a) => a.id === x.account_id)?.exclude_from_portfolio)
    if (v < 1 || outside || x.price_source === 'ibkr') return
    await insertMany('transactions', [{ tx_date: todayISO(), kind: 'transfer', amount_sar: Math.round(sign * v * 100) / 100, holding_id: sign > 0 ? x.id : null, account_id: x.account_id,
      sleeve_id: x.sleeve_id, quantity: null, price: null, currency: 'SAR', source: 'manual', external_id: null, note: sign > 0 ? `إضافة أصل قائم: ${x.name}` : `حذف أصل: ${x.name}` }])
  }
  const saveIt = async () => {
    if (!h.name?.trim()) { notify('اكتب اسم الأصل'); return }
    const priceChanged = Number(h.price) !== Number(initial.price) || Number(h.quantity) !== Number(initial.quantity)
    const row: Partial<Holding> = {
      id: h.id, name: h.name.trim(), account_id: h.account_id ?? null, sleeve_id: h.sleeve_id ?? null, symbol: h.symbol?.trim() || null,
      price_source: h.price_source ?? 'manual', currency: h.currency ?? 'SAR', quantity: Number(h.quantity ?? 0), price: Number(h.price ?? 0),
      note: h.note ?? null, sort: h.sort ?? holdings.length + 1, zakatable: h.zakatable !== false, zakat_start: h.zakatable !== false ? h.zakat_start || null : null,
      payout_freq: h.payout_freq ?? 'none', payout_next: h.payout_next || null, payout_basis: h.payout_basis ?? 'rate',
      payout_rate: h.payout_rate ?? null, payout_per_unit: h.payout_per_unit ?? null, payout_nominal: h.payout_nominal || null, maturity_date: h.maturity_date || null,
      cost_basis: h.cost_basis != null && Number(h.cost_basis) > 0 ? Number(h.cost_basis) : null, fee_pct: h.fee_pct || null,
      purification_pct: h.purification_pct || null, region: h.region ?? null,
      goal_id: h.goal_id || null, goal_bucket: h.goal_id ? h.goal_bucket ?? null : null, ...(h.goal_id ? { sleeve_id: null } : {}),
      ...(priceChanged && (h.price_source === 'manual' || h.price_source === 'nav') ? { price_updated_at: new Date().toISOString() } : {}),
      ...(h.price_source === 'yahoo' && h.price_updated_at && h.price_updated_at !== initial.price_updated_at ? { price_updated_at: h.price_updated_at } : {}),
    }
    const ok = await upsert<Partial<Holding>>('holdings', row)
    if (ok && !h.id) await recordTransfer(ok as Holding, 1)
    if (ok) {
      notify('حُفظ الأصل')
      onClose()
      // a currency the app has no rate for yet: fetch it now rather than at the next daily run
      if (row.currency && !(row.currency in fx)) refreshMarket('prices')
    }
  }
  return (
    <Sheet title={h.id ? 'تعديل أصل' : 'أصل جديد'} onClose={onClose} footer={<>
      {h.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا الأصل نهائياً؟')) { await recordTransfer(initial as Holding, -1); await remove('holdings', h.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        {!isIbkr && (showSearch
          ? <SymbolSearch onPick={pick} hint="الأسهم والصناديق المتداولة في تداول والأسواق العالمية. صناديق الاستثمار غير المدرجة (مثل صناديق الراجحي) أضفها يدوياً." />
          : <button type="button" className="btn ghost small" style={{ alignSelf: 'flex-start' }} onClick={() => setShowSearch(true)}>{h.price_source === 'yahoo' ? 'غيّر الرمز من السوق' : 'اربطه بسعر السوق بالبحث'}</button>)}
        {quoting && <p className="small muted" role="status">نجلب السعر…</p>}
        {!quoting && h.price_source === 'yahoo' && h.symbol && Number(h.price) > 0 && (
          <div className="callout small">مرتبط بالرمز <b className="ltr">{h.symbol}</b> بسعر <b className="ltr">{num2(Number(h.price))} {h.currency}</b>، ويتحدث يومياً.</div>
        )}
        <TextField label="الاسم" value={h.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: صندوق البلاد للذهب" />
        {goals.some((g) => !g.archived) && (
          <SelectField label="يتبع محفظة" value={h.goal_id ?? ''} onChange={(v) => {
            const g = goals.find((x) => x.id === v)
            set({ goal_id: v || null, goal_bucket: g?.allocation?.[0]?.key ?? null })
          }} options={[{ value: '', label: 'الاستقلال المالي' }, ...goals.filter((g) => !g.archived || g.id === h.goal_id).map((g) => ({ value: g.id, label: `هدف: ${g.name}` }))]} />
        )}
        <div className="grid2">
          <SelectField label="الحساب" value={h.account_id ?? ''} onChange={(v) => set({ account_id: v || null })}
            options={[{ value: '', label: 'بلا حساب' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          {h.goal_id ? (
            <SelectField label="الجزء" value={h.goal_bucket ?? ''} onChange={(v) => set({ goal_bucket: v || null })}
              options={(goals.find((g) => g.id === h.goal_id)?.allocation ?? []).map((b) => ({ value: b.key, label: b.name }))} />
          ) : (
            <SelectField label="الطبقة" value={h.sleeve_id ?? ''} onChange={(v) => set({ sleeve_id: v || null })}
              options={[{ value: '', label: 'بلا طبقة' }, ...sleeves.map((s) => ({ value: s.id, label: s.name }))]} />
          )}
        </div>
        {!isIbkr && (
          <SelectField label="كيف يُحدَّث السعر؟" value={h.price_source ?? 'manual'} onChange={(v) => set({ price_source: v })}
            options={[{ value: 'manual', label: 'أُدخله بنفسي' }, { value: 'yahoo', label: 'آلياً من السوق برمز التداول' }, { value: 'nav', label: 'آلياً لصناديق الاستثمار السعودية' }]} />
        )}
        {h.price_source === 'nav' && <>
          <TextField label="رقم الصندوق في موقع مباشر" value={h.symbol ?? ''} onChange={(v) => set({ symbol: v.replace(/[^0-9]/g, '') })} ltr placeholder="5885"
            hint="صندوق الراجحي للتوزيعات الشهرية 5885، والصندوق 2 رقمه 6046. لغيرهما ابحث عن الصندوق في mubasher.info وخذ الرقم من رابط صفحته." />
          <p className="small muted">يُحدَّث السعر كل صباح عند نشره. إن تأخر النشر أدخل السعر من تطبيق الراجحي المالية، ولن يُستبدل بسعر أقدم منه.</p>
        </>}
        {isIbkr && <p className="small muted">يتحدث هذا الأصل تلقائياً من تقرير IBKR اليومي؛ يمكنك تغيير اسمه وطبقته فقط.</p>}
        {h.price_source === 'yahoo' && (
          <TextField label="رمز التداول" value={h.symbol ?? ''} onChange={(v) => set({ symbol: v.toUpperCase() })} ltr
            hint="يُملأ تلقائياً عند اختيار الأصل من البحث" />
        )}
        {!isIbkr && h.price_source === 'manual' && (
          <Switch label="أعرف القيمة الإجمالية فقط" hint="مناسب لبرنامج الادخار أو الحسابات التي لا تعرض الوحدات"
            checked={lumpSum} onChange={(v) => { setLumpSum(v); if (v) set({ quantity: 1, price: Number(h.quantity ?? 0) * Number(h.price ?? 0) || Number(h.price ?? 0) }) }} />
        )}
        {!isIbkr && (lumpSum && h.price_source === 'manual' ? (
          <NumberField label="القيمة الحالية" value={h.price ?? 0} suffix={h.currency} decimals={2} onChange={(v) => set({ price: v, quantity: 1 })} />
        ) : (
          <div className="grid2">
            <NumberField label="عدد الوحدات" value={h.quantity ?? 0} decimals={4} onChange={(v) => set({ quantity: v })} />
            {h.price_source === 'manual' || h.price_source === 'nav'
              ? <NumberField label="سعر الوحدة" value={h.price ?? 0} decimals={4} suffix={h.currency} onChange={(v) => set({ price: v })} />
              : <div className="field"><span>آخر سعر</span><div className="input num" style={{ display: 'flex', alignItems: 'center' }}>{num2(Number(h.price ?? 0))} {h.currency}</div></div>}
          </div>
        ))}
        {!isIbkr && (
          <SelectField label="العملة" value={h.currency ?? 'SAR'} onChange={(v) => set({ currency: v })} options={[...new Set([...CURRENCIES, h.currency ?? 'SAR'])].map((c) => ({ value: c, label: c }))} />
        )}
        <p className="small">القيمة بالريال: <b className="figure">{sar(value)}</b></p>
        <CostFields h={h} set={set} value={value} />
        <PayoutFields h={h} set={set} />
        <div className="panel inset stack" style={{ gap: 10 }}>
          <Switch label="عليه زكاة" hint={h.zakatable !== false ? `زكاته التقديرية ${sar((value * ZAKAT_RATE) / 100)}` : 'لا يدخل في حساب الزكاة'}
            checked={h.zakatable !== false} onChange={(v) => set({ zakatable: v })} />
          {h.zakatable !== false && <ZakatStart h={h} set={set} />}
        </div>
        <TextField label="ملاحظة" value={h.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}

function CostFields({ h, set, value }: { h: Partial<Holding>; set: (p: Partial<Holding>) => void; value: number }) {
  const cost = Number(h.cost_basis) || 0
  const gain = cost > 0 ? value - cost : null
  const guessed = guessRegion({ symbol: h.symbol ?? null, name: h.name ?? '', currency: h.currency ?? 'SAR' })
  return (
    <div className="panel inset stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>التكلفة والرسوم</h3>
      <NumberField label="إجمالي ما دفعته فيه" value={h.cost_basis ?? null} suffix="ريال" decimals={2} onChange={(v) => set({ cost_basis: v || null })}
        hint={gain == null ? 'يظهر به ربحك أو خسارتك. تزيده الإيداعات المسجّلة تلقائياً' : <>الربح حتى الآن <b className={gain >= 0 ? 'good' : 'bad'}>{gain >= 0 ? '+' : '−'}{sar(Math.abs(gain))}</b> ({signedPct((gain / cost) * 100)})</>} />
      <div className="grid2">
        <NumberField label="رسوم الإدارة السنوية" value={h.fee_pct ?? null} suffix="%" decimals={2} onChange={(v) => set({ fee_pct: v || null })}
          hint={Number(h.fee_pct) > 0 ? `نحو ${sar((value * Number(h.fee_pct)) / 100)} في السنة` : 'من نشرة الصندوق أو موقعه'} />
        <NumberField label="نسبة التطهير" value={h.purification_pct ?? null} suffix="%" decimals={2} onChange={(v) => set({ purification_pct: v || null })}
          hint="من التوزيعات المستلمة، كما تعلنها الهيئة الشرعية" />
      </div>
      <SelectField label="السوق الذي يستثمر فيه" value={h.region ?? ''} onChange={(v) => set({ region: (v || null) as Region | null })}
        options={[{ value: '', label: `تلقائي: ${REGION_LABEL[guessed]}` }, ...(Object.keys(REGION_LABEL) as Region[]).map((r) => ({ value: r, label: REGION_LABEL[r] }))]} />
    </div>
  )
}

function ZakatStart({ h, set }: { h: Partial<Holding>; set: (p: Partial<Holding>) => void }) {
  const next = h.zakat_start ? nextHaul(h.zakat_start, todayISO()) : null
  return (
    <label className="field"><span>بداية الحول</span>
      <div className="row" style={{ gap: 8 }}>
        <input className="input grow" type="date" value={h.zakat_start ?? ''} onChange={(e) => set({ zakat_start: e.target.value || null })} />
        {!h.zakat_start && <button type="button" className="btn ghost small" onClick={() => set({ zakat_start: todayISO() })}>اليوم</button>}
      </div>
      <small>
        {h.zakat_start
          ? <>بدأ في {hijriLabel(h.zakat_start)}. يحول عليه الحول في <b>{next ? `${hijriLabel(next)} (${dateLong(next)})` : '—'}</b>، ويتكرر كل سنة هجرية.</>
          : 'عادةً تاريخ شراء الأصل أو تاريخ بلوغ مالك النصاب. يصلك تنبيه قبل موعده بثلاثة أيام.'}
      </small>
    </label>
  )
}

function PayoutFields({ h, set }: { h: Partial<Holding>; set: (p: Partial<Holding>) => void }) {
  const { fx } = useStore()
  const freq = h.payout_freq ?? 'none'
  const [open, setOpen] = useState(freq !== 'none' || !!h.maturity_date)
  const per = freq === 'none' ? 0 : payoutPerPayment({ ...(h as Holding), payout_freq: freq, payout_basis: h.payout_basis ?? 'rate' }, fx)
  if (!open) return (
    <button type="button" className="btn ghost" onClick={() => setOpen(true)}>يوزّع أرباحاً نقدية أو له تاريخ استحقاق؟</button>
  )
  return (
    <div className="panel inset stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>التوزيعات النقدية</h3>
      <SelectField label="كم مرة يوزّع؟" value={freq} onChange={(v) => set({ payout_freq: v })}
        options={(Object.keys(FREQ_LABEL) as Array<keyof typeof FREQ_LABEL>).map((k) => ({ value: k, label: FREQ_LABEL[k] }))} />
      {freq !== 'none' && <>
        <Segmented label="طريقة حساب التوزيع" value={h.payout_basis ?? 'rate'} onChange={(v) => set({ payout_basis: v })}
          options={[{ value: 'rate', label: 'نسبة سنوية' }, { value: 'per_unit', label: 'مبلغ لكل وحدة' }]} />
        {(h.payout_basis ?? 'rate') === 'rate' ? (
          <div className="grid2">
            <NumberField label="نسبة التوزيع السنوية" value={h.payout_rate ?? null} suffix="%" decimals={2} onChange={(v) => set({ payout_rate: v || null })} />
            <NumberField label="القيمة الاسمية للوحدة" value={h.payout_nominal ?? null} decimals={2} suffix={h.currency ?? 'SAR'} onChange={(v) => set({ payout_nominal: v || null })}
              hint="للصكوك فقط (غالباً 1,000). اتركه فارغاً للصناديق" />
          </div>
        ) : (
          <NumberField label="المبلغ لكل وحدة في كل توزيع" value={h.payout_per_unit ?? null} decimals={4} suffix={h.currency ?? 'SAR'} onChange={(v) => set({ payout_per_unit: v || null })} />
        )}
        <label className="field"><span>موعد التوزيع القادم</span>
          <input className="input" type="date" value={h.payout_next ?? ''} onChange={(e) => set({ payout_next: e.target.value || null })} />
          <small>تتكرر المواعيد بعده {FREQ_LABEL[freq]}.</small>
        </label>
        <p className="small">{per == null ? 'أدخل النسبة أو المبلغ ليُحسب التوزيع.' : per > 0 ? <>نحو <b className="figure">{sar(per)}</b> في كل توزيع، و<b className="figure">{sar(per * PER_YEAR[freq])}</b> في السنة.</> : 'أدخل عدد الوحدات ليُحسب التوزيع.'}</p>
      </>}
      <label className="field"><span>تاريخ الاستحقاق</span>
        <input className="input" type="date" value={h.maturity_date ?? ''} onChange={(e) => set({ maturity_date: e.target.value || null })} />
        <small>للصكوك والودائع: يعود فيه رأس المال وتتوقف التوزيعات.</small>
      </label>
    </div>
  )
}
