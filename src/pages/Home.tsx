import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { LAYER_NAMES, LAYER_ORDER } from '../lib/calc'
import { ago, dateLong, dateShort, num0, pct, relativeDays, sarShort, todayISO } from '../lib/format'
import { mainFlows, netWorth, performance, periodStart, PERIODS, type Period } from '../lib/wealth'
import { haptic, layerColor, openAction, useCountUp } from '../lib/ui'
import { AssetRow, Card, DateBadge, Money, Pct, Pill, StackBar, Tile, Chev } from '../components/kit'
import { AreaChart, Donut } from '../components/viz'
import {
  IconAlert, IconChart, IconCheck, IconCoins, IconEye, IconLayers, IconLink, IconPencil, IconRefresh, IconScale, IconShield, IconTarget,
} from '../components/icons'
import { buyPrice, conditionsMet } from './Watchlist'
import type { Go, Route } from '../App'
import type { Layer } from '../lib/types'

const ROUTE_OF: Record<string, Route> = { payouts: 'income', holdings: 'portfolio', income: 'income', deposit: 'deposit', goals: 'goals', calendar: 'calendar', profile: 'home' }

export default function Home({ go }: { go: Go }) {
  const { settings, snapshots, transactions, holdings, accounts, otherAssets, obligations, sleeves, fx, fxUpdatedAt, ibkr, watchlist, readOnly, refreshMarket, refreshing, notify } = useStore()
  const d = useDerived()
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

  // what needs attention
  type Attn = { tone: 'warn' | 'accent' | 'bad' | ''; icon: ReactNode; title: ReactNode; sub?: ReactNode; to: Route; owner?: boolean }
  const attn: Attn[] = []
  if (d.staleManual.length) attn.push({ tone: 'warn', icon: <IconPencil />, title: 'حدّث القيم اليدوية', sub: `${countAssets(d.staleManual.length)} · مضى على آخر تحديث أكثر من شهر`, to: 'update', owner: true })
  if (d.outOfBand.length) attn.push({ tone: 'warn', icon: <IconScale />, title: d.outOfBand.length === 1 ? `«${d.outOfBand[0].sleeve.name}» بعيدة عن وزنها` : `${d.outOfBand.length} طبقات بعيدة عن أوزانها`, sub: 'وجّه إيداعك القادم لتصحيحها', to: 'deposit' })
  if (ibkr?.last_status === 'error') attn.push({ tone: 'bad', icon: <IconLink />, title: 'تعذّرت مزامنة IBKR', sub: ibkr.last_message ?? undefined, to: 'settings', owner: true })
  else if (!ibkr?.query_id && accounts.some((a) => a.is_ibkr)) attn.push({ tone: 'accent', icon: <IconLink />, title: 'اربط حساب IBKR', sub: 'ليتحدث الجزء العالمي تلقائياً', to: 'settings', owner: true })
  if (d.unassigned.length) attn.push({ tone: 'warn', icon: <IconLayers />, title: 'أصول بلا طبقة', sub: `${countAssets(d.unassigned.length)} · حدّد طبقتها لتدخل في التوزيع`, to: 'portfolio', owner: true })
  if (Math.round(d.targetSum.now) !== 100) attn.push({ tone: 'bad', icon: <IconTarget />, title: `مجموع الأوزان المستهدفة ${pct(d.targetSum.now)}`, sub: 'اجعله 100%', to: 'plan', owner: true })
  const noHaul = holdings.filter((h) => !h.archived && h.zakatable !== false && !h.zakat_start && Number(h.quantity) * Number(h.price) > 0)
  if (noHaul.length) attn.push({ tone: '', icon: <IconShield />, title: 'حدّد بداية الحول', sub: `${countAssets(noHaul.length)} · ليصلك تنبيه الزكاة في موعده`, to: 'income', owner: true })
  for (const w of watchlist.filter((x) => conditionsMet(x).priceOk).slice(0, 2)) {
    attn.push({ tone: 'accent', icon: <IconEye />, title: `${w.name} تحت سعر الشراء`, sub: `سعر الشراء ${buyPrice(w)?.toFixed(2)}، اكتمل ${conditionsMet(w).count} من 5 شروط`, to: 'watch' })
  }
  const visibleAttn = readOnly ? attn.filter((a) => !a.owner) : attn

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
            <div className={`alloc-status ${d.outOfBand.length ? 'warn' : 'good'}`}>
              {d.outOfBand.length ? <IconAlert /> : <IconCheck />}
              <span>{d.outOfBand.length ? `${d.outOfBand.length === 1 ? 'طبقة واحدة' : `${d.outOfBand.length} طبقات`} خارج النطاق المسموح (${settings.rebalance_band} نقاط)` : 'محفظتك قريبة من أوزانها المستهدفة'}</span>
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

        {/* attention */}
        <Card className="attn-card" flush title="يحتاج انتباهك">
          {visibleAttn.length ? <>
            {visibleAttn.slice(0, 3).map((a, i) => (
              <button key={i} type="button" className={`attn ${a.tone}`} onClick={() => go(a.to)}>
                <span className="ico">{a.icon}</span>
                <p>{a.title}{a.sub && <small>{a.sub}</small>}</p>
                <Chev />
              </button>
            ))}
            {visibleAttn.length > 3 && <p className="tiny muted" style={{ padding: '0 16px 12px' }}>و{visibleAttn.length - 3 === 1 ? 'تنبيه آخر' : `${visibleAttn.length - 3} تنبيهات أخرى`} بعد إنجاز هذه.</p>}
          </> : (
            <div className="attn accent" style={{ cursor: 'default' }}><span className="ico"><IconCheck /></span><p>لا شيء يحتاج تدخلك اليوم<small>الأسعار تتحدث كل صباح تلقائياً</small></p></div>
          )}
        </Card>

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
                  <Donut size={52} thickness={6} parts={[{ key: 'done', value: g.progress, color: 'var(--accent)' }, { key: 'rest', value: Math.max(0, 1 - g.progress), color: 'transparent' }]}>
                    <b style={{ fontSize: 12.5 }}>{Math.round(g.progress * 100)}%</b>
                  </Donut>
                  <span className="grow" style={{ minWidth: 0 }}><b>{g.goal.name}</b><span><Money v={g.value} short /> من {sarShort(Number(g.goal.target_amount))}</span></span>
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}

const countAssets = (n: number) => (n === 1 ? 'أصل واحد' : n === 2 ? 'أصلان' : n <= 10 ? `${n} أصول` : `${n} أصلاً`)
