const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const nf1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const nf2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const num0 = (v: number) => nf0.format(Math.round(v || 0))
export const num1 = (v: number) => nf1.format(v || 0)
export const num2 = (v: number) => nf2.format(v || 0)

/** Full riyal amount, e.g. "125,400 ريال" */
export const sar = (v: number) => `${num0(v)} ريال`

/** Compact riyal amount for headlines, e.g. "1.25 مليون" or "84 ألف" */
export function sarShort(v: number): string {
  const a = Math.abs(v || 0)
  const sign = v < 0 ? '−' : ''
  if (a >= 1_000_000) return `${sign}${nf2.format(a / 1_000_000)} مليون`
  if (a >= 10_000) return `${sign}${nf0.format(a / 1000)} ألف`
  return `${sign}${nf0.format(a)} ريال`
}

export const pct = (v: number, digits = 1) => `${(v || 0).toFixed(digits).replace(/\.0+$/, '')}%`

export const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1).replace(/\.0$/, '')}%`

const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export const monthName = (m: number) => months[m] ?? ''

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return `${d.getDate()} ${months[d.getMonth()]}`
}

export function relativeDays(iso: string): string {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff === 0) return 'اليوم'
  if (diff === 1) return 'غداً'
  if (diff === -1) return 'أمس'
  if (diff > 1 && diff <= 10) return `بعد ${diff} أيام`
  if (diff > 10) return `بعد ${diff} يوماً`
  if (diff < -1 && diff >= -10) return `قبل ${-diff} أيام`
  return `قبل ${-diff} يوماً`
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'لم يُحدَّث'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 2) return 'الآن'
  if (mins < 60) return `قبل ${mins} دقيقة`
  const h = Math.round(mins / 60)
  if (h < 24) return `قبل ${h} ساعة`
  const d = Math.round(h / 24)
  return d === 1 ? 'أمس' : `قبل ${d} يوماً`
}

export const todayISO = () => {
  const d = new Date()
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10)
}

export const parseNum = (s: string): number => {
  const ar = '٠١٢٣٤٥٦٧٨٩'
  const clean = String(s ?? '')
    .replace(/[٠-٩]/g, (c) => String(ar.indexOf(c)))
    .replace(/٫/g, '.')
    .replace(/[^0-9.\-]/g, '')
  const n = parseFloat(clean)
  return Number.isFinite(n) ? n : 0
}
