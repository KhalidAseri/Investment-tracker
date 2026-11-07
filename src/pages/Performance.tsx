// The «الأداء» and «التكاليف» parts of the analysis tab (see Analysis.tsx).
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { dateLong, dateShort, num0, num1, num2, sar, signedPct, todayISO } from '../lib/format'
import { benchmarkHistory, type HistoryResult } from '../lib/tools'
import { benchmarkSeries, feeDrag, holdingPnL, mainFlows, performance, periodStart, PERIODS, type Period } from '../lib/wealth'
import type { Account, Fx, Holding, Sleeve, Transaction } from '../lib/types'
import { ReturnChart } from '../components/charts'
import { Avatar, Card, Chev, DateBadge, Empty, Money, Tile } from '../components/kit'
import { assetColor, haptic, openAction } from '../lib/ui'
import { IconAlert, IconCalendar, IconCash, IconChart, IconCoins, IconScale, IconWallet } from '../components/icons'
import './Analysis.css'

export const BENCHMARKS = [
  { value: 'ISWD.L', label: 'الأسهم العالمية المتوافقة (ISWD)', short: 'الأسهم العالمية' },
  { value: '^TASI.SR', label: 'مؤشر السوق السعودي (تاسي)', short: 'تاسي' },
  { value: 'SPUS', label: 'الأسهم الأمريكية المتوافقة (SPUS)', short: 'SPUS' },
  { value: 'HLAL', label: 'الأسهم الأمريكية المتوافقة (HLAL)', short: 'HLAL' },
]
/** growth assumed only to show what fees cost over ten years */
export const FEE_GROWTH = 6

// ---------- small helpers ----------
export const tone = (v: number) => (v > 0.0001 ? 'good' : v < -0.0001 ? 'bad' : '')
/** keeps a number that follows Arabic words looking like a standalone one ("4.2%+", not "%4.2+") */
export const isolate = (s: string) => `\u2067${s}\u2069`
/** difference in percentage points, e.g. "+1.2 نقطة" */
export function ppText(v: number) {
  const s = num1(Math.abs(v))
  const n = Number(s.replace(/,/g, ''))
  const word = Number.isInteger(n) && n >= 3 && n <= 10 ? 'نقاط' : 'نقطة'
  return `${n === 0 ? '' : v > 0 ? '+' : '−'}${s} ${word}`
}
const since = (iso: string | null) => (!iso ? '' : `منذ ${iso.slice(0, 4) === todayISO().slice(0, 4) ? dateShort(iso) : dateLong(iso)}`)
const addDays = (iso: string, n: number) => new Date(new Date(iso + 'T12:00:00').getTime() + n * 86400000).toISOString().slice(0, 10)
const tickerOf = (h: Holding) => (h.symbol && h.price_source === 'yahoo' ? h.symbol : null)
const go = () => haptic()

// benchmark history: one request per symbol and start date, kept while the app is open
const benchCache = new Map<string, Promise<HistoryResult | null>>()
function loadBench(symbol: string, from: string) {
  const key = `${symbol}|${from}`
  let p = benchCache.get(key)
  if (!p) {
    p = benchmarkHistory(symbol, from).catch(() => null)
    p.then((r) => { if (!r || r.points.length < 2) benchCache.delete(key) })
    benchCache.set(key, p)
  }
  return p
}

// ---------- gain and loss per asset ----------
interface PLRow { h: Holding; value: number; cost: number; gain: number; pct: number }
function profitByAsset(holdings: Holding[], accounts: Account[], fx: Fx) {
  const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
  // cash in a bank account has no gain to track, so it is never asked for a cost
  const banks = new Set(accounts.filter((a) => a.kind === 'bank').map((a) => a.id))
  const cashLike = (h: Holding) => (h.account_id != null && banks.has(h.account_id)) || /طوارئ|نقد|سيولة/.test(h.name)
  const rows: PLRow[] = []
  for (const h of live) {
    const p = holdingPnL(h, fx)
    if (p.cost != null && p.gain != null && p.pct != null) rows.push({ h, value: p.value, cost: p.cost, gain: p.gain, pct: p.pct })
  }
  rows.sort((a, b) => b.gain - a.gain)
  const cost = rows.reduce((s, r) => s + r.cost, 0)
  const gain = rows.reduce((s, r) => s + r.gain, 0)
  const best = rows.length > 1 ? rows.reduce((m, r) => (r.pct > m.pct ? r : m)) : null
  const worst = rows.length > 1 ? rows.reduce((m, r) => (r.pct < m.pct ? r : m)) : null
  return {
    rows, cost, gain, pct: cost ? (gain / cost) * 100 : 0,
    maxAbs: Math.max(1, ...rows.map((r) => Math.abs(r.gain))),
    best: best && worst && best !== worst ? best : null,
    worst: best && worst && best !== worst ? worst : null,
    noCost: live.filter((h) => !(Number(h.cost_basis) > 0) && h.price_source !== 'ibkr' && !cashLike(h)).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx)),
  }
}

function MissingLine({ label, items }: { label: string; items: Holding[] }) {
  if (!items.length) return null
  const shown = items.slice(0, 3)
  return (
    <p className="an-missing">
      {label}:{' '}
      {shown.map((h, i) => <span key={h.id}>{i > 0 && '، '}<a href={`#/asset/${h.id}`} onClick={go}>{h.name}</a></span>)}
      {items.length > shown.length && ` و${items.length - shown.length} غيرها`}
    </p>
  )
}

function ProfitCard({ holdings, accounts, sleeves, fx, readOnly }: { holdings: Holding[]; accounts: Account[]; sleeves: Sleeve[]; fx: Fx; readOnly: boolean }) {
  const pl = useMemo(() => profitByAsset(holdings, accounts, fx), [holdings, accounts, fx])
  return (
    <Card title="الربح والخسارة لكل أصل" flush className="an-list">
      {pl.rows.length === 0 ? (
        <Empty icon={<IconWallet />} title="لا تكلفة مسجّلة بعد"
          text={readOnly ? 'يظهر هنا ربح كل أصل حين تُسجَّل تكلفته.' : 'أدخل ما دفعته في كل أصل من صفحته ليظهر ربحه أو خسارته.'}
          action={readOnly ? undefined : { label: 'افتح المحفظة', href: '#/portfolio' }} />
      ) : <>
        <div className="an-cap"><span>التكلفة ← القيمة اليوم</span><span>الربح</span></div>
        {pl.rows.map((r) => {
          // best and worst by return, so a small holding that did well still stands out
          const tag = r === pl.best ? { label: 'الأفضل', cls: r.pct > 0 ? 'accent' : '' }
            : r === pl.worst ? { label: 'الأضعف', cls: r.pct < 0 ? 'bad' : '' } : null
          return (
            <a key={r.h.id} className="ri" href={`#/asset/${r.h.id}`} onClick={go}>
              <Avatar name={r.h.name} symbol={tickerOf(r.h)} color={assetColor(r.h, sleeves)} />
              <span className="an-main">
                <span className="an-name"><b dir="auto">{r.h.name}</b>{tag && <small className={`chip ${tag.cls}`}>{tag.label}</small>}</span>
                <span className="an-sub"><span className="figure">{num0(r.cost)}</span> ← <span className="figure">{sar(r.value)}</span></span>
                <span className="an-bar" aria-hidden><i className={r.gain < 0 ? 'down' : ''} style={{ width: `${Math.max(2, (Math.abs(r.gain) / pl.maxAbs) * 100)}%` }} /></span>
              </span>
              <span className="ri-end">
                <Money v={r.gain} signed className={tone(r.gain)} />
                <span className={`sub ${tone(r.pct)}`}>{signedPct(r.pct)}</span>
              </span>
            </a>
          )
        })}
        <div className="an-total">
          <span className="an-main"><b>الإجمالي</b><span className="an-sub">على تكلفة <span className="figure">{sar(pl.cost)}</span></span></span>
          <span className="ri-end">
            <Money v={pl.gain} signed className={tone(pl.gain)} />
            <span className={`sub ${tone(pl.pct)}`}>{signedPct(pl.pct)}</span>
          </span>
        </div>
        <MissingLine label="بلا تكلفة مسجّلة" items={pl.noCost} />
      </>}
    </Card>
  )
}

export function NoAssets({ readOnly, text }: { readOnly: boolean; text: string }) {
  return (
    <Card>
      <Empty icon={<IconWallet />} title="لا أصول بعد" text={readOnly ? undefined : text}
        action={readOnly ? undefined : { label: 'أضف أصلاً', onClick: () => openAction('asset') }} />
    </Card>
  )
}

// ---------- الأداء ----------
/** the period last chosen, kept while the app is open */
let lastPeriod: Period = 'all'

export function Returns() {
  const { snapshots, transactions, holdings, accounts, sleeves, fx, settings, updateSettings, readOnly } = useStore()
  const d = useDerived()
  const [period, setPeriod] = useState<Period>(lastPeriod)
  /** the loaded benchmark, tagged with the symbol and start it was loaded for */
  const [bench, setBench] = useState<{ key: string; data: HistoryResult | null } | null>(null)
  const today = todayISO()
  const total = d?.totals.total ?? 0
  const symbol = settings?.benchmark_symbol || 'ISWD.L'

  // only money that moved in or out of the main portfolio counts as a deposit or a withdrawal
  const flows = useMemo(() => mainFlows(transactions, holdings, accounts), [transactions, holdings, accounts])
  const all = useMemo(() => performance(snapshots, flows, undefined, total, today), [snapshots, flows, total, today])
  const from = periodStart(period)
  const perf = useMemo(() => (from ? performance(snapshots, flows, from, total, today) : all), [snapshots, flows, from, total, today, all])
  const histStart = all.start

  const benchKey = `${symbol}|${histStart}`
  useEffect(() => {
    if (!histStart || all.points.length < 2) return
    let off = false
    loadBench(symbol, histStart).then((r) => { if (!off) setBench({ key: `${symbol}|${histStart}`, data: r && r.points.length > 1 ? r : null }) })
    return () => { off = true }
  }, [symbol, histStart, all.points.length])

  if (!d || !settings) return null
  const hasHistory = all.points.length >= 2
  const hasAssets = holdings.some((h) => !h.archived && holdingValue(h, fx) > 0)
  if (!hasHistory && !hasAssets) return <NoAssets readOnly={readOnly} text="أضف أصولك، ثم يظهر هنا أداؤها ومقارنتها بالمؤشر." />
  const enough = perf.points.length >= 2
  const benchLoading = bench?.key !== benchKey
  const benchData = benchLoading ? null : bench?.data ?? null
  const benchPts = benchData && enough ? benchmarkSeries(benchData.points, perf.points.map((p) => p.date)) : []
  const benchPct = benchPts.length ? benchPts[benchPts.length - 1].pct : null
  const vsBench = benchPct == null ? null : perf.twr - benchPct
  const known = BENCHMARKS.find((b) => b.value === symbol)
  const benchShort = known?.short ?? symbol
  const span = !from || (perf.start != null && perf.start > addDays(from, 3)) ? since(perf.start) : PERIODS.find((p) => p.k === period)?.long ?? ''

  const pickPeriod = (p: Period) => { haptic(); lastPeriod = p; setPeriod(p) }
  const pickBench = (v: string) => { if (!readOnly && v !== 'custom' && v !== symbol) { haptic(); updateSettings({ benchmark_symbol: v }) } }

  const chartCard = enough ? (
    <Card title="محفظتك مقابل المؤشر" className="an-chart">
      <ReturnChart title="العائد التراكمي لمحفظتك مقارنة بالمؤشر" series={[
        { key: 'me', label: `محفظتك ${isolate(signedPct(perf.twr))}`, color: 'var(--accent)', points: perf.points.map((p) => ({ date: p.date, pct: p.twr })) },
        ...(benchPts.length && benchPct != null ? [{ key: 'b', label: `${benchShort} ${isolate(signedPct(benchPct))}`, color: 'var(--growth)', dashed: true, points: benchPts }] : []),
      ]} />
      {readOnly ? (
        <div className="an-bench"><span>المؤشر</span><b>{known?.label ?? symbol}</b></div>
      ) : (
        <label className="an-bench">
          <span>قارن مع</span>
          <select className="select" value={known ? symbol : 'custom'} onChange={(e) => pickBench(e.target.value)}>
            {BENCHMARKS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            {!known && <option value="custom">{symbol}</option>}
          </select>
        </label>
      )}
      <p className="an-foot">المحفظة الرئيسية فقط، دون محافظ الأهداف.</p>
    </Card>
  ) : (
    <Card>
      {hasHistory
        ? <Empty icon={<IconChart />} title="لا بيانات كافية لهذه الفترة" text="اختر فترة أطول." />
        : <Empty icon={<IconChart />} title="يظهر الأداء بعد يومين" text="تُحفظ قيمة محفظتك كل صباح، ثم يظهر هنا عائدها ومقارنته بالمؤشر." />}
    </Card>
  )

  return (
    <>
      {hasHistory && (
        <div className="choice-chips an-periods" role="group" aria-label="الفترة">
          {PERIODS.map((p) => <button key={p.k} type="button" aria-pressed={period === p.k} onClick={() => pickPeriod(p.k)}>{p.label}</button>)}
        </div>
      )}
      {enough && (
        <div className="tiles">
          <Tile icon={<IconCash />} label="الربح" sub={span}
            value={<Money v={perf.gain} signed short={Math.abs(perf.gain) >= 1_000_000} className={tone(perf.gain)} />} />
          <Tile tone="blue" icon={<IconChart />} label="العائد" sub="لا يتأثر بإيداعاتك"
            value={<span className={tone(perf.twr)}>{signedPct(perf.twr)}</span>} />
          <Tile tone="income" icon={<IconCalendar />} label="العائد السنوي" sub={perf.annualized == null ? 'لفترة 10 أشهر فأكثر' : 'على أساس سنة كاملة'}
            value={perf.annualized == null ? '—' : <span className={tone(perf.annualized)}>{signedPct(perf.annualized)}</span>} />
          <Tile tone="gold" icon={<IconScale />} label="مقابل المؤشر"
            sub={benchLoading ? 'نجلب بيانات المؤشر…' : benchPct == null ? 'تعذّر جلب المؤشر الآن' : `${benchShort} ${isolate(signedPct(benchPct))}`}
            value={benchLoading ? '…' : vsBench == null ? '—' : <span className={tone(vsBench)}>{ppText(vsBench)}</span>} />
        </div>
      )}
      <div className={`layout two ${hasHistory ? 'an-block' : ''}`}>
        {chartCard}
        {hasAssets && <ProfitCard holdings={holdings} accounts={accounts} sleeves={sleeves} fx={fx} readOnly={readOnly} />}
      </div>
    </>
  )
}

// ---------- التكاليف ----------
const opsText = (n: number) => (n === 0 ? 'لا عمليات مسجّلة' : n === 1 ? 'عملية واحدة' : n === 2 ? 'عمليتان' : n <= 10 ? `${n} عمليات` : `${n} عملية`)
const assetsText = (n: number) => (n === 1 ? 'أصل واحد' : n === 2 ? 'أصلان' : n <= 10 ? `${n} أصول` : `${n} أصلاً`)

function feeLabel(t: Transaction, byHolding: Map<string, Holding>, byAccount: Map<string, Account>) {
  const h = t.holding_id ? byHolding.get(t.holding_id) : undefined
  const a = t.account_id ? byAccount.get(t.account_id) : undefined
  const title = h?.name ?? a?.name ?? t.note ?? 'رسوم'
  const sub = [t.note && t.note !== title ? t.note : null, h && a ? a.name : null].filter(Boolean).join(' · ')
  return { title, sub, href: h ? `#/asset/${h.id}` : null }
}

export function Costs() {
  const { holdings, transactions, accounts, sleeves, fx, readOnly } = useStore()
  const today = todayISO()
  const year = today.slice(0, 4)

  const data = useMemo(() => {
    const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
    const fees = live.filter((h) => Number(h.fee_pct) > 0).map((h) => {
      const value = holdingValue(h, fx)
      return { h, value, ...feeDrag(value, Number(h.fee_pct), FEE_GROWTH + Number(h.fee_pct)) }
    }).sort((a, b) => b.yearly - a.yearly)
    const yearly = fees.reduce((s, f) => s + f.yearly, 0)
    const drag = fees.reduce((s, f) => s + f.drag, 0)
    const value = fees.reduce((s, f) => s + f.value, 0)
    // funds without a fee; shares, direct sukuk and deposits, cash and broker-synced positions have none to enter
    const noFee = live.filter((h) => !(Number(h.fee_pct) > 0) && !h.symbol?.endsWith('.SR') && h.price_source !== 'ibkr' && !h.maturity_date
      && !/مرابح|سيولة|نقد|طوارئ/.test(h.name)).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))
    const paid = transactions.filter((t) => t.kind === 'fee' && t.tx_date.startsWith(year) && t.tx_date <= today)
      .sort((a, b) => b.tx_date.localeCompare(a.tx_date))
    const paidSum = paid.reduce((s, t) => s + Math.abs(Number(t.amount_sar) || 0), 0)
    return { live: live.length, fees, yearly, drag, avg: value ? (yearly / value) * 100 : 0, noFee, paid, paidSum }
  }, [holdings, transactions, fx, year, today])

  const byHolding = useMemo(() => new Map(holdings.map((h) => [h.id, h])), [holdings])
  const byAccount = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts])
  const toMissing = () => document.getElementById('an-nofee')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const has = data.fees.length > 0
  if (!data.live && !data.paid.length) return <NoAssets readOnly={readOnly} text="أضف أصولك، ثم يظهر هنا ما تدفعه من رسوم." />

  return (
    <>
      <div className="tiles an-top">
        <Tile icon={<IconCoins />} label="رسوم الإدارة سنوياً" value={has ? <Money v={data.yearly} /> : '—'}
          sub={has ? `متوسطها ${isolate(`${num2(data.avg)}%`)} من قيمتها` : 'لا رسوم مسجّلة بعد'} />
        <Tile tone="gold" icon={<IconCalendar />} label="أثرها على 10 سنوات" value={has ? <Money v={data.drag} /> : '—'}
          sub={`بافتراض نمو ${isolate(`${FEE_GROWTH}%`)} سنوياً`} />
        <Tile tone="blue" icon={<IconCash />} label={`رسوم دفعتها في ${year}`} value={<Money v={data.paidSum} />} sub={opsText(data.paid.length)} />
        <Tile tone="income" icon={<IconAlert />} label="بلا رسوم مسجّلة" value={num0(data.noFee.length)}
          sub={data.noFee.length ? 'لم تُدخل رسوم إدارتها' : 'كل الصناديق مكتملة'} onClick={data.noFee.length ? toMissing : undefined} />
      </div>

      <div className="layout two an-block">
        <Card title="رسوم إدارة الصناديق" flush className="an-list">
          {!has ? (
            <Empty icon={<IconCoins />} title="لم تُدخل رسوم أي صندوق بعد"
              text={readOnly ? 'تظهر هنا حين تُسجَّل رسوم الصناديق.' : 'أدخل «رسوم الإدارة السنوية» من نشرة كل صندوق في صفحته.'} />
          ) : <>
            <div className="an-cap"><span>النسبة · أثرها على 10 سنوات</span><span>سنوياً</span></div>
            {data.fees.map((f) => (
              <a key={f.h.id} className="ri" href={`#/asset/${f.h.id}`} onClick={go}>
                <Avatar name={f.h.name} symbol={tickerOf(f.h)} color={assetColor(f.h, sleeves)} />
                <span className="an-main">
                  <span className="an-name"><b dir="auto">{f.h.name}</b></span>
                  <span className="an-sub">{num2(Number(f.h.fee_pct))}% · <span className="figure">{sar(f.drag)}</span></span>
                </span>
                <span className="ri-end"><Money v={f.yearly} /></span>
              </a>
            ))}
            <div className="an-total">
              <span className="an-main"><b>الإجمالي</b><span className="an-sub">أثرها على 10 سنوات <span className="figure">{sar(data.drag)}</span></span></span>
              <span className="ri-end"><Money v={data.yearly} /></span>
            </div>
          </>}
        </Card>

        <div className="stack an-col">
          <Card title={`رسوم دفعتها في ${year}`} flush className="an-list"
            action={data.paid.length > 5 ? { label: 'كل العمليات', href: '#/activity' } : null}>
            {data.paid.length === 0 ? (
              <p className="an-hint">لا رسوم مسجّلة هذه السنة.{!readOnly && <> سجّلها من <a href="#/activity" onClick={go}>العمليات</a>.</>}</p>
            ) : data.paid.slice(0, 5).map((t) => {
              const l = feeLabel(t, byHolding, byAccount)
              const body = <>
                <DateBadge iso={t.tx_date} today={today} />
                <span className="an-main"><span className="an-name"><b dir="auto">{l.title}</b></span>{l.sub && <span className="an-sub">{l.sub}</span>}</span>
                <span className="ri-end"><Money v={Math.abs(Number(t.amount_sar) || 0)} /></span>
              </>
              return l.href
                ? <a key={t.id} className="ri" href={l.href} onClick={go}>{body}</a>
                : <div key={t.id} className="ri an-static">{body}</div>
            })}
          </Card>

          {data.noFee.length > 0 && (
            <div id="an-nofee" className="an-target">
              <Card title="أصول بلا رسوم مسجّلة" flush className="an-list">
                <p className="an-hint">{readOnly ? `${assetsText(data.noFee.length)} لم تُسجَّل رسوم إدارتها.` : 'أدخل رسوم الإدارة من نشرة كل صندوق.'}</p>
                {data.noFee.map((h) => (
                  <a key={h.id} className="ri" href={`#/asset/${h.id}`} onClick={go}>
                    <Avatar name={h.name} symbol={tickerOf(h)} color={assetColor(h, sleeves)} size={36} />
                    <span className="an-main"><span className="an-name"><b dir="auto">{h.name}</b></span>
                      {h.account_id && byAccount.get(h.account_id) && <span className="an-sub">{byAccount.get(h.account_id)!.name}</span>}</span>
                    <span className="ri-end"><Money v={holdingValue(h, fx)} /></span>
                    <Chev />
                  </a>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/** Kept for older imports: the returns view. */
export default function Performance() {
  return <Returns />
}
