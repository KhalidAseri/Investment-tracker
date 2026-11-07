// Small interface helpers shared by the redesigned pages.
import { useEffect, useRef, useState } from 'react'
import type { Holding, Layer, Sleeve } from './types'
import { hijriLabel } from './income'
import { todayISO } from './format'

// ---------- privacy (hide amounts) ----------
const PKEY = 'masar-private'
const readPrivate = () => { try { return localStorage.getItem(PKEY) === '1' } catch { return false } }
const applyPrivate = (on: boolean) => { if (on) document.documentElement.dataset.private = '1'; else delete document.documentElement.dataset.private }
applyPrivate(readPrivate())
export function usePrivacy(): [boolean, () => void] {
  const [on, setOn] = useState(readPrivate)
  useEffect(() => {
    const sync = () => setOn(readPrivate())
    window.addEventListener('masar:privacy', sync)
    return () => window.removeEventListener('masar:privacy', sync)
  }, [])
  const toggle = () => {
    const next = !readPrivate()
    try { localStorage.setItem(PKEY, next ? '1' : '0') } catch { /* private mode */ }
    applyPrivate(next)
    haptic()
    window.dispatchEvent(new Event('masar:privacy'))
  }
  return [on, toggle]
}

// ---------- feel ----------
export const haptic = (ms = 8) => { try { navigator.vibrate?.(ms) } catch { /* not supported */ } }

/** Animates a number towards its new value (respects reduced motion). */
export function useCountUp(value: number, ms = 650) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !Number.isFinite(value)) { setShown(value); from.current = value; return }
    const start = performance.now(), a = from.current, b = value
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms)
      const e = 1 - Math.pow(1 - k, 3)
      setShown(a + (b - a) * e)
      if (k < 1) raf = requestAnimationFrame(tick)
      else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = b }
  }, [value, ms])
  return shown
}

export function greeting(d = new Date()) {
  const h = d.getHours()
  return h < 12 ? 'صباح الخير' : 'مساء الخير'
}

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
export const SHORT_MONTHS = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس']
/** e.g. "السبت 7 نوفمبر · 16 جمادى الأولى" */
export function todayLabel(d = new Date()) {
  const h = hijriLabel(todayISO()).replace(/\s*\d{4}\s*هـ$/, '').replace(/\s*هـ$/, '')
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${h ? ` · ${h}` : ''}`
}

// ---------- actions from anywhere (the shell listens) ----------
export type ActionKind = 'sheet' | 'asset' | 'payout' | 'tx' | 'rebalance' | 'treasury' | 'withdraw' | 'emergency'
export type ActionRequest = { kind: ActionKind; param?: string }
/** Opens a sheet from anywhere; `param` is passed to the sheet (e.g. an amount or a plan action key). */
export const openAction = (kind: ActionKind = 'sheet', param?: string) => {
  haptic()
  window.dispatchEvent(new CustomEvent<ActionRequest>('masar:action', { detail: { kind, param } }))
}

// ---------- colours & initials ----------
export const LAYER_COLOR: Record<Layer, string> = { growth: 'var(--growth)', income: 'var(--income)', safety: 'var(--safety)', hedge: 'var(--hedge)' }
export const layerColor = (l?: Layer | null) => (l ? LAYER_COLOR[l] : 'var(--muted)')
export function assetColor(h: Pick<Holding, 'sleeve_id' | 'goal_id'>, sleeves: Sleeve[]) {
  if (h.goal_id) return 'var(--accent)'
  const s = sleeves.find((x) => x.id === h.sleeve_id)
  return layerColor(s?.layer)
}
const GENERIC = /^(صندوق|شركة|مصرف|بنك|محفظة|حساب|برنامج|صكوك|وديعة|مرابحة|الادخار|ادخار)$/
/** One Arabic letter, or up to four ticker characters. */
export function initialsOf(name: string, symbol?: string | null) {
  const sym = (symbol ?? '').toUpperCase()
  if (sym && /^[A-Z]/.test(sym)) return sym.replace(/\..*$/, '').slice(0, 4)
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const ar = words.filter((w) => /[؀-ۿ]/.test(w))
  if (ar.length) {
    const w = (ar.find((x) => !GENERIC.test(x.replace(/^ال/, '')) && !GENERIC.test(x)) ?? ar[0]).replace(/^(ال|لل|بال)/, '')
    return w.charAt(0)
  }
  const latin = words.filter((w) => /^[A-Za-z]/.test(w))
  if (latin.length) return (latin[0][0] + (latin[1]?.[0] ?? '')).toUpperCase()
  return sym.slice(0, 3) || '•'
}
