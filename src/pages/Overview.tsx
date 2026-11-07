import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { ago, dateShort, pct, relativeDays, sar, sarShort } from '../lib/format'
import { MixBar } from '../components/charts'
import { IconAlert, IconCalendar, IconCheck, IconEye, IconLink, IconScale, IconWallet } from '../components/icons'
import { buyPrice, conditionsMet } from './Watchlist'
import type { Go, Route } from '../App'
import { netWorth, performance } from '../lib/wealth'
import { todayISO } from '../lib/format'


export default function Overview({ go }: { go: Go }) {
  const { settings, sleeves, snapshots, ibkr, fxUpdatedAt, holdings, watchlist, readOnly, accounts, otherAssets, obligations, transactions } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const wealth = useMemo(() => {
    if (!d) return null
    const goalIds = new Set(holdings.filter((h) => h.goal_id).map((h) => h.id))
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const flows = transactions.filter((t) => !(t.holding_id && goalIds.has(t.holding_id)) && !(t.account_id && excluded.has(t.account_id)) && !/لهدف/.test(t.note ?? ''))
    return {
      nw: netWorth({ invested: d.totals.total, goals: Object.values(d.totals.goals).reduce((a, b) => a + b, 0), outside: d.totals.outside, otherAssets, obligations }),
      perf: performance(snapshots, flows, undefined, d.totals.total, todayISO()),
    }
  }, [d, holdings, accounts, transactions, otherAssets, obligations, snapshots])
  if (!settings || !d || !wealth) return null

  const total = d.totals.total
  const payoutsYear = d.payouts.filter((p) => p.kind === 'payout').reduce((a, p) => a + (p.amount ?? 0), 0)

  const alerts: Array<{ tone: 'warn' | 'accent' | 'plain'; icon: JSX.Element; body: JSX.Element; action?: () => void; owner?: boolean }> = []
  if (d.outOfBand.length > 2) {
    const short = d.outOfBand.filter((x) => x.diff < 0).reduce((a, x) => a + x.gapValue, 0)
    alerts.push({
      tone: 'warn', icon: <IconScale />, action: () => go('deposit'),
      body: <><b>{d.outOfBand.length} طبقات</b> بعيدة عن وزنها المستهدف بأكثر من {settings.rebalance_band} نقاط{short > 0 ? `، وينقص الطبقات المتأخرة ${sarShort(short)}` : ''}. استخدم مخطط الإيداع ليوجّه أموالك القادمة إليها.</>,
    })
  } else for (const x of d.outOfBand) {
    alerts.push({
      tone: 'warn', icon: <IconScale />, action: () => go('deposit'),
      body: <><b>{x.sleeve.name}</b> {x.diff > 0 ? 'أعلى' : 'أقل'} من هدفها بـ {Math.abs(x.diff).toFixed(1)} نقطة. {x.diff > 0 ? 'وجّه الإيداعات القادمة إلى غيرها.' : `ينقصها ${sarShort(x.gapValue)} لتعود لوزنها.`}</>,
    })
  }
  if (Math.round(d.targetSum.now) !== 100) {
    alerts.push({ owner: true, tone: 'warn', icon: <IconAlert />, action: () => go('plan'), body: <>مجموع الأوزان المستهدفة {pct(d.targetSum.now)} ولا يساوي 100%.</> })
  }
  for (const o of d.soon.slice(0, 4)) {
    alerts.push({
      tone: 'accent', icon: <IconCalendar />, action: () => go(('route' in o && (o as { route?: Route }).route) || 'calendar'),
      body: <><b>{o.event.title}</b> {relativeDays(o.date)} ({dateShort(o.date)}){o.event.amount ? `، ${sar(o.event.amount)}` : ''}</>,
    })
  }
  if (d.unassigned.length) {
    alerts.push({ owner: true, tone: 'warn', icon: <IconWallet />, action: () => go('holdings'), body: <>{d.unassigned.length === 1 ? `«${d.unassigned[0].name}» بلا طبقة` : `${d.unassigned.length} أصول بلا طبقة`}؛ حدّد طبقتها لتُحسب في التوزيع.</> })
  }
  for (const h of d.staleManual.slice(0, 3)) {
    alerts.push({ owner: true, tone: 'plain', icon: <IconWallet />, action: () => go('holdings'), body: <>حدّث سعر «{h.name}»؛ آخر تحديث {ago(h.price_updated_at)}.</> })
  }
  for (const w of watchlist.filter((x) => conditionsMet(x).priceOk).slice(0, 2)) {
    const ready = conditionsMet(w).count === 5
    alerts.push({
      tone: ready ? 'accent' : 'plain', icon: <IconEye />, action: () => go('watch'),
      body: <><b>{w.name}</b> تحت سعر الشراء ({buyPrice(w)?.toFixed(2)}).{ready ? ' الشروط الخمسة مكتملة.' : ` اكتمل ${conditionsMet(w).count} من 5 شروط.`}</>,
    })
  }
  if (readOnly) {
    // viewers only see informational items, not to-dos meant for the owner
  } else if (!ibkr?.query_id && accounts.some((a) => a.is_ibkr)) {
    alerts.push({ tone: 'plain', icon: <IconLink />, action: () => go('settings'), body: <>اربط حساب IBKR ليتحدث الجزء العالمي من محفظتك تلقائياً كل صباح.</> })
  } else if (ibkr?.last_status === 'error') {
    alerts.push({ tone: 'warn', icon: <IconLink />, action: () => go('settings'), body: <>تعذّرت آخر مزامنة مع IBKR: {ibkr?.last_message}</> })
  }

  const shownAlerts = readOnly
    ? alerts.filter((a) => !a.owner).map((a) => (a.icon.type === IconScale ? { ...a, action: undefined } : a))
    : alerts

  const mixParts = sleeves.map((s) => ({ key: s.id, value: d.totals.bySleeve[s.id] ?? 0, color: colors[s.id]?.color, opacity: colors[s.id]?.opacity ?? 1, label: s.name }))
  const hasHoldingsValue = holdings.some((h) => Number(h.quantity) * Number(h.price) > 0)

  return (
    <>
      <section className="status" aria-live="polite">
        <p className="kicker">قيمة محفظتك اليوم</p>
        <p className="headline"><span className="figure">{sar(total)}</span></p>
        <p className="muted" style={{ marginTop: 6 }}>
          {total <= 0 ? 'ابدأ بإدخال أرصدتك من صفحة المحفظة.' : d.change != null && d.change !== 0
            ? <><span className={d.change > 0 ? 'good' : 'bad'}>{d.change > 0 ? '+' : '−'}{sar(Math.abs(d.change))}</span> منذ آخر قراءة</>
            : 'تتحدث الأسعار كل صباح تلقائياً.'}
        </p>
      </section>

      <div className="facts">
        <a className="fact" href="#/networth" style={{ color: 'inherit', textDecoration: 'none' }}><div className="v">{sarShort(wealth.nw.net)}</div><div className="l">صافي ثروتك بعد الديون</div></a>
        <a className="fact" href="#/performance" style={{ color: 'inherit', textDecoration: 'none' }}>
          <div className={`v ${wealth.perf.gain < 0 ? 'bad' : ''}`}>{wealth.perf.points.length > 1 ? `${wealth.perf.gain >= 0 ? '+' : ''}${sarShort(wealth.perf.gain)}` : '—'}</div>
          <div className="l">{wealth.perf.points.length > 1 ? `ربحك منذ ${dateShort(wealth.perf.start)} (${wealth.perf.twr >= 0 ? '+' : ''}${pct(wealth.perf.twr)})` : 'يظهر ربحك بعد أيام من البيانات'}</div>
        </a>
        <a className="fact" href="#/payouts" style={{ color: 'inherit', textDecoration: 'none' }}><div className="v">{sarShort(payoutsYear)}</div><div className="l">توزيعات متوقعة خلال 12 شهراً</div></a>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>التوزيع الآن</h2>
          <button className="btn quiet small" onClick={() => go('plan')}>{readOnly ? 'الأوزان' : 'عدّل الأوزان'}</button>
        </div>
        <div className="panel">
          {hasHoldingsValue ? <MixBar parts={mixParts} /> : <p className="muted small">لا قيم بعد؛ أدخل أرصدتك من صفحة المحفظة.</p>}
          <div style={{ marginTop: 8 }}>
            {d.drift.map((x) => {
              const c = colors[x.sleeve.id]
              const out = Math.abs(x.diff) > settings.rebalance_band
              const scale = Math.max(60, ...d.drift.map((y) => Math.max(y.actual, y.target))) * 1.05
              return (
                <div className="alloc-row" key={x.sleeve.id}>
                  <div className="alloc-name"><span className="dot" style={{ background: c?.color, opacity: c?.opacity }} /><span>{x.sleeve.name}</span>
                    {out && <span className={`chip ${x.diff > 0 ? 'warn' : 'bad'}`}><span className="ltr">{x.diff > 0 ? '+' : '−'}{Math.abs(x.diff).toFixed(1)}</span></span>}</div>
                  <div className="alloc-nums">{pct(x.actual)} <span className="muted">من {pct(x.target)}</span></div>
                  <div className="alloc-bar" aria-hidden>
                    <div className="fill" style={{ width: `${(x.actual / scale) * 100}%`, background: c?.color, opacity: c?.opacity }} />
                    <div className="mark" style={{ insetInlineStart: `calc(${(x.target / scale) * 100}% - 1px)` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="tiny muted" style={{ marginTop: 10 }}>الخط الداكن على كل شريط هو الوزن المستهدف{d.totals.unassigned > 0 ? `؛ ${sarShort(d.totals.unassigned)} بلا طبقة غير محسوبة` : ''}.</p>
        </div>
      </section>

      {d.goalStats.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>أهدافك الأخرى</h2><button className="btn quiet small" onClick={() => go('goals')}>التفاصيل</button></div>
          <div className="panel stack" style={{ gap: 14 }}>
            {d.goalStats.slice(0, 4).map((g) => (
              <a key={g.goal.id} href="#/goals" style={{ color: 'inherit', textDecoration: 'none' }}>
                <div className="row between small" style={{ marginBottom: 6 }}>
                  <span>{g.goal.name}</span>
                  <span><b className="figure">{sarShort(g.value)}</b> من {sarShort(Number(g.goal.target_amount))}</span>
                </div>
                <div className="progress"><i style={{ width: `${g.progress * 100}%` }} /></div>
              </a>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>ما يحتاج انتباهك</h2></div>
        <div className="panel flush">
          {shownAlerts.length ? shownAlerts.map((a, i) => (
            <div key={i} className={`alert ${a.tone}`} role={a.action ? 'button' : undefined} tabIndex={a.action ? 0 : undefined}
              style={{ cursor: a.action ? 'pointer' : undefined }} onClick={a.action} onKeyDown={(e) => e.key === 'Enter' && a.action?.()}>
              <div className="ico">{a.icon}</div><p className="grow">{a.body}</p>
            </div>
          )) : (
            <div className="alert accent"><div className="ico"><IconCheck /></div><p>لا شيء يحتاج تدخلك اليوم.</p></div>
          )}
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>آخر تحديث للأسعار وأسعار الصرف: {ago(fxUpdatedAt)}.</p>
      </section>
    </>
  )
}
