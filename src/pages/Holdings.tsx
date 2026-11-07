import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { LAYER_NAMES, LAYER_ORDER, holdingValue, rateOf } from '../lib/calc'
import { ago, num2, pct, sar } from '../lib/format'
import type { Holding } from '../lib/types'
import { NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus, IconRefresh } from '../components/icons'

const CURRENCIES = ['SAR', 'USD', 'GBP', 'EUR', 'AED', 'HKD', 'SGD', 'JPY']
const SOURCE_LABEL = { manual: 'يدوي', yahoo: 'آلي من السوق', ibkr: 'من IBKR' } as const

export default function Holdings() {
  const { holdings, sleeves, accounts, fx, refreshMarket, refreshing, notify } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const [editing, setEditing] = useState<Partial<Holding> | null>(null)
  if (!d) return null
  const total = d.totals.total || 1
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'بلا حساب'
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const visible = holdings.filter((h) => !h.archived)
  const inPortfolio = visible.filter((h) => !h.account_id || !excluded.has(h.account_id))
  const outside = visible.filter((h) => h.account_id && excluded.has(h.account_id))
  const unassigned = inPortfolio.filter((h) => !h.sleeve_id || !sleeves.some((s) => s.id === h.sleeve_id))

  const row = (h: Holding) => {
    const v = holdingValue(h, fx)
    const stale = h.price_source === 'manual' && Number(h.quantity) > 0 && (!h.price_updated_at || Date.now() - new Date(h.price_updated_at).getTime() > 35 * 86400000)
    return (
      <button key={h.id} className="list-item" onClick={() => setEditing(h)}>
        <div className="grow">
          <div>{h.name}</div>
          <div className="meta">
            {accountName(h.account_id)}، {SOURCE_LABEL[h.price_source]}
            {h.price_source !== 'manual' || Number(h.quantity) !== 1 ? <>، {num2(Number(h.quantity))} وحدة بسعر <span className="ltr">{num2(Number(h.price))} {h.currency}</span></> : null}
            {' '}<span className={stale ? 'stale' : ''}>({ago(h.price_updated_at)})</span>
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
        <button className="btn ghost small" disabled={refreshing} onClick={async () => notify((await refreshMarket('prices')).message)}>
          <IconRefresh className={refreshing ? 'spin' : ''} /> حدّث الأسعار
        </button>
        <button className="btn primary small" onClick={() => setEditing({ name: '', price_source: 'manual', currency: 'SAR', quantity: 0, price: 0, account_id: accounts[0]?.id ?? null, sleeve_id: sleeves[0]?.id ?? null })}>
          <IconPlus /> أصل جديد
        </button>
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
                    {items.length ? items.map(row) : (
                      <button className="list-item" onClick={() => setEditing({ name: '', price_source: 'manual', currency: 'SAR', quantity: 0, price: 0, sleeve_id: s.id, account_id: accounts[0]?.id ?? null })}>
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
      {outside.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>خارج المحفظة</h2><p>لا يدخل في الأوزان ولا في الهدف</p></div>
          <div className="panel flush">{outside.map(row)}</div>
        </section>
      )}

      {editing && <HoldingSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )

}

function HoldingSheet({ initial, onClose }: { initial: Partial<Holding>; onClose: () => void }) {
  const { upsert, remove, fx, notify, accounts, sleeves, holdings } = useStore()
  const [h, setH] = useState<Partial<Holding>>(initial)
  const [lumpSum, setLumpSum] = useState(initial.price_source === 'manual' && Number(initial.quantity) === 1 && Number(initial.price) > 50)
  const set = (patch: Partial<Holding>) => setH((x) => ({ ...x, ...patch }))
  const isIbkr = h.price_source === 'ibkr'
  const value = Number(h.quantity ?? 0) * Number(h.price ?? 0) * rateOf(h.currency, fx)
  const saveIt = async () => {
    if (!h.name?.trim()) { notify('اكتب اسم الأصل'); return }
    const priceChanged = Number(h.price) !== Number(initial.price) || Number(h.quantity) !== Number(initial.quantity)
    const row: Partial<Holding> = {
      id: h.id, name: h.name.trim(), account_id: h.account_id ?? null, sleeve_id: h.sleeve_id ?? null, symbol: h.symbol?.trim() || null,
      price_source: h.price_source ?? 'manual', currency: h.currency ?? 'SAR', quantity: Number(h.quantity ?? 0), price: Number(h.price ?? 0),
      note: h.note ?? null, sort: h.sort ?? holdings.length + 1,
      ...(priceChanged && h.price_source === 'manual' ? { price_updated_at: new Date().toISOString() } : {}),
    }
    const ok = await upsert('holdings', row)
    if (ok) { notify('حُفظ الأصل'); onClose() }
  }
  return (
    <Sheet title={h.id ? 'تعديل أصل' : 'أصل جديد'} onClose={onClose} footer={<>
      {h.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا الأصل نهائياً؟')) { await remove('holdings', h.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="الاسم" value={h.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: صندوق البلاد للذهب" />
        <div className="grid2">
          <SelectField label="الحساب" value={h.account_id ?? ''} onChange={(v) => set({ account_id: v || null })}
            options={[{ value: '', label: 'بلا حساب' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
          <SelectField label="الطبقة" value={h.sleeve_id ?? ''} onChange={(v) => set({ sleeve_id: v || null })}
            options={[{ value: '', label: 'بلا طبقة' }, ...sleeves.map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        {!isIbkr && (
          <SelectField label="كيف يُحدَّث السعر؟" value={h.price_source ?? 'manual'} onChange={(v) => set({ price_source: v })}
            options={[{ value: 'manual', label: 'أُدخله بنفسي' }, { value: 'yahoo', label: 'آلياً من السوق برمز التداول' }]} />
        )}
        {isIbkr && <p className="small muted">يتحدث هذا الأصل تلقائياً من تقرير IBKR اليومي؛ يمكنك تغيير اسمه وطبقته فقط.</p>}
        {h.price_source === 'yahoo' && (
          <TextField label="رمز التداول" value={h.symbol ?? ''} onChange={(v) => set({ symbol: v.toUpperCase() })} ltr
            hint="لتداول أضف .SR (مثل 9405.SR)، ولسوق لندن أضف .L (مثل ISWD.L)، والأمريكي بلا إضافة" />
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
            {h.price_source === 'manual'
              ? <NumberField label="سعر الوحدة" value={h.price ?? 0} decimals={4} suffix={h.currency} onChange={(v) => set({ price: v })} />
              : <div className="field"><span>آخر سعر</span><div className="input num" style={{ display: 'flex', alignItems: 'center' }}>{num2(Number(h.price ?? 0))} {h.currency}</div></div>}
          </div>
        ))}
        {!isIbkr && (
          <SelectField label="العملة" value={h.currency ?? 'SAR'} onChange={(v) => set({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        )}
        <p className="small">القيمة بالريال: <b className="figure">{sar(value)}</b></p>
        <TextField label="ملاحظة" value={h.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
