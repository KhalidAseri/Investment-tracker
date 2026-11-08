// «أين أضع إيداعي؟»: the deposit planner. An amount → how much goes to each layer and reserve, WHICH instrument to buy for
// each line (with the sukuk tenor and ≈ units at today's price), and «اشتريته» to record each purchase (BuySheet).
// The split is the advisor's (allocateDeposit): reserves first, then the sleeves with the largest gaps, in a few lines.
import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan } from '../lib/usePlan'
import { useMarketInputs } from '../lib/market'
import type { DepositLine } from '../lib/advisor'
import { LAYER_NAMES } from '../lib/calc'
import { num0, parseNum } from '../lib/format'
import { buyParam, haptic, layerColor, openAction } from '../lib/ui'
import type { Layer } from '../lib/types'
import { Card, Money, StackBar } from '../components/kit'
import { Switch } from '../components/ui'
import { InstrumentCard } from '../components/InstrumentCard'
import { IconAlert, IconSparkle } from '../components/icons'
import './Deposit.css'

/** an amount passed in the route (#/deposit/<riyals>), e.g. from a plan action or the rebalance sheet */
const amountFrom = (param?: string) => { const n = Number(String(param ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(n) && n > 0 ? Math.round(n) : null }

type Seg = 'emergency' | 'treasury' | Layer
const SEG_NAME: Record<Seg, string> = { emergency: 'الطوارئ', treasury: 'حساب الدخل', ...LAYER_NAMES }
const SEG_COLOR: Record<Seg, string> = { emergency: 'var(--accent)', treasury: 'var(--mint)', growth: layerColor('growth'), income: layerColor('income'), safety: layerColor('safety'), hedge: layerColor('hedge') }
const SEG_ORDER: Seg[] = ['emergency', 'treasury', 'growth', 'income', 'safety', 'hedge']
const segOf = (l: DepositLine): Seg => (l.kind === 'emergency' ? 'emergency' : l.kind === 'treasury' ? 'treasury' : (l.layer as Layer))

export default function Deposit({ param }: { param?: string }) {
  const market = useMarketInputs()
  const view = usePlan(market)
  const { readOnly } = useStore()
  const p = view.progress
  const planned = view.doc && p ? Math.max(0, Math.round(p.contributions.plannedThisMonth - p.contributions.actualThisMonth)) : 0
  const [text, setText] = useState(() => num0(amountFrom(param) ?? (planned > 0 ? planned : 10000)))
  const [reserveFirst, setReserveFirst] = useState(true)
  const amount = parseNum(text)
  const plan = useMemo(() => (amount > 0 ? view.allocate(amount, market, { reserveFirst }) : null), [view, amount, market, reserveFirst])
  if (!view.ctx) return null

  const chips = [
    ...(planned > 0 ? [{ label: 'خطتك هذا الشهر', v: planned }] : []),
    ...[5000, 10000, 50000].filter((v) => v !== planned).map((v) => ({ label: num0(v), v })),
  ]
  const segs = plan ? SEG_ORDER.map((k) => ({ k, v: plan.lines.filter((l) => segOf(l) === k).reduce((a, l) => a + l.amount, 0) })).filter((x) => x.v > 0) : []
  const hasReserve = !!p && ((p.emergency.target > 0 && p.emergency.shortfall > 0.5) || (!!view.doc?.income && p.treasury.building && p.treasury.shortfall > 0.5))

  return (
    <div className="dp">
      {!view.doc && !readOnly && (
        <a className="dp-invite" href="#/design" onClick={() => haptic()}>
          <span className="ico"><IconSparkle /></span>
          <p><b>صمّم خطتي</b><small>بلا خطة يُقسَّم المبلغ على أوزانك الحالية فقط</small></p>
        </a>
      )}

      <section className="card dp-amount">
        <label htmlFor="dp-amt" className="small muted">المبلغ الذي ستستثمره</label>
        <div className="dp-input">
          <input id="dp-amt" className="amount-input" inputMode="decimal" value={text}
            onChange={(e) => setText(e.target.value)} onBlur={() => setText(amount ? num0(amount) : '')} onFocus={(e) => e.target.select()} />
          <span>ريال</span>
        </div>
        <div className="dp-chips">
          {chips.map((c) => (
            <button key={c.label} type="button" aria-pressed={amount === c.v} onClick={() => { haptic(); setText(num0(c.v)) }}>
              {c.label === num0(c.v) ? <bdi dir="ltr">{c.label}</bdi> : <>{c.label} <Money v={c.v} short /></>}
            </button>
          ))}
        </div>
        {(view.doc || hasReserve) && (
          <Switch label="الطوارئ أولاً" hint={hasReserve ? 'يكتمل صندوق الطوارئ وحساب الدخل قبل الاستثمار' : 'الاحتياطيات مكتملة الآن'} checked={reserveFirst} onChange={(v) => { haptic(); setReserveFirst(v) }} />
        )}
      </section>

      {plan && plan.lines.length > 0 && (
        <Card className="dp-sum" title="التقسيم">
          <StackBar parts={segs.map((s) => ({ key: s.k, value: s.v, color: SEG_COLOR[s.k], label: SEG_NAME[s.k] }))} />
          <div className="dp-legend">
            {segs.map((s) => (
              <span key={s.k}><i style={{ background: SEG_COLOR[s.k] }} />{SEG_NAME[s.k]}<b><Money v={s.v} /></b></span>
            ))}
            {plan.leftover > 0 && <span><i style={{ background: 'var(--line-strong)' }} />يبقى نقداً<b><Money v={plan.leftover} /></b></span>}
          </div>
        </Card>
      )}

      {plan && plan.lines.map((l, i) => lineCard(l, i + 1))}

      {plan && plan.notes.length > 0 && (
        <div className="dp-notes">
          {plan.notes.map((n) => <p key={n}><IconAlert />{n}</p>)}
        </div>
      )}
      {plan && !plan.lines.length && <div className="card"><p className="small muted">لا توجد طبقة تستقبل هذا المبلغ الآن.</p></div>}
      {!plan && <div className="card"><p className="small muted">اكتب المبلغ لترى أين تضعه.</p></div>}
      {plan && plan.lines.length > 0 && <p className="dp-foot">اشترِ كل سطر لدى منصته، ثم اضغط «اشتريته» ليتابعه التطبيق تلقائياً.</p>}
    </div>
  )

  function lineCard(l: DepositLine, n: number) {
    const color = SEG_COLOR[segOf(l)]
    const scale = Math.max(l.after, l.targetAfter, 1)
    const wasPct = (l.before / scale) * 100
    const addPct = (l.amount / scale) * 100
    const tgtPct = (l.targetAfter / scale) * 100
    const pick = l.pick
    return (
      <section key={l.key} className="card dp-line" style={{ ['--c' as string]: color }}>
        <div className="dp-line-head">
          <span className="dp-n">{n}</span>
          <div className="grow">
            <span className="dp-kind">{SEG_NAME[segOf(l)]}</span>
            <b>{l.name}</b>
          </div>
          <span className="dp-amt"><Money v={l.amount} /></span>
        </div>
        <InstrumentCard pick={pick} market={market} amount={l.amount} />
        {l.targetAfter > 0 && (
          <div className="dp-fill">
            <div className="dp-track" role="img" aria-label="القيمة قبل الإيداع وبعده مقارنة بالهدف">
              <i className="was" style={{ width: `${Math.min(100, wasPct)}%` }} />
              <i className="add" style={{ insetInlineStart: `${Math.min(100, wasPct)}%`, width: `${Math.min(100 - Math.min(100, wasPct), addPct)}%` }} />
              <i className="tgt" style={{ insetInlineStart: `${Math.min(100, tgtPct)}%` }} />
            </div>
            <small><Money v={l.before} short /> ← <Money v={l.after} short /> · الهدف <Money v={l.targetAfter} short /></small>
          </div>
        )}
        {l.note && <p className="dp-note">{l.note}</p>}
        {!readOnly && (
          <button type="button" className="btn primary block" onClick={() => openAction('buy', buyParam({ key: l.key, amount: l.amount }))}>اشتريته</button>
        )}
      </section>
    )
  }
}
