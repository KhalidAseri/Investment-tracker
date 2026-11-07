// One row per plan action (from planActions in lib/plan.ts), shared by Home and the Plan tab.
// The row's button runs the action's CTA: a route, a sheet opened through openAction, or "mark step done".
import type { ReactNode } from 'react'
import { relativeDays } from '../lib/format'
import { openAction, haptic } from '../lib/ui'
import { usePlanOps } from '../lib/usePlan'
import { useStore } from '../lib/store'
import type { ActionArea, PlanAction } from '../lib/plan'
import { Money } from './kit'
import {
  IconAlert, IconCalendar, IconCash, IconCheck, IconCoins, IconDeposit, IconDoc, IconPencil, IconScale, IconShield, IconSparkle, IconClose,
} from './icons'

const AREA_ICON: Record<ActionArea, () => ReactNode> = {
  reserve: () => <IconShield />,
  step: () => <IconCheck />,
  deposit: () => <IconDeposit />,
  rebalance: () => <IconScale />,
  income: () => <IconCoins />,
  review: () => <IconDoc />,
  zakat: () => <IconCash />,
  data: () => <IconPencil />,
  info: () => <IconSparkle />,
}

/** Runs the CTA of a plan action. Returns false when there is nothing to run. */
export function useRunPlanAction() {
  const ops = usePlanOps()
  const { notify } = useStore()
  return async (a: PlanAction) => {
    const c = a.cta
    if (!c) return false
    haptic()
    if (c.action === 'step') {
      const ok = await ops.markStep(c.param ?? a.key.replace(/^step:/, ''), true)
      if (ok) notify('أحسنت، سُجّلت الخطوة منجزة')
      return ok
    }
    if (c.action === 'review') { location.hash = '/review'; return true }
    if (c.action === 'update') { location.hash = '/update'; return true }
    if (c.action === 'rebalance' || c.action === 'treasury' || c.action === 'withdraw' || c.action === 'emergency') {
      openAction(c.action, c.param ?? (a.amount != null ? String(Math.round(a.amount)) : undefined))
      return true
    }
    if (c.route) { location.hash = `/${c.route.replace(/^#?\/?/, '')}`; return true }
    return false
  }
}

/**
 * A plan action as a list row: icon by area, title, detail line (amount and due date), and the CTA button.
 * `compact` drops the button label and makes the whole row tappable (Home).
 */
export function ActionRow({ a, compact, onDismiss }: { a: PlanAction; compact?: boolean; onDismiss?: (a: PlanAction) => void }) {
  const run = useRunPlanAction()
  const { readOnly } = useStore()
  const icon = a.tone === 'bad' ? <IconAlert /> : (a.due && a.area === 'step' ? <IconCalendar /> : AREA_ICON[a.area]())
  const sub: ReactNode[] = []
  if (a.amount != null && a.amount > 0) sub.push(<Money key="m" v={a.amount} />)
  if (a.detail) sub.push(<span key="d">{a.detail}</span>)
  if (a.due && a.area !== 'zakat' && a.area !== 'step') sub.push(<span key="due">{relativeDays(a.due)}</span>)
  const subLine = sub.length ? <small>{sub.flatMap((x, i) => (i ? [<span key={`s${i}`} aria-hidden> · </span>, x] : [x]))}</small> : null
  const canRun = !!a.cta && !(readOnly && a.owner)
  const body = <>
    <span className="ico">{icon}</span>
    <p>{a.title}{subLine}</p>
  </>
  if (compact) {
    return (
      <button type="button" className={`attn ${a.tone}`} onClick={() => { if (canRun) run(a) }} disabled={!canRun} style={!canRun ? { cursor: 'default' } : undefined}>
        {body}
        {canRun && <span className="attn-cta">{a.cta!.label}</span>}
      </button>
    )
  }
  return (
    <div className={`attn plan-action ${a.tone}`} style={{ cursor: 'default' }}>
      {body}
      {canRun && <button type="button" className={`btn small ${a.priority === 1 ? 'primary' : 'soft'}`} onClick={() => run(a)}>{a.cta!.label}</button>}
      {onDismiss && a.dismissible && !readOnly && (
        <button type="button" className="icon-btn dismiss" aria-label="إخفاء هذا الإجراء" title="إخفاء" onClick={() => { haptic(); onDismiss(a) }}><IconClose /></button>
      )}
    </div>
  )
}
