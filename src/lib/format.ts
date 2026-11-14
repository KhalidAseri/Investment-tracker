import type { Locale } from './types.ts'

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Latin digits in both languages: they are what Saudi banking apps show and they align in columns. */
export function num(n: number, decimals: 0 | 2 | 'auto' = 'auto'): string {
  if (!Number.isFinite(n)) return '—'
  const d = decimals === 'auto' ? (Math.abs(n) >= 1000 || Number.isInteger(n) ? 0 : 2) : decimals
  return (d === 0 ? nf0 : nf2).format(n)
}

export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M'
  if (a >= 1e4) return (n / 1e3).toFixed(0) + 'K'
  return num(n, 0)
}

export function unit(currency: string, locale: Locale): string {
  if (currency === 'SAR') return locale === 'ar' ? 'ر.س' : 'SAR'
  return currency
}

export function pct(n: number, decimals = 1, sign = false): string {
  if (!Number.isFinite(n)) return '—'
  return (sign && n > 0 ? '+' : '') + n.toFixed(decimals) + '%'
}

export function dateLabel(iso: string, locale: Locale): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory-nu-latn' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function daysAgo(iso: string): number | null {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000)
}

/** Accepts Arabic-Indic digits and Arabic decimal/thousand separators. */
export function parseNumber(s: string): number {
  const latin = s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.')
    .replace(/[٬,\s]/g, '')
  const n = parseFloat(latin)
  return Number.isFinite(n) ? n : 0
}
