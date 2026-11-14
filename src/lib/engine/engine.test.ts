import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Asset, AssetClass, Quotes, Settings } from '../types.ts'
import { defaultSettings, defaultZakatMode } from '../labels.ts'
import { applyTransaction, computeView, dividendStats, revertTransaction, valueAsset } from './valuation.ts'
import { breakdown, insights } from './exposure.ts'
import { allocateContribution, allocateWithdrawal, driftRows } from './guidance.ts'
import { emergencyStatus, futureValue, goalStatus, goalTarget, monthsToTarget, requiredMonthly } from './plan.ts'
import { annualTransfer, balanceEquation, effectiveZakatRate, guardrail, layers, requiredPortfolio, smoothedValue } from './income.ts'
import { nextHawlDate, zakatStatus } from './zakat.ts'
import { reviewStatus } from './review.ts'
import { decodeShare, encodeShare } from './share.ts'

const L = (ar: string, _en: string) => ar
const NOW = new Date('2026-06-15T12:00:00Z')

function asset(over: Partial<Asset>): Asset {
  return {
    id: over.id ?? 'a' + Math.random(), accountId: 'acc1', name: 'x', symbol: null, assetClass: 'EQUITY', region: 'SA', sector: 'BANKS',
    currency: 'SAR', pricing: 'manual', priceFactor: 1, quantity: 0, costBasis: 0, manualValue: 0, valueUpdatedAt: NOW.toISOString(),
    isFund: false, isEmergencyFund: false, zakatMode: 'FULL', zakatPercent: 100, domicile: '', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(),
    ...over,
  }
}
const quote = (symbol: string, price: number, change = 0, currency = 'SAR') => ({ symbol, price, change, changePercent: 0, currency, name: symbol, updatedAt: NOW.toISOString() })
const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...over })
const view = (assets: Asset[], quotes: Quotes = {}, s = settings()) =>
  computeView({ assets, accounts: [{ id: 'acc1', name: 'Broker', kind: 'BROKERAGE', createdAt: '', updatedAt: '' }], settings: s }, quotes, NOW.getTime())

test('live asset: price x quantity x fx, day change and gain', () => {
  const a = asset({ symbol: 'VOO', pricing: 'live', currency: 'USD', quantity: 10, costBasis: 4000 })
  const v = valueAsset(a, { VOO: quote('VOO', 500, 2, 'USD') }, { USD: 3.75 }, NOW.getTime())
  assert.equal(v.value, 10 * 500 * 3.75)
  assert.equal(v.cost, 4000 * 3.75)
  assert.equal(v.dayChange, 10 * 2 * 3.75)
  assert.equal(v.source, 'live')
  assert.ok(Math.abs(v.gainPct - 25) < 1e-9)
})

test('live asset without a quote falls back to cost, not zero', () => {
  const v = valueAsset(asset({ symbol: 'XYZ', pricing: 'live', quantity: 5, costBasis: 1000 }), {}, {})
  assert.equal(v.value, 1000)
  assert.equal(v.source, 'cost')
})

test('a hand-entered price is used only while no quote is available', () => {
  const a = asset({ symbol: 'XYZ', pricing: 'live', quantity: 5, costBasis: 1000, lastPrice: 250 })
  const manual = valueAsset(a, {}, {})
  assert.deepEqual([manual.value, manual.source, manual.price], [1250, 'manual', 250])
  assert.equal(valueAsset(a, { XYZ: quote('XYZ', 300) }, {}, NOW.getTime()).value, 1500)
})

test('gold priced per gram through priceFactor', () => {
  const factor = (21 / 24) / 31.1035
  const a = asset({ symbol: 'GC=F', pricing: 'live', currency: 'USD', assetClass: 'GOLD', quantity: 100, priceFactor: factor })
  const v = valueAsset(a, { 'GC=F': quote('GC=F', 3110.35, 0, 'USD') }, { USD: 3.75 }, NOW.getTime())
  assert.ok(Math.abs(v.value - 100 * 100 * 0.875 * 3.75) < 1e-6)
})

test('buy then sell keeps average cost; delete reverses exactly', () => {
  let a = asset({ pricing: 'live', symbol: '2222.SR' })
  const buy1 = applyTransaction(a, { type: 'BUY', date: '2026-01-01', quantity: 100, price: 30 })
  a = buy1.asset
  const buy2 = applyTransaction(a, { type: 'BUY', date: '2026-02-01', quantity: 100, price: 20 })
  a = buy2.asset
  assert.equal(a.quantity, 200)
  assert.equal(a.costBasis, 5000)
  const sell = applyTransaction(a, { type: 'SELL', date: '2026-03-01', quantity: 50, price: 40 })
  assert.equal(sell.asset.quantity, 150)
  assert.equal(sell.asset.costBasis, 3750)
  assert.equal(sell.tx.amount, 2000)
  const back = revertTransaction(sell.asset, sell.tx)
  assert.equal(back.quantity, 200)
  assert.equal(back.costBasis, 5000)
})

test('manual asset: deposit, value update, withdraw', () => {
  let a = asset({})
  a = applyTransaction(a, { type: 'DEPOSIT', date: '2026-01-01', amount: 10000 }).asset
  assert.deepEqual([a.costBasis, a.manualValue], [10000, 10000])
  a = applyTransaction(a, { type: 'VALUE_UPDATE', date: '2026-02-01', amount: 12000 }).asset
  assert.deepEqual([a.costBasis, a.manualValue], [10000, 12000])
  a = applyTransaction(a, { type: 'WITHDRAW', date: '2026-03-01', amount: 6000 }).asset
  assert.deepEqual([a.costBasis, a.manualValue], [5000, 6000])
})

test('selling more than held is capped', () => {
  const a = asset({ pricing: 'live', quantity: 10, costBasis: 100 })
  const r = applyTransaction(a, { type: 'SELL', date: '2026-01-01', quantity: 50, price: 20 })
  assert.equal(r.asset.quantity, 0)
  assert.equal(r.asset.costBasis, 0)
  assert.equal(r.tx.amount, 200)
})

test('portfolio totals separate the emergency fund', () => {
  const v = view([asset({ manualValue: 30000, costBasis: 30000, assetClass: 'CASH', isEmergencyFund: true }), asset({ manualValue: 70000, costBasis: 50000 })])
  assert.equal(v.netWorth, 100000)
  assert.equal(v.emergency, 30000)
  assert.equal(v.investable, 70000)
  assert.equal(v.gain, 20000)
})

test('global fund is looked through into regions', () => {
  const v = view([asset({ region: 'GLOBAL', manualValue: 100, isFund: true }), asset({ region: 'SA', manualValue: 100 })])
  const b = breakdown(v.rows, 'region', settings(), L, true)
  const get = (k: string) => b.slices.find((s) => s.key === k)?.pct ?? 0
  assert.ok(Math.abs(get('SA') - 50) < 1e-9)
  assert.ok(Math.abs(get('US') - 32) < 1e-9)
  assert.ok(Math.abs(get('DEV') - 12.5) < 1e-9)
  assert.ok(Math.abs(get('EM') - 5.5) < 1e-9)
  const raw = breakdown(v.rows, 'region', settings(), L, false)
  assert.ok(raw.slices.some((s) => s.key === 'GLOBAL'))
})

test('breakdown reports concentration level and effective count', () => {
  const b = breakdown(view([asset({ manualValue: 80 }), asset({ manualValue: 20, assetClass: 'GOLD' })]).rows, 'class', settings(), L)
  assert.equal(b.level, 'concentrated')
  assert.ok(Math.abs(b.effectiveN - 1 / (0.64 + 0.04)) < 1e-9)
})

test('insights flag single stock, sector and home bias but not a diversified fund', () => {
  const rows = view([
    asset({ id: 's1', name: 'Bank A', manualValue: 60, sector: 'BANKS', region: 'SA' }),
    asset({ id: 'f1', name: 'World fund', manualValue: 40, sector: 'DIVERSIFIED', region: 'SA', isFund: true }),
  ]).rows
  const ids = insights(rows, settings(), L, NOW.getTime()).map((i) => i.id)
  assert.ok(ids.includes('single-s1'))
  assert.ok(!ids.includes('single-f1'))
  assert.ok(ids.includes('sector'))
  assert.ok(ids.includes('region'))
  assert.ok(!ids.includes('ok'))
})

test('a balanced portfolio gets the all-clear', () => {
  const rows = view([
    asset({ manualValue: 60, region: 'GLOBAL', sector: 'DIVERSIFIED', isFund: true }),
    asset({ manualValue: 20, assetClass: 'FIXED_INCOME', sector: 'NA', isFund: true, accountId: 'acc2' }),
    asset({ manualValue: 20, assetClass: 'GOLD', sector: 'NA', isFund: true, region: 'NONE', accountId: 'acc2' }),
  ]).rows
  assert.equal(insights(rows, settings(), L, NOW.getTime())[0].id, 'ok')
})

test('contribution goes only to underweight classes and sums to the amount', () => {
  const targets = { EQUITY: 60, FIXED_INCOME: 20, CASH: 0, GOLD: 20, REAL_ESTATE: 0, CRYPTO: 0, OTHER: 0 } as Record<AssetClass, number>
  const s = settings({ targets })
  const rows = view([asset({ manualValue: 90000 }), asset({ manualValue: 10000, assetClass: 'GOLD', name: 'Gold ETF', isFund: true })], {}, s).rows
  const lines = allocateContribution(10000, rows, s, L)
  const by = Object.fromEntries(lines.map((l) => [l.assetClass, l]))
  assert.equal(by.EQUITY, undefined)
  assert.ok(Math.abs(lines.reduce((x, l) => x + l.amount, 0) - 10000) < 1e-6)
  // gaps: fixed income 22000, gold 12000 -> proportional split
  assert.ok(Math.abs(by.FIXED_INCOME.amount - 10000 * (22000 / 34000)) < 1e-6)
  assert.deepEqual(by.GOLD.suggestions, ['Gold ETF'])
  assert.ok(by.GOLD.afterPct > 10)
})

test('contribution large enough to fix everything lands exactly on target', () => {
  const targets = { EQUITY: 50, FIXED_INCOME: 50, CASH: 0, GOLD: 0, REAL_ESTATE: 0, CRYPTO: 0, OTHER: 0 } as Record<AssetClass, number>
  const s = settings({ targets })
  const rows = view([asset({ manualValue: 100 })], {}, s).rows
  const lines = allocateContribution(100, rows, s, L)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].assetClass, 'FIXED_INCOME')
  assert.ok(Math.abs(lines[0].afterPct - 50) < 1e-9)
})

test('withdrawal is taken from overweight classes first', () => {
  const targets = { EQUITY: 50, FIXED_INCOME: 50, CASH: 0, GOLD: 0, REAL_ESTATE: 0, CRYPTO: 0, OTHER: 0 } as Record<AssetClass, number>
  const s = settings({ targets })
  const rows = view([asset({ manualValue: 700 }), asset({ manualValue: 300, assetClass: 'FIXED_INCOME' })], {}, s).rows
  const lines = allocateWithdrawal(100, rows, s, L)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].assetClass, 'EQUITY')
  assert.ok(Math.abs(lines[0].amount - 100) < 1e-9)
})

test('drift is measured in percentage points against targets', () => {
  const s = settings()
  const d = driftRows(view([asset({ manualValue: 100 })], {}, s).rows, s, L)
  assert.equal(d.find((r) => r.assetClass === 'EQUITY')!.drift, 40)
  assert.equal(d.find((r) => r.assetClass === 'GOLD')!.drift, -10)
})

test('emergency fund status', () => {
  const s = settings({ monthlyExpenses: 10000, emergencyMonths: 6 })
  const e = emergencyStatus(view([asset({ manualValue: 15000, isEmergencyFund: true })], {}, s), s)
  assert.equal(e.target, 60000)
  assert.equal(e.pct, 25)
  assert.equal(e.shortfall, 45000)
  assert.equal(e.monthsCovered, 1.5)
  assert.equal(e.ready, false)
})

test('goal maths: future value, months to target and required monthly agree', () => {
  const r = 0.005
  const fv = futureValue(100000, 3000, 120, r)
  assert.ok(Math.abs(fv - (100000 * 1.005 ** 120 + 3000 * ((1.005 ** 120 - 1) / 0.005))) < 1e-6)
  assert.equal(monthsToTarget(100000, 3000, fv - 1, r), 120)
  assert.ok(Math.abs(requiredMonthly(100000, fv, 120, r) - 3000) < 1e-6)
  assert.equal(monthsToTarget(100, 0, 1e9, 0), null)
  assert.equal(futureValue(100, 10, 12, 0), 220)
})

test('income goal converts to a capital target through the withdrawal rate', () => {
  const s = settings()
  s.goal = { ...s.goal, mode: 'INCOME', monthlyIncome: 10000 }
  s.income = { ...s.income, rate: 4 }
  assert.equal(goalTarget(s), 3000000)
  const g = goalStatus(view([asset({ manualValue: 750000 })], {}, s), s, NOW)
  assert.equal(g.pct, 25)
})

test('income equation: growth is what is left after inflation, zakat and income', () => {
  const b = balanceEquation(7, 2, 1.5, 3.5)
  assert.deepEqual([b.growth, b.maxIncomeRate, b.sustainable], [0, 3.5, true])
  assert.equal(balanceEquation(7, 2, 1.5, 5).sustainable, false)
  assert.equal(balanceEquation(7, 2, 1.5, 5).growth, -1.5)
  assert.equal(requiredPortfolio(2920, 3.5), 2920 * 12 / 0.035)
  assert.equal(requiredPortfolio(1000, 0), 0)
})

test('effective zakat rate comes from the holdings unless the user overrides it', () => {
  const s = settings()
  assert.equal(effectiveZakatRate(15000, 1000000, s), 1.5)
  s.income = { ...s.income, zakatRateOverride: 2 }
  assert.equal(effectiveZakatRate(15000, 1000000, s), 2)
})

const snap = (month: string, v: number) => ({ month, date: month + '-01', netWorth: v + 50000, invested: 0, investable: v })

test('income is smoothed over up to three years of snapshots', () => {
  assert.deepEqual(smoothedValue([], 1000000, NOW), { value: 1000000, months: 1 })
  const sm = smoothedValue([snap('2022-01', 1), snap('2024-06', 800000), snap('2025-06', 900000), snap('2026-06', 5)], 1000000, NOW)
  assert.deepEqual(sm, { value: 900000, months: 3 })   // too-old and current-month snapshots are ignored
})

test('guardrails: cut above the upper bound, raise below the lower one', () => {
  assert.deepEqual(guardrail(60000, 1000000, 5, 3), { state: 'cut', ratePct: 6, suggested: 54000 })
  assert.equal(guardrail(40000, 1000000, 5, 3).state, 'ok')
  const up = guardrail(25000, 1000000, 5, 3)
  assert.equal(up.state, 'raise')
  assert.ok(Math.abs(up.suggested - 27500) < 1e-6)
  assert.equal(guardrail(0, 1000000, 5, 3).state, 'none')
})

test('layers: income account, reserve and growth with their targets', () => {
  const rows = view([
    asset({ assetClass: 'CASH', manualValue: 20000, isIncomeAccount: true }),
    asset({ assetClass: 'FIXED_INCOME', manualValue: 60000 }),
    asset({ assetClass: 'CASH', manualValue: 10000 }),
    asset({ manualValue: 910000 }),
  ]).rows
  const l = layers(rows, 35000, 15000, 1.5)
  assert.deepEqual(l, { income: { value: 20000, target: 50000 }, reserve: { value: 70000, target: 52500 }, growth: { value: 910000 } })
})

test('yearly transfer: income + zakat, topped up by selling what is above target', () => {
  const targets = { EQUITY: 60, FIXED_INCOME: 30, CASH: 10, GOLD: 0, REAL_ESTATE: 0, CRYPTO: 0, OTHER: 0 } as Record<AssetClass, number>
  const s = settings({ targets })
  const rows = view([
    asset({ assetClass: 'CASH', manualValue: 10000, isIncomeAccount: true }),
    asset({ assetClass: 'FIXED_INCOME', manualValue: 190000 }),
    asset({ manualValue: 800000 }),
  ], {}, s).rows
  const t = annualTransfer(rows, 15000, [], s, L, NOW)
  assert.equal(t.income, 35000)                      // 3.5% of 1,000,000
  assert.ok(Math.abs(t.monthly - 35000 / 12) < 1e-9)
  assert.equal(t.transfer, 50000)
  assert.equal(t.need, 40000)                        // 10,000 already in the income account
  assert.equal(t.marketDown, false)
  assert.equal(t.fromReserve, 0)
  assert.deepEqual(t.sells.map((l) => l.assetClass), ['EQUITY'])   // equities are the overweight class
  assert.ok(Math.abs(t.sells[0].amount - 40000) < 1e-6)
})

test('yearly transfer in a deep drop takes from the reserve and holds income flat', () => {
  const s = settings()
  s.income = { ...s.income, annualIncome: 30000 }
  const rows = view([asset({ assetClass: 'FIXED_INCOME', manualValue: 100000 }), asset({ manualValue: 700000 })], {}, s).rows
  const history = [snap('2025-06', 1000000), snap('2025-12', 1000000)]
  const t = annualTransfer(rows, 0, history, s, L, NOW)
  assert.ok(Math.abs(t.drawdownPct - 20) < 1e-9)
  assert.equal(t.marketDown, true)
  assert.equal(t.rule, 'held')                       // base would be 3.5% of 933,333 = 32,667 > last year's 30,000
  assert.equal(t.income, 30000)
  assert.equal(t.fromReserve, 30000)
  assert.equal(t.sells.length, 0)
})

test('yearly transfer cuts income 10% when it exceeds the upper guardrail', () => {
  const s = settings()
  const rows = view([asset({ manualValue: 500000 })], {}, s).rows
  const t = annualTransfer(rows, 0, [snap('2025-01', 1100000), snap('2025-06', 1100000)], s, L, NOW)
  assert.ok(Math.abs(t.baseIncome - 31500) < 1e-6)   // 3.5% of the 900,000 average = 6.3% of today's value
  assert.equal(t.rule, 'cut')
  assert.ok(Math.abs(t.income - 28350) < 1e-6)
})

test('zakat: modes, rate by calendar and nisab', () => {
  const s = settings()
  s.zakat = { ...s.zakat, goldPricePerGram: 400, hawlDate: '2026-07-15' }
  const rows = view([
    asset({ id: 'cash', assetClass: 'CASH', manualValue: 100000, zakatMode: 'FULL' }),
    asset({ id: 'sa', manualValue: 50000, zakatMode: 'COMPANY_PAYS' }),
    asset({ id: 'us', manualValue: 40000, zakatMode: 'PERCENT', zakatPercent: 25 }),
    asset({ id: 'home', assetClass: 'REAL_ESTATE', manualValue: 900000, zakatMode: 'EXEMPT' }),
  ], {}, s).rows
  const z = zakatStatus(rows, {}, s, NOW)
  assert.equal(z.base, 110000)
  assert.equal(z.nisab, 34000)
  assert.equal(z.aboveNisab, true)
  assert.equal(z.due, 2750)
  assert.equal(z.daysToHawl, 30)
  s.zakat.calendar = 'GREGORIAN'
  assert.ok(Math.abs(zakatStatus(rows, {}, s, NOW).due - 110000 * 0.02577) < 1e-9)
})

test('zakat: below nisab nothing is due; live gold price overrides the manual one', () => {
  const s = settings()
  s.zakat.goldPricePerGram = 400
  const rows = view([asset({ assetClass: 'CASH', manualValue: 10000 })], {}, s).rows
  assert.equal(zakatStatus(rows, {}, s, NOW).due, 0)
  const z = zakatStatus(rows, { 'GC=F': quote('GC=F', 31.1035, 0, 'USD') }, s, NOW)
  assert.ok(Math.abs(z.nisab - 85 * 3.75) < 1e-9)
  assert.equal(z.aboveNisab, true)
  s.zakat.goldPricePerGram = 0
  assert.equal(zakatStatus(rows, {}, s, NOW).aboveNisab, null)
})

test('default zakat treatment and next hawl date', () => {
  assert.equal(defaultZakatMode({ assetClass: 'EQUITY', region: 'SA', isFund: false, symbol: '2222.SR', pricing: 'live' }), 'COMPANY_PAYS')
  assert.equal(defaultZakatMode({ assetClass: 'EQUITY', region: 'US', isFund: true, symbol: 'VOO', pricing: 'live' }), 'PERCENT')
  assert.equal(defaultZakatMode({ assetClass: 'EQUITY', region: 'SA', isFund: true, symbol: null, pricing: 'manual' }), 'PERCENT')
  assert.equal(defaultZakatMode({ assetClass: 'CASH', region: 'SA', isFund: true, symbol: null, pricing: 'manual' }), 'FULL')
  assert.equal(defaultZakatMode({ assetClass: 'GOLD', region: 'NONE', isFund: true, symbol: 'GLD', pricing: 'live' }), 'FULL')
  assert.equal(defaultZakatMode({ assetClass: 'REAL_ESTATE', region: 'SA', isFund: true, symbol: '4330.SR', pricing: 'live' }), 'EXEMPT')
  assert.equal(nextHawlDate('2026-01-01', 'HIJRI'), '2026-12-21')
  assert.equal(nextHawlDate('2026-01-01', 'GREGORIAN'), '2027-01-01')
})

test('dividends: trailing 12 months, fx and growth between complete years', () => {
  const usd = asset({ id: 'u', currency: 'USD' })
  const tx = (assetId: string, date: string, amount: number) => ({ id: date, assetId, type: 'DIVIDEND' as const, date, quantity: 0, price: 0, amount, note: '', dQty: 0, dCost: 0, dValue: 0, createdAt: '' })
  const d = dividendStats({ assets: [usd, asset({ id: 's' })], settings: settings(), transactions: [
    tx('s', '2024-05-01', 1000), tx('s', '2025-05-01', 1200), tx('s', '2026-05-01', 1300), tx('u', '2026-03-01', 100),
  ] }, 100000, NOW)
  assert.equal(d.ttm, 1300 + 375)
  assert.ok(Math.abs(d.growthPct! - 20) < 1e-9)
  assert.ok(Math.abs(d.yieldOnCost - 1.675) < 1e-9)
  assert.equal(d.byAsset[0].assetId, 's')
})

test('review becomes due after the chosen interval', () => {
  const s = settings()
  s.review = { frequency: 'QUARTERLY', lastReviewAt: '2026-03-01T00:00:00Z' }
  assert.equal(reviewStatus({ assets: [], settings: s }, NOW).due, true)
  s.review.lastReviewAt = '2026-05-01T00:00:00Z'
  const r = reviewStatus({ assets: [], settings: s }, NOW)
  assert.equal(r.due, false)
  assert.equal(r.nextDue, '2026-08-01')
  assert.equal(reviewStatus({ assets: [], settings: settings() }, NOW).never, true)
})

test('share link round-trips Arabic text and rejects garbage', () => {
  const p = { v: 1 as const, d: '2026-06-15', n: 'محفظة خالد', c: [['EQUITY', 60], ['GOLD', 40]] as [AssetClass, number][], r: [['السعودية', 100]] as [string, number][], s: [], h: [['أرامكو', 60, 'EQUITY']] as [string, number, AssetClass][] }
  const enc = encodeShare(p)
  assert.match(enc, /^[A-Za-z0-9_-]+$/)
  assert.deepEqual(decodeShare('#' + enc), { ...p, t: undefined, g: undefined })
  assert.equal(decodeShare('#not-valid!!'), null)
  assert.equal(decodeShare(''), null)
})
