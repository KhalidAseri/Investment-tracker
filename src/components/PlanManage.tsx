// «الخطة» › الخطة: plans list, export / import, and the builder that starts a first plan.
import { useCallback, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan, usePlanOps } from '../lib/usePlan'
import { normalizePlan, parsePlanFile, suggestSleeveMap, PLAN_FILE_EXT, type PlanDoc } from '../lib/plan'
import { PLAN_TEMPLATES, planFromSleeves } from '../lib/planTemplates'
import { dateLong } from '../lib/format'
import { haptic } from '../lib/ui'
import type { PlanRow } from '../lib/types'
import { Card, Chev } from './kit'
import { SelectField, Sheet, Switch, TextField } from './ui'
import { IconDoc, IconImport, IconLayers, IconTarget } from './icons'
import { milestonesText, phasesText, sleevesText } from './PlanEditor'

/** set by the builder; the document view highlights what is missing once */
let freshPlan = false
export const takeFreshPlan = () => { const f = freshPlan; freshPlan = false; return f }

// =====================================================================================
// Export
// =====================================================================================
/** Shares the file on phones (share sheet), otherwise downloads it. */
export function useExportPlan() {
  const ops = usePlanOps()
  const { notify } = useStore()
  return useCallback(async (id?: string) => {
    haptic()
    const out = ops.exportFile(id)
    if (!out) { notify('لا توجد خطة للتصدير'); return }
    const blob = new Blob([out.text], { type: 'application/json' })
    try {
      const file = new File([blob], out.name, { type: 'application/json' })
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: out.name })
        notify('صُدّرت الخطة')
        return
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      // fall back to a download
    }
    try {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = out.name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      notify('نُزّل ملف الخطة')
    } catch {
      notify('تعذّر تصدير الخطة')
    }
  }, [ops, notify])
}

// =====================================================================================
// Import
// =====================================================================================
type Parsed = { name: string; doc: PlanDoc | null; errors: string[]; warnings: string[] }

/** Hidden file input + the confirmation sheet. `pick()` opens the file chooser. */
export function useImportPlan(onDone?: () => void) {
  const ref = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const close = useCallback(() => setParsed(null), [])
  const onFile = async (f: File | undefined) => {
    if (!f) return
    let text = ''
    try { text = await f.text() } catch { setParsed({ name: f.name, doc: null, errors: ['تعذّرت قراءة الملف'], warnings: [] }); return }
    const r = parsePlanFile(text)
    setParsed({ name: f.name, doc: r.doc, errors: r.errors, warnings: r.warnings })
    if (ref.current) ref.current.value = ''
  }
  const input = (
    <input ref={ref} type="file" accept={`${PLAN_FILE_EXT},.json,application/json`} hidden data-plan-import
      onChange={(e) => onFile(e.target.files?.[0])} />
  )
  const sheet = parsed ? <ImportSheet parsed={parsed} onClose={close} onDone={onDone} /> : null
  return { pick: () => { haptic(); ref.current?.click() }, input, sheet }
}

function ImportSheet({ parsed, onClose, onDone }: { parsed: Parsed; onClose: () => void; onDone?: () => void }) {
  const { sleeves } = useStore()
  const { active } = usePlan()
  const ops = usePlanOps()
  const doc0 = parsed.doc
  const [name, setName] = useState(doc0?.name ?? '')
  const [map, setMap] = useState<Record<string, string | null>>(() => (doc0 ? suggestSleeveMap(doc0, sleeves) : {}))
  const [mode, setMode] = useState<'replace' | 'add'>('add')
  const [busy, setBusy] = useState(false)

  if (!doc0 || parsed.errors.length) {
    return (
      <Sheet title="تعذّر استيراد الملف" onClose={onClose} footer={<button type="button" className="btn primary" onClick={onClose}>حسناً</button>}>
        <div className="stack pe">
          <p className="small muted"><bdi dir="ltr">{parsed.name}</bdi></p>
          <ul className="pe-errors">{parsed.errors.slice(0, 6).map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      </Sheet>
    )
  }
  const taken = (key: string) => new Set(Object.entries(map).filter(([k, v]) => k !== key && v).map(([, v]) => v as string))
  const effective = active ? mode : 'replace'
  const go = async () => {
    setBusy(true)
    const doc = { ...doc0, name: name.trim() || doc0.name }
    const row = await ops.importDoc(doc, effective, map)
    setBusy(false)
    if (row) { onClose(); onDone?.(); location.hash = '/plan/doc' }
  }
  return (
    <Sheet title="استيراد خطة" onClose={onClose} footer={<>
      <button type="button" className="btn ghost" onClick={onClose}>إلغاء</button>
      <button type="button" className="btn primary" disabled={busy} onClick={go}>{busy ? 'يستورد…' : 'استورد'}</button>
    </>}>
      <div className="stack pe">
        <TextField label="اسم الخطة" value={name} onChange={setName} />
        <div className="pm-facts">
          <span>{sleevesText(doc0.sleeves.length)}</span><span>{phasesText(doc0.phases.length)}</span>
          {doc0.milestones.length > 0 && <span>{milestonesText(doc0.milestones.length)}</span>}
        </div>
        {parsed.warnings.length > 0 && (
          <details className="more">
            <summary>ملاحظات على الملف<span className="sum-sub">{parsed.warnings.length}</span></summary>
            <div className="more-body"><ul className="pm-notes">{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
          </details>
        )}
        {active ? (
          <div className="pm-modes" role="radiogroup" aria-label="طريقة الاستيراد">
            <button type="button" role="radio" aria-checked={mode === 'add'} className="template" onClick={() => { haptic(); setMode('add') }}>
              <b>أضفها كخطة جديدة</b><span className="tiny muted">تبقى خطتك الحالية نشطة</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'replace'} className="template" onClick={() => { haptic(); setMode('replace') }}>
              <b>استبدل خطتي الحالية</b><span className="tiny muted">«{active.name}» تأخذ محتوى الملف</span>
            </button>
          </div>
        ) : <p className="small muted">ستصبح خطتك النشطة.</p>}
        <div className="pe-block">
          <div className="pe-head"><h3>ربط الطبقات بمحفظتك</h3></div>
          {doc0.sleeves.map((ps) => {
            const t = taken(ps.key)
            return (
              <SelectField key={ps.key} label={ps.name} value={map[ps.key] ?? ''} onChange={(v) => setMap((m) => ({ ...m, [ps.key]: v || null }))}
                options={[{ value: '', label: 'طبقة جديدة' }, ...sleeves.filter((s) => !t.has(s.id)).map((s) => ({ value: s.id, label: s.name }))]} />
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}

// =====================================================================================
// Builder
// =====================================================================================
/** The three ways to start a plan. `activate` makes the new plan the active one. */
function BuilderChoices({ activate, onDone, onImport }: { activate: boolean; onDone?: () => void; onImport: () => void }) {
  const { sleeves, settings, readOnly } = useStore()
  const { today } = usePlan()
  const ops = usePlanOps()
  const [showTemplates, setShowTemplates] = useState(false)
  const [busy, setBusy] = useState(false)
  const make = async (doc: PlanDoc) => {
    if (readOnly || busy) return
    haptic()
    setBusy(true)
    freshPlan = activate // read by the document view as soon as the new plan appears
    const row = await ops.create(normalizePlan(doc, today), { activate })
    setBusy(false)
    if (row) { onDone?.(); location.hash = '/plan/doc' } else freshPlan = false
  }
  return (
    <div className="pm-choices">
      <button type="button" className="type-tile" aria-expanded={showTemplates} onClick={() => { haptic(); setShowTemplates((v) => !v) }}>
        <span className="ico"><IconDoc /></span>
        <span className="grow"><b>ابدأ من قالب</b><span>أوزان ونطاقات وقواعد جاهزة، وأرقامك تكتبها أنت</span></span>
        <Chev />
      </button>
      {showTemplates && (
        <div className="pm-templates">
          {PLAN_TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="template" disabled={busy} onClick={() => make(t.build(today))}>
              <b>{t.name}</b><span className="tiny muted">{t.desc}</span>
            </button>
          ))}
        </div>
      )}
      <button type="button" className="type-tile" onClick={onImport}>
        <span className="ico"><IconImport /></span>
        <span className="grow"><b>استورد ملف خطة</b><span>ملف صدّرته من مسار على جهاز آخر</span></span>
        <Chev />
      </button>
      <button type="button" className="type-tile" disabled={busy || !sleeves.length} onClick={() => make(planFromSleeves(sleeves, settings, today))}>
        <span className="ico"><IconLayers /></span>
        <span className="grow"><b>ابدأ من أوزانك الحالية</b><span>{sleeves.length ? `${sleevesText(sleeves.length)} بأوزانها ونطاقاتها اليوم` : 'لا طبقات في محفظتك بعد'}</span></span>
        <Chev />
      </button>
    </div>
  )
}

/** Empty state of the plan tab: build a first plan. */
export function PlanBuilderCard() {
  const { readOnly } = useStore()
  const imp = useImportPlan()
  if (readOnly) {
    return <div className="card pm-empty"><span className="pm-ico"><IconTarget /></span><h3>لا توجد خطة نشطة</h3><p className="small muted">تظهر هنا حين يكتب صاحب المحفظة خطته.</p></div>
  }
  return (
    <section className="card pm-builder">
      <div className="pm-intro">
        <span className="pm-ico"><IconTarget /></span>
        <h3>ابنِ خطتك</h3>
        <p className="small muted">اختر بداية، ثم أكمل أرقامك؛ ويخبرك التطبيق بما تفعل لتبقى عليها.</p>
      </div>
      <BuilderChoices activate onImport={imp.pick} />
      {imp.input}{imp.sheet}
    </section>
  )
}

function NewPlanSheet({ onClose, hasActive }: { onClose: () => void; hasActive: boolean }) {
  const [activate, setActivate] = useState(true)
  const imp = useImportPlan(onClose)
  return (
    <>
      <Sheet title="خطة جديدة" onClose={onClose}>
        <div className="stack pe">
          {hasActive && <Switch label="اجعلها الخطة النشطة" hint="وإلا تُحفظ مسودة" checked={activate} onChange={setActivate} />}
          <BuilderChoices activate={!hasActive || activate} onDone={onClose} onImport={imp.pick} />
        </div>
      </Sheet>
      {imp.input}{imp.sheet}
    </>
  )
}

// =====================================================================================
// Plans list + export/import card
// =====================================================================================
function PlanRowSheet({ row, onClose }: { row: PlanRow; onClose: () => void }) {
  const { readOnly } = useStore()
  const ops = usePlanOps()
  const exportPlan = useExportPlan()
  const [name, setName] = useState(row.name)
  const [busy, setBusy] = useState(false)
  const doc = normalizePlan(row.doc)
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); await fn(); setBusy(false) }
  return (
    <Sheet title={row.name} onClose={onClose}>
      <div className="stack pe">
        <div className="pm-facts">
          {row.is_active && <span className="chip accent">نشطة</span>}
          <span>{sleevesText(doc.sleeves.length)}</span><span>{phasesText(doc.phases.length)}</span><span>أُنشئت {dateLong(doc.created)}</span>
        </div>
        {!readOnly && (
          <div className="pm-rename">
            <TextField label="الاسم" value={name} onChange={setName} />
            <button type="button" className="btn ghost" disabled={busy || !name.trim() || name.trim() === row.name} onClick={() => run(async () => { if (await ops.rename(row.id, name)) onClose() })}>احفظ الاسم</button>
          </div>
        )}
        <div className="pm-actions">
          {!readOnly && !row.is_active && <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => { if (await ops.activate(row.id)) onClose() })}>اجعلها النشطة</button>}
          <button type="button" className="btn soft" onClick={() => exportPlan(row.id)}>صدّر ملف الخطة</button>
          {!readOnly && <button type="button" className="btn danger" disabled={busy} onClick={() => {
            if (!confirm(row.is_active ? `«${row.name}» هي خطتك النشطة. احذفها؟` : `احذف «${row.name}»؟`)) return
            run(async () => { await ops.remove(row.id); onClose() })
          }}>احذف الخطة</button>}
        </div>
      </div>
    </Sheet>
  )
}

export function PlansCard() {
  const { plans, active } = usePlan()
  const { readOnly } = useStore()
  const [open, setOpen] = useState<PlanRow | null>(null)
  const [adding, setAdding] = useState(false)
  const closeRow = useCallback(() => setOpen(null), [])
  const closeNew = useCallback(() => setAdding(false), [])
  return (
    <Card flush className="pm-plans" title="خططك" action={readOnly ? null : { label: 'خطة جديدة', onClick: () => { haptic(); setAdding(true) } }}>
      {plans.length ? plans.map((p) => {
        const doc = normalizePlan(p.doc)
        return (
          <button key={p.id} type="button" className="list-item" onClick={() => { haptic(); setOpen(p) }}>
            <span className="grow">
              <b className="pm-name">{p.name}{p.is_active && <span className="chip accent">نشطة</span>}</b>
              <span className="meta">{sleevesText(doc.sleeves.length)} · {phasesText(doc.phases.length)} · أُنشئت {dateLong(doc.created)}</span>
            </span>
            <Chev />
          </button>
        )
      }) : <p className="small muted" style={{ padding: '4px 16px 16px' }}>لا خطط محفوظة.</p>}
      {open && <PlanRowSheet row={open} onClose={closeRow} />}
      {adding && <NewPlanSheet onClose={closeNew} hasActive={!!active} />}
    </Card>
  )
}

export function TransferCard() {
  const { readOnly } = useStore()
  const { active } = usePlan()
  const exportPlan = useExportPlan()
  const imp = useImportPlan()
  return (
    <Card className="pm-transfer" title={readOnly ? 'تصدير' : 'تصدير واستيراد'}>
      <p className="small muted">{readOnly ? 'احفظ نسخة من الخطة في ملف.' : 'ملف تنقل به خطتك إلى جهاز آخر أو تحفظ منه نسخة.'}</p>
      <div className="pm-actions row">
        <button type="button" className="btn soft" disabled={!active} onClick={() => exportPlan()}><IconDoc />صدّر الخطة</button>
        {!readOnly && <button type="button" className="btn ghost" onClick={imp.pick}><IconImport />استورد ملفاً</button>}
      </div>
      {imp.input}{imp.sheet}
    </Card>
  )
}

