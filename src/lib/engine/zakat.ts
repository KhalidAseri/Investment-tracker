import type { Quotes, Settings } from '../types.ts'
import type { AssetView } from './valuation.ts'

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
  mode: AssetView['asset']['zakatMode']
  value: number
  base: number
  due: number
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

export function zakatBase(row: AssetView): number {
  const a = row.asset
  if (a.zakatMode === 'FULL') return row.value
  if (a.zakatMode === 'PERCENT') return row.value * (Math.min(100, Math.max(0, a.zakatPercent)) / 100)
  return 0
}

export function zakatStatus(rows: AssetView[], quotes: Quotes, settings: Settings, now = new Date()): ZakatStatus {
  const ratePct = settings.zakat.calendar === 'GREGORIAN' ? RATE_GREGORIAN : RATE_HIJRI
  const out: ZakatRow[] = rows.map((r) => {
    const base = zakatBase(r)
    return { assetId: r.asset.id, name: r.asset.name, mode: r.asset.zakatMode, value: r.value, base, due: base * (ratePct / 100) }
  })
  const base = out.reduce((s, r) => s + r.base, 0)
  const gram = goldPricePerGram(quotes, settings)
  const nisab = gram * NISAB_GOLD_GRAMS
  const aboveNisab = gram > 0 ? base >= nisab : null
  const due = aboveNisab === false ? 0 : base * (ratePct / 100)
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
