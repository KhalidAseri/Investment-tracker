// React side of «الخطة»: the active plan with its progress, actions and advice (roadmap, structure, checks, deposit split),
// and the operations that change plans and money.
// The active phase's effective targets are applied to the sleeves by the store (StoreProvider) on load, on plan or value
// changes and when the date rolls over.
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useStore, type Table } from './store'
import { rateOf } from './calc'
import { todayISO } from './format'
import {
  exportPlan, isLumpSum, normalizePlan, planActions, planContext, planFileName, pruneDismissed,
  type ISODate, type PlanAction, type PlanContext, type PlanDoc, type PlanProgress, type PlanReview, type TreasurySaleLine,
} from './plan'
import {
  allocateDeposit, buildRoadmap, planChecks, structureScore,
  type DepositPlan, type PlanCheck, type RoadmapItem,
} from './advisor'
import { EMPTY_MARKET, type MarketInputs } from './marketTypes'
import type { Goal, GoalKind, Holding, PlanRow, Transaction } from './types'

export interface PlanView {
  plans: PlanRow[]
  active: PlanRow | null
  /** the active plan's document (normalised), null without an active plan */
  doc: PlanDoc | null
  /** null until settings are loaded */
  ctx: PlanContext | null
  progress: PlanProgress | null
  /** what to do now, most urgent first (dismissed and, for viewers, owner-only items removed); includes «الأولوية التالية» */
  actions: PlanAction[]
  today: ISODate
  /** the build order with what each item needs and the instrument to buy (empty without a plan) */
  roadmap: RoadmapItem[]
  /** how complete the structure is (null without a plan) */
  structure: { pct: number; done: number; total: number } | null
  /** the plan compared with the designer's heuristics, problems first (empty without a plan) */
  checks: PlanCheck[]
  /** how to split a deposit (null until settings are loaded); market defaults to the one usePlan was given */
  allocate: (amount: number, market?: MarketInputs, opts?: { reserveFirst?: boolean }) => DepositPlan | null
  /** the market data the advice above used */
  market: MarketInputs
}

/**
 * The active plan with its context, actions and advice. Pass real market data (market.ts hooks) for prices, units and
 * yield-based choices; without it the advice still works (instruments chosen by the plan and the catalog).
 */
export function usePlan(market: MarketInputs = EMPTY_MARKET): PlanView {
  const { plans, settings, sleeves, accounts, holdings, transactions, snapshots, goals, watchlist, ibkr, fx, readOnly } = useStore()
  const today = todayISO()
  return useMemo(() => {
    const active = plans.find((p) => p.is_active) ?? null
    const doc = active ? normalizePlan(active.doc, today) : null
    const ctx = settings
      ? planContext({ doc, today, settings, sleeves, accounts, holdings, transactions, snapshots, goals, watchlist, ibkr, fx, readOnly })
      : null
    const roadmap = ctx && doc ? buildRoadmap(ctx, market) : []
    const structure = ctx && doc ? structureScore(ctx) : null
    const checks = doc ? planChecks(doc, ctx) : []
    const allocate: PlanView['allocate'] = (amount, m = market, opts) => (ctx ? allocateDeposit(ctx, amount, m, opts) : null)
    return {
      plans, active, doc, ctx, progress: ctx?.progress ?? null, actions: ctx ? planActions(ctx, { roadmap }) : [], today,
      roadmap, structure, checks, allocate, market,
    }
  }, [plans, settings, sleeves, accounts, holdings, transactions, snapshots, goals, watchlist, ibkr, fx, readOnly, today, market])
}

export interface PlanOps {
  /** saves a plan document (the active plan when no id is given; creates an active plan when there is none) */
  save: (doc: PlanDoc, id?: string) => Promise<PlanRow | null>
  create: (doc: PlanDoc, opts?: { activate?: boolean }) => Promise<PlanRow | null>
  activate: (id: string) => Promise<boolean>
  rename: (id: string, name: string) => Promise<boolean>
  remove: (id: string) => Promise<void>
  /** 'replace' = into the active plan, 'add' = a new inactive plan. map = confirmed plan key -> sleeve id (null = create) */
  importDoc: (doc: PlanDoc, mode: 'replace' | 'add', map?: Record<string, string | null>) => Promise<PlanRow | null>
  markStep: (key: string, done?: boolean, date?: ISODate) => Promise<boolean>
  dismiss: (key: string) => Promise<boolean>
  /** sells holdings into the income account (from treasurySalePlan) */
  sell: (lines: TreasurySaleLine[], date?: ISODate) => Promise<boolean>
  /** monthly income from the income account to the owner's account (tx 'income') */
  withdraw: (amount: number, date?: ISODate) => Promise<boolean>
  topUpEmergency: (amount: number, date?: ISODate) => Promise<boolean>
  /** adds money to the income account: a distribution or a transfer ('transfer'), or new money ('deposit') */
  toTreasury: (amount: number, date?: ISODate, note?: string | null, kind?: 'transfer' | 'deposit') => Promise<boolean>
  recordReview: (review: PlanReview) => Promise<boolean>
  /** JSON text and file name of a plan (the active one by default) */
  exportFile: (id?: string) => { name: string; text: string } | null
}

const round2 = (v: number) => Math.round(v * 100) / 100
export type SpecialGoal = Exclude<GoalKind, 'goal'>
export const GOAL_NAME: Record<SpecialGoal, string> = { emergency: 'صندوق الطوارئ', income: 'حساب الدخل' }
export const CASH_NAME: Record<SpecialGoal, string> = { emergency: 'نقد صندوق الطوارئ', income: 'نقد حساب الدخل' }

/**
 * The emergency-fund or income-account goal, created when missing (used by usePlanOps and usePurchase).
 * `target` is written on creation only (the emergency target or the income account's target from the plan).
 */
export async function ensureSpecialGoal(
  deps: { goals: Goal[]; upsert: <T extends Record<string, any>>(table: Table, row: T) => Promise<T | null> },
  kind: SpecialGoal, target: number,
): Promise<Goal | null> {
  const found = deps.goals.find((g) => g.kind === kind && !g.archived)
  if (found) return found
  return deps.upsert<Goal>('goals', {
    name: GOAL_NAME[kind], kind, target_amount: Math.round(Math.max(0, target) || 0), target_date: null, expected_return: 0,
    allocation: [{ key: 'cash', name: 'سيولة', weight: 100 }], priority: 1, note: null, archived: false, sort: kind === 'emergency' ? -2 : -1,
  } as unknown as Goal)
}

export function usePlanOps(): PlanOps {
  const store = useStore()
  const { upsert, insertMany, remove: removeRow, notify, readOnly } = store
  const view = usePlan()
  // latest values for async code; written docs are remembered until the store catches up
  const live = useRef({ store, view })
  live.current = { store, view }
  const written = useRef<Record<string, PlanDoc>>({})
  const writtenHoldings = useRef<Record<string, Holding>>({})
  useEffect(() => { written.current = {} }, [store.plans])
  useEffect(() => { writtenHoldings.current = {} }, [store.holdings])
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const serial = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(fn, fn)
    queue.current = run.catch(() => undefined)
    return run
  }, [])

  return useMemo<PlanOps>(() => {
    const guard = () => { if (readOnly) { notify('للعرض فقط'); return false } return true }
    const docOf = (row: PlanRow) => written.current[row.id] ?? normalizePlan(row.doc)

    const writeDoc = async (id: string, doc: PlanDoc, extra: Partial<PlanRow> = {}) => {
      const saved = await upsert<PlanRow>('plans', { id, name: doc.name, doc, ...extra } as PlanRow)
      if (saved) written.current[id] = doc
      return saved
    }
    /** read-modify-write of one plan document, serialised */
    const update = (mutate: (d: PlanDoc) => PlanDoc | null, id?: string) => serial(async () => {
      const rows = live.current.store.plans
      const row = id ? rows.find((r) => r.id === id) : rows.find((r) => r.is_active)
      if (!row) { notify('لا توجد خطة نشطة'); return null }
      const next = mutate(docOf(row))
      if (!next) return null
      return writeDoc(row.id, next)
    })
    const deactivateOthers = async (keep: string | null) => {
      for (const r of live.current.store.plans.filter((p) => p.is_active && p.id !== keep)) {
        await upsert<PlanRow>('plans', { id: r.id, is_active: false } as PlanRow)
      }
    }

    const create: PlanOps['create'] = (doc, opts = {}) => serial(async () => {
      if (!guard()) return null
      const d = doc
      if (opts.activate) await deactivateOthers(null)
      const row = await upsert<PlanRow>('plans', { name: d.name, is_active: !!opts.activate, doc: d } as unknown as PlanRow)
      if (row) { written.current[row.id] = d; notify(opts.activate ? 'حُفظت الخطة وأصبحت نشطة' : 'حُفظت الخطة') }
      return row
    })

    const save: PlanOps['save'] = async (doc, id) => {
      if (!guard()) return null
      const target = id ?? live.current.store.plans.find((p) => p.is_active)?.id
      if (!target) return create(doc, { activate: true })
      const row = await update(() => doc, target)
      if (row) notify('حُفظت الخطة')
      return row
    }

    const activate: PlanOps['activate'] = (id) => serial(async () => {
      if (!guard()) return false
      const row = live.current.store.plans.find((p) => p.id === id)
      if (!row) return false
      await deactivateOthers(id)
      const saved = await writeDoc(id, docOf(row), { is_active: true })
      if (saved) notify('أصبحت الخطة نشطة')
      return !!saved
    })

    const rename: PlanOps['rename'] = async (id, name) => {
      if (!guard() || !name.trim()) return false
      return !!(await update((d) => ({ ...d, name: name.trim() }), id))
    }

    const remove: PlanOps['remove'] = async (id) => {
      if (!guard()) return
      await serial(() => removeRow('plans', id))
      notify('حُذفت الخطة')
    }

    const importDoc: PlanOps['importDoc'] = async (doc, mode, map) => {
      if (!guard()) return null
      const { sleeves, plans } = live.current.store
      const active = plans.find((p) => p.is_active) ?? null
      const ids = new Set(sleeves.map((s) => s.id))
      const prev = active ? docOf(active).sleeve_map ?? {} : {}
      const sleeve_map: Record<string, string> = {}
      for (const s of doc.sleeves) {
        const chosen = map && s.key in map ? map[s.key] : prev[s.key]
        if (chosen && ids.has(chosen)) sleeve_map[s.key] = chosen
      }
      const next: PlanDoc = { ...doc, sleeve_map, state: { ...doc.state, dismissed: {} } }
      if (mode === 'replace' && active) {
        const row = await update(() => next, active.id)
        if (row) notify('استُبدلت الخطة النشطة')
        return row
      }
      return create(next, { activate: mode === 'replace' })
    }

    const markStep: PlanOps['markStep'] = async (key, done = true, date) => {
      if (!guard()) return false
      const day = date ?? todayISO()
      const row = await update((d) => ({ ...d, steps: d.steps.map((s) => (s.key === key ? { ...s, done_at: done ? day : null } : s)) }))
      if (row) notify(done ? 'أُنجزت الخطوة' : 'أُعيدت الخطوة')
      return !!row
    }

    const dismiss: PlanOps['dismiss'] = async (key) => {
      if (!guard()) return false
      const day = todayISO()
      return !!(await update((d) => ({ ...d, state: { ...d.state, dismissed: { ...pruneDismissed(d.state.dismissed, day), [key]: day } } })))
    }

    // ---------- money ----------
    const ensureGoal = (kind: SpecialGoal): Promise<Goal | null> => {
      const p = live.current.view.progress
      return ensureSpecialGoal({ goals: live.current.store.goals, upsert }, kind, kind === 'emergency' ? p?.emergency.target ?? 0 : p?.treasury.target ?? 0)
    }
    const holdingNow = (h: Holding) => writtenHoldings.current[h.id] ?? live.current.store.holdings.find((x) => x.id === h.id) ?? h
    const saveHolding = async (patch: Partial<Holding> & { id?: string }) => {
      const row = await upsert<Holding>('holdings', patch as unknown as Holding)
      if (row) writtenHoldings.current[row.id] = row
      return row
    }
    /**
     * The holding that carries the goal's money: its cash (lump-sum) holding, else its largest holding,
     * else a new «نقد …» lump-sum holding.
     */
    const goalHolding = async (kind: SpecialGoal, accountId: string | null): Promise<Holding | null> => {
      const goal = await ensureGoal(kind)
      if (!goal) return null
      const { fx } = live.current.store
      const hs = live.current.store.holdings.filter((h) => h.goal_id === goal.id && !h.archived).map(holdingNow)
      const cash = hs.find((h) => h.price_source === 'manual' && Number(h.quantity) === 1)
        ?? [...hs].filter((h) => h.price_source !== 'ibkr').sort((a, b) => Number(b.quantity) * Number(b.price) * rateOf(b.currency, fx) - Number(a.quantity) * Number(a.price) * rateOf(a.currency, fx))[0]
      if (cash) return cash
      return saveHolding({
        name: CASH_NAME[kind], account_id: accountId, sleeve_id: null, symbol: null, price_source: 'manual', currency: 'SAR', quantity: 1, price: 0,
        price_updated_at: new Date().toISOString(), cost_basis: 0, note: null, archived: false, zakatable: true, goal_id: goal.id, goal_bucket: 'cash',
        payout_freq: 'none', payout_basis: 'rate', sort: 0,
      })
    }
    /** adds (or removes) riyals: a lump-sum holding changes its value, a unit holding its units */
    const adjust = async (h0: Holding, delta: number) => {
      const { fx } = live.current.store
      const h = holdingNow(h0)
      if (h.price_source === 'ibkr') return h
      const rate = rateOf(h.currency, fx)
      const cost = h.cost_basis == null ? null : round2(Math.max(0, Number(h.cost_basis) + delta))
      if (h.price_source === 'manual' && Number(h.quantity) === 1) {
        return saveHolding({ id: h.id, price: round2(Math.max(0, Number(h.price) + delta / rate)), price_updated_at: new Date().toISOString(), cost_basis: cost })
      }
      const unit = Number(h.price) * rate
      if (!(unit > 0)) return h
      return saveHolding({ id: h.id, quantity: Math.max(0, Number(h.quantity) + delta / unit), cost_basis: cost })
    }
    const tx = (t: Partial<Transaction>) => ({ currency: 'SAR', source: 'planner', quantity: null, price: null, sleeve_id: null, account_id: null, holding_id: null, note: null, ...t })

    const sell: PlanOps['sell'] = (lines, date) => serial(async () => {
      if (!guard()) return false
      const day = date ?? todayISO()
      const valid = lines.filter((l) => l.amount > 0)
      if (!valid.length) return false
      const total = round2(valid.reduce((a, l) => a + l.amount, 0))
      const cash = await goalHolding('income', valid[0].holding.account_id)
      if (!cash) return false
      const rows: Record<string, unknown>[] = []
      for (const l of valid) {
        const h = l.holding
        rows.push(tx({ tx_date: day, kind: 'sell', amount_sar: round2(l.amount), holding_id: h.id, account_id: h.account_id, sleeve_id: h.sleeve_id, quantity: l.units, price: Number(h.price), note: 'بيع لحساب الدخل' }))
        // leaves the main portfolio: performance counts it as money out, not as a loss
        rows.push(tx({ tx_date: day, kind: 'transfer', amount_sar: -round2(l.amount), holding_id: h.id, account_id: h.account_id, sleeve_id: h.sleeve_id, note: 'إلى حساب الدخل' }))
      }
      rows.push(tx({ tx_date: day, kind: 'transfer', amount_sar: total, holding_id: cash.id, account_id: cash.account_id, note: 'من المحفظة إلى حساب الدخل' }))
      if (!(await insertMany('transactions', rows))) return false
      const { fx } = live.current.store
      for (const l of valid) {
        const h = holdingNow(l.holding)
        if (h.price_source === 'ibkr') continue // the next IBKR sync brings the new position
        const value = Number(h.quantity) * Number(h.price) * rateOf(h.currency, fx)
        const share = value > 0 ? Math.min(1, l.amount / value) : 0
        // cost basis falls in proportion to what was sold
        const cost = h.cost_basis == null ? null : round2(Number(h.cost_basis) * (1 - share))
        if (isLumpSum(h) || l.units == null) {
          await saveHolding({ id: h.id, price: round2(Math.max(0, Number(h.price) - l.amount / rateOf(h.currency, fx))), price_updated_at: new Date().toISOString(), cost_basis: cost })
        } else {
          await saveHolding({ id: h.id, quantity: Math.max(0, Number(h.quantity) - l.units), cost_basis: cost })
        }
      }
      await adjust(cash, total)
      notify('سُجّل البيع ونُقل المبلغ إلى حساب الدخل')
      return true
    })

    const withdraw: PlanOps['withdraw'] = (amount, date) => serial(async () => {
      if (!guard() || !(amount > 0)) return false
      const cash = await goalHolding('income', null)
      if (!cash) return false
      const ok = await insertMany('transactions', [tx({ tx_date: date ?? todayISO(), kind: 'income', amount_sar: round2(amount), holding_id: cash.id, account_id: cash.account_id, note: 'الدخل الشهري من حساب الدخل' })])
      if (!ok) return false
      await adjust(cash, -amount)
      notify('سُجّل تحويل الدخل الشهري')
      return true
    })

    const topUpEmergency: PlanOps['topUpEmergency'] = (amount, date) => serial(async () => {
      if (!guard() || !(amount > 0)) return false
      // no emergency goal yet: the fund is the excluded accounts; add to their cash holding so the total stays whole
      const { goals, accounts, holdings, fx } = live.current.store
      const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
      const outside = goals.some((g) => g.kind === 'emergency' && !g.archived) ? null
        : holdings.filter((h) => !h.archived && !h.goal_id && h.account_id && excluded.has(h.account_id) && h.price_source === 'manual' && Number(h.quantity) === 1)
          .sort((a, b) => Number(b.price) * rateOf(b.currency, fx) - Number(a.price) * rateOf(a.currency, fx))[0] ?? null
      const cash = outside ?? await goalHolding('emergency', null)
      if (!cash) return false
      const ok = await insertMany('transactions', [tx({ tx_date: date ?? todayISO(), kind: 'deposit', amount_sar: round2(amount), holding_id: cash.id, account_id: cash.account_id, note: 'إيداع لهدف: صندوق الطوارئ' })])
      if (!ok) return false
      await adjust(cash, amount)
      notify('أُضيف المبلغ إلى صندوق الطوارئ')
      return true
    })

    const toTreasury: PlanOps['toTreasury'] = (amount, date, note, kind = 'transfer') => serial(async () => {
      if (!guard() || !(amount > 0)) return false
      const cash = await goalHolding('income', null)
      if (!cash) return false
      const ok = await insertMany('transactions', [tx({ tx_date: date ?? todayISO(), kind, amount_sar: round2(amount), holding_id: cash.id, account_id: cash.account_id, note: note || (kind === 'deposit' ? 'إيداع لهدف: حساب الدخل' : 'إلى حساب الدخل') })])
      if (!ok) return false
      await adjust(cash, amount)
      notify('أُضيف المبلغ إلى حساب الدخل')
      return true
    })

    const recordReview: PlanOps['recordReview'] = async (review) => {
      if (!guard()) return false
      const row = await update((d) => {
        const reviews = [...d.reviews.filter((r) => r.year !== review.year), review].sort((a, b) => a.year - b.year)
        // the yearly review step of that year counts as done
        const steps = d.steps.map((s) => (s.recurring === 'yearly' && s.due && Number(s.due.slice(5, 7)) === d.rules.review_month && !(s.done_at && s.done_at.slice(0, 4) >= String(review.year))
          ? { ...s, done_at: review.date } : s))
        const state = review.income_annual != null ? { ...d.state, income_year: review.year, income_annual: review.income_annual } : d.state
        return { ...d, reviews, steps, state }
      })
      if (row) notify('حُفظت المراجعة السنوية')
      return !!row
    }

    const exportFile: PlanOps['exportFile'] = (id) => {
      const { plans, sleeves } = live.current.store
      const row = id ? plans.find((p) => p.id === id) : plans.find((p) => p.is_active)
      if (!row) return null
      const doc = docOf(row)
      return { name: planFileName(doc), text: exportPlan(doc, sleeves) }
    }

    return { save, create, activate, rename, remove, importDoc, markStep, dismiss, sell, withdraw, topUpEmergency, toTreasury, recordReview, exportFile }
  }, [upsert, insertMany, removeRow, notify, readOnly, serial])
}
