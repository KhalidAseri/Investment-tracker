// Shared store (Supabase). The app syncs the portfolio document here; Claude reads it through the
// Supabase connector, researches each asset and writes its look-through into invest_asset_profiles.
// The key below is a publishable key: it is meant to ship in clients, and row-level security limits
// every signed-in user to their own rows.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { RemoteItem } from './catalog'
import type { AppData, AssetProfile } from './types'

const URL = 'https://ivicgwjratcfcbmyrnld.supabase.co'
const KEY = 'sb_publishable_Ikf9bS82eaFOe4QA-H0zEQ_34cBGjZS'

let client: SupabaseClient | null = null
export function cloud(): SupabaseClient {
  if (!client) client = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'investtrack_auth' } })
  return client
}

export async function sessionEmail(): Promise<string | null> {
  const { data } = await cloud().auth.getSession()
  return data.session?.user.email ?? null
}

/** Returns an error message, or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await cloud().auth.signInWithPassword({ email: email.trim(), password })
  return error ? error.message : null
}

export async function signOut(): Promise<void> {
  await cloud().auth.signOut()
}

export interface RemotePortfolio { data: unknown; updatedAt: string }

export async function pullPortfolio(): Promise<RemotePortfolio | null> {
  const { data, error } = await cloud().from('invest_portfolios').select('data, updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  return data ? { data: data.data, updatedAt: data.updated_at } : null
}

/** Uploads the document and returns the server timestamp it was stored with. */
export async function pushPortfolio(doc: AppData, device: string): Promise<string> {
  const updated_at = new Date().toISOString()
  const { error } = await cloud().from('invest_portfolios').upsert({ data: doc, updated_at, device })
  if (error) throw new Error(error.message)
  return updated_at
}

interface ProfileRow { asset_id: string; profile: Partial<AssetProfile>; source: 'claude' | 'user'; locked: boolean; as_of: string | null; updated_at: string }

export async function fetchProfiles(): Promise<AssetProfile[]> {
  const { data, error } = await cloud().from('invest_asset_profiles').select('asset_id, profile, source, locked, as_of, updated_at')
  if (error) throw new Error(error.message)
  return ((data ?? []) as ProfileRow[]).map((r) => ({
    confidence: 'estimated', ...r.profile,
    assetId: r.asset_id, source: r.source, locked: r.locked, asOf: r.as_of ?? '', updatedAt: r.updated_at,
  }))
}

/** Saves a profile the user edited by hand; it is marked locked so refreshes leave it alone. */
export async function saveProfile(p: AssetProfile, name: string, symbol: string | null): Promise<void> {
  const { assetId, source, locked, asOf, updatedAt: _u, ...body } = p
  const { error } = await cloud().from('invest_asset_profiles').upsert({ asset_id: assetId, name, symbol, profile: body, source, locked, as_of: asOf || null, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}

export async function deleteProfile(assetId: string): Promise<void> {
  const { error } = await cloud().from('invest_asset_profiles').delete().eq('asset_id', assetId)
  if (error) throw new Error(error.message)
}

export interface ProfileRun { ran_at: string; kind: string; summary: string }
export async function fetchRuns(): Promise<ProfileRun[]> {
  const { data } = await cloud().from('invest_profile_runs').select('ran_at, kind, summary').order('ran_at', { ascending: false }).limit(8)
  return (data ?? []) as ProfileRun[]
}

/** Researched breakdowns keyed by symbol: public reference data, readable without signing in. */
export async function fetchSymbolProfiles(symbols: string[]): Promise<Record<string, AssetProfile>> {
  if (symbols.length === 0) return {}
  const { data, error } = await cloud().from('invest_symbol_profiles').select('symbol, profile, as_of, updated_at').in('symbol', symbols)
  if (error) throw new Error(error.message)
  const out: Record<string, AssetProfile> = {}
  for (const r of (data ?? []) as { symbol: string; profile: Partial<AssetProfile>; as_of: string | null; updated_at: string }[]) {
    out[r.symbol] = { confidence: 'estimated', ...r.profile, assetId: '', source: 'claude', locked: false, asOf: r.as_of ?? '', updatedAt: r.updated_at }
  }
  return out
}

/** Securities the database adds to, or corrects in, the app's built-in list. Public reference data. */
export async function fetchCatalog(): Promise<RemoteItem[]> {
  const { data, error } = await cloud().from('invest_catalog').select('symbol, ar, en, kind, asset_class, region, sector, currency, is_fund, domicile, shariah, grp, manager, aliases, hidden')
  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows are shaped by the table's own constraints
  return ((data ?? []) as any[]).map((r) => ({
    symbol: r.symbol, ar: r.ar, en: r.en, kind: r.kind, assetClass: r.asset_class, region: r.region, sector: r.sector, currency: r.currency,
    isFund: r.is_fund, domicile: r.domicile ?? '', ...(r.shariah === null ? {} : { shariah: r.shariah }), ...(r.grp ? { group: r.grp } : {}),
    ...(r.manager ? { manager: r.manager } : {}), ...(r.aliases ? { aliases: r.aliases } : {}), hidden: !!r.hidden,
  }))
}
