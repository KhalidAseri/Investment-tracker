import { supabase } from './supabase'
import type { Sleeve } from './types'

export interface SymbolResult { symbol: string; name: string; exchange: string; type: string }
export interface SymbolQuote { price: number; currency: string; name: string; type: string; exchange: string }

export const TYPE_LABEL: Record<string, string> = {
  EQUITY: 'سهم', ETF: 'صندوق متداول', MUTUALFUND: 'صندوق', INDEX: 'مؤشر', CURRENCY: 'عملة', CRYPTOCURRENCY: 'عملة رقمية',
}

export async function searchSymbols(q: string): Promise<SymbolResult[]> {
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'search', q } })
  if (error) throw error
  return (data?.results ?? []) as SymbolResult[]
}

export async function quoteSymbol(symbol: string): Promise<SymbolQuote | null> {
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'quote', symbol } })
  if (error) return null
  return (data?.quote ?? null) as SymbolQuote | null
}

/** Best-guess layer for a picked instrument; the user can change it. */
export function guessSleeve(r: SymbolResult, sleeves: Sleeve[]): string | null {
  const name = r.name.toLowerCase()
  const saudi = r.symbol.toUpperCase().endsWith('.SR')
  const find = (pred: (s: Sleeve) => boolean) => sleeves.find(pred)?.id ?? null
  if (/gold|ذهب/.test(name)) return find((s) => s.layer === 'hedge')
  if (/reit|ريت/.test(name)) return find((s) => /ريت/.test(s.name)) ?? find((s) => s.layer === 'income')
  if (/sukuk|صكوك|bond|treasury/.test(name)) return find((s) => /صكوك/.test(s.name)) ?? find((s) => s.layer === 'income')
  if (/murabaha|money market|مرابحة/.test(name)) return find((s) => s.layer === 'safety')
  if (r.type === 'EQUITY') return find((s) => /مباشر/.test(s.name)) ?? find((s) => s.layer === 'growth')
  if (saudi) return find((s) => /سعودي/.test(s.name)) ?? find((s) => s.layer === 'growth')
  return find((s) => /عالمي/.test(s.name)) ?? find((s) => s.layer === 'growth')
}
