import type { CurrencyInfo } from './types'

/**
 * Money formatting for the calculator.
 *
 * Deliberately uses Western digits even in the Arabic UI: Saudi price tags,
 * invoices and scales all show 1234, so Arabic-Indic digits here would make the
 * app harder to check against the shop's own display, not easier.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyInfo,
  options: { decimals?: number; withSymbol?: boolean } = {}
): string {
  const { decimals = currency.decimals, withSymbol = true } = options
  const safe = Number.isFinite(amount) ? amount : 0

  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safe)

  return withSymbol ? `${formatted} ${currency.symbolAr}` : formatted
}

/** Rounded to whole units — used for headline totals where fils are noise. */
export function formatMoneyShort(amount: number, currency: CurrencyInfo): string {
  return formatMoney(amount, currency, { decimals: 0 })
}

export function formatGrams(grams: number): string {
  const safe = Number.isFinite(grams) ? grams : 0
  const decimals = safe < 10 ? 2 : 1
  return `${new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(safe)} جم`
}

export function formatPercent(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toFixed(decimals)}%`
}

export function formatSignedPercent(value: number, decimals = 1): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe >= 0 ? '+' : ''}${safe.toFixed(decimals)}%`
}

/** "قبل ٣ دقائق" style freshness label for the live price badge. */
export function formatAgeAr(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 'غير معروف'

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return 'الآن'

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `قبل ${minutes} دقيقة`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `قبل ${hours} ساعة`

  const days = Math.floor(hours / 24)
  return `قبل ${days} يوم`
}
