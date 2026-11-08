// Sheets opened from plan actions (openAction('rebalance' | 'treasury' | 'withdraw' | 'emergency', amount)).
// Each reads the active plan through usePlan() and records through usePlanOps(); viewers see the figures only.
// No forecasting: every figure is the owner's written plan compared with actual balances.
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps } from '../lib/usePlan'
import { rebalancePlan, treasurySalePlan, type RebalanceLine } from '../lib/plan'
import { num2, todayISO } from '../lib/format'
import { haptic, layerColor } from '../lib/ui'
import { NumberField, Segmented, Sheet, TextField } from './ui'
import { Money, Pct } from './kit'
import { IconAlert, IconCheck } from './icons'
import './PlanSheets.css'

export interface PlanSheetProps { param?: string; onClose: () => void }

/** the suggested amount passed with the action (riyals as text) */
const amountOf = (param?: string) => {
  const n = Number(String(param ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}
const r100 = (v: number) => Math.max(0, Math.round(v / 100) * 100)

/** «شهر واحد» · «شهران» · «4 أشهر» · «4.5 أشهر» · «12 شهراً» */
export function monthsText(v: number) {
  const r = Math.round(v * 10) / 10
  if (r === 1) return 'شهر واحد'
  if (r === 2) return 'شهران'
  if (Number.isInteger(r) && r > 10) return `${r} شهراً`
  return `${r} أشهر`
}

/** an allowed range kept left-to-right, e.g. 20–30% */
export const Range = ({ min, max }: { min: number; max: number }) =>
  <bdi dir="ltr">{fmtPct(min)}–{fmtPct(max)}%</bdi>
const fmtPct = (v: number) => (Math.round(v * 10) / 10).toString()

function Stat({ label, children, tone = '' }: { label: string; children: ReactNode; tone?: '' | 'good' | 'bad' | 'warn' }) {
  return <div className={`ps-stat ${tone}`}><span>{label}</span><b>{children}</b></div>
}

function Note({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  return <div className={`ps-note ${tone}`} role="note">{tone === 'accent' ? <IconCheck /> : <IconAlert />}<p>{children}</p></div>
}

function DateInput({ value, onChange, label = 'التاريخ' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <label className="field"><span>{label}</span>
      <input className="input" type="date" value={value} max={todayISO()} onChange={(e) => onChange(e.target.value || todayISO())} />
    </label>
  )
}

function Waiting({ title, onClose }: { title: string; onClose: () => void }) {
  return <Sheet title={title} onClose={onClose}><p className="small muted">لحظة…</p></Sheet>
}

/** close after a successful save (the operation shows its own toast) */
function useSubmit(onClose: () => void) {
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<boolean>) => {
    if (busy) return
    haptic()
    setBusy(true)
    const ok = await fn().catch(() => false)
    setBusy(false)
    if (ok) onClose()
  }
  return [busy, run] as const
}

// =====================================================================================
// إعادة التوازن
// =====================================================================================
export function RebalanceSheet({ param, onClose }: PlanSheetProps) {
  const { readOnly } = useStore()
  const { ctx, doc } = usePlan()
  const [money, setMoney] = useState(() => amountOf(param) ?? 0)
  const plan = useMemo(() => (ctx ? rebalancePlan(ctx, money) : null), [ctx, money])
  if (!ctx || !plan) return <Waiting title="إعادة التوازن" onClose={onClose} />
  const p = ctx.progress
  const crash = !!doc && doc.rules.crash_pct > 0 && p.crashDrawdown >= doc.rules.crash_pct
  const moves = plan.lines.filter((l) => l.action !== 'hold' && l.amount > 0)
    .sort((a, b) => Number(a.action === 'buy') - Number(b.action === 'buy') || b.amount - a.amount)
  const holds = plan.lines.filter((l) => !(l.action !== 'hold' && l.amount > 0) && (l.current > 0 || l.target > 0))
  const toDeposit = () => { onClose(); location.hash = `/deposit/${Math.round(money)}` }

  return (
    <Sheet title="إعادة التوازن" onClose={onClose} footer={readOnly ? undefined : <>
      {money > 0 && <button className="btn primary" onClick={toDeposit}>افتح مخطط الإيداع</button>}
      <button className={`btn ${money > 0 ? 'ghost' : 'primary'}`} onClick={onClose}>تم</button>
    </>}>
      <div className="ps">
        {crash && (
          <Note tone="bad">
            <b>هبوط كبير:</b> {p.crashBasis === 'sleeves' ? 'الأسهم' : 'المحفظة'} دون قمتها بـ <Pct v={p.crashDrawdown} />. خطتك تقول: أعد التوازن الآن.
          </Note>
        )}
        {!readOnly && (
          <NumberField label="مبلغ جديد تضيفه (اختياري)" value={money} suffix="ريال" min={0} onChange={(v) => setMoney(Math.max(0, v))}
            hint={doc?.rules.new_money_first !== false ? 'يذهب أولاً إلى الطبقات الأقل من هدفها' : undefined} />
        )}
        <div className="ps-stats">
          <Stat label="تبيع" tone={plan.sells > 0 ? 'bad' : ''}><Money v={plan.sells} /></Stat>
          <Stat label="تشتري" tone={plan.buys > 0 ? 'good' : ''}><Money v={plan.buys} /></Stat>
        </div>
        {plan.unplaced > 0 && <p className="ps-hint">يبقى <Money v={plan.unplaced} /> نقداً؛ لا طبقة تقبل مالاً جديداً.</p>}

        {moves.length ? (
          <div className="ps-lines" aria-label="العمليات المقترحة">
            {moves.map((l) => <RebalanceRow key={l.key} l={l} />)}
          </div>
        ) : (
          <Note tone="accent">{p.mainValue > 0 ? 'كل الطبقات ضمن نطاقها؛ لا بيع ولا شراء الآن.' : 'أضف أصولك أولاً لتظهر خطة إعادة التوازن.'}</Note>
        )}

        {holds.length > 0 && (
          <details className="more">
            <summary>ضمن النطاق<span className="sum-sub">{holds.length === 1 ? 'طبقة واحدة' : holds.length === 2 ? 'طبقتان' : `${holds.length} طبقات`}</span></summary>
            <div className="more-body" style={{ gap: 0 }}>
              {holds.map((l) => (
                <div key={l.key} className="ps-hold">
                  <span className="nm"><i className="dot" style={{ background: layerColor(l.layer) }} /><span dir="auto">{l.name}</span></span>
                  <span className="muted"><Pct v={l.actual} /> · النطاق <Range min={l.min} max={l.max} /></span>
                </div>
              ))}
            </div>
          </details>
        )}
        {moves.length > 0 && <p className="ps-hint">نفّذ الأوامر لدى الوسيط، ثم حدّث القيم من «تحديث القيم».</p>}
      </div>
    </Sheet>
  )
}

function RebalanceRow({ l }: { l: RebalanceLine }) {
  const sell = l.action === 'sell'
  return (
    <div className="ps-line">
      <span className="nm"><i className="dot" style={{ background: layerColor(l.layer) }} /><span dir="auto">{l.name}</span></span>
      <span className="end"><span className={`ps-chip ${sell ? 'sell' : 'buy'}`}>{sell ? 'بيع' : 'شراء'}</span><Money v={l.amount} /></span>
      <span className="sub">
        الآن <Pct v={l.actual} /> · بعدها <Pct v={l.afterPct} /> · النطاق <Range min={l.min} max={l.max} />
      </span>
      {(l.picks.length > 0 || l.hint) && (
        <span className="picks">
          {l.picks.map((k) => (
            <span key={k.holding.id}>{sell ? 'من' : 'في'} <b dir="auto">{k.holding.name}</b>{l.picks.length > 1 && <> · <Money v={k.amount} /></>}</span>
          ))}
          {!l.picks.length && l.hint && <span>المقترح: <span dir="auto">{l.hint}</span></span>}
        </span>
      )}
    </div>
  )
}

// =====================================================================================
// حساب الدخل
// =====================================================================================
export function TreasurySheet({ param, onClose }: PlanSheetProps) {
  const { readOnly, notify } = useStore()
  const { ctx, doc } = usePlan()
  const ops = usePlanOps()
  const t = ctx?.progress.treasury
  const suggested = amountOf(param) ?? (t ? (t.monthlyMove > 0 ? t.monthlyMove : r100(t.shortfall)) : 0)
  const [mode, setMode] = useState<'sell' | 'deposit'>(param || (t && t.shortfall > 0) ? 'sell' : 'deposit')
  const [amount, setAmount] = useState(suggested)
  const [kind, setKind] = useState<'transfer' | 'deposit'>('transfer')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [busy, submit] = useSubmit(onClose)
  const sale = useMemo(() => (ctx && mode === 'sell' ? treasurySalePlan(ctx, amount) : null), [ctx, mode, amount])
  if (!ctx || !t) return <Waiting title="حساب الدخل" onClose={onClose} />
  const p = ctx.progress

  const record = () => submit(async () => {
    if (!(amount > 0)) { notify('اكتب المبلغ'); return false }
    if (mode === 'sell') {
      if (!sale?.lines.length) { notify('لا أصول يمكن بيعها لهذا المبلغ'); return false }
      return ops.sell(sale.lines, date)
    }
    return ops.toTreasury(amount, date, note.trim() || null, kind)
  })

  return (
    <Sheet title="حساب الدخل" onClose={onClose} footer={readOnly ? undefined : (
      <button className="btn primary" disabled={busy || !(amount > 0) || (mode === 'sell' && !sale?.lines.length)} onClick={record}>
        {busy ? 'جارٍ الحفظ…' : mode === 'sell' ? 'سجّل البيع' : 'أضف إلى الحساب'}
      </button>
    )}>
      <div className="ps">
        <div className="ps-stats">
          <Stat label="في الحساب"><Money v={t.value} /></Stat>
          {t.target > 0 && <Stat label="هدفها"><Money v={t.target} /></Stat>}
        </div>
        {t.target > 0 && <div className="progress" aria-hidden><i style={{ width: `${Math.min(100, (t.value / t.target) * 100)}%` }} /></div>}
        {t.coverMonths != null && (
          <p className="ps-hint">تغطي دخل {monthsText(t.coverMonths)}{doc?.income?.treasury_months ? ` من ${doc.income.treasury_months}` : ''}{t.shortfall > 0.5 && <> · ينقصها <Money v={t.shortfall} /></>}</p>
        )}
        {!doc?.income && <p className="ps-hint">لم تحدّد حساب الدخل في خطتك بعد. {!readOnly && <a href="#/plan/doc" onClick={onClose}>حدّدها</a>}</p>}

        {!readOnly && <>
          <Segmented label="طريقة التعبئة" value={mode} onChange={setMode}
            options={[{ value: 'sell', label: 'بيع من المحفظة' }, { value: 'deposit', label: 'إيداع مباشر' }]} />
          <NumberField label={mode === 'sell' ? 'المبلغ المطلوب' : 'المبلغ'} value={amount} suffix="ريال" min={0} onChange={setAmount}
            hint={mode === 'sell' && t.monthlyMove > 0 && amount !== t.monthlyMove ? <>المقترح هذا الشهر <Money v={t.monthlyMove} /></> : undefined} />
        </>}

        {mode === 'sell' && sale && <>
          {sale.held && (
            <Note>الأسهم دون قمتها بـ <Pct v={p.drawdown} />؛ قاعدة خطتك تمنع بيع أصول النمو والتحوط الآن.</Note>
          )}
          {sale.lines.length > 0 ? (
            <div className="ps-lines" aria-label="ما يُباع">
              {sale.lines.map((l) => (
                <div key={l.holding.id} className="ps-line">
                  <span className="nm"><i className="dot" style={{ background: layerColor(l.sleeve?.layer) }} /><span dir="auto">{l.holding.name}</span></span>
                  <span className="end"><Money v={l.amount} /></span>
                  <span className="sub">{l.sleeve?.name ?? ''}{l.units != null && <> · نحو <bdi dir="ltr">{num2(l.units)}</bdi> وحدة</>}</span>
                </div>
              ))}
              <div className="ps-total"><span>المجموع</span><Money v={sale.total} /></div>
            </div>
          ) : amount > 0 ? <Note>لا أصول يمكن بيعها الآن.</Note> : null}
          {sale.short > 0.5 && sale.lines.length > 0 && <Note>لا يكفي ما يمكن بيعه؛ ينقص <Money v={sale.short} />.</Note>}
          {!readOnly && sale.lines.length > 0 && <>
            <DateInput label="تاريخ البيع" value={date} onChange={setDate} />
            <p className="ps-hint">سجّل البيع بعد تنفيذه لدى الوسيط؛ تنقص الوحدات ويُضاف المبلغ إلى نقد حساب الدخل.</p>
          </>}
        </>}

        {mode === 'deposit' && !readOnly && <>
          <Segmented label="نوع المبلغ" value={kind} onChange={setKind}
            options={[{ value: 'transfer', label: 'توزيع أو تحويل' }, { value: 'deposit', label: 'مال جديد' }]} />
          <TextField label="ملاحظة" value={note} onChange={setNote} placeholder={kind === 'transfer' ? 'مثال: توزيع صندوق الصكوك' : 'مثال: من المكافأة'} />
          <DateInput value={date} onChange={setDate} />
          <p className="ps-hint">{kind === 'deposit' ? 'يُحسب ضمن إيداعات خطتك لهذه السنة.' : 'لا يُحسب إيداعاً جديداً؛ هو مال انتقل إلى حساب الدخل.'}</p>
        </>}
      </div>
    </Sheet>
  )
}

// =====================================================================================
// تحويل الدخل الشهري
// =====================================================================================
export function WithdrawSheet({ param, onClose }: PlanSheetProps) {
  const { readOnly, notify } = useStore()
  const { ctx, doc } = usePlan()
  const ops = usePlanOps()
  const t = ctx?.progress.treasury
  const [amount, setAmount] = useState(() => amountOf(param) ?? (t ? Math.round(t.monthlyIncome) : 0))
  const [date, setDate] = useState(todayISO())
  const [busy, submit] = useSubmit(onClose)
  if (!ctx || !t) return <Waiting title="تحويل الدخل الشهري" onClose={onClose} />
  const after = t.value - amount
  const record = () => submit(async () => {
    if (!(amount > 0)) { notify('اكتب المبلغ'); return false }
    return ops.withdraw(amount, date)
  })

  return (
    <Sheet title="تحويل الدخل الشهري" onClose={onClose} footer={readOnly ? undefined : (
      <button className="btn primary" disabled={busy || !(amount > 0)} onClick={record}>{busy ? 'جارٍ الحفظ…' : 'سجّل التحويل'}</button>
    )}>
      <div className="ps">
        <div className="ps-stats">
          <Stat label="دخلك الشهري حسب خطتك"><Money v={t.monthlyIncome} /></Stat>
          <Stat label="في الحساب"><Money v={t.value} /></Stat>
        </div>
        <p className="ps-hint">
          {t.approved && doc?.state.income_year ? `معتمد في مراجعة ${doc.state.income_year}.`
            : doc?.income?.method === 'fixed' ? 'مبلغ ثابت في خطتك.' : 'تقديري حتى تعتمده في المراجعة السنوية.'}
          {t.transferredThisMonth && ' سجّلت تحويل هذا الشهر من قبل.'}
        </p>
        {!readOnly && <>
          <div className="grid2">
            <NumberField label="المبلغ" value={amount} suffix="ريال" min={0} onChange={setAmount} />
            <DateInput value={date} onChange={setDate} />
          </div>
          <div className={`ps-after ${after < 0 ? 'bad' : ''}`}>
            <span>يبقى في الحساب</span><Money v={Math.max(0, after)} />
          </div>
          {after < 0 && <Note tone="bad">رصيد حساب الدخل لا يكفي لهذا المبلغ.</Note>}
          <p className="ps-hint">يُسجَّل تحويلاً من حساب الدخل إلى حسابك الجاري، ولا يُحسب توزيعاً.</p>
        </>}
      </div>
    </Sheet>
  )
}

// =====================================================================================
// صندوق الطوارئ
// =====================================================================================
export function EmergencySheet({ param, onClose }: PlanSheetProps) {
  const { readOnly, notify } = useStore()
  const { ctx, doc } = usePlan()
  const ops = usePlanOps()
  const e = ctx?.progress.emergency
  const [amount, setAmount] = useState(() => amountOf(param) ?? (e ? r100(e.shortfall) : 0))
  const [date, setDate] = useState(todayISO())
  const [busy, submit] = useSubmit(onClose)
  if (!ctx || !e) return <Waiting title="صندوق الطوارئ" onClose={onClose} />
  const noExpense = !doc?.emergency || !(doc.emergency.monthly_expense > 0)
  const after = e.value + Math.max(0, amount)
  const record = () => submit(async () => {
    if (!(amount > 0)) { notify('اكتب المبلغ'); return false }
    return ops.topUpEmergency(amount, date)
  })

  return (
    <Sheet title="صندوق الطوارئ" onClose={onClose} footer={readOnly ? undefined : (
      <button className="btn primary" disabled={busy || !(amount > 0)} onClick={record}>{busy ? 'جارٍ الحفظ…' : 'أضف المبلغ'}</button>
    )}>
      <div className="ps">
        <div className="ps-stats">
          <Stat label="الرصيد"><Money v={e.value} /></Stat>
          {e.target > 0 && <Stat label="الهدف"><Money v={e.target} /></Stat>}
        </div>
        {e.target > 0 && <div className="progress" aria-hidden><i style={{ width: `${e.pct * 100}%` }} /></div>}
        {(e.coverMonths != null || e.shortfall > 0.5) && e.target > 0 && (
          <p className="ps-hint">
            {e.coverMonths != null && <>يغطي {monthsText(e.coverMonths)}{e.months > 0 ? ` من ${e.months}` : ''}</>}
            {e.coverMonths != null && e.shortfall > 0.5 && ' · '}
            {e.shortfall > 0.5 && <>ينقصه <Money v={e.shortfall} /></>}
          </p>
        )}
        {e.target > 0 && e.shortfall <= 0.5 && <Note tone="accent">اكتمل صندوق الطوارئ.</Note>}
        {noExpense && (
          <p className="ps-hint">حدّد مصروفك الشهري في الخطة ليُحسب الهدف. {!readOnly && <a href="#/plan/doc" onClick={onClose}>حدّده</a>}</p>
        )}
        {!readOnly && <>
          <div className="grid2">
            <NumberField label="المبلغ" value={amount} suffix="ريال" min={0} onChange={setAmount} />
            <DateInput value={date} onChange={setDate} />
          </div>
          {amount > 0 && (
            <div className="ps-after">
              <span>يصبح الرصيد</span>
              <span><Money v={after} />{e.monthlyExpense > 0 && <small> · يغطي {monthsText(after / e.monthlyExpense)}</small>}</span>
            </div>
          )}
          {e.source === 'accounts' && <p className="ps-hint">يُضاف إلى نقد حساباتك خارج المحفظة.</p>}
        </>}
      </div>
    </Sheet>
  )
}
