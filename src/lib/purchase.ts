// Recording a purchase the owner made outside the app (from the roadmap, the deposit planner or a BuySheet) and starting to
// track it: a new holding with everything the catalog knows (price source, symbol or fund id, currency, fee, distributions,
// zakat method), or more units on the holding he already has, plus the 'deposit' transaction of that new money.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from './store'
import { holdingValue, rateOf } from './calc'
import { todayISO } from './format'
import { holdingMatches, zakatDefault, type AssetClass, type CatalogItem, type ZakatMethod } from './catalog'
import { isLumpSum, type ISODate } from './plan'
import { usePlan, ensureSpecialGoal, type SpecialGoal } from './usePlan'
import type { Goal, Holding, Region, Transaction } from './types'

export interface PurchaseInput {
  /** what was bought: a catalog item or one of the plan's own instruments; null = a free-form asset (name required) */
  item: CatalogItem | null
  /** where it belongs: the emergency fund, the income account, or a plan sleeve (key = plan sleeve key, or 'id:<sleeve id>') */
  scope: { kind: 'emergency' | 'treasury' | 'sleeve'; key?: string | null }
  /** add to this holding instead of creating one (e.g. InstrumentPick.holding) */
  holding?: Holding | null
  account_id: string | null
  /** SAR paid, fees included */
  amount: number
  units?: number | null
  /** unit price in `currency` (the instrument's currency by default) */
  price?: number | null
  currency?: string | null
  date?: ISODate
  /** name / symbol for a free-form asset (the catalog item's are used otherwise) */
  name?: string | null
  symbol?: string | null
  /** trailing distribution yield %, when known (MarketInputs.yields) */
  yieldPct?: number | null
  note?: string | null
}
export interface PurchaseResult {
  holding: Holding
  created: boolean
  /** an IBKR account: nothing was written, the next IBKR sync brings the position and its deposit */
  pendingSync?: boolean
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round6 = (v: number) => Math.round(v * 1e6) / 1e6
/** SAR per unit of the currency (London quotes in pence: GBp / GBX) */
const rateFor = (currency: string, fx: Record<string, number>) => (currency === 'GBp' || currency.toUpperCase() === 'GBX' ? rateOf('GBP', fx) / 100 : rateOf(currency, fx))
const SA_CLASSES: AssetClass[] = ['cash', 'money_market', 'savings_sukuk', 'murabaha', 'sukuk_sar', 'equity_sa', 'equity_direct', 'reit_sa', 'mixed_income']
function regionOf(cls: AssetClass | null): Region | null {
  if (!cls) return null
  if (SA_CLASSES.includes(cls)) return 'SA'
  if (cls === 'equity_us') return 'US'
  if (cls === 'equity_em') return 'EM'
  if (cls === 'sukuk_usd') return 'GCC'
  if (cls === 'equity_global' || cls === 'reit_global' || cls === 'gold') return 'GLOBAL'
  return null
}
/** the item's own zakat method, else the class default from the zakat guide */
function zakatOf(item: CatalogItem | null, cls: AssetClass | null): { method: ZakatMethod | null; ratio: number | null } {
  if (item?.zakat?.method) return { method: item.zakat.method, ratio: item.zakat.ratio ?? null }
  const g = zakatDefault(cls)
  return g ? { method: g.method, ratio: g.ratio } : { method: null, ratio: null }
}

/**
 * `record(input)` creates the holding (or tops up the matching one) and writes the 'deposit' transaction tied to it.
 * Goals for the emergency fund / income account are created when missing. Returns null (with a toast) when nothing was saved.
 */
export function usePurchase(): { record: (input: PurchaseInput) => Promise<PurchaseResult | null>; busy: boolean } {
  const store = useStore()
  const view = usePlan()
  const live = useRef({ store, view })
  live.current = { store, view }
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const [busy, setBusy] = useState(false)
  // what this hook wrote, until the store catches up (back-to-back purchases must not duplicate a goal or a holding)
  const wroteGoals = useRef<Goal[]>([])
  const wroteHoldings = useRef<Record<string, Holding>>({})
  useEffect(() => { wroteGoals.current = [] }, [store.goals])
  useEffect(() => { wroteHoldings.current = {} }, [store.holdings])

  const record = useCallback((input: PurchaseInput): Promise<PurchaseResult | null> => {
    const run = queue.current.then(async () => {
      const { store: st, view: v } = live.current
      const { upsert, insertMany, notify, readOnly, fx, accounts } = st
      const goals = [...wroteGoals.current, ...st.goals]
      const holdings = [...Object.values(wroteHoldings.current), ...st.holdings.filter((h) => !wroteHoldings.current[h.id])]
      if (readOnly) { notify('للعرض فقط'); return null }
      const amount = round2(Number(input.amount) || 0)
      if (!(amount > 0)) { notify('اكتب مبلغ الشراء'); return null }
      const item = input.item
      const name = (item?.name ?? input.name ?? '').trim()
      if (!name) { notify('اختر الأداة أو اكتب اسمها'); return null }
      setBusy(true)
      try {
        // ---- where it goes ----
        let sleeveId: string | null = null
        let goalId: string | null = null
        let cls: AssetClass | null = item?.class ?? null
        if (input.scope.kind === 'sleeve') {
          const key = String(input.scope.key ?? '').replace(/^sleeve:/, '')
          sleeveId = key.startsWith('id:') ? key.slice(3) : v.ctx?.map[key] ?? null
          if (!sleeveId) { notify('هذه الطبقة لم تُنشأ في محفظتك بعد؛ أعد المحاولة بعد لحظات'); return null }
          cls = cls ?? v.ctx?.sleeveClass[sleeveId] ?? null
        } else {
          const kind: SpecialGoal = input.scope.kind === 'emergency' ? 'emergency' : 'income'
          const p = v.progress
          const goal = await ensureSpecialGoal({ goals, upsert }, kind, kind === 'emergency' ? p?.emergency.target ?? 0 : p?.treasury.target ?? 0)
          if (!goal) return null
          if (!goals.some((g) => g.id === goal.id)) wroteGoals.current = [...wroteGoals.current, goal]
          goalId = goal.id
        }

        // ---- the holding to add to: the one given, else the same instrument in the same place (and account) ----
        const same = (h: Holding) => !h.archived && (sleeveId ? h.sleeve_id === sleeveId && !h.goal_id : h.goal_id === goalId)
          && (!input.account_id || !h.account_id || h.account_id === input.account_id)
        const given = input.holding ? holdings.find((h) => h.id === input.holding!.id) ?? input.holding : null
        // IBKR accounts sync positions and deposits by themselves: writing here would count the money twice
        const ibkrAccount = accounts.find((a) => a.id === (given?.account_id ?? input.account_id))?.is_ibkr ?? false
        if (given?.price_source === 'ibkr' || ibkrAccount) {
          notify('حساب IBKR يتحدث تلقائياً؛ يظهر الشراء مع المزامنة القادمة')
          return given ? { holding: given, created: false, pendingSync: true } : null
        }
        const existing = given ?? (item
          ? holdings.filter((h) => same(h) && holdingMatches(h, item)).sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))[0] ?? null
          : input.symbol ? holdings.find((h) => same(h) && (h.symbol ?? '').toUpperCase() === input.symbol!.toUpperCase()) ?? null : null)

        // ---- units and price ----
        const currency = input.currency ?? existing?.currency ?? item?.currency ?? 'SAR'
        const rate = rateFor(currency, fx)
        let units = input.units != null && Number(input.units) > 0 ? Number(input.units) : null
        let price = input.price != null && Number(input.price) > 0 ? Number(input.price) : null
        if (units && !price) price = amount / units / rate
        if (price && !units) units = amount / (price * rate)
        const source: Holding['price_source'] = existing?.price_source ?? item?.source ?? 'manual'
        const lump = existing ? isLumpSum(existing) || (existing.price_source === 'manual' && Number(existing.quantity) === 1) : source === 'manual' && !units
        if (!lump && !units) {
          if (existing && Number(existing.price) > 0) { price = Number(existing.price); units = amount / (price * rateFor(existing.currency, fx)) } else {
            notify('اكتب عدد الوحدات أو سعر الوحدة')
            return null
          }
        }
        const now = new Date().toISOString()
        const day = input.date ?? todayISO()
        let saved: Holding | null
        let created = false
        if (existing) {
          const cost = round2((Number(existing.cost_basis) || 0) + amount)
          if (lump) {
            saved = await upsert<Holding>('holdings', { id: existing.id, price: round2(Number(existing.price) + amount / rateFor(existing.currency, fx)), price_updated_at: now, cost_basis: cost } as unknown as Holding)
          } else {
            const patch: Partial<Holding> & { id: string } = { id: existing.id, quantity: round6(Number(existing.quantity) + units!), cost_basis: cost }
            if (existing.price_source === 'manual' && price) Object.assign(patch, { price, price_updated_at: now })
            saved = await upsert<Holding>('holdings', patch as unknown as Holding)
          }
        } else {
          const z = zakatOf(item, cls)
          const payout = item?.distribution === 'dist' && item.pay_freq && item.pay_freq !== 'none' ? item.pay_freq : 'none'
          const sort = Math.max(0, ...holdings.map((h) => Number(h.sort) || 0)) + 1
          const row: Omit<Holding, 'id' | 'user_id'> = {
            account_id: input.account_id, sleeve_id: sleeveId, goal_id: goalId, goal_bucket: goalId ? 'cash' : null,
            name, symbol: item ? (item.source === 'nav' ? item.fund_id ?? item.symbol : item.symbol ?? item.fund_id) : input.symbol ?? null,
            price_source: source, currency, quantity: lump ? 1 : round6(units!), price: lump ? round2(amount / rate) : price!,
            price_updated_at: now, ibkr_conid: null, cost_basis: amount, fee_pct: item?.ter ?? null, purification_pct: null,
            region: regionOf(cls), note: input.note ?? null, archived: false,
            zakatable: !(z.method === 'exempt' || z.method === 'paid_by_entity' || z.method === 'income_only'),
            zakat_start: null, payout_freq: payout, payout_next: null, payout_basis: 'rate',
            payout_rate: payout !== 'none' && input.yieldPct != null && input.yieldPct > 0 ? round2(input.yieldPct) : null,
            payout_per_unit: null, payout_nominal: null, maturity_date: null, sort,
            update_every_days: null, catalog_id: item?.id ?? null, profile: null, zakat_method: z.method, zakat_ratio: z.ratio,
          }
          saved = await upsert<Holding>('holdings', row as unknown as Holding)
          created = !!saved
        }
        if (!saved) return null
        wroteHoldings.current = { ...wroteHoldings.current, [saved.id]: saved }

        // ---- the money: new money into this holding ----
        const tx: Partial<Transaction> = {
          tx_date: day, kind: 'deposit', amount_sar: amount, holding_id: saved.id, account_id: saved.account_id ?? input.account_id,
          sleeve_id: saved.sleeve_id ?? null, quantity: lump ? null : round6(units!), price: lump ? null : price, currency: 'SAR', source: 'planner',
          note: input.note ?? (goalId ? `إيداع لهدف: ${input.scope.kind === 'emergency' ? 'صندوق الطوارئ' : 'حساب الدخل'}` : `شراء ${name}`),
        }
        if (!(await insertMany('transactions', [tx as Record<string, unknown>]))) return null
        notify(created ? 'سُجّل الشراء وبدأت متابعته' : `أُضيف الشراء إلى «${saved.name}»`)
        return { holding: saved, created }
      } finally {
        setBusy(false)
      }
    })
    queue.current = run.catch(() => undefined)
    return run
  }, [])

  return useMemo(() => ({ record, busy }), [record, busy])
}
