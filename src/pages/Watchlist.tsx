import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { currentTarget, holdingValue } from '../lib/calc'
import { ago, num2, pct, sar } from '../lib/format'
import type { WatchItem } from '../lib/types'
import { Empty, NumberField, SelectField, Sheet, TextField } from '../components/ui'
import { IconCheck, IconPlus, IconRefresh } from '../components/icons'

const CONDITIONS: Array<{ key: 'c_size' | 'c_shariah' | 'c_quality' | 'c_thesis'; label: string; hint: string }> = [
  { key: 'c_size', label: 'شركة كبيرة وقيادية', hint: 'من أكبر الشركات في قطاعها، وسيولة سهمها عالية' },
  { key: 'c_shariah', label: 'متوافقة مع الضوابط الشرعية', hint: 'حسب قائمة الهيئة الشرعية التي تعتمدها' },
  { key: 'c_quality', label: 'أرباح مستقرة وديون منخفضة', hint: 'أرباح متكررة لخمس سنوات على الأقل' },
  { key: 'c_thesis', label: 'سبب شراء مكتوب', hint: 'تعرف لماذا تشتري ومتى تبيع' },
]

export const buyPrice = (w: WatchItem) => (w.fair_value ? Number(w.fair_value) * (1 - Number(w.margin_pct ?? 20) / 100) : null)
export const conditionsMet = (w: WatchItem) => {
  const bp = buyPrice(w)
  const priceOk = bp != null && w.price != null && Number(w.price) <= bp
  return { count: CONDITIONS.filter((c) => w[c.key]).length + (priceOk ? 1 : 0), priceOk }
}

export default function Watchlist() {
  const { watchlist, holdings, sleeves, settings, fx, readOnly, refreshMarket, refreshing, notify } = useStore()
  const d = useDerived()
  const [editing, setEditing] = useState<Partial<WatchItem> | null>(null)
  const direct = useMemo(() => sleeves.find((s) => /مباشر/.test(s.name)), [sleeves])
  if (!d || !settings) return null
  const total = d.totals.total
  const capPct = direct ? currentTarget(direct, settings) : 8
  const directValue = direct ? holdings.filter((h) => h.sleeve_id === direct.id).reduce((a, h) => a + holdingValue(h, fx), 0) : 0
  const directPct = total ? (directValue / total) * 100 : 0
  const room = Math.max(0, (capPct / 100) * total - directValue)
  const perStock = (Number(settings.stock_cap) / 100) * total

  const rows = [...watchlist].sort((a, b) => {
    const da = distance(a), db = distance(b)
    return (da ?? 999) - (db ?? 999)
  })

  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>
        الأسهم التي تتابعها قبل شرائها. الشراء فقط عندما تكتمل الشروط الخمسة: الأربعة أدناه، ونزول السعر تحت سعر الشراء بهامش الأمان. يصلك إشعار عند وصول أي سهم لسعر الشراء.
      </p>

      <section className="section" style={{ marginTop: 0 }}>
        <div className="facts" style={{ marginTop: 0 }}>
          <div className="fact"><div className="v">{pct(directPct)}</div><div className="l">الأسهم المباشرة الآن، والحد {pct(capPct)}</div></div>
          <div className="fact"><div className="v">{sar(room)}</div><div className="l">المتاح للأسهم المباشرة</div></div>
          <div className="fact"><div className="v">{sar(perStock)}</div><div className="l">أقصى مبلغ لسهم واحد ({pct(Number(settings.stock_cap))})</div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>أسهم تتابعها</h2>
          {!readOnly && (
            <div className="row" style={{ gap: 8 }}>
              <button className="btn ghost small" disabled={refreshing} onClick={async () => notify((await refreshMarket('prices')).message)}>
                <IconRefresh className={refreshing ? 'spin' : ''} /> الأسعار
              </button>
              <button className="btn primary small" onClick={() => setEditing({ name: '', symbol: '', currency: 'SAR', margin_pct: 20, c_size: false, c_shariah: false, c_quality: false, c_thesis: false, sort: watchlist.length + 1 })}>
                <IconPlus /> سهم
              </button>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="panel"><Empty title="لا أسهم في القائمة بعد">
            <p className="small" style={{ marginTop: 6 }}>أضف السهم الذي يعجبك مع قيمته العادلة في رأيك، وسيتابع التطبيق سعره يومياً ويخبرك عند وصوله لسعر الشراء.</p>
          </Empty></div>
        ) : (
          <div className="panel flush">
            {rows.map((w) => {
              const bp = buyPrice(w)
              const { count, priceOk } = conditionsMet(w)
              const dist = distance(w)
              const ready = count === 5
              return (
                <button key={w.id} className="list-item" onClick={() => setEditing(w)}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                      <span>{w.name}</span>
                      {w.symbol && <span className="tiny muted ltr">{w.symbol}</span>}
                      <span className={`chip ${ready ? 'accent' : priceOk ? 'warn' : ''}`}>
                        {ready ? 'جاهز للشراء' : priceOk ? 'السعر مناسب والشروط ناقصة' : `${count} من 5`}
                      </span>
                    </div>
                    <div className="meta">
                      {w.price != null ? <>السعر <span className="ltr">{num2(Number(w.price))}</span></> : 'لا سعر بعد'}
                      {bp != null ? <>، الشراء تحت <span className="ltr">{num2(bp)}</span></> : '، حدّد القيمة العادلة'}
                      {w.price_updated_at ? ` (${ago(w.price_updated_at)})` : ''}
                    </div>
                    <div className="dots" aria-label={`الشروط المكتملة ${count} من 5`}>
                      {[...CONDITIONS.map((c) => !!w[c.key]), priceOk].map((ok, i) => <i key={i} className={ok ? 'on' : ''} />)}
                    </div>
                  </div>
                  <div className="amount">
                    {dist == null ? '—' : dist <= 0 ? <span className="good">تحت سعر الشراء</span> : <><span className="figure">{pct(dist)}</span><div className="tiny muted">فوق سعر الشراء</div></>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {editing && <WatchSheet initial={editing} readOnly={readOnly} perStock={perStock} room={room} directSleeveId={direct?.id ?? null} onClose={() => setEditing(null)} />}
    </>
  )
}

/** How far the price is above the buy price, in percent (negative = below). */
function distance(w: WatchItem) {
  const bp = buyPrice(w)
  if (bp == null || w.price == null || !bp) return null
  return ((Number(w.price) - bp) / bp) * 100
}

function WatchSheet({ initial, readOnly, perStock, room, directSleeveId, onClose }: {
  initial: Partial<WatchItem>; readOnly: boolean; perStock: number; room: number; directSleeveId: string | null; onClose: () => void
}) {
  const { upsert, remove, notify, refreshMarket, accounts, holdings } = useStore()
  const [w, setW] = useState<Partial<WatchItem>>(initial)
  const [buyQty, setBuyQty] = useState(0)
  const [buyAccount, setBuyAccount] = useState(() => accounts.find((a) => /راجحي/.test(a.name))?.id ?? accounts[0]?.id ?? '')
  const set = (p: Partial<WatchItem>) => setW((x) => ({ ...x, ...p }))
  const bp = w.fair_value ? Number(w.fair_value) * (1 - Number(w.margin_pct ?? 20) / 100) : null
  const priceOk = bp != null && w.price != null && Number(w.price) <= bp
  const maxShares = w.price ? Math.floor(Math.min(perStock, room) / Number(w.price)) : null

  const saveIt = async () => {
    if (!w.name?.trim()) { notify('اكتب اسم الشركة'); return }
    const symbolChanged = (w.symbol ?? '') !== (initial.symbol ?? '')
    const saved = await upsert('watchlist', {
      id: w.id, name: w.name.trim(), symbol: w.symbol?.trim().toUpperCase() || null, currency: w.currency ?? 'SAR',
      fair_value: w.fair_value ? Number(w.fair_value) : null, margin_pct: Number(w.margin_pct ?? 20),
      c_size: !!w.c_size, c_shariah: !!w.c_shariah, c_quality: !!w.c_quality, c_thesis: !!w.c_thesis,
      thesis: w.thesis?.trim() || null, exit_rule: w.exit_rule?.trim() || null, note: w.note?.trim() || null, sort: w.sort ?? 99,
      ...(symbolChanged ? { price: null, price_updated_at: null } : {}),
    })
    if (!saved) return
    onClose()
    if (saved.symbol && (symbolChanged || saved.price == null)) {
      notify('حُفظ السهم؛ جارٍ جلب سعره…')
      const r = await refreshMarket('prices')
      notify(r.ok ? 'حُدّث السعر' : r.message)
    } else notify('حُفظ السهم')
  }

  const addToPortfolio = async () => {
    if (!w.id || !buyQty) { notify('اكتب عدد الأسهم التي اشتريتها'); return }
    const ok = await upsert('holdings', {
      name: w.name, symbol: w.symbol, price_source: w.symbol ? 'yahoo' : 'manual', currency: w.currency ?? 'SAR', quantity: buyQty,
      price: Number(w.price ?? 0), price_updated_at: new Date().toISOString(), account_id: buyAccount || null, sleeve_id: directSleeveId,
      zakatable: true, note: w.thesis ? `سبب الشراء: ${w.thesis}${w.exit_rule ? `\nالبيع: ${w.exit_rule}` : ''}` : null, sort: holdings.length + 1,
    })
    if (ok) { notify('أُضيف السهم إلى المحفظة. حدّد زكاته من صفحة المحفظة.'); onClose() }
  }

  return (
    <Sheet title={readOnly ? (w.name ?? 'سهم') : w.id ? 'تعديل سهم' : 'سهم للمراقبة'} onClose={onClose} footer={readOnly ? undefined : <>
      {w.id && <button className="btn danger" onClick={async () => { if (confirm('حذف السهم من القائمة؟')) { await remove('watchlist', w.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <fieldset className="stack" disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid2">
          <TextField label="اسم الشركة" value={w.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: مصرف الراجحي" />
          <TextField label="رمز التداول" value={w.symbol ?? ''} onChange={(v) => set({ symbol: v.toUpperCase() })} ltr placeholder="1120.SR"
            hint="لتداول أضف .SR بعد الرقم" />
        </div>
        <div className="grid2">
          <NumberField label="القيمة العادلة في رأيك" value={w.fair_value ?? null} decimals={2} suffix={w.currency ?? 'SAR'} onChange={(v) => set({ fair_value: v || null })} />
          <NumberField label="هامش الأمان" value={w.margin_pct ?? 20} suffix="%" onChange={(v) => set({ margin_pct: Math.max(0, Math.min(60, v)) })} />
        </div>
        <div className="callout">
          {bp == null ? 'حدّد القيمة العادلة ليُحسب سعر الشراء.' : <>
            سعر الشراء: تحت <b className="figure ltr">{num2(bp)}</b>
            {w.price != null && <>، والسعر الآن <b className="figure ltr">{num2(Number(w.price))}</b> {priceOk ? <span className="good">(مناسب)</span> : <span className="muted">(انتظر)</span>}</>}
          </>}
        </div>

        <div className="field"><span>الشروط</span>
          <div className="checks">
            {CONDITIONS.map((c) => (
              <label key={c.key} className="check">
                <input type="checkbox" checked={!!w[c.key]} onChange={(e) => set({ [c.key]: e.target.checked } as Partial<WatchItem>)} />
                <span><b>{c.label}</b><small>{c.hint}</small></span>
              </label>
            ))}
            <div className={`check auto ${priceOk ? 'on' : ''}`}>
              <span className="box">{priceOk && <IconCheck width={14} height={14} />}</span>
              <span><b>السعر تحت سعر الشراء</b><small>يتحقق تلقائياً من السعر اليومي</small></span>
            </div>
          </div>
        </div>

        <label className="field"><span>لماذا تشتريه؟</span>
          <textarea className="input" rows={3} value={w.thesis ?? ''} onChange={(e) => set({ thesis: e.target.value })} placeholder="مثال: نمو الأرباح 10% سنوياً وتوزيعات ثابتة، والسعر أقل من متوسطه التاريخي" /></label>
        <label className="field"><span>متى تبيعه؟</span>
          <textarea className="input" rows={2} value={w.exit_rule ?? ''} onChange={(e) => set({ exit_rule: e.target.value })} placeholder="مثال: إذا تجاوز القيمة العادلة بـ 20%، أو تغيّر سبب الشراء" /></label>
      </fieldset>

      {!readOnly && w.id && (
        <div className="panel inset stack" style={{ marginTop: 16 }}>
          <h3>اشتريته؟</h3>
          <p className="small muted">
            {maxShares != null ? <>الحد لهذا السهم نحو <b className="figure">{maxShares.toLocaleString('en-US')}</b> سهم بالسعر الحالي ({sar(Math.min(perStock, room))}). </> : null}
            سجّل الكمية ليظهر في المحفظة ضمن الأسهم المباشرة.
          </p>
          <div className="grid2">
            <NumberField label="عدد الأسهم" value={buyQty} onChange={setBuyQty} />
            <SelectField label="الحساب" value={buyAccount} onChange={setBuyAccount} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
          <button className="btn ghost" onClick={addToPortfolio}>أضفه إلى المحفظة</button>
        </div>
      )}
    </Sheet>
  )
}
