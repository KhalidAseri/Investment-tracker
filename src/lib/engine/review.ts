import type { AppData, Settings } from '../types.ts'
import { FREQ_MONTHS } from '../labels.ts'

export interface ReviewStatus {
  nextDue: string
  daysUntil: number
  due: boolean
  never: boolean
}

function addMonths(iso: string, months: number): Date {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + months)
  return d
}

export function reviewStatus(data: Pick<AppData, 'assets' | 'settings'>, now = new Date()): ReviewStatus {
  const s: Settings = data.settings
  const months = FREQ_MONTHS[s.review.frequency]
  const firstAsset = data.assets.map((a) => a.createdAt).sort()[0]
  const anchor = s.review.lastReviewAt || firstAsset
  if (!anchor) return { nextDue: '', daysUntil: 0, due: false, never: true }
  const next = addMonths(anchor, months)
  const daysUntil = Math.ceil((next.getTime() - now.getTime()) / 86400000)
  return { nextDue: next.toISOString().slice(0, 10), daysUntil, due: daysUntil <= 0, never: !s.review.lastReviewAt }
}
