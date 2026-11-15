// Generates the Android launcher icons and splash screens from public/icons/icon.svg.
// Run after changing the icon: `node scripts/android-icons.mjs`. Output is committed under android/.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const res = new URL('../android/app/src/main/res/', import.meta.url)
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8')
const BG = '#18181b'
// The glyph alone (no rounded background), for adaptive icons and the splash.
const glyph = Buffer.from(svg.replace(/<rect[^>]*\/>/, ''))
const full = Buffer.from(svg)

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
for (const [name, k] of Object.entries(DENSITY)) {
  const legacy = Math.round(48 * k), fg = Math.round(108 * k), inner = Math.round(fg * 0.62)
  await sharp(full).resize(legacy, legacy).png().toFile(new URL(`mipmap-${name}/ic_launcher.png`, res).pathname)
  const circle = Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`)
  await sharp(full).resize(legacy, legacy).composite([{ input: circle, blend: 'dest-in' }]).png().toFile(new URL(`mipmap-${name}/ic_launcher_round.png`, res).pathname)
  const g = await sharp(glyph).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: g, gravity: 'centre' }]).png().toFile(new URL(`mipmap-${name}/ic_launcher_foreground.png`, res).pathname)
}
writeFileSync(new URL('values/ic_launcher_background.xml', res), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`)

let splashes = 0
for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const file = new URL(`${dir}/splash.png`, res)
  let meta
  try { meta = await sharp(file.pathname).metadata() } catch { continue }
  const size = Math.round(Math.min(meta.width, meta.height) * 0.3)
  const g = await sharp(glyph).resize(size, size).png().toBuffer()
  const out = await sharp({ create: { width: meta.width, height: meta.height, channels: 4, background: BG } }).composite([{ input: g, gravity: 'centre' }]).png().toBuffer()
  writeFileSync(file, out)
  splashes++
}
console.log('icons for', Object.keys(DENSITY).length, 'densities;', splashes, 'splash screens')
