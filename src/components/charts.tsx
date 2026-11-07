import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PlanSettings } from '../lib/types'
import type { ProjPoint } from '../lib/calc'
import { ageAt, yearFrac } from '../lib/calc'
import { num0 } from '../lib/format'

/** Measures the container so chart text stays at real pixel size on phones. */
function useWidth(fallback = 720) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const set = (v: number) => setW(Math.max(280, Math.round(v)))
    set(el.clientWidth || fallback)
    const ro = new ResizeObserver(([e]) => set(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [fallback])
  return [ref, w] as const
}
function niceStep(max: number, target = 4) {
  const raw = max / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const n = raw / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}
const millions = (v: number) => {
  if (v === 0) return '0'
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)} م`
  return `${Math.round(v / 1000)} ألف`
}
const pathOf = (pts: Array<[number, number]>) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

interface PathProps {
  settings: PlanSettings
  proj: ProjPoint[]
  history?: Array<{ year: number; value: number }>
  planned?: Array<{ year: number; value: number }>
  fi: number | null
  height?: number
  showBand?: boolean
  title: string
}

/** The plan as a path: target horizon, projected range, planned line, actual history, and the independence point. */
export function PathChart({ settings, proj, history = [], planned = [], fi, height = 300, showBand = true, title }: PathProps) {
  const [box, W] = useWidth()
  const H = Math.round(Math.max(230, Math.min(height, W * 0.62)))
  const m = { l: 44, r: 14, t: 38, b: 28 }
  const now = yearFrac()
  const start = Math.min(now, history[0]?.year ?? now, planned[0]?.year ?? now)
  const goal = Math.max(settings.independence_year, fi ? Math.ceil(fi) : settings.independence_year)
  const end = Math.min(start + 24, goal + 1.5)
  const inRange = proj.filter((p) => p.year <= end + 0.01)
  const maxY = Math.max(
    ...inRange.map((p) => Math.max(p.target, showBand ? p.high : p.mid)),
    ...history.map((h) => h.value),
    1,
  ) * 1.06
  const step = niceStep(maxY)
  const X = (y: number) => m.l + ((y - start) / (end - start)) * (W - m.l - m.r)
  const Y = (v: number) => H - m.b - (v / maxY) * (H - m.t - m.b)
  const ticks: number[] = []
  for (let v = 0; v <= maxY; v += step) ticks.push(v)
  const span = end - start
  const maxLabels = Math.max(4, Math.floor((W - m.l - m.r) / 54))
  const yStep = Math.max(1, Math.ceil(span / maxLabels))
  const years: number[] = []
  for (let y = Math.ceil(start); y <= end; y += 1) if ((y - Math.ceil(start)) % yStep === 0) years.push(y)

  const band = useMemo(() => {
    if (!showBand) return ''
    const up = inRange.map((p) => [X(p.year), Y(p.high)] as [number, number])
    const down = [...inRange].reverse().map((p) => [X(p.year), Y(p.low)] as [number, number])
    return pathOf([...up, ...down]) + 'Z'
  }, [inRange, showBand, maxY, start, end, W, H])

  const targetLine = pathOf(inRange.map((p) => [X(p.year), Y(p.target)]))
  const midLine = pathOf(inRange.map((p) => [X(p.year), Y(p.mid)]))
  const plannedLine = pathOf(planned.filter((p) => p.year <= end).map((p) => [X(p.year), Y(p.value)]))
  const histLine = pathOf(history.map((h) => [X(h.year), Y(h.value)]))
  const nowVal = proj[0]?.mid ?? 0
  const fiPoint = fi && fi <= end ? (() => {
    const a = inRange.findIndex((p) => p.year >= fi)
    const p1 = inRange[Math.max(0, a - 1)], p2 = inRange[Math.max(0, a)]
    const t = p2.year === p1.year ? 0 : (fi - p1.year) / (p2.year - p1.year)
    return { x: X(fi), y: Y(p1.target + (p2.target - p1.target) * t) }
  })() : null
  const firstTarget = inRange[0]
  const fiLabel = fi ? `الاستقلال ${Math.round(fi)}، سن ${ageAt(settings, Math.round(fi))}` : ''
  const fiAnchor = fiPoint ? (fiPoint.x > W - 120 ? 'start' : fiPoint.x < m.l + 120 ? 'end' : 'middle') : 'middle'

  return (
    <div ref={box}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} direction="ltr">
      <g>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{millions(v)}</text>
          </g>
        ))}
        {years.map((y) => <text key={y} x={X(y)} y={H - 8} textAnchor="middle">{y}</text>)}
      </g>
      {showBand && <path d={band} fill="var(--accent)" fillOpacity={0.1} />}
      <path d={targetLine} fill="none" stroke="var(--horizon)" strokeWidth={2} strokeDasharray="6 5" />
      {firstTarget && (
        <text x={m.l + 4} y={Y(firstTarget.target) - 9} textAnchor="start" style={{ fill: 'var(--horizon)', fontWeight: 600 }}>الهدف</text>
      )}
      {planned.length > 1 && <path d={plannedLine} fill="none" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="2 4" />}
      <path d={midLine} fill="none" stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" pathLength={1} className="draw" />
      {history.length > 1 && <path d={histLine} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />}
      {fiPoint && (
        <g>
          <line x1={fiPoint.x} x2={fiPoint.x} y1={fiPoint.y} y2={H - m.b} stroke="var(--accent)" strokeOpacity={0.5} strokeDasharray="3 4" />
          <circle cx={fiPoint.x} cy={fiPoint.y} r={7} fill="var(--surface)" stroke="var(--accent)" strokeWidth={3} />
          <text x={fiPoint.x} y={fiPoint.y - 16} textAnchor={fiAnchor} direction="rtl" className="label-strong">{fiLabel}</text>
        </g>
      )}
      <g>
        <circle cx={X(now)} cy={Y(nowVal)} r={9} fill="var(--accent)" fillOpacity={0.18} />
        <circle cx={X(now)} cy={Y(nowVal)} r={4.5} fill="var(--ink)" />
        <text x={X(now) + 8} y={Y(nowVal) - 12} textAnchor="start" className="label-strong">اليوم</text>
      </g>
    </svg>
    </div>
  )
}

interface Series { key: string; label: string; color: string; dashed?: boolean; points: Array<{ x: number; y: number }> }

/** Simple multi-line chart for income over time after independence. */
export function LinesChart({ series, height = 260, title, yFormat = (v: number) => num0(v), reference }: {
  series: Series[]; height?: number; title: string; yFormat?: (v: number) => string; reference?: { y: number; label: string }
}) {
  const [box, W] = useWidth()
  const H = Math.round(Math.max(210, Math.min(height, W * 0.58)))
  const m = { l: 52, r: 12, t: 24, b: 28 }
  const all = series.flatMap((s) => s.points)
  if (!all.length) return <div ref={box} />
  const minX = Math.min(...all.map((p) => p.x))
  const maxX = Math.max(...all.map((p) => p.x))
  const maxY = Math.max(...all.map((p) => p.y), reference?.y ?? 0, 1) * 1.1
  const step = niceStep(maxY)
  const X = (x: number) => m.l + ((x - minX) / (maxX - minX || 1)) * (W - m.l - m.r)
  const Y = (v: number) => H - m.b - (v / maxY) * (H - m.t - m.b)
  const ticks: number[] = []
  for (let v = 0; v <= maxY; v += step) ticks.push(v)
  const xs: number[] = []
  const xStep = Math.max(1, Math.ceil((maxX - minX) / Math.max(4, Math.floor((W - m.l - m.r) / 46)) / 5) * 5)
  for (let x = Math.ceil(minX / xStep) * xStep; x <= maxX; x += xStep) xs.push(x)
  return (
    <div ref={box}>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} direction="ltr">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{yFormat(v)}</text>
        </g>
      ))}
      {xs.map((x) => <text key={x} x={X(x)} y={H - 8} textAnchor="middle">{x}</text>)}
      {reference && (
        <g>
          <line x1={m.l} x2={W - m.r} y1={Y(reference.y)} y2={Y(reference.y)} stroke="var(--horizon)" strokeDasharray="6 5" strokeWidth={1.5} />
          <text x={W - m.r} y={Y(reference.y) - 7} textAnchor="end" style={{ fill: 'var(--horizon)', fontWeight: 600 }}>{reference.label}</text>
        </g>
      )}
      {series.map((s) => (
        <path key={s.key} d={pathOf(s.points.map((p) => [X(p.x), Y(p.y)]))} fill="none" stroke={s.color}
          strokeWidth={s.dashed ? 1.8 : 2.6} strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinecap="round" />
      ))}
    </svg>
    </div>
  )
}

/** Thin stacked bar: actual mix by sleeve. */
export function MixBar({ parts }: { parts: Array<{ key: string; value: number; color: string; opacity: number; label: string }> }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  return (
    <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', background: 'var(--sunken)' }} role="img"
      aria-label={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join('، ')}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.key} title={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color, opacity: p.opacity }} />
      ))}
    </div>
  )
}

/** Monthly bars: received months (muted) then expected months (accent). */
export function MonthBars({ data, title }: { data: Array<{ key: string; label: string; short: string; value: number; kind: 'received' | 'expected' }>; title: string }) {
  const [box, W] = useWidth()
  const H = 200
  const m = { l: 48, r: 8, t: 22, b: 26 }
  const maxY = Math.max(1, ...data.map((d) => d.value)) * 1.15
  const step = niceStep(maxY, 3)
  const ticks: number[] = []
  for (let v = 0; v <= maxY; v += step) ticks.push(v)
  const slot = (W - m.l - m.r) / Math.max(1, data.length)
  const bw = Math.max(6, Math.min(34, slot * 0.62))
  const Y = (v: number) => H - m.b - (v / maxY) * (H - m.t - m.b)
  const every = slot >= 40 ? 1 : slot >= 22 ? 2 : 3
  const short = (v: number) => (v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(1)}م` : v >= 1000 ? `${+(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`)
  return (
    <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} direction="ltr">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{v === 0 ? '0' : millions(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + slot * i + slot / 2
          const y = Y(d.value)
          return (
            <g key={d.key}>
              <rect x={cx - bw / 2} y={y} width={bw} height={Math.max(0, H - m.b - y)} rx={Math.min(5, bw / 3)}
                fill={d.kind === 'received' ? 'var(--income)' : 'var(--accent)'} opacity={d.kind === 'received' ? 0.45 : 1}>
                <title>{`${d.label}: ${num0(d.value)} ريال`}</title>
              </rect>
              {slot >= 34 && d.value > 0 && <text x={cx} y={y - 6} textAnchor="middle" className="label-strong" style={{ fontSize: 10.5 }}>{d.value >= 100000 ? short(d.value) : num0(d.value)}</text>}
              {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle" direction="rtl">{slot * every >= 46 ? d.label : d.short}</text>}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/** Cumulative return lines (%), dated x axis, zero line; handles gains and losses. */
export function ReturnChart({ series, title, height = 250 }: {
  series: Array<{ key: string; label: string; color: string; dashed?: boolean; points: Array<{ date: string; pct: number }> }>; title: string; height?: number
}) {
  const [box, W] = useWidth()
  const H = Math.round(Math.max(200, Math.min(height, W * 0.56)))
  const m = { l: 46, r: 12, t: 16, b: 28 }
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return <div ref={box} />
  const t = (d: string) => new Date(d + 'T12:00:00').getTime()
  const minX = Math.min(...all.map((p) => t(p.date))), maxX = Math.max(...all.map((p) => t(p.date)))
  const lo = Math.min(0, ...all.map((p) => p.pct)), hi = Math.max(0, ...all.map((p) => p.pct))
  const pad = Math.max(0.5, (hi - lo) * 0.12)
  const minY = lo - (lo < 0 ? pad : 0), maxY = hi + pad
  const step = niceStep(maxY - minY)
  const X = (x: number) => m.l + ((x - minX) / (maxX - minX || 1)) * (W - m.l - m.r)
  const Y = (v: number) => H - m.b - ((v - minY) / (maxY - minY || 1)) * (H - m.t - m.b)
  const ticks: number[] = []
  for (let v = Math.ceil(minY / step) * step; v <= maxY; v += step) ticks.push(Number(v.toFixed(6)))
  const months = ['ينا', 'فبر', 'مار', 'أبر', 'ماي', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس']
  const nX = Math.max(2, Math.min(6, Math.floor((W - m.l - m.r) / 70)))
  const xs = Array.from({ length: nX }, (_, i) => minX + ((maxX - minX) * i) / (nX - 1))
  const lab = (ms: number) => { const d = new Date(ms); return (maxX - minX) > 400 * 86400000 ? `${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` : `${d.getDate()} ${months[d.getMonth()]}` }
  return (
    <div ref={box}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} direction="ltr">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--ink-3)' : 'var(--line)'} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{`${v > 0 ? '+' : ''}${Number(v.toFixed(1))}%`}</text>
          </g>
        ))}
        {xs.map((x, i) => <text key={i} x={X(x)} y={H - 8} textAnchor={i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle'}>{lab(x)}</text>)}
        {series.map((s) => (
          <path key={s.key} d={pathOf(s.points.map((p) => [X(t(p.date)), Y(p.pct)]))} fill="none" stroke={s.color}
            strokeWidth={s.dashed ? 1.8 : 2.6} strokeDasharray={s.dashed ? '5 4' : undefined} strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </svg>
      <div className="legend">
        {series.map((s) => <span key={s.key}><i style={{ background: s.color, opacity: s.dashed ? 0.7 : 1 }} />{s.label}</span>)}
      </div>
    </div>
  )
}
