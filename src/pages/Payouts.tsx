import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { dateLong, monthName, num2, pct, relativeDays, sar, todayISO } from '../lib/format'
import { FREQ_LABEL, isIncomeTx, isoOf, nextPayoutAfter, payoutAnnual, utc, type PayoutItem } from '../lib/income'
import type { Holding } from '../lib/types'
import { MonthBars } from '../components/charts'
import { Empty, NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus } from '../components/icons'
import { HoldingSheet } from './Holdings'

const ym = (iso: string) => iso.slice(0, 7)
const countText = (n: number) => (n === 1 ? 'أداة واحدة' : n === 2 ? 'أداتان' : n >= 3 && n <= 10 ? `${n} أدوات` : `${n} أداة`)
const monthTitle = (key: string) => `${monthName(Number(key.slice(5, 7)) - 1)} ${key.slice(0, 4)}`

export default function Payouts() {
  const { holdings, transactions, sleeves, accounts, fx, readOnly } = useStore()
  const d = useDerived()
  const [recording, setRecording] = useState<Partial<PayoutItem> | null>(null)
  const [editing, setEditing] = useState<Partial<Holding> | null>(null)
  const [horizon, setHorizon] = useState(90)
  const today = todayISO()

  const data = useMemo(() => {
    if (!d) return null
    const items = d.payouts
    const expected = items.filter((p) => p.kind === 'payout').reduce((a, p) => a + (p.amount ?? 0), 0)
    const unknown = [...new Set(items.filter((p) => p.amount == null).map((p) => p.holding))]
    const yearAgo = isoOf(new Date(utc(today).getTime() - 365 * 86400000))
    const received = transactions.filter((t) => isIncomeTx(t) && t.tx_date > yearAgo && t.tx_date <= today)
    const receivedSum = received.reduce((a, t) => a + Number(t.amount_sar), 0)

    // chart: last 6 months received, next 12 expected
    const bars: Array<{ key: string; label: string; short: string; value: number; kind: 'received' | 'expected' }> = []
    const base = utc(today)
    for (let k = -6; k < 12; k++) {
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1, 12))
      const key = isoOf(dt).slice(0, 7)
      const kind = k < 0 ? 'received' : 'expected'
      const value = kind === 'received'
        ? transactions.filter((t) => isIncomeTx(t) && ym(t.tx_date) === key).reduce((a, t) => a + Number(t.amount_sar), 0)
        : items.filter((p) => p.kind === 'payout' && ym(p.date) === key).reduce((a, p) => a + (p.amount ?? 0), 0)
          + (k === 0 ? transactions.filter((t) => isIncomeTx(t) && ym(t.tx_date) === key).reduce((a, t) => a + Number(t.amount_sar), 0) : 0)
      bars.push({ key, label: monthName(dt.getUTCMonth()), short: String(dt.getUTCMonth() + 1), value, kind })
    }

    const instruments = holdings.filter((h) => !h.archived && Number(h.quantity) > 0 && ((h.payout_freq ?? 'none') !== 'none' || h.maturity_date))
    const incomeSleeves = new Set(sleeves.filter((s) => s.layer === 'income' || s.layer === 'safety').map((s) => s.id))
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const missing = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0 && h.sleeve_id && incomeSleeves.has(h.sleeve_id)
      && !(h.account_id && excluded.has(h.account_id)) && (h.payout_freq ?? 'none') === 'none' && !h.maturity_date)

    const groups = new Map<string, typeof received>()
    for (const t of [...received].sort((a, b) => b.tx_date.localeCompare(a.tx_date))) groups.set(ym(t.tx_date), [...(groups.get(ym(t.tx_date)) ?? []), t])
    return { items, expected, unknown, receivedSum, bars, instruments, missing, receivedGroups: [...groups.entries()] }
  }, [d, holdings, transactions, sleeves, accounts, fx, today])

  if (!d || !data) return null
  const upcoming = data.items.filter((p) => p.date <= isoOf(new Date(utc(today).getTime() + horizon * 86400000)))
  const upcomingGroups = [...upcoming.reduce((m, p) => m.set(ym(p.date), [...(m.get(ym(p.date)) ?? []), p]), new Map<string, PayoutItem[]>()).entries()]
  const holdingName = (id: string | null) => holdings.find((h) => h.id === id)?.name ?? 'توزيع'

  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>ما تدفعه لك صناديق الدخل والمرابحة والصكوك وأسهم التوزيعات: ما وصلك، وما ينتظر وصوله ومتى.</p>

      <div className="facts" style={{ marginTop: 0 }}>
        <div className="fact"><div className="v">{sar(data.expected)}</div><div className="l">المتوقع خلال 12 شهراً</div></div>
        <div className="fact"><div className="v">{sar(data.expected / 12)}</div><div className="l">في المتوسط شهرياً</div></div>
        <div className="fact"><div className="v">{sar(data.receivedSum)}</div><div className="l">وصلك آخر 12 شهراً</div></div>
      </div>
      {data.unknown.length > 0 && (
        <p className="small warn" style={{ marginTop: 10 }}>
          {data.unknown.length === 1 ? `«${data.unknown[0].name}» بلا نسبة توزيع` : `${data.unknown.length} أدوات بلا نسبة توزيع`}؛ أكملها ليكتمل المتوقع.
        </p>
      )}

      <section className="section">
        <div className="section-head"><h2>شهراً بشهر</h2></div>
        <div className="panel">
          <MonthBars data={data.bars} title="التوزيعات المستلمة والمتوقعة شهرياً" />
          <div className="legend">
            <span><i style={{ background: 'var(--income)', opacity: 0.45 }} />وصلك</span>
            <span><i style={{ background: 'var(--accent)' }} />المتوقع</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>الدفعات القادمة</h2>
          {!readOnly && <button className="btn ghost small" onClick={() => setRecording({ date: today })}><IconPlus /> سجّل توزيعاً وصلك</button>}
        </div>
        {upcoming.length === 0 ? (
          <div className="panel"><Empty title={data.instruments.length ? `لا دفعات خلال ${horizon} يوماً` : 'لم تُضف أدوات توزيع بعد'}>
            <p className="small" style={{ marginTop: 6 }}>{data.instruments.length ? '' : 'افتح أي صندوق دخل أو صكوك من صفحة المحفظة، وأدخل نسبة توزيعه وموعده، فيظهر هنا تلقائياً.'}</p>
          </Empty></div>
        ) : upcomingGroups.map(([key, list]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div className="row between small muted" style={{ padding: '0 4px 6px' }}>
              <span>{monthTitle(key)}</span>
              <span className="figure">{sar(list.reduce((a, p) => a + (p.kind === 'payout' ? p.amount ?? 0 : 0), 0))}</span>
            </div>
            <div className="panel flush">
              {list.map((p) => {
                const overdue = p.date < today
                return (
                  <div key={p.holding.id + p.date + p.kind} className="list-item" style={{ cursor: 'default' }}>
                    <div style={{ width: 54, flex: 'none', textAlign: 'center' }}>
                      <div className="figure" style={{ fontSize: 19, fontWeight: 600, lineHeight: 1 }}>{Number(p.date.slice(8, 10))}</div>
                      <div className="tiny muted">{relativeDays(p.date)}</div>
                    </div>
                    <div className="grow">
                      <div>{p.holding.name}</div>
                      <div className="meta">{p.kind === 'maturity' ? <span className="chip warn" style={{ padding: '1px 8px' }}>استحقاق: يعود رأس المال</span> : FREQ_LABEL[p.holding.payout_freq]}{overdue ? '، لم يُسجَّل وصوله' : ''}</div>
                    </div>
                    <div className="amount">
                      {p.amount == null ? <span className="small warn">حدّد النسبة</span> : sar(p.amount)}
                      {!readOnly && <div><button className="btn quiet small" style={{ padding: '2px 0', minHeight: 0 }} onClick={() => setRecording(p)}>وصل؟</button></div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {horizon < 365 && data.items.length > upcoming.length && (
          <div className="row" style={{ justifyContent: 'center' }}><button className="btn ghost small" onClick={() => setHorizon(365)}>اعرض السنة كاملة</button></div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>أدوات الدخل</h2><p>{countText(data.instruments.length)}</p></div>
        {data.instruments.length > 0 && (
          <div className="panel flush">
            {data.instruments.map((h) => {
              const annual = payoutAnnual(h, fx)
              const value = holdingValue(h, fx)
              const rateText = h.payout_basis === 'per_unit'
                ? (h.payout_per_unit != null ? `${num2(Number(h.payout_per_unit))} ${h.currency} للوحدة` : 'بلا مبلغ')
                : (h.payout_rate != null ? `${+Number(h.payout_rate).toFixed(2)}%${h.payout_nominal ? ' من القيمة الاسمية' : ''}` : 'بلا نسبة')
              return (
                <button key={h.id} className="list-item" onClick={() => !readOnly && setEditing(h)} style={readOnly ? { cursor: 'default' } : undefined}>
                  <div className="grow">
                    <div>{h.name}</div>
                    <div className="meta">
                      {(h.payout_freq ?? 'none') !== 'none' ? `${FREQ_LABEL[h.payout_freq]}، ${rateText}` : 'بلا توزيعات'}
                      {h.payout_next ? `، القادم ${dateLong(h.payout_next)}` : ''}
                      {h.maturity_date ? `، يستحق ${dateLong(h.maturity_date)}` : ''}
                    </div>
                  </div>
                  <div className="amount">
                    {annual == null ? '—' : sar(annual)}
                    <div className="tiny muted">{annual && value ? `سنوياً، ${pct((annual / value) * 100)} من قيمته` : 'سنوياً'}</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        {data.missing.length > 0 && (
          <div className="panel stack" style={{ marginTop: 12 }}>
            <p className="small">أصول في طبقتي الدخل والأمان لم تُحدَّد توزيعاتها. إن كانت توزّع أرباحاً أكمل بياناتها:</p>
            <div className="row wrap" style={{ gap: 8 }}>
              {data.missing.map((h) => <button key={h.id} className="btn ghost small" disabled={readOnly} onClick={() => setEditing(h)}>{h.name}</button>)}
            </div>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>ما وصلك</h2><p>آخر 12 شهراً</p></div>
        {data.receivedGroups.length === 0 ? (
          <div className="panel"><Empty title="لم يُسجَّل أي توزيع بعد"><p className="small" style={{ marginTop: 6 }}>توزيعات IBKR تُسجَّل تلقائياً، وتوزيعات الراجحي تسجّلها بزر «وصل؟».</p></Empty></div>
        ) : data.receivedGroups.map(([key, list]) => (
          <div key={key} style={{ marginBottom: 12 }}>
            <div className="row between small muted" style={{ padding: '0 4px 6px' }}>
              <span>{monthTitle(key)}</span><span className="figure">{sar(list.reduce((a, t) => a + Number(t.amount_sar), 0))}</span>
            </div>
            <div className="panel flush">
              {list.map((t) => (
                <div key={t.id} className="list-item" style={{ cursor: 'default' }}>
                  <div className="grow"><div>{t.holding_id ? holdingName(t.holding_id) : t.note ?? 'توزيع'}</div><div className="meta">{dateLong(t.tx_date)}{t.source === 'ibkr' ? '، من IBKR' : ''}</div></div>
                  <div className="amount good">+{sar(Number(t.amount_sar))}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {recording && <RecordPayoutSheet initial={recording} onClose={() => setRecording(null)} />}
      {editing && <HoldingSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function RecordPayoutSheet({ initial, onClose }: { initial: Partial<PayoutItem>; onClose: () => void }) {
  const { holdings, upsert, notify } = useStore()
  const options = holdings.filter((h) => !h.archived)
  const [holdingId, setHoldingId] = useState(initial.holding?.id ?? options[0]?.id ?? '')
  const [date, setDate] = useState(initial.date && initial.date <= todayISO() ? initial.date : todayISO())
  const [amount, setAmount] = useState(Math.round(initial.amount ?? 0))
  const [close, setClose] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const maturity = initial.kind === 'maturity'
  const h = holdings.find((x) => x.id === holdingId)

  const confirm = async () => {
    if (!h || !(amount > 0)) { notify('اختر الأصل واكتب المبلغ'); return }
    setBusy(true)
    const ok = await upsert('transactions', {
      tx_date: date, kind: maturity ? 'sell' : 'dividend', amount_sar: amount, holding_id: h.id, account_id: h.account_id, sleeve_id: h.sleeve_id,
      currency: 'SAR', source: 'manual', note: note || (maturity ? 'استحقاق واسترداد رأس المال' : 'توزيع نقدي'),
    })
    if (ok) {
      if (maturity && close) await upsert('holdings', { id: h.id, quantity: 0, archived: true })
      else if (!maturity && initial.date && h.payout_next === initial.date) await upsert('holdings', { id: h.id, payout_next: nextPayoutAfter(h, initial.date) })
      notify(maturity ? 'سُجّل الاستحقاق' : 'سُجّل التوزيع')
      onClose()
    }
    setBusy(false)
  }
  return (
    <Sheet title={maturity ? 'تسجيل استحقاق' : 'تسجيل توزيع وصلك'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={confirm}>{busy ? 'جارٍ الحفظ…' : 'تأكيد'}</button>}>
      <div className="stack">
        <SelectField label="من" value={holdingId} onChange={setHoldingId} options={options.map((x) => ({ value: x.id, label: x.name }))} />
        <div className="grid2">
          <NumberField label="المبلغ الذي وصلك" value={amount} suffix="ريال" onChange={setAmount} />
          <label className="field"><span>تاريخ الوصول</span><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {initial.amount != null && initial.amount !== undefined && Math.abs(Math.round(initial.amount) - amount) > 1 && (
          <p className="small muted">المتوقع كان {sar(initial.amount)}. سجّل المبلغ الفعلي كما وصلك.</p>
        )}
        {maturity && <Switch label="أغلق الأصل بعد الاستحقاق" hint="يُصفَّر عدد الوحدات ويُنقل إلى الأرشيف" checked={close} onChange={setClose} />}
        {!maturity && h && h.payout_next === initial.date && <p className="small muted">بعد التسجيل ينتقل موعد التوزيع القادم إلى {dateLong(nextPayoutAfter(h, initial.date!))}.</p>}
        <TextField label="ملاحظة" value={note} onChange={setNote} />
        <p className="tiny muted">إن بقي المبلغ نقداً في حسابك فأضفه إلى رصيد السيولة من صفحة المحفظة.</p>
      </div>
    </Sheet>
  )
}
