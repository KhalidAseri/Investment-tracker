'use client'

import { useId, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { compact, num, pct } from '@/lib/format'
import { cx, Money } from './ui'

const SERIES = '#2a78d6'
const TRACK = '#ecebe6'

/** A single ratio against its limit. */
export function Meter({ value, tone = 'brand', label }: { value: number; tone?: 'brand' | 'good' | 'warn'; label: string }) {
  const v = Math.max(0, Math.min(100, value))
  const color = tone === 'good' ? '#12733a' : tone === 'warn' ? '#c97a00' : '#0f6b5d'
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: TRACK }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${v}%`, background: color }} />
    </div>
  )
}

export interface BarItem {
  key: string
  label: string
  value: number
  pct: number
  color?: string
  note?: string
}

/** Ranked horizontal bars, one hue: parts compared on a shared baseline, figures printed on every row. */
export function BarList({ items, showAmounts = true }: { items: BarItem[]; showAmounts?: boolean }) {
  const max = Math.max(...items.map((i) => i.pct), 1)
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{i.label}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              {showAmounts && <Money value={i.value} className="text-xs text-ink-soft" />}
              <span className="num w-12 text-end font-semibold">{pct(i.pct)}</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 w-full rounded-full" style={{ background: TRACK }}>
            <div className="h-full rounded-full" style={{ width: `${(i.pct / max) * 100}%`, minWidth: i.pct > 0 ? 4 : 0, background: i.color ?? SERIES }} />
          </div>
          {i.note && <p className="hint mt-1">{i.note}</p>}
        </li>
      ))}
    </ul>
  )
}

/** One whole split into a few parts. The list beside it carries names and figures, so the bar stays text-free. */
export function SegBar({ parts }: { parts: { key: string; pct: number; color: string; label: string }[] }) {
  const shown = parts.filter((p) => p.pct > 0)
  return (
    <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={shown.map((p) => `${p.label} ${pct(p.pct)}`).join('، ')}>
      {shown.map((p) => (
        <div key={p.key} style={{ width: `${p.pct}%`, background: p.color, minWidth: 3 }} />
      ))}
    </div>
  )
}

/** Actual share as a bar, target as a tick on the same scale. */
export function TargetBar({ actual, target, color, max }: { actual: number; target: number; color: string; max: number }) {
  const scale = (v: number) => `${Math.min(100, (v / Math.max(max, 1)) * 100)}%`
  return (
    <div className="relative h-2.5 w-full rounded-full" style={{ background: TRACK }}>
      <div className="h-full rounded-full" style={{ width: scale(actual), background: color, minWidth: actual > 0 ? 4 : 0 }} />
      <div className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-white rtl:translate-x-1/2" style={{ insetInlineStart: scale(target) }} aria-hidden />
    </div>
  )
}

interface Point { x: number | string; y: number }

/** Time series with a crosshair tooltip. Always laid out left-to-right: time reads that way in both languages. */
export function LineChart({ points, target, targetLabel, height = 170, label }: { points: Point[]; target?: number; targetLabel?: string; height?: number; label: string }) {
  const { settings } = useStore()
  const gid = useId()
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const W = 340
  const H = height
  const pad = { t: 14, r: 12, b: 22, l: 12 }
  if (points.length < 2) return null

  const ys = points.map((p) => p.y).concat(target !== undefined && target > 0 ? [target] : [])
  const yMax = Math.max(...ys) * 1.06 || 1
  const yMin = Math.min(0, ...ys)
  const sx = (i: number) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r)
  const sy = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')
  const area = `${path} L${sx(points.length - 1).toFixed(1)},${sy(yMin).toFixed(1)} L${sx(0).toFixed(1)},${sy(yMin).toFixed(1)} Z`

  const onMove = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const rel = ((clientX - box.left) / box.width) * W
    const i = Math.round(((rel - pad.l) / (W - pad.l - pad.r)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, i)))
  }
  const h = hover === null ? null : points[hover]
  const amount = (v: number) => (settings.hideAmounts ? '••••' : compact(v))

  return (
    <div dir="ltr" className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label={label}
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES} stopOpacity="0.2" />
            <stop offset="1" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={sy(yMin)} y2={sy(yMin)} stroke="#d9d8d2" strokeWidth="1" />
        {target !== undefined && target > 0 && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={sy(target)} y2={sy(target)} stroke="#0b0b0b" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - pad.r} y={sy(target) - 5} textAnchor="end" fontSize="10" fill="#52514e">{targetLabel} {amount(target)}</text>
          </g>
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {h && hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={sy(yMin)} stroke="#8a897f" strokeWidth="1" />
            <circle cx={sx(hover)} cy={sy(h.y)} r="4.5" fill={SERIES} stroke="#fff" strokeWidth="2" />
          </g>
        )}
        <text x={pad.l} y={H - 6} fontSize="10" fill="#52514e">{points[0].x}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill="#52514e" textAnchor="end">{points[points.length - 1].x}</text>
      </svg>
      {h && hover !== null && (
        <div
          className={cx('pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow-lg')}
          style={{ left: `${(sx(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})` }}
        >
          <span className="opacity-70">{h.x}</span> <span className="num font-semibold">{settings.hideAmounts ? '••••' : num(h.y, 0)}</span>
        </div>
      )}
    </div>
  )
}
