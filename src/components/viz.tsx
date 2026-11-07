// Charts for the redesigned interface: a scrub-able area chart and a donut.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { haptic } from '../lib/ui'

function useBoxWidth(fallback = 360) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const t = (d: string) => new Date(d.length <= 10 ? d + 'T12:00:00' : d).getTime()

/**
 * Area chart over dated values. Drag or hover to scrub: onScrub(index) while moving, onScrub(null) on release.
 * tone="hero" draws light lines for the emerald card; "plain" uses the page colours.
 */
export function AreaChart({ points, tone = 'plain', height = 150, onScrub, title = 'رسم بياني' }: {
  points: Array<{ date: string; value: number }>; tone?: 'hero' | 'plain'; height?: number; onScrub?: (i: number | null) => void; title?: string
}) {
  const [box, W] = useBoxWidth()
  const [active, setActive] = useState<number | null>(null)
  const last = useRef<number | null>(null)
  const id = useMemo(() => `ag${Math.random().toString(36).slice(2, 8)}`, [])
  const H = height
  const pad = { t: 12, b: 8, x: 10 }
  const n = points.length
  const geo = useMemo(() => {
    if (n < 2) return null
    const xs = points.map((p) => t(p.date))
    const x0 = Math.min(...xs), x1 = Math.max(...xs)
    const vals = points.map((p) => p.value)
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (hi - lo < Math.abs(hi) * 0.002) { lo -= Math.abs(hi) * 0.01 + 1; hi += Math.abs(hi) * 0.01 + 1 }
    const span = hi - lo
    lo -= span * 0.12; hi += span * 0.08
    const X = (ms: number) => pad.x + ((ms - x0) / (x1 - x0 || 1)) * (W - pad.x * 2)
    const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
    const pts = points.map((p) => [X(t(p.date)), Y(p.value)] as const)
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')
    const area = `${line}L${pts[n - 1][0].toFixed(1)} ${H}L${pts[0][0].toFixed(1)} ${H}Z`
    return { pts, line, area, base: Y(points[0].value) }
  }, [points, W, H, n])

  if (!geo) return <div ref={box} style={{ height: H }} />
  const up = points[n - 1].value >= points[0].value
  const stroke = tone === 'hero' ? (up ? '#b9f5dc' : '#ffc9c2') : up ? 'var(--good)' : 'var(--bad)'
  const fill = tone === 'hero' ? (up ? 'rgba(185,245,220,' : 'rgba(255,201,194,') : null

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * W
    let best = 0, bd = Infinity
    geo.pts.forEach(([px], i) => { const dd = Math.abs(px - x); if (dd < bd) { bd = dd; best = i } })
    if (best !== last.current) { last.current = best; haptic(3) }
    setActive(best)
    onScrub?.(best)
  }
  const end = () => { last.current = null; setActive(null); onScrub?.(null) }
  const a = active != null ? geo.pts[active] : null
  const lastPt = geo.pts[n - 1]

  return (
    <div ref={box}>
      <svg className="area-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title} direction="ltr"
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pick(e.clientX, e.currentTarget) }}
        onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX, e.currentTarget) }}
        onPointerUp={end} onPointerCancel={end} onPointerLeave={(e) => { if (e.pointerType === 'mouse') end() }}>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            {fill ? <><stop offset="0%" stopColor={`${fill}0.32)`} /><stop offset="100%" stopColor={`${fill}0)`} /></>
              : <><stop offset="0%" stopColor={stroke} stopOpacity={0.22} /><stop offset="100%" stopColor={stroke} stopOpacity={0} /></>}
          </linearGradient>
        </defs>
        <line x1={0} x2={W} y1={geo.base} y2={geo.base} stroke={tone === 'hero' ? 'rgba(255,255,255,.28)' : 'var(--line-strong)'} strokeDasharray="2 5" />
        <path d={geo.area} fill={`url(#${id})`} />
        <path d={geo.line} fill="none" stroke={stroke} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw" />
        {a ? (
          <g>
            <line x1={a[0]} x2={a[0]} y1={0} y2={H} stroke={tone === 'hero' ? 'rgba(255,255,255,.55)' : 'var(--ink-2)'} strokeWidth={1.2} />
            <circle cx={a[0]} cy={a[1]} r={6} fill={stroke} stroke={tone === 'hero' ? 'var(--hero-2)' : 'var(--surface)'} strokeWidth={2.5} />
          </g>
        ) : (
          <g>
            <circle cx={lastPt[0]} cy={lastPt[1]} r={4} fill={stroke} opacity={0.35}>
              <animate attributeName="r" values="4;11;4" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={lastPt[0]} cy={lastPt[1]} r={4} fill={stroke} />
          </g>
        )}
      </svg>
    </div>
  )
}

/** Donut with centre content. Parts with zero value are skipped. */
export function Donut({ parts, size = 132, thickness = 16, children, title = 'التوزيع' }: {
  parts: Array<{ key: string; value: number; color: string; label?: string }>; size?: number; thickness?: number; children?: ReactNode; title?: string
}) {
  const r = (size - thickness) / 2
  const C = 2 * Math.PI * r
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0)
  const shown = parts.filter((p) => p.value > 0)
  const gap = shown.length > 1 ? Math.min(4, C * 0.012) : 0
  let acc = 0
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${shown.map((p) => `${p.label ?? p.key} ${Math.round((p.value / (total || 1)) * 100)}%`).join('، ')}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={thickness} />
        {total > 0 && shown.map((p) => {
          const len = (p.value / total) * C
          const seg = <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`} strokeDashoffset={-acc} transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray .5s ease, stroke-dashoffset .5s ease' }} strokeLinecap="butt" />
          acc += len
          return seg
        })}
      </svg>
      {children && <div className="donut-center">{children}</div>}
    </div>
  )
}
