import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { dateLong, pct, sar, signedPct, todayISO } from '../lib/format'
import { benchmarkHistory, type HistoryResult } from '../lib/tools'
import { benchmarkSeries, feeDrag, holdingPnL, performance } from '../lib/wealth'
import type { Holding } from '../lib/types'
import { ReturnChart } from '../components/charts'
import { Empty, Segmented, SelectField } from '../components/ui'
import { HoldingSheet } from './Holdings'

const BENCHMARKS = [
  { value: 'ISWD.L', label: 'الأسهم العالمية المتوافقة (MSCI World Islamic)' },
  { value: '^TASI.SR', label: 'مؤشر السوق السعودي (تاسي)' },
  { value: 'SPUS', label: 'الأسهم الأمريكية المتوافقة (SPUS)' },
  { value: 'HLAL', label: 'الأسهم الأمريكية المتوافقة (HLAL)' },
]
type Period = 'all' | 'ytd' | '12m'
/** growth assumed only to show what fees cost over ten years */
const FEE_GROWTH = 6

const signedSar = (v: number) => `${v >= 0 ? '+' : '−'}${sar(Math.abs(v))}`

export default function Performance() {
  const { snapshots, transactions, holdings, accounts, fx, settings, updateSettings, readOnly } = useStore()
  const d = useDerived()
  const [period, setPeriod] = useState<Period>('all')
  const [bench, setBench] = useState<HistoryResult | null>(null)
  const [benchState, setBenchState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [editing, setEditing] = useState<Partial<Holding> | null>(null)
  const today = todayISO()
  const symbol = settings?.benchmark_symbol || 'ISWD.L'

  const from = period === 'ytd' ? `${today.slice(0, 4)}-01-01` : period === '12m' ? new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10) : undefined

  const perf = useMemo(() => {
    if (!d) return null
    // only money that moved in or out of the independence portfolio counts as a flow
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const goalHoldings = new Set(holdings.filter((h) => h.goal_id).map((h) => h.id))
    const flows = transactions.filter((t) => !(t.holding_id && goalHoldings.has(t.holding_id)) && !(t.account_id && excluded.has(t.account_id)) && !/لهدف/.test(t.note ?? ''))
    return performance(snapshots, flows, from, d.totals.total, today)
  }, [d, snapshots, transactions, holdings, accounts, from, today])

  const start = perf?.start
  useEffect(() => {
    if (!start) return
    let off = false
    setBenchState('loading')
    benchmarkHistory(symbol, start).then((r) => {
      if (off) return
      if (r && r.points.length > 1) { setBench(r); setBenchState('idle') } else { setBench(null); setBenchState('error') }
    })
    return () => { off = true }
  }, [symbol, start])

  if (!d || !settings || !perf) return null
  const dates = perf.points.map((p) => p.date)
  const benchPts = bench ? benchmarkSeries(bench.points, dates) : []
  const benchPct = benchPts.length ? benchPts[benchPts.length - 1].pct : null
  const tooShort = perf.points.length < 2

  // per holding
  const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
  const withCost = live.map((h) => ({ h, ...holdingPnL(h, fx) })).filter((x) => x.gain != null).sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
  const noCost = live.filter((h) => !(Number(h.cost_basis) > 0) && h.price_source !== 'ibkr')
  const costTotal = withCost.reduce((s, x) => s + (x.cost ?? 0), 0)
  const gainTotal = withCost.reduce((s, x) => s + (x.gain ?? 0), 0)

  // fees
  const fees = live.filter((h) => Number(h.fee_pct) > 0).map((h) => ({ h, value: holdingValue(h, fx), ...feeDrag(holdingValue(h, fx), Number(h.fee_pct), FEE_GROWTH + Number(h.fee_pct)) }))
    .sort((a, b) => b.yearly - a.yearly)
  const feeYearly = fees.reduce((s, f) => s + f.yearly, 0)
  const feeDragTotal = fees.reduce((s, f) => s + f.drag, 0)
  const feeValue = fees.reduce((s, f) => s + f.value, 0)
  const noFee = live.filter((h) => !(Number(h.fee_pct) > 0) && !h.symbol?.endsWith('.SR') && h.price_source !== 'ibkr' && !/مرابح|سيولة|نقد|طوارئ/.test(h.name))

  const vsBench = benchPct == null ? null : perf.twr - benchPct

  return (
    <>
      <Segmented label="الفترة" value={period} onChange={setPeriod} options={[{ value: 'all', label: 'منذ البداية' }, { value: 'ytd', label: 'هذه السنة' }, { value: '12m', label: 'آخر 12 شهراً' }]} />

      {tooShort ? (
        <div style={{ marginTop: 14 }}>
          <Empty title="الأداء يحتاج بضعة أيام من البيانات">
            <p className="muted small">يحفظ التطبيق قيمة محفظتك كل صباح. بعد أيام قليلة يظهر هنا عائدك الحقيقي ومقارنته بالمؤشر.</p>
          </Empty>
        </div>
      ) : <>
        <section className="status">
          <p className="kicker">ربحك {period === 'all' ? `منذ ${dateLong(perf.start)}` : period === 'ytd' ? 'هذه السنة' : 'في آخر 12 شهراً'}</p>
          <p className="headline"><span className={`figure ${perf.gain >= 0 ? 'good' : 'bad'}`}>{signedSar(perf.gain)}</span></p>
          <p className="muted small">عائد {signedPct(perf.twr)}{perf.annualized != null ? `، أي ${pct(perf.annualized)} سنوياً` : ''}. لا تُحسب إيداعاتك وسحوباتك ربحاً ولا خسارة.</p>
        </section>

        <div className="panel">
          <ReturnChart title="العائد مقارنة بالمؤشر" series={[
            { key: 'me', label: 'محفظتك', color: 'var(--accent)', points: perf.points.map((p) => ({ date: p.date, pct: p.twr })) },
            ...(benchPts.length ? [{ key: 'b', label: 'المؤشر', color: 'var(--growth)', points: benchPts }] : []),
          ]} />
        </div>

        <div className="panel flush" style={{ marginTop: 12 }}>
          <div className="list-item" style={{ cursor: 'default' }}>
            <div className="grow"><div>محفظتك</div><div className="meta">العائد بعد استبعاد الإيداعات والسحوبات</div></div>
            <div className={`amount ${perf.twr >= 0 ? 'good' : 'bad'}`}>{signedPct(perf.twr)}</div>
          </div>
          <div className="list-item" style={{ cursor: 'default' }}>
            <div className="grow"><div>المؤشر</div><div className="meta">{benchState === 'loading' ? 'نجلب بياناته…' : benchState === 'error' ? 'تعذّر جلب بياناته الآن' : bench?.name ?? symbol}</div></div>
            <div className="amount">{benchPct == null ? '—' : signedPct(benchPct)}</div>
          </div>
        </div>
        {vsBench != null && (
          <p className="small" style={{ marginTop: 10 }}>
            {Math.abs(vsBench) < 0.3 ? 'أداؤك مماثل للمؤشر تقريباً.' : vsBench > 0 ? <>تفوقت على المؤشر بـ <b className="good">{pct(vsBench)}</b>.</> : <>المؤشر سبقك بـ <b className="bad">{pct(-vsBench)}</b>. هذا طبيعي إن كان جزء من محفظتك في صكوك ومرابحة وذهب، فالمؤشر أسهم كله.</>}
          </p>
        )}
        <p className="tiny muted" style={{ marginTop: 6 }}>يشمل المحفظة الرئيسية فقط، دون محافظ الأهداف والحسابات المستبعدة. عائد المؤشر بعملته، والريال مربوط بالدولار.</p>
      </>}

      <div style={{ marginTop: 12 }}>
        <SelectField label="المؤشر الذي تقارن به" value={BENCHMARKS.some((b) => b.value === symbol) ? symbol : 'custom'} onChange={(v) => { if (!readOnly && v !== 'custom') updateSettings({ benchmark_symbol: v }) }}
          options={[...BENCHMARKS, ...(BENCHMARKS.some((b) => b.value === symbol) ? [] : [{ value: 'custom', label: symbol }])]} />
      </div>

      <section className="section">
        <div className="section-head"><h2>الربح والخسارة لكل أصل</h2></div>
        {withCost.length === 0 ? (
          <Empty title="أدخل ما دفعته في كل أصل">
            <p className="muted small">افتح أي أصل وأدخل «إجمالي ما دفعته فيه» ليظهر ربحه أو خسارته. الإيداعات التي تسجلها من «مخطط الإيداع» تُضاف تلقائياً.</p>
          </Empty>
        ) : <>
          <div className="panel flush">
            {withCost.map((x) => (
              <button key={x.h.id} className="list-item" onClick={() => !readOnly && setEditing(x.h)} style={readOnly ? { cursor: 'default' } : undefined}>
                <div className="grow"><div>{x.h.name}</div><div className="meta">دفعت {sar(x.cost ?? 0)}، قيمته {sar(x.value)}</div></div>
                <div className="stack" style={{ gap: 0, alignItems: 'flex-end' }}>
                  <span className={`amount ${(x.gain ?? 0) >= 0 ? 'good' : 'bad'}`}>{signedSar(x.gain ?? 0)}</span>
                  <span className="tiny muted">{signedPct(x.pct ?? 0)}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="row between small" style={{ marginTop: 10 }}><span>المجموع على {sar(costTotal)} مدفوعة</span><b className={gainTotal >= 0 ? 'good' : 'bad'}>{signedSar(gainTotal)} ({signedPct(costTotal ? (gainTotal / costTotal) * 100 : 0)})</b></div>
        </>}
        {noCost.length > 0 && withCost.length > 0 && (
          <p className="small muted" style={{ marginTop: 8 }}>بلا تكلفة مسجّلة: {noCost.slice(0, 4).map((h) => h.name).join('، ')}{noCost.length > 4 ? ` و${noCost.length - 4} غيرها` : ''}.</p>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>رسوم الصناديق</h2></div>
        {fees.length === 0 ? (
          <Empty title="لم تُدخل رسوم أي صندوق بعد">
            <p className="muted small">افتح الصندوق وأدخل «رسوم الإدارة السنوية» من نشرته، فيظهر هنا كم تدفع سنوياً وكم تقتطع من نمو محفظتك.</p>
          </Empty>
        ) : <>
          <section className="status" style={{ paddingTop: 0 }}>
            <p className="kicker">تدفع رسوماً سنوية نحو</p>
            <p className="headline"><span className="figure">{sar(feeYearly)}</span></p>
            <p className="muted small">متوسطها {pct(feeValue ? (feeYearly / feeValue) * 100 : 0, 2)} من قيمة هذه الصناديق. على 10 سنوات تنقص محفظتك بسببها نحو <b>{sar(feeDragTotal)}</b>، بافتراض نمو {FEE_GROWTH}% سنوياً.</p>
          </section>
          <div className="panel flush">
            {fees.map((f) => (
              <button key={f.h.id} className="list-item" onClick={() => !readOnly && setEditing(f.h)} style={readOnly ? { cursor: 'default' } : undefined}>
                <div className="grow"><div>{f.h.name}</div><div className="meta">{pct(Number(f.h.fee_pct), 2)} سنوياً، أثرها على 10 سنوات {sar(f.drag)}</div></div>
                <div className="amount">{sar(f.yearly)}</div>
              </button>
            ))}
          </div>
        </>}
        {noFee.length > 0 && <p className="small muted" style={{ marginTop: 8 }}>لم تُدخل رسوم: {noFee.slice(0, 4).map((h) => h.name).join('، ')}{noFee.length > 4 ? ` و${noFee.length - 4} غيرها` : ''}.</p>}
      </section>

      {editing && <HoldingSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}
