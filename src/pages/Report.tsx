import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { dateLong, num2, pct, sar, signedPct, todayISO } from '../lib/format'
import { isIncomeTx, zakatSchedule } from '../lib/income'
import { debtView, feeDrag, holdingPnL, netWorth, performance, purification } from '../lib/wealth'

const signedSar = (v: number) => `${v >= 0 ? '+' : '−'}${sar(Math.abs(v))}`

export default function Report() {
  const { snapshots, transactions, holdings, accounts, fx, settings, otherAssets, obligations, goals } = useStore()
  const d = useDerived()
  const thisYear = new Date().getFullYear()
  const firstYear = Math.min(thisYear, ...snapshots.map((s) => Number(s.snap_date.slice(0, 4))), ...transactions.map((t) => Number(t.tx_date.slice(0, 4))))
  const [year, setYear] = useState(thisYear)
  const today = todayISO()
  const from = `${year}-01-01`, to = year === thisYear ? today : `${year}-12-31`

  const r = useMemo(() => {
    if (!d || !settings) return null
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const goalHoldings = new Set(holdings.filter((h) => h.goal_id).map((h) => h.id))
    const own = transactions.filter((t) => !(t.holding_id && goalHoldings.has(t.holding_id)) && !(t.account_id && excluded.has(t.account_id)) && !/لهدف/.test(t.note ?? ''))
    const snaps = snapshots.filter((s) => s.snap_date <= to)
    const perf = performance(snaps, own, from, year === thisYear ? d.totals.total : undefined, year === thisYear ? today : undefined)
    const inYear = transactions.filter((t) => t.tx_date >= from && t.tx_date <= to)
    const sumKind = (k: string) => inYear.filter((t) => t.kind === k).reduce((s, t) => s + Math.abs(Number(t.amount_sar)), 0)
    const byHolding = new Map<string, number>()
    for (const t of inYear.filter(isIncomeTx)) byHolding.set(t.holding_id ?? '', (byHolding.get(t.holding_id ?? '') ?? 0) + Math.abs(Number(t.amount_sar)))
    const dividends = [...byHolding.entries()].map(([id, v]) => ({ name: holdings.find((h) => h.id === id)?.name ?? 'توزيعات أخرى', value: v })).sort((a, b) => b.value - a.value)
    const pur = purification(transactions, holdings, from, to)
    const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
    const totalAll = live.reduce((s, h) => s + holdingValue(h, fx), 0)
    const fundFees = live.filter((h) => Number(h.fee_pct) > 0).reduce((s, h) => s + feeDrag(holdingValue(h, fx), Number(h.fee_pct), settings.expected_return).yearly, 0)
    const zakatNext = zakatSchedule(holdings, fx, today, 365)
    const nw = netWorth({ invested: d.totals.total, goals: Object.values(d.totals.goals).reduce((a, b) => a + b, 0), outside: d.totals.outside, otherAssets, obligations })
    return { perf, deposits: sumKind('deposit'), withdrawals: sumKind('withdrawal') + sumKind('income'), fees: sumKind('fee'), zakatPaid: sumKind('zakat'), dividends,
      dividendTotal: dividends.reduce((s, x) => s + x.value, 0), pur, live, totalAll, fundFees, zakatNext, nw }
  }, [d, settings, snapshots, transactions, holdings, accounts, fx, otherAssets, obligations, from, to, year, thisYear, today])

  if (!d || !settings || !r) return null
  const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i)

  return (
    <div className="report">
      <div className="row between no-print" style={{ marginBottom: 14, gap: 8 }}>
        <div className="segmented" role="group" aria-label="السنة" style={{ width: 'auto' }}>
          {years.slice(0, 4).map((y) => <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
        </div>
        <button className="btn primary small" onClick={() => window.print()}>اطبع أو احفظ PDF</button>
      </div>

      <header className="report-head">
        <h2>التقرير السنوي {year}</h2>
        <p className="muted small">{year === thisYear ? `من 1 يناير حتى ${dateLong(today)}` : `السنة كاملة`}، أُعدّ في {dateLong(today)}</p>
      </header>

      <section className="report-sec">
        <h3>الخلاصة</h3>
        <table className="report-table">
          <tbody>
            <tr><td>صافي الثروة اليوم</td><td>{sar(r.nw.net)}</td></tr>
            <tr><td>قيمة محفظة الاستقلال في بداية الفترة</td><td>{r.perf.start ? sar(r.perf.startValue) : '—'}</td></tr>
            <tr><td>قيمتها في نهاية الفترة</td><td>{sar(r.perf.endValue || d.totals.total)}</td></tr>
            <tr><td>أودعت</td><td>{sar(r.deposits)}</td></tr>
            <tr><td>سحبت</td><td>{sar(r.withdrawals)}</td></tr>
            <tr><td>الربح بعد استبعاد الإيداع والسحب</td><td className={r.perf.gain >= 0 ? 'good' : 'bad'}>{signedSar(r.perf.gain)}</td></tr>
            <tr><td>العائد</td><td>{r.perf.points.length > 1 ? signedPct(r.perf.twr) : '—'} <span className="muted">(الخطة تفترض {pct(settings.expected_return)} سنوياً)</span></td></tr>
          </tbody>
        </table>
      </section>

      <section className="report-sec">
        <h3>الأصول في نهاية الفترة</h3>
        <table className="report-table cols">
          <thead><tr><th>الأصل</th><th>القيمة</th><th>الوزن</th><th>الربح</th></tr></thead>
          <tbody>
            {[...r.live].sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx)).map((h) => {
              const p = holdingPnL(h, fx)
              return <tr key={h.id}><td>{h.name}{h.goal_id ? <span className="muted"> (هدف)</span> : null}</td><td>{sar(p.value)}</td><td>{pct((p.value / (r.totalAll || 1)) * 100)}</td><td className={p.gain == null ? 'muted' : p.gain >= 0 ? 'good' : 'bad'}>{p.gain == null ? '—' : signedPct(p.pct ?? 0)}</td></tr>
            })}
          </tbody>
          <tfoot><tr><td>المجموع</td><td>{sar(r.totalAll)}</td><td>100%</td><td /></tr></tfoot>
        </table>
        {year !== thisYear && <p className="tiny muted">القيم بأسعار اليوم؛ يحفظ التطبيق إجمالي المحفظة يومياً لا تفاصيل كل أصل.</p>}
      </section>

      <section className="report-sec">
        <h3>التوزيعات والتطهير</h3>
        {r.dividends.length === 0 ? <p className="small muted">لم تُسجَّل توزيعات في هذه الفترة.</p> : (
          <table className="report-table cols">
            <thead><tr><th>المصدر</th><th>التوزيعات</th></tr></thead>
            <tbody>{r.dividends.map((x) => <tr key={x.name}><td>{x.name}</td><td>{sar(x.value)}</td></tr>)}</tbody>
            <tfoot><tr><td>المجموع</td><td>{sar(r.dividendTotal)}</td></tr></tfoot>
          </table>
        )}
        <p className="small">التطهير المطلوب: <b>{num2(r.pur.total)} ريال</b>{r.pur.rows.some((x) => !x.pct) ? ' (بعض الأصول بلا نسبة تطهير)' : ''}.</p>
      </section>

      <section className="report-sec">
        <h3>الرسوم والزكاة</h3>
        <table className="report-table">
          <tbody>
            <tr><td>رسوم مسجّلة مدفوعة</td><td>{sar(r.fees)}</td></tr>
            <tr><td>رسوم إدارة الصناديق (تقدير سنوي)</td><td>{sar(r.fundFees)}</td></tr>
            <tr><td>زكاة مسجّلة مدفوعة</td><td>{sar(r.zakatPaid)}</td></tr>
            <tr><td>زكاة تقديرية مستحقة خلال 12 شهراً</td><td>{sar(r.zakatNext.reduce((s, z) => s + z.amount, 0))}</td></tr>
          </tbody>
        </table>
      </section>

      {(r.nw.debts.length > 0 || otherAssets.length > 0) && (
        <section className="report-sec">
          <h3>الأصول الأخرى والديون</h3>
          <table className="report-table">
            <tbody>
              <tr><td>العقار والأصول الأخرى</td><td>{sar(r.nw.other)}</td></tr>
              {obligations.filter((o) => o.balance != null).map((o) => { const v = debtView(o); return <tr key={o.id}><td>{o.name}</td><td className="bad">−{sar(v.balance)}{v.payoffDate ? <span className="muted"> · ينتهي {dateLong(v.payoffDate).replace(/^\d+ /, '')}</span> : null}</td></tr> })}
            </tbody>
          </table>
        </section>
      )}

      {d.goalStats.length > 0 && (
        <section className="report-sec">
          <h3>الأهداف</h3>
          <table className="report-table cols">
            <thead><tr><th>الهدف</th><th>جُمع</th><th>المستهدف</th><th>التقدم</th></tr></thead>
            <tbody>{d.goalStats.map((g) => <tr key={g.goal.id}><td>{g.goal.name}</td><td>{sar(g.value)}</td><td>{sar(Number(g.goal.target_amount))}</td><td>{pct(g.progress * 100, 0)}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <section className="report-sec">
        <h3>الطريق إلى الاستقلال</h3>
        <p className="small">التقدم نحو هدفك {pct(d.progress * 100, 0)}. {d.fi ? `بالمعدل الحالي تصل نحو ${Math.round(d.fi)}، وهدفك ${settings.independence_year}.` : 'أكمل بياناتك لتقدير سنة الوصول.'}</p>
      </section>
      <p className="tiny muted report-foot">مسار · تقرير للاطلاع الشخصي، والأرقام التقديرية مبنية على ما أدخلته.</p>
    </div>
  )
}
