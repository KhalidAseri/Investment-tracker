// «الدخل»: expected and received payouts, income instruments, zakat and purification.
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ZAKAT_RATE, holdingValue } from '../lib/calc'
import { dateLong, dateShort, monthName, num0, num2, pct, relativeDays, sar, todayISO } from '../lib/format'
import {
  FREQ_LABEL, daysBetween, hijriLabel, isIncomeTx, isoOf, nominalValue, payoutAnnual, payoutPerPayment, utc, type PayoutItem,
} from '../lib/income'
import { purification } from '../lib/wealth'
import type { Holding, Transaction } from '../lib/types'
import { MonthBars } from '../components/charts'
import { NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { Avatar, Chev, DateBadge, Empty, Money } from '../components/kit'
import { IconAlert, IconCoins, IconPlus } from '../components/icons'
import { assetColor, haptic, openAction, useCountUp } from '../lib/ui'
import './Payouts.css'

type Tab = 'next' | 'got' | 'tools'
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

export default function Payouts() {
  const { holdings, transactions, sleeves, accounts, fx, readOnly } = useStore()
  const d = useDerived()
  const [tab, setTab] = useState<Tab>('next')
  const [recording, setRecording] = useState<Partial<PayoutItem> | null>(null)
  const [horizon, setHorizon] = useState(90)
  const [olderToo, setOlderToo] = useState(false)
  const today = todayISO()

  const data = useMemo(() => {
    if (!d) return null
    const yearAgo = addDays(today, -365)
    const incomeTx = transactions.filter(isIncomeTx)
    const received = incomeTx.filter((t) => t.tx_date > yearAgo && t.tx_date <= today)
    const receivedSum = received.reduce((a, t) => a + Number(t.amount_sar), 0)
    const expected = d.payouts.filter((p) => p.kind === 'payout').reduce((a, p) => a + (p.amount ?? 0), 0)

    const live = holdings.filter((h) => !h.archived && Number(h.quantity) > 0)
    const instruments = live.filter((h) => payoutsOf(h) || h.maturity_date)
    let annual = 0, paying = 0
    for (const h of instruments) {
      const a = payoutAnnual(h, fx), v = holdingValue(h, fx)
      if (a != null && a > 0 && v > 0) { annual += a; paying += v }
    }
    const yieldPct = paying > 0 ? (annual / paying) * 100 : null
    const unknown = instruments.filter((h) => payoutsOf(h) && payoutAnnual(h, fx) == null)
    const rank = (h: Holding) => (payoutsOf(h) ? payoutAnnual(h, fx) ?? -1 : 0)
    const tools = [...instruments].sort((a, b) => rank(b) - rank(a))

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
      annual, yieldPct, unknown, tools, awaiting, bars, missing,
    }
  }, [d, holdings, transactions, sleeves, accounts, fx, today])

  const shown = useCountUp(data?.expected ?? 0)
  if (!d || !data) return null

  const owner = !readOnly
  const until = addDays(today, horizon)
  const ahead = d.payouts.filter((p) => p.date <= until)
  const hiddenCount = d.payouts.length - ahead.length
  const quickUntil = addDays(today, 15)
  const record = (p: Partial<PayoutItem>) => { haptic(); setRecording(p) }
  const nameOf = (id: string | null) => holdings.find((h) => h.id === id)
  const hasAny = data.tools.length > 0 || data.incomeTx.length > 0
  const rateWord = owner ? <span className="inc-warn">حدّد النسبة</span> : <span className="inc-none">بلا نسبة</span>

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
  const noTools = (
    <>
      <Empty icon={<IconCoins />} title="لا توجد أدوات دخل بعد" text="أضف صندوق توزيعات أو صكوكاً أو مرابحة لترى دخلها هنا."
        action={owner ? { label: 'أضف أصلاً', onClick: () => openAction('asset') } : undefined} />
      {missingChips}
    </>
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
        data.tools.length === 0 ? noTools : (
          <Empty title={horizon < 365 ? 'لا دفعات خلال 3 أشهر' : 'لا دفعات خلال السنة'}
            action={horizon < 365 && hiddenCount > 0 ? { label: 'اعرض السنة', onClick: () => setHorizon(365) } : undefined} />
        )
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
                start={<Avatar name={title} symbol={h?.symbol && h.price_source === 'yahoo' ? h.symbol : null} color={h ? assetColor(h, sleeves) : 'var(--income)'} size={38} />}
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

  const toolsView = (
    <>
      {data.tools.length === 0 ? noTools : (
        <>
          <div className="inc-month"><b>{toolsText(data.tools.length)}</b><span><Money v={data.annual} /> سنوياً</span></div>
          {data.tools.map((h) => {
            const freq = h.payout_freq ?? 'none'
            const annual = payoutAnnual(h, fx)
            const rateText = h.payout_basis === 'per_unit'
              ? (h.payout_per_unit != null ? `${num2(Number(h.payout_per_unit))} ${h.currency} للوحدة` : 'بلا مبلغ')
              : (h.payout_rate != null ? `${+Number(h.payout_rate).toFixed(2)}%` : 'بلا نسبة')
            const sub = freq !== 'none'
              ? `${FREQ_LABEL[freq]} · ${rateText}${h.maturity_date ? ` · حتى ${h.maturity_date.slice(0, 4)}` : ''}`
              : `يستحق ${dateLong(h.maturity_date)}`
            return (
              <Row key={h.id} title={h.name} href={assetHref(h.id)} sub={sub}
                start={<Avatar name={h.name} symbol={h.symbol && h.price_source === 'yahoo' ? h.symbol : null} color={assetColor(h, sleeves)} size={38} />}
                end={freq === 'none'
                  ? <><Money v={nominalValue(h, fx)} /><span className="sub">عند الاستحقاق</span></>
                  : annual == null ? rateWord
                    : <><Money v={annual} /><span className="sub">سنوياً</span></>} />
            )
          })}
          {missingChips}
        </>
      )}
    </>
  )

  return (
    <div className="inc layout two">
      <div className="inc-col">
        <section className="hero inc-hero">
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
          <button type="button" className="banner" onClick={() => openAsset(data.unknown[0].id)}>
            <span className="ico"><IconAlert /></span>
            <p>{data.unknown.length === 1 ? 'حدّد نسبة التوزيع لأداة واحدة' : `حدّد نسبة التوزيع لـ ${toolsText(data.unknown.length)}`}
              <small>{data.unknown.slice(0, 2).map((h) => h.name).join('، ')}{data.unknown.length > 2 ? '…' : ''}</small></p>
            <Chev />
          </button>
        )}

        {hasAny && (
          <section className="card inc-chart">
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

        <section className="card flush inc-feed">
          <div className="inc-seg">
            <div className="segmented full" role="group" aria-label="عرض الدخل">
              {([['next', 'القادم'], ['got', 'وصلك'], ['tools', 'الأدوات']] as Array<[Tab, string]>).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={tab === k} onClick={() => { haptic(); setTab(k) }}>{label}</button>
              ))}
            </div>
          </div>
          {tab === 'next' ? upcoming : tab === 'got' ? receivedView : toolsView}
        </section>
      </div>

      <div className="inc-col">
        <ZakatCard />
        <Purification />
      </div>

      {recording && <RecordPayoutSheet initial={recording} onClose={() => setRecording(null)} />}
    </div>
  )
}

/** Zakat due in the next 12 months, each holding on its own Hijri anniversary. */
function ZakatCard() {
  const { holdings, fx, readOnly } = useStore()
  const d = useDerived()
  if (!d) return null
  const today = todayISO()
  const due = d.zakatDue
  const total = due.reduce((a, z) => a + z.amount, 0)
  const noHaul = holdings
    .filter((h) => !h.archived && h.zakatable !== false && !h.zakat_start && holdingValue(h, fx) > 0)
    .sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))
  const nothing = d.zakat.base <= 0

  return (
    <section className="card flush inc-side">
      <div className="card-head"><h3>الزكاة</h3>{!nothing && <span className="chip">{pct(ZAKAT_RATE)}</span>}</div>
      {nothing ? (
        <Empty title="لا أصول عليها زكاة" />
      ) : <>
        <div className="inc-figure">
          <b className="money">{sar(total)}</b>
          <span>{due.length ? 'خلال 12 شهراً، تقديرية بقيمة اليوم' : 'لم تُحدَّد مواعيد الحول بعد'}</span>
        </div>
        {due.length > 0 && (
          <div className="inc-list">
            {due.map((z) => (
              <Row key={z.holding.id + z.date} start={<DateBadge iso={z.date} today={today} />}
                title={z.holding.name} href={assetHref(z.holding.id)}
                sub={hijriLabel(z.date) || dateLong(z.date)} end={<Money v={z.amount} />} />
            ))}
          </div>
        )}
      </>}
      {d.zakat.exempt > 0 && (
        <div className="inc-kv"><span>مستثنى باختيارك</span><Money v={d.zakat.exempt} /></div>
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
    <section className="card flush inc-side">
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
  const { holdings, fx, upsert, notify } = useStore()
  const d = useDerived()
  const maturity = initial.kind === 'maturity'
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
      notify(maturity ? 'سُجّل الاستحقاق' : 'سُجّل التوزيع')
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
        {next && <p className="small muted">يصبح موعد التوزيع القادم {dateLong(next)}.</p>}
        <TextField label="ملاحظة" value={note} onChange={setNote} />
      </div>
    </Sheet>
  )
}
