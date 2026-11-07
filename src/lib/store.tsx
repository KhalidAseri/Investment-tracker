import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Account, Fx, Goal, Holding, IbkrConnection, IncomeStream, MoneyEvent, Obligation, OtherAsset, PlanSettings, Sleeve, Snapshot, Transaction, WatchItem } from './types'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type Table = 'sleeves' | 'accounts' | 'holdings' | 'events' | 'transactions' | 'watchlist' | 'income_streams' | 'obligations' | 'goals' | 'other_assets'

interface Store {
  session: Session | null
  ready: boolean
  loading: boolean
  error: string | null
  settings: PlanSettings | null
  sleeves: Sleeve[]
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  events: MoneyEvent[]
  snapshots: Snapshot[]
  watchlist: WatchItem[]
  streams: IncomeStream[]
  obligations: Obligation[]
  goals: Goal[]
  otherAssets: OtherAsset[]
  /** signed in, no plan yet, not a viewer: show the first-run questions */
  needsSetup: boolean
  createPlan: (payload: Record<string, unknown>) => Promise<boolean>
  /** true when signed in as an invited viewer of someone else's portfolio */
  readOnly: boolean
  fx: Fx
  fxUpdatedAt: string | null
  ibkr: IbkrConnection | null
  save: SaveState
  refreshing: boolean
  toast: string | null
  notify: (msg: string) => void
  updateSettings: (patch: Partial<PlanSettings>) => void
  upsert: <T extends Record<string, any>>(table: Table, row: T) => Promise<T | null>
  insertMany: (table: Table, rows: Record<string, unknown>[]) => Promise<boolean>
  remove: (table: Table, id: string) => Promise<void>
  reload: () => Promise<boolean>
  refreshMarket: (mode?: 'all' | 'prices' | 'ibkr') => Promise<{ ok: boolean; message: string }>
  saveIbkr: (queryId: string, token: string) => Promise<boolean>
  clearIbkr: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)
export const useStore = () => {
  const v = useContext(Ctx)
  if (!v) throw new Error('store missing')
  return v
}

const byKey = <T,>(rows: T[], key: keyof T) => [...rows].sort((a, b) => Number(a[key] ?? 0) - Number(b[key] ?? 0))

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<PlanSettings | null>(null)
  const [sleeves, setSleeves] = useState<Sleeve[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [events, setEvents] = useState<MoneyEvent[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [watchlist, setWatchlist] = useState<WatchItem[]>([])
  const [streams, setStreams] = useState<IncomeStream[]>([])
  const [obligations, setObligations] = useState<Obligation[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [otherAssets, setOtherAssets] = useState<OtherAsset[]>([])
  const [needsSetup, setNeedsSetup] = useState(false)
  const [fx, setFx] = useState<Fx>({ SAR: 1, USD: 3.75 })
  const [fxUpdatedAt, setFxUpdatedAt] = useState<string | null>(null)
  const [ibkr, setIbkr] = useState<IbkrConnection | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const pending = useRef(0)
  const settingsPatch = useRef<Partial<PlanSettings>>({})
  const settingsTimer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const begin = () => { pending.current++; setSave('saving') }
  const end = (ok: boolean) => {
    pending.current = Math.max(0, pending.current - 1)
    if (!ok) setSave('error')
    else if (pending.current === 0) setSave('saved')
  }

  // ---------- auth ----------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // ---------- load ----------
  const reload = useCallback(async (): Promise<boolean> => {
    const [st, sl, ac, ho, tx, ev, sn, fr, ib, wl, is, ob, go, oa] = await Promise.all([
      supabase.from('plan_settings').select('*').maybeSingle(),
      supabase.from('sleeves').select('*'),
      supabase.from('accounts').select('*'),
      supabase.from('holdings').select('*'),
      supabase.from('transactions').select('*').order('tx_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
      supabase.from('events').select('*').order('event_date'),
      supabase.from('snapshots').select('snap_date,total_sar,by_sleeve,by_account').order('snap_date'),
      supabase.from('fx_rates').select('*'),
      supabase.from('ibkr_connection').select('user_id,query_id,last_sync_at,last_status,last_message').maybeSingle(),
      supabase.from('watchlist').select('*'),
      supabase.from('income_streams').select('*'),
      supabase.from('obligations').select('*'),
      supabase.from('goals').select('*'),
      supabase.from('other_assets').select('*'),
    ])
    const firstError = [st, sl, ac, ho, tx, ev, sn, fr].find((r) => r.error)?.error
    if (firstError) throw new Error(firstError.message)
    setSettings(st.data as PlanSettings | null)
    setSleeves(byKey((sl.data ?? []) as Sleeve[], 'sort'))
    setAccounts(byKey((ac.data ?? []) as Account[], 'sort'))
    setHoldings(byKey((ho.data ?? []) as Holding[], 'sort'))
    setTransactions((tx.data ?? []) as Transaction[])
    setEvents((ev.data ?? []) as MoneyEvent[])
    setSnapshots((sn.data ?? []) as Snapshot[])
    setWatchlist(byKey((wl.data ?? []) as WatchItem[], 'sort'))
    setStreams(byKey((is.data ?? []) as IncomeStream[], 'sort'))
    setObligations(byKey((ob.data ?? []) as Obligation[], 'sort'))
    setGoals(byKey((go.data ?? []) as Goal[], 'sort'))
    setOtherAssets(byKey((oa.data ?? []) as OtherAsset[], 'sort'))
    const rates: Fx = {}
    let latest: string | null = null
    for (const r of fr.data ?? []) {
      rates[r.currency] = Number(r.rate_to_sar)
      if (r.updated_at && (!latest || r.updated_at > latest)) latest = r.updated_at
    }
    setFx({ SAR: 1, USD: 3.75, ...rates })
    setFxUpdatedAt(latest)
    setIbkr((ib.data as IbkrConnection) ?? null)
    return !!st.data
  }, [])

  useEffect(() => {
    if (!session) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const hasPlan = await reload()
        if (!hasPlan) {
          const { data: viewerOnly } = await supabase.rpc('is_viewer_only')
          if (!cancelled) setNeedsSetup(!viewerOnly)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [session?.user?.id, reload])

  // ---------- realtime: other devices' edits appear here ----------
  const ownerId = settings?.user_id ?? session?.user?.id ?? null
  const readOnly = !!(settings && session && settings.user_id !== session.user.id)
  useEffect(() => {
    if (!session || !ownerId) return
    const uid = ownerId
    const apply = <T extends { id: string }>(set: React.Dispatch<React.SetStateAction<T[]>>, sortKey?: keyof T) =>
      (p: { eventType: string; new: unknown; old: unknown }) => {
        set((rows) => {
          if (p.eventType === 'DELETE') return rows.filter((r) => r.id !== (p.old as T).id)
          const row = p.new as T
          const next = rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [...rows, row]
          return sortKey ? byKey(next, sortKey) : next
        })
      }
    const filter = `user_id=eq.${uid}`
    const ch = supabase
      .channel('masar-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holdings', filter }, apply<Holding>(setHoldings, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sleeves', filter }, apply<Sleeve>(setSleeves, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts', filter }, apply<Account>(setAccounts, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter }, apply<MoneyEvent>(setEvents))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'watchlist', filter }, apply<WatchItem>(setWatchlist, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'income_streams', filter }, apply<IncomeStream>(setStreams, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'obligations', filter }, apply<Obligation>(setObligations, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'goals', filter }, apply<Goal>(setGoals, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'other_assets', filter }, apply<OtherAsset>(setOtherAssets, 'sort'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter }, (p) => {
        setTransactions((rows) => {
          if (p.eventType === 'DELETE') return rows.filter((r) => r.id !== (p.old as Transaction).id)
          const row = p.new as Transaction
          const next = rows.some((r) => r.id === row.id) ? rows.map((r) => (r.id === row.id ? row : r)) : [row, ...rows]
          return next.sort((a, b) => b.tx_date.localeCompare(a.tx_date))
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plan_settings', filter }, (p) => {
        if (p.eventType !== 'DELETE' && Object.keys(settingsPatch.current).length === 0) setSettings(p.new as PlanSettings)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'snapshots', filter }, (p) => {
        if (p.eventType === 'DELETE') return
        const row = p.new as Snapshot
        setSnapshots((rows) => [...rows.filter((r) => r.snap_date !== row.snap_date), row].sort((a, b) => a.snap_date.localeCompare(b.snap_date)))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [session?.user?.id, ownerId])

  // ---------- mutations ----------
  const updateSettings = useCallback((patch: Partial<PlanSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s))
    if (readOnly) return
    settingsPatch.current = { ...settingsPatch.current, ...patch }
    setSave('saving')
    window.clearTimeout(settingsTimer.current)
    settingsTimer.current = window.setTimeout(async () => {
      const body = settingsPatch.current
      settingsPatch.current = {}
      begin()
      const { error } = await supabase.from('plan_settings').update(body).eq('user_id', session?.user.id ?? '')
      end(!error)
      if (error) notify('تعذّر حفظ الإعداد؛ تحقق من الاتصال')
    }, 650)
  }, [session?.user?.id, notify, readOnly])

  const setterFor = (table: Table): React.Dispatch<React.SetStateAction<any[]>> =>
    ({ sleeves: setSleeves, accounts: setAccounts, holdings: setHoldings, events: setEvents, transactions: setTransactions, watchlist: setWatchlist, income_streams: setStreams, obligations: setObligations, goals: setGoals, other_assets: setOtherAssets } as const)[table] as any

  const upsert = useCallback(async <T extends Record<string, any>>(table: Table, row: T): Promise<T | null> => {
    begin()
    const clean = { ...row } as Record<string, unknown>
    delete clean.user_id
    delete clean.created_at
    delete clean.updated_at
    const q = row.id
      ? supabase.from(table).update(clean).eq('id', row.id).select('*').single()
      : supabase.from(table).insert(clean).select('*').single()
    const { data, error } = await q
    end(!error)
    if (error || !data) { notify('تعذّر الحفظ: ' + (error?.message ?? '')); return null }
    const set = setterFor(table)
    set((rows: any[]) => {
      const next = rows.some((r) => r.id === (data as any).id) ? rows.map((r) => (r.id === (data as any).id ? data : r)) : [...rows, data]
      return table === 'transactions' ? next.sort((a, b) => b.tx_date.localeCompare(a.tx_date)) : table === 'events' ? next : byKey(next, 'sort')
    })
    return data as T
  }, [notify])

  const insertMany = useCallback(async (table: Table, rows: Record<string, unknown>[]) => {
    if (!rows.length) return true
    begin()
    const { data, error } = await supabase.from(table).insert(rows).select('*')
    end(!error)
    if (error) { notify('تعذّر الحفظ: ' + error.message); return false }
    const set = setterFor(table)
    set((cur: any[]) => {
      const ids = new Set((data ?? []).map((d: any) => d.id))
      const next = [...cur.filter((r) => !ids.has(r.id)), ...(data ?? [])]
      return table === 'transactions' ? next.sort((a, b) => b.tx_date.localeCompare(a.tx_date)) : next
    })
    return true
  }, [notify])

  const remove = useCallback(async (table: Table, id: string) => {
    begin()
    const set = setterFor(table)
    set((rows: any[]) => rows.filter((r) => r.id !== id))
    const { error } = await supabase.from(table).delete().eq('id', id)
    end(!error)
    if (error) { notify('تعذّر الحذف: ' + error.message); reload() }
  }, [notify, reload])

  const refreshMarket = useCallback(async (mode: 'all' | 'prices' | 'ibkr' = 'all') => {
    setRefreshing(true)
    try {
      const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode } })
      if (error) throw error
      await reload()
      const r = data?.results?.[0] ?? {}
      const parts: string[] = []
      if (r.prices) parts.push(`حُدّث ${r.prices.updated} سعر`)
      if (r.ibkr?.error) parts.push(`IBKR: ${r.ibkr.error}`)
      else if (r.ibkr) parts.push(`IBKR: ${r.ibkr.positions} مركز`)
      if (r.prices?.failed?.length) parts.push(`تعذّر: ${r.prices.failed.join('، ')}`)
      return { ok: !r.ibkr?.error, message: parts.join(' · ') || 'تم التحديث' }
    } catch (e) {
      return { ok: false, message: 'تعذّر التحديث؛ تحقق من الاتصال وأعد المحاولة' }
    } finally {
      setRefreshing(false)
    }
  }, [reload])

  const saveIbkr = useCallback(async (queryId: string, token: string) => {
    begin()
    const { error } = await supabase.rpc('set_ibkr_connection', { p_query_id: queryId, p_token: token })
    end(!error)
    if (error) { notify('تعذّر حفظ بيانات الربط'); return false }
    const { data } = await supabase.from('ibkr_connection').select('user_id,query_id,last_sync_at,last_status,last_message').maybeSingle()
    setIbkr((data as IbkrConnection) ?? null)
    return true
  }, [notify])

  const clearIbkr = useCallback(async () => {
    await supabase.rpc('clear_ibkr_connection')
    setIbkr(null)
  }, [])

  const createPlan = useCallback(async (payload: Record<string, unknown>) => {
    begin()
    const { error } = await supabase.rpc('create_plan', { p: payload })
    end(!error)
    if (error) { notify('تعذّر إنشاء الخطة: ' + error.message); return false }
    await reload()
    setNeedsSetup(false)
    // first prices and the first daily snapshot
    supabase.functions.invoke('daily-update', { body: { mode: 'prices' } }).then(() => reload())
    return true
  }, [notify, reload])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSettings(null); setSleeves([]); setAccounts([]); setHoldings([]); setTransactions([]); setEvents([]); setSnapshots([]); setWatchlist([]); setStreams([]); setObligations([]); setGoals([]); setOtherAssets([]); setNeedsSetup(false); setIbkr(null)
  }, [])

  const value = useMemo<Store>(() => ({
    session, ready, loading, error, settings, sleeves, accounts, holdings, transactions, events, snapshots, watchlist, streams, obligations, goals, otherAssets,
    needsSetup, createPlan, readOnly, fx, fxUpdatedAt, ibkr,
    save, refreshing, toast, notify, updateSettings, upsert, insertMany, remove, reload, refreshMarket, saveIbkr, clearIbkr, signOut,
  }), [session, ready, loading, error, settings, sleeves, accounts, holdings, transactions, events, snapshots, watchlist, streams, obligations, goals, otherAssets,
    needsSetup, createPlan, readOnly, fx, fxUpdatedAt, ibkr,
    save, refreshing, toast, notify, updateSettings, upsert, insertMany, remove, reload, refreshMarket, saveIbkr, clearIbkr, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
