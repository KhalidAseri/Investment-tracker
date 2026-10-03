'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { formatMoney } from '@/lib/gold/format'
import { DAY_MS } from '@/lib/gold/history'
import { tapFeedback } from '@/lib/haptics'
import type { CurrencyInfo } from '@/lib/gold/types'

/**
 * A gram's price over time, with next month's forecast cone on the end.
 *
 * Drawn by hand in SVG rather than with a chart library: it is one line, one
 * cone and a crosshair, and a library would roughly double the app's
 * download for that.
 *
 * Time runs left to right even though the app reads right to left. Every
 * price chart a Saudi user has seen — Tadawul, the banks' apps, the news —
 * runs that way, and a mirrored one reads as a falling market at a glance.
 *
 * The forecast is a band, not a line: the dashed median is drawn thinner than
 * the history and sits inside two shades (the darker half of outcomes and
 * the lighter 80%), so it can't be mistaken for a prediction of one price.
 */

export interface ChartPoint {
  t: number
  v: number
}

export interface ConePoint {
  t: number
  median: number
  lo80: number
  hi80: number
  lo50: number
  hi50: number
}

const GOLD = '#d97706'
const GOLD_DARK = '#b45309'
const HEIGHT = 232
const PAD = { top: 26, right: 10, bottom: 26, left: 42 }
const FORECAST_SHARE = 0.26

const MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

/**
 * The SVG is laid out left to right, so Arabic text mixed with numbers inside
 * it ("2 نوفمبر", "أعلى 579") comes out in the wrong order unless it is
 * isolated as right-to-left. The isolate changes the reading order only; the
 * text-anchor still positions the label as written.
 */
const rtl = (text: string) => `\u2067${text}\u2069`

export function formatDateAr(t: number, withYear = true): string {
  const d = new Date(t)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`
}

/** Round tick values: 1, 2, 2.5 or 5 times a power of ten. */
function niceTicks(min: number, max: number, count: number): number[] {
  const raw = (max - min) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v)
  return ticks
}

/** Month starts (or weekly dates on short ranges), spaced so labels never touch. */
function timeTicks(from: number, to: number, width: number, short: boolean) {
  const candidates: number[] = []
  if (short) {
    for (let t = from + 3 * DAY_MS; t < to; t += 7 * DAY_MS) candidates.push(t)
  } else {
    const d = new Date(from)
    let cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)
    while (cursor < to) {
      candidates.push(cursor)
      const c = new Date(cursor)
      cursor = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1)
    }
  }
  const minGap = 44
  const span = to - from
  const picked: number[] = []
  for (const t of candidates) {
    const x = ((t - from) / span) * width
    const lastX = picked.length ? ((picked[picked.length - 1] - from) / span) * width : -Infinity
    if (x - lastX >= minGap && x > 20 && x < width - 20) picked.push(t)
  }
  return picked
}

type Hover =
  | { kind: 'history'; point: ChartPoint }
  | { kind: 'forecast'; point: ConePoint; daysAhead: number }

export default function PriceChart({
  history,
  cone,
  currency,
  rangeDays,
}: {
  /** Per-gram prices, oldest first, already cut to the visible range. */
  history: ChartPoint[]
  cone: ConePoint[] | null
  currency: CurrencyInfo
  rangeDays: number
}) {
  const reduced = useReducedMotion()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<Hover | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    setWidth(Math.round(el.getBoundingClientRect().width))
    return () => ro.disconnect()
  }, [])

  const plotW = Math.max(0, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom

  const geo = useMemo(() => {
    if (history.length < 2 || plotW <= 0) return null
    const today = history[history.length - 1]
    const tMin = history[0].t
    const tMax = cone?.length ? cone[cone.length - 1].t : today.t
    const values = history.map((p) => p.v)
    if (cone) for (const c of cone) values.push(c.lo80, c.hi80)
    let vMin = Math.min(...values)
    let vMax = Math.max(...values)
    const pad = (vMax - vMin) * 0.08 || vMax * 0.02
    vMin -= pad
    vMax += pad

    // The month ahead gets at least a quarter of the width. On a true time
    // scale it would be a sliver at the end of a year, too thin to read or to
    // touch; the tinted background marks where the scale changes.
    const right = PAD.left + plotW
    const split = cone?.length
      ? right - plotW * Math.max(FORECAST_SHARE, (tMax - today.t) / (tMax - tMin))
      : right
    const x = (t: number) =>
      t <= today.t
        ? PAD.left + ((t - tMin) / (today.t - tMin)) * (split - PAD.left)
        : split + ((t - today.t) / (tMax - today.t)) * (right - split)
    const y = (v: number) => PAD.top + (1 - (v - vMin) / (vMax - vMin)) * plotH

    const line = history.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('')
    const area = `${line}L${x(today.t).toFixed(1)},${PAD.top + plotH}L${x(tMin).toFixed(1)},${PAD.top + plotH}Z`

    const band = (lo: keyof ConePoint, hi: keyof ConePoint) =>
      cone
        ? cone.map((c, i) => `${i ? 'L' : 'M'}${x(c.t).toFixed(1)},${y(c[hi]).toFixed(1)}`).join('') +
          [...cone].reverse().map((c) => `L${x(c.t).toFixed(1)},${y(c[lo]).toFixed(1)}`).join('') +
          'Z'
        : ''
    const median = cone
      ? cone.map((c, i) => `${i ? 'L' : 'M'}${x(c.t).toFixed(1)},${y(c.median).toFixed(1)}`).join('')
      : ''

    let high = history[0]
    let low = history[0]
    for (const p of history) {
      if (p.v > high.v) high = p
      if (p.v < low.v) low = p
    }

    return {
      x,
      y,
      split,
      right,
      tMin,
      tMax,
      today,
      line,
      area,
      band80: band('lo80', 'hi80'),
      band50: band('lo50', 'hi50'),
      median,
      high,
      low,
      yTicks: niceTicks(vMin, vMax, 5),
      xTicks: timeTicks(tMin, today.t, split - PAD.left, rangeDays <= 31),
    }
  }, [history, cone, plotW, plotH, rangeDays])

  const decimals = (history[history.length - 1]?.v ?? 0) >= 100 ? 0 : 1
  const fmt = (v: number) => formatMoney(v, currency, { decimals, withSymbol: false })

  const pick = (clientX: number) => {
    if (!geo || !wrapRef.current) return
    const px = clientX - wrapRef.current.getBoundingClientRect().left
    if (px <= geo.split || !cone) {
      const ratio = Math.min(1, Math.max(0, (px - PAD.left) / (geo.split - PAD.left)))
      const t = geo.tMin + ratio * (geo.today.t - geo.tMin)
      let best = history[0]
      for (const p of history) if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p
      setHover({ kind: 'history', point: best })
    } else {
      const ratio = Math.min(1, (px - geo.split) / (geo.right - geo.split))
      const day = Math.round(ratio * (cone.length - 1))
      setHover({ kind: 'forecast', point: cone[day], daysAhead: day })
    }
  }

  const release = () => {
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setHover(null), 1400)
  }
  useEffect(() => () => clearTimeout(hideTimer.current), [])

  const hx = hover && geo ? geo.x(hover.point.t) : 0
  const hy =
    hover && geo ? geo.y(hover.kind === 'history' ? hover.point.v : hover.point.median) : 0

  const drawKey = `${rangeDays}-${history.length}-${currency.code}`
  const first = history[0]
  const last = history[history.length - 1]

  return (
    <div ref={wrapRef} dir="ltr" className="relative select-none" style={{ height: HEIGHT }}>
      {geo && (
        <svg
          width={width}
          height={HEIGHT}
          className="block"
          style={{ touchAction: 'pan-y' }}
          role="img"
          aria-label={`سعر الجرام من ${fmt(first.v)} إلى ${fmt(last.v)} ${currency.labelAr}، أعلى سعر ${fmt(geo.high.v)} وأقل سعر ${fmt(geo.low.v)}`}
          onPointerDown={(e) => {
            clearTimeout(hideTimer.current)
            tapFeedback('light')
            pick(e.clientX)
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons || e.pressure > 0) {
              clearTimeout(hideTimer.current)
              pick(e.clientX)
            }
          }}
          onPointerUp={release}
          onPointerCancel={release}
          onPointerLeave={release}
        >
          <defs>
            <linearGradient id="price-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity="0.22" />
              <stop offset="100%" stopColor={GOLD} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* The future, tinted so "today" reads as an edge. */}
          {cone && (
            <rect x={geo.split} y={PAD.top} width={geo.right - geo.split} height={plotH} fill="#f3f4f6" />
          )}

          {/* Grid and value axis: recessive, behind everything. */}
          {geo.yTicks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.left}
                x2={PAD.left + plotW}
                y1={geo.y(v)}
                y2={geo.y(v)}
                stroke="#e5e7eb"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 6}
                y={geo.y(v) + 3.5}
                textAnchor="end"
                className="fill-gray-400 text-[10px] font-semibold tabular-nums"
              >
                {fmt(v)}
              </text>
            </g>
          ))}
          {geo.xTicks.map((t) => (
            <text
              key={t}
              x={geo.x(t)}
              y={HEIGHT - 8}
              textAnchor="middle"
              className="fill-gray-400 text-[10px] font-semibold"
            >
              {rangeDays <= 31 ? rtl(formatDateAr(t, false)) : MONTHS[new Date(t).getUTCMonth()]}
            </text>
          ))}

          {cone && (
            <text
              x={geo.right}
              y={HEIGHT - 8}
              textAnchor="end"
              className="fill-gray-400 text-[10px] font-semibold"
            >
              {rtl(formatDateAr(cone[cone.length - 1].t, false))}
            </text>
          )}

          {/* Forecast region. */}
          {cone && (
            <motion.g
              key={`cone-${drawKey}`}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.75, duration: 0.5 }}
            >
              <path d={geo.band80} fill={GOLD} fillOpacity="0.12" />
              <path d={geo.band50} fill={GOLD} fillOpacity="0.2" />
              <path
                d={geo.median}
                fill="none"
                stroke={GOLD_DARK}
                strokeWidth="1.5"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
              <text
                x={geo.right}
                y={PAD.top - 9}
                textAnchor="end"
                className="fill-gray-500 text-[10px] font-bold"
              >
                الشهر الجاي
              </text>
            </motion.g>
          )}
          <line
            x1={geo.x(geo.today.t)}
            x2={geo.x(geo.today.t)}
            y1={PAD.top - 4}
            y2={PAD.top + plotH}
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="2 3"
          />

          {/* History. */}
          <motion.path
            key={`area-${drawKey}`}
            d={geo.area}
            fill="url(#price-area)"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.4, duration: 0.5 }}
          />
          <motion.path
            key={`line-${drawKey}`}
            d={geo.line}
            fill="none"
            stroke={GOLD}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Selective labels: the range's high and low, nothing else. */}
          {[
            { p: geo.high, above: true, label: 'أعلى' },
            { p: geo.low, above: false, label: 'أقل' },
          ].map(({ p, above, label }) => {
            const px = geo.x(p.t)
            const anchor = px < PAD.left + 40 ? 'start' : px > PAD.left + plotW - 40 ? 'end' : 'middle'
            return (
              <g key={label}>
                <circle cx={px} cy={geo.y(p.v)} r="3.5" fill="#fff" stroke={GOLD} strokeWidth="2" />
                <text
                  x={px}
                  y={geo.y(p.v) + (above ? -9 : 16)}
                  textAnchor={anchor}
                  className="fill-gray-700 text-[10px] font-extrabold tabular-nums"
                >
                  {rtl(`${label} ${fmt(p.v)}`)}
                </text>
              </g>
            )
          })}

          {/* Today. */}
          <circle cx={geo.x(geo.today.t)} cy={geo.y(geo.today.v)} r="5" fill={GOLD} stroke="#fff" strokeWidth="2" />
          {!reduced && (
            <circle
              cx={geo.x(geo.today.t)}
              cy={geo.y(geo.today.v)}
              r="5"
              fill="none"
              stroke={GOLD}
              strokeWidth="2"
              className="chart-ping"
            />
          )}
          <text
            x={geo.x(geo.today.t) - 4}
            y={PAD.top - 9}
            textAnchor="end"
            className="fill-gray-500 text-[10px] font-bold"
          >
            اليوم
          </text>

          {/* Crosshair. */}
          {hover && (
            <g pointerEvents="none">
              <line x1={hx} x2={hx} y1={PAD.top} y2={PAD.top + plotH} stroke="#111827" strokeWidth="1" />
              <circle
                cx={hx}
                cy={hy}
                r="5"
                fill={hover.kind === 'history' ? GOLD : '#fff'}
                stroke={hover.kind === 'history' ? '#fff' : GOLD_DARK}
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}

      {hover && geo && (
        <div
          dir="rtl"
          className="pointer-events-none absolute top-0 z-10 rounded-xl bg-gray-900 px-3 py-2 text-white shadow-lg"
          style={{
            left: Math.min(Math.max(hx - 80, 0), width - 160),
            width: 160,
          }}
        >
          {hover.kind === 'history' ? (
            <>
              <p className="text-[10px] font-semibold text-gray-300">{formatDateAr(hover.point.t)}</p>
              <p className="text-sm font-extrabold">
                <bdi>{formatMoney(hover.point.v, currency, { decimals })}</bdi>
              </p>
            </>
          ) : (
            <>
              <p className="text-[10px] font-semibold text-gray-300">
                {hover.daysAhead === 0 ? 'اليوم' : `بعد ${hover.daysAhead} يوم · ${formatDateAr(hover.point.t, false)}`}
              </p>
              <p className="text-[11px] font-bold leading-snug">
                غالبًا بين{' '}
                <span dir="rtl" className="inline-flex gap-1 whitespace-nowrap">
                  <bdi dir="ltr">{fmt(hover.point.lo80)}</bdi>
                  <span>و</span>
                  <bdi dir="ltr">{fmt(hover.point.hi80)}</bdi>
                </span>
              </p>
              <p className="text-[10px] text-gray-300">
                الأوسط <bdi className="font-bold text-white">{fmt(hover.point.median)}</bdi>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
