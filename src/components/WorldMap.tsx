// Choropleth of where the money is invested, by country (lazy-loaded: d3-geo, topojson and the 110m world atlas stay in their
// own chunk). Shade = share of the portfolio, emerald scale; tap a country to see its share. Gold and «غير محدد» have no
// country and are listed by the page under the map.
import { useMemo, useState } from 'react'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { ISO_ALPHA2_BY_NUMERIC, countryLabel } from '../lib/countries'
import { haptic } from '../lib/ui'
import { Money, Pct } from './kit'
import './Insights.css'

const W = 960
const H = 470
/** places too small for the 110m atlas, drawn as dots [lon, lat] */
const SMALL: Record<string, [number, number]> = {
  BH: [50.55, 26.07], SG: [103.82, 1.35], HK: [114.17, 22.32], MT: [14.4, 35.9], MU: [57.55, -20.3], MV: [73.5, 3.2],
  KM: [43.3, -11.7], LU: [6.13, 49.6], QA: [51.2, 25.3], CY: [33.2, 35.1], BN: [114.7, 4.5], DJ: [43.1, 11.8],
}

type Shape = Feature<Geometry, { name?: string }> & { id?: string | number }
let SHAPES: Shape[] | null = null
function shapes(): Shape[] {
  if (!SHAPES) {
    const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name?: string }> }>
    const fc = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry, { name?: string }>
    SHAPES = (fc.features as Shape[]).filter((f) => String(f.id) !== '010') // Antarctica
  }
  return SHAPES
}

/** colour of a share (0..1 of the largest country): sqrt scale so small positions stay visible */
const shade = (t: number) => `color-mix(in srgb, var(--accent) ${Math.round(32 + 68 * Math.sqrt(Math.max(0, Math.min(1, t))))}%, var(--surface-2))`

export default function WorldMap({ byCountry, total }: { byCountry: Record<string, number>; total: number }) {
  const [sel, setSel] = useState<string | null>(null)
  const geo = useMemo(() => {
    const list = shapes()
    const proj = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'FeatureCollection', features: list } as FeatureCollection)
    const path = geoPath(proj)
    const drawn = new Set<string>()
    const paths = list.map((f, i) => {
      const id = f.id == null ? '' : String(f.id).padStart(3, '0')
      const iso = id ? ISO_ALPHA2_BY_NUMERIC[id] ?? null : null
      if (iso) drawn.add(iso)
      return { key: `${id}-${i}`, iso, d: path(f) ?? '' }
    })
    return { proj, paths, drawn }
  }, [])

  const real = Object.entries(byCountry).filter(([c, v]) => c !== 'XX' && c !== 'XC' && v > 0)
  const max = Math.max(0, ...real.map(([, v]) => v))
  const dots = real.filter(([c]) => !geo.drawn.has(c) && SMALL[c])
    .map(([c, v]) => { const p = geo.proj(SMALL[c]); return p ? { c, v, x: p[0], y: p[1] } : null })
    .filter((x): x is { c: string; v: number; x: number; y: number } => !!x)
  const pick = (c: string | null) => { if (c && !(byCountry[c] > 0)) return; haptic(); setSel((s) => (s === c ? null : c)) }
  const selV = sel ? byCountry[sel] ?? 0 : 0
  const top = real.sort((a, b) => b[1] - a[1])[0]

  return (
    <div className="wm">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`خريطة توزيع أموالك حسب الدولة${top ? `، أكبرها ${countryLabel(top[0])}` : ''}`}>
        {geo.paths.map((p) => {
          const v = p.iso ? byCountry[p.iso] ?? 0 : 0
          return (
            <path key={p.key} d={p.d} className={`${v > 0 ? 'has' : ''} ${sel && sel === p.iso ? 'sel' : ''}`}
              style={{ fill: v > 0 && max > 0 ? shade(v / max) : 'color-mix(in srgb, var(--line-strong) 45%, var(--sunken))' }}
              onClick={v > 0 ? () => pick(p.iso) : undefined}>
              {v > 0 && p.iso && <title>{countryLabel(p.iso)}</title>}
            </path>
          )
        })}
        {dots.map((d) => (
          <circle key={d.c} cx={d.x} cy={d.y} r={sel === d.c ? 9 : 7} style={{ fill: shade(d.v / max) }} onClick={() => pick(d.c)}>
            <title>{countryLabel(d.c)}</title>
          </circle>
        ))}
      </svg>
      <div className="wm-scale" aria-hidden>
        <span>أقل</span>
        <i style={{ background: `linear-gradient(to left, ${shade(0.02)}, ${shade(0.3)}, ${shade(1)})` }} />
        <span>أكثر</span>
      </div>
      <div className="wm-pick" aria-live="polite">
        {sel ? <><b>{countryLabel(sel)}</b><span><Pct v={total > 0 ? (selV / total) * 100 : 0} /> · <Money v={selV} short /></span></>
          : <span>اضغط دولة ملوّنة لترى حصتها</span>}
      </div>
    </div>
  )
}
