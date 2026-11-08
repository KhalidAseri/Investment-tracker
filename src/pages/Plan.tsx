// «الخطة» tab: what to do now (الإجراءات), how complete the portfolio's structure is and what to build next (الهيكل),
// and the plan itself (الخطة). Everything compares the owner's written plan with actual balances; nothing is projected.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps, type PlanView } from '../lib/usePlan'
import { useMarketInputs } from '../lib/market'
import { monthEndISO, planActions, type PlanAction } from '../lib/plan'
import type { PlanCheck, RoadmapItem } from '../lib/advisor'
import { dateLong, dateShort, monthName, relativeDays } from '../lib/format'
import { haptic, layerColor, openAction } from '../lib/ui'
import { Card, Chev, Empty, KV, Money, Pct, SegLinks } from '../components/kit'
import { ActionRow } from '../components/PlanActions'
import { BandTrack } from '../components/PlanChart'
import { contributionWhen, counted, monthsText, planGaps, PlanSections, PlanSectionSheet, SECTION_TITLE, type PlanSection } from '../components/PlanEditor'
import { PlanBuilderCard, PlansCard, TransferCard, takeFreshPlan } from '../components/PlanManage'
import { InstrumentCard } from '../components/InstrumentCard'
import { RoadmapList, roadColor } from '../components/RoadmapList'
import { IconAlert, IconChart, IconCheck, IconSparkle } from '../components/icons'
import type { Go } from '../App'
import './Plan.css'

type Seg = 'actions' | 'structure' | 'doc'
type Edit = ((s: PlanSection) => void) | undefined

const actionsWord = (n: number) => (n === 1 ? 'إجراء' : n === 2 ? 'إجراءان' : n >= 3 && n <= 10 ? 'إجراءات' : 'إجراءً')
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** «يناير 2031» */
const monthYear = (iso: string) => `${monthName(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`
/** «5–15%» kept left-to-right */
const Range = ({ a, b }: { a: number; b: number }) => <bdi dir="ltr">{+a.toFixed(1)}–{+b.toFixed(1)}%</bdi>

export default function Plan({ param }: { go?: Go; param?: string }) {
  const market = useMarketInputs()
  const view = usePlan(market)
  const { readOnly } = useStore()
  const seg: Seg = param === 'structure' || param === 'progress' ? 'structure' : param === 'doc' ? 'doc' : 'actions'
  const [section, setSection] = useState<PlanSection | null>(null)
  const close = useCallback(() => setSection(null), [])
  const edit: Edit = readOnly ? undefined : (s) => { haptic(); setSection(s) }
  if (!view.ctx) return null
  return (
    <div className="plan-page">
      <div className="plan-seg">
        <SegLinks items={[
          { href: '#/plan', label: 'الإجراءات', active: seg === 'actions' },
          { href: '#/plan/structure', label: 'الهيكل', active: seg === 'structure' },
          { href: '#/plan/doc', label: 'الخطة', active: seg === 'doc' },
        ]} />
      </div>
      {seg === 'actions' && <ActionsView view={view} />}
      {seg === 'structure' && <StructureView view={view} edit={edit} />}
      {seg === 'doc' && <DocView view={view} edit={edit} />}
      {section && view.doc && <PlanSectionSheet section={section} onClose={close} />}
    </div>
  )
}

/** «صمّم خطتي»: the designer's entry, as a banner. */
function DesignBanner({ compare }: { compare?: boolean }) {
  const { readOnly } = useStore()
  if (readOnly) return null
  return (
    <div className="ph-design">
      <a className="ph-design-main" href="#/design" onClick={() => haptic()}>
        <span className="ico"><IconSparkle /></span>
        <span className="grow"><b>صمّم خطتي</b><span>خمسة أسئلة، ويقترح التطبيق خطة كاملة تعدّلها كما تشاء</span></span>
        <Chev />
      </a>
      {compare && <a className="btn soft small ph-design-cmp" href="#/design/compare" onClick={() => haptic()}>قارن خطتي بالتوصية</a>}
    </div>
  )
}

// =====================================================================================
// الإجراءات
// =====================================================================================
function ActionsView({ view }: { view: PlanView }) {
  const { doc, ctx, actions, today, progress: p } = view
  const { readOnly, notify } = useStore()
  const ops = usePlanOps()
  const [showHidden, setShowHidden] = useState(false)
  const hidden = useMemo(() => (ctx && doc ? planActions(ctx, { includeDismissed: true, roadmap: view.roadmap }).filter((a) => a.dismissible && doc.state.dismissed[a.key]) : []), [ctx, doc, view.roadmap])
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
  const next = view.roadmap.find((r) => r.status === 'next') ?? null
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
          <div className="hero-sub">{view.structure ? <span>اكتمل هيكل محفظتك <Pct v={view.structure.pct} digits={0} /></span> : <span>{doc ? '' : 'لا توجد خطة نشطة'}</span>}</div>
          <div className="ph-stats">
            <div><span>الآن</span><b>{now.length}</b></div>
            <div><span>هذا الشهر</span><b>{month.length}</b></div>
            <div><span>لاحقاً</span><b>{later.length}</b></div>
          </div>
        </section>

        {!doc && <DesignBanner />}

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
          <Card className="ph-mini" title="هيكل محفظتك" action={{ label: 'التفاصيل', href: '#/plan/structure' }}>
            {view.structure && <>
              <KV label="اكتمال الهيكل" value={<Pct v={view.structure.pct} digits={0} />} />
              <div className="progress ph-mini-bar"><i style={{ width: `${view.structure.pct}%` }} /></div>
            </>}
            {next && <KV label="الأولوية الآن" value={next.title} sub={next.remaining > 0.5 ? <>ينقصه <Money v={next.remaining} /></> : undefined} />}
            {p.nextPhase && <KV label="المرحلة التالية" value={p.nextPhase.name} sub={dateLong(p.nextPhase.start)} />}
          </Card>
        )}
      </div>
    </div>
  )
}

// =====================================================================================
// الهيكل
// =====================================================================================
function StructureView({ view, edit }: { view: PlanView; edit: Edit }) {
  const { doc, progress: p, today, roadmap, structure, market } = view
  const { readOnly } = useStore()
  const ops = usePlanOps()
  if (!doc || !p) return <div className="pd"><DesignBanner /><PlanBuilderCard /></div>
  const owner = !readOnly
  const next = roadmap.find((r) => r.status === 'next') ?? null
  const counts = { waiting: roadmap.filter((r) => r.status === 'waiting' || r.status === 'later').length }

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
  const fix = (r: RoadmapItem) => edit?.(r.kind === 'treasury' ? 'income' : 'emergency')

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
    <div className="ph-cols struct">
      <div className="ph-col">
        <section className="hero ph-hero" aria-label="هيكل محفظتك">
          <div className="hero-top"><span>هيكل محفظتك</span>{p.phase && <span className="ph-chip">مرحلة {p.phase.name}</span>}</div>
          <div className="hero-value"><bdi dir="ltr">{structure ? structure.pct : 0}%</bdi><small>مكتمل</small></div>
          <div className="ph-bar ph-hero-bar"><i style={{ width: `${structure?.pct ?? 0}%` }} /></div>
          <div className="ph-stats">
            <div><span>مكتمل</span><b>{structure ? <bdi dir="ltr">{structure.done}/{structure.total}</bdi> : '—'}</b></div>
            <div><span>ينتظر</span><b>{counts.waiting}</b></div>
            <div><span>المحفظة</span><b><Money v={p.mainValue} short /></b></div>
          </div>
        </section>

        {/* the next priority */}
        {next ? (
          <section className="card ph-now" aria-label="الأولوية الآن">
            <div className="ph-now-top">
              <span className="ph-now-n" style={{ ['--c' as string]: roadColor(next) }}>{next.order}</span>
              <div className="grow">
                <span className="ph-kicker">الأولوية الآن</span>
                <h3>{next.title}</h3>
              </div>
            </div>
            <div className="ph-fig"><b><Money v={next.remaining} /></b><span>متبقٍ من <Money v={next.target} /></span></div>
            <div className="progress ph-progress"><i style={{ width: `${Math.min(100, next.pct)}%`, background: roadColor(next) }} /></div>
            <p className="ph-why">{next.why}</p>
            {next.pick && <InstrumentCard pick={next.pick} market={market} amount={next.remaining} />}
            {owner && (
              <div className="ph-ctas">
                <a className="btn soft" href="#/deposit" onClick={() => haptic()}>أين أضع إيداعي؟</a>
                <button type="button" className="btn primary" onClick={() => openAction('buy', next.key)}>اشتريته</button>
              </div>
            )}
          </section>
        ) : roadmap.length > 0 && (
          <div className="card"><Empty icon={<IconCheck />} title="الهيكل مكتمل الآن" text="وزّع إيداعاتك القادمة حسب الأوزان، وتبدأ الطبقات المنتظرة حين تكبر المحفظة." /></div>
        )}

        {/* the build order */}
        {roadmap.length > 0 && (
          <Card flush className="ph-road" title={<>ترتيب البناء<span className="pd-sub">{roadmap.length}</span></>}
            action={owner ? { label: 'عدّل الترتيب', onClick: () => edit?.('sleeves') } : null}>
            <RoadmapList items={roadmap} market={market} onFix={fix} />
          </Card>
        )}

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
                  <div key={b.key} className={`ph-band ${out ? 'out' : ''} ${b.active ? '' : 'wait'}`}>
                    <div className="ph-band-top">
                      <span className="alloc-name"><i className="dot" style={{ background: layerColor(b.layer) }} /><span>{b.name}</span>{!b.planSleeve && <span className="chip">خارج الخطة</span>}{!b.active && <span className="chip">تنتظر</span>}</span>
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

      </div>

      <div className="ph-col">
        <ChecksCard checks={view.checks} />

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
            {owner && e.shortfall > 0.5 && <button type="button" className="btn primary block ph-cta" onClick={() => openAction('buy', 'emergency')}>سجّل شراءً له</button>}
          </> : <>
            <p className="small muted">لا صندوق طوارئ في خطتك.</p>
            {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('emergency')}>أضفه</button>}
          </>}
        </Card>

        {/* income account */}
        <Card className="ph-treasury" title={<>حساب الدخل{inc && <span className={`chip ${t.started ? 'accent' : t.building ? 'warn' : ''} ph-state`}>
          {t.started ? 'بدأ الدخل' : t.building ? 'قيد البناء' : inc.build_from || inc.start ? `يبدأ في ${monthYear(inc.build_from ?? inc.start!)}` : 'بلا موعد'}</span>}</>}>
          {inc ? <>
            <div className="ph-fig"><b><Money v={t.value} /></b>{t.target > 0 && <span>من <Money v={t.target} /></span>}</div>
            {t.target > 0 && <div className="progress ph-progress"><i style={{ width: `${clamp01(t.value / t.target) * 100}%`, background: 'var(--income)' }} /></div>}
            <KV label="الدخل الشهري" value={<Money v={t.monthlyIncome} />} sub={inc.method === 'fixed' ? 'مبلغ ثابت' : t.approved ? 'معتمد في المراجعة' : 'بقيمة اليوم'} />
            {t.coverMonths != null && <KV label="يغطي" value={`${monthsText(t.coverMonths)} من ${inc.treasury_months}`} />}
            {t.started
              ? <KV label="يوم التحويل" value={<>{inc.transfer_day} من كل شهر</>} sub={t.transferredThisMonth ? 'حُوّل هذا الشهر' : undefined} />
              : <KV label="يبدأ الدخل" value={inc.start ? dateLong(inc.start) : '—'} />}
            {t.holdSales && <p className="ph-hold"><IconAlert /><span>لا تبع الأسهم الآن؛ المحفظة دون قمتها بـ <Pct v={p.drawdown} />. اصرف من حساب الدخل والتوزيعات.</span></p>}
            {owner && (t.building && t.shortfall > 0.5 || t.started) && (
              <div className="ph-ctas">
                {t.building && t.shortfall > 0.5 && <button type="button" className="btn soft" onClick={() => openAction('treasury', String(t.monthlyMove > 0 ? t.monthlyMove : Math.round(t.shortfall)))}>انقل</button>}
                {t.started && <button type="button" className="btn primary" onClick={() => openAction('withdraw', String(Math.round(t.monthlyIncome)))}>سجّل التحويل</button>}
              </div>
            )}
          </> : <>
            <p className="small muted">غير مفعّل في خطتك.</p>
            {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('income')}>فعّله</button>}
          </>}
        </Card>

        {/* contributions */}
        <Card className="ph-contrib" title={`الإيداعات في ${c.year}`}>
          {doc.contributions.length ? <>
            <div className="ph-figs">
              <div><span>أودعت</span><b><Money v={c.actual} /></b></div>
              <div><span>المخطط حتى اليوم</span><b><Money v={c.planned} /></b></div>
            </div>
            {c.planned > 0 && <div className="progress ph-progress"><i style={{ width: `${clamp01(c.actual / c.planned) * 100}%`, background: c.actual >= c.planned ? 'var(--good)' : 'var(--accent)' }} /></div>}
            <KV label="هذا الشهر" value={<><Money v={c.actualThisMonth} /> <span className="muted ph-of">من <Money v={c.plannedThisMonth} /></span></>} />
            {c.items.map((it) => (
              <KV key={it.contribution.key}
                label={<>{it.contribution.name}<small>{contributionWhen(it.contribution)}</small></>}
                value={it.placeable ? <Money v={it.plannedYtd} /> : <span className="warn small">حدّد شهره</span>}
                sub={it.next ? `التالي ${dateShort(it.next.date)}` : undefined} />
            ))}
          </> : (
            <>
              <p className="small muted">لا مصادر إيداع في خطتك.</p>
              {owner && <button type="button" className="btn soft small ph-cta" onClick={() => edit?.('contributions')}>أضف مصادر الإيداع</button>}
            </>
          )}
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
          <span className="grow"><b>التحليل</b><span>الأداء والتوزيع والمخاطر والتكاليف</span></span>
          <Chev />
        </a>
      </div>
    </div>
  )
}

/** «فحص الخطة»: the plan against the designer's rules of thumb (problems first). */
function ChecksCard({ checks }: { checks: PlanCheck[] }) {
  const { readOnly } = useStore()
  if (!checks.length) return null
  const bad = checks.filter((c) => c.level === 'bad')
  const warn = checks.filter((c) => c.level === 'warn')
  const ok = checks.filter((c) => c.level === 'ok')
  const issues = [...bad, ...warn]
  return (
    <Card flush className="ph-checks" title="فحص الخطة">
      <div className="ph-check-counts">
        <span className="good"><IconCheck />{ok.length} سليم</span>
        {warn.length > 0 && <span className="warn"><IconAlert />{warn.length} {warn.length === 1 ? 'ملاحظة' : warn.length === 2 ? 'ملاحظتان' : 'ملاحظات'}</span>}
        {bad.length > 0 && <span className="bad"><IconAlert />{bad.length} {bad.length === 1 ? 'خطأ' : 'أخطاء'}</span>}
      </div>
      {issues.map((c) => (
        <div key={c.key} className={`attn ${c.level === 'bad' ? 'bad' : 'warn'} ph-check`} style={{ cursor: 'default' }}>
          <span className="ico"><IconAlert /></span>
          <p>{c.title}<small>{c.detail}</small></p>
          {c.fix?.route && !readOnly && <a className="attn-cta" href={`#/${c.fix.route}`} onClick={() => haptic()}>{c.fix.label}</a>}
        </div>
      ))}
      {ok.length > 0 && (
        <details className="ph-done">
          <summary>السليم<span className="pd-sub">{ok.length}</span></summary>
          {ok.map((c) => (
            <div key={c.key} className="attn accent ph-check" style={{ cursor: 'default' }}>
              <span className="ico"><IconCheck /></span>
              <p>{c.title}<small>{c.detail}</small></p>
            </div>
          ))}
        </details>
      )}
    </Card>
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
        <DesignBanner />
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
        <span className="tiny muted">أُنشئت {dateLong(doc.created)}{doc.profile?.source === 'designer' ? ' · من «صمّم خطتي»' : ''}</span>
      </div>
      <DesignBanner compare />
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
