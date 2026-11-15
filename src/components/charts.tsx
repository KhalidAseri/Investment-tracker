'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useStore } from '@/lib/store'
import { compact, num, pct } from '@/lib/format'
import { treemap } from '@/lib/treemap'
import world from '@/lib/world-paths.json'
import { cx, Money } from './ui'

const SERIES = 'var(--c1)'
const TRACK = 'rgb(var(--track))'
const EASE = [0.16, 1, 0.3, 1] as const
// Sequential blue ramp, light to dark: more is darker. Zero keeps the track colour.
const RAMP = ['#b7d3f6', '#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281']

/** A single ratio against its limit. */
export function Meter({ value, tone = 'brand', label }: { value: number; tone?: 'brand' | 'good' | 'warn'; label: string }) {
  const v = Math.max(0, Math.min(100, value))
  const color = tone === 'good' ? 'rgb(var(--gain))' : tone === 'warn' ? 'var(--c4)' : 'rgb(var(--accent))'
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: TRACK }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.7, ease: EASE }} />
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
export function BarList({ items, showAmounts = true, onSelect, selected }: { items: BarItem[]; showAmounts?: boolean; onSelect?: (key: string) => void; selected?: string | null }) {
  const max = Math.max(...items.map((i) => i.pct), 1)
  return (
    <ul className="space-y-3">
      {items.map((i) => {
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{i.label}</span>
              <span className="flex shrink-0 items-baseline gap-2">
                {showAmounts && <Money value={i.value} className="text-xs text-ink-soft" />}
                <span className="num w-12 text-end font-semibold">{pct(i.pct)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 w-full rounded-full" style={{ background: TRACK }}>
              <motion.div className="h-full rounded-full" style={{ minWidth: i.pct > 0 ? 4 : 0, background: i.color ?? SERIES }} initial={{ width: 0 }} animate={{ width: `${(i.pct / max) * 100}%` }} transition={{ duration: 0.6, ease: EASE }} />
            </div>
            {i.note && <p className="hint mt-1">{i.note}</p>}
          </>
        )
        return (
          <li key={i.key}>
            {onSelect
              ? <button className={cx('-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1 text-start transition-colors', selected === i.key ? 'bg-tint' : 'hover:bg-surface')} aria-pressed={selected === i.key} onClick={() => onSelect(i.key)}>{body}</button>
              : body}
          </li>
        )
      })}
    </ul>
  )
}

/** One whole split into a few parts. The list beside it carries names and figures, so the bar stays text-free. */
export function SegBar({ parts }: { parts: { key: string; pct: number; color: string; label: string }[] }) {
  const shown = parts.filter((p) => p.pct > 0)
  return (
    <div className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={shown.map((p) => `${p.label} ${pct(p.pct)}`).join('، ')}>
      {shown.map((p) => (
        <motion.div key={p.key} layout style={{ background: p.color, minWidth: 3 }} initial={false} animate={{ width: `${p.pct}%` }} transition={{ type: 'spring', damping: 30, stiffness: 260 }} />
      ))}
    </div>
  )
}

/** Actual share as a bar, target as a tick on the same scale. */
export function TargetBar({ actual, target, color, max }: { actual: number; target: number; color: string; max: number }) {
  const scale = (v: number) => `${Math.min(100, (v / Math.max(max, 1)) * 100)}%`
  return (
    <div className="relative h-2.5 w-full rounded-full" style={{ background: TRACK }}>
      <motion.div className="h-full rounded-full" style={{ background: color, minWidth: actual > 0 ? 4 : 0 }} initial={{ width: 0 }} animate={{ width: scale(actual) }} transition={{ duration: 0.6, ease: EASE }} />
      <div className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-ink ring-2 ring-card rtl:translate-x-1/2" style={{ insetInlineStart: scale(target) }} aria-hidden />
    </div>
  )
}

export interface DonutSlice { key: string; label: string; value: number; pct: number; color: string }

/**
 * Part-to-whole ring. Tapping a slice selects it: the others recede and the centre shows its figures.
 * The caller renders the legend and the drill-down list, so every colour is also named in text.
 */
export function Donut({ slices, selected, onSelect, centerLabel, total }: { slices: DonutSlice[]; selected: string | null; onSelect: (key: string | null) => void; centerLabel: string; total: number }) {
  const R = 78, STROKE = 26, C = 2 * Math.PI * R, GAP = slices.length > 1 ? 3 : 0
  const sel = slices.find((s) => s.key === selected) ?? null
  let offset = 0
  const arcs = slices.filter((s) => s.pct > 0).map((s) => {
    const len = Math.max(0.5, (s.pct / 100) * C - GAP)
    const arc = { ...s, len, offset }
    offset += (s.pct / 100) * C
    return arc
  })
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[250px]">
      <svg viewBox="0 0 220 220" className="h-full w-full -rotate-90" role="img" aria-label={slices.map((s) => `${s.label} ${pct(s.pct)}`).join('، ')}>
        <circle cx="110" cy="110" r={R} fill="none" stroke={TRACK} strokeWidth={STROKE} />
        {arcs.map((a) => (
          <motion.circle key={a.key} cx="110" cy="110" r={R} fill="none" stroke={a.color} strokeLinecap="butt" className="cursor-pointer outline-none"
            initial={{ strokeDasharray: `0 ${C}`, strokeDashoffset: -a.offset, opacity: 0 }}
            animate={{ strokeDasharray: `${a.len} ${C - a.len}`, strokeDashoffset: -a.offset, opacity: selected && selected !== a.key ? 0.28 : 1, strokeWidth: selected === a.key ? STROKE + 6 : STROKE }}
            transition={{ duration: 0.6, ease: EASE }}
            onClick={() => onSelect(selected === a.key ? null : a.key)}
            tabIndex={0} role="button" aria-pressed={selected === a.key} aria-label={`${a.label} ${pct(a.pct)}`}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(selected === a.key ? null : a.key) } }} />
        ))}
      </svg>
      <button className="absolute inset-[26%] flex flex-col items-center justify-center rounded-full text-center" onClick={() => onSelect(null)} aria-label={sel ? centerLabel : undefined} tabIndex={sel ? 0 : -1}>
        <span className="max-w-full truncate text-xs text-ink-soft">{sel ? sel.label : centerLabel}</span>
        <span className="num text-xl font-bold leading-tight">{sel ? pct(sel.pct) : <Money value={total} />}</span>
        {sel && <Money value={sel.value} className="text-xs text-ink-soft" />}
      </button>
    </div>
  )
}

/** Positions sized by weight. Tiles carry their own label where it fits; the caller lists every item below. */
export function Treemap({ items, selected, onSelect, height = 220 }: { items: BarItem[]; selected: string | null; onSelect: (key: string | null) => void; height?: number }) {
  const W = 340
  const rects = useMemo(() => treemap(items.filter((i) => i.value > 0), (i) => i.value, W, height), [items, height])
  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: `${W} / ${height}` }} role="list">
      {rects.map(({ item, x, y, w, h }) => {
        const big = w > 62 && h > 34
        return (
          <motion.button key={item.key} role="listitem" layout
            className="absolute overflow-hidden border-2 border-card p-1.5 text-start text-white outline-none"
            style={{ left: `${(x / W) * 100}%`, top: `${(y / height) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / height) * 100}%`, background: item.color ?? SERIES, borderRadius: 10 }}
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: selected && selected !== item.key ? 0.35 : 1, scale: 1 }} transition={{ duration: 0.35, ease: EASE }}
            onClick={() => onSelect(selected === item.key ? null : item.key)} aria-pressed={selected === item.key} aria-label={`${item.label} ${pct(item.pct)}`}>
            {big && <><span className="block truncate text-[11px] font-semibold leading-tight">{item.label}</span><span className="num block text-[11px] opacity-90">{pct(item.pct, 0)}</span></>}
          </motion.button>
        )
      })}
    </div>
  )
}

const COUNTRY = new Map(world.countries.map((c) => [c.id, c]))
export function countryName(code: string, locale: 'ar' | 'en'): string {
  const c = COUNTRY.get(code)
  return c ? (locale === 'ar' ? c.ar : c.en) : code
}

/** World map shaded by weight (darker = more). Tap a country to select it; the caller lists the figures. */
export function WorldMap({ weights, selected, onSelect }: { weights: Record<string, number>; selected: string | null; onSelect: (code: string | null) => void }) {
  const { settings } = useStore()
  const max = Math.max(...Object.values(weights), 0)
  const shade = (w: number) => (w > 0 && max > 0 ? RAMP[Math.min(RAMP.length - 1, Math.floor((Math.sqrt(w / max)) * (RAMP.length - 0.001)))] : TRACK)
  return (
    <div dir="ltr">
      <svg viewBox={`0 0 ${world.width} ${world.height}`} className="w-full" role="img" aria-label={settings.locale === 'ar' ? 'خريطة توزيع المحفظة على الدول' : 'Map of the portfolio by country'}>
        {world.countries.map((c) => {
          const w = weights[c.id] ?? 0
          const on = selected === c.id
          return (
            <path key={c.id} d={c.d} fill={shade(w)} stroke={on ? 'rgb(var(--ink))' : 'rgb(var(--card))'} strokeWidth={on ? 1.6 : 0.5}
              className={cx('outline-none transition-[fill] duration-500', w > 0 && 'cursor-pointer')}
              onClick={w > 0 ? () => onSelect(on ? null : c.id) : undefined}>
              {w > 0 && <title>{`${settings.locale === 'ar' ? c.ar : c.en} ${pct(w)}`}</title>}
            </path>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-ink-soft" dir={settings.locale === 'ar' ? 'rtl' : 'ltr'}>
        <span>{settings.locale === 'ar' ? 'أقل' : 'Less'}</span>
        <span className="flex gap-0.5">{RAMP.map((c) => <span key={c} className="h-2 w-5 rounded-sm" style={{ background: c }} />)}</span>
        <span>{settings.locale === 'ar' ? 'أكثر' : 'More'}</span>
      </div>
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
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full touch-pan-y select-none text-ink-soft" role="img" aria-label={label}
        onPointerMove={(e) => onMove(e.clientX)} onPointerDown={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES} stopOpacity="0.22" />
            <stop offset="1" stopColor={SERIES} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1={pad.l} x2={W - pad.r} y1={sy(yMin)} y2={sy(yMin)} stroke="rgb(var(--line))" strokeWidth="1" />
        {target !== undefined && target > 0 && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={sy(target)} y2={sy(target)} stroke="rgb(var(--ink))" strokeWidth="1" strokeDasharray="4 4" />
            <text x={W - pad.r} y={sy(target) - 5} textAnchor="end" fontSize="10" fill="currentColor">{targetLabel} {amount(target)}</text>
          </g>
        )}
        <motion.path key={points.length + ':' + points[0].x} d={area} fill={`url(#${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.25 }} />
        <motion.path key={'l' + points.length + ':' + points[0].x} d={path} fill="none" stroke={SERIES} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: EASE }} />
        {h && hover !== null && (
          <g>
            <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={sy(yMin)} stroke="rgb(var(--ink-faint))" strokeWidth="1" />
            <circle cx={sx(hover)} cy={sy(h.y)} r="4.5" fill={SERIES} stroke="rgb(var(--card))" strokeWidth="2" />
          </g>
        )}
        <text x={pad.l} y={H - 6} fontSize="10" fill="currentColor">{points[0].x}</text>
        <text x={W - pad.r} y={H - 6} fontSize="10" fill="currentColor" textAnchor="end">{points[points.length - 1].x}</text>
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-surface shadow-float" style={{ left: `${(sx(hover) / W) * 100}%`, transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})` }}>
          <span className="opacity-70">{h.x}</span> <span className="num font-semibold">{settings.hideAmounts ? '••••' : num(h.y, 0)}</span>
        </div>
      )}
    </div>
  )
}
