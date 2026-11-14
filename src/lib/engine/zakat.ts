import type { Asset, Quotes, Settings } from '../types.ts'
import { fxRate, type AssetView } from './valuation.ts'

export const NISAB_GOLD_GRAMS = 85
export const TROY_OUNCE_GRAMS = 31.1035
export const GOLD_SYMBOL = 'GC=F'
export const RATE_HIJRI = 2.5
/** 2.5% scaled for a 365-day year instead of the ~354-day lunar year. */
export const RATE_GREGORIAN = 2.577

export function goldPricePerGram(quotes: Quotes, settings: Settings): number {
  const q = quotes[GOLD_SYMBOL]
  if (q && q.price > 0) return (q.price / TROY_OUNCE_GRAMS) * (settings.fx.USD ?? 3.75)
  return settings.zakat.goldPricePerGram
}

export interface ZakatRow {
  assetId: string
  name: string
  mode: Asset['zakatMode']
  value: number
  /** Zakatable base in SAR (for the nisab check). */
  base: number
  due: number
  /** Zakat as a percent of the asset's own value. */
  effectivePct: number
}

export interface ZakatStatus {
  ratePct: number
  rows: ZakatRow[]
  base: number
  nisab: number
  /** null when no gold price is known, so nisab cannot be checked. */
  aboveNisab: boolean | null
  due: number
  daysToHawl: number | null
}

export type ZakatFields = Pick<Asset, 'zakatMode' | 'zakatPercent' | 'zakatPerUnit' | 'zakatAmount'>

/**
 * Zakat for one asset. `value` is its market value in SAR, `unitFx` converts one unit of its currency to SAR.
 * Used by the engine and by the per-asset control, so both always agree.
 */
export function zakatDue(z: ZakatFields, value: number, quantity: number, unitFx: number, ratePct: number): { due: number; base: number } {
  const rate = ratePct / 100
  switch (z.zakatMode) {
    case 'FULL':
      return { base: value, due: value * rate }
    case 'PERCENT': {
      const base = value * (Math.min(100, Math.max(0, z.zakatPercent)) / 100)
      return { base, due: base * rate }
    }
    case 'PER_UNIT': {
      const due = Math.max(0, quantity * (z.zakatPerUnit ?? 0) * unitFx)
      return { base: rate > 0 ? due / rate : 0, due }
    }
    case 'AMOUNT': {
      const due = Math.max(0, z.zakatAmount ?? 0)
      return { base: rate > 0 ? due / rate : 0, due }
    }
    default:
      return { base: 0, due: 0 }
  }
}

export function zakatRate(settings: Settings): number {
  return settings.zakat.calendar === 'GREGORIAN' ? RATE_GREGORIAN : RATE_HIJRI
}

export function zakatStatus(rows: AssetView[], quotes: Quotes, settings: Settings, now = new Date()): ZakatStatus {
  const ratePct = zakatRate(settings)
  const out: ZakatRow[] = rows
    .map((r) => {
      const { base, due } = zakatDue(r.asset, r.value, r.asset.quantity, fxRate(r.asset.currency, settings.fx), ratePct)
      return { assetId: r.asset.id, name: r.asset.name, mode: r.asset.zakatMode, value: r.value, base, due, effectivePct: r.value > 0 ? (due / r.value) * 100 : 0 }
    })
    .sort((a, b) => b.due - a.due)
  const base = out.reduce((s, r) => s + r.base, 0)
  const gram = goldPricePerGram(quotes, settings)
  const nisab = gram * NISAB_GOLD_GRAMS
  const aboveNisab = gram > 0 ? base >= nisab : null
  const due = aboveNisab === false ? 0 : out.reduce((s, r) => s + r.due, 0)
  let daysToHawl: number | null = null
  if (settings.zakat.hawlDate) {
    const t = new Date(settings.zakat.hawlDate + 'T00:00:00').getTime()
    if (!Number.isNaN(t)) daysToHawl = Math.ceil((t - now.getTime()) / 86400000)
  }
  return { ratePct, rows: out, base, nisab, aboveNisab, due, daysToHawl }
}

export function nextHawlDate(from: string, calendar: Settings['zakat']['calendar']): string {
  const d = new Date((from || new Date().toISOString().slice(0, 10)) + 'T00:00:00')
  if (calendar === 'GREGORIAN') d.setFullYear(d.getFullYear() + 1)
  else d.setDate(d.getDate() + 354)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
