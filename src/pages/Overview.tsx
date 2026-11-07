import { useMemo } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { ageAt, plannedPath, yearFrac } from '../lib/calc'
import { ago, dateShort, pct, relativeDays, sar, sarShort } from '../lib/format'
import { MixBar, PathChart } from '../components/charts'
import { IconAlert, IconCalendar, IconCheck, IconLink, IconScale, IconWallet } from '../components/icons'
import type { Go } from '../App'

const yearsText = (n: number) => (n === 1 ? 'بسنة' : n === 2 ? 'بسنتين' : n <= 10 ? `بـ ${n} سنوات` : `بـ ${n} سنة`)

export default function Overview({ go }: { go: Go }) {
  const { settings, sleeves, snapshots, ibkr, fxUpdatedAt, holdings } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const history = useMemo(() => snapshots.map((s) => ({ year: yearFrac(new Date(s.snap_date + 'T12:00:00')), value: Number(s.total_sar) })), [snapshots])
  const planned = useMemo(() => (settings ? plannedPath(settings, settings.independence_year + 2) : []), [settings])
  if (!settings || !d) return null

  const total = d.totals.total
  const fiRounded = d.fi ? Math.round(d.fi) : null
  const tolerance = Math.max(2000, (d.planned ?? 0) * 0.01)
  let headline: JSX.Element
  if (total <= 0) headline = <>ابدأ بإدخال أرصدتك الحالية لنرسم مسارك</>
  else if (d.aheadBy == null) headline = <>بدأ مسارك اليوم، وستظهر مقارنتك بالخطة بعد أول تحديث</>
  else if (Math.abs(d.aheadBy) <= tolerance) headline = <>أنت على خطتك تماماً</>
  else if (d.aheadBy > 0) headline = <>أنت متقدم على خطتك بـ <span className="ahead">{sarShort(d.aheadBy)}</span></>
  else headline = <>أنت متأخر عن خطتك بـ <span className="behind">{sarShort(-d.aheadBy)}</span></>

  const alerts: Array<{ tone: 'warn' | 'accent' | 'plain'; icon: JSX.Element; body: JSX.Element; action?: () => void }> = []
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
  if (Math.round(d.targetSum.now) !== 100 || Math.round(d.targetSum.fi) !== 100) {
    alerts.push({ tone: 'warn', icon: <IconAlert />, action: () => go('plan'), body: <>مجموع الأوزان المستهدفة لا يساوي 100% (الآن {pct(d.targetSum.now)}، عند الاستقلال {pct(d.targetSum.fi)}).</> })
  }
  for (const o of d.soon.slice(0, 4)) {
    alerts.push({
      tone: 'accent', icon: <IconCalendar />, action: () => go('calendar'),
      body: <><b>{o.event.title}</b> {relativeDays(o.date)} ({dateShort(o.date)}){o.event.amount ? `، ${sar(o.event.amount)}` : ''}</>,
    })
  }
  if (d.unassigned.length) {
    alerts.push({ tone: 'warn', icon: <IconWallet />, action: () => go('holdings'), body: <>{d.unassigned.length === 1 ? `«${d.unassigned[0].name}» بلا طبقة` : `${d.unassigned.length} أصول بلا طبقة`}؛ حدّد طبقتها لتُحسب في التوزيع.</> })
  }
  for (const h of d.staleManual.slice(0, 3)) {
    alerts.push({ tone: 'plain', icon: <IconWallet />, action: () => go('holdings'), body: <>حدّث سعر «{h.name}»؛ آخر تحديث {ago(h.price_updated_at)}.</> })
  }
  if (!ibkr?.query_id) {
    alerts.push({ tone: 'plain', icon: <IconLink />, action: () => go('settings'), body: <>اربط حساب IBKR ليتحدث الجزء العالمي من محفظتك تلقائياً كل صباح.</> })
  } else if (ibkr.last_status === 'error') {
    alerts.push({ tone: 'warn', icon: <IconLink />, action: () => go('settings'), body: <>تعذّرت آخر مزامنة مع IBKR: {ibkr.last_message}</> })
  }

  const mixParts = sleeves.map((s) => ({ key: s.id, value: d.totals.bySleeve[s.id] ?? 0, color: colors[s.id]?.color, opacity: colors[s.id]?.opacity ?? 1, label: s.name }))
  const hasHoldingsValue = holdings.some((h) => Number(h.quantity) * Number(h.price) > 0)

  return (
    <>
      <section className="status" aria-live="polite">
        <p className="kicker">محفظتك اليوم <span className="figure">{sar(total)}</span>{d.change != null && d.change !== 0 && (
          <span className={d.change > 0 ? 'good' : 'bad'}> ({d.change > 0 ? '+' : '−'}{sarShort(Math.abs(d.change))} منذ آخر قراءة)</span>
        )}</p>
        <p className="headline">{headline}</p>
        <p className="muted" style={{ marginTop: 6 }}>
          {fiRounded
            ? <>بهذا المسار تبلغ هدفك عام <b className="num">{fiRounded}</b> في سن <b className="num">{ageAt(settings, fiRounded)}</b>{fiRounded > settings.independence_year ? `، بعد موعدك المستهدف (${settings.independence_year}) ${yearsText(fiRounded - settings.independence_year)}` : fiRounded < settings.independence_year ? `، قبل موعدك المستهدف ${yearsText(settings.independence_year - fiRounded)}` : ''}.</>
            : <>لا يبلغ المسار الحالي هدفك خلال 24 سنة؛ ارفع الإيداع أو عدّل الهدف من صفحة المستقبل.</>}
        </p>
      </section>

      <div className="facts">
        <div className="fact"><div className="v">{sarShort(d.incomeNow)}</div><div className="l">دخل شهري ممكن الآن بنسبة {pct(settings.withdrawal_rate)}</div></div>
        <div className="fact"><div className="v">{sarShort(d.capitalToday)}</div><div className="l">المحفظة المطلوبة بقيمة اليوم</div></div>
        <div className="fact"><div className="v">{pct(Math.min(999, d.progress * 100))}</div><div className="l">قطعتها من الطريق</div></div>
      </div>

      <section className="section" aria-label="مسار المحفظة">
        <PathChart settings={settings} proj={d.proj} history={history} planned={planned} fi={d.fi} title="مسار المحفظة حتى الاستقلال" />
        <div className="legend">
          <span><i style={{ background: 'var(--ink)' }} />ما حققته</span>
          <span><i style={{ background: 'var(--accent)' }} />المتوقع بعائد {pct(settings.expected_return)}</span>
          <span><i style={{ background: 'var(--accent)', opacity: 0.25, height: 8 }} />المدى بين {pct(settings.return_low)} و{pct(settings.return_high)}</span>
          <span><i style={{ background: 'var(--horizon)' }} />الهدف مع التضخم</span>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>التوزيع الآن</h2>
          <button className="btn quiet small" onClick={() => go('plan')}>عدّل الأوزان</button>
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
          <p className="tiny muted" style={{ marginTop: 10 }}>الخط الداكن على كل شريط هو الوزن المستهدف لهذا العام{d.totals.unassigned > 0 ? `؛ ${sarShort(d.totals.unassigned)} بلا طبقة غير محسوبة` : ''}.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>ما يحتاج انتباهك</h2></div>
        <div className="panel flush">
          {alerts.length ? alerts.map((a, i) => (
            <div key={i} className={`alert ${a.tone}`} role={a.action ? 'button' : undefined} tabIndex={a.action ? 0 : undefined}
              style={{ cursor: a.action ? 'pointer' : undefined }} onClick={a.action} onKeyDown={(e) => e.key === 'Enter' && a.action?.()}>
              <div className="ico">{a.icon}</div><p className="grow">{a.body}</p>
            </div>
          )) : (
            <div className="alert accent"><div className="ico"><IconCheck /></div><p>لا شيء يحتاج تدخلك اليوم. استمر في الإيداع حسب الخطة.</p></div>
          )}
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>آخر تحديث للأسعار وأسعار الصرف: {ago(fxUpdatedAt)}.</p>
      </section>
    </>
  )
}
