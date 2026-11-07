// «الخطة» › الخطة: the plan document as section cards, each with its own editor sheet.
// Every editor works on a draft of the whole document and saves it with usePlanOps().save after validatePlan.
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps } from '../lib/usePlan'
import {
  activePhase, addMonthsISO, countAssets, LAYERS, resolveSleeveMap, validatePlan,
  type ContributionKind, type PhaseWeight, type PlanContribution, type PlanDoc, type PlanGoal, type PlanIncome, type PlanSleeve, type PlanStep,
} from '../lib/plan'
import { LAYER_NAMES } from '../lib/calc'
import { dateLong, dateShort, monthName, parseNum } from '../lib/format'
import { haptic, layerColor } from '../lib/ui'
import type { Layer, Sleeve } from '../lib/types'
import { Card, Chev, KV, Money, Pct, StackBar } from './kit'
import { NumberField, Segmented, SelectField, Sheet, Switch, TextField } from './ui'
import { IconAlert, IconCheck, IconClose, IconPlus } from './icons'

// =====================================================================================
// Shared bits
// =====================================================================================
export type PlanSection = 'goal' | 'phases' | 'milestones' | 'contributions' | 'emergency' | 'income' | 'rules' | 'steps'
export const SECTION_TITLE: Record<PlanSection, string> = {
  goal: 'الهدف', phases: 'المراحل والأوزان', milestones: 'المحطات', contributions: 'مصادر الإيداع',
  emergency: 'صندوق الطوارئ', income: 'خزانة الدخل', rules: 'القواعد', steps: 'الخطوات',
}

/** Arabic counted noun: 1, 2, 3–10, 11+ */
export const counted = (n: number, one: string, two: string, few: string, many: string) =>
  (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`)
export const monthsText = (n: number) => {
  const r = Math.round(n * 10) / 10
  return r === 1 ? 'شهر واحد' : r === 2 ? 'شهران' : Number.isInteger(r) && r > 10 ? `${r} شهراً` : `${r} أشهر`
}
export const sleevesText = (n: number) => counted(n, 'طبقة واحدة', 'طبقتان', 'طبقات', 'طبقة')
export const phasesText = (n: number) => counted(n, 'مرحلة واحدة', 'مرحلتان', 'مراحل', 'مرحلة')
export const milestonesText = (n: number) => counted(n, 'محطة واحدة', 'محطتان', 'محطات', 'محطة')
export const stepsText = (n: number) => counted(n, 'خطوة واحدة', 'خطوتان', 'خطوات', 'خطوة')
/** noun after a number of percentage points */
const pointsWord = (n: number) => (Number.isInteger(n) && n >= 3 && n <= 10 ? 'نقاط' : 'نقطة')

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i) }))
const KIND_LABEL: Record<ContributionKind, string> = { monthly: 'شهري', yearly: 'سنوي', once: 'مرة واحدة' }

/** «شهري · يوم 27» · «سنوي · مارس، على 3 دفعات» · «مرة واحدة · 15 أبريل 2027» */
export function contributionWhen(c: PlanContribution) {
  const split = c.split_months && c.split_months > 1 ? `، على ${c.split_months} دفعات` : ''
  if (c.kind === 'monthly') return `شهري · يوم ${c.day ?? 1}`
  if (c.kind === 'yearly') {
    const m = c.month ?? (c.date ? Number(c.date.slice(5, 7)) : null)
    return `سنوي · ${m ? monthName(m - 1) : 'بلا شهر'}${split}`
  }
  return `مرة واحدة · ${c.date ? dateLong(c.date) : 'بلا تاريخ'}${split}`
}

const uniqueKey = (base: string, used: Iterable<string>) => {
  const set = new Set(used)
  let i = 1
  while (set.has(`${base}${i}`)) i++
  return `${base}${i}`
}

export function DateField({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (v: string | null) => void; hint?: string }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="date" className="input pe-date" dir="ltr" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

/** Compact % input for the weights table; reports every keystroke so the sum updates live. */
function MiniNum({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const fmt = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 10) / 10) : '')
  const [text, setText] = useState(fmt(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(fmt(value)) }, [value, focus])
  return (
    <input className="input num pe-mini" inputMode="decimal" aria-label={label} value={text}
      onFocus={(e) => { setFocus(true); const el = e.target; requestAnimationFrame(() => el.select()) }}
      onBlur={() => setFocus(false)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onChange={(e) => { setText(e.target.value); onChange(Math.min(100, Math.max(0, parseNum(e.target.value)))) }} />
  )
}

function Issues({ errors, warnings }: { errors: string[]; warnings: string[] }) {
  if (!errors.length && !warnings.length) return null
  return (
    <div className="pe-issues" role={errors.length ? 'alert' : undefined}>
      {errors.length > 0 && <ul className="pe-errors">{errors.slice(0, 4).map((e) => <li key={e}>{e}</li>)}{errors.length > 4 && <li>و{errors.length - 4} أخرى</li>}</ul>}
      {warnings.length > 0 && <p className="pe-warn"><IconAlert />{warnings.slice(0, 2).join(' · ')}</p>}
    </div>
  )
}

/** Draft + validation + save for one section. Errors that were already in the saved plan don't block unrelated sections. */
function useSection(doc: PlanDoc, section: PlanSection, onClose: () => void) {
  const ops = usePlanOps()
  const [draft, setDraft] = useState<PlanDoc>(doc)
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const before = useMemo(() => validatePlan(doc), [doc])
  const now = useMemo(() => validatePlan(draft), [draft])
  const errors = now.errors.filter((e) => !before.errors.includes(e) || (section === 'phases' && /مرحلة|الشريحة|الطبقات|فئات/.test(e)))
  const warnings = now.warnings.filter((w) => !before.warnings.includes(w))
  const save = async (finish?: (saved: PlanDoc) => PlanDoc, after?: () => Promise<void>) => {
    setTried(true)
    if (errors.length) { haptic(20); return }
    setBusy(true)
    const next = finish ? finish(draft) : draft
    const row = await ops.save(next)
    if (row && after) await after()
    setBusy(false)
    if (row) onClose()
  }
  return { draft, setDraft, errors: tried ? errors : [], warnings, busy, save }
}

function Editor({ title, onClose, busy, onSave, extra, issues, children, saveLabel = 'حفظ' }: {
  title: string; onClose: () => void; busy: boolean; onSave: () => void; extra?: ReactNode; issues?: ReactNode; children: ReactNode; saveLabel?: string
}) {
  return (
    <Sheet title={title} onClose={onClose} footer={<>{issues && <div className="pe-foot-issues">{issues}</div>}{extra}<button type="button" className="btn primary" disabled={busy} onClick={onSave}>{busy ? 'يحفظ…' : saveLabel}</button></>}>
      <div className="stack pe">{children}</div>
    </Sheet>
  )
}

// =====================================================================================
// Section sheets
// =====================================================================================
/** Opens the editor of one section of the active plan. onClose must be stable (Sheet re-focuses when it changes). */
export function PlanSectionSheet({ section, onClose }: { section: PlanSection; onClose: () => void }) {
  const { doc } = usePlan()
  if (!doc) return null
  const props = { doc, onClose }
  switch (section) {
    case 'goal': return <GoalEditor {...props} />
    case 'phases': return <PhasesEditor {...props} />
    case 'milestones': return <MilestonesEditor {...props} />
    case 'contributions': return <ContributionsEditor {...props} />
    case 'emergency': return <EmergencyEditor {...props} />
    case 'income': return <IncomeEditor {...props} />
    case 'rules': return <RulesEditor {...props} />
    case 'steps': return <StepsEditor {...props} />
  }
}

type EP = { doc: PlanDoc; onClose: () => void }

function GoalEditor({ doc, onClose }: EP) {
  const s = useSection(doc, 'goal', onClose)
  const g = s.draft.goal
  const setG = (p: Partial<PlanGoal>) => s.setDraft((x) => ({ ...x, goal: { ...x.goal, ...p } }))
  return (
    <Editor title="الهدف" onClose={onClose} busy={s.busy} onSave={() => s.save()} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <TextField label="اسم الخطة" value={s.draft.name} onChange={(v) => s.setDraft((x) => ({ ...x, name: v }))} />
      <NumberField label="الدخل الشهري المستهدف" value={g.monthly_income} suffix="ريال" onChange={(v) => setG({ monthly_income: v > 0 ? v : null })} />
      <NumberField label="رأس المال المستهدف" value={g.target_capital} suffix="ريال" onChange={(v) => setG({ target_capital: v > 0 ? v : null })} />
      <DateField label="الموعد المستهدف" value={g.target_date} onChange={(v) => setG({ target_date: v })} />
      <TextField label="ملاحظة" value={g.note ?? ''} onChange={(v) => setG({ note: v.trim() ? v : null })} placeholder="مثال: دخل شهري بقيمة اليوم" />
    </Editor>
  )
}

// ---------- phases & weights ----------
type SleeveDraft = { key: string | null; ps: PlanSleeve; link: string }

function PhasesEditor({ doc, onClose }: EP) {
  const { sleeves, holdings, upsert, remove, notify } = useStore()
  const { today } = usePlan()
  const s = useSection(doc, 'phases', onClose)
  const d = s.draft
  const [sel, setSel] = useState(() => activePhase(doc, today)?.key ?? doc.phases[0]?.key ?? '')
  const [sub, setSub] = useState<SleeveDraft | null>(null)
  const resolved = useMemo(() => resolveSleeveMap(d, sleeves), [d, sleeves])
  const linked = new Set(Object.values(resolved).filter(Boolean) as string[])
  const outside = sleeves.filter((x) => !linked.has(x.id))
  const usedBy = (id: string | null | undefined) => (id ? holdings.filter((h) => !h.archived && h.sleeve_id === id).length : 0)
  const phase = d.phases.find((p) => p.key === sel) ?? d.phases[0]
  const live = activePhase(d, today)
  const sum = phase ? d.sleeves.reduce((a, x) => a + (phase.weights[x.key]?.target ?? 0), 0) : 0
  const sumOk = Math.abs(sum - 100) <= 0.5

  const setPhase = (key: string, patch: Partial<(typeof d.phases)[number]>) =>
    s.setDraft((x) => ({ ...x, phases: x.phases.map((p) => (p.key === key ? { ...p, ...patch } : p)) }))
  const setW = (sk: string, field: keyof PhaseWeight, v: number) => {
    if (!phase) return
    const w = phase.weights[sk] ?? { target: 0, min: 0, max: 0 }
    let next: PhaseWeight = { ...w, [field]: v }
    if (field === 'target') {
      // a weight without a band follows the target; a band always contains its target
      if (w.min === w.target && w.max === w.target) next = { target: v, min: v, max: v }
      else next = { target: v, min: Math.min(w.min, v), max: Math.max(w.max, v) }
    }
    setPhase(phase.key, { weights: { ...phase.weights, [sk]: next } })
  }
  const autoBands = () => {
    if (!phase) return
    haptic()
    const weights = Object.fromEntries(d.sleeves.map((x) => {
      const t = phase.weights[x.key]?.target ?? 0
      const w = t > 0 ? Math.max(2, Math.round(t * 0.2)) : 0
      return [x.key, { target: t, min: Math.max(0, t - w), max: Math.min(100, t + w) }]
    }))
    setPhase(phase.key, { weights })
  }
  const addPhase = () => {
    haptic()
    const last = [...d.phases].sort((a, b) => b.start.localeCompare(a.start))[0]
    const key = uniqueKey('p', d.phases.map((p) => p.key))
    let start = last ? addMonthsISO(last.start, 12) : today
    while (d.phases.some((p) => p.start === start)) start = addMonthsISO(start, 1)
    const weights = last ? JSON.parse(JSON.stringify(last.weights)) : Object.fromEntries(d.sleeves.map((x) => [x.key, { target: 0, min: 0, max: 0 }]))
    s.setDraft((x) => ({ ...x, phases: [...x.phases, { key, name: `المرحلة ${x.phases.length + 1}`, start, note: null, weights }] }))
    setSel(key)
  }
  const removePhase = () => {
    if (!phase || d.phases.length < 2) return
    if (!confirm(`احذف مرحلة «${phase.name}»؟`)) return
    const rest = d.phases.filter((p) => p.key !== phase.key)
    s.setDraft((x) => ({ ...x, phases: rest }))
    setSel(rest[0].key)
  }

  // ---- sleeves ----
  const openSleeve = (ps: PlanSleeve | null) => {
    haptic()
    setSub(ps
      ? { key: ps.key, ps: { ...ps }, link: resolved[ps.key] ?? '' }
      : { key: null, ps: { key: '', name: '', layer: 'growth', accepts_new_money: true, note: null }, link: '' })
  }
  const applySleeve = () => {
    if (!sub) return
    const name = sub.ps.name.trim()
    if (!name) { notify('اكتب اسم الطبقة'); return }
    s.setDraft((x) => {
      const map = { ...(x.sleeve_map ?? {}) }
      if (sub.key) {
        if (sub.link) map[sub.key] = sub.link; else delete map[sub.key]
        return { ...x, sleeves: x.sleeves.map((p) => (p.key === sub.key ? { ...sub.ps, key: sub.key!, name } : p)), sleeve_map: map }
      }
      const key = uniqueKey(sub.ps.layer, [...x.sleeves.map((p) => p.key), ...Object.keys(map)])
      if (sub.link) map[key] = sub.link
      return {
        ...x, sleeves: [...x.sleeves, { ...sub.ps, key, name }], sleeve_map: map,
        phases: x.phases.map((p) => ({ ...p, weights: { ...p.weights, [key]: { target: 0, min: 0, max: 0 } } })),
      }
    })
    setSub(null)
  }
  const removeSleeve = () => {
    if (!sub?.key) return
    const n = usedBy(resolved[sub.key])
    if (!confirm(n ? `في «${sub.ps.name}» ${countAssets(n)}. تُزال من الخطة وتبقى أصولها في محفظتك.` : `أزل «${sub.ps.name}» من الخطة؟`)) return
    const key = sub.key
    s.setDraft((x) => {
      const map = { ...(x.sleeve_map ?? {}) }
      delete map[key]
      return {
        ...x, sleeves: x.sleeves.filter((p) => p.key !== key), sleeve_map: map,
        phases: x.phases.map((p) => { const w = { ...p.weights }; delete w[key]; return { ...p, weights: w } }),
        rules: { ...x.rules, crash_sleeves: x.rules.crash_sleeves.filter((k) => k !== key) },
      }
    })
    setSub(null)
  }
  const adopt = (row: Sleeve) => {
    haptic()
    s.setDraft((x) => {
      const key = uniqueKey(row.layer, [...x.sleeves.map((p) => p.key), ...Object.keys(x.sleeve_map ?? {})])
      return {
        ...x, sleeves: [...x.sleeves, { key, name: row.name, layer: row.layer, accepts_new_money: !!row.accepts_new_money, note: row.note }],
        sleeve_map: { ...(x.sleeve_map ?? {}), [key]: row.id },
        phases: x.phases.map((p) => ({ ...p, weights: { ...p.weights, [key]: { target: 0, min: 0, max: 0 } } })),
      }
    })
  }
  const deleteRow = async (row: Sleeve) => {
    if (!confirm(`احذف الطبقة «${row.name}» من محفظتك؟`)) return
    await remove('sleeves', row.id)
    notify('حُذفت الطبقة')
  }

  // linkage frozen on save so a renamed sleeve keeps its row; linked rows take the new name
  const finish = (x: PlanDoc): PlanDoc => {
    const res = resolveSleeveMap(x, sleeves)
    const map = { ...(x.sleeve_map ?? {}) }
    for (const ps of x.sleeves) if (res[ps.key]) map[ps.key] = res[ps.key]!
    return { ...x, sleeve_map: map, phases: [...x.phases].sort((a, b) => a.start.localeCompare(b.start)) }
  }
  const renameRows = async () => {
    const res = resolveSleeveMap(finish(d), sleeves)
    for (const ps of d.sleeves) {
      const row = sleeves.find((x) => x.id === res[ps.key])
      if (row && row.name !== ps.name) await upsert('sleeves', { id: row.id, name: ps.name })
    }
  }

  if (sub) {
    const takenByOthers = new Set(Object.entries(resolved).filter(([k, v]) => k !== sub.key && v).map(([, v]) => v as string))
    const options = [{ value: '', label: 'طبقة جديدة تُنشأ عند الحفظ' }, ...sleeves.filter((x) => !takenByOthers.has(x.id)).map((x) => ({ value: x.id, label: x.name }))]
    const set = (p: Partial<PlanSleeve>) => setSub((v) => (v ? { ...v, ps: { ...v.ps, ...p } } : v))
    return (
      <Sheet title={sub.key ? 'تعديل طبقة' : 'طبقة جديدة'} onClose={onClose} footer={<>
        {sub.key ? <button type="button" className="btn danger" onClick={removeSleeve}>أزلها</button> : <button type="button" className="btn ghost" onClick={() => setSub(null)}>إلغاء</button>}
        <button type="button" className="btn primary" onClick={applySleeve}>{sub.key ? 'تم' : 'أضفها'}</button>
      </>}>
        <div className="stack pe">
          <TextField label="الاسم" value={sub.ps.name} onChange={(v) => set({ name: v })} placeholder="مثال: صكوك حكومية سعودية" />
          <SelectField<Layer> label="المجموعة" value={sub.ps.layer} onChange={(v) => set({ layer: v })} options={LAYERS.map((l) => ({ value: l, label: LAYER_NAMES[l] }))} />
          <Switch label="تقبل الأموال الجديدة" hint="إن أُغلقت لا يوجَّه إليها إيداع" checked={sub.ps.accepts_new_money} onChange={(v) => set({ accepts_new_money: v })} />
          <SelectField label="في محفظتك" value={sub.link} onChange={(v) => setSub((x) => (x ? { ...x, link: v } : x))} options={options} />
          <TextField label="الأداة المقترحة أو ملاحظة" value={sub.ps.note ?? ''} onChange={(v) => set({ note: v.trim() ? v : null })} />
          {sub.link && usedBy(sub.link) > 0 && <p className="tiny muted">فيها {countAssets(usedBy(sub.link))}</p>}
        </div>
      </Sheet>
    )
  }

  return (
    <Editor title="المراحل والأوزان" onClose={onClose} busy={s.busy} onSave={() => s.save(finish, renameRows)} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <div className="pe-block">
        <div className="pe-head"><h3>المراحل</h3></div>
        <div className="choice-chips pe-phases" role="group" aria-label="المرحلة">
          {[...d.phases].sort((a, b) => a.start.localeCompare(b.start)).map((p) => (
            <button key={p.key} type="button" aria-pressed={p.key === phase?.key} onClick={() => { haptic(); setSel(p.key) }}>
              {p.name}{live?.key === p.key && <span className="pe-now">الحالية</span>}
            </button>
          ))}
          <button type="button" onClick={addPhase}><IconPlus width={14} height={14} />مرحلة</button>
        </div>
        {phase && (
          <div className="stack" style={{ gap: 12 }}>
            <div className="grid2">
              <TextField label="الاسم" value={phase.name} onChange={(v) => setPhase(phase.key, { name: v })} />
              <DateField label="تبدأ في" value={phase.start} onChange={(v) => v && setPhase(phase.key, { start: v })} />
            </div>
            {d.sleeves.length > 0 && (
              <div className="pe-weights">
                <div className="pe-wrow pe-whead"><span>الطبقة</span><span>المستهدف</span><span>الأدنى</span><span>الأعلى</span></div>
                {d.sleeves.map((ps) => {
                  const w = phase.weights[ps.key] ?? { target: 0, min: 0, max: 0 }
                  const bad = !(w.min <= w.target && w.target <= w.max)
                  return (
                    <div key={ps.key} className={`pe-wrow ${bad ? 'bad' : ''}`}>
                      <span className="pe-wname"><i className="dot" style={{ background: layerColor(ps.layer) }} />{ps.name}</span>
                      <MiniNum label={`${ps.name}: المستهدف`} value={w.target} onChange={(v) => setW(ps.key, 'target', v)} />
                      <MiniNum label={`${ps.name}: الحد الأدنى`} value={w.min} onChange={(v) => setW(ps.key, 'min', v)} />
                      <MiniNum label={`${ps.name}: الحد الأعلى`} value={w.max} onChange={(v) => setW(ps.key, 'max', v)} />
                    </div>
                  )
                })}
                <div className="pe-sum">
                  <span className={`chip ${sumOk ? 'accent' : 'bad'}`}>المجموع <Pct v={sum} /></span>
                  {!sumOk && <span className="tiny muted">{sum < 100 ? 'ينقص' : 'يزيد'} <Pct v={Math.abs(100 - sum)} /></span>}
                  <button type="button" className="btn quiet small" onClick={autoBands}>نطاقات تلقائية</button>
                </div>
              </div>
            )}
            <details className="more">
              <summary>ملاحظة المرحلة</summary>
              <div className="more-body">
                <TextField label="ملاحظة" value={phase.note ?? ''} onChange={(v) => setPhase(phase.key, { note: v.trim() ? v : null })} placeholder="مثال: الأموال الجديدة للطبقات الناقصة" />
                {d.phases.length > 1 && <button type="button" className="btn danger small" onClick={removePhase}>احذف هذه المرحلة</button>}
              </div>
            </details>
          </div>
        )}
      </div>

      <div className="pe-block">
        <div className="pe-head"><h3>الطبقات</h3><button type="button" className="btn soft small" onClick={() => openSleeve(null)}><IconPlus />طبقة</button></div>
        <div className="pe-list">
          {d.sleeves.map((ps) => {
            const row = sleeves.find((x) => x.id === resolved[ps.key])
            return (
              <button key={ps.key} type="button" className="pe-row" onClick={() => openSleeve(ps)}>
                <i className="dot" style={{ background: layerColor(ps.layer) }} />
                <span className="pe-main"><b>{ps.name}</b>
                  <span>{LAYER_NAMES[ps.layer]}{!ps.accepts_new_money ? ' · مغلقة للإيداع' : ''}{row ? (row.name !== ps.name ? ` · مرتبطة بـ«${row.name}»` : '') : ' · تُنشأ عند الحفظ'}</span>
                </span>
                <Chev />
              </button>
            )
          })}
          {!d.sleeves.length && <p className="small muted pe-pad">أضف طبقات خطتك أولاً.</p>}
        </div>
        {outside.length > 0 && (
          <details className="more">
            <summary>في محفظتك وخارج الخطة<span className="sum-sub">{sleevesText(outside.length)}</span></summary>
            <div className="more-body">
              {outside.map((row) => {
                const n = usedBy(row.id)
                return (
                  <div key={row.id} className="pe-out">
                    <i className="dot" style={{ background: layerColor(row.layer) }} />
                    <span className="pe-main"><b>{row.name}</b><span>{n ? countAssets(n) : 'بلا أصول'}</span></span>
                    {n === 0 && <button type="button" className="icon-btn plain pe-del" aria-label={`احذف ${row.name}`} onClick={() => deleteRow(row)}><IconClose /></button>}
                    <button type="button" className="btn soft small" onClick={() => adopt(row)}>أضفها للخطة</button>
                  </div>
                )
              })}
            </div>
          </details>
        )}
      </div>
    </Editor>
  )
}

// ---------- milestones ----------
function MilestonesEditor({ doc, onClose }: EP) {
  const { progress, today } = usePlan()
  const s = useSection(doc, 'milestones', onClose)
  const d = s.draft
  const planValue = progress?.planValue ?? 0
  const setM = (i: number, p: Partial<(typeof d.milestones)[number]>) => s.setDraft((x) => ({ ...x, milestones: x.milestones.map((m, j) => (j === i ? { ...m, ...p } : m)) }))
  const add = () => {
    haptic()
    const last = [...d.milestones].sort((a, b) => b.date.localeCompare(a.date))[0]
    const base = last?.date ?? today
    s.setDraft((x) => ({ ...x, milestones: [...x.milestones, { date: addMonthsISO(base, 12), value: Math.round(last?.value ?? planValue), label: null }] }))
  }
  const finish = (x: PlanDoc): PlanDoc => ({ ...x, milestones: [...x.milestones].sort((a, b) => a.date.localeCompare(b.date)) })
  return (
    <Editor title="المحطات" onClose={onClose} busy={s.busy} onSave={() => s.save(finish)} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <div className="pe-box">
        <div className="pe-head"><h3>نقطة البداية</h3>
          <button type="button" className="btn soft small" onClick={() => { haptic(); s.setDraft((x) => ({ ...x, baseline: { date: today, value: Math.round(planValue) } })) }}>ابدأ من قيمتها اليوم</button>
        </div>
        {d.baseline ? (
          <div className="grid2">
            <DateField label="التاريخ" value={d.baseline.date} onChange={(v) => v && s.setDraft((x) => ({ ...x, baseline: { ...x.baseline!, date: v } }))} />
            <NumberField label="القيمة" value={d.baseline.value} suffix="ريال" onChange={(v) => s.setDraft((x) => ({ ...x, baseline: { ...x.baseline!, value: v } }))} />
          </div>
        ) : <p className="small muted">بلا نقطة بداية يبدأ المسار من أول محطة.</p>}
      </div>
      <div className="pe-head"><h3>{d.milestones.length ? milestonesText(d.milestones.length) : 'المحطات'}</h3><button type="button" className="btn soft small" onClick={add}><IconPlus />محطة</button></div>
      {d.milestones.map((m, i) => (
        <div key={i} className="pe-box">
          <div className="pe-head"><span className="tiny muted">المحطة {i + 1}</span>
            <button type="button" className="icon-btn plain pe-del" aria-label="احذف المحطة" onClick={() => s.setDraft((x) => ({ ...x, milestones: x.milestones.filter((_, j) => j !== i) }))}><IconClose /></button>
          </div>
          <div className="grid2">
            <DateField label="التاريخ" value={m.date} onChange={(v) => v && setM(i, { date: v })} />
            <NumberField label="القيمة المخططة" value={m.value} suffix="ريال" onChange={(v) => setM(i, { value: v })} />
          </div>
          <TextField label="الوصف" value={m.label ?? ''} onChange={(v) => setM(i, { label: v.trim() ? v : null })} placeholder="اختياري" />
        </div>
      ))}
      {!d.milestones.length && <p className="small muted">المحطة قيمة تريد بلوغها في تاريخ محدد، وبها يقيس التطبيق تقدمك.</p>}
    </Editor>
  )
}

// ---------- contributions ----------
function ContributionsEditor({ doc, onClose }: EP) {
  const s = useSection(doc, 'contributions', onClose)
  const d = s.draft
  const [sub, setSub] = useState<{ key: string | null; c: PlanContribution } | null>(null)
  const open = (c: PlanContribution | null) => {
    haptic()
    setSub(c ? { key: c.key, c: { ...c } } : {
      key: null,
      c: { key: '', name: '', kind: 'monthly', amount: 0, day: 27, month: null, date: null, until: null, split_months: null, growth_pct: null, note: null },
    })
  }
  const apply = () => {
    if (!sub) return
    const c = { ...sub.c, name: sub.c.name.trim() || 'إيداع' }
    s.setDraft((x) => (sub.key
      ? { ...x, contributions: x.contributions.map((y) => (y.key === sub.key ? c : y)) }
      : { ...x, contributions: [...x.contributions, { ...c, key: uniqueKey('c', x.contributions.map((y) => y.key)) }] }))
    setSub(null)
  }
  if (sub) {
    const c = sub.c
    const set = (p: Partial<PlanContribution>) => setSub((v) => (v ? { ...v, c: { ...v.c, ...p } } : v))
    return (
      <Sheet title={sub.key ? 'مصدر إيداع' : 'مصدر إيداع جديد'} onClose={onClose} footer={<>
        {sub.key
          ? <button type="button" className="btn danger" onClick={() => { s.setDraft((x) => ({ ...x, contributions: x.contributions.filter((y) => y.key !== sub.key) })); setSub(null) }}>احذفه</button>
          : <button type="button" className="btn ghost" onClick={() => setSub(null)}>إلغاء</button>}
        <button type="button" className="btn primary" onClick={apply}>{sub.key ? 'تم' : 'أضفه'}</button>
      </>}>
        <div className="stack pe">
          <TextField label="الاسم" value={c.name} onChange={(v) => set({ name: v })} placeholder="مثال: الفائض الشهري من الراتب" />
          <Segmented<ContributionKind> label="النوع" value={c.kind} onChange={(v) => set({ kind: v })}
            options={(['monthly', 'yearly', 'once'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          <NumberField label={c.kind === 'monthly' ? 'المبلغ كل شهر' : c.kind === 'yearly' ? 'المبلغ كل سنة' : 'المبلغ'} value={c.amount} suffix="ريال" onChange={(v) => set({ amount: v })} />
          {c.kind === 'monthly' && <NumberField label="يوم الإيداع من الشهر" value={c.day ?? 1} plain min={1} max={31} onChange={(v) => set({ day: Math.round(v) || 1 })} />}
          {c.kind === 'yearly' && (
            <div className="grid2">
              <SelectField label="الشهر" value={String(c.month ?? '')} onChange={(v) => set({ month: Number(v) || null })} options={[{ value: '', label: 'اختر' }, ...MONTH_OPTIONS]} />
              <NumberField label="اليوم" value={c.day ?? 1} plain min={1} max={31} onChange={(v) => set({ day: Math.round(v) || 1 })} />
            </div>
          )}
          {c.kind === 'once' && <DateField label="التاريخ" value={c.date} onChange={(v) => set({ date: v })} />}
          <details className="more">
            <summary>خيارات إضافية</summary>
            <div className="more-body">
              {c.kind !== 'once' && (
                <div className="grid2">
                  <DateField label="يبدأ من" value={c.date} onChange={(v) => set({ date: v })} />
                  <DateField label="حتى" value={c.until} onChange={(v) => set({ until: v })} />
                </div>
              )}
              {c.kind !== 'monthly' && <NumberField label="يُقسَّم على دفعات شهرية" value={c.split_months ?? 1} plain min={1} max={24} suffix="دفعة" onChange={(v) => set({ split_months: v > 1 ? Math.round(v) : null })} />}
              {c.kind !== 'once' && <NumberField label="زيادة سنوية في المبلغ" value={c.growth_pct ?? 0} suffix="%" decimals={1} onChange={(v) => set({ growth_pct: v > 0 ? v : null })} />}
              <TextField label="ملاحظة" value={c.note ?? ''} onChange={(v) => set({ note: v.trim() ? v : null })} />
            </div>
          </details>
        </div>
      </Sheet>
    )
  }
  return (
    <Editor title="مصادر الإيداع" onClose={onClose} busy={s.busy} onSave={() => s.save()} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <div className="pe-head"><span className="small muted">ما تخطط لإيداعه، وبه تُقارن إيداعاتك الفعلية.</span></div>
      <div className="pe-list">
        {d.contributions.map((c) => (
          <button key={c.key} type="button" className="pe-row" onClick={() => open(c)}>
            <span className="pe-main"><b>{c.name}</b><span>{contributionWhen(c)}</span></span>
            <Money v={c.amount} />
            <Chev />
          </button>
        ))}
        {!d.contributions.length && <p className="small muted pe-pad">لا مصادر بعد.</p>}
      </div>
      <button type="button" className="btn soft" onClick={() => open(null)}><IconPlus />مصدر إيداع</button>
    </Editor>
  )
}

// ---------- emergency ----------
function EmergencyEditor({ doc, onClose }: EP) {
  const { progress } = usePlan()
  const s = useSection(doc, 'emergency', onClose)
  const e = s.draft.emergency
  const set = (p: Partial<NonNullable<PlanDoc['emergency']>>) => s.setDraft((x) => ({ ...x, emergency: { months: 6, monthly_expense: 0, ...x.emergency, ...p } }))
  return (
    <Editor title="صندوق الطوارئ" onClose={onClose} busy={s.busy} onSave={() => s.save()} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <Switch label="صندوق طوارئ في خطتك" hint="سيولة متاحة خارج المحفظة" checked={!!e} onChange={(v) => s.setDraft((x) => ({ ...x, emergency: v ? { months: 6, monthly_expense: 0 } : null }))} />
      {e && <>
        <div className="grid2">
          <NumberField label="يغطي" value={e.months} plain min={0} max={36} suffix="أشهر" onChange={(v) => set({ months: Math.round(v) })} />
          <NumberField label="مصروفك الشهري" value={e.monthly_expense} suffix="ريال" onChange={(v) => set({ monthly_expense: v })} />
        </div>
        <div className="pe-total">
          <span>الهدف</span>
          {e.monthly_expense > 0 ? <Money v={e.months * e.monthly_expense} /> : <span className="warn small">اكتب مصروفك الشهري</span>}
        </div>
        {progress && progress.emergency.value > 0 && <div className="pe-total soft"><span>لديك الآن</span><Money v={progress.emergency.value} /></div>}
      </>}
    </Editor>
  )
}

// ---------- income treasury ----------
const DEFAULT_INCOME: PlanIncome = { start: null, method: 'percent', annual_pct: 4, fixed_monthly: null, band_pct: 10, treasury_months: 24, transfer_day: 27, no_sell_drawdown_pct: 20, build_from: null }

function IncomeEditor({ doc, onClose }: EP) {
  const { progress } = usePlan()
  const s = useSection(doc, 'income', onClose)
  const inc = s.draft.income
  const set = (p: Partial<PlanIncome>) => s.setDraft((x) => ({ ...x, income: { ...DEFAULT_INCOME, ...x.income, ...p } }))
  const planValue = progress?.planValue ?? 0
  const approved = s.draft.state.income_annual
  const monthly = !inc ? 0 : inc.method === 'fixed' ? Number(inc.fixed_monthly) || 0 : (approved ?? (planValue * (Number(inc.annual_pct) || 0)) / 100) / 12
  return (
    <Editor title="خزانة الدخل" onClose={onClose} busy={s.busy} onSave={() => s.save()} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <Switch label="خزانة دخل في خطتك" hint="تُبنى من المحفظة وتحوّل منها دخلك الشهري" checked={!!inc} onChange={(v) => s.setDraft((x) => ({ ...x, income: v ? { ...DEFAULT_INCOME } : null }))} />
      {inc && <>
        <DateField label="يبدأ الدخل في" value={inc.start} onChange={(v) => set({ start: v })} />
        <Segmented<'percent' | 'fixed'> label="طريقة الدخل" value={inc.method} onChange={(v) => set({ method: v, fixed_monthly: v === 'fixed' ? inc.fixed_monthly ?? Math.round(monthly) : inc.fixed_monthly })}
          options={[{ value: 'percent', label: 'نسبة سنوية' }, { value: 'fixed', label: 'مبلغ ثابت' }]} />
        {inc.method === 'percent'
          ? <NumberField label="نسبة السحب السنوية" value={inc.annual_pct} suffix="%" decimals={2} onChange={(v) => set({ annual_pct: v })} />
          : <NumberField label="الدخل الشهري" value={inc.fixed_monthly} suffix="ريال" onChange={(v) => set({ fixed_monthly: v || null })} />}
        <div className="grid2">
          <NumberField label="حجم الخزانة" value={inc.treasury_months} plain min={0} max={120} suffix="شهراً" onChange={(v) => set({ treasury_months: Math.round(v) })} />
          <NumberField label="يوم التحويل" value={inc.transfer_day} plain min={1} max={28} onChange={(v) => set({ transfer_day: Math.round(v) || 1 })} />
        </div>
        {monthly > 0 && (
          <div className="pe-total soft">
            <span>{inc.method === 'percent' ? (approved != null ? 'الدخل المعتمد' : 'بقيمة اليوم') : 'الدخل'}</span>
            <span><Money v={monthly} /> شهرياً</span>
          </div>
        )}
        <details className="more">
          <summary>قواعد إضافية</summary>
          <div className="more-body">
            {inc.method === 'percent' && <NumberField label="أقصى تغيّر للدخل بين سنة وأخرى" value={inc.band_pct} suffix="%" decimals={1} onChange={(v) => set({ band_pct: v })} />}
            <NumberField label="أوقف بيع الأسهم عند هبوطها من القمة" value={inc.no_sell_drawdown_pct} suffix="%" onChange={(v) => set({ no_sell_drawdown_pct: v })} hint="عندها يُصرف من الخزانة والتوزيعات فقط" />
            <DateField label="ابدأ تعبئة الخزانة من" value={inc.build_from} onChange={(v) => set({ build_from: v })} hint="بلا تاريخ تبدأ مع بدء الدخل" />
          </div>
        </details>
      </>}
    </Editor>
  )
}

// ---------- rules ----------
function RulesEditor({ doc, onClose }: EP) {
  const { settings, updateSettings } = useStore()
  const s = useSection(doc, 'rules', onClose)
  const r = s.draft.rules
  const [band, setBand] = useState(Number(settings?.rebalance_band ?? 5))
  const set = (p: Partial<PlanDoc['rules']>) => s.setDraft((x) => ({ ...x, rules: { ...x.rules, ...p } }))
  const toggle = (k: string) => { haptic(); set({ crash_sleeves: r.crash_sleeves.includes(k) ? r.crash_sleeves.filter((x) => x !== k) : [...r.crash_sleeves, k] }) }
  const after = async () => { if (settings && band !== Number(settings.rebalance_band)) updateSettings({ rebalance_band: band }) }
  return (
    <Editor title="القواعد" onClose={onClose} busy={s.busy} onSave={() => s.save(undefined, after)} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <SelectField label="شهر المراجعة السنوية" value={String(r.review_month)} onChange={(v) => set({ review_month: Number(v) })} options={MONTH_OPTIONS} />
      <Switch label="الأموال الجديدة للطبقات الناقصة أولاً" hint="قبل أي بيع عند إعادة التوازن" checked={r.new_money_first} onChange={(v) => set({ new_money_first: v })} />
      <NumberField label="الهبوط الكبير" value={r.crash_pct} suffix="%" onChange={(v) => set({ crash_pct: v })} hint="يُطلب منك إعادة التوازن إذا هبطت الطبقات المختارة بهذه النسبة من قمتها" />
      <div className="field">
        <span>الطبقات التي يُقاس هبوطها</span>
        <div className="choice-chips">
          {s.draft.sleeves.map((ps) => (
            <button key={ps.key} type="button" aria-pressed={r.crash_sleeves.includes(ps.key)} onClick={() => toggle(ps.key)}>
              {r.crash_sleeves.includes(ps.key) && <IconCheck width={14} height={14} />}{ps.name}
            </button>
          ))}
        </div>
        <small>بلا اختيار يُقاس هبوط المحفظة كلها</small>
      </div>
      <NumberField label="النطاق الاحتياطي" value={band} suffix="نقطة" decimals={1} onChange={setBand} hint="لطبقة بلا حد أدنى وأعلى في خطتك" />
    </Editor>
  )
}

// ---------- steps ----------
function StepsEditor({ doc, onClose }: EP) {
  const { today } = usePlan()
  const s = useSection(doc, 'steps', onClose)
  const d = s.draft
  const [sub, setSub] = useState<{ key: string | null; st: PlanStep } | null>(null)
  const open = (st: PlanStep | null) => { haptic(); setSub(st ? { key: st.key, st: { ...st } } : { key: null, st: { key: '', title: '', detail: null, due: null, done_at: null, recurring: 'none' } }) }
  const apply = () => {
    if (!sub) return
    const st = { ...sub.st, title: sub.st.title.trim() || 'خطوة' }
    s.setDraft((x) => (sub.key
      ? { ...x, steps: x.steps.map((y) => (y.key === sub.key ? st : y)) }
      : { ...x, steps: [...x.steps, { ...st, key: uniqueKey('s', x.steps.map((y) => y.key)) }] }))
    setSub(null)
  }
  const toggleDone = (key: string) => { haptic(); s.setDraft((x) => ({ ...x, steps: x.steps.map((y) => (y.key === key ? { ...y, done_at: y.done_at ? null : today } : y)) })) }
  if (sub) {
    const st = sub.st
    const set = (p: Partial<PlanStep>) => setSub((v) => (v ? { ...v, st: { ...v.st, ...p } } : v))
    return (
      <Sheet title={sub.key ? 'خطوة' : 'خطوة جديدة'} onClose={onClose} footer={<>
        {sub.key
          ? <button type="button" className="btn danger" onClick={() => { s.setDraft((x) => ({ ...x, steps: x.steps.filter((y) => y.key !== sub.key) })); setSub(null) }}>احذفها</button>
          : <button type="button" className="btn ghost" onClick={() => setSub(null)}>إلغاء</button>}
        <button type="button" className="btn primary" onClick={apply}>{sub.key ? 'تم' : 'أضفها'}</button>
      </>}>
        <div className="stack pe">
          <TextField label="الخطوة" value={st.title} onChange={(v) => set({ title: v })} placeholder="مثال: افتح حساب الوساطة" />
          <TextField label="تفاصيل" value={st.detail ?? ''} onChange={(v) => set({ detail: v.trim() ? v : null })} placeholder="اختياري" />
          <DateField label="موعدها" value={st.due} onChange={(v) => set({ due: v })} />
          <Switch label="تتكرر كل سنة" checked={st.recurring === 'yearly'} onChange={(v) => set({ recurring: v ? 'yearly' : 'none' })} />
          <Switch label="أُنجزت" checked={!!st.done_at} onChange={(v) => set({ done_at: v ? today : null })} />
        </div>
      </Sheet>
    )
  }
  const list = [...d.steps].sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  return (
    <Editor title="الخطوات" onClose={onClose} busy={s.busy} onSave={() => s.save()} issues={<Issues errors={s.errors} warnings={s.warnings} />}>
      <div className="pe-list">
        {list.map((st) => (
          <div key={st.key} className={`pe-row pe-step ${st.done_at ? 'done' : ''}`}>
            <button type="button" className="pe-check" aria-pressed={!!st.done_at} aria-label={st.done_at ? `أعد «${st.title}»` : `أنجزت «${st.title}»`} onClick={() => toggleDone(st.key)}><IconCheck /></button>
            <button type="button" className="pe-main pe-open" onClick={() => open(st)}>
              <b>{st.title}</b><span>{st.due ? dateLong(st.due) : 'بلا موعد'}{st.recurring === 'yearly' ? ' · سنوية' : ''}</span>
            </button>
            <Chev />
          </div>
        ))}
        {!d.steps.length && <p className="small muted pe-pad">لا خطوات بعد.</p>}
      </div>
      <button type="button" className="btn soft" onClick={() => open(null)}><IconPlus />خطوة</button>
    </Editor>
  )
}

// =====================================================================================
// The document view (section cards)
// =====================================================================================
type Missing = { key: string; title: string; section: PlanSection; tone: 'warn' | 'bad' }

/** What the active plan still lacks, most important first. */
export function planGaps(doc: PlanDoc): Missing[] {
  const out: Missing[] = []
  const check = validatePlan(doc)
  for (const e of check.errors.slice(0, 3)) out.push({ key: `e:${e}`, title: e, section: /إيداع|المبلغ|اليوم يجب|الشهر يجب|دفعات/.test(e) ? 'contributions' : /الدخل|التحويل|السحب|الخزانة|البيع/.test(e) ? 'income' : 'phases', tone: 'bad' })
  if (doc.emergency && doc.emergency.months > 0 && !(doc.emergency.monthly_expense > 0)) out.push({ key: 'expense', title: 'حدّد مصروفك الشهري', section: 'emergency', tone: 'warn' })
  if (!doc.contributions.length || doc.contributions.every((c) => !(c.amount > 0))) out.push({ key: 'contrib', title: 'اكتب مبالغ الإيداع', section: 'contributions', tone: 'warn' })
  if (!doc.milestones.length) out.push({ key: 'milestones', title: 'أضف محطات تقيس بها تقدمك', section: 'milestones', tone: 'warn' })
  else if (!doc.baseline) out.push({ key: 'baseline', title: 'حدّد نقطة البداية', section: 'milestones', tone: 'warn' })
  if (doc.income && !doc.income.start) out.push({ key: 'income-start', title: 'حدّد تاريخ بدء الدخل', section: 'income', tone: 'warn' })
  if (doc.goal.monthly_income == null && doc.goal.target_capital == null) out.push({ key: 'goal', title: 'اكتب هدفك', section: 'goal', tone: 'warn' })
  return out
}

function SectionCard({ section, onEdit, children, sub }: { section: PlanSection; onEdit?: (s: PlanSection) => void; children: ReactNode; sub?: ReactNode }) {
  return (
    <Card className={`pd-card pd-${section}`} title={<>{SECTION_TITLE[section]}{sub != null && <span className="pd-sub">{sub}</span>}</>}
      action={onEdit ? { label: 'تعديل', onClick: () => { haptic(); onEdit(section) } } : null}>
      {children}
    </Card>
  )
}

/** The plan document as section cards. `onEdit` is omitted for viewers. */
export function PlanSections({ doc, onEdit }: { doc: PlanDoc; onEdit?: (s: PlanSection) => void }) {
  const { settings, sleeves } = useStore()
  const { today, progress } = usePlan()
  const phase = activePhase(doc, today)
  const phases = [...doc.phases].sort((a, b) => a.start.localeCompare(b.start))
  const ms = [...doc.milestones].sort((a, b) => a.date.localeCompare(b.date))
  const shownMs = ms.filter((m) => m.date >= today).slice(0, 4)
  const passed = ms.length - ms.filter((m) => m.date >= today).length
  const nameOf = (k: string) => doc.sleeves.find((s) => s.key === k)?.name ?? k
  const steps = doc.steps
  // the same count as the progress view (a yearly step counts as done only for its year)
  const done = progress ? progress.steps.done : steps.filter((s) => s.done_at).length
  const nextView = progress?.steps.next ?? null
  const next = nextView ? { title: nextView.step.title, due: nextView.due } : [...steps].filter((s) => !s.done_at).sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))[0]
  const map = resolveSleeveMap(doc, sleeves)
  const g = doc.goal
  const inc = doc.income
  const em = doc.emergency

  return (
    <div className="pd-grid">
      <SectionCard section="goal" onEdit={onEdit}>
        {g.monthly_income == null && g.target_capital == null && !g.target_date ? <p className="small muted">لم تكتب هدفك بعد.</p> : <>
          {g.monthly_income != null && <KV label="الدخل الشهري" value={<Money v={g.monthly_income} />} />}
          {g.target_capital != null && <KV label="رأس المال المستهدف" value={<Money v={g.target_capital} />} />}
          {g.target_date && <KV label="الموعد" value={dateLong(g.target_date)} />}
        </>}
        {g.note && <p className="pd-note">{g.note}</p>}
      </SectionCard>

      <SectionCard section="phases" onEdit={onEdit} sub={sleevesText(doc.sleeves.length)}>
        {phase && doc.sleeves.length > 0 && <>
          <StackBar parts={doc.sleeves.map((s) => ({ key: s.key, value: phase.weights[s.key]?.target ?? 0, color: layerColor(s.layer), label: s.name }))} />
          <div className="pd-legend">
            {doc.sleeves.filter((s) => (phase.weights[s.key]?.target ?? 0) > 0).map((s) => (
              <span key={s.key}><i className="dot" style={{ background: layerColor(s.layer) }} />{s.name} <b><Pct v={phase.weights[s.key].target} /></b></span>
            ))}
          </div>
        </>}
        <div className="pd-phases">
          {phases.map((p) => (
            <div key={p.key} className={`pd-phase ${p.key === phase?.key ? 'on' : ''}`}>
              <b>{p.name}</b>{p.key === phase?.key && <span className="chip accent">الحالية</span>}
              <span className="pd-date">{p.start <= today ? 'منذ' : 'من'} {dateLong(p.start)}</span>
            </div>
          ))}
        </div>
        {doc.sleeves.some((s) => !map[s.key]) && <p className="tiny muted" style={{ marginTop: 8 }}>تُنشأ الطبقات الجديدة في محفظتك تلقائياً.</p>}
      </SectionCard>

      <SectionCard section="milestones" onEdit={onEdit} sub={ms.length ? milestonesText(ms.length) : undefined}>
        {doc.baseline && <KV label={<>البداية<small>{dateLong(doc.baseline.date)}</small></>} value={<Money v={doc.baseline.value} />} />}
        {shownMs.map((m) => <KV key={m.date} label={<>{m.label ?? m.date.slice(0, 4)}<small>{dateLong(m.date)}</small></>} value={<Money v={m.value} />} />)}
        {!ms.length && <p className="small muted">لا محطات بعد.</p>}
        {(passed > 0 || ms.filter((m) => m.date >= today).length > 4) && <p className="tiny muted pd-more">{passed > 0 ? `${milestonesText(passed)} مضت` : ''}{passed > 0 && ms.filter((m) => m.date >= today).length > 4 ? ' · ' : ''}{ms.filter((m) => m.date >= today).length > 4 ? `و${milestonesText(ms.filter((m) => m.date >= today).length - 4)} لاحقاً` : ''}</p>}
      </SectionCard>

      <SectionCard section="contributions" onEdit={onEdit}>
        {doc.contributions.length ? doc.contributions.map((c) => (
          <KV key={c.key} label={<>{c.name}<small>{contributionWhen(c)}</small></>} value={c.amount > 0 ? <Money v={c.amount} /> : <span className="warn small">بلا مبلغ</span>} />
        )) : <p className="small muted">لا مصادر بعد.</p>}
      </SectionCard>

      <SectionCard section="emergency" onEdit={onEdit}>
        {em ? <>
          <KV label="يغطي" value={monthsText(em.months)} />
          <KV label="المصروف الشهري" value={em.monthly_expense > 0 ? <Money v={em.monthly_expense} /> : <span className="warn small">لم يُحدَّد</span>} />
          {em.monthly_expense > 0 && <KV label="الهدف" value={<Money v={em.months * em.monthly_expense} />} />}
        </> : <p className="small muted">غير مضمَّن في الخطة.</p>}
      </SectionCard>

      <SectionCard section="income" onEdit={onEdit}>
        {inc ? <>
          <KV label="يبدأ الدخل" value={inc.start ? dateLong(inc.start) : <span className="warn small">لم يُحدَّد</span>} />
          <KV label="القاعدة" value={inc.method === 'percent' ? <><Pct v={inc.annual_pct} digits={2} /> سنوياً</> : <><Money v={inc.fixed_monthly ?? 0} /> شهرياً</>}
            sub={inc.method === 'percent' ? <>أقصى تغيّر <Pct v={inc.band_pct} /> بين سنة وأخرى</> : undefined} />
          <KV label="حجم الخزانة" value={`دخل ${monthsText(inc.treasury_months)}`} />
          <KV label="يوم التحويل" value={<>{inc.transfer_day} من كل شهر</>} />
          <KV label="إيقاف البيع" value={<>عند هبوط <Pct v={inc.no_sell_drawdown_pct} /></>} />
        </> : <p className="small muted">غير مفعّلة.</p>}
      </SectionCard>

      <SectionCard section="rules" onEdit={onEdit}>
        <KV label="المراجعة السنوية" value={monthName(doc.rules.review_month - 1)} />
        <KV label="الهبوط الكبير" value={<Pct v={doc.rules.crash_pct} />} sub={doc.rules.crash_sleeves.length ? doc.rules.crash_sleeves.map(nameOf).join('، ') : 'المحفظة كلها'} />
        <KV label="الأموال الجديدة" value={doc.rules.new_money_first ? 'للناقص أولاً' : 'حسب الأوزان'} />
        <KV label="النطاق الاحتياطي" value={<><bdi dir="ltr">±{Number(settings?.rebalance_band ?? 0)}</bdi> {pointsWord(Number(settings?.rebalance_band ?? 0))}</>} />
      </SectionCard>

      <SectionCard section="steps" onEdit={onEdit} sub={steps.length ? <><bdi dir="ltr">{done}/{steps.length}</bdi></> : undefined}>
        {steps.length ? <>
          <div className="progress"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
          {next ? <KV label="التالية" value={<span className="pd-step">{next.title}</span>} sub={next.due ? dateShort(next.due) : undefined} /> : <p className="small good" style={{ marginTop: 10 }}>أُنجزت كل الخطوات.</p>}
        </> : <p className="small muted">لا خطوات بعد.</p>}
      </SectionCard>
    </div>
  )
}

