import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { planDeposit, rateOf, type DepositLine } from '../lib/calc'
import { num0, num2, parseNum, pct, sar, todayISO } from '../lib/format'
import type { Goal, Holding } from '../lib/types'
import { NumberField, Segmented, Sheet, Switch } from '../components/ui'

export default function Deposit() {
  const { settings, sleeves, holdings, accounts } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const [text, setText] = useState('10,000')
  const [mode, setMode] = useState<'gaps' | 'weights'>('gaps')
  const [months, setMonths] = useState<'1' | '3' | '6'>('1')
  const [recording, setRecording] = useState(false)
  const [useGoals, setUseGoals] = useState(true)
  const [goalOverride, setGoalOverride] = useState<Record<string, number>>({})
  const amount = parseNum(text)
  const n = Number(months)
  const goalLines = useMemo(() => {
    if (!d || !useGoals || amount <= 0) return [] as Array<{ goal: Goal; amount: number; suggested: number }>
    let left = amount
    return [...d.goalStats].sort((a, b) => a.goal.priority - b.goal.priority).map((g) => {
      const gap = Math.max(0, Number(g.goal.target_amount) - g.value)
      const suggested = Math.round(Math.min(g.need * n, gap) / 100) * 100
      const want = goalOverride[g.goal.id] ?? suggested
      const take = Math.max(0, Math.min(want, left))
      left -= take
      return { goal: g.goal, amount: take, suggested }
    }).filter((l) => l.amount > 0 || goalOverride[l.goal.id] != null)
  }, [d, useGoals, amount, n, goalOverride])
  const goalsTotal = goalLines.reduce((a, l) => a + l.amount, 0)
  const fiAmount = Math.max(0, amount - goalsTotal)
  const lines = useMemo(() => (d && settings && fiAmount > 0 ? planDeposit(fiAmount, sleeves, d.totals, settings, mode) : []), [fiAmount, sleeves, d, settings, mode])
  if (!settings || !d) return null
  const quick = [2000, 5000, 10000, 20000].map((v) => ({ label: num0(v), v }))
  const suggestion = (sleeveId: string) => {
    const note = sleeves.find((s) => s.id === sleeveId)?.note
    if (note) return note
    return holdings.find((h) => h.sleeve_id === sleeveId && !h.archived && !/برنامج الادخار/.test(h.name))?.name ?? ''
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>اكتب المبلغ الذي ستستثمره، وأقسّمه لك على الطبقات بحيث تقترب المحفظة من أوزانها المستهدفة.</p>
      <div className="panel amount-hero">
        <label htmlFor="amt" className="small muted">مبلغ الإيداع بالريال</label>
        <input id="amt" className="amount-input" inputMode="decimal" value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setText(amount ? num0(amount) : '')} />
        <div className="quick">
          {quick.map((q) => <button key={q.label} className="btn ghost small" onClick={() => setText(num0(q.v))}>{q.label}</button>)}
        </div>
        <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
          <Segmented label="طريقة التقسيم" value={mode} onChange={setMode} options={[{ value: 'gaps', label: 'سدّ النقص أولاً' }, { value: 'weights', label: 'حسب الأوزان' }]} />
          <Segmented label="التوزيع على الأشهر" value={months} onChange={setMonths} options={[{ value: '1', label: 'دفعة واحدة' }, { value: '3', label: '3 أشهر' }, { value: '6', label: '6 أشهر' }]} />
        </div>
        <p className="tiny muted">{mode === 'gaps' ? 'يذهب المبلغ أولاً للطبقات الناقصة عن هدفها، والباقي حسب الأوزان.' : 'يُقسم المبلغ بنسب الأوزان المستهدفة كما هي.'}{n > 1 ? ' الدفعات الكبيرة على عدة أشهر تقلل أثر توقيت الشراء.' : ''}</p>
      </div>

      {amount > 0 && d.goalStats.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>نصيب الأهداف</h2><p>{sar(goalsTotal)}</p></div>
          <div className="panel stack">
            <Switch label="خصّص جزءاً لأهدافك أولاً" hint="المقترح لكل هدف ما يحتاجه شهرياً ليصل في موعده" checked={useGoals} onChange={setUseGoals} />
            {useGoals && goalLines.map((l) => (
              <div key={l.goal.id} className="row" style={{ gap: 10, alignItems: 'flex-end' }}>
                <div className="grow"><div>{l.goal.name}</div><div className="tiny muted">المقترح {sar(l.suggested)}</div></div>
                <div style={{ width: 150 }}><NumberField label="" value={l.amount} suffix="ريال" onChange={(v) => setGoalOverride((o) => ({ ...o, [l.goal.id]: v }))} /></div>
              </div>
            ))}
            {useGoals && goalLines.length === 0 && <p className="small muted">أهدافك لا تحتاج إيداعاً الآن.</p>}
          </div>
        </section>
      )}

      {amount > 0 && (
        <section className="section">
          <div className="section-head"><h2>{goalsTotal > 0 ? 'لالمحفظة الرئيسية' : 'التقسيم المقترح'}</h2><p>{goalsTotal > 0 ? sar(fiAmount) : n > 1 ? `${n} دفعات شهرية` : 'دفعة واحدة'}</p></div>
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
            <button className="btn primary grow" disabled={!lines.some((l) => l.amount > 0) && !goalLines.some((l) => l.amount > 0)} onClick={() => setRecording(true)}>سجّل الإيداع{n > 1 ? ' الأول' : ''}</button>
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>التسجيل يحفظ العملية ويضيف الوحدات للأصول اليدوية.{accounts.some((x) => x.is_ibkr) ? ' أصول IBKR تتحدث تلقائياً من التقرير اليومي.' : ''}</p>
        </section>
      )}

      {recording && <RecordSheet lines={lines.filter((l) => l.amount > 0)} goalLines={goalLines.filter((l) => l.amount > 0)} divisor={n} onClose={() => setRecording(false)} />}
    </>
  )
}

function RecordSheet({ lines, goalLines, divisor, onClose }: { lines: DepositLine[]; goalLines: Array<{ goal: Goal; amount: number }>; divisor: number; onClose: () => void }) {
  const { holdings, accounts, fx, insertMany, upsert, notify } = useStore()
  const [date, setDate] = useState(todayISO())
  const payroll = new Set(accounts.filter((a) => a.kind === 'savings_program' || a.exclude_from_portfolio).map((a) => a.id))
  const targetsFor = (sleeveId: string) => holdings.filter((h) => h.sleeve_id === sleeveId && !h.archived && !(h.account_id && payroll.has(h.account_id)))
  const goalTargets = (goalId: string) => holdings.filter((h) => h.goal_id === goalId && !h.archived)
  const [choice, setChoice] = useState<Record<string, string>>(() => Object.fromEntries([
    ...lines.map((l) => [l.sleeve.id, targetsFor(l.sleeve.id)[0]?.id ?? '']),
    ...goalLines.map((l) => [`g:${l.goal.id}`, goalTargets(l.goal.id)[0]?.id ?? '']),
  ]))
  const [busy, setBusy] = useState(false)
  const byId = new Map(holdings.map((h) => [h.id, h]))
  const isLump = (h: Holding) => h.price_source === 'manual' && Number(h.quantity) === 1 && Number(h.price) > 50
  const unitsFor = (h: Holding | undefined, amount: number) => {
    if (!h || h.price_source === 'ibkr' || !(Number(h.price) > 0) || isLump(h)) return null
    return amount / (Number(h.price) * rateOf(h.currency, fx))
  }
  /** what was paid grows with each deposit; unknown stays unknown unless the holding started empty */
  const costAfter = (h: Holding, amount: number) => (h.cost_basis != null || Number(h.quantity) === 0 ? (Number(h.cost_basis) || 0) + amount : null)
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
    for (const l of goalLines) {
      const amount = Math.round(l.amount / divisor)
      const h = byId.get(choice[`g:${l.goal.id}`])
      rows.push({
        tx_date: date, kind: 'deposit', amount_sar: amount, sleeve_id: null as never, holding_id: h?.id ?? null, account_id: h?.account_id ?? null,
        quantity: unitsFor(h, amount), price: h ? Number(h.price) : null, currency: 'SAR', source: 'planner', note: `إيداع لهدف: ${l.goal.name}`,
      })
    }
    const ok = await insertMany('transactions', rows)
    if (ok) {
      for (const l of goalLines) {
        const h = byId.get(choice[`g:${l.goal.id}`])
        if (!h || h.price_source === 'ibkr') continue
        const amount = Math.round(l.amount / divisor)
        const units = unitsFor(h, amount)
        if (units != null) await upsert('holdings', { id: h.id, quantity: Number(h.quantity) + units, cost_basis: costAfter(h, amount) })
        else if (isLump(h)) await upsert('holdings', { id: h.id, price: Number(h.price) + amount / rateOf(h.currency, fx), price_updated_at: new Date().toISOString(), cost_basis: costAfter(h, amount) })
      }
      for (const l of lines) {
        const h = byId.get(choice[l.sleeve.id])
        if (!h || h.price_source === 'ibkr') continue
        const amount = Math.round(l.amount / divisor)
        const units = unitsFor(h, amount)
        if (units != null) await upsert('holdings', { id: h.id, quantity: Number(h.quantity) + units, cost_basis: costAfter(h, amount) })
        else if (isLump(h)) await upsert('holdings', { id: h.id, price: Number(h.price) + amount / rateOf(h.currency, fx), price_updated_at: new Date().toISOString(), cost_basis: costAfter(h, amount) })
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
        {goalLines.map((l) => {
          const amount = Math.round(l.amount / divisor)
          const options = goalTargets(l.goal.id)
          return (
            <div key={l.goal.id} className="field">
              <span>هدف {l.goal.name}: <b className="figure">{sar(amount)}</b></span>
              <select className="select" value={choice[`g:${l.goal.id}`] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [`g:${l.goal.id}`]: e.target.value }))}>
                <option value="">سجّل العملية فقط</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              {!options.length && <small>لا أصول لهذا الهدف بعد؛ أضفها من صفحة الأهداف.</small>}
            </div>
          )
        })}
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
