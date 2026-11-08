// «صمّم خطتي»: five questions, one per screen, then the whole proposed plan (layers, weights, geography, build order,
// reserves, income account, zakat) with one line of reasoning per decision. The owner adopts it, adjusts the weights first,
// or compares it with his active plan. Generic rules (lib/designer.ts); the safe income rate comes from sustain.ts.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps } from '../lib/usePlan'
import { useClassReturns, useCurve } from '../lib/market'
import { sustainInputFromPlan, sustainableIncome } from '../lib/sustain'
import { designPlan, type DesignAnswers, type DesignResult } from '../lib/designer'
import { activePhase, countMonths, normalizePlan, suggestSleeveMap, type PhaseWeight, type PlanDoc } from '../lib/plan'
import {
  ASSET_CLASS_LABEL, EQUITY_CLASSES, GLOBAL_PLATFORMS, PLATFORM_LABEL, ZAKAT_METHOD_LABEL, findInstrument, zakatDefault,
  type AssetClass, type Platform, type ZakatMethod,
} from '../lib/catalog'
import { countryLabel } from '../lib/countries'
import { LAYER_NAMES, LAYER_ORDER } from '../lib/calc'
import { monthName, todayISO } from '../lib/format'
import { haptic, layerColor } from '../lib/ui'
import type { Layer } from '../lib/types'
import { Card, Money, Pct, StackBar } from '../components/kit'
import { Donut } from '../components/viz'
import { NumberField, Sheet } from '../components/ui'
import { Ticker, platformShort, shortName } from '../components/InstrumentCard'
import { IconCheck, IconChevron, IconShield, IconSparkle } from '../components/icons'
import './Design.css'

type Goal = 'income' | 'grow'
type Safe = { rate: number; conf: number; years: number; keep: number | null }
interface Draft {
  goal: Goal | null
  monthly_income: number
  income_year: number
  monthly_expense: number
  emergency_months: 3 | 6 | 9 | 12
  drawdown: 15 | 25 | 35 | 45 | null
  platforms: Platform[]
  direct_pct: 0 | 5 | 10 | null
}

const STEPS = 5
const PLATFORMS: Platform[] = ['derayah', 'derayah_global', 'alrajhi', 'alinma', 'snb', 'albilad', 'sahm', 'ibkr', 'bank', 'mof']
const DD: Array<{ v: 15 | 25 | 35 | 45; label: string }> = [
  { v: 15, label: 'متحفظ' }, { v: 25, label: 'متوازن' }, { v: 35, label: 'نمو' }, { v: 45, label: 'نمو مرتفع' },
]
const pick = <T,>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d)
const COLOR_GEO = ['var(--growth)', 'var(--accent)', 'var(--income)', 'var(--hedge)', 'var(--safety)', 'var(--mint)', 'var(--ink-3)']
/** «85 ألفاً» · «55 ألفاً» */
const thousands = (n: number) => `${n} ألفاً`

/** ± max(2, round(25%)); under 4 → ± 1.5; direct → 0 to target + 3 (the designer's rule) */
function bandFor(key: string, t: number): PhaseWeight {
  const r05 = (v: number) => Math.round(v * 2) / 2
  if (!(t > 0)) return { target: 0, min: 0, max: 0 }
  if (key === 'direct') return { target: t, min: 0, max: Math.min(100, t + 3) }
  const d = t < 4 ? 1.5 : Math.max(2, Math.round(0.25 * t))
  return { target: t, min: Math.max(0, r05(t - d)), max: Math.min(100, r05(t + d)) }
}

/** The designed document with the owner's weights for today's phase. */
function withWeights(doc: PlanDoc, over: Record<string, number> | null): PlanDoc {
  if (!over) return doc
  const [first, ...rest] = doc.phases
  if (!first) return doc
  const weights = { ...first.weights }
  for (const [k, t] of Object.entries(over)) weights[k] = bandFor(k, t)
  return { ...doc, phases: [{ ...first, weights }, ...rest] }
}

export default function Design({ param }: { param?: string }) {
  const { settings, readOnly, fx, sleeves } = useStore()
  const { doc: active, active: activeRow, today } = usePlan()
  const ops = usePlanOps()
  const year = Number(today.slice(0, 4))
  const compareFirst = param === 'compare'

  // ---- answers, prefilled from the active plan's profile ----
  const [d, setD] = useState<Draft>(() => {
    const pr = active?.profile
    const iy = pr?.income_year ?? (active?.income?.start ? Number(active.income.start.slice(0, 4)) : settings?.income_start_year ?? null)
    const mi = active?.goal.monthly_income ?? (settings?.monthly_income_target || null)
    return {
      goal: pr ? (pr.income_year != null ? 'income' : 'grow') : iy != null || mi ? 'income' : null,
      monthly_income: Number(mi) || 0,
      income_year: iy ?? year + 15,
      monthly_expense: Number(active?.emergency?.monthly_expense) || 0,
      emergency_months: pick(pr?.emergency_months ?? active?.emergency?.months, [3, 6, 9, 12] as const, 6),
      drawdown: pr ? pick(pr.drawdown, [15, 25, 35, 45] as const, 25) : null,
      platforms: pr?.platforms?.length ? pr.platforms : [],
      direct_pct: pr ? pick(pr.direct_pct, [0, 5, 10] as const, 0) : null,
    }
  })
  const complete = !!d.goal && d.drawdown != null && d.platforms.length > 0 && d.direct_pct != null && (d.goal === 'grow' || (d.monthly_income > 0 && d.income_year >= year))
  const [step, setStep] = useState(() => (compareFirst && complete ? STEPS : 0))
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))

  const answers: DesignAnswers | null = complete ? {
    monthly_income: d.goal === 'income' ? d.monthly_income : null,
    income_year: d.goal === 'income' ? d.income_year : null,
    monthly_expense: d.monthly_expense > 0 ? d.monthly_expense : null,
    emergency_months: d.emergency_months, drawdown: d.drawdown!, platforms: d.platforms, direct_pct: d.direct_pct!,
    safe_rate_pct: null, today,
  } : null

  // ---- the safe income rate for the designed mix (historical simulation), after the first paint ----
  const base = useMemo(() => (answers ? designPlan(answers) : null), [JSON.stringify(answers)]) // eslint-disable-line react-hooks/exhaustive-deps
  const { returns } = useClassReturns()
  const curve = useCurve()
  const [safe, setSafe] = useState<Safe | null | 'none'>(null)
  useEffect(() => {
    if (step < STEPS || !base) return
    if (!Object.keys(returns).length) return
    let live = true
    setSafe(null)
    const t = window.setTimeout(() => {
      try {
        const input = sustainInputFromPlan({ doc: base.doc, holdings: [], accounts: [], fx, returns, curve, basis: 'income', value: 1_000_000, horizonYears: 10 })
        const r = sustainableIncome(input)
        // the cautious level of «the money lasts»: income constant in real terms, zakat paid, 90% of the scenarios
        const lv = r.longevity.find((l) => l.confidence === 0.9 && l.annualPct > 0)
        const keep = r.levels.find((l) => l.confidence === 0.5)?.annualPct ?? null
        if (live) setSafe(lv ? { rate: Math.round(lv.annualPct * 10) / 10, conf: lv.confidence, years: r.longevityYears, keep: keep != null ? Math.round(keep * 10) / 10 : null } : 'none')
      } catch { if (live) setSafe('none') }
    }, 60)
    return () => { live = false; window.clearTimeout(t) }
  }, [step, base, returns, curve, fx])
  const result: DesignResult | null = useMemo(() => {
    if (!answers) return null
    const rate = safe && safe !== 'none' ? safe.rate : null
    return designPlan({ ...answers, safe_rate_pct: rate })
  }, [base, safe]) // eslint-disable-line react-hooks/exhaustive-deps

  const [over, setOver] = useState<Record<string, number> | null>(null)
  useEffect(() => { setOver(null) }, [base])
  const doc = result ? withWeights(result.doc, over) : null
  const sumOk = !doc || Math.abs(doc.sleeves.reduce((a, s) => a + (Number(doc.phases[0]?.weights[s.key]?.target) || 0), 0) - 100) <= 0.5

  // ---- adopt ----
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const adopt = async (mode: 'new' | 'replace') => {
    if (!doc || readOnly) return
    haptic(); setBusy(true)
    let row
    if (mode === 'replace' && active && activeRow) {
      // keep what the owner wrote that the designer does not decide
      const next: PlanDoc = normalizePlan({
        ...doc, contributions: active.contributions, reviews: active.reviews, custom_instruments: active.custom_instruments,
        state: { ...doc.state, income_year: active.state.income_year, income_annual: active.state.income_annual },
      }, today)
      row = await ops.importDoc(next, 'replace', suggestSleeveMap(next, sleeves))
    } else {
      row = await ops.create(normalizePlan(doc, today), { activate: true })
    }
    setBusy(false); setAsking(false)
    if (row) location.hash = '/plan/structure'
  }

  const canNext = step === 0 ? !!d.goal && (d.goal === 'grow' || (d.monthly_income > 0 && d.income_year >= year && d.income_year <= year + 60))
    : step === 1 ? true : step === 2 ? d.drawdown != null : step === 3 ? d.platforms.length > 0 : step === 4 ? d.direct_pct != null : true
  const go = (n: number) => { haptic(); setStep(Math.max(0, Math.min(STEPS, n))); window.scrollTo({ top: 0 }) }

  if (readOnly) return <div className="card"><p className="small muted">التصميم لصاحب المحفظة.</p></div>

  if (step >= STEPS && result && doc) {
    return (
      <div className="dz">
        <Result result={result} doc={doc} safe={safe} answers={answers!} over={over} setOver={setOver} active={active} compareFirst={compareFirst} />
        <div className="dz-foot">
          <button type="button" className="btn ghost" onClick={() => go(0)}>غيّر الإجابات</button>
          <button type="button" className="btn primary grow" disabled={busy || !sumOk} onClick={() => (active ? setAsking(true) : adopt('new'))}>{busy ? 'يحفظ…' : sumOk ? 'اعتمد هذه الخطة' : 'اجعل المجموع 100%'}</button>
        </div>
        {asking && active && activeRow && (
          <Sheet title="اعتماد الخطة" onClose={() => setAsking(false)}>
            <div className="stack dz-ask">
              <button type="button" className="type-tile" disabled={busy} onClick={() => adopt('replace')}>
                <span className="ico"><IconCheck /></span>
                <span className="grow"><b>استبدل خطتي الحالية</b><span>«{activeRow.name}» تأخذ الخطة الجديدة، وتبقى أصولك وإيداعاتك ومراجعاتك</span></span>
              </button>
              <button type="button" className="type-tile" disabled={busy} onClick={() => adopt('new')}>
                <span className="ico"><IconSparkle /></span>
                <span className="grow"><b>احفظها خطة جديدة</b><span>تصبح النشطة، وتبقى خطتك الحالية في قائمة خططك</span></span>
              </button>
            </div>
          </Sheet>
        )}
      </div>
    )
  }

  return (
    <div className="dz">
      <div className="dz-dots" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label="تقدم الأسئلة">
        {Array.from({ length: STEPS }, (_, i) => <i key={i} className={i < step ? 'done' : i === step ? 'on' : ''} />)}
      </div>

      {step === 0 && (
        <Q title="ما هدفك؟" sub="يحدد كيف تُبنى المحفظة ومتى تقل مخاطرها">
          <div className="dz-tiles two">
            <Choice on={d.goal === 'income'} onClick={() => set({ goal: 'income' })} title="دخل شهري" text="مبلغ ثابت تسحبه كل شهر من سنة تحددها" />
            <Choice on={d.goal === 'grow'} onClick={() => set({ goal: 'grow' })} title="تنمية الثروة فقط" text="بلا موعد للسحب، النمو أولاً" />
          </div>
          {d.goal === 'income' && (
            <div className="dz-fields">
              <NumberField label="الدخل الشهري الذي تريده" value={d.monthly_income} suffix="ريال" min={0} onChange={(v) => set({ monthly_income: v })} hint="بقيمة اليوم" />
              <NumberField label="سنة بدء الدخل" value={d.income_year} plain min={year} max={year + 60} onChange={(v) => set({ income_year: Math.round(v) })}
                hint={d.income_year >= year ? yearsText(d.income_year - year) : 'اختر سنة قادمة'} />
            </div>
          )}
        </Q>
      )}

      {step === 1 && (
        <Q title="مصروفك الشهري" sub="منه يُحسب صندوق الطوارئ، ويُبنى قبل أي استثمار">
          <div className="dz-fields">
            <NumberField label="ما تصرفه في الشهر تقريباً" value={d.monthly_expense} suffix="ريال" min={0} onChange={(v) => set({ monthly_expense: v })} hint="يمكنك كتابته لاحقاً" />
          </div>
          <p className="dz-label">كم شهراً يغطي صندوق الطوارئ؟</p>
          <div className="dz-tiles four">
            {([3, 6, 9, 12] as const).map((m) => (
              <Choice key={m} on={d.emergency_months === m} onClick={() => set({ emergency_months: m })}
                title={<><bdi dir="ltr">{m}</bdi> {m > 10 ? 'شهراً' : 'أشهر'}</>}
                text={d.monthly_expense > 0 ? <Money v={m * d.monthly_expense} short /> : m === 6 ? 'الأكثر شيوعاً' : m === 3 ? 'دخل ثابت جداً' : m === 12 ? 'دخل متقلب' : ''} />
            ))}
          </div>
        </Q>
      )}

      {step === 2 && (
        <Q title="أقصى هبوط مؤقت تتحمله دون أن تبيع" sub="الأسواق تهبط ثم تتعافى؛ من يبيع وقت الهبوط يخسر">
          <div className="dz-tiles dd">
            {DD.map((x) => (
              <Choice key={x.v} on={d.drawdown === x.v} onClick={() => set({ drawdown: x.v })}
                title={<>{x.label} <span className="dz-dd"><Pct v={-x.v} digits={0} /></span></>}
                text={<>
                  <span className="dz-ddbar" aria-hidden><i style={{ width: `${100 - x.v}%` }} /><i className="lost" style={{ width: `${x.v}%` }} /></span>
                  100 ألف تصبح {thousands(100 - x.v)} مؤقتاً
                </>} />
            ))}
          </div>
          <p className="dz-note">كلما زاد ما تتحمله زادت حصة الأسهم ونموها المتوقع على المدى الطويل.</p>
        </Q>
      )}

      {step === 3 && (
        <Q title="أين تستطيع الاستثمار؟" sub="اختر كل المنصات التي لديك حساب فيها أو تنوي فتحه">
          <div className="dz-chips" role="group" aria-label="المنصات">
            {PLATFORMS.map((p) => {
              const on = d.platforms.includes(p)
              return (
                <button key={p} type="button" aria-pressed={on} onClick={() => { haptic(); set({ platforms: on ? d.platforms.filter((x) => x !== p) : [...d.platforms, p] }) }}>
                  {on && <IconCheck width={15} height={15} />}{PLATFORM_LABEL[p]}{GLOBAL_PLATFORMS.includes(p) && <span className="dz-glob">عالمي</span>}
                </button>
              )
            })}
          </div>
          <p className="dz-note">{d.platforms.some((p) => GLOBAL_PLATFORMS.includes(p)) ? 'منصة عالمية تتيح أسهم العالم وصكوكاً بالدولار لتنويع أوسع.' : 'بلا منصة عالمية تكون الأسهم كلها سعودية.'}</p>
        </Q>
      )}

      {step === 4 && (
        <Q title="أسهم تختارها بنفسك؟" sub="جزء صغير لأسهم مباشرة، والباقي صناديق مؤشرات">
          <div className="dz-tiles three">
            <Choice on={d.direct_pct === 0} onClick={() => set({ direct_pct: 0 })} title="لا" text="صناديق مؤشرات فقط" />
            <Choice on={d.direct_pct === 5} onClick={() => set({ direct_pct: 5 })} title={<Pct v={5} digits={0} />} text="جزء صغير للتجربة" />
            <Choice on={d.direct_pct === 10} onClick={() => set({ direct_pct: 10 })} title={<Pct v={10} digits={0} />} text="أتابع الشركات بانتظام" />
          </div>
        </Q>
      )}

      <div className="dz-foot">
        {step > 0 ? <button type="button" className="btn ghost" onClick={() => go(step - 1)}><IconChevron style={{ transform: 'scaleX(-1)' }} />السابق</button> : <a className="btn ghost" href="#/plan/doc">إلغاء</a>}
        <button type="button" className="btn primary grow" disabled={!canNext} onClick={() => go(step + 1)}>{step === STEPS - 1 ? 'اعرض خطتي' : 'التالي'}</button>
      </div>
    </div>
  )
}

function Q({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return <section className="dz-q"><h2>{title}</h2><p className="dz-sub">{sub}</p>{children}</section>
}
function Choice({ on, onClick, title, text }: { on: boolean; onClick: () => void; title: ReactNode; text?: ReactNode }) {
  return (
    <button type="button" className="dz-tile" aria-pressed={on} onClick={() => { haptic(); onClick() }}>
      <b>{title}</b>{text ? <span>{text}</span> : null}
      <i className="dz-tick" aria-hidden>{on && <IconCheck />}</i>
    </button>
  )
}

// =====================================================================================
// Result
// =====================================================================================
const isEq = (c: AssetClass | null) => !!c && EQUITY_CLASSES.includes(c)
const yearsText = (n: number) => (n <= 0 ? 'هذه السنة' : n === 1 ? 'بعد سنة' : n === 2 ? 'بعد سنتين' : n <= 10 ? `بعد ${n} سنوات` : `بعد ${n} سنة`)

function Result({ result, doc, safe, answers, over, setOver, active, compareFirst }: {
  result: DesignResult; doc: PlanDoc; safe: Safe | null | 'none'; answers: DesignAnswers
  over: Record<string, number> | null; setOver: (o: Record<string, number> | null) => void; active: PlanDoc | null; compareFirst: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [comparing, setComparing] = useState(compareFirst && !!active)
  const ph = doc.phases[0]
  const w = (k: string) => Number(ph?.weights[k]?.target) || 0
  const sum = doc.sleeves.reduce((a, s) => a + w(s.key), 0)
  const order = [...doc.sleeves].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
  const byLayer = LAYER_ORDER.map((l) => ({ key: l, label: LAYER_NAMES[l], color: layerColor(l), value: doc.sleeves.filter((s) => s.layer === l).reduce((a, s) => a + w(s.key), 0) })).filter((x) => x.value > 0)
  const equity = doc.sleeves.filter((s) => isEq(s.class)).reduce((a, s) => a + w(s.key), 0)
  const geo = Object.entries(result.geography).sort((a, b) => b[1] - a[1])
  const geoTop = geo.slice(0, 5)
  const geoRest = geo.slice(5).reduce((a, [, v]) => a + v, 0)
  const year = Number(todayISO().slice(0, 4))
  const em = doc.emergency
  const inc = doc.income
  const rate = inc?.annual_pct ?? (safe && safe !== 'none' ? safe.rate : 4)
  const emFirst = em?.instruments[0] ? findInstrument(em.instruments[0]) : null
  const incFirst = inc?.instruments[0] ? findInstrument(inc.instruments[0]) : null
  // zakat by method
  const zk = new Map<ZakatMethod, { weight: number; names: string[] }>()
  for (const s of doc.sleeves) {
    const z = zakatDefault(s.class)
    if (!z || !s.class || !(w(s.key) > 0)) continue
    const g = zk.get(z.method) ?? { weight: 0, names: [] }
    g.weight += w(s.key)
    if (!g.names.includes(ASSET_CLASS_LABEL[s.class])) g.names.push(ASSET_CLASS_LABEL[s.class])
    zk.set(z.method, g)
  }
  const step = (k: string, dv: number) => {
    haptic()
    const cur = { ...(over ?? Object.fromEntries(doc.sleeves.map((s) => [s.key, w(s.key)]))) }
    cur[k] = Math.max(0, Math.min(100, Math.round(((cur[k] ?? 0) + dv) * 2) / 2))
    setOver(cur)
  }

  return <>
    <section className="hero dz-hero" aria-label="الخطة المقترحة">
      <div className="hero-top"><span>الخطة المقترحة</span><span className="ph-chip">{DD.find((x) => x.v === answers.drawdown)?.label}</span></div>
      <div className="dz-hero-row">
        <Donut size={128} thickness={15} title="التوزيع حسب الطبقة" parts={byLayer.map((l) => ({ key: l.key, value: l.value, color: l.color, label: l.label }))}>
          <b className="figure"><Pct v={equity} digits={0} /></b><span>أسهم</span>
        </Donut>
        <div className="dz-hero-legend">
          {byLayer.map((l) => <span key={l.key}><i style={{ background: l.color }} />{l.label}<b><Pct v={l.value} /></b></span>)}
        </div>
      </div>
      <div className="dz-split">
        <div className="dz-split-bar"><i style={{ width: `${equity}%` }} /></div>
        <div className="dz-split-txt"><span>أسهم <Pct v={equity} /></span><span>دفاعية <Pct v={100 - equity} /></span></div>
      </div>
    </section>

    {comparing && active && <CompareCard mine={active} rec={doc} onClose={() => setComparing(false)} />}

    <Card flush className="dz-layers" title={<>الطبقات وترتيب البناء{editing && <span className={`chip ${Math.abs(sum - 100) <= 0.5 ? 'accent' : 'bad'} dz-sum`}>المجموع <Pct v={sum} /></span>}</>}
      action={editing ? { label: 'تم', onClick: () => setEditing(false) } : { label: 'عدّل الأوزان', onClick: () => { haptic(); setEditing(true) } }}>
      {order.map((s, i) => {
        const it = s.instruments[0] ? findInstrument(s.instruments[0]) : null
        const wt = ph?.weights[s.key]
        return (
          <div key={s.key} className="dz-layer">
            <span className="dz-n" style={{ background: layerColor(s.layer) }}>{i + 1}</span>
            <div className="dz-lmain">
              <div className="dz-ltop"><b>{s.name}</b>
                {editing ? (
                  <span className="dz-step">
                    <button type="button" aria-label={`أنقص ${s.name}`} onClick={() => step(s.key, -1)}>−</button>
                    <b className="figure"><Pct v={w(s.key)} /></b>
                    <button type="button" aria-label={`زد ${s.name}`} onClick={() => step(s.key, 1)}>+</button>
                  </span>
                ) : <span className="dz-w"><b className="figure"><Pct v={w(s.key)} /></b>{wt && wt.max > wt.min && <small><bdi dir="ltr">{+wt.min.toFixed(1)}–{+wt.max.toFixed(1)}%</bdi></small>}</span>}
              </div>
              {it ? <span className="dz-inst"><bdi>{shortName(it.name)}</bdi>{it.symbol && <> <Ticker v={it.symbol} /></>}{it.platforms[0] ? ` · ${platformShort(it.platforms[0])}` : ''}{it.ter != null && <> · رسوم <Pct v={it.ter} digits={2} /></>}</span>
                : <span className="dz-inst muted">لا أداة مقترحة على منصاتك بعد</span>}
              <span className="dz-why">{s.note}{s.start_at ? <> · تبدأ حين تبلغ المحفظة <Money v={s.start_at} short /></> : null}{!s.accepts_new_money ? ' · بلا إيداع تلقائي' : ''}</span>
            </div>
          </div>
        )
      })}
      {editing && <div className="dz-editfoot">
        <span className="tiny muted">تتغير أوزان المرحلة الحالية فقط، وتُحسب النطاقات تلقائياً.</span>
        {over && <button type="button" className="btn quiet small" onClick={() => setOver(null)}>أعد المقترح</button>}
      </div>}
    </Card>

    <div className="dz-grid">
      <Card className="dz-geo" title="التوزيع الجغرافي">
        <StackBar parts={[...geoTop.map(([k, v], i) => ({ key: k, value: v, color: COLOR_GEO[i % COLOR_GEO.length], label: countryLabel(k) })), ...(geoRest > 0 ? [{ key: 'rest', value: geoRest, color: 'var(--line-strong)', label: 'أخرى' }] : [])]} />
        <div className="dz-geo-list">
          {geoTop.map(([k, v], i) => <span key={k}><i style={{ background: COLOR_GEO[i % COLOR_GEO.length] }} />{countryLabel(k)}<b><Pct v={v} /></b></span>)}
          {geoRest > 0 && <span><i style={{ background: 'var(--line-strong)' }} />أخرى<b><Pct v={geoRest} /></b></span>}
        </div>
      </Card>

      {doc.phases.length > 1 && (
        <Card className="dz-phases" title="المراحل">
          <ol className="dz-tl">
            {doc.phases.map((p, i) => {
              const eq = doc.sleeves.filter((s) => isEq(s.class)).reduce((a, s) => a + (Number(p.weights[s.key]?.target) || 0), 0)
              const y = Number(p.start.slice(0, 4))
              return (
                <li key={p.key} className={i === 0 ? 'on' : ''}>
                  <b>{p.name}</b>
                  <span>{i === 0 ? 'الآن' : `${monthName(Number(p.start.slice(5, 7)) - 1)} ${y} · ${yearsText(y - year)}`}</span>
                  <span>أسهم <Pct v={eq} /></span>
                </li>
              )
            })}
          </ol>
        </Card>
      )}

      <Card className="dz-reserves" title="الاحتياطيات">
        <div className="dz-res">
          <span className="ico"><IconShield /></span>
          <div><b>صندوق الطوارئ</b>
            <span>{em && em.monthly_expense > 0 ? <><Money v={em.months * em.monthly_expense} /> · </> : null}{em ? `${countMonths(em.months)} من مصروفك` : ''}</span>
            {emFirst && <small>{shortName(emFirst.name)}</small>}
          </div>
        </div>
        {inc && (
          <div className="dz-res">
            <span className="ico inc"><IconSparkle /></span>
            <div><b>حساب الدخل</b>
              <span>دخل {countMonths(inc.treasury_months)}{answers.monthly_income ? <> · <Money v={answers.monthly_income * inc.treasury_months} /></> : null}</span>
              {incFirst && <small>{shortName(incFirst.name)}</small>}
            </div>
          </div>
        )}
      </Card>

      {inc && (
        <Card className="dz-income" title="الدخل الشهري">
          <p className="dz-incline">لتسحب <Money v={answers.monthly_income ?? 0} /> شهرياً بنسبة <b><Pct v={rate} /></b> سنوياً تحتاج محفظة بنحو <b><Money v={doc.goal.target_capital ?? 0} /></b></p>
          <p className="dz-src">{safe === null ? 'نحسب النسبة الآمنة من بيانات تاريخية…'
            : safe === 'none' ? 'نسبة افتراضية شائعة؛ لا تتوفر بيانات تاريخية كافية الآن'
            : `من محاكاة بيانات تاريخية لهذه الخطة: بثقة ${Math.round(safe.conf * 100)}% لا ينفد المال خلال ${safe.years} سنة، والدخل ثابت بقيمته الحقيقية بعد الزكاة والتضخم`}</p>
          {safe && safe !== 'none' && safe.keep != null && safe.keep > 0 && <p className="dz-src">لتبقى قيمة المحفظة الحقيقية بعد 10 سنوات في نصف السيناريوهات: نحو <Pct v={safe.keep} /> سنوياً.</p>}
          <p className="dz-src">يُنقل دخل السنة إلى حساب الدخل مرة واحدة، وتسحب منه مبلغاً ثابتاً كل شهر.</p>
        </Card>
      )}

      <Card className="dz-zakat" title="الزكاة">
        {[...zk].map(([m, g]) => (
          <div key={m} className="kv"><span>{g.names.join('، ')}<small>{ZAKAT_METHOD_LABEL[m]}</small></span><b><Pct v={g.weight} /></b></div>
        ))}
        <p className="tiny muted dz-pad">تختار طريقة كل أصل عند إضافته من دليل الزكاة.</p>
      </Card>
    </div>

    <Card className="dz-why-card" title="لماذا؟">
      <ul className="dz-why-list">
        {result.explain.map((x) => <li key={x.key}><b>{x.title}</b><span>{x.text}</span></li>)}
      </ul>
    </Card>

    {active && !comparing && (
      <button type="button" className="btn soft block" onClick={() => { haptic(); setComparing(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>قارن بخطتي</button>
    )}
    <p className="dz-disc">توصية عامة مبنية على قواعد شائعة، وليست استشارة مالية مرخّصة.</p>
  </>
}

/** Side by side: the active plan's current weights and the recommendation, by asset class. */
function CompareCard({ mine, rec, onClose }: { mine: PlanDoc; rec: PlanDoc; onClose: () => void }) {
  const { today } = usePlan()
  const phM = activePhase(mine, today) ?? mine.phases[0]
  const phR = rec.phases[0]
  const rows = new Map<string, { label: string; layer: Layer; m: number; r: number }>()
  const add = (cls: AssetClass | null, layer: Layer, name: string, v: number, side: 'm' | 'r') => {
    const k = cls ?? `n:${name}`
    const row = rows.get(k) ?? { label: cls ? ASSET_CLASS_LABEL[cls] : name, layer, m: 0, r: 0 }
    row[side] += v
    rows.set(k, row)
  }
  for (const s of mine.sleeves) add(s.class, s.layer, s.name, Number(phM?.weights[s.key]?.target) || 0, 'm')
  for (const s of rec.sleeves) add(s.class, s.layer, s.name, Number(phR?.weights[s.key]?.target) || 0, 'r')
  const list = [...rows.values()].filter((x) => x.m > 0 || x.r > 0).sort((a, b) => b.r - a.r || b.m - a.m)
  const eq = (doc: PlanDoc, ph: typeof phM) => doc.sleeves.filter((s) => isEq(s.class)).reduce((a, s) => a + (Number(ph?.weights[s.key]?.target) || 0), 0)
  const em = eq(mine, phM), er = eq(rec, phR)
  const diff = (a: number, b: number) => {
    const d = Math.round((b - a) * 10) / 10
    return <span className={`dz-diff ${Math.abs(d) < 0.5 ? '' : d > 0 ? 'up' : 'down'}`}>{Math.abs(d) < 0.5 ? '—' : <Pct v={d} signed />}</span>
  }
  return (
    <Card flush className="dz-cmp" title="مقارنة بخطتك" action={{ label: 'أخفِ', onClick: onClose }}>
      <div className="dz-crow dz-chead"><span /><span>خطتك</span><span>المقترح</span><span>الفرق</span></div>
      <div className="dz-crow dz-ctot"><span>الأسهم</span><b><Pct v={em} /></b><b><Pct v={er} /></b>{diff(em, er)}</div>
      {list.map((x) => (
        <div key={x.label} className="dz-crow">
          <span><i className="dot" style={{ background: layerColor(x.layer) }} />{x.label}</span>
          <b>{x.m > 0 ? <Pct v={x.m} /> : '—'}</b><b>{x.r > 0 ? <Pct v={x.r} /> : '—'}</b>{diff(x.m, x.r)}
        </div>
      ))}
      <div className="dz-crow"><span>صندوق الطوارئ</span><b>{mine.emergency ? countMonths(mine.emergency.months) : '—'}</b><b>{rec.emergency ? countMonths(rec.emergency.months) : '—'}</b><span /></div>
      <div className="dz-crow"><span>حساب الدخل</span><b>{mine.income ? countMonths(mine.income.treasury_months) : '—'}</b><b>{rec.income ? countMonths(rec.income.treasury_months) : '—'}</b><span /></div>
    </Card>
  )
}
