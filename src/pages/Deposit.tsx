import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { planDeposit, rateOf, type DepositLine } from '../lib/calc'
import { num0, num2, parseNum, pct, sar, todayISO } from '../lib/format'
import type { Holding } from '../lib/types'
import { Segmented, Sheet } from '../components/ui'

export default function Deposit() {
  const { settings, sleeves, holdings } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const [text, setText] = useState('10,000')
  const [mode, setMode] = useState<'gaps' | 'weights'>('gaps')
  const [months, setMonths] = useState<'1' | '3' | '6'>('1')
  const [recording, setRecording] = useState(false)
  const amount = parseNum(text)
  const lines = useMemo(() => (d && settings && amount > 0 ? planDeposit(amount, sleeves, d.totals, settings, mode) : []), [amount, sleeves, d, settings, mode])
  if (!settings || !d) return null
  const n = Number(months)
  const quick = [
    { label: '5,000', v: 5000 }, { label: '10,000', v: 10000 },
    { label: 'المكافأة 105,000', v: 105000 }, { label: 'السلفة 250,000', v: 250000 },
  ]
  const suggestion = (sleeveId: string) => {
    const note = sleeves.find((s) => s.id === sleeveId)?.note
    if (note) return note
    return holdings.find((h) => h.sleeve_id === sleeveId && !h.archived && !/برنامج الادخار/.test(h.name))?.name ?? ''
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>اكتب المبلغ الذي ستستثمره، وأقسّمه لك على الطبقات بحيث تقترب المحفظة من أوزانها المستهدفة لهذا العام.</p>
      <div className="panel amount-hero">
        <label htmlFor="amt" className="small muted">مبلغ الإيداع بالريال</label>
        <input id="amt" className="amount-input" inputMode="decimal" value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setText(amount ? num0(amount) : '')} />
        <div className="quick">
          {quick.map((q) => <button key={q.v} className="btn ghost small" onClick={() => setText(num0(q.v))}>{q.label}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
          <Segmented label="طريقة التقسيم" value={mode} onChange={setMode} options={[{ value: 'gaps', label: 'سدّ النقص أولاً' }, { value: 'weights', label: 'حسب الأوزان' }]} />
          <Segmented label="التوزيع على الأشهر" value={months} onChange={setMonths} options={[{ value: '1', label: 'دفعة واحدة' }, { value: '3', label: '3 أشهر' }, { value: '6', label: '6 أشهر' }]} />
        </div>
        <p className="tiny muted">{mode === 'gaps' ? 'يذهب المبلغ أولاً للطبقات الناقصة عن هدفها، والباقي حسب الأوزان.' : 'يُقسم المبلغ بنسب الأوزان المستهدفة كما هي.'}{n > 1 ? ' الدفعات الكبيرة على عدة أشهر تقلل أثر توقيت الشراء.' : ''}</p>
      </div>

      {amount > 0 && (
        <section className="section">
          <div className="section-head"><h2>التقسيم المقترح</h2><p>{n > 1 ? `${n} دفعات شهرية` : 'دفعة واحدة'}</p></div>
          <div className="panel">
            {lines.map((l) => (
              <div key={l.sleeve.id} className={`split-row ${l.amount === 0 ? 'zero' : ''}`}>
                <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: colors[l.sleeve.id]?.color, opacity: colors[l.sleeve.id]?.opacity }} />{l.sleeve.name}</div>
                <div className="amt">{num0(l.amount / n)}{n > 1 && <span className="tiny muted"> شهرياً</span>}</div>
                <div className="sub">
                  {!l.sleeve.accepts_new_money ? 'مغلقة أمام الإيداع الجديد حسب الخطة' : <>تصبح {pct(l.afterPct)} والهدف {pct(l.target)}{suggestion(l.sleeve.id) ? `؛ المقترح: ${suggestion(l.sleeve.id)}` : ''}</>}
                </div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 14, gap: 10 }}>
            <button className="btn primary grow" onClick={() => setRecording(true)}>سجّل الإيداع{n > 1 ? ' الأول' : ''}</button>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>التسجيل يحفظ العملية ويضيف الوحدات للأصول اليدوية. أصول IBKR تتحدث تلقائياً من التقرير اليومي.</p>
        </section>
      )}

      {recording && <RecordSheet lines={lines.filter((l) => l.amount > 0)} divisor={n} onClose={() => setRecording(false)} />}
    </>
  )
}

function RecordSheet({ lines, divisor, onClose }: { lines: DepositLine[]; divisor: number; onClose: () => void }) {
  const { holdings, accounts, fx, insertMany, upsert, notify } = useStore()
  const [date, setDate] = useState(todayISO())
  const payroll = new Set(accounts.filter((a) => a.kind === 'savings_program' || a.exclude_from_portfolio).map((a) => a.id))
  const targetsFor = (sleeveId: string) => holdings.filter((h) => h.sleeve_id === sleeveId && !h.archived && !(h.account_id && payroll.has(h.account_id)))
  const [choice, setChoice] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.sleeve.id, targetsFor(l.sleeve.id)[0]?.id ?? ''])))
  const [busy, setBusy] = useState(false)
  const byId = new Map(holdings.map((h) => [h.id, h]))
  const isLump = (h: Holding) => h.price_source === 'manual' && Number(h.quantity) === 1 && Number(h.price) > 50
  const unitsFor = (h: Holding | undefined, amount: number) => {
    if (!h || h.price_source === 'ibkr' || !(Number(h.price) > 0) || isLump(h)) return null
    return amount / (Number(h.price) * rateOf(h.currency, fx))
  }
  const confirm = async () => {
    setBusy(true)
    const rows = lines.map((l) => {
      const amount = Math.round(l.amount / divisor)
      const h = byId.get(choice[l.sleeve.id])
      const units = unitsFor(h, amount)
      return {
        tx_date: date, kind: 'deposit', amount_sar: amount, sleeve_id: l.sleeve.id, holding_id: h?.id ?? null, account_id: h?.account_id ?? null,
        quantity: units, price: h ? Number(h.price) : null, currency: 'SAR', source: 'planner', note: `إيداع موزّع: ${l.sleeve.name}`,
      }
    })
    const ok = await insertMany('transactions', rows)
    if (ok) {
      for (const l of lines) {
        const h = byId.get(choice[l.sleeve.id])
        if (!h || h.price_source === 'ibkr') continue
        const amount = Math.round(l.amount / divisor)
        const units = unitsFor(h, amount)
        if (units != null) await upsert('holdings', { id: h.id, quantity: Number(h.quantity) + units })
        else if (isLump(h)) await upsert('holdings', { id: h.id, price: Number(h.price) + amount / rateOf(h.currency, fx), price_updated_at: new Date().toISOString() })
      }
      notify('سُجّل الإيداع وحُدّثت الأصول')
      onClose()
    }
    setBusy(false)
  }
  return (
    <Sheet title="تسجيل الإيداع" onClose={onClose} footer={<button className="btn primary" disabled={busy} onClick={confirm}>{busy ? 'جارٍ الحفظ…' : 'تأكيد التسجيل'}</button>}>
      <div className="stack">
        <label className="field"><span>تاريخ الإيداع</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        {lines.map((l) => {
          const amount = Math.round(l.amount / divisor)
          const options = targetsFor(l.sleeve.id)
          const h = byId.get(choice[l.sleeve.id])
          const units = unitsFor(h, amount)
          return (
            <div key={l.sleeve.id} className="field">
              <span>{l.sleeve.name}: <b className="figure">{sar(amount)}</b></span>
              <select className="select" value={choice[l.sleeve.id] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [l.sleeve.id]: e.target.value }))}>
                <option value="">سجّل العملية فقط</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <small>{!h ? 'تُسجَّل العملية فقط دون تغيير أي أصل.' : h.price_source === 'ibkr' ? 'يتحدث الرصيد من IBKR بعد الشراء.' : units != null ? `يُضاف نحو ${num2(units)} وحدة.` : isLump(h) ? 'تُضاف القيمة إلى رصيد الأصل.' : 'لا سعر لهذا الأصل بعد؛ حدّث عدد الوحدات بعد الشراء.'}</small>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}
