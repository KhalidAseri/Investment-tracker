import { useMemo } from 'react'
import { useStore } from './store'
import {
  computeTotals, drifts, fiYear, plannedValueAt, project, requiredContribution, targetCapitalToday, targetNominal, upcoming,
  withdrawalStatus, yearFrac, zakatEstimate,
} from './calc'
import { todayISO } from './format'
import { incomeEngine, payoutSchedule, virtualOccurrences, zakatSchedule } from './income'
import { contributionFromProfile, goalStatus, profileOccurrences } from './profile'
import type { Layer, Sleeve } from './types'

export const LAYER_VAR: Record<Layer, string> = {
  growth: 'var(--growth)', income: 'var(--income)', safety: 'var(--safety)', hedge: 'var(--hedge)',
}

/** One colour per sleeve: its layer hue, lighter for later sleeves in the same layer. */
export function sleeveColors(sleeves: Sleeve[]): Record<string, { color: string; opacity: number }> {
  const seen: Record<string, number> = {}
  const out: Record<string, { color: string; opacity: number }> = {}
  for (const s of sleeves) {
    const i = (seen[s.layer] = (seen[s.layer] ?? -1) + 1)
    out[s.id] = { color: LAYER_VAR[s.layer], opacity: Math.max(0.38, 1 - i * 0.22) }
  }
  return out
}

export function useDerived() {
  const { settings, sleeves, accounts, holdings, snapshots, events, fx, transactions, streams, goals } = useStore()
  return useMemo(() => {
    if (!settings) return null
    const totals = computeTotals(holdings, accounts, sleeves, fx)
    const drift = drifts(sleeves, totals, settings)
    const proj = project(settings, totals.total, 24)
    const fi = fiYear(proj, 'mid')
    const fiLow = fiYear(proj, 'low')
    const fiHigh = fiYear(proj, 'high')
    const capitalToday = targetCapitalToday(settings)
    const capitalSafe = targetCapitalToday(settings, settings.safe_withdrawal_rate)
    const targetAtGoalYear = targetNominal(settings, settings.independence_year)
    const needContribution = requiredContribution(settings, totals.total, settings.independence_year)
    const planned = plannedValueAt(settings)
    const aheadBy = planned == null ? null : totals.total - planned
    const incomeNow = (totals.total * settings.withdrawal_rate) / 100 / 12
    const progress = totals.total / targetNominal(settings, yearFrac())
    const outOfBand = drift.filter((d) => Math.abs(d.diff) > settings.rebalance_band)
    const safety = totals.byLayer.safety
    const wd = withdrawalStatus(settings, snapshots, totals.total, safety)
    const zakat = zakatEstimate(holdings, fx)
    const projectedAt = (year: number) => (proj.find((p) => p.year >= year) ?? proj[proj.length - 1]).mid
    const engine = incomeEngine({ s: settings, totals, sleeves, holdings, fx, snapshots, transactions, projectedAt })
    const payouts = payoutSchedule(holdings, fx, todayISO(), 365)
    const zakatDue = zakatSchedule(holdings, fx, todayISO(), 365)
    const virtual = (fromISO: string, days: number) => [
      ...virtualOccurrences({ holdings, fx, s: settings, engine, fromISO, days }),
      ...profileOccurrences({ s: settings, streams, goals, fromISO, days }),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const contribution = contributionFromProfile(settings, streams)
    const goalStats = goals.filter((g) => !g.archived).map((g) => goalStatus(g, totals.goals[g.id] ?? 0))
    const soon = [...upcoming(events, todayISO(), 60), ...virtual(todayISO(), 21).filter((o) => !o.event.id.startsWith('v:d:'))].sort((a, b) => a.date.localeCompare(b.date))
    const today = todayISO()
    const before = [...snapshots].reverse().find((x) => x.snap_date < today)
    const change = before && Number(before.total_sar) > 0 ? totals.total - Number(before.total_sar) : null
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const unassigned = holdings.filter((h) => !h.archived && !h.sleeve_id && Number(h.quantity) !== 0 && !(h.account_id && excluded.has(h.account_id)))
    const staleManual = holdings.filter((h) => !h.archived && (h.price_source === 'manual' || h.price_source === 'nav') && Number(h.quantity) > 0 &&
      (!h.price_updated_at || Date.now() - new Date(h.price_updated_at).getTime() > 35 * 86400000))
    const targetSum = { now: sleeves.reduce((a, s) => a + Number(s.target_now), 0), fi: sleeves.reduce((a, s) => a + Number(s.target_fi), 0) }
    return {
      totals, drift, proj, fi, fiLow, fiHigh, capitalToday, capitalSafe, targetAtGoalYear, needContribution, planned, aheadBy,
      incomeNow, progress, outOfBand, wd, zakat, soon, change, unassigned, staleManual, targetSum, engine, payouts, zakatDue, virtual, contribution, goalStats,
    }
  }, [settings, sleeves, accounts, holdings, snapshots, events, fx, transactions, streams, goals])
}
