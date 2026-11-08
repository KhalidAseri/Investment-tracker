// Visuals of «الخطة»: the band track (a sleeve's weight against its allowed band and target).
// The milestone chart was removed with the milestones (ADVISOR-FEATURE.md: no value targets over time).
import { Pct } from './kit'

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
