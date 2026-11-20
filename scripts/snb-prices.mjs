// usage: node scripts/snb-prices.mjs <output.xlsx>
// Opens SNB Capital's public daily fund prices page and saves the price sheet the page itself loads.
// The sheet's address changes, so it is taken from the page rather than requested directly.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { chromium } = createRequire(import.meta.url)('playwright')
const out = process.argv[2]
if (!out) { console.error('usage: node scripts/snb-prices.mjs <output.xlsx>'); process.exit(2) }
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
const page = await (await browser.newContext({ locale: 'en-US' })).newPage()
let saved = ''
page.on('response', async (r) => {
  if (!/publicfundsprice/i.test(r.url())) return
  try { writeFileSync(out, await r.body()); saved = r.url() } catch { /* the page may load it twice; keep the one that worked */ }
})
try {
  const res = await page.goto('https://snbcapital.com/daily-funds', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(9000)
  console.log(saved ? `saved ${saved}` : `no price sheet seen (page status ${res?.status()})`)
} catch (e) {
  console.log('failed: ' + e.message.split('\n')[0])
}
await browser.close()
process.exit(saved ? 0 : 1)
