// How often a hand-entered value needs updating, and whether it is due. Pure, store-free (used by derived.ts, plan.ts and pages).
import type { Holding } from './types'

/** «طريقة التحديث» choices for a manual holding, in days (the UI adds «مخصص» for any other number). */
export const UPDATE_EVERY_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 7, label: 'كل أسبوع' }, { days: 14, label: 'كل أسبوعين' }, { days: 30, label: 'كل شهر' },
  { days: 91, label: 'كل 3 أشهر' }, { days: 182, label: 'كل 6 أشهر' }, { days: 365, label: 'كل سنة' },
]
/** manual holdings without their own frequency */
export const DEFAULT_UPDATE_DAYS = 30
/** Mubasher NAV funds keep the earlier rule unless they have their own frequency */
export const NAV_STALE_DAYS = 35
const DAY_MS = 86400000

/**
 * Days between updates for a holding whose value is entered by hand: manual → update_every_days (null = 30);
 * NAV funds (priced automatically, typed in when the price file lags) → update_every_days (null = 35);
 * Yahoo and IBKR prices update daily → null.
 */
export function updateEveryDays(h: Pick<Holding, 'price_source' | 'update_every_days'>): number | null {
  const own = Number(h.update_every_days)
  const set = Number.isFinite(own) && own > 0 ? Math.round(own) : null
  if (h.price_source === 'manual') return set ?? DEFAULT_UPDATE_DAYS
  if (h.price_source === 'nav') return set ?? NAV_STALE_DAYS
  return null
}

/** Days past the holding's update date (negative = days left); null for automatic holdings. */
export function overdueDays(h: Pick<Holding, 'price_source' | 'update_every_days' | 'price_updated_at'>, now = Date.now()): number | null {
  const every = updateEveryDays(h)
  if (every == null) return null
  const at = h.price_updated_at ? Date.parse(h.price_updated_at) : NaN
  if (!Number.isFinite(at)) return Infinity
  return (now - at) / DAY_MS - every
}

/** Older than its own update frequency (never updated counts as old). Archived and automatic holdings never are. */
export function isStaleHolding(h: Pick<Holding, 'price_source' | 'update_every_days' | 'price_updated_at' | 'archived'>, now = Date.now()): boolean {
  if (h.archived) return false
  const d = overdueDays(h, now)
  return d != null && d > 0
}

/** Date the next update is due ('YYYY-MM-DD'), null for automatic holdings or when it was never updated. */
export function nextUpdateDue(h: Pick<Holding, 'price_source' | 'update_every_days' | 'price_updated_at'>): string | null {
  const every = updateEveryDays(h)
  const at = h.price_updated_at ? Date.parse(h.price_updated_at) : NaN
  if (every == null || !Number.isFinite(at)) return null
  return new Date(at + every * DAY_MS).toISOString().slice(0, 10)
}

/** «تلقائي يومياً» · «يدوي كل شهر» · «يدوي كل 45 يوماً» */
export function updateEveryLabel(h: Pick<Holding, 'price_source' | 'update_every_days'>): string {
  const every = updateEveryDays(h)
  if (every == null || (h.price_source === 'nav' && h.update_every_days == null)) return 'تلقائي يومياً'
  const opt = UPDATE_EVERY_OPTIONS.find((o) => o.days === every)
  return `يدوي ${opt ? opt.label : every === 1 ? 'كل يوم' : every === 2 ? 'كل يومين' : every <= 10 ? `كل ${every} أيام` : `كل ${every} يوماً`}`
}
