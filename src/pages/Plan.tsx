// «الخطة» tab: what to do now (الإجراءات), how the plan is going (التقدم), and the plan itself (الخطة).
// Everything compares the owner's written plan with actual balances and transactions; nothing is projected.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps, type PlanView } from '../lib/usePlan'
import { addDaysISO, milestonePath, monthEndISO, planActions, type PlanAction } from '../lib/plan'
import { dateLong, dateShort, monthName, num0, relativeDays } from '../lib/format'
import { haptic, layerColor, openAction, useCountUp } from '../lib/ui'
import { Card, Chev, Empty, KV, Money, Pct, Pill, SegLinks } from '../components/kit'
import { Segmented } from '../components/ui'
import { ActionRow } from '../components/PlanActions'
import { BandTrack, PlanChart } from '../components/PlanChart'
import { contributionWhen, counted, monthsText, planGaps, PlanSections, PlanSectionSheet, SECTION_TITLE, type PlanSection } from '../components/PlanEditor'
import { PlanBuilderCard, PlansCard, TransferCard, takeFreshPlan } from '../components/PlanManage'
import { IconAlert, IconChart, IconCheck, IconTarget } from '../components/icons'
import type { Go } from '../App'
import './Plan.css'

type Seg = 'actions' | 'progress' | 'doc'
type Edit = ((s: PlanSection) => void) | undefined

const actionsWord = (n: number) => (n === 1 ? 'إجراء' : n === 2 ? 'إجراءان' : n >= 3 && n <= 10 ? 'إجراءات' : 'إجراءً')
const statusText = (s: 'ahead' | 'behind' | 'on') => (s === 'ahead' ? 'فوق المسار المخطط' : s === 'behind' ? 'دون المسار المخطط' : 'على المسار المخطط')
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** «يناير 2031» */
const monthYear = (iso: string) => `${monthName(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`
/** «5–15%» kept left-to-right */
const Range = ({ a, b }: { a: number; b: number }) => <bdi dir="ltr">{+a.toFixed(1)}–{+b.toFixed(1)}%</bdi>

export default function Plan({ param }: { go?: Go; param?: string }) {
  const view = usePlan()
  const { readOnly } = useStore()
  const seg: Seg = param === 'progress' ? 'progress' : param === 'doc' ? 'doc' : 'actions'
  const [section, setSection] = useState<PlanSection | null>(null)
  const close = useCallback(() => setSection(null), [])
  const edit: Edit = readOnly ? undefined : (s) => { haptic(); setSection(s) }
  if (!view.ctx) return null
  return (
    <div className="plan-page">
      <div className="plan-seg">
        <SegLinks items={[
          { href: '#/plan', label: 'الإجراءات', active: seg === 'actions' },
          { href: '#/plan/progress', label: 'التقدم', active: seg === 'progress' },
          { href: '#/plan/doc', label: 'الخطة', active: seg === 'doc' },
        ]} />
      </div>
      {seg === 'actions' && <ActionsView view={view} />}
      {seg === 'progress' && <ProgressView view={view} edit={edit} />}
      {seg === 'doc' && <DocView view={view} edit={edit} />}
      {section && view.doc && <PlanSectionSheet section={section} onClose={close} />}
    </div>
  )
}

/** Ahead / behind pill with its words, for the emerald hero. */
function StatusLine({ view }: { view: PlanView }) {
  const p = view.progress
  if (!view.doc || !p) return <span>لا توجد خطة نشطة</span>
  if (p.status == null || p.gap == null) return <span>أضف محطات لتقارن تقدمك بخطتك</span>
  return <><Pill value={p.gap} pct={p.gapPct} /><span>{statusText(p.status)}</span></>
}

// =====================================================================================
// الإجراءات
// =====================================================================================
function ActionsView({ view }: { view: PlanView }) {
  const { doc, ctx, actions, today, progress: p } = view
  const { readOnly, notify } = useStore()
  const ops = usePlanOps()
  const [showHidden, setShowHidden] = useState(false)
  const hidden = useMemo(() => (ctx && doc ? planActions(ctx, { includeDismissed: true }).filter((a) => a.dismissible && doc.state.dismissed[a.key]) : []), [ctx, doc])
  const monthEnd = monthEndISO(today)
  const now: PlanAction[] = [], month: PlanAction[] = [], later: PlanAction[] = []
  for (const a of actions) {
    if (a.priority <= 2 || (a.due && a.due <= today)) now.push(a)
    else if (a.priority === 3 || (a.due && a.due <= monthEnd)) month.push(a)
    else later.push(a)
  }
  const dismiss = async (a: PlanAction) => { if (await ops.dismiss(a.key)) notify('أُخفي الإجراء') }
  const restoreAll = async () => { if (doc) { haptic(); await ops.save({ ...doc, state: { ...doc.state, dismissed: {} } }); setShowHidden(false) } }
  const n = actions.length
  const group = (title: string, list: PlanAction[], cls: string) => list.length > 0 && (
    <Card flush className={`ph-group ${cls}`} title={<>{title}<span className="pd-sub">{list.length}</span></>}>
      {list.map((a) => <ActionRow key={a.key} a={a} onDismiss={doc ? dismiss : undefined} />)}
    </Card>
  )
  return (
    <div className="ph-cols">
      <div className="ph-col">
        <section className="hero ph-hero" aria-label="ما عليك فعله الآن">
          <div className="hero-top"><span>ما عليك فعله الآن</span>{p?.phase && <span className="ph-chip">مرحلة {p.phase.name}</span>}</div>
          <div className="hero-value">{n}<small>{n === 0 ? 'إجراءات' : actionsWord(n)}</small></div>
          <div className="hero-sub"><StatusLine view={view} /></div>
          <div className="ph-stats">
            <div><span>الآن</span><b>{now.length}</b></div>
            <div><span>هذا الشهر</span><b>{month.length}</b></div>
            <div><span>لاحقاً</span><b>{later.length}</b></div>
          </div>
        </section>

        {!doc && !readOnly && (
          <a className="banner accent" href="#/plan/doc" onClick={() => haptic()}>
            <span className="ico"><IconTarget /></span>
            <p>ابنِ خطتك<small>أوزان ومحطات وإيداعات، ويخبرك التطبيق بما تفعل</small></p>
            <Chev />
          </a>
        )}

        {n === 0 ? (
          <div className="card"><Empty icon={<IconCheck />} title="لا شيء مطلوب منك الآن" text={doc ? 'خطتك تسير كما كتبتها.' : 'الأسعار تتحدث كل صباح تلقائياً.'} /></div>
        ) : <>
          {group('الآن', now, 'now')}
          {group('هذا الشهر', month, 'month')}
        </>}
      </div>

      <div className="ph-col">
        {group('لاحقاً', later, 'later')}
        {hidden.length > 0 && (
          showHidden ? (
            <Card flush className="ph-group ph-hidden" title={<>المخفية<span className="pd-sub">{hidden.length}</span></>}
              action={readOnly ? { label: 'أخفِها', onClick: () => setShowHidden(false) } : { label: 'أعِدها كلها', onClick: restoreAll }}>
              {hidden.map((a) => <ActionRow key={a.key} a={a} />)}
            </Card>
          ) : (
            <button type="button" className="btn quiet small ph-showhidden" onClick={() => { haptic(); setShowHidden(true) }}>
              أظهر المخفية ({hidden.length})
            </button>
          )
        )}
        {doc && p && (
          <Card className="ph-mini" title="خطتك" action={{ label: 'التقدم', href: '#/plan/progress' }}>
            <KV label="قيمة الخطة" value={<Money v={p.planValue} />} />
            {p.expected != null && <KV label="المتوقع اليوم" value={<Money v={p.expected} />} />}
            {p.nextMilestone && <KV label={<>المحطة القادمة<small>{dateLong(p.nextMilestone.date)}</small></>} value={<Money v={p.nextMilestone.value} />} />}
            {p.nextPhase && <KV label="المرحلة التالية" value={p.nextPhase.name} sub={dateLong(p.nextPhase.start)} />}
          </Card>
        )}
      </div>
    </div>
  )
}

// =====================================================================================
// التقدم
// =====================================================================================
function ProgressView({ view, edit }: { view: PlanView; edit: Edit }) {
  const { doc, progress: p, today } = view
  const { snapshots, readOnly } = useStore()
  const ops = usePlanOps()
  const [win, setWin] = useState<'next' | 'all'>('next')
  const shown = useCountUp(p?.planValue ?? 0)
  const path = useMemo(() => (doc ? milestonePath(doc) : []), [doc])
  const actual = useMemo(() => {
    const pts = snapshots.filter((s) => Number(s.total_sar) > 0).map((s) => ({ date: s.snap_date, value: Number(s.total_sar) })).sort((a, b) => a.date.localeCompare(b.date))
    if (p && p.mainValue > 0 && (!pts.length || pts[pts.length - 1].date < today)) pts.push({ date: today, value: p.mainValue })
    return pts
  }, [snapshots, p, today])
  if (!doc || !p) return <PlanBuilderCard />
  const owner = !readOnly

  // ---- chart window ----
  const lastPath = path.length ? path[path.length - 1].date : null
  const from = doc.baseline?.date ?? path[0]?.date ?? actual[0]?.date ?? today
  let to = win === 'all' ? (lastPath && lastPath > today ? lastPath : today) : (p.nextMilestone?.date ?? (lastPath && lastPath > today ? lastPath : today))
  if (to <= today) to = addDaysISO(today, 30)
  if (to <= from) to = addDaysISO(from, 30)

  // ---- next milestone ----
  const prevVal = p.prevMilestone?.value ?? doc.baseline?.value ?? null
  const nm = p.nextMilestone
  const nmPct = nm && prevVal != null && nm.value !== prevVal ? clamp01((p.planValue - prevVal) / (nm.value - prevVal)) : null

  const e = p.emergency
  const t = p.treasury
  const inc = doc.income
  const c = p.contributions
  const bands = p.bands
  const scale = Math.max(10, Math.ceil((Math.max(0, ...bands.map((b) => Math.max(b.max, b.actual))) * 1.1) / 5) * 5)
  const st = p.steps
  const open = st.list.filter((s) => !s.done)
  const doneSteps = st.list.filter((s) => s.done)
  const orderedOpen = [...open.filter((s) => s.overdue), ...open.filter((s) => !s.overdue)]
  const reviews = [...doc.reviews].sort((a, b) => b.year - a.year)
  const curMonth = Number(today.slice(5, 7))
  const nextReviewYear = p.review.done || (!p.review.due && curMonth > p.review.month) ? p.review.year + 1 : p.review.year

  const stepRow = (s: (typeof st.list)[number]) => (
    <div key={s.step.key} className={`ph-step ${s.done ? 'done' : ''} ${s.overdue ? 'late' : ''}`}>
      <button type="button" className="pe-check" aria-pressed={s.done} disabled={!owner}
        aria-label={s.done ? `أعد «${s.step.title}»` : `أنجزت «${s.step.title}»`}
        onClick={() => { haptic(); ops.markStep(s.step.key, !s.done) }}><IconCheck /></button>
      <p>{s.step.title}
        <small>
          {s.overdue ? <span className="bad">متأخرة · {dateShort(s.due!)}</span> : s.due ? (s.done ? dateShort(s.due) : relativeDays(s.due)) : 'بلا موعد'}
          {s.step.recurring === 'yearly' ? ' · سنوية' : ''}
        </small>
      </p>
    </div>
  )

  return (
    <div className="ph-cols prog">
      <div className="ph-col">
        <section className="hero ph-hero" aria-label="خطتك">
          <div className="hero-top"><span>خطتك</span>{p.phase && <span className="ph-chip">مرحلة {p.phase.name}</span>}</div>
          <div className="hero-value">{num0(shown)}<small>ريال</small></div>
          <div className="hero-sub"><StatusLine view={view} /></div>
          <div className="ph-stats">
            <div><span>المتوقع اليوم</span><b>{p.expected != null ? <Money v={p.expected} short /> : '—'}</b></div>
            <div><span>المحفظة</span><b><Money v={p.mainValue} short /></b></div>
            <div><span>خزانة الدخل</span><b>{t.enabled || p.treasuryValue > 0 ? <Money v={p.treasuryValue} short /> : '—'}</b></div>
          </div>
          {nm ? (
            <div className="ph-next">
              <div className="ph-next-row"><span>المحطة القادمة{nm.label ? ` · ${nm.label}` : ''}</span><b><Money v={nm.value} short /></b></div>
              {nmPct != null && <div className="ph-bar" role="img" aria-label={`اكتمل ${Math.round(nmPct * 100)}% من الطريق إلى المحطة`}><i style={{ width: `${nmPct * 100}%` }} /></div>}
              <div className="ph-next-row tiny"><span>{dateLong(nm.date)} · {relativeDays(nm.date)}</span>{nmPct != null && <span>اكتمل <Pct v={nmPct * 100} digits={0} /></span>}</div>
            </div>
          ) : path.length ? (
            <div className="ph-next"><div className="ph-next-row"><span>تجاوزت آخر محطة في خطتك</span></div></div>
          ) : null}
        </section>

        <Card className="ph-chart" title="المسار المخطط والفعلي">
          {path.length || actual.length > 1 ? <>
            {path.length > 0 && (
              <Segmented label="مدى الرسم" value={win} onChange={(v) => { haptic(); setWin(v) }}
                options={[{ value: 'next', label: 'حتى المحطة القادمة' }, { value: 'all', label: 'كل المحطات' }]} />
            )}
            <PlanChart path={path} actual={actual} today={today} from={from} to={to} />
            {!path.length && owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('milestones')}>أضف محطات لترى مسارك المخطط</button>}
          </> : (
            <Empty title="لا مسار بعد" text="يظهر حين تضيف محطات ويسجّل التطبيق قيمة محفظتك يومياً."
              action={owner ? { label: 'أضف محطات', onClick: () => edit?.('milestones') } : undefined} />
          )}
        </Card>

        {/* weights */}
        <Card className="ph-bands" title="الالتزام بالأوزان">
          {bands.length && p.mainValue > 0 ? <>
            <div className={`alloc-status ${p.outOfBand.length ? 'warn' : 'good'}`}>
              {p.outOfBand.length ? <IconAlert /> : <IconCheck />}
              <span>{p.outOfBand.length ? `${counted(p.outOfBand.length, 'طبقة واحدة', 'طبقتان', 'طبقات', 'طبقة')} خارج النطاق المسموح` : 'كل الطبقات داخل نطاقها'}</span>
            </div>
            <div className="ph-bandlist">
              {bands.map((b) => {
                const out = b.status !== 'ok'
                return (
                  <div key={b.key} className={`ph-band ${out ? 'out' : ''}`}>
                    <div className="ph-band-top">
                      <span className="alloc-name"><i className="dot" style={{ background: layerColor(b.layer) }} /><span>{b.name}</span>{!b.planSleeve && <span className="chip">خارج الخطة</span>}</span>
                      <span className="ph-band-nums"><b><Pct v={b.actual} /></b><span>من <Pct v={b.target} /></span></span>
                    </div>
                    <BandTrack actual={b.actual} target={b.target} min={b.min} max={b.max} scale={scale} color={layerColor(b.layer)} out={out} />
                    {out && (
                      <small className="ph-band-note">
                        {b.status === 'above' ? 'فوق' : 'دون'} النطاق <Range a={b.min} b={b.max} /> · {b.gap < 0 ? 'زيادة' : 'نقص'} <Money v={Math.abs(b.gap)} />
                      </small>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="legend ph-legend">
              <span><i className="lg-band" />النطاق المسموح</span>
              <span><i className="lg-tick" />المستهدف</span>
              <span><i className="lg-dot" />الحالي</span>
            </div>
            <button type="button" className="btn soft block ph-cta" onClick={() => openAction('rebalance')}>أعد التوازن</button>
          </> : <p className="small muted">يظهر حين تضيف أصولاً إلى طبقات خطتك.</p>}
        </Card>

        {/* contributions */}
        <Card className="ph-contrib" title={`الإيداعات في ${c.year}`}>
          {doc.contributions.length ? <>
            <div className="ph-figs">
              <div><span>أودعت</span><b><Money v={c.actual} /></b></div>
              <div><span>المخطط حتى اليوم</span><b><Money v={c.planned} /></b></div>
            </div>
            {c.planned > 0 && <div className="progress ph-progress"><i style={{ width: `${clamp01(c.actual / c.planned) * 100}%`, background: c.actual >= c.planned ? 'var(--good)' : 'var(--accent)' }} /></div>}
            {(c.planned > 0 || c.actual > 0) && (
              <p className={`small ph-diff ${c.diff >= 0 ? 'good' : 'warn'}`}>
                {Math.abs(c.diff) < 1 ? 'مطابق للمخطط' : <>{c.diff > 0 ? 'أكثر من المخطط بـ' : 'أقل من المخطط بـ'} <Money v={Math.abs(c.diff)} /></>}
              </p>
            )}
            <KV label="هذا الشهر" value={<><Money v={c.actualThisMonth} /> <span className="muted ph-of">من <Money v={c.plannedThisMonth} /></span></>} />
            {c.items.map((it) => (
              <KV key={it.contribution.key}
                label={<>{it.contribution.name}<small>{contributionWhen(it.contribution)}</small></>}
                value={it.placeable ? <Money v={it.plannedYtd} /> : <span className="warn small">حدّد شهره</span>}
                sub={it.next ? `التالي ${dateShort(it.next.date)}` : undefined} />
            ))}
            {owner && <a className="btn soft block ph-cta" href="#/deposit" onClick={() => haptic()}>خطّط إيداعك</a>}
          </> : (
            <>
              <p className="small muted">لا مصادر إيداع في خطتك.</p>
              {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('contributions')}>أضف مصادر الإيداع</button>}
            </>
          )}
        </Card>
      </div>

      <div className="ph-col">
        {/* emergency */}
        <Card className="ph-reserve" title="صندوق الطوارئ">
          {e.enabled ? <>
            <div className="ph-fig"><b><Money v={e.value} /></b>{e.target > 0 && <span>من <Money v={e.target} /></span>}</div>
            {e.target > 0 && <div className="progress ph-progress"><i style={{ width: `${e.pct * 100}%`, background: e.shortfall <= 0.5 ? 'var(--good)' : 'var(--accent)' }} /></div>}
            {e.coverMonths != null && <KV label="يغطي" value={`${monthsText(e.coverMonths)} من ${e.months}`} />}
            {e.target > 0 && <KV label="النقص" value={e.shortfall > 0.5 ? <Money v={e.shortfall} /> : <span className="good">مكتمل</span>} />}
            {doc.emergency && !(doc.emergency.monthly_expense > 0) && (
              owner
                ? <button type="button" className="ph-prompt" onClick={() => edit?.('emergency')}><IconAlert />حدّد مصروفك الشهري ليُحسب الهدف<Chev /></button>
                : <p className="small muted">لم يُحدَّد المصروف الشهري.</p>
            )}
            {e.source === 'accounts' && <p className="tiny muted ph-src">من الحسابات المستبعدة من المحفظة</p>}
            {owner && e.shortfall > 0.5 && <button type="button" className="btn primary block ph-cta" onClick={() => openAction('emergency', String(Math.round(e.shortfall)))}>أضف إليه</button>}
          </> : <>
            <p className="small muted">لا صندوق طوارئ في خطتك.</p>
            {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('emergency')}>أضفه</button>}
          </>}
        </Card>

        {/* income treasury */}
        <Card className="ph-treasury" title={<>خزانة الدخل{inc && <span className={`chip ${t.started ? 'accent' : t.building ? 'warn' : ''} ph-state`}>
          {t.started ? 'بدأ الدخل' : t.building ? 'قيد التعبئة' : inc.build_from || inc.start ? `تبدأ في ${monthYear(inc.build_from ?? inc.start!)}` : 'بلا موعد'}</span>}</>}>
          {inc ? <>
            <div className="ph-fig"><b><Money v={t.value} /></b>{t.target > 0 && <span>من <Money v={t.target} /></span>}</div>
            {t.target > 0 && <div className="progress ph-progress"><i style={{ width: `${clamp01(t.value / t.target) * 100}%`, background: 'var(--income)' }} /></div>}
            <KV label="الدخل الشهري" value={<Money v={t.monthlyIncome} />} sub={inc.method === 'fixed' ? 'مبلغ ثابت' : t.approved ? 'معتمد في المراجعة' : 'بقيمة اليوم'} />
            {t.coverMonths != null && <KV label="يغطي" value={`${monthsText(t.coverMonths)} من ${inc.treasury_months}`} />}
            {t.started
              ? <KV label="يوم التحويل" value={<>{inc.transfer_day} من كل شهر</>} sub={t.transferredThisMonth ? 'حُوّل هذا الشهر' : undefined} />
              : <KV label="يبدأ الدخل" value={inc.start ? dateLong(inc.start) : '—'} />}
            {t.holdSales && <p className="ph-hold"><IconAlert /><span>لا تبع الأسهم الآن؛ المحفظة دون قمتها بـ <Pct v={p.drawdown} />. اصرف من الخزانة والتوزيعات.</span></p>}
            {owner && (t.building && t.shortfall > 0.5 || t.started) && (
              <div className="ph-ctas">
                {t.building && t.shortfall > 0.5 && <button type="button" className="btn soft" onClick={() => openAction('treasury', String(t.monthlyMove > 0 ? t.monthlyMove : Math.round(t.shortfall)))}>انقل</button>}
                {t.started && <button type="button" className="btn primary" onClick={() => openAction('withdraw', String(Math.round(t.monthlyIncome)))}>سجّل التحويل</button>}
              </div>
            )}
          </> : <>
            <p className="small muted">غير مفعّلة في خطتك.</p>
            {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('income')}>فعّلها</button>}
          </>}
        </Card>

        {/* steps */}
        <Card flush className="ph-steps" title={<>خطوات التنفيذ{st.total > 0 && <span className="pd-sub"><bdi dir="ltr">{st.done}/{st.total}</bdi></span>}</>}
          action={owner ? { label: 'تعديل', onClick: () => edit?.('steps') } : null}>
          {st.total > 0 ? <>
            <div className="progress ph-steps-bar"><i style={{ width: `${(st.done / st.total) * 100}%` }} /></div>
            {orderedOpen.map(stepRow)}
            {!open.length && <p className="small good ph-pad">أُنجزت كل الخطوات.</p>}
            {doneSteps.length > 0 && (
              <details className="ph-done">
                <summary>المنجزة<span className="pd-sub">{doneSteps.length}</span></summary>
                {doneSteps.map(stepRow)}
              </details>
            )}
          </> : <p className="small muted ph-pad">لا خطوات في خطتك.</p>}
        </Card>

        {/* reviews */}
        <Card className="ph-reviews" title="سجل المراجعات">
          {p.review.due && owner && (
            <a className="banner accent ph-review-cta" href="#/review" onClick={() => haptic()}>
              <span className="ico"><IconCheck /></span>
              <p>حان موعد المراجعة السنوية<small>الزكاة والتطهير وإعادة التوازن ودخل السنة</small></p>
              <span className="attn-cta">ابدأ المراجعة</span>
            </a>
          )}
          {reviews.map((r) => (
            <KV key={r.year} label={<>{r.year}<small>{dateLong(r.date)} · {r.rebalanced ? 'أُعيد التوازن' : 'بلا إعادة توازن'}</small></>}
              value={<Money v={r.value} />}
              sub={r.zakat_paid ? <>زكاة <Money v={r.zakat_paid} /></> : undefined} />
          ))}
          {!reviews.length && <p className="small muted">لا مراجعات بعد.</p>}
          {!p.review.due && <p className="tiny muted ph-nextrev">المراجعة القادمة في {monthName(p.review.month - 1)} {nextReviewYear}</p>}
        </Card>

        <a className="card ph-link" href="#/analysis" onClick={() => haptic()}>
          <span className="ico"><IconChart /></span>
          <span className="grow"><b>التحليل</b><span>الأداء والتنويع والتكاليف</span></span>
          <Chev />
        </a>
      </div>
    </div>
  )
}

// =====================================================================================
// الخطة
// =====================================================================================
function DocView({ view, edit }: { view: PlanView; edit: Edit }) {
  const { doc, plans, active } = view
  const { readOnly } = useStore()
  // a plan just made by the builder: show what it still lacks, highlighted once
  const [fresh, setFresh] = useState(false)
  useEffect(() => { if (active && takeFreshPlan()) { setFresh(true); window.scrollTo({ top: 0 }) } }, [active?.id])
  const gaps = useMemo(() => (doc ? planGaps(doc) : []), [doc])
  if (!doc || !active) {
    return (
      <div className="pd">
        <PlanBuilderCard />
        {plans.length > 0 && <PlansCard />}
      </div>
    )
  }
  return (
    <div className="pd">
      <div className="pd-title">
        <h2>{doc.name}</h2>
        <span className="chip accent">نشطة</span>
        <span className="tiny muted">أُنشئت {dateLong(doc.created)}</span>
      </div>
      {!readOnly && gaps.length > 0 && (
        <Card flush className={`pd-gaps ${fresh ? 'fresh' : ''}`} title={<>أكمل خطتك<span className="pd-sub">{gaps.length}</span></>}>
          {gaps.map((g) => (
            <button key={g.key} type="button" className={`attn ${g.tone}`} onClick={() => edit?.(g.section)}>
              <span className="ico"><IconAlert /></span>
              <p>{g.title}<small>{SECTION_TITLE[g.section]}</small></p>
              <Chev />
            </button>
          ))}
        </Card>
      )}
      <PlanSections doc={doc} onEdit={edit} />
      <div className="pd-manage">
        <PlansCard />
        <TransferCard />
      </div>
    </div>
  )
}
