'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, AccountKind, AppData, Asset, Pick2, Quotes, Settings } from './types'
import { DEFAULT_ZAKAT_PERCENT, defaultSettings, defaultZakatMode, emptyData, genId, todayISO } from './labels'
import { applyTransaction, computeView, fxSymbolsNeeded, revertTransaction, type PortfolioView, type TxInput, settleAnchors } from './engine/valuation'
import { GOLD_SYMBOL } from './engine/zakat'
import type { BasketPlan } from './engine/basket'
import { setRemoteCatalog } from './catalog'
import { fetchQuotes, loadQuoteCache } from './market-client'
import { syncDecision } from './engine/sync'
import * as remote from './cloud'
import type { AssetProfile } from './types'

const SYMBOL_PROFILES_KEY = 'investtrack_symprofiles_v1'
const CATALOG_KEY = 'investtrack_catalog_v1'
const STORE_KEY = 'investtrack_v3'

// ---------- persistence & migration ----------

function mergeSettings(s: Partial<Settings> | undefined): Settings {
  const d = defaultSettings()
  if (!s) return d
  return {
    ...d,
    ...s,
    targets: { ...d.targets, ...s.targets },
    goal: { ...d.goal, ...s.goal },
    income: { ...d.income, ...s.income },
    zakat: { ...d.zakat, ...s.zakat },
    review: { ...d.review, ...s.review },
    fx: { ...d.fx, ...s.fx },
    lookThrough: { ...d.lookThrough, ...s.lookThrough },
    roadmap: { ...d.roadmap, ...s.roadmap },
  }
}

export function normalizeData(raw: unknown): AppData | null {
  const r = raw as Partial<AppData> | null
  if (!r || typeof r !== 'object' || !Array.isArray(r.assets) || !Array.isArray(r.accounts)) return null
  return {
    version: 3,
    settings: mergeSettings(r.settings),
    accounts: r.accounts,
    assets: r.assets,
    transactions: Array.isArray(r.transactions) ? r.transactions : [],
    snapshots: Array.isArray(r.snapshots) ? r.snapshots : [],
    reviews: Array.isArray(r.reviews) ? r.reviews : [],
    profiles: r.profiles && typeof r.profiles === 'object' ? r.profiles : {},
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
  }
}

/** Brings data from the previous app version (separate localStorage keys) into the new store. */
function migrateLegacy(): AppData | null {
  const read = (k: string): Record<string, unknown>[] => {
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? '[]')
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
  const oldAccounts = read('investtrack_accounts')
  const oldHoldings = read('investtrack_holdings')
  if (oldAccounts.length === 0 && oldHoldings.length === 0) return null

  const now = new Date().toISOString()
  const kindOf = (t: unknown): AccountKind =>
    t === 'EMPLOYER_SAVINGS' || t === 'RETIREMENT' ? 'EMPLOYER' : t === 'MANAGED_PORTFOLIO' ? 'ROBO' : t === 'SAVINGS' ? 'BANK' : t === 'SAUDI_STOCKS' || t === 'US_STOCKS' ? 'BROKERAGE' : 'OTHER'
  const data = emptyData()
  data.settings.onboarded = true
  data.accounts = oldAccounts.map((a) => ({
    id: String(a.id), name: String(a.nameAr || a.name || ''), kind: kindOf(a.type), createdAt: String(a.createdAt ?? now), updatedAt: now,
  }))
  const accountCcy = new Map(oldAccounts.map((a) => [String(a.id), String(a.currency ?? 'SAR')]))
  data.assets = oldHoldings.map((h) => {
    const symbol = h.symbol ? String(h.symbol) : null
    const shares = Number(h.shares) || 0
    const avg = Number(h.averageCost) || 0
    const isSaudi = !!symbol && symbol.endsWith('.SR')
    const live = !!symbol
    const base = {
      assetClass: (symbol === 'GLD' || symbol === 'IAU' ? 'GOLD' : 'EQUITY') as Asset['assetClass'],
      region: (isSaudi ? 'SA' : symbol === 'ACWI' || symbol === 'VT' ? 'GLOBAL' : live ? 'US' : 'GLOBAL') as Asset['region'],
      isFund: !isSaudi,
      symbol,
      pricing: (live ? 'live' : 'manual') as Asset['pricing'],
    }
    return {
      id: String(h.id),
      accountId: String(h.accountId),
      name: String(h.nameAr || h.name || symbol || ''),
      ...base,
      sector: isSaudi ? 'NA' : 'DIVERSIFIED',
      currency: live && !isSaudi ? 'USD' : accountCcy.get(String(h.accountId)) ?? 'SAR',
      priceFactor: 1,
      quantity: live ? shares : 0,
      costBasis: shares * avg,
      manualValue: live ? 0 : Number(h.currentValue) || shares * avg,
      valueUpdatedAt: String(h.updatedAt ?? now),
      isEmergencyFund: false,
      zakatMode: defaultZakatMode(base),
      zakatPercent: DEFAULT_ZAKAT_PERCENT,
      domicile: isSaudi ? 'SA' : live ? 'US' : '',
      createdAt: String(h.createdAt ?? now),
      updatedAt: now,
    }
  })
  const assetIds = new Set(data.assets.map((a) => a.id))
  data.transactions = read('investtrack_dividends')
    .filter((d) => assetIds.has(String(d.holdingId)))
    .map((d) => ({
      id: String(d.id), assetId: String(d.holdingId), type: 'DIVIDEND' as const, date: String(d.payDate ?? '').slice(0, 10) || todayISO(),
      quantity: 0, price: 0, amount: Number(d.amount) || 0, note: '', dQty: 0, dCost: 0, dValue: 0, createdAt: String(d.createdAt ?? now),
    }))
  return data
}

function loadData(): AppData {
  try {
    const stored = normalizeData(JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'))
    if (stored) return stored
  } catch {
    /* fall through to migration / empty */
  }
  return migrateLegacy() ?? emptyData()
}

// ---------- context ----------

type QuoteStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'failed'
export type SyncStatus = 'off' | 'syncing' | 'synced' | 'error' | 'conflict'
const SYNC_KEY = 'investtrack_sync'
interface SyncMeta { remoteAt: string; localAt: string }
const loadSyncMeta = (): SyncMeta => { try { return { remoteAt: '', localAt: '', ...JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') } } catch { return { remoteAt: '', localAt: '' } } }
const saveSyncMeta = (m: SyncMeta) => { try { localStorage.setItem(SYNC_KEY, JSON.stringify(m)) } catch { /* ignore */ } }
const hasContent = (d: AppData) => d.assets.length > 0 || d.settings.onboarded
export type NewAsset = Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'accountId'>

interface Store {
  ready: boolean
  data: AppData
  settings: Settings
  view: PortfolioView
  quotes: Quotes
  quoteStatus: QuoteStatus
  L: Pick2
  dir: 'rtl' | 'ltr'
  updateSettings: (patch: Partial<Settings>) => void
  addAccount: (name: string, kind: AccountKind) => Account
  renameAccount: (id: string, name: string) => void
  deleteAccount: (id: string) => void
  /** Creates or updates a portfolio defined by weights, with the holdings a plan from the basket engine sets. Returns its id. */
  saveBasket: (input: { accountId?: string; name: string; plan: BasketPlan }) => string
  /** Changes when the list of securities is refreshed from the database; screens that list it depend on this. */
  catalogRev: number
  addAsset: (asset: NewAsset, account: { id?: string; name: string; kind: AccountKind }) => Asset
  updateAsset: (id: string, patch: Partial<Asset>) => void
  deleteAsset: (id: string) => void
  addTransaction: (assetId: string, input: TxInput) => void
  deleteTransaction: (id: string) => void
  completeReview: (note: string) => void
  refreshQuotes: (force?: boolean) => Promise<void>
  /** Signed-in email, or null. */
  cloudUser: string | null
  syncStatus: SyncStatus
  syncError: string
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
  syncNow: () => Promise<void>
  /** Settle a sync conflict by keeping this device's copy or the cloud's. */
  resolveConflict: (keep: 'local' | 'remote') => Promise<void>
  /** Save a hand-edited look-through for an asset (locked against refreshes); null removes it. */
  setProfile: (assetId: string, profile: AssetProfile | null) => Promise<void>
  exportData: () => string
  importData: (json: string) => boolean
  resetData: () => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(emptyData)
  const [ready, setReady] = useState(false)
  const [quotes, setQuotes] = useState<Quotes>({})
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('idle')
  const dataRef = useRef(data)
  dataRef.current = data

  useEffect(() => {
    setData(loadData())
    setQuotes(loadQuoteCache())
    setReady(true)
  }, [])

  const [cloudUser, setCloudUser] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off')
  const [syncError, setSyncError] = useState('')
  const pendingRemote = useRef<remote.RemotePortfolio | null>(null)

  /** `touch: false` is for changes that came from the cloud, so they are not sent straight back. */
  const commit = useCallback((fn: (draft: AppData) => void, touch = true) => {
    const draft = structuredClone(dataRef.current)
    fn(draft)
    if (touch) draft.updatedAt = new Date().toISOString()
    dataRef.current = draft
    setData(draft)
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(draft))
    } catch {
      /* storage unavailable: changes live for this session only */
    }
  }, [])

  const locale = data.settings.locale
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = dir
  }, [locale, dir])
  const theme = data.settings.theme
  useEffect(() => {
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
  }, [theme])
  const L = useCallback<Pick2>((ar, en) => (locale === 'ar' ? ar : en), [locale])

  const symbolKey = useMemo(() => {
    const live = data.assets.filter((a) => a.pricing === 'live' && a.symbol).map((a) => a.symbol as string)
    const all = data.assets.length > 0 ? [...live, GOLD_SYMBOL, ...fxSymbolsNeeded(data.assets)] : []
    return Array.from(new Set(all)).sort().join('|')
  }, [data.assets])

  const refreshQuotes = useCallback(async (force = false) => {
    const symbols = symbolKey ? symbolKey.split('|') : []
    if (symbols.length === 0) return
    setQuoteStatus('loading')
    const known = loadQuoteCache()
    const { quotes: merged, failed } = await fetchQuotes(symbols, known, force)
    setQuotes(merged)
    // A Saudi mutual fund without a price is waiting for its daily update, not a failed fetch.
    const broken = failed.filter((x) => !x.startsWith('MF:'))
    setQuoteStatus(broken.length === 0 ? 'ok' : broken.length < symbols.length ? 'partial' : 'failed')
    // A fund entered by its value before it had a price becomes units at the first price.
    const settled = settleAnchors(dataRef.current.assets, merged)
    if (settled.length > 0) commit((d) => { for (const { id, patch } of settled) { const i = d.assets.findIndex((a) => a.id === id); if (i >= 0) d.assets[i] = { ...d.assets[i], ...patch } } })
    // Live FX for currencies other than the pegged USD.
    const fxPatch: Record<string, number> = {}
    for (const s of symbols) {
      const m = /^([A-Z]{3})SAR=X$/.exec(s)
      if (m && merged[s]?.price > 0) fxPatch[m[1]] = merged[s].price
    }
    if (Object.keys(fxPatch).length > 0) commit((d) => { d.settings.fx = { ...d.settings.fx, ...fxPatch } })
  }, [symbolKey, commit])

  useEffect(() => {
    if (ready) void refreshQuotes()
  }, [ready, refreshQuotes])

  // Coming back to the app after a while: prices refresh without being asked.
  const lastRefresh = useRef(0)
  useEffect(() => {
    if (!ready) return
    lastRefresh.current = Date.now()
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastRefresh.current < 15 * 60 * 1000) return
      lastRefresh.current = Date.now()
      void refreshQuotes()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [ready, refreshQuotes])

  // The list of securities: the saved copy first (works offline), then the database's current one.
  const [catalogRev, setCatalogRev] = useState(0)
  useEffect(() => {
    if (!ready) return
    try {
      const cached = JSON.parse(localStorage.getItem(CATALOG_KEY) ?? '[]')
      if (Array.isArray(cached) && cached.length) { setRemoteCatalog(cached); setCatalogRev((n) => n + 1) }
    } catch { /* no saved copy */ }
    let gone = false
    remote.fetchCatalog().then((rows) => {
      if (gone) return
      setRemoteCatalog(rows)
      setCatalogRev((n) => n + 1)
      try { localStorage.setItem(CATALOG_KEY, JSON.stringify(rows)) } catch { /* storage full */ }
    }).catch(() => { /* offline: the saved copy stays */ })
    return () => { gone = true }
  }, [ready])

  // Breakdowns Claude researched per symbol: shared reference data, used for any asset holding that symbol.
  const [symbolProfiles, setSymbolProfiles] = useState<Record<string, AssetProfile>>({})
  useEffect(() => {
    if (!ready) return
    try { setSymbolProfiles(JSON.parse(localStorage.getItem(SYMBOL_PROFILES_KEY) ?? '{}')) } catch { /* no cache */ }
    const symbols = Array.from(new Set(dataRef.current.assets.map((a) => (a.pricing === 'live' ? a.symbol : null)).filter((x): x is string => !!x)))
    if (symbols.length === 0) return
    let gone = false
    remote.fetchSymbolProfiles(symbols).then((map) => {
      if (gone) return
      setSymbolProfiles(map)
      try { localStorage.setItem(SYMBOL_PROFILES_KEY, JSON.stringify(map)) } catch { /* storage full */ }
    }).catch(() => { /* offline: the cached copy stays */ })
    return () => { gone = true }
  }, [ready, symbolKey])

  // ---------- cloud sync ----------
  const device = typeof navigator === 'undefined' ? '' : /Android/i.test(navigator.userAgent) ? 'android' : 'web'

  const adoptRemote = useCallback((r: remote.RemotePortfolio) => {
    const next = normalizeData(r.data)
    if (!next) throw new Error('remote data is not a portfolio')
    // language, theme and privacy toggle are per device
    const keep = dataRef.current.settings
    next.settings = { ...next.settings, locale: keep.locale, theme: keep.theme, hideAmounts: keep.hideAmounts }
    commit((d) => { Object.assign(d, next) }, false)
    saveSyncMeta({ remoteAt: r.updatedAt, localAt: dataRef.current.updatedAt })
  }, [commit])

  const pushLocal = useCallback(async () => {
    const at = await remote.pushPortfolio(dataRef.current, device)
    saveSyncMeta({ remoteAt: at, localAt: dataRef.current.updatedAt })
  }, [device])

  const pullProfiles = useCallback(async () => {
    const list = await remote.fetchProfiles()
    const map: Record<string, AssetProfile> = Object.fromEntries(list.map((p) => [p.assetId, p]))
    if (JSON.stringify(map) !== JSON.stringify(dataRef.current.profiles)) commit((d) => { d.profiles = map }, false)
  }, [commit])

  const syncNow = useCallback(async () => {
    const email = await remote.sessionEmail()
    setCloudUser(email)
    if (!email) { setSyncStatus('off'); return }
    setSyncStatus('syncing')
    setSyncError('')
    try {
      const r = await remote.pullPortfolio()
      const meta = loadSyncMeta()
      const local = dataRef.current
      const action = syncDecision({ localHasContent: hasContent(local), localChanged: local.updatedAt !== meta.localAt, remoteExists: !!r, remoteChanged: !!r && r.updatedAt !== meta.remoteAt })
      if (action === 'conflict') { pendingRemote.current = r; setSyncStatus('conflict'); return }
      if (action === 'pull' && r) adoptRemote(r)
      if (action === 'push') await pushLocal()
      await pullProfiles()
      setSyncStatus('synced')
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
      setSyncStatus('error')
    }
  }, [adoptRemote, pushLocal, pullProfiles])

  useEffect(() => { if (ready) void syncNow() }, [ready, syncNow])

  // upload local changes shortly after they stop
  useEffect(() => {
    if (!ready || !cloudUser || syncStatus !== 'synced' || data.updatedAt === loadSyncMeta().localAt || !hasContent(data)) return
    const t = setTimeout(() => { pushLocal().catch((e) => { setSyncError(e instanceof Error ? e.message : String(e)); setSyncStatus('error') }) }, 2500)
    return () => clearTimeout(t)
  }, [ready, cloudUser, syncStatus, data, pushLocal])

  const view = useMemo(() => computeView(data, quotes), [data, quotes])

  // One net-worth snapshot per month, kept up to date while the app is open.
  useEffect(() => {
    if (!ready || data.assets.length === 0 || quoteStatus === 'loading') return
    const month = todayISO().slice(0, 7)
    const existing = data.snapshots.find((s) => s.month === month)
    if (existing && Math.abs(existing.netWorth - view.netWorth) < 1) return
    commit((d) => {
      d.snapshots = d.snapshots.filter((s) => s.month !== month)
      d.snapshots.push({ month, date: todayISO(), netWorth: view.netWorth, invested: view.cost, investable: view.investable })
      d.snapshots.sort((a, b) => a.month.localeCompare(b.month))
    })
  }, [ready, quoteStatus, view.netWorth, view.cost, view.investable, data.assets.length, data.snapshots, commit])

  // What screens read: the stored data, with the shared symbol breakdowns filled in where the user has not set their own.
  const shown = useMemo(() => {
    if (Object.keys(symbolProfiles).length === 0) return data
    const profiles = { ...data.profiles }
    for (const a of data.assets) {
      const sp = a.pricing === 'live' && a.symbol ? symbolProfiles[a.symbol] : undefined
      if (sp && !profiles[a.id]?.locked) profiles[a.id] = { ...sp, assetId: a.id }
    }
    return { ...data, profiles }
  }, [data, symbolProfiles])

  const store = useMemo<Store>(() => {
    const now = () => new Date().toISOString()
    return {
      ready, data: shown, settings: data.settings, view, quotes, quoteStatus, L, dir, catalogRev,
      updateSettings: (patch) => commit((d) => { d.settings = { ...d.settings, ...patch } }),
      addAccount: (name, kind) => {
        const acc: Account = { id: genId(), name: name.trim(), kind, createdAt: now(), updatedAt: now() }
        commit((d) => { d.accounts.push(acc) })
        return acc
      },
      renameAccount: (id, name) => commit((d) => {
        const a = d.accounts.find((x) => x.id === id)
        if (a) { a.name = name.trim(); a.updatedAt = now() }
      }),
      deleteAccount: (id) => commit((d) => {
        const gone = new Set(d.assets.filter((a) => a.accountId === id).map((a) => a.id))
        d.accounts = d.accounts.filter((a) => a.id !== id)
        d.assets = d.assets.filter((a) => a.accountId !== id)
        d.transactions = d.transactions.filter((t) => !gone.has(t.assetId))
      }),
      saveBasket: ({ accountId, name, plan }) => {
        const id = accountId ?? genId()
        commit((d) => {
          const acc = d.accounts.find((a) => a.id === id)
          if (acc) { acc.name = name.trim(); acc.basket = true; acc.updatedAt = now() }
          else d.accounts.push({ id, name: name.trim(), kind: 'ROBO', basket: true, createdAt: now(), updatedAt: now() })
          for (const u of plan.update) {
            const i = d.assets.findIndex((a) => a.id === u.id)
            if (i >= 0) d.assets[i] = { ...d.assets[i], ...u.patch, updatedAt: now() }
          }
          for (const c of plan.create) d.assets.push({ ...c, id: genId(), accountId: id, createdAt: now(), updatedAt: now() })
          if (plan.remove.length > 0) {
            const gone = new Set(plan.remove)
            d.assets = d.assets.filter((a) => !gone.has(a.id))
            d.transactions = d.transactions.filter((t) => !gone.has(t.assetId))
            for (const g of gone) delete d.profiles[g]
          }
        })
        return id
      },
      addAsset: (asset, account) => {
        const created: Asset = { ...asset, id: genId(), accountId: account.id ?? genId(), createdAt: now(), updatedAt: now() }
        commit((d) => {
          if (!d.accounts.some((a) => a.id === created.accountId)) {
            d.accounts.push({ id: created.accountId, name: account.name.trim(), kind: account.kind, createdAt: now(), updatedAt: now() })
          }
          d.assets.push(created)
        })
        return created
      },
      updateAsset: (id, patch) => commit((d) => {
        const i = d.assets.findIndex((a) => a.id === id)
        if (i >= 0) d.assets[i] = { ...d.assets[i], ...patch, updatedAt: now() }
      }),
      deleteAsset: (id) => commit((d) => {
        d.assets = d.assets.filter((a) => a.id !== id)
        d.transactions = d.transactions.filter((t) => t.assetId !== id)
        delete d.profiles[id]
      }),
      addTransaction: (assetId, input) => commit((d) => {
        const i = d.assets.findIndex((a) => a.id === assetId)
        if (i < 0) return
        const { asset, tx } = applyTransaction(d.assets[i], input)
        d.assets[i] = asset
        d.transactions.push({ ...tx, id: genId(), createdAt: now() })
      }),
      deleteTransaction: (id) => commit((d) => {
        const tx = d.transactions.find((t) => t.id === id)
        if (!tx) return
        const i = d.assets.findIndex((a) => a.id === tx.assetId)
        if (i >= 0) d.assets[i] = revertTransaction(d.assets[i], tx)
        d.transactions = d.transactions.filter((t) => t.id !== id)
      }),
      completeReview: (note) => commit((d) => {
        d.reviews.unshift({ id: genId(), date: now(), netWorth: view.netWorth, note })
        d.settings.review = { ...d.settings.review, lastReviewAt: now() }
      }),
      refreshQuotes,
      cloudUser, syncStatus, syncError, syncNow,
      signIn: async (email, password) => {
        const err = await remote.signIn(email, password)
        if (!err) await syncNow()
        return err
      },
      signOut: async () => { await remote.signOut(); setCloudUser(null); setSyncStatus('off') },
      resolveConflict: async (keep) => {
        setSyncStatus('syncing')
        try {
          if (keep === 'remote' && pendingRemote.current) adoptRemote(pendingRemote.current)
          else await pushLocal()
          pendingRemote.current = null
          await pullProfiles()
          setSyncStatus('synced')
        } catch (e) { setSyncError(e instanceof Error ? e.message : String(e)); setSyncStatus('error') }
      },
      setProfile: async (assetId, profile) => {
        commit((d) => { if (profile) d.profiles[assetId] = profile; else delete d.profiles[assetId] }, false)
        if (!cloudUser) return
        const a = dataRef.current.assets.find((x) => x.id === assetId)
        if (profile) await remote.saveProfile(profile, a?.name ?? '', a?.symbol ?? null)
        else await remote.deleteProfile(assetId)
      },
      exportData: () => JSON.stringify({ ...dataRef.current, exportedAt: now() }, null, 2),
      importData: (json) => {
        try {
          const next = normalizeData(JSON.parse(json))
          if (!next) return false
          commit((d) => { Object.assign(d, next) })
          return true
        } catch {
          return false
        }
      },
      resetData: () => commit((d) => { Object.assign(d, emptyData(), { settings: { ...defaultSettings(), locale: d.settings.locale } }) }),
    }
  }, [ready, data, shown, view, quotes, quoteStatus, L, dir, catalogRev, commit, refreshQuotes, cloudUser, syncStatus, syncError, syncNow, adoptRemote, pushLocal, pullProfiles])

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore must be used inside StoreProvider')
  return s
}
