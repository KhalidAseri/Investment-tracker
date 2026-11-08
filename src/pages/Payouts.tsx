// «الدخل»: the income account and how much to take each month, periodic income sources and maturities, expected and received
// payouts, zakat by each holding's method, and purification.
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ZAKAT_RATE, holdingValue, zakatEstimate, zakatRuleOf, type ZakatOpts } from '../lib/calc'
import { dateLong, dateShort, monthName, num0, num2, pct, relativeDays, sar, todayISO } from '../lib/format'
import {
  FREQ_LABEL, daysBetween, hijriLabel, incomeTxIn, isoOf, nominalValue, payoutAnnual, payoutPerPayment, treasuryHoldingIds, utc, zakatSchedule, type PayoutItem,
} from '../lib/income'
import { usePlan, usePlanOps } from '../lib/usePlan'
import { activePlanDoc } from '../lib/market'
import { ASSET_CLASS_LABEL, type AssetClass } from '../lib/catalog'
import { holdingClass, holdingContext } from '../lib/lookthrough'
import { purification } from '../lib/wealth'
import type { Holding, Transaction } from '../lib/types'
import { MonthBars } from '../components/charts'
import { NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { Avatar, Chev, DateBadge, Empty, Money, Pct } from '../components/kit'
import { IconAlert, IconCoins, IconPlus } from '../components/icons'
import { IncomeAccount } from '../components/IncomeAccount'
import { SafeIncome } from '../components/SafeIncome'
import { ZakatMethodSheet, zakatMethodText } from '../components/ZakatMethodSheet'
import { assetColor, haptic, openAction, useCountUp } from '../lib/ui'
import './Payouts.css'

type Tab = 'next' | 'got'
type Freq = Holding['payout_freq']

const DAY = 86400000
const STEP: Record<Freq, number> = { none: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }
const ym = (iso: string) => iso.slice(0, 7)
const monthTitle = (key: string) => `${monthName(Number(key.slice(5, 7)) - 1)} ${key.slice(0, 4)}`
const addDays = (iso: string, n: number) => isoOf(new Date(utc(iso).getTime() + n * DAY))
/** iso + n months, the day kept within the month (same rule as the payout schedule) */
function addMonths(iso: string, n: number) {
  const b = utc(iso)
  const y = b.getUTCFullYear(), m = b.getUTCMonth() + n
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return isoOf(new Date(Date.UTC(y, m, Math.min(b.getUTCDate(), last), 12)))
}
const assetHref = (id: string) => `#/asset/${encodeURIComponent(id)}`
const openAsset = (id: string) => { haptic(); location.hash = `/asset/${encodeURIComponent(id)}` }
const counted = (n: number, one: string, two: string, few: string, many: string) =>
  (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`)
const toolsText = (n: number) => counted(n, 'أداة واحدة', 'أداتان', 'أدوات', 'أداة')
const assetsText = (n: number) => counted(n, 'أصل واحد', 'أصلان', 'أصول', 'أصلاً')
const forAssets = (n: number) => (n === 1 ? 'لأصل واحد' : n === 2 ? 'لأصلين' : n <= 10 ? `لـ ${n} أصول` : `لـ ${n} أصلاً`)
const payoutsOf = (h: Holding) => (h.payout_freq ?? 'none') !== 'none'

function byMonth<T>(list: T[], dateOf: (x: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>()
  for (const x of list) m.set(ym(dateOf(x)), [...(m.get(ym(dateOf(x))) ?? []), x])
  return [...m.entries()]
}

/**
 * After a payment is recorded: if it matches a scheduled date (within half a period),
 * the next payment date moves to the one after it. Null when nothing should change.
 */
function nextAfterPayment(h: Holding, paidISO: string): string | null {
  const step = STEP[h.payout_freq ?? 'none']
  if (!step || !h.payout_next) return null
  let bestK = 0, bestGap = Infinity
  for (let k = 0; k < 1200; k++) {
    const d = addMonths(h.payout_next, k * step)
    const gap = Math.abs(daysBetween(paidISO, d))
    if (gap < bestGap) { bestGap = gap; bestK = k }
    if (d > paidISO) break
  }
  return bestGap <= step * 15 ? addMonths(h.payout_next, (bestK + 1) * step) : null
}

/** A list row; the title links to the asset page and the whole row is the tap target. */
function Row({ start, title, href, sub, end, className = '' }: {
  start: ReactNode; title: string; href?: string; sub: ReactNode; end: ReactNode; className?: string
}) {
  return (
    <div className={`ri inc-row ${href ? 'link' : ''} ${className}`}>
      {start}
      <span className="ri-main">
        {href ? <a className="inc-link" href={href} onClick={() => haptic()}><b>{title}</b></a> : <b>{title}</b>}
        <span>{sub}</span>
      </span>
      <span className="ri-end">{end}</span>
    </div>
  )
}

const FREQ_ORDER: Freq[] = ['monthly', 'quarterly', 'semiannual', 'annual']
/** the next payment date on or after today, rolling a past payout_next forward by its frequency */
function nextPayDate(h: Holding, today: string): string | null {
  const step = STEP[h.payout_freq ?? 'none']
  if (!step || !h.payout_next) return null
  let d = h.payout_next
  for (let k = 1; d < today && k < 1200; k++) d = addMonths(h.payout_next, k * step)
  return h.maturity_date && d > h.maturity_date ? null : d
}

export default function Payouts() {
  const { holdings, transactions, sleeves, accounts, goals, fx, readOnly } = useStore()
  const d = useDerived()
  const plan = usePlan()
  const [tab, setTab] = useState<Tab>('next')
  const [recording, setRecording] = useState<Partial<PayoutItem> | null>(null)
  const [horizon, setHorizon] = useState(90)
  const [olderToo, setOlderToo] = useState(false)
  const today = todayISO()

  const data = useMemo(() => {
    if (!d) return null
    const yearAgo = addDays(today, -365)
    // received income only: a monthly transfer out of the income account is not a distribution
    const isIncomeTx = incomeTxIn(treasuryHoldingIds(holdings, goals))
    const incomeTx = transactions.filter(isIncomeTx)
    const received = incomeTx.filter((t) => t.tx_date > yearAgo && t.tx_date <= today)
    const receivedSum = received.reduce((a, t) => a + Number(t.amount_sar), 0)
    const expected = d.payouts.filter((p) => p.kind === 'payout').reduce((a, p) => a + (p.amount ?? 0), 0)

    const live = holdings.filter((h) => !h.archived && Number(h.quantity) > 0)
    // periodic income sources, by frequency
    const paying = live.filter(payoutsOf)
    let annual = 0, payingValue = 0
    const sources = paying.map((h) => {
      const a = payoutAnnual(h, fx)
      const v = holdingValue(h, fx)
      if (a != null && a > 0 && v > 0) { annual += a; payingValue += v }
      return { h, annual: a, value: v, yield: a != null && v > 0 ? (a / v) * 100 : null, next: nextPayDate(h, today) }
    })
    const groups = FREQ_ORDER.map((f) => {
      const list = sources.filter((s) => s.h.payout_freq === f).sort((x, y) => (y.annual ?? -1) - (x.annual ?? -1))
      return { freq: f, list, sum: list.reduce((t, s) => t + (s.annual ?? 0), 0) }
    }).filter((g) => g.list.length)
    const yieldPct = payingValue > 0 ? (annual / payingValue) * 100 : null
    const unknown = paying.filter((h) => payoutAnnual(h, fx) == null)

    // maturities in the next 24 months
    const until = addDays(today, 730)
    const maturities = live.filter((h) => h.maturity_date && h.maturity_date >= today && h.maturity_date <= until)
      .map((h) => ({ h, date: h.maturity_date as string, amount: nominalValue(h, fx) }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // payments whose date has passed with nothing recorded for them yet
    const paidSince = (h: Holding, from: string, kind: (t: Transaction) => boolean) =>
      transactions.some((t) => t.holding_id === h.id && kind(t) && t.tx_date >= from)
    const awaiting: PayoutItem[] = []
    for (const h of live) {
      if (h.maturity_date && h.maturity_date < today) {
        if (!paidSince(h, addDays(h.maturity_date, -10), (t) => t.kind === 'sell')) {
          awaiting.push({ holding: h, date: h.maturity_date, amount: nominalValue(h, fx), kind: 'maturity' })
        }
        continue
      }
      const freq = h.payout_freq ?? 'none'
      if (freq === 'none' || !h.payout_next || h.payout_next >= today) continue
      let last = h.payout_next
      for (let k = 1; k < 1200; k++) { const x = addMonths(h.payout_next, k * STEP[freq]); if (x >= today) break; last = x }
      if (daysBetween(last, today) <= 60 && !paidSince(h, addDays(last, -10), isIncomeTx)) {
        awaiting.push({ holding: h, date: last, amount: payoutPerPayment(h, fx), kind: 'payout' })
      }
    }
    awaiting.sort((a, b) => a.date.localeCompare(b.date))

    // chart: the last 6 months received, then the next 12 expected
    const bars: Array<{ key: string; label: string; short: string; value: number; kind: 'received' | 'expected' }> = []
    const base = utc(today)
    const gotIn = (key: string) => incomeTx.filter((t) => ym(t.tx_date) === key).reduce((a, t) => a + Number(t.amount_sar), 0)
    for (let k = -6; k < 12; k++) {
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + k, 1, 12))
      const key = isoOf(dt).slice(0, 7)
      const value = k < 0 ? gotIn(key)
        : d.payouts.filter((p) => p.kind === 'payout' && ym(p.date) === key).reduce((a, p) => a + (p.amount ?? 0), 0) + (k === 0 ? gotIn(key) : 0)
      bars.push({ key, label: monthName(dt.getUTCMonth()), short: String(dt.getUTCMonth() + 1), value, kind: k < 0 ? 'received' : 'expected' })
    }

    // holdings in the income and safety layers with no payout details yet
    const incomeSleeves = new Set(sleeves.filter((s) => s.layer === 'income' || s.layer === 'safety').map((s) => s.id))
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const missing = live.filter((h) => holdingValue(h, fx) > 0 && h.sleeve_id && incomeSleeves.has(h.sleeve_id)
      && !(h.account_id && excluded.has(h.account_id)) && !payoutsOf(h) && !h.maturity_date)

    return {
      expected, received, receivedSum, incomeTx, hasOlder: incomeTx.some((t) => t.tx_date <= yearAgo),
      annual, yieldPct, unknown, groups, maturities, awaiting, bars, missing, sourceCount: paying.length,
    }
  }, [d, holdings, transactions, sleeves, accounts, goals, fx, today])

  const shown = useCountUp(data?.expected ?? 0)
  if (!d || !data) return null

  const owner = !readOnly
  const until = addDays(today, horizon)
  const ahead = d.payouts.filter((p) => p.date <= until)
  const hiddenCount = d.payouts.length - ahead.length
  const quickUntil = addDays(today, 15)
  const record = (p: Partial<PayoutItem>) => { haptic(); setRecording(p) }
  const nameOf = (id: string | null) => holdings.find((h) => h.id === id)
  const hasAny = data.sourceCount > 0 || data.incomeTx.length > 0 || data.maturities.length > 0
  const rateWord = owner ? <span className="inc-warn">حدّد النسبة</span> : <span className="inc-none">بلا نسبة</span>
  const avatar = (h: Holding) => <Avatar name={h.name} symbol={h.symbol && h.price_source === 'yahoo' ? h.symbol : null} color={assetColor(h, sleeves)} size={38} />

  const payRow = (p: PayoutItem, late = false) => (
    <Row key={p.holding.id + p.date + p.kind} className={late ? 'late' : ''}
      start={<DateBadge iso={p.date} today={today} />}
      title={p.holding.name} href={assetHref(p.holding.id)}
      sub={<>{p.kind === 'maturity' ? <em className="inc-tag">استحقاق</em> : FREQ_LABEL[p.holding.payout_freq]} · {relativeDays(p.date)}</>}
      end={<>
        {p.amount == null ? rateWord : <Money v={p.amount} />}
        {owner && (late || p.date <= quickUntil) && (
          <button type="button" className="inc-got" aria-label={`سجّل وصول ${p.kind === 'maturity' ? 'استحقاق' : 'توزيع'} ${p.holding.name}`} onClick={() => record(p)}>وصل؟</button>
        )}
      </>} />
  )

  const missingChips = owner && data.missing.length > 0 && (
    <div className="inc-foot">
      <span className="small muted">في طبقتي الدخل والأمان، بلا بيانات توزيع:</span>
      <div className="inc-chips">
        {data.missing.map((h) => <a key={h.id} className="chip" href={assetHref(h.id)} onClick={() => haptic()}><IconPlus />{h.name}</a>)}
      </div>
    </div>
  )

  const upcoming = (
    <>
      {data.awaiting.length > 0 && (
        <div>
          <div className="inc-month warn"><b>لم يُسجَّل وصوله</b><span>{toolsText(data.awaiting.length)}</span></div>
          {data.awaiting.map((p) => payRow(p, true))}
        </div>
      )}
      {ahead.length === 0 && data.awaiting.length === 0 ? (
        <Empty title={horizon < 365 ? 'لا دفعات خلال 3 أشهر' : 'لا دفعات خلال السنة'}
          action={horizon < 365 && hiddenCount > 0 ? { label: 'اعرض السنة', onClick: () => setHorizon(365) } : undefined} />
      ) : byMonth(ahead, (p) => p.date).map(([key, list]) => (
        <div key={key}>
          <div className="inc-month"><b>{monthTitle(key)}</b>{list.length > 1 && <Money v={list.reduce((a, p) => a + (p.kind === 'payout' ? p.amount ?? 0 : 0), 0)} />}</div>
          {list.map((p) => payRow(p))}
        </div>
      ))}
      {(ahead.length > 0 || data.awaiting.length > 0) && (hiddenCount > 0 || horizon > 90) && (
        <div className="inc-more">
          <button type="button" className="btn ghost small" onClick={() => { haptic(); setHorizon(horizon > 90 ? 90 : 365) }}>
            {horizon > 90 ? 'اعرض 3 أشهر فقط' : 'اعرض السنة'}
          </button>
        </div>
      )}
    </>
  )

  const shownTx = olderToo ? data.incomeTx : data.received
  const receivedView = shownTx.length === 0 ? (
    <Empty icon={<IconCoins />} title="لم يُسجَّل توزيع بعد" text="توزيعات IBKR تُسجَّل تلقائياً، والبقية بزر «وصل؟»."
      action={owner ? { label: 'سجّل توزيعاً وصلك', onClick: () => record({ date: today }) } : undefined} />
  ) : (
    <>
      {byMonth(shownTx, (t) => t.tx_date).map(([key, list]) => (
        <div key={key}>
          <div className="inc-month"><b>{monthTitle(key)}</b>{list.length > 1 && <Money v={list.reduce((a, t) => a + Number(t.amount_sar), 0)} signed className="good" />}</div>
          {list.map((t) => {
            const h = nameOf(t.holding_id)
            const title = h?.name ?? (t.note || 'توزيع')
            return (
              <Row key={t.id} title={title} href={h ? assetHref(h.id) : undefined}
                start={h ? avatar(h) : <Avatar name={title} color="var(--income)" size={38} />}
                sub={<>{dateShort(t.tx_date)}{t.source === 'ibkr' ? ' · IBKR' : t.source === 'import' ? ' · مستورد' : ''}</>}
                end={<Money v={Number(t.amount_sar)} signed className="good" />} />
            )
          })}
        </div>
      ))}
      {data.hasOlder && (
        <div className="inc-more">
          <button type="button" className="btn ghost small" onClick={() => { haptic(); setOlderToo(!olderToo) }}>{olderToo ? 'آخر 12 شهراً فقط' : 'اعرض الأقدم'}</button>
        </div>
      )}
    </>
  )

  // «مصادر الدخل الدوري»: each paying holding with its frequency, yearly amount, yield, next date and share
  const sources = (
    <section className="card flush inc-side inc-o4">
      <div className="card-head"><h3>مصادر الدخل الدوري</h3>{data.annual > 0 && <span className="inc-head-sum"><Money v={data.annual} /> سنوياً</span>}</div>
      {data.groups.length === 0 ? (
        <>
          <Empty icon={<IconCoins />} title="لا مصادر دخل دوري بعد" text="أضف صندوق توزيعات أو صكوكاً لترى دخلها هنا."
            action={owner ? { label: 'أضف أصلاً', onClick: () => openAction('asset') } : undefined} />
          {missingChips}
        </>
      ) : <>
        {data.yieldPct != null && (
          <div className="inc-figure">
            <span>عائد التوزيع على هذه الأدوات <b className="inc-y"><Pct v={data.yieldPct} /></b> سنوياً</span>
          </div>
        )}
        {data.groups.map((g) => (
          <div key={g.freq}>
            <div className="inc-month"><span className="chip accent inc-freq">{FREQ_LABEL[g.freq]}</span>{g.sum > 0 && <Money v={g.sum} />}</div>
            {g.list.map((s) => (
              <Row key={s.h.id} title={s.h.name} href={assetHref(s.h.id)} start={avatar(s.h)}
                sub={<>{s.yield != null ? <Pct v={s.yield} /> : 'بلا نسبة'}{s.next ? <> · القادم {dateShort(s.next)}</> : null}</>}
                end={s.annual == null ? rateWord : <>
                  <Money v={s.annual} />
                  <span className="sub">{data.annual > 0 ? <><Pct v={(s.annual / data.annual) * 100} digits={0} /> من الدخل</> : 'سنوياً'}</span>
                </>} />
            ))}
          </div>
        ))}
        {missingChips}
      </>}
    </section>
  )

  // «الاستحقاقات القادمة»: capital coming back within 24 months, to be reinvested by the plan
  const maturities = data.maturities.length > 0 && (
    <section className="card flush inc-side inc-o5">
      <div className="card-head"><h3>الاستحقاقات القادمة</h3><span className="inc-head-sum">خلال سنتين</span></div>
      {data.maturities.map((m) => (
        <div key={m.h.id} className="inc-mat">
          <Row title={m.h.name} href={assetHref(m.h.id)} start={<DateBadge iso={m.date} today={today} />}
            sub={<>{relativeDays(m.date)} · يعود رأس المال</>} end={<Money v={m.amount} />} />
          {owner && (
            <div className="inc-mat-act">
              <span>أعد استثماره حسب خطتك</span>
              <a className="btn soft small" href={`#/deposit/${Math.round(m.amount)}`} onClick={() => haptic()}>وزّع المبلغ</a>
            </div>
          )}
        </div>
      ))}
    </section>
  )

  return (
    <div className="inc inc-cols">
      <div className="inc-c">
        <section className="hero inc-hero inc-o1">
          <div className="hero-top">
            <span>الدخل المتوقع خلال 12 شهراً</span>
            {owner && <button type="button" className="sync" onClick={() => record({ date: today })}><IconPlus /> سجّل توزيعاً</button>}
          </div>
          <div className="hero-value">{num0(shown)}<small>ريال</small></div>
          <div className="inc-stats">
            <div><span>متوسط الشهر</span><b className="money">{sar(data.expected / 12)}</b></div>
            <div><span>العائد السنوي</span><b>{data.yieldPct == null ? '—' : pct(data.yieldPct)}</b></div>
            <div><span>وصلك آخر 12 شهراً</span><b className="money">{sar(data.receivedSum)}</b></div>
          </div>
        </section>

        {owner && data.unknown.length > 0 && (
          <button type="button" className="banner inc-o1" onClick={() => openAsset(data.unknown[0].id)}>
            <span className="ico"><IconAlert /></span>
            <p>{data.unknown.length === 1 ? 'حدّد نسبة التوزيع لأداة واحدة' : `حدّد نسبة التوزيع لـ ${toolsText(data.unknown.length)}`}
              <small>{data.unknown.slice(0, 2).map((h) => h.name).join('، ')}{data.unknown.length > 2 ? '…' : ''}</small></p>
            <Chev />
          </button>
        )}

        <div className="inc-o2"><IncomeAccount /></div>
        <div className="inc-o3"><SafeIncome /></div>

        {hasAny && (
          <section className="card inc-chart inc-o6">
            <div className="card-head">
              <h3>الدخل حسب الشهر</h3>
              <div className="legend inc-legend">
                <span><i style={{ background: 'var(--income)', opacity: 0.45 }} />وصلك</span>
                <span><i style={{ background: 'var(--accent)' }} />المتوقع</span>
              </div>
            </div>
            <MonthBars data={data.bars} title="التوزيعات المستلمة والمتوقعة شهرياً" />
          </section>
        )}

        <section className="card flush inc-feed inc-o7">
          <div className="inc-seg">
            <div className="segmented full" role="group" aria-label="عرض الدخل">
              {([['next', 'القادم'], ['got', 'وصلك']] as Array<[Tab, string]>).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => { haptic(); setTab(k) }}>{label}</button>
              ))}
            </div>
          </div>
          {tab === 'next' ? upcoming : receivedView}
        </section>
      </div>

      <div className="inc-c">
        {sources}
        {maturities}
        <ZakatCard zakatOpts={plan.ctx?.zakat} />
        <Purification />
      </div>

      {recording && <RecordPayoutSheet initial={recording} onClose={() => setRecording(null)} />}
    </div>
  )
}

/** Zakat at today's value by each holding's method, by class and by holding (tap to change the method), and the 12-month schedule. */
function ZakatCard({ zakatOpts }: { zakatOpts?: ZakatOpts }) {
  const { holdings, fx, readOnly, sleeves, goals, plans } = useStore()
  const [editing, setEditing] = useState<Holding | null>(null)
  const today = todayISO()
  const z = useMemo(() => {
    const opts = zakatOpts ?? {}
    const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
    const est = zakatEstimate(live, fx, opts)
    const hctx = holdingContext({ doc: activePlanDoc(plans), sleeves, goals })
    const rows = live.map((h) => {
      const r = zakatRuleOf(h, opts)
      const v = holdingValue(h, fx)
      return { h, rule: r, cls: r.cls ?? holdingClass(h, hctx), value: v, amount: (v * r.factor * ZAKAT_RATE) / 100 }
    }).sort((a, b) => b.amount - a.amount || b.value - a.value)
    const byClass = new Map<AssetClass, number>()
    for (const r of rows) if (r.amount > 0) byClass.set(r.cls, (byClass.get(r.cls) ?? 0) + r.amount)
    const classes = [...byClass.entries()].sort((a, b) => b[1] - a[1])
    const due = zakatSchedule(live, fx, today, 365, opts)
    const noHaul = live.filter((h) => zakatRuleOf(h, opts).factor > 0 && !h.zakat_start).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))
    return { est, rows, classes, due, noHaul }
  }, [holdings, fx, zakatOpts, sleeves, goals, plans, today])
  const { est, rows, classes, due, noHaul } = z
  const max = Math.max(0, ...classes.map(([, v]) => v))
  const scheduled = due.reduce((a, x) => a + x.amount, 0)

  return (
    <section className="card flush inc-side inc-o8">
      <div className="card-head"><h3>الزكاة</h3>{est.amount > 0 && <span className="chip">{pct(ZAKAT_RATE)}</span>}</div>
      {rows.length === 0 ? <Empty title="لا أصول بعد" /> : <>
        <div className="inc-figure">
          <b className="money">{sar(est.amount)}</b>
          <span>زكاة سنة كاملة بقيمة اليوم، بطريقة كل أصل</span>
        </div>
        {classes.length > 0 && (
          <div className="inc-zcls">
            {classes.map(([c, v]) => (
              <div key={c} className="expo-row">
                <div className="inc-zline"><span>{ASSET_CLASS_LABEL[c]}</span><Money v={v} /></div>
                <div className="expo-track"><i style={{ width: `${Math.max(2, (v / (max || 1)) * 100)}%`, background: 'var(--accent)' }} /></div>
              </div>
            ))}
          </div>
        )}
        <details className="inc-zdet">
          <summary>طريقة كل أصل<span>{assetsText(rows.length)}</span></summary>
          <div className="inc-list">
            {rows.map((r) => (
              <button key={r.h.id} type="button" className="ri inc-zrow" onClick={() => { haptic(); setEditing(r.h) }}>
                <span className="ri-main"><b>{r.h.name}</b><span>{zakatMethodText(r.rule.method, r.rule.ratio)}{r.rule.source === 'holding' || r.rule.source === 'choice' ? ' · اختيارك' : ''}</span></span>
                <span className="ri-end">{r.amount > 0 ? <Money v={r.amount} /> : <span className="inc-none">لا شيء</span>}</span>
                <Chev />
              </button>
            ))}
          </div>
        </details>
        {due.length > 0 && <>
          <div className="inc-month"><b>المواعيد خلال 12 شهراً</b><Money v={scheduled} /></div>
          <div className="inc-list">
            {due.map((x) => (
              <Row key={x.holding.id + x.date} start={<DateBadge iso={x.date} today={today} />}
                title={x.holding.name} href={assetHref(x.holding.id)}
                sub={hijriLabel(x.date) || dateLong(x.date)} end={<Money v={x.amount} />} />
            ))}
          </div>
        </>}
      </>}
      {est.exempt > 0 && (
        <div className="inc-kv"><span>لا زكاة عليه</span><Money v={est.exempt} /></div>
      )}
      {est.notDue > 0 && (
        <div className="inc-kv"><span>لا زكاة على أصله</span><Money v={est.notDue} /></div>
      )}
      {!readOnly && noHaul.length > 0 && (
        <div className="inc-foot">
          <button type="button" className="banner" onClick={() => openAsset(noHaul[0].id)}>
            <span className="ico"><IconAlert /></span>
            <p>حدّد بداية الحول {forAssets(noHaul.length)}
              <small>{noHaul.length === 1 ? noHaul[0].name : 'ليظهر موعد زكاتها'}</small></p>
            <Chev />
          </button>
          {noHaul.length > 1 && (
            <div className="inc-chips">
              {noHaul.map((h) => <a key={h.id} className="chip" href={assetHref(h.id)} onClick={() => haptic()}>{h.name}</a>)}
            </div>
          )}
        </div>
      )}
      <p className="inc-zcheck">طرق الحساب آراء فقهية شائعة؛ للتأكد راجع جهة شرعية موثوقة.</p>
      {editing && <ZakatMethodSheet holding={editing} onClose={() => setEditing(null)} />}
    </section>
  )
}

/** Share of dividends to give away, by the purification ratio each fund or company announces. */
function Purification() {
  const { transactions, holdings, sleeves, readOnly } = useStore()
  const thisYear = new Date().getFullYear()
  const years = useMemo(() => {
    const s = new Set<number>([thisYear])
    for (const t of transactions) if (t.kind === 'dividend') s.add(Number(t.tx_date.slice(0, 4)))
    return [...s].filter((y) => y <= thisYear).sort((a, b) => b - a).slice(0, 3).reverse()
  }, [transactions, thisYear])
  const [year, setYear] = useState(thisYear)
  const p = purification(transactions, holdings, `${year}-01-01`, `${year}-12-31`)

  return (
    <section className="card flush inc-side inc-o9">
      <div className="card-head">
        <h3>التطهير</h3>
        {years.length > 1 && (
          <div className="segmented inc-years" role="group" aria-label="السنة">
            {years.map((y) => <button key={y} type="button" aria-pressed={y === year} onClick={() => { haptic(); setYear(y) }}>{y}</button>)}
          </div>
        )}
      </div>
      {p.rows.length === 0 ? (
        <Empty title={`لا توزيعات مسجّلة في ${year}`} />
      ) : <>
        <div className="inc-figure">
          <b><span className="money">{num2(p.total)}</span> ريال</b>
          <span>من توزيعات <Money v={p.dividends} /> في {year}</span>
        </div>
        <div className="inc-list">
          {p.rows.map((r) => (
            <Row key={r.holding.id} title={r.holding.name} href={assetHref(r.holding.id)}
              start={<Avatar name={r.holding.name} symbol={r.holding.symbol && r.holding.price_source === 'yahoo' ? r.holding.symbol : null} color={assetColor(r.holding, sleeves)} size={38} />}
              sub={<>توزيعات <Money v={r.dividends} />{r.pct ? ` · ${+r.pct.toFixed(2)}%` : ''}</>}
              end={r.pct ? <span className="money inc-amt">{num2(r.due)} ريال</span> : readOnly ? <span className="inc-none">بلا نسبة</span> : <span className="inc-warn">حدّد النسبة</span>} />
          ))}
        </div>
      </>}
    </section>
  )
}

export function RecordPayoutSheet({ initial, onClose }: { initial: Partial<PayoutItem>; onClose: () => void }) {
  const { holdings, goals, fx, upsert, notify } = useStore()
  const d = useDerived()
  const plan = usePlan()
  const ops = usePlanOps()
  const maturity = initial.kind === 'maturity'
  // with an income account, a distribution can go straight into it (on by default once income has started)
  const treasuryGoal = goals.find((g) => g.kind === 'income' && !g.archived) ?? null
  const [toTreasury, setToTreasury] = useState(() => !!plan.progress?.treasury.started)
  // instruments that pay come first in the list
  const options = useMemo(() => {
    const live = holdings.filter((h) => !h.archived)
    return [...live.filter(payoutsOf), ...live.filter((h) => !payoutsOf(h))]
  }, [holdings])
  const expectedOf = (id: string) => {
    const h = holdings.find((x) => x.id === id)
    const v = h ? payoutPerPayment(h, fx) : null
    return v ? Math.round(v) : 0
  }
  const firstId = initial.holding?.id ?? d?.payouts.find((p) => p.kind === 'payout')?.holding.id ?? options[0]?.id ?? ''
  const [holdingId, setHoldingId] = useState(firstId)
  const [date, setDate] = useState(initial.date && initial.date <= todayISO() ? initial.date : todayISO())
  const [amount, setAmount] = useState(Math.round(initial.amount ?? (maturity ? 0 : expectedOf(firstId))))
  const [typed, setTyped] = useState(false)
  const [close, setClose] = useState(true)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const h = holdings.find((x) => x.id === holdingId)
  const expected = maturity ? (initial.amount ?? 0) : expectedOf(holdingId)
  const next = !maturity && h ? nextAfterPayment(h, date) : null

  const pick = (id: string) => {
    setHoldingId(id)
    if (!typed && !maturity) setAmount(expectedOf(id))
  }
  const confirm = async () => {
    if (!h || !(amount > 0)) { notify('اختر الأصل واكتب المبلغ'); return }
    setBusy(true)
    const ok = await upsert('transactions', {
      tx_date: date, kind: maturity ? 'sell' : 'dividend', amount_sar: amount, holding_id: h.id, account_id: h.account_id, sleeve_id: h.sleeve_id,
      currency: 'SAR', source: 'manual', note: note || (maturity ? 'استحقاق واسترداد رأس المال' : 'توزيع نقدي'),
    })
    if (ok) {
      if (maturity && close) await upsert('holdings', { id: h.id, quantity: 0, archived: true })
      else if (next) await upsert('holdings', { id: h.id, payout_next: next })
      const moved = !maturity && !!treasuryGoal && toTreasury && h.goal_id !== treasuryGoal.id
        ? await ops.toTreasury(amount, date, note || `توزيع ${h.name}`, 'transfer') : false
      notify(maturity ? 'سُجّل الاستحقاق' : moved ? 'سُجّل التوزيع وأُضيف إلى حساب الدخل' : 'سُجّل التوزيع')
      onClose()
    }
    setBusy(false)
  }

  return (
    <Sheet title={maturity ? 'تسجيل استحقاق' : 'توزيع وصلك'} onClose={onClose}
      footer={<button className="btn primary" disabled={busy} onClick={confirm}>{busy ? 'جارٍ الحفظ…' : maturity ? 'سجّل الاستحقاق' : 'سجّل التوزيع'}</button>}>
      <div className="stack">
        <SelectField label="من" value={holdingId} onChange={pick} options={options.map((x) => ({ value: x.id, label: x.name }))} />
        <div className="grid2">
          <NumberField label="المبلغ الذي وصلك" value={amount} suffix="ريال" onChange={(v) => { setTyped(true); setAmount(v) }}
            hint={expected > 0 ? `المتوقع ${sar(expected)}` : undefined} />
          <label className="field"><span>تاريخ الوصول</span><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value || todayISO())} /></label>
        </div>
        {maturity && <Switch label="أغلق الأصل بعد الاستحقاق" hint="تُصفَّر وحداته ويُنقل إلى الأرشيف" checked={close} onChange={setClose} />}
        {!maturity && treasuryGoal && h?.goal_id !== treasuryGoal.id && (
          <Switch label="أضفه إلى حساب الدخل" hint="يُضاف المبلغ إلى رصيد الحساب دون أن يُحسب إيداعاً جديداً" checked={toTreasury} onChange={setToTreasury} />
        )}
        {next && <p className="small muted">يصبح موعد التوزيع القادم {dateLong(next)}.</p>}
        <TextField label="ملاحظة" value={note} onChange={setNote} />
      </div>
    </Sheet>
  )
}
