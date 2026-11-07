// Development-only in-memory stand-in for Supabase, used with ?demo to review the interface.
// Never included in production builds (guarded by import.meta.env.DEV in supabase.ts).
type Row = Record<string, any>
const uid = 'demo-user'
const id = () => Math.random().toString(36).slice(2, 10)
const iso = (d: Date) => d.toISOString().slice(0, 10)

function fixture() {
  const s = (name: string, layer: string, now: number, fi: number, accepts = true, note = '', sort = 0) =>
    ({ id: id(), user_id: uid, name, layer, target_now: now, target_fi: fi, accepts_new_money: accepts, expected_return: 6, yield_pct: 3, zakat_rate: 2.5, note, sort })
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
  const a = (name: string, kind: string, extra: Row = {}, sort = 0) => ({ id: id(), user_id: uid, name, kind, is_ibkr: false, exclude_from_portfolio: false, note: null, sort, ...extra })
  const accounts = [
    a('Interactive Brokers', 'broker', { is_ibkr: true, note: 'الأصول العالمية' }, 1),
    a('الراجحي المالية', 'broker', { note: 'الأصول المحلية واحتياطي الدخل' }, 2),
    a('برنامج الادخار', 'savings_program', { note: 'الأهلي المالية' }, 3),
    a('صندوق الطوارئ', 'bank', { exclude_from_portfolio: true, note: 'خارج المحفظة' }, 4),
  ]
  const old = new Date(Date.now() - 50 * 86400000).toISOString()
  const h = (name: string, acc: number, sl: number | null, qty: number, price: number, extra: Row = {}, sort = 0) => ({
    id: id(), user_id: uid, account_id: accounts[acc].id, sleeve_id: sl == null ? null : sleeves[sl].id, name, symbol: null, price_source: 'manual',
    currency: 'SAR', quantity: qty, price, price_updated_at: new Date().toISOString(), ibkr_conid: null, cost_basis: null, note: null, archived: false, zakatable: true,
    zakat_start: null, payout_freq: 'none', payout_next: null, payout_basis: 'rate', payout_rate: null, payout_per_unit: null, payout_nominal: null, maturity_date: null, sort, ...extra,
  })
  const holdings = [
    h('iShares MSCI World Islamic', 0, 0, 0, 0, { symbol: 'ISWD.L', price_source: 'yahoo', currency: 'USD' }, 1),
    h('صندوق الراجحي للتوزيعات الشهرية', 1, 5, 9200, 9.665, { price_updated_at: old, price_source: 'nav', symbol: '5885', payout_freq: 'monthly', payout_rate: 7.5, payout_next: iso(new Date(Date.now() + 12 * 86400000)), zakat_start: '2025-03-01' }, 2),
    h('صندوق الراجحي للتوزيعات الشهرية 2', 1, 5, 2300, 9.93, { payout_freq: 'monthly', payout_next: iso(new Date(Date.now() + 14 * 86400000)) }, 3),
    h('صكوك الحكومة 2029', 1, 3, 20, 985, { payout_freq: 'semiannual', payout_rate: 5.2, payout_nominal: 1000, payout_next: iso(new Date(Date.now() + 40 * 86400000)), maturity_date: '2029-06-30', zakat_start: '2026-01-15' }, 10),
    h('صندوق البلاد للذهب', 1, 7, 0, 21.3, { symbol: '9405.SR', price_source: 'yahoo' }, 4),
    h('برنامج الادخار: محفظة النمو', 2, 1, 1, 24850, {}, 5),
    h('برنامج الادخار: الدخل المتحفظ', 2, 3, 1, 23900, {}, 6),
    h('صندوق مرابحة', 1, 6, 1, 15000, {}, 7),
    h('حساب الطوارئ', 3, null, 1, 95000, {}, 8),
    h('مصرف الراجحي', 1, 2, 120, 98.4, { symbol: '1120.SR', price_source: 'yahoo', zakatable: false }, 9),
  ]
  const today = new Date()
  const snapshots = Array.from({ length: 40 }, (_, i) => {
    const d = new Date(today.getTime() - (39 - i) * 86400000)
    return { user_id: uid, snap_date: iso(d), total_sar: 150000 + i * 260 + Math.sin(i / 3) * 900, by_sleeve: {}, by_account: {} }
  })
  const ev = (title: string, kind: string, date: string, amount: number | null, recurrence = 'none', note: string | null = null) =>
    ({ id: id(), user_id: uid, title, kind, event_date: date, amount, recurrence, done: false, note })
  const events = [
    ev('المراجعة السنوية وإعادة التوازن', 'review', '2027-01-05', null, 'yearly', 'قارن الأوزان واحسب الزكاة'),
    ev('تجديد السلفة', 'advance', '2027-05-15', 250000, 'none', 'وزّعها على 6 أشهر'),
    ev('المكافأة السنوية', 'bonus', '2027-03-01', 105000, 'yearly', 'التاريخ تقديري'),
    ev('الزكاة السنوية', 'zakat', '2027-02-08', null),
    ev('اكتمال استحقاق برنامج الادخار', 'vesting', '2032-06-01', null),
  ]
  const settings = {
    income_method: 'value', income_profit_share: 100, income_fixed_monthly: null, income_transfer_day: 27, income_review_month: 1,
    income_start_year: /income-now/.test(typeof location !== 'undefined' ? location.search : '') ? new Date().getFullYear() : null, income_approved_annual: null, income_approved_year: null,
    user_id: typeof location !== 'undefined' && /viewer/.test(location.search) ? 'owner-user' : uid, monthly_income_target: 20000, withdrawal_rate: 4, safe_withdrawal_rate: 3.5, inflation_rate: 2.5, expected_return: 6.5,
    return_low: 5, return_high: 8, annual_contribution: 300000, contribution_growth: 4, birth_year: 1998, independence_year: 2038, glide_start_year: 2035,
    rebalance_band: 5, reserve_months: 24, guard_drawdown: 15, guard_cut: 10, guard_high_rate: 5, guard_low_rate: 3, include_mortgage: false,
    mortgage_monthly: 5029, mortgage_end_year: 2044, baseline_value: 150000, baseline_date: snapshots[0].snap_date, extra: {},
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
  return { plan_settings: [settings], sleeves, accounts, holdings, snapshots, events, transactions, fx_rates, ibkr_connection: [] as Row[], watchlist, portfolio_viewers }
}

export function createMockClient(): any {
  const db: Record<string, Row[]> = fixture()
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
      if (this.op === 'update') { rows.forEach((r, i) => { if (match(r)) rows[i] = { ...r, ...this.payload } }); out = rows.filter(match) }
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
    rpc: async () => ({ data: false, error: null }),
    functions: { invoke: async () => ({ data: { results: [{ prices: { updated: 2, failed: [] }, snapshot: {} }] }, error: null }) },
    channel: () => { const c: any = { on: () => c, subscribe: () => c }; return c },
    removeChannel: () => {},
  }
}
