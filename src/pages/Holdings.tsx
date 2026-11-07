// The full edit sheet of one holding (basics first, advanced fields folded away),
// and the helper that records an asset added to or removed from the app as a transfer.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { ZAKAT_RATE, holdingValue, rateOf } from '../lib/calc'
import { dateLong, dateShort, num0, num2, sar, signedPct, todayISO } from '../lib/format'
import { FREQ_LABEL, PER_YEAR, hijriLabel, nextHaul, payoutPerPayment } from '../lib/income'
import type { Holding, Region } from '../lib/types'
import { REGION_LABEL, guessRegion } from '../lib/wealth'
import { NumberField, Segmented, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { SymbolSearch } from '../components/SymbolSearch'
import { guessSleeve, quoteSymbol, type SymbolResult } from '../lib/market'
import './Holdings.css'

const CURRENCIES = ['SAR', 'USD', 'GBP', 'EUR', 'AED', 'HKD', 'SGD', 'JPY']
const curLabel = (c?: string | null) => (!c || c === 'SAR' ? 'ريال' : c)
/** keeps "7.5%" or "−6.3%" in reading order when it follows Arabic words */
const isolate = (s: string) => `⁦${s}⁩`

type TransferCtx = Pick<ReturnType<typeof useStore>, 'fx' | 'accounts' | 'insertMany'>

/**
 * Adding an asset you already own (or deleting one) moves the portfolio value without a gain or a loss,
 * so it is recorded as a 'transfer' that performance treats as money coming in (or going out).
 * Goal portfolios, accounts outside the portfolio and IBKR positions are left out.
 */
export async function recordTransfer(ctx: TransferCtx, x: Holding, sign: 1 | -1) {
  const v = holdingValue(x, ctx.fx)
  const outside = x.goal_id || (x.account_id && ctx.accounts.find((a) => a.id === x.account_id)?.exclude_from_portfolio)
  if (v < 1 || outside || x.price_source === 'ibkr') return true
  return ctx.insertMany('transactions', [{
    tx_date: todayISO(), kind: 'transfer', amount_sar: Math.round(sign * v * 100) / 100, holding_id: sign > 0 ? x.id : null, account_id: x.account_id,
    sleeve_id: x.sleeve_id, quantity: null, price: null, currency: 'SAR', source: 'manual', external_id: null,
    note: sign > 0 ? `إضافة أصل قائم: ${x.name}` : `حذف أصل: ${x.name}`,
  }])
}

export function HoldingSheet({ initial, onClose, onDeleted }: { initial: Partial<Holding>; onClose: () => void; onDeleted?: () => void }) {
  const { upsert, remove, fx, notify, accounts, sleeves, holdings, goals, refreshMarket, insertMany } = useStore()
  const [h, setH] = useState<Partial<Holding>>(initial)
  const [lumpSum, setLumpSum] = useState(initial.price_source === 'manual' && Number(initial.quantity) === 1 && Number(initial.price) > 50)
  const set = (patch: Partial<Holding>) => setH((x) => ({ ...x, ...patch }))
  const isIbkr = h.price_source === 'ibkr'
  const [searching, setSearching] = useState(initial.price_source === 'yahoo' && !initial.symbol)
  const [quoting, setQuoting] = useState(false)
  const pick = async (r: SymbolResult) => {
    const keepName = !!h.name?.trim()
    set({ symbol: r.symbol, price_source: 'yahoo', ...(keepName ? {} : { name: r.name }), ...(h.sleeve_id || h.goal_id ? {} : { sleeve_id: guessSleeve(r, sleeves) }) })
    setLumpSum(false)
    setSearching(false)
    setQuoting(true)
    const q = await quoteSymbol(r.symbol)
    setQuoting(false)
    if (q) set({ price: q.price, currency: q.currency, price_updated_at: new Date().toISOString() })
    else notify('تعذّر جلب السعر الآن؛ يتحدث مع التحديث القادم')
  }
  const value = Number(h.quantity ?? 0) * Number(h.price ?? 0) * rateOf(h.currency, fx)
  const cur = curLabel(h.currency)
  const ctx = { fx, accounts, insertMany }

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
    if (ok && !h.id) await recordTransfer(ctx, ok as Holding, 1)
    if (ok) {
      notify('حُفظ الأصل')
      onClose()
      // a currency the app has no rate for yet: fetch it now rather than at the next daily run
      if (row.currency && !(row.currency in fx)) refreshMarket('prices')
    }
  }
  const del = async () => {
    if (!h.id || !confirm('حذف هذا الأصل نهائياً؟')) return
    await recordTransfer(ctx, initial as Holding, -1)
    await remove('holdings', h.id)
    onClose()
    onDeleted?.()
  }

  // one-line status of each folded section
  const cost = Number(h.cost_basis) || 0
  const fee = Number(h.fee_pct) || 0
  const costSum = [cost > 0 ? `دفعت ${sar(cost)}` : null, fee > 0 ? `رسوم ${isolate(`${num2(fee)}%`)}` : null].filter(Boolean).join(' · ') || 'غير محددة'
  const freq = h.payout_freq ?? 'none'
  const paySum = freq !== 'none'
    ? [FREQ_LABEL[freq], h.payout_basis !== 'per_unit' && Number(h.payout_rate) > 0 ? isolate(`${num2(Number(h.payout_rate))}%`) : null].filter(Boolean).join(' · ')
    : h.maturity_date ? `يستحق ${dateLong(h.maturity_date)}` : 'لا يوزّع'
  const zak = h.zakatable !== false
  const haul = zak && h.zakat_start ? nextHaul(h.zakat_start, todayISO()) : null
  const zakSum = !zak ? 'لا زكاة عليه' : haul ? `${sar((value * ZAKAT_RATE) / 100)} · ${dateShort(haul)}` : 'حدّد بداية الحول'
  const liveGoals = goals.filter((g) => !g.archived || g.id === h.goal_id)

  return (
    <Sheet title={h.id ? 'تعديل الأصل' : 'أصل جديد'} onClose={onClose} footer={<>
      {h.id && <button className="btn danger" onClick={del}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="الاسم" value={h.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: صندوق البلاد للذهب" />
        {liveGoals.some((g) => !g.archived) && (
          <SelectField label="يتبع" value={h.goal_id ?? ''} onChange={(v) => {
            const g = goals.find((x) => x.id === v)
            set({ goal_id: v || null, goal_bucket: g?.allocation?.[0]?.key ?? null })
          }} options={[{ value: '', label: 'المحفظة الرئيسية' }, ...liveGoals.map((g) => ({ value: g.id, label: `هدف: ${g.name}` }))]} />
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

        {isIbkr ? (
          <p className="small muted">يتحدث من تقرير IBKR اليومي؛ يمكنك تعديل الاسم والطبقة فقط.</p>
        ) : <>
          <div className="field hs-seg">
            <span>تحديث السعر</span>
            <Segmented label="تحديث السعر" value={h.price_source ?? 'manual'} onChange={(v) => {
              set({ price_source: v })
              if (v !== 'manual') setLumpSum(false)
              setSearching(v === 'yahoo' && !h.symbol)
            }} options={[{ value: 'manual', label: 'يدوي' }, { value: 'yahoo', label: 'من السوق' }, { value: 'nav', label: 'من مباشر' }]} />
          </div>
          {h.price_source === 'yahoo' && (searching ? (
            <div className="stack" style={{ gap: 6 }}>
              <SymbolSearch onPick={pick} hint="للأسهم والصناديق المتداولة محلياً وعالمياً" />
              {h.symbol && <button type="button" className="btn quiet small hs-inline-btn" onClick={() => setSearching(false)}>إلغاء البحث</button>}
            </div>
          ) : (
            <div className="stack" style={{ gap: 4 }}>
              <TextField label="رمز التداول" value={h.symbol ?? ''} onChange={(v) => set({ symbol: v.toUpperCase() })} ltr
                hint={quoting ? 'نجلب السعر…' : 'يتحدث السعر يومياً من السوق'} />
              <button type="button" className="btn quiet small hs-inline-btn" onClick={() => setSearching(true)}>ابحث عن رمز آخر</button>
            </div>
          ))}
          {h.price_source === 'nav' && (
            <TextField label="رقم الصندوق في مباشر" value={h.symbol ?? ''} onChange={(v) => set({ symbol: v.replace(/[^0-9]/g, '') })} ltr placeholder="5885"
              hint="5885 لصندوق الراجحي للتوزيعات الشهرية، و6046 للصندوق 2" />
          )}
          {h.price_source === 'manual' && (
            <Switch label="أعرف القيمة الإجمالية فقط" hint="لبرامج الادخار والحسابات التي لا تعرض الوحدات"
              checked={lumpSum} onChange={(v) => { setLumpSum(v); if (v) set({ quantity: 1, price: Number(h.quantity ?? 0) * Number(h.price ?? 0) || Number(h.price ?? 0) }) }} />
          )}
          {lumpSum && h.price_source === 'manual' ? (
            <NumberField label="القيمة الحالية" value={h.price ?? 0} suffix={cur} decimals={2} onChange={(v) => set({ price: v, quantity: 1 })} />
          ) : (
            <div className="grid2">
              <NumberField label="عدد الوحدات" value={h.quantity ?? 0} decimals={4} onChange={(v) => set({ quantity: v })} />
              {h.price_source === 'yahoo'
                ? <div className="field"><span>آخر سعر</span><div className="input num hs-ro"><small>{cur}</small>{num2(Number(h.price ?? 0))}</div></div>
                : <NumberField label="سعر الوحدة" value={h.price ?? 0} decimals={4} suffix={cur} onChange={(v) => set({ price: v })} />}
            </div>
          )}
        </>}
        <div className={isIbkr ? '' : 'grid2'}>
          {!isIbkr && (
            <SelectField label="العملة" value={h.currency ?? 'SAR'} onChange={(v) => set({ currency: v })}
              options={[...new Set([...CURRENCIES, h.currency ?? 'SAR'])].map((c) => ({ value: c, label: c }))} />
          )}
          <div className="field"><span>القيمة بالريال</span><div className="input num hs-ro hs-value"><span className="figure">{num0(value)}</span></div></div>
        </div>

        <details className="more">
          <summary>التكلفة والرسوم<span className="sum-sub">{costSum}</span></summary>
          <div className="more-body"><CostFields h={h} set={set} value={value} /></div>
        </details>
        <details className="more">
          <summary>التوزيعات والاستحقاق<span className="sum-sub">{paySum}</span></summary>
          <div className="more-body"><PayoutFields h={h} set={set} /></div>
        </details>
        <details className="more">
          <summary>الزكاة<span className="sum-sub" style={zak && !h.zakat_start ? { color: 'var(--warn)' } : undefined}>{zakSum}</span></summary>
          <div className="more-body">
            <Switch label="عليه زكاة" hint={zak ? `زكاته التقديرية ${sar((value * ZAKAT_RATE) / 100)}` : 'لا يدخل في حساب الزكاة'}
              checked={zak} onChange={(v) => set({ zakatable: v })} />
            {zak && <ZakatStart h={h} set={set} />}
          </div>
        </details>

        <TextField label="ملاحظة" value={h.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}

function CostFields({ h, set, value }: { h: Partial<Holding>; set: (p: Partial<Holding>) => void; value: number }) {
  const cost = Number(h.cost_basis) || 0
  const gain = cost > 0 ? value - cost : null
  const guessed = guessRegion({ symbol: h.symbol ?? null, name: h.name ?? '', currency: h.currency ?? 'SAR' })
  return <>
    <NumberField label="إجمالي ما دفعته فيه" value={h.cost_basis ?? null} suffix="ريال" decimals={2} onChange={(v) => set({ cost_basis: v || null })}
      hint={gain == null ? 'يظهر به ربحك أو خسارتك، وتزيده الإيداعات المسجّلة' : <>الربح حتى الآن <b className={gain >= 0 ? 'good' : 'bad'}><bdi dir="ltr">{gain >= 0 ? '+' : '−'}{num0(Math.abs(gain))}</bdi> ريال</b> (<bdi dir="ltr">{signedPct((gain / cost) * 100)}</bdi>)</>} />
    <div className="grid2">
      <NumberField label="رسوم الإدارة السنوية" value={h.fee_pct ?? null} suffix="%" decimals={2} onChange={(v) => set({ fee_pct: v || null })}
        hint={Number(h.fee_pct) > 0 ? `نحو ${sar((value * Number(h.fee_pct)) / 100)} في السنة` : 'من نشرة الصندوق'} />
      <NumberField label="نسبة التطهير" value={h.purification_pct ?? null} suffix="%" decimals={2} onChange={(v) => set({ purification_pct: v || null })}
        hint="من التوزيعات المستلمة" />
    </div>
    <SelectField label="السوق الذي يستثمر فيه" value={h.region ?? ''} onChange={(v) => set({ region: (v || null) as Region | null })}
      options={[{ value: '', label: `تلقائي: ${REGION_LABEL[guessed]}` }, ...(Object.keys(REGION_LABEL) as Region[]).map((r) => ({ value: r, label: REGION_LABEL[r] }))]} />
  </>
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
          ? <>يحول عليه الحول في <b>{next ? `${hijriLabel(next)} (${dateLong(next)})` : '—'}</b>، ويتكرر كل سنة هجرية.</>
          : 'عادةً تاريخ الشراء. يصلك تنبيه قبل موعده بثلاثة أيام.'}
      </small>
    </label>
  )
}

function PayoutFields({ h, set }: { h: Partial<Holding>; set: (p: Partial<Holding>) => void }) {
  const { fx } = useStore()
  const freq = h.payout_freq ?? 'none'
  const per = freq === 'none' ? 0 : payoutPerPayment({ ...(h as Holding), payout_freq: freq, payout_basis: h.payout_basis ?? 'rate' }, fx)
  return <>
    <SelectField label="كم مرة يوزّع؟" value={freq} onChange={(v) => set({ payout_freq: v })}
      options={(Object.keys(FREQ_LABEL) as Array<keyof typeof FREQ_LABEL>).map((k) => ({ value: k, label: FREQ_LABEL[k] }))} />
    {freq !== 'none' && <>
      <div className="hs-seg">
        <Segmented label="طريقة حساب التوزيع" value={h.payout_basis ?? 'rate'} onChange={(v) => set({ payout_basis: v })}
          options={[{ value: 'rate', label: 'نسبة سنوية' }, { value: 'per_unit', label: 'مبلغ لكل وحدة' }]} />
      </div>
      {(h.payout_basis ?? 'rate') === 'rate' ? (
        <div className="grid2">
          <NumberField label="نسبة التوزيع السنوية" value={h.payout_rate ?? null} suffix="%" decimals={2} onChange={(v) => set({ payout_rate: v || null })} />
          <NumberField label="القيمة الاسمية للوحدة" value={h.payout_nominal ?? null} decimals={2} suffix={curLabel(h.currency)} onChange={(v) => set({ payout_nominal: v || null })}
            hint="للصكوك فقط، وغالباً 1,000" />
        </div>
      ) : (
        <NumberField label="المبلغ لكل وحدة في كل توزيع" value={h.payout_per_unit ?? null} decimals={4} suffix={curLabel(h.currency)} onChange={(v) => set({ payout_per_unit: v || null })} />
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
  </>
}
