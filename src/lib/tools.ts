import { supabase } from './supabase'

export interface HistoryResult { name: string; points: Array<{ d: string; c: number }> }
export async function benchmarkHistory(symbol: string, from: string): Promise<HistoryResult | null> {
  const { data, error } = await supabase.functions.invoke('tools', { body: { mode: 'history', symbol, from } })
  if (error || !data?.ok) return null
  return { name: String(data.name ?? symbol), points: (data.points ?? []) as HistoryResult['points'] }
}

export interface DrahimReport {
  provider: 'drahim'
  period: string | null
  periodLabel: string | null
  total: number | null
  holdings: Array<{ portfolio: string | null; name: string; units: number; value: number }>
  operations: Array<{ portfolio: string | null; date: string; kind: string; label: string; amount: number }>
  fees: Array<{ portfolio: string | null; amount: number; label: string }>
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export async function parseDrahimPdf(file: File): Promise<{ ok: true; report: DrahimReport } | { ok: false; error: string }> {
  if (file.size > 5_000_000) return { ok: false, error: 'الملف أكبر من 5 ميغابايت' }
  const pdf = toBase64(await file.arrayBuffer())
  const { data, error } = await supabase.functions.invoke('tools', { body: { mode: 'parse-drahim', pdf } })
  if (error) {
    let msg = 'تعذّرت قراءة الملف؛ تحقق من الاتصال وأعد المحاولة'
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error } catch { /* keep default */ }
    return { ok: false, error: msg }
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'لم أتعرف على هذا الملف' }
  return { ok: true, report: data as DrahimReport }
}

/** Drahim's transactions export: one row per credit/debit. */
export interface DrahimCsvRow { id: string; account: string; label: string; amount: number; type: 'credit' | 'debit'; date: string; time: string }

const splitCsv = (line: string) => {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out.map((x) => x.trim())
}

export function parseDrahimCsv(text: string): { rows: DrahimCsvRow[]; error?: string } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], error: 'الملف فارغ' }
  const head = splitCsv(lines[0]).map((h) => h.toLowerCase())
  const col = (n: string) => head.indexOf(n)
  const iId = col('transaction_id'), iAcc = col('account_name'), iLbl = col('merchant_arabic'), iAmt = col('amount'), iType = col('type'), iDate = col('date'), iTime = col('time')
  if (iAmt < 0 || iDate < 0) return { rows: [], error: 'هذا ليس ملف عمليات دراهم: أعمدة المبلغ والتاريخ غير موجودة' }
  const seen = new Set<string>()
  const rows: DrahimCsvRow[] = []
  for (const l of lines.slice(1)) {
    const c = splitCsv(l)
    const id = iId >= 0 ? c[iId] : `${c[iDate]}|${c[iAmt]}|${c[iLbl] ?? ''}`
    if (!id || seen.has(id)) continue
    seen.add(id)
    const amount = Number(String(c[iAmt]).replace(/,/g, ''))
    const date = String(c[iDate] ?? '').slice(0, 10)
    if (!Number.isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const type = (iType >= 0 ? c[iType] : amount >= 0 ? 'credit' : 'debit').toLowerCase() === 'debit' || amount < 0 ? 'debit' : 'credit'
    rows.push({ id, account: iAcc >= 0 ? c[iAcc] : '', label: iLbl >= 0 ? c[iLbl] : '', amount: Math.abs(amount), type, date, time: iTime >= 0 ? c[iTime] : '' })
  }
  return { rows }
}

/** credit from the fund's distributions = dividend; credit from Drahim itself = a deposit; debit = money taken out. */
export function drahimCsvKind(r: DrahimCsvRow): 'dividend' | 'deposit' | 'withdrawal' {
  if (r.type === 'debit') return 'withdrawal'
  return /توزيع|أرباح|ارباح/.test(r.label) ? 'dividend' : 'deposit'
}
