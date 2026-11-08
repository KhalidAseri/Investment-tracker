import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { usePlan } from '../lib/usePlan'
import { useMarketInputs } from '../lib/market'
import { roadColor } from '../components/RoadmapList'
import { Ticker, shortName } from '../components/InstrumentCard'
import { LAYER_NAMES, LAYER_ORDER } from '../lib/calc'
import { ago, dateLong, dateShort, num0, relativeDays, sarShort, todayISO } from '../lib/format'
import { mainFlows, netWorth, performance, periodStart, PERIODS, type Period } from '../lib/wealth'
import { haptic, layerColor, openAction, useCountUp } from '../lib/ui'
import { AssetRow, Card, DateBadge, Money, Pct, Pill, StackBar, Tile, Chev } from '../components/kit'
import { AreaChart, Donut } from '../components/viz'
import { ActionRow } from '../components/PlanActions'
import { IconAlert, IconChart, IconCheck, IconCoins, IconRefresh, IconScale, IconShield, IconSparkle } from '../components/icons'
import type { PlanView } from '../lib/usePlan'
import type { Go, Route } from '../App'
import type { Goal, Layer } from '../lib/types'
import './Home.css'

const ROUTE_OF: Record<string, Route> = { payouts: 'income', holdings: 'portfolio', income: 'income', deposit: 'deposit', goals: 'goals', calendar: 'calendar', profile: 'home' }

export default function Home({ go }: { go: Go }) {
  const { settings, snapshots, transactions, holdings, accounts, otherAssets, obligations, sleeves, fx, fxUpdatedAt, readOnly, refreshMarket, refreshing, notify } = useStore()
  const d = useDerived()
  const plan = usePlan(useMarketInputs())
  const today = todayISO()
  const total = d?.totals.total ?? 0
  const firstSnap = snapshots.find((s) => Number(s.total_sar) > 0)?.snap_date
  const young = !firstSnap || Date.now() - new Date(firstSnap).getTime() < 35 * 86400000
  const [period, setPeriod] = useState<Period>(young ? 'all' : '1m')
  const [scrub, setScrub] = useState<number | null>(null)

  const flows = useMemo(() => mainFlows(transactions, holdings, accounts), [transactions, holdings, accounts])
  const perf = useMemo(() => performance(snapshots, flows, periodStart(period), total, today), [snapshots, flows, period, total, today])
  const perfAll = useMemo(() => performance(snapshots, flows, undefined, total, today), [snapshots, flows, total, today])
  const nw = useMemo(() => d && netWorth({ invested: d.totals.total, goals: Object.values(d.totals.goals).reduce((a, b) => a + b, 0), outside: d.totals.outside, otherAssets, obligations }), [d, otherAssets, obligations])
  const shown = useCountUp(total)
  if (!settings || !d || !nw) return null

  const pt = scrub != null ? perf.points[scrub] : null
  const heroValue = pt ? pt.value : shown
  const periodLong = PERIODS.find((p) => p.k === period)?.long ?? ''
  const payouts12 = d.payouts.filter((p) => p.kind === 'payout').reduce((a, p) => a + (p.amount ?? 0), 0)
  const nextZakat = [...d.zakatDue].sort((a, b) => a.date.localeCompare(b.date))[0]

  // allocation by layer: actual vs target
  const layerTarget = (l: Layer) => sleeves.filter((s) => s.layer === l).reduce((a, s) => a + Number(s.target_now), 0)
  const layers = LAYER_ORDER.filter((l) => sleeves.some((s) => s.layer === l)).map((l) => ({
    key: l, label: LAYER_NAMES[l], color: layerColor(l), value: d.totals.byLayer[l] ?? 0,
    actual: total ? ((d.totals.byLayer[l] ?? 0) / total) * 100 : 0, target: layerTarget(l),
  }))

  // what to do: the plan's actions engine (data checks too, with or without a plan); viewers get no owner-only items
  const actions = plan.actions
  // out of range: the active plan's bands (same rows as the actions), otherwise each sleeve's band or target ± settings.rebalance_band
  const planBands = !!plan.doc && !!plan.progress
  const outNames = planBands ? plan.progress!.outOfBand.map((b) => b.name) : d.outOfBand.map((x) => x.sleeve.name)
  const hasBands = planBands || sleeves.some((s) => s.band_min != null || s.band_max != null)
  const outN = outNames.length
  const goalTarget = (g: Goal) => (g.kind === 'emergency' && plan.progress && plan.progress.emergency.target > 0 ? plan.progress.emergency.target
    : g.kind === 'income' && plan.progress && plan.progress.treasury.target > 0 ? plan.progress.treasury.target : Number(g.target_amount))

  const soon = d.soon.filter((o) => o.date <= new Date(Date.now() + 31 * 86400000).toISOString().slice(0, 10)).slice(0, 5)
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const top = holdings.filter((h) => !h.archived && !h.goal_id && !(h.account_id && excluded.has(h.account_id)))
    .map((h) => ({ h, v: Number(h.quantity) * Number(h.price) * (fx[String(h.currency || 'SAR').toUpperCase()] ?? 1) }))
    .filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 5)
  const sleeveName = (id: string | null) => sleeves.find((s) => s.id === id)?.name ?? 'بلا طبقة'
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? ''
  const refresh = async () => { haptic(); const r = await refreshMarket('all'); notify(r.message) }

  return (
    <div className="home">
      <div className="home-col main-col">
        {/* hero */}
        <section className="hero" aria-label="قيمة المحفظة">
          <div className="hero-top">
            <span>المحفظة الرئيسية</span>
            {!readOnly && (
              <button className="sync" onClick={refresh} disabled={refreshing} aria-label="حدّث الأسعار الآن">
                <IconRefresh className={refreshing ? 'spin' : ''} />{refreshing ? 'يحدّث…' : `محدّثة ${ago(fxUpdatedAt)}`}
              </button>
            )}
          </div>
          <div className="hero-value">{num0(heroValue)}<small>ريال</small></div>
          <div className="hero-sub">
            {pt ? <><Pill pct={pt.twr} /><span>{dateLong(pt.date)}</span></>
              : perf.points.length > 1 ? <><Pill value={perf.gain} pct={perf.twr} /><span>{period === 'all' && perf.start ? `منذ ${dateShort(perf.start)}` : periodLong}</span></>
              : <span>يظهر ربحك بعد أيام من بدء التسجيل اليومي</span>}
          </div>
          <div className="hero-chart">
            {perf.points.length > 1
              ? <AreaChart key={period} tone="hero" height={128} title="قيمة المحفظة خلال الفترة" points={perf.points.map((p) => ({ date: p.date, value: p.value }))} onScrub={setScrub} />
              : <div className="empty-chart">يحفظ التطبيق قيمة محفظتك كل صباح، ويظهر الرسم بعد يومين.</div>}
          </div>
          {perf.points.length > 1 || !young ? (
            <div className="periods" role="group" aria-label="الفترة">
              {PERIODS.map((p) => <button key={p.k} type="button" aria-pressed={period === p.k} onClick={() => { haptic(); setPeriod(p.k) }}>{p.label}</button>)}
            </div>
          ) : null}
        </section>

        {/* allocation */}
        <Card className="alloc-card" title="توزيع المحفظة" action={{ label: 'التفاصيل', href: '#/analysis' }}>
          {total > 0 ? <>
            <div className="alloc-bars">
              <span className="tiny muted">الحالي</span><StackBar parts={layers.map((l) => ({ key: l.key, value: l.value, color: l.color, label: l.label }))} />
              <span className="tiny muted">المستهدف</span><StackBar thin parts={layers.map((l) => ({ key: l.key, value: l.target, color: l.color, label: l.label }))} />
            </div>
            <div className="legend-grid">
              {layers.map((l) => (
                <div key={l.key} className="legend-item">
                  <i className="dot" style={{ background: l.color }} /><span className="name">{l.label}</span>
                  <span className="val"><Pct v={l.actual} digits={0} /></span><span className="tgt">من <Pct v={l.target} digits={0} /></span>
                </div>
              ))}
            </div>
            <div className={`alloc-status ${outN ? 'warn' : 'good'}`}>
              {outN ? <IconAlert /> : <IconCheck />}
              {outN
                ? <span>{outN === 1 ? `«${outNames[0]}» خارج نطاقها` : outN === 2 ? 'طبقتان خارج نطاقهما' : `${outN} طبقات خارج نطاقها`}
                    {!hasBands && <> (±<bdi dir="ltr">{Number(settings.rebalance_band)}</bdi> {Number(settings.rebalance_band) <= 2 ? 'نقطة' : 'نقاط'})</>}</span>
                : <span>{hasBands ? 'كل الطبقات ضمن نطاقها في خطتك' : 'محفظتك قريبة من أوزانها المستهدفة'}</span>}
            </div>
            {!readOnly && <a className="btn soft block" href="#/deposit" style={{ marginTop: 12 }}>خطّط إيداعك القادم</a>}
          </> : (
            <div className="empty" style={{ padding: '10px 0' }}>
              <p className="small">أضف أصولك ليظهر توزيع محفظتك.</p>
              {!readOnly && <button className="btn primary small" onClick={() => openAction('asset')}>أضف أول أصل</button>}
            </div>
          )}
        </Card>

        {/* biggest holdings */}
        {top.length > 0 && (
          <Card className="top-card" flush title="أكبر أصولك" action={{ label: 'كل الأصول', href: '#/portfolio' }}>
            {top.map(({ h }) => (
              <AssetRow key={h.id} h={h} sleeves={sleeves} fx={fx} total={total} sub={`${sleeveName(h.sleeve_id)}${accountName(h.account_id) ? ` · ${accountName(h.account_id)}` : ''}`}
                onClick={() => go('asset', h.id)} stale={d.staleManual.some((x) => x.id === h.id)} />
            ))}
          </Card>
        )}
      </div>

      <div className="home-col side-col">
        {/* KPI tiles */}
        <div className="tiles">
          <Tile icon={<IconScale />} label="صافي الثروة" href="#/networth" value={<Money v={nw.net} short />}
            sub={nw.owed > 0 ? `بعد ديون ${sarShort(nw.owed)}` : 'كل ما تملكه'} />
          <Tile tone="income" icon={<IconCoins />} label="دخل متوقع خلال سنة" href="#/income" value={<Money v={payouts12} short />}
            sub={payouts12 > 0 ? `نحو ${sarShort(payouts12 / 12)} شهرياً` : 'أضف نسب التوزيع'} />
          <Tile tone="gold" icon={<IconShield />} label={nextZakat ? 'الزكاة القادمة' : 'الزكاة التقديرية'} href="#/income"
            value={<Money v={nextZakat ? nextZakat.amount : d.zakat.amount} short />}
            sub={nextZakat ? `${relativeDays(nextZakat.date)} · ${nextZakat.holding.name}` : 'سنوياً بقيمة اليوم'} />
          <Tile tone="blue" icon={<IconChart />} label="الربح منذ البداية" href="#/analysis"
            value={perfAll.points.length > 1 ? <Money v={perfAll.gain} short signed className={perfAll.gain >= 0 ? 'good' : 'bad'} /> : '—'}
            sub={perfAll.points.length > 1 ? <><Pct v={perfAll.twr} signed /> بعد استبعاد الإيداعات</> : 'بعد أيام من البيانات'} />
        </div>

        {/* what to do (plan actions) */}
        <Card className="attn-card" flush title="ما عليك فعله" action={actions.length ? { label: 'الكل', href: '#/plan' } : null}>
          {actions.length ? <>
            {actions.slice(0, 3).map((a) => <ActionRow key={a.key} a={a} compact />)}
            {actions.length > 3 && (
              <a className="attn-more" href="#/plan">{moreText(actions.length - 3)}<Chev /></a>
            )}
          </> : (
            <div className="attn accent" style={{ cursor: 'default' }}><span className="ico"><IconCheck /></span><p>لا شيء يحتاج تدخلك اليوم<small>الأسعار تتحدث كل صباح تلقائياً</small></p></div>
          )}
        </Card>

        {/* the portfolio's structure at a glance */}
        <StructureCard plan={plan} readOnly={readOnly} />

        {/* upcoming */}
        <Card className="soon-card" flush title="القادم" action={{ label: 'التقويم', href: '#/calendar' }}>
          {soon.length ? soon.map((o, i) => {
            const r = ('route' in o ? ROUTE_OF[(o as { route: string }).route] : undefined) ?? 'calendar'
            return (
              <button key={o.event.id + o.date + i} type="button" className="attn" onClick={() => go(r)}>
                <DateBadge iso={o.date} today={today} />
                <p>{o.event.title}<small>{relativeDays(o.date)}{o.event.note ? ` · ${o.event.note}` : ''}</small></p>
                {o.event.amount ? <span className="amount">{sarShort(o.event.amount)}</span> : <Chev />}
              </button>
            )
          }) : <p className="small muted" style={{ padding: '4px 16px 16px' }}>لا مواعيد خلال الشهر القادم.</p>}
        </Card>

        {/* goals */}
        {d.goalStats.length > 0 && (
          <Card className="goals-card" title="أهدافك" action={{ label: 'الكل', href: '#/goals' }}>
            <div className="hscroll">
              {d.goalStats.map((g) => (
                <a key={g.goal.id} href="#/goals" className="goal-mini">
                  {(() => {
                    const t = goalTarget(g.goal)
                    const k = t > 0 ? Math.min(1, g.value / t) : 0
                    return (
                      <Donut size={52} thickness={6} parts={[{ key: 'done', value: k, color: 'var(--accent)' }, { key: 'rest', value: Math.max(0, 1 - k), color: 'transparent' }]}>
                        <b style={{ fontSize: 12.5 }}><bdi dir="ltr">{Math.round(k * 100)}%</bdi></b>
                      </Donut>
                    )
                  })()}
                  <span className="grow" style={{ minWidth: 0 }}><b>{g.goal.name}</b><small className="gm-sub"><Money v={g.value} short /> من <Money v={goalTarget(g.goal)} short /></small></span>
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

const moreText = (n: number) => (n === 1 ? 'وإجراء آخر' : n === 2 ? 'وإجراءان آخران' : n <= 10 ? `و${n} إجراءات أخرى` : `و${n} إجراءً آخر`)

/** «هيكل محفظتك»: how complete the structure is, the next priority (what is left, which instrument), and where to deposit. */
function StructureCard({ plan, readOnly }: { plan: PlanView; readOnly: boolean }) {
  const p = plan.progress
  if (!plan.doc || !p) {
    if (readOnly) return null
    return (
      <a className="card plan-card plan-invite" href="#/design" onClick={() => haptic()}>
        <span className="ico"><IconSparkle /></span>
        <p><b>صمّم خطتي</b><small>خمسة أسئلة، ويقترح التطبيق هيكل محفظتك وترتيب بنائها</small></p>
        <Chev />
      </a>
    )
  }
  const st = plan.structure
  const next = plan.roadmap.find((r) => r.status === 'next') ?? null
  const it = next?.pick?.item ?? null
  const inst = it ? shortName(it.name) : next?.pick?.holding?.name ?? null
  return (
    <Card className="plan-card struct-card" title={<>هيكل محفظتك{p.phase && <span className="chip accent sc-phase">مرحلة {p.phase.name}</span>}</>} action={{ label: 'التفاصيل', href: '#/plan/structure' }}>
      {st && <>
        <div className="sc-top"><span className="pc-value"><bdi dir="ltr">{st.pct}%</bdi></span><span className="muted small">مكتمل · <bdi dir="ltr">{st.done}/{st.total}</bdi></span></div>
        <div className="progress sc-bar"><i style={{ width: `${st.pct}%` }} /></div>
      </>}
      {next ? (
        <a className="sc-next" href="#/plan/structure" onClick={() => haptic()}>
          <span className="sc-n" style={{ ['--c' as string]: roadColor(next) }}>{next.order}</span>
          <span className="grow">
            <small>الأولوية الآن</small>
            <b>{next.title}</b>
            <span>{next.remaining > 0.5 ? <>ينقصه <Money v={next.remaining} /></> : next.why}{inst && <> · <bdi>{inst}</bdi>{it?.symbol && <> <Ticker v={it.symbol} /></>}</>}</span>
          </span>
          <Chev />
        </a>
      ) : <p className="small good sc-done"><IconCheck width={16} height={16} /> الهيكل مكتمل الآن</p>}
      {!readOnly && <a className="btn soft block sc-cta" href="#/deposit" onClick={() => haptic()}>أين أضع إيداعي؟</a>}
    </Card>
  )
}
