import type { BuyInput, CurrencyCode, RateCard, SavedOffer } from './types'
import { DEFAULT_RATE_CARD } from './rate-card'
import { DEFAULT_CURRENCY } from './constants'

// The app is a static export with no backend, so everything the user
// personalises lives in localStorage on their own device.

const KEYS = {
  rateCard: 'gold_rate_card',
  offers: 'gold_saved_offers',
  prefs: 'gold_prefs',
} as const

export interface GoldPrefs {
  currency: CurrencyCode
  /** Last inputs, so reopening the app resumes where the user left off. */
  lastBuyInput: BuyInput | null
  /** Manual spot override in USD/oz, used when the user distrusts the feed. */
  manualSpotUsdPerOunce: number | null
}

const DEFAULT_PREFS: GoldPrefs = {
  currency: DEFAULT_CURRENCY,
  lastBuyInput: null,
  manualSpotUsdPerOunce: null,
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    // Merge so a newly added field doesn't come back undefined for old users.
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...fallback, ...parsed }
      : parsed
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded or private mode — the app still works, it just forgets.
  }
}

// ---- Rate card (the user's shop assumptions) ----

export function getRateCard(): RateCard {
  return read<RateCard>(KEYS.rateCard, DEFAULT_RATE_CARD)
}

export function saveRateCard(card: RateCard): void {
  write(KEYS.rateCard, card)
}

export function resetRateCard(): RateCard {
  write(KEYS.rateCard, DEFAULT_RATE_CARD)
  return DEFAULT_RATE_CARD
}

// ---- Preferences ----

export function getPrefs(): GoldPrefs {
  return read<GoldPrefs>(KEYS.prefs, DEFAULT_PREFS)
}

export function savePrefs(prefs: Partial<GoldPrefs>): GoldPrefs {
  const next = { ...getPrefs(), ...prefs }
  write(KEYS.prefs, next)
  return next
}

// ---- Saved shop offers ----

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export function getOffers(): SavedOffer[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEYS.offers)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveOffer(offer: Omit<SavedOffer, 'id' | 'createdAt'>): SavedOffer {
  const full: SavedOffer = { ...offer, id: genId(), createdAt: new Date().toISOString() }
  write(KEYS.offers, [full, ...getOffers()])
  return full
}

export function deleteOffer(id: string): void {
  write(KEYS.offers, getOffers().filter((o) => o.id !== id))
}

export function clearOffers(): void {
  write(KEYS.offers, [])
}
