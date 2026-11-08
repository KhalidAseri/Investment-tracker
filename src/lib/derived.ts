import { useMemo } from 'react'
import { useStore } from './store'
import { computeTotals, drifts, upcoming, zakatEstimate } from './calc'
import { todayISO } from './format'
import { payoutSchedule, virtualOccurrences, zakatSchedule } from './income'
import { goalStatus, profileOccurrences } from './profile'
import type { Layer, Sleeve } from './types'

// ---------- update frequency of hand-entered values (lib/staleness.ts) ----------
export { UPDATE_EVERY_OPTIONS, DEFAULT_UPDATE_DAYS, NAV_STALE_DAYS, updateEveryDays, overdueDays, isStaleHolding, nextUpdateDue, updateEveryLabel } from './staleness'
import { isStaleHolding, overdueDays } from './staleness'

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
  const { settings, sleeves, accounts, holdings, snapshots, events, fx, goals } = useStore()
  return useMemo(() => {
    if (!settings) return null
    const totals = computeTotals(holdings, accounts, sleeves, fx)
    const drift = drifts(sleeves, totals, settings)
    // the active plan phase's band when set (sleeves.band_min/band_max), otherwise target ± rebalance_band
    const outOfBand = drift.filter((d) => d.out)
    const zakat = zakatEstimate(holdings, fx)
    const payouts = payoutSchedule(holdings, fx, todayISO(), 365)
    const zakatDue = zakatSchedule(holdings, fx, todayISO(), 365)
    const virtual = (fromISO: string, days: number) => [
      ...virtualOccurrences({ holdings, fx, s: settings, engine: null, fromISO, days }),
      ...profileOccurrences({ s: settings, goals, fromISO, days }),
    ].sort((a, b) => a.date.localeCompare(b.date))
    const goalStats = goals.filter((g) => !g.archived).map((g) => goalStatus(g, totals.goals[g.id] ?? 0))
    const soon = [...upcoming(events, todayISO(), 60), ...virtual(todayISO(), 21).filter((o) => !o.event.id.startsWith('v:d:'))].sort((a, b) => a.date.localeCompare(b.date))
    const today = todayISO()
    const before = [...snapshots].reverse().find((x) => x.snap_date < today)
    const change = before && Number(before.total_sar) > 0 ? totals.total - Number(before.total_sar) : null
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const unassigned = holdings.filter((h) => !h.archived && !h.sleeve_id && Number(h.quantity) !== 0 && !(h.account_id && excluded.has(h.account_id)))
    // due for an update by each holding's own frequency (see isStaleHolding), most overdue first
    const nowMs = Date.now()
    const staleManual = holdings.filter((h) => !h.archived && Number(h.quantity) > 0 && isStaleHolding(h, nowMs))
      .sort((a, b) => (overdueDays(b, nowMs) ?? 0) - (overdueDays(a, nowMs) ?? 0))
    const targetSum = { now: sleeves.reduce((a, s) => a + Number(s.target_now), 0) }
    return {
      totals, drift, outOfBand, zakat, soon, change, unassigned, staleManual, targetSum, payouts, zakatDue, virtual, goalStats,
    }
  }, [settings, sleeves, accounts, holdings, snapshots, events, fx, goals])
}
