// usage: node scripts/ishares-holdings.mjs <outDir> <TICKER> [<TICKER>...]
// Saves the full holdings list (CSV: name, sector, location, weight) of each iShares US fund, from
// the fund's own page on ishares.com. Used to look through a fund that holds iShares ETFs.
import { createRequire } from 'node:module'
import { writeFileSync } from 'node:fs'
const { chromium } = createRequire(import.meta.url)('playwright')
const [outDir, ...tickers] = process.argv.slice(2)
if (!outDir || tickers.length === 0) { console.error('usage: node scripts/ishares-holdings.mjs <outDir> <TICKER>...'); process.exit(2) }
const LIST = 'https://www.ishares.com/us/product-screener/product-screener-v3.1.jsn?dcrPath=/templatedata/config/product-screener-v3/data/en/us-ishares/ishares-product-screener-backend-config&siteEntryPassthrough=true'
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined })
const ctx = await browser.newContext({ locale: 'en-US' })
let failed = 0
try {
  const funds = Object.values(await (await ctx.request.get(LIST, { timeout: 60000 })).json()).filter((f) => f && typeof f === 'object' && f.localExchangeTicker)
  for (const t of tickers) {
    const f = funds.find((x) => x.localExchangeTicker === t)
    if (!f) { console.log(`${t}: not an iShares US fund`); failed++; continue }
    const r = await ctx.request.get(`https://www.ishares.com${f.productPageUrl}/latest-holdings.csv`, { timeout: 60000 })
    const body = await r.text()
    if (!r.ok() || /^\s*<!DOCTYPE|^\s*<html/i.test(body) || !/Location/.test(body)) { console.log(`${t}: no holdings file (status ${r.status()})`); failed++; continue }
    writeFileSync(`${outDir}/${t}.csv`, body)
    console.log(`${t}: ${f.fundName} — ${body.split('\n').length} lines, as of ${(body.match(/as of,?\s*"?([A-Za-z]{3} \d{1,2}, \d{4})/) ?? [])[1] ?? 'date not found'}`)
  }
} catch (e) { console.log('failed: ' + e.message.split('\n')[0]); failed++ }
await browser.close()
process.exit(failed ? 1 : 0)
