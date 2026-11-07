// Visuals of «الخطة»: the milestone chart (the owner's planned path vs the actual daily values) and the band track.
// No projections: the dashed line only joins the baseline and the milestones the owner wrote.
import { useEffect, useMemo, useRef, useState } from 'react'
import { dateLong, num0, num2 } from '../lib/format'
import { haptic, SHORT_MONTHS } from '../lib/ui'
import { Money, Pct } from './kit'

type Pt = { date: string; value: number }
const DAY = 86400000
const ms = (iso: string) => Date.parse(iso.slice(0, 10) + 'T12:00:00Z')
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10)

function useWidth(fallback = 340) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(220, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/** straight lines between the points, flat outside them */
function interp(path: Pt[], t: number): number | null {
  if (!path.length) return null
  if (t <= ms(path[0].date)) return path[0].value
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i]
    const ta = ms(a.date), tb = ms(b.date)
    if (t <= tb) return a.value + (b.value - a.value) * (tb > ta ? (t - ta) / (tb - ta) : 1)
  }
  return path[path.length - 1].value
}

function niceStep(range: number, count = 4) {
  const raw = Math.max(1, range) / count
  const p = 10 ** Math.floor(Math.log10(raw))
  const m = raw / p
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p
}
const axisLabel = (v: number) => (Math.abs(v) >= 1_000_000 ? `${num2(v / 1_000_000)} مليون` : Math.abs(v) >= 1000 ? `${num0(v / 1000)} ألف` : num0(v))

/**
 * Planned milestone path (dashed) and actual values (solid) on one time axis, LTR (time runs left to right like every chart
 * in the app). Drag or hover to read a date; the readout above the chart doubles as the legend.
 */
export function PlanChart({ path, actual, today, from, to, height = 190 }: {
  /** baseline + milestones, in date order */
  path: Array<Pt & { label?: string | null }>
  /** actual values in date order (daily snapshots, plus today's live value) */
  actual: Pt[]
  today: string
  from: string
  to: string
  height?: number
}) {
  const [box, W] = useWidth()
  const [hover, setHover] = useState<number | null>(null)
  const last = useRef<string | null>(null)
  const H = height
  const pad = { t: 16, b: 6, l: 6, r: 50 }
  const t0 = ms(from), t1 = Math.max(ms(to), t0 + DAY)

  const geo = useMemo(() => {
    const X = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r)
    const act = actual.filter((p) => ms(p.date) >= t0 && ms(p.date) <= t1)
    // planned path clipped to the window
    const inside = path.filter((p) => ms(p.date) > t0 && ms(p.date) < t1)
    const plan: Pt[] = path.length ? [
      { date: isoOf(t0), value: interp(path, t0)! }, ...inside, { date: isoOf(t1), value: interp(path, t1)! },
    ].filter((p, i, a) => i === 0 || p.date !== a[i - 1].date) : []
    // a path that starts after the window start begins at its first point, not before
    const planShown = path.length && ms(path[0].date) > t0 ? plan.filter((p) => ms(p.date) >= ms(path[0].date)) : plan
    const vals = [...act.map((p) => p.value), ...planShown.map((p) => p.value)]
    if (!vals.length) return null
    let lo = Math.min(...vals), hi = Math.max(...vals)
    if (hi - lo < Math.max(1, hi) * 0.02) { lo -= Math.max(1, hi) * 0.05; hi += Math.max(1, hi) * 0.05 }
    const step = niceStep(hi - lo, 3)
    lo = Math.max(0, Math.floor(lo / step) * step); hi = Math.ceil(hi / step) * step
    const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (H - pad.t - pad.b)
    const line = (pts: Pt[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(ms(p.date)).toFixed(1)} ${Y(p.value).toFixed(1)}`).join('')
    const ticks: number[] = []
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v)
    // time labels: months for short windows, years for long ones; spacing follows the width
    const spanMonths = (t1 - t0) / (30.4 * DAY)
    const perMonth = (W - pad.l - pad.r) / Math.max(0.1, spanMonths)
    const xt: Array<{ x: number; label: string }> = []
    const d0 = new Date(t0)
    if (spanMonths <= 24) {
      const every = [1, 2, 3, 6, 12].find((e) => perMonth * e >= 46) ?? 12
      for (let k = 1; k < 400; k++) {
        const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + k, 1, 12))
        if (d.getTime() >= t1) break
        if ((d.getUTCMonth() % every) !== 0) continue
        xt.push({ x: X(d.getTime()), label: d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : SHORT_MONTHS[d.getUTCMonth()] })
      }
    } else {
      const every = [1, 2, 5, 10].find((e) => perMonth * 12 * e >= 40) ?? 10
      for (let y = d0.getUTCFullYear() + 1; y < 2200; y++) {
        const t = Date.UTC(y, 0, 1, 12)
        if (t >= t1) break
        if (y % every) continue
        xt.push({ x: X(t), label: String(y) })
      }
    }
    // keep labels apart
    const xticks = xt.filter((tk, i, a) => i === 0 || tk.x - a[i - 1].x > 34).filter((tk) => tk.x > 14 && tk.x < W - pad.r - 8)
    const area = act.length > 1 ? `${line(act)}L${X(ms(act[act.length - 1].date)).toFixed(1)} ${H - pad.b}L${X(ms(act[0].date)).toFixed(1)} ${H - pad.b}Z` : null
    return { X, Y, act, plan: planShown, ticks, xticks, area, actLine: act.length > 1 ? line(act) : null, planLine: planShown.length > 1 ? line(planShown) : null }
  }, [actual, path, t0, t1, W, H])

  if (!geo) return <div ref={box} style={{ height: H }} />
  const { X, Y } = geo
  const tToday = Math.min(Math.max(ms(today), t0), t1)
  const markers = path.filter((p) => ms(p.date) >= t0 && ms(p.date) <= t1)
  const nextM = path.find((p) => p.date > today) ?? null

  // readout: the hovered date, else today
  const at = hover ?? tToday
  const atISO = isoOf(at)
  const planned = path.length && at >= ms(path[0].date) ? interp(path, at) : null
  const firstAct = geo.act[0]
  const lastAct = geo.act[geo.act.length - 1]
  let real: number | null = null
  if (firstAct && at >= ms(firstAct.date) && at <= ms(lastAct.date) + DAY) {
    for (const p of geo.act) { if (ms(p.date) <= at) real = p.value; else break }
  }
  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect()
    const x = ((clientX - r.left) / r.width) * W
    const t = t0 + ((x - pad.l) / (W - pad.l - pad.r)) * (t1 - t0)
    const snapped = Math.min(t1, Math.max(t0, Math.round((t - t0) / DAY) * DAY + t0))
    const key = isoOf(snapped)
    if (key !== last.current) { last.current = key; haptic(2) }
    setHover(snapped)
  }
  const end = () => { last.current = null; setHover(null) }
  const ax = geo.act.length ? X(Math.min(Math.max(at, ms(geo.act[0].date)), ms(lastAct.date))) : null

  return (
    <div className="pc">
      <div className="pc-read" aria-live="polite">
        <span className="pc-date">{hover == null ? 'اليوم' : dateLong(atISO)}</span>
        <span className="pc-key"><i className="pc-dash" />المخطط {planned != null ? <Money v={planned} short /> : <b>—</b>}</span>
        <span className="pc-key"><i className="pc-solid" />الفعلي {real != null ? <Money v={real} short /> : <b>—</b>}</span>
      </div>
      <div className="pc-box" ref={box}>
        <svg className="pc-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} direction="ltr" role="img" aria-label="المسار المخطط مقارنة بالقيمة الفعلية"
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pick(e.clientX, e.currentTarget) }}
          onPointerMove={(e) => { if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX, e.currentTarget) }}
          onPointerUp={(e) => { if (e.pointerType !== 'mouse') end() }} onPointerCancel={end} onPointerLeave={(e) => { if (e.pointerType === 'mouse') end() }}>
          <defs>
            <linearGradient id="pc-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.2} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {geo.ticks.map((v) => <line key={v} x1={0} x2={W - pad.r + 4} y1={Y(v)} y2={Y(v)} stroke="var(--line)" strokeWidth={1} />)}
          <line x1={X(tToday)} x2={X(tToday)} y1={4} y2={H - pad.b} stroke="var(--line-strong)" strokeDasharray="2 4" />
          {geo.area && <path d={geo.area} fill="url(#pc-fill)" />}
          {geo.planLine && <path d={geo.planLine} fill="none" stroke="var(--ink-2)" strokeWidth={1.8} strokeDasharray="5 5" strokeLinecap="round" opacity={0.75} />}
          {geo.actLine && <path d={geo.actLine} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />}
          {markers.map((m) => {
            const isNext = nextM && m.date === nextM.date
            return <circle key={m.date} cx={X(ms(m.date))} cy={Y(m.value)} r={isNext ? 5.5 : 3.6} fill="var(--surface)" stroke={isNext ? 'var(--accent)' : 'var(--ink-2)'} strokeWidth={isNext ? 2.4 : 1.6} />
          })}
          {hover != null && <line x1={X(at)} x2={X(at)} y1={4} y2={H - pad.b} stroke="var(--ink-2)" strokeWidth={1.1} opacity={0.6} />}
          {planned != null && <circle cx={X(at)} cy={Y(planned)} r={4} fill="var(--surface)" stroke="var(--ink-2)" strokeWidth={1.8} />}
          {real != null && ax != null && <circle cx={ax} cy={Y(real)} r={4.6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        </svg>
        <div className="pc-y" aria-hidden>
          {geo.ticks.map((v) => <span key={v} className="figure" style={{ top: Y(v), width: pad.r - 6 }}>{axisLabel(v)}</span>)}
        </div>
        <span className="pc-today" style={{ left: X(tToday) }} aria-hidden>اليوم</span>
      </div>
      <div className="pc-x" aria-hidden>
        {geo.xticks.map((tk) => <span key={tk.x} style={{ left: tk.x }}>{tk.label}</span>)}
      </div>
    </div>
  )
}

/**
 * One sleeve's weight on a 0..scale track: the allowed band shaded, the target as a tick and the actual as a dot
 * (red when outside the band). Positions start from the inline start, like the other bars of the app.
 */
export function BandTrack({ actual, target, min, max, scale, color, out }: {
  actual: number; target: number; min: number; max: number; scale: number; color: string; out: boolean
}) {
  const p = (v: number) => `${Math.min(100, Math.max(0, (v / (scale || 1)) * 100))}%`
  return (
    <div className="bt" role="img" aria-label={`الحالي ${actual.toFixed(1)}%، المستهدف ${target}%، النطاق ${min}–${max}%`}>
      <i className="bt-fill" style={{ width: p(actual), background: out ? 'var(--bad)' : color }} />
      <i className="bt-band" style={{ insetInlineStart: p(min), width: `calc(${p(max)} - ${p(min)})` }} />
      <i className="bt-target" style={{ insetInlineStart: p(target) }} />
      <i className={`bt-dot ${out ? 'out' : ''}`} style={{ insetInlineStart: p(actual), background: out ? 'var(--bad)' : color }} />
    </div>
  )
}

/** Small «actual of target» numbers for a band row, bidi-safe. */
export function BandNums({ actual, target }: { actual: number; target: number }) {
  return <span className="bt-nums"><b><Pct v={actual} /></b> <span>من <Pct v={target} /></span></span>
}
