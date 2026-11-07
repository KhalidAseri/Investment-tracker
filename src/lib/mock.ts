// Development-only in-memory stand-in for Supabase, used with ?demo to review the interface.
// Never included in production builds (guarded by import.meta.env.DEV in supabase.ts).
import { PLAN_TEMPLATES } from './planTemplates'
import type { PlanDoc } from './plan'
type Row = Record<string, any>
const uid = 'demo-user'
const id = () => Math.random().toString(36).slice(2, 10)
const iso = (d: Date) => d.toISOString().slice(0, 10)

function fixture() {
  const s = (name: string, layer: string, now: number, fi: number, accepts = true, note = '', sort = 0) =>
    ({ id: id(), user_id: uid, name, layer, target_now: now, target_fi: fi, accepts_new_money: accepts, expected_return: 6, yield_pct: 3, zakat_rate: 2.5, note, sort, band_min: null, band_max: null })
  const sleeves = [
    s('أسهم عالمية متوافقة', 'growth', 45, 33, true, 'iShares MSCI World Islamic في IBKR', 1),
    s('أسهم سعودية متوافقة', 'growth', 12, 9, true, 'صندوق مؤشر منخفض الرسوم', 2),
    s('أسهم مباشرة نوعية', 'growth', 8, 5, false, 'بشروط الدليل فقط', 3),
    s('صكوك حكومية سعودية', 'income', 10, 22, true, 'صكوك مدرجة و«صح»', 4),
    s('صناديق ريت سعودية', 'income', 5, 8, true, '', 5),
    s('صناديق التوزيع الشهري', 'income', 5, 5, false, 'بلا إيداع جديد', 6),
    s('سيولة ومرابحة', 'safety', 5, 10, true, '', 7),
    s('ذهب', 'hedge', 10, 8, true, 'صندوق البلاد للذهب', 8),
  ]
  const a = (name: string, kind: string, extra: Row = {}, sort = 0) => ({ id: id(), user_id: uid, name, kind, is_ibkr: false, exclude_from_portfolio: false, country: 'SA', note: null, sort, ...extra })
  const accounts = [
    a('Interactive Brokers', 'broker', { is_ibkr: true, country: 'INTL', note: 'الأصول العالمية' }, 1),
    a('الراجحي المالية', 'broker', { note: 'الأصول المحلية واحتياطي الدخل' }, 2),
    a('برنامج الادخار', 'savings_program', { note: 'الأهلي المالية' }, 3),
    a('صندوق الطوارئ', 'bank', { exclude_from_portfolio: true, note: 'خارج المحفظة' }, 4),
  ]
  const old = new Date(Date.now() - 50 * 86400000).toISOString()
  const h = (name: string, acc: number, sl: number | null, qty: number, price: number, extra: Row = {}, sort = 0) => ({
    id: id(), user_id: uid, account_id: accounts[acc].id, sleeve_id: sl == null ? null : sleeves[sl].id, name, symbol: null, price_source: 'manual',
    currency: 'SAR', quantity: qty, price, price_updated_at: new Date().toISOString(), ibkr_conid: null, cost_basis: null, note: null, archived: false, zakatable: true,
    goal_id: null, goal_bucket: null, zakat_start: null, payout_freq: 'none', payout_next: null, payout_basis: 'rate', payout_rate: null, payout_per_unit: null, payout_nominal: null, maturity_date: null, sort, ...extra,
  })
  const holdings = [
    h('iShares MSCI World Islamic', 0, 0, 0, 0, { symbol: 'ISWD.L', price_source: 'yahoo', currency: 'USD' }, 1),
    h('صندوق الراجحي للتوزيعات الشهرية', 1, 5, 9200, 9.665, { price_updated_at: old, price_source: 'nav', symbol: '5885', cost_basis: 88000, fee_pct: 1, purification_pct: 1.2, payout_freq: 'monthly', payout_rate: 7.5, payout_next: iso(new Date(Date.now() + 12 * 86400000)), zakat_start: '2025-03-01' }, 2),
    h('صندوق الراجحي للتوزيعات الشهرية 2', 1, 5, 2300, 9.93, { payout_freq: 'monthly', payout_next: iso(new Date(Date.now() + 14 * 86400000)) }, 3),
    h('صكوك الحكومة 2029', 1, 3, 20, 985, { cost_basis: 19900, payout_freq: 'semiannual', payout_rate: 5.2, payout_nominal: 1000, payout_next: iso(new Date(Date.now() + 40 * 86400000)), maturity_date: '2029-06-30', zakat_start: '2026-01-15' }, 10),
    h('صندوق البلاد للذهب', 1, 7, 0, 21.3, { symbol: '9405.SR', price_source: 'yahoo' }, 4),
    h('برنامج الادخار: محفظة النمو', 2, 1, 1, 24850, { fee_pct: 0.75 }, 5),
    h('برنامج الادخار: الدخل المتحفظ', 2, 3, 1, 23900, {}, 6),
    h('صندوق مرابحة', 1, 6, 1, 15000, {}, 7),
    h('حساب الطوارئ', 3, null, 1, 80000, {}, 8),
    h('مصرف الراجحي', 1, 2, 120, 98.4, { symbol: '1120.SR', price_source: 'yahoo', zakatable: false, cost_basis: 12600, purification_pct: 0.8 }, 9),
  ]
  const today = new Date()
  // a believable 4-month history that ends near today's value, with a 10,000 deposit 20 days ago
  const fxm: Record<string, number> = { SAR: 1, USD: 3.75, GBP: 5 }
  const mainTotal = holdings.filter((h) => h.account_id !== accounts[3].id).reduce((a, h) => a + h.quantity * h.price * (fxm[h.currency] ?? 1), 0)
  const DAYS = 120
  const snapshots = Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(today.getTime() - (DAYS - i) * 86400000)
    const k = i / (DAYS - 1)
    const v = mainTotal * (0.925 + 0.07 * k) + Math.sin(i / 4.5) * mainTotal * 0.012 + Math.sin(i / 1.7) * mainTotal * 0.003 - (DAYS - i >= 20 ? 10000 : 0)
    return { user_id: uid, snap_date: iso(d), total_sar: Math.round(v), by_sleeve: {}, by_account: {} }
  })
  const ev = (title: string, kind: string, date: string, amount: number | null, recurrence = 'none', note: string | null = null) =>
    ({ id: id(), user_id: uid, title, kind, event_date: date, amount, recurrence, done: false, note })
  const events = [
    ev('المراجعة السنوية وإعادة التوازن', 'review', '2027-01-05', null, 'yearly', 'قارن الأوزان واحسب الزكاة'),
    ev('تجديد السلفة', 'advance', '2027-05-15', 250000, 'none', 'وزّعها على 6 أشهر'),
    ev('المكافأة السنوية', 'bonus', '2027-03-01', 60000, 'yearly', 'التاريخ تقديري'),
    ev('الزكاة السنوية', 'zakat', '2027-02-08', null),
    ev('اكتمال استحقاق برنامج الادخار', 'vesting', '2032-06-01', null),
  ]
  const settings = {
    monthly_invest: 4000, deposit_day: 27, contribution_mode: 'auto', reserve_account_id: null, stock_cap: 3,
    income_method: 'value', income_profit_share: 100, income_fixed_monthly: null, income_transfer_day: 27, income_review_month: 1,
    income_start_year: /income-now/.test(typeof location !== 'undefined' ? location.search : '') ? new Date().getFullYear() : null, income_approved_annual: null, income_approved_year: null,
    user_id: typeof location !== 'undefined' && /viewer/.test(location.search) ? 'owner-user' : uid, monthly_income_target: 20000, withdrawal_rate: 4, safe_withdrawal_rate: 3.5, inflation_rate: 2.5, expected_return: 6.5,
    return_low: 5, return_high: 8, annual_contribution: 300000, contribution_growth: 4, birth_year: 1998, independence_year: 2038, glide_start_year: 2035,
    rebalance_band: 5, reserve_months: 24, guard_drawdown: 15, guard_cut: 10, guard_high_rate: 5, guard_low_rate: 3, include_mortgage: false,
    mortgage_monthly: 5029, mortgage_end_year: 2044, benchmark_symbol: 'ISWD.L', baseline_value: 150000, baseline_date: snapshots[0].snap_date, extra: {},
  }
  const transactions = [
    { id: id(), user_id: uid, account_id: accounts[1].id, holding_id: holdings[1].id, sleeve_id: sleeves[5].id, tx_date: iso(new Date(today.getTime() - 6 * 86400000)), kind: 'dividend', amount_sar: 820, quantity: null, price: null, currency: 'SAR', note: 'توزيع شهري', source: 'manual', external_id: null },
    ...[36, 66, 97, 127].map((days) => ({ id: id(), user_id: uid, account_id: accounts[1].id, holding_id: holdings[1].id, sleeve_id: sleeves[5].id, tx_date: iso(new Date(today.getTime() - days * 86400000)), kind: 'dividend', amount_sar: 560 + (days % 7) * 10, quantity: null, price: null, currency: 'SAR', note: 'توزيع شهري', source: 'manual', external_id: null })),
    { id: id(), user_id: uid, account_id: accounts[1].id, holding_id: holdings[6].id, sleeve_id: sleeves[6].id, tx_date: iso(new Date(today.getTime() - 20 * 86400000)), kind: 'deposit', amount_sar: 10000, quantity: null, price: null, currency: 'SAR', note: null, source: 'planner', external_id: null },
  ]
  const fx_rates = [
    { currency: 'SAR', rate_to_sar: 1, updated_at: new Date().toISOString() }, { currency: 'USD', rate_to_sar: 3.75, updated_at: new Date().toISOString() },
    { currency: 'GBP', rate_to_sar: 5.0, updated_at: new Date().toISOString() },
  ]
  const w = (name: string, symbol: string, price: number, fair: number, c: [boolean, boolean, boolean, boolean], thesis: string | null = null, sort = 0) => ({
    id: id(), user_id: uid, name, symbol, currency: 'SAR', price, price_updated_at: new Date().toISOString(), fair_value: fair, margin_pct: 20,
    c_size: c[0], c_shariah: c[1], c_quality: c[2], c_thesis: c[3], thesis, exit_rule: null, note: null, sort,
  })
  const watchlist = [
    w('مصرف الإنماء', '1150.SR', 26.1, 34, [true, true, true, true], 'نمو الأرباح وتوزيعات منتظمة', 1),
    w('أرامكو السعودية', '2222.SR', 24.8, 29, [true, true, true, false], null, 2),
    w('شركة الاتصالات السعودية', '7010.SR', 41.2, 44, [true, true, true, true], 'توزيعات ثابتة', 3),
  ]
  const portfolio_viewers = [{ id: id(), owner_id: uid, viewer_email: 'wife@example.com', created_at: new Date().toISOString() }]
  const goalId = id()
  const emergencyId = id()
  const treasuryId = id()
  const cashAlloc = [{ key: 'cash', name: 'سيولة', weight: 100 }]
  const goals = [
    { id: goalId, user_id: uid, kind: 'goal', name: 'الدفعة الأولى للبيت', target_amount: 300000, target_date: iso(new Date(Date.now() + 3.2 * 365 * 86400000)), expected_return: 5,
      allocation: [{ key: 'cash', name: 'سيولة ومرابحة', weight: 60 }, { key: 'sukuk', name: 'صكوك', weight: 40 }], priority: 1, note: null, archived: false, sort: 1 },
    // special kinds: the emergency fund (below its target) and the income treasury
    { id: emergencyId, user_id: uid, kind: 'emergency', name: 'صندوق الطوارئ', target_amount: 120000, target_date: null, expected_return: 0, allocation: cashAlloc, priority: 1, note: null, archived: false, sort: -2 },
    { id: treasuryId, user_id: uid, kind: 'income', name: 'خزانة الدخل', target_amount: 0, target_date: null, expected_return: 0, allocation: cashAlloc, priority: 1, note: null, archived: false, sort: -1 },
  ]
  holdings.push(h('مرابحة الدفعة الأولى', 1, null, 1, 42000, { goal_id: goalId, goal_bucket: 'cash' }, 20))
  const emergencyHolding = holdings.find((x) => x.name === 'حساب الطوارئ')!
  Object.assign(emergencyHolding, { goal_id: emergencyId, goal_bucket: 'cash', zakat_start: '2025-09-01' })
  holdings.push(h('نقد خزانة الدخل', 1, null, 1, 6000, { goal_id: treasuryId, goal_bucket: 'cash', cost_basis: 6000 }, 21))
  const plans = [
    { id: id(), user_id: uid, name: 'خطة الاستقلال المالي', is_active: true, doc: demoPlan(today, sleeves, snapshots[0]), created_at: snapshots[0].snap_date + 'T08:00:00Z', updated_at: new Date().toISOString() },
    { id: id(), user_id: uid, name: 'خطة دخل (مسودة)', is_active: false, doc: { ...PLAN_TEMPLATES[1].build(iso(today)), name: 'خطة دخل (مسودة)' }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  ]
  const income_streams = [
    { id: id(), user_id: uid, name: 'المكافأة السنوية', kind: 'bonus', amount: 120000, frequency: 'yearly', month: 3, next_date: null, invest_pct: 70, note: null, sort: 1 },
    { id: id(), user_id: uid, name: 'سلفة جهة العمل', kind: 'advance', amount: 200000, frequency: 'irregular', month: null, next_date: '2027-05-15', invest_pct: 100, note: null, sort: 2 },
  ]
  const obligations = [
    { id: id(), user_id: uid, name: 'تمويل عقاري', kind: 'mortgage', monthly_amount: 4500, end_year: 2044, balance: 610000, balance_date: iso(new Date(Date.now() - 60 * 86400000)), rate_pct: 4.2, note: null, sort: 1 },
    { id: id(), user_id: uid, name: 'سلفة جهة العمل', kind: 'advance', monthly_amount: 3500, end_year: 2029, balance: 98000, balance_date: iso(today), rate_pct: null, note: null, sort: 2 },
  ]
  const other_assets = [{ id: id(), user_id: uid, name: 'البيت', kind: 'real_estate', value: 1250000, value_date: iso(new Date(Date.now() - 200 * 86400000)), appreciation_pct: 2, note: null, sort: 1 },
    { id: id(), user_id: uid, name: 'السيارة', kind: 'vehicle', value: 95000, value_date: iso(new Date(Date.now() - 300 * 86400000)), appreciation_pct: -12, note: null, sort: 2 }]
  if (typeof location !== 'undefined' && /onboard/.test(location.search)) {
    return { plan_settings: [], sleeves: [], accounts: [], holdings: [], snapshots: [], events: [], transactions: [], fx_rates, ibkr_connection: [] as Row[], watchlist: [], portfolio_viewers: [], income_streams: [], obligations: [], goals: [], other_assets: [], plans: [] }
  }
  return { plan_settings: [settings], sleeves, accounts, holdings, snapshots, events, transactions, fx_rates, ibkr_connection: [] as Row[], watchlist, portfolio_viewers, income_streams, obligations, goals, other_assets, plans }
}

/**
 * An active plan that exercises every part of the feature around the demo values: 3 phases with bands (the next one starts in
 * 45 days), milestones a little ahead of the portfolio, monthly/yearly/once contributions due now, an emergency fund below
 * target, an income treasury that is being built (?income-now: income already started), rules, steps done/overdue/upcoming
 * and one past review.
 */
export function demoPlan(today: Date, sleeves: Row[], first: Row): PlanDoc {
  const day = (n: number) => iso(new Date(today.getTime() + n * 86400000))
  const y = today.getFullYear(), m = today.getMonth() + 1, d = today.getDate()
  const ym = (yy: number, mm: number, dd: number) => iso(new Date(Date.UTC(yy, mm - 1, dd, 12)))
  const incomeNow = typeof location !== 'undefined' && /income-now/.test(location.search)
  const keys = ['global', 'saudi', 'direct', 'sukuk', 'reit', 'dist', 'cash', 'gold']
  const band = (targets: number[], widths: number[]) => Object.fromEntries(keys.map((k, i) => [k, { target: targets[i], min: Math.max(0, targets[i] - widths[i]), max: targets[i] + widths[i] }]))
  const created = first.snap_date as string
  const phase3 = ym(y + 5, 1, 1)
  return {
    version: 1, name: 'خطة الاستقلال المالي', created,
    baseline: { date: created, value: Number(first.total_sar) },
    goal: { monthly_income: 15000, target_capital: 4500000, target_date: ym(y + 12, 1, 1), note: 'دخل شهري 15 ألف ريال بقيمة اليوم' },
    sleeves: sleeves.map((s, i) => ({ key: keys[i], name: s.name, layer: s.layer, accepts_new_money: !!s.accepts_new_money, note: s.note || null })),
    sleeve_map: Object.fromEntries(sleeves.map((s, i) => [keys[i], s.id])),
    phases: [
      { key: 'build', name: 'البناء', start: created, note: 'الأموال الجديدة للفئات الناقصة', weights: band([45, 12, 8, 10, 5, 5, 5, 10], [5, 3, 8, 3, 3, 3, 2, 3]) },
      { key: 'shift', name: 'الانتقال', start: day(45), note: 'انتقال تدريجي نحو الدخل', weights: band([38, 11, 6, 18, 8, 5, 6, 8], [5, 3, 6, 3, 3, 3, 2, 3]) },
      { key: 'income', name: 'الدخل', start: phase3, note: 'السيولة هي خزانة الدخل', weights: band([30, 9, 4, 24, 10, 6, 10, 7], [5, 3, 4, 4, 3, 3, 3, 2]) },
    ],
    milestones: [
      { date: day(50), value: 320000, label: 'محطة الربع' },
      { date: ym(y + 1, 12, 31), value: 450000, label: null },
      { date: ym(y + 2, 12, 31), value: 650000, label: null },
      { date: ym(y + 3, 12, 31), value: 900000, label: null },
      { date: ym(y + 5, 12, 31), value: 1500000, label: 'بداية الدخل' },
    ],
    contributions: [
      { key: 'salary', name: 'الفائض الشهري من الراتب', kind: 'monthly', amount: 4000, day: Math.max(1, d - 2), month: null, date: created, until: null, split_months: null, growth_pct: 4, note: 'يرتفع مع العلاوة' },
      { key: 'savings', name: 'برنامج الادخار', kind: 'monthly', amount: 2000, day: 27, month: null, date: created, until: ym(y + 6, 12, 31), split_months: null, growth_pct: null, note: 'آلي' },
      { key: 'bonus', name: 'المكافأة السنوية', kind: 'yearly', amount: 60000, day: 1, month: m, date: null, until: null, split_months: 3, growth_pct: null, note: 'على ثلاث دفعات' },
      { key: 'advance', name: 'دفعة استثنائية', kind: 'once', amount: 100000, day: null, month: null, date: ym(y, m + 5, 15), until: null, split_months: 6, growth_pct: null, note: 'على ستة أشهر' },
    ],
    emergency: { months: 6, monthly_expense: 20000 },
    income: { start: incomeNow ? day(-60) : phase3, method: 'percent', annual_pct: 4, fixed_monthly: null, band_pct: 10, treasury_months: 24, transfer_day: incomeNow ? 1 : 27,
      no_sell_drawdown_pct: 20, build_from: day(-30) },
    rules: { review_month: m, crash_pct: 25, crash_sleeves: ['global'], new_money_first: true },
    steps: [
      { key: 'emergency', title: 'افصل صندوق الطوارئ عن المحفظة', detail: 'ستة أشهر من المصروف', due: day(-100), done_at: day(-98), recurring: 'none' },
      { key: 'account', title: 'افتح حساب الوساطة العالمي', detail: null, due: day(-80), done_at: day(-85), recurring: 'none' },
      { key: 'stop-dist', title: 'أوقف الإيداع في صناديق التوزيع', detail: 'مع إبقاء الرصيد', due: day(-10), done_at: null, recurring: 'none' },
      { key: 'gold', title: 'اشترِ أول حصة من الذهب', detail: 'صندوق ذهب متداول', due: day(5), done_at: null, recurring: 'none' },
      { key: 'reit', title: 'اختر صندوقي ريت من قطاعين مختلفين', detail: null, due: day(40), done_at: null, recurring: 'none' },
      { key: 'advance', title: 'استثمر الدفعة الاستثنائية على ستة أشهر', detail: null, due: ym(y, m + 5, 15), done_at: null, recurring: 'none' },
      { key: 'review', title: 'المراجعة السنوية', detail: 'الزكاة والتطهير، ثم إعادة التوازن', due: ym(y - 1, m, 20), done_at: ym(y - 1, m, 22), recurring: 'yearly' },
      { key: 'phase2', title: 'انتقل إلى أوزان مرحلة الانتقال', detail: 'بالأموال الجديدة أولاً', due: day(45), done_at: null, recurring: 'none' },
    ],
    reviews: [
      { year: y - 1, date: ym(y - 1, m, 22), value: 160000, zakat_paid: 3200, purification_paid: 150, rebalanced: true, income_annual: null, notes: 'أول مراجعة' },
    ],
    state: { income_year: null, income_annual: null, dismissed: {} },
  }
}

export function createMockClient(): any {
  const db: Record<string, Row[]> = fixture()
  // demo only: lets screenshot scripts find record ids (e.g. #/asset/<id>)
  if (typeof window !== 'undefined') (window as any).__demoDb = db
  const session = { user: { id: uid, email: 'demo@masar.local' }, access_token: 'demo' }
  class Q {
    private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
    private payload: any = null
    private filters: Array<(r: Row) => boolean> = []
    private one: 'single' | 'maybe' | null = null
    constructor(private table: string) {}
    select() { return this }
    insert(p: any) { this.op = 'insert'; this.payload = p; return this }
    upsert(p: any) { this.op = 'upsert'; this.payload = p; return this }
    update(p: any) { this.op = 'update'; this.payload = p; return this }
    delete() { this.op = 'delete'; return this }
    eq(k: string, v: any) { this.filters.push((r) => r[k] === v); return this }
    neq(k: string, v: any) { this.filters.push((r) => r[k] !== v); return this }
    gt(k: string, v: any) { this.filters.push((r) => r[k] > v); return this }
    gte(k: string, v: any) { this.filters.push((r) => r[k] >= v); return this }
    lt(k: string, v: any) { this.filters.push((r) => r[k] < v); return this }
    lte(k: string, v: any) { this.filters.push((r) => r[k] <= v); return this }
    is(k: string, v: any) { this.filters.push((r) => r[k] === v); return this }
    in(k: string, v: any[]) { this.filters.push((r) => v.includes(r[k])); return this }
    order() { return this }
    limit() { return this }
    single() { this.one = 'single'; return this }
    maybeSingle() { this.one = 'maybe'; return this }
    then(res: (v: any) => any, rej?: (e: any) => any) { return Promise.resolve(this.run()).then(res, rej) }
    private run() {
      const rows = (db[this.table] ??= [])
      const match = (r: Row) => this.filters.every((f) => f(r))
      let out: Row[] = []
      if (this.op === 'select') out = rows.filter(match)
      if (this.op === 'insert' || this.op === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload]
        out = list.map((p: Row) => { const r = { id: id(), user_id: uid, created_at: new Date().toISOString(), ...p }; rows.push(r); return r })
      }
      if (this.op === 'update') { rows.forEach((r, i) => { if (match(r)) rows[i] = { ...r, ...this.payload, ...('updated_at' in r ? { updated_at: new Date().toISOString() } : {}) } }); out = rows.filter(match) }
      if (this.op === 'delete') { db[this.table] = rows.filter((r) => !match(r)) }
      const data = this.one ? out[0] ?? null : out
      return { data: JSON.parse(JSON.stringify(data)), error: null }
    }
  }
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}), signUp: async () => ({}), signInWithPassword: async () => ({ error: null }),
    },
    from: (t: string) => new Q(t),
    rpc: async (name: string, args: any) => {
      if (name !== 'create_plan') return { data: false, error: null }
      const p = args.p
      const y = new Date().getFullYear()
      db.plan_settings = [{ user_id: uid, withdrawal_rate: 4, safe_withdrawal_rate: 3.5, inflation_rate: 2.5, return_low: p.settings.expected_return - 1.5, return_high: p.settings.expected_return + 1.5,
        rebalance_band: 5, reserve_months: 24, guard_drawdown: 15, guard_cut: 10, guard_high_rate: 5, guard_low_rate: 3, mortgage_monthly: 0, mortgage_end_year: y, baseline_value: null, baseline_date: iso(new Date()),
        stock_cap: 3, contribution_mode: 'auto', reserve_account_id: null, income_method: 'value', income_profit_share: 100, income_fixed_monthly: null, income_transfer_day: 27, income_review_month: 1,
        income_start_year: null, income_approved_annual: null, income_approved_year: null, ...p.settings }]
      db.accounts = p.accounts.map((a: Row, i: number) => ({ id: id(), user_id: uid, name: a.name, kind: a.kind, is_ibkr: !!a.is_ibkr, exclude_from_portfolio: !!a.exclude, note: null, sort: i + 1 }))
      db.sleeves = p.sleeves.map((x: Row, i: number) => ({ id: id(), user_id: uid, ...x, accepts_new_money: x.accepts ?? true, zakat_rate: 2.5, sort: i + 1 }))
      db.holdings = p.holdings.map((x: Row) => ({ id: id(), user_id: uid, name: x.name, account_id: x.account != null ? db.accounts[x.account]?.id ?? null : null, sleeve_id: x.sleeve != null ? db.sleeves[x.sleeve]?.id ?? null : null,
        symbol: null, price_source: 'manual', currency: 'SAR', quantity: 1, price: x.value, price_updated_at: new Date().toISOString(), ibkr_conid: null, cost_basis: null, note: null, archived: false, zakatable: true,
        goal_id: null, goal_bucket: null, zakat_start: null, payout_freq: 'none', payout_next: null, payout_basis: 'rate', payout_rate: null, payout_per_unit: null, payout_nominal: null, maturity_date: null, sort: x.sort ?? 0 }))
      db.income_streams = p.streams.map((x: Row) => ({ id: id(), user_id: uid, note: null, next_date: null, ...x }))
      db.obligations = p.obligations.map((x: Row) => ({ id: id(), user_id: uid, note: null, ...x }))
      return { data: true, error: null }
    },
    functions: { invoke: async (_name: string, opts?: { body?: Row }) => {
      const mode = opts?.body?.mode
      if (mode === 'search') return { data: { results: [
        { symbol: '2222.SR', name: 'Saudi Arabian Oil Company', exchange: 'Saudi Stock Exchange', type: 'EQUITY' },
        { symbol: '9405.SR', name: 'Albilad Gold ETF', exchange: 'Saudi Stock Exchange', type: 'ETF' },
        { symbol: 'ISWD.L', name: 'iShares MSCI World Islamic UCITS ETF USD (Dist)', exchange: 'London', type: 'ETF' },
        { symbol: '4340.SR', name: 'Al Rajhi REIT Fund', exchange: 'Saudi Stock Exchange', type: 'EQUITY' },
      ] }, error: null }
      if (mode === 'history') {
        const pts = Array.from({ length: 45 }, (_, i) => ({ d: iso(new Date(Date.now() - (44 - i) * 86400000)), c: 38 * (1 + i * 0.0011 + Math.sin(i / 4) * 0.006) }))
        return { data: { ok: true, name: 'iShares MSCI World Islamic UCITS ETF', points: pts }, error: null }
      }
      if (mode === 'parse-drahim') return { data: { ok: true, provider: 'drahim', period: '2026-10', periodLabel: 'أكتوبر 2026', total: 15530.74,
        holdings: [{ portfolio: 'محفظة التوزيعات', name: 'صندوق الراجحي للتوزيعات الشهرية', units: 1337.5, value: 12417.06 }, { portfolio: 'محفظة التوزيعات', name: 'صندوق الراجحي للتوزيعات الشهرية 2', units: 336.85, value: 3113.68 }],
        operations: [{ portfolio: 'محفظة التوزيعات', date: '2026-10-22', kind: 'withdrawal', label: 'سحب', amount: 127.09 }, { portfolio: 'محفظة التوزيعات', date: '2026-10-18', kind: 'dividend', label: 'أرباح موزعة', amount: 101.5 }, { portfolio: 'محفظة التوزيعات', date: '2026-10-18', kind: 'dividend', label: 'أرباح موزعة', amount: 25.59 }],
        fees: [{ portfolio: 'محفظة التوزيعات', amount: 6.7, label: 'مشاركة أرباح' }] }, error: null }
      if (mode === 'quote') return { data: { quote: { price: 38.42, currency: 'USD', name: 'iShares MSCI World Islamic UCITS ETF USD (Dist)', type: 'ETF', exchange: 'London' } }, error: null }
      return { data: { results: [{ prices: { updated: 2, failed: [] }, snapshot: {} }] }, error: null }
    } },
    channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c },
    removeChannel: () => {},
  }
}
