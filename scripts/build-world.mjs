// Generates src/lib/world-paths.json: one SVG path per country (ISO alpha-2) with Arabic and English
// names, from Natural Earth 1:110m data. Run once: `node scripts/build-world.mjs`. Output is committed.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { geoEqualEarth, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'

const require = createRequire(import.meta.url)
const iso = require('i18n-iso-countries')
iso.registerLocale(require('i18n-iso-countries/langs/en.json'))
iso.registerLocale(require('i18n-iso-countries/langs/ar.json'))

const W = 720, H = 350
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'))
const countries = feature(topo, topo.objects.countries).features.filter((f) => f.id !== '010')   // no Antarctica
const projection = geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], { type: 'FeatureCollection', features: countries })
const path = geoPath(projection)
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(Number(n) * 10) / 10))

const out = []
for (const f of countries) {
  const code = iso.numericToAlpha2(String(f.id).padStart(3, '0'))
  const d = path(f)
  if (!code || !d) continue
  out.push({ id: code, d: round(d), ar: iso.getName(code, 'ar') ?? f.properties.name, en: iso.getName(code, 'en') ?? f.properties.name })
}
writeFileSync(new URL('../src/lib/world-paths.json', import.meta.url), JSON.stringify({ width: W, height: H, countries: out }))
console.log(out.length, 'countries;', ['SA', 'US', 'GB', 'JP', 'CN', 'IN', 'DE', 'AE'].map((c) => c + ':' + (out.find((o) => o.id === c)?.ar ?? 'MISSING')).join(' '))
