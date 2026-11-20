'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Trash2, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Quotes } from '@/lib/types'
import { CATALOG, isMutualFund, searchAll, type CatalogItem } from '@/lib/catalog'
import { costAfter, normalizeWeights, planBasket, scaleBasket, type BasketPart } from '@/lib/engine/basket'
import { fetchQuotes, loadQuoteCache, searchMarket, type MarketHit } from '@/lib/market-client'
import { num, pct } from '@/lib/format'
import { Chips, Confirm, Field, Money, NumberInput, Sheet, cx, haptic } from './ui'

const IN_CATALOG = new Set(CATALOG.map((c) => c.symbol))
type Row = BasketPart & { key: string }
let seq = 0
const key = () => `p${++seq}`

/**
 * A portfolio defined by weights: its components and their shares, and what the holder's part of
 * it is worth. Each component becomes a holding sized to its share, so the whole then moves with
 * its prices. Opened empty to create one, or on an existing portfolio to re-state or re-weight it.
 */
export default function BasketSheet({ open, accountId, onClose }: { open: boolean; accountId: string | null; onClose: () => void }) {
  const { L, data, view, settings, quotes, saveBasket, deleteAccount, refreshQuotes } = useStore()
  const [name, setName] = useState('')
  const [total, setTotal] = useState(0)
  const [invested, setInvested] = useState(0)
  const [rows, setRows] = useState<Row[]>([])
  const [why, setWhy] = useState<'gain' | 'in' | 'out'>('gain')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<MarketHit[]>([])
  const [px, setPx] = useState<Quotes>({})
  const pxRef = useRef<Quotes>({})
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)
  // what the sheet opened with, to tell a re-statement from a re-weighting
  const start = useRef<{ total: number; cost: number; weights: string }>({ total: 0, cost: 0, weights: '' })

  const account = accountId ? data.accounts.find((a) => a.id === accountId) ?? null : null
  const held = useMemo(() => (accountId ? view.rows.filter((r) => r.asset.accountId === accountId) : []), [view.rows, accountId])
  const signature = (list: Row[]) => list.map((r) => `${r.id ?? r.symbol ?? r.name}:${r.weight}`).join('|')

  useEffect(() => {
    if (!open) return
    pxRef.current = { ...loadQuoteCache(), ...quotes }; setPx(pxRef.current)
    setQuery(''); setHits([]); setWhy('gain'); setSaving(false)
    if (!account) { setName(''); setTotal(0); setInvested(0); setRows([]); start.current = { total: 0, cost: 0, weights: '' }; return }
    const now = held.reduce((s, r) => s + r.value, 0)
    const cost = held.reduce((s, r) => s + r.cost, 0)
    // weights as last set; a holding added outside this sheet shows at the share it has now
    const list: Row[] = held.map((r) => ({
      key: key(), id: r.asset.id, name: r.asset.name, symbol: r.asset.pricing === 'live' ? r.asset.symbol : null,
      weight: r.asset.basketWeight ?? Math.round((now > 0 ? (r.value / now) * 100 : 0) * 100) / 100,
      assetClass: r.asset.assetClass, region: r.asset.region, sector: r.asset.sector, currency: r.asset.currency, isFund: r.asset.isFund, domicile: r.asset.domicile,
    })).sort((a, b) => b.weight - a.weight)
    setName(account.name); setTotal(Math.round(now * 100) / 100); setInvested(Math.round(cost * 100) / 100); setRows(list)
    start.current = { total: Math.round(now * 100) / 100, cost, weights: signature(list) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot when the sheet opens
  }, [open, accountId])

  const q = query.trim()
  const taken = new Set(rows.map((r) => r.symbol).filter(Boolean) as string[])
  const results = useMemo(() => (q ? searchAll(q, null, settings.shariahFirst).filter((c) => !taken.has(c.symbol)).slice(0, 6) : []), [q, settings.shariahFirst, rows]) // eslint-disable-line react-hooks/exhaustive-deps
  const loadPrices = (symbols: string[]) => fetchQuotes(symbols, pxRef.current).then(({ quotes: got }) => { pxRef.current = got; setPx(got) })
  const visible = results.map((c) => c.symbol).join(',')
  useEffect(() => {
    if (!open || !visible) return
    const t = setTimeout(() => { void loadPrices(visible.split(',')) }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, visible])
  useEffect(() => {
    if (!open || q.length < 2 || !/[A-Za-z0-9]/.test(q)) { setHits([]); return }
    let gone = false
    const t = setTimeout(() => { searchMarket(q).then((h) => { if (!gone) { const fresh = h.filter((x) => !IN_CATALOG.has(x.symbol)).slice(0, 4); setHits(fresh); if (fresh.length) void loadPrices(fresh.map((x) => x.symbol)) } }) }, 450)
    return () => { gone = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q])

  const sum = rows.reduce((s, r) => s + (r.weight || 0), 0)
  const rest = Math.max(0, Math.round((100 - sum) * 100) / 100)
  const add = (part: Omit<Row, 'key' | 'weight'>) => { setRows((list) => [...list, { ...part, key: key(), weight: rest }]); setQuery(''); setHits([]) }
  const addItem = (c: CatalogItem) => add({ name: L(c.ar, c.en), symbol: c.symbol, assetClass: c.assetClass, region: c.region, sector: c.sector, currency: c.currency, isFund: c.isFund, domicile: c.domicile })
  const addHit = (h: MarketHit) => add({
    name: h.name, symbol: h.symbol, assetClass: h.type === 'CRYPTOCURRENCY' ? 'CRYPTO' : 'EQUITY', region: h.symbol.endsWith('.SR') ? 'SA' : h.type === 'CRYPTOCURRENCY' ? 'NONE' : 'US',
    sector: h.type === 'ETF' || h.type === 'MUTUALFUND' ? 'DIVERSIFIED' : 'NA', currency: pxRef.current[h.symbol]?.currency ?? (h.symbol.endsWith('.SR') ? 'SAR' : 'USD'), isFund: h.type === 'ETF' || h.type === 'MUTUALFUND', domicile: '',
  })
  const addUnpriced = (label: string, cash: boolean) => add({ name: label, symbol: null, assetClass: cash ? 'CASH' : 'OTHER', region: cash ? 'SA' : 'NONE', sector: 'NA', currency: 'SAR', isFund: false, domicile: '' })
  const setWeight = (k: string, weight: number) => setRows((list) => list.map((r) => (r.key === k ? { ...r, weight } : r)))

  const editing = !!account
  const diff = editing ? total - start.current.total : 0
  const moved = editing && Math.abs(diff) >= 0.01
  const reweighted = !editing || signature(rows) !== start.current.weights
  const sumOk = Math.abs(sum - 100) < 0.011
  const canSave = name.trim().length > 0 && total > 0 && rows.length > 0 && sumOk && !saving && (!moved || why === 'gain' || (why === 'in' && diff > 0) || (why === 'out' && diff < 0))
  const nowShare = (id?: string) => { const r = held.find((x) => x.asset.id === id); return r && start.current.total > 0 ? (r.value / start.current.total) * 100 : null }

  const save = async () => {
    setSaving(true)
    // every priced component needs today's price to be sized
    const symbols = rows.map((r) => r.symbol).filter((x): x is string => !!x)
    const { quotes: fresh } = symbols.length ? await fetchQuotes(symbols, pxRef.current) : { quotes: pxRef.current }
    const cost = editing ? costAfter(moved ? why : 'gain', start.current.cost, start.current.total, total) : invested > 0 ? invested : total
    const plan = reweighted ? planBasket(held.map((r) => r.asset), rows, total, cost, fresh, settings.fx) : scaleBasket(held, total, cost, fresh, settings.fx)
    saveBasket({ accountId: account?.id, name, plan })
    haptic()
    onClose()
    void refreshQuotes(true)
  }

  const rowClass = 'flex min-h-[52px] w-full items-center justify-between gap-3 bg-card px-4 py-2 text-start hover:bg-surface'
  return (
    <>
      <Sheet open={open} onClose={onClose} title={editing ? L('نِسب المحفظة وقيمتها', 'Portfolio weights and value') : L('محفظة بنِسب', 'Weighted portfolio')} footer={
        <button className="btn-primary w-full" disabled={!canSave} onClick={save}>{saving ? L('جاري جلب الأسعار…', 'Fetching prices…') : editing ? L('حفظ التغييرات', 'Save changes') : L('إنشاء المحفظة', 'Create the portfolio')}</button>
      }>
        <div className="space-y-5">
          {!editing && <p className="text-sm leading-relaxed text-ink-soft">{L('لمحفظة تعرف مكوّناتها ونِسبها وقيمة حصتك فيها، لا عدد أسهمها: محفظة مُدارة، أو خطة استثمار. كل مكوّن يُسعَّر بحصته، فتتحرك قيمتها يوميًا مع أسعاره.', 'For a portfolio you know by its components, their weights and what your share is worth, not by share counts: a managed portfolio or an investment plan. Each component is priced at its share, so the value moves daily with its prices.')}</p>}

          <Field label={L('اسم المحفظة', 'Portfolio name')}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={L('مثال: محفظتي المُدارة', 'e.g. My managed portfolio')} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={L('قيمة حصتي الآن', 'My share is worth now')}>
              <NumberInput value={total} onChange={(n) => { setTotal(n); setWhy('gain') }} suffix={L('ر.س', 'SAR')} />
            </Field>
            {editing
              ? <div><span className="label">{L('المبلغ المستثمَر', 'Amount invested')}</span><p className="flex min-h-[48px] items-center"><Money value={start.current.cost} className="text-sm font-medium" /></p></div>
              : <Field label={L('المبلغ المستثمَر', 'Amount invested')} hint={L('اتركه فارغًا إن كان يساوي القيمة', 'Leave empty if equal to the value')}><NumberInput value={invested} onChange={setInvested} suffix={L('ر.س', 'SAR')} /></Field>}
          </div>
          {moved && total > 0 && (
            <Field group label={L('الفرق هو', 'The difference is')}
              hint={why === 'gain' ? L('يُحسب الفرق ربحًا أو خسارة: تتغير القيمة ويبقى المبلغ المستثمَر كما هو.', 'The difference counts as gain or loss: the value changes and the amount invested stays as it is.')
                : why === 'in' ? L('يُضاف الفرق إلى المبلغ المستثمَر ولا يُحسب ربحًا.', 'The difference is added to the amount invested and is not counted as gain.')
                : L('يُخفَّض المبلغ المستثمَر بنسبة ما سحبته.', 'The amount invested is reduced in proportion to what you took out.')}>
              <Chips wrap value={why} onChange={setWhy} options={[{ value: 'gain' as const, label: `${diff > 0 ? L('ربح', 'Gain') : L('خسارة', 'Loss')} ${diff > 0 ? '+' : ''}${num(diff, 0)}` }, ...(diff > 0 ? [{ value: 'in' as const, label: L('أضفت مبلغًا', 'I added money') }] : [{ value: 'out' as const, label: L('سحبت مبلغًا', 'I took money out') }])]} />
            </Field>
          )}

          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="section-title">{L('المكوّنات ونِسبها', 'Components and weights')}</h3>
              <span className={cx('num text-sm font-medium', rows.length === 0 ? 'text-ink-soft' : sumOk ? 'text-gain' : 'text-warn-600')}>{L('المجموع', 'Total')} {pct(sum, sum % 1 === 0 ? 0 : 2)}</span>
            </div>
            {rows.length > 0 && (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {rows.map((r) => {
                  const share = nowShare(r.id)
                  return (
                    <li key={r.key} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <bdi className="block truncate text-sm font-medium">{r.name}</bdi>
                        <span className="block truncate text-xs text-ink-soft">
                          {r.symbol ? (isMutualFund(r.symbol) ? L('صندوق استثماري', 'Mutual fund') : <span className="num">{r.symbol}</span>) : L('بدون سعر سوق', 'No market price')}
                          {total > 0 && r.weight > 0 && <> · <span className="num">{num((total * r.weight) / (sum || 100), 0)}</span></>}
                          {share !== null && <> · {L('الآن', 'now')} <span className="num">{pct(share, 1)}</span></>}
                        </span>
                      </span>
                      <span className="w-24 shrink-0"><NumberInput value={r.weight} onChange={(n) => setWeight(r.key, n)} suffix="%" ariaLabel={L(`نسبة ${r.name}`, `Weight of ${r.name}`)} /></span>
                      <button className="flex h-11 w-9 shrink-0 items-center justify-center text-ink-faint hover:text-loss" aria-label={L(`إزالة ${r.name}`, `Remove ${r.name}`)} onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}><Trash2 className="h-4 w-4" /></button>
                    </li>
                  )
                })}
              </ul>
            )}
            {rows.length > 1 && !sumOk && sum > 0 && <button className="btn-soft w-full" onClick={() => { const w = normalizeWeights(rows.map((r) => r.weight)); setRows((list) => list.map((r, i) => ({ ...r, weight: w[i] }))) }}>{L('اضبط المجموع على 100% بنفس التناسب', 'Scale the total to 100%, keeping proportions')}</button>}

            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
              <input className="input pe-11 ps-9" type="search" enterKeyHint="search" aria-label={L('أضف مكوّنًا', 'Add a component')} placeholder={L('أضف سهمًا أو صندوقًا بالاسم أو الرمز', 'Add a stock or fund by name or symbol')} value={query} onChange={(e) => setQuery(e.target.value)} />
              {query && <button className="absolute end-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-surface" aria-label={L('مسح البحث', 'Clear search')} onClick={() => setQuery('')}><X className="h-4 w-4" /></button>}
            </div>
            {q && (results.length > 0 || hits.length > 0) && (
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                {results.map((c) => (
                  <li key={c.symbol}><button className={rowClass} onClick={() => addItem(c)}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{L(c.ar, c.en)}</span><span className="block truncate text-xs text-ink-soft">{isMutualFund(c.symbol) ? c.manager : <span className="num">{c.symbol}</span>}</span></span>
                    {px[c.symbol] && <span className="num shrink-0 text-sm">{num(px[c.symbol].price, isMutualFund(c.symbol) ? 4 : 2)} <span className="text-[11px] text-ink-soft">{px[c.symbol].currency}</span></span>}
                  </button></li>
                ))}
                {hits.filter((h) => !taken.has(h.symbol)).map((h) => (
                  <li key={h.symbol}><button className={rowClass} onClick={() => addHit(h)}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium" dir="auto">{h.name}</span><span className="block truncate text-xs text-ink-soft"><span className="num">{h.symbol}</span> · {h.exchange}</span></span>
                    {px[h.symbol] && <span className="num shrink-0 text-sm">{num(px[h.symbol].price, 2)} <span className="text-[11px] text-ink-soft">{px[h.symbol].currency}</span></span>}
                  </button></li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {!rows.some((r) => !r.symbol && r.assetClass === 'CASH') && <button className="btn-ghost min-h-[40px] px-4" onClick={() => addUnpriced(L('نقد', 'Cash'), true)}>{L('+ نقد', '+ Cash')}</button>}
              {q && /\p{L}/u.test(q) && <button className="btn-ghost min-h-[40px] px-4" onClick={() => addUnpriced(q, false)}>{L(`+ «${q}» بدون سعر سوق`, `+ “${q}” with no market price`)}</button>}
            </div>
            <p className="hint">{editing
              ? L('تغيير القيمة وحده يكبّر كل المكوّنات أو يصغّرها بنفس النسبة. تغيير النِّسب يعيد توزيع حصتك عليها بأسعار اليوم.', 'Changing only the value scales every component by the same factor. Changing the weights re-splits your share across them at today’s prices.')
              : L('بعد الإنشاء تتحرك النِّسب الفعلية مع الأسعار، وتقدر تحدّث قيمة حصتك أو النِّسب بأي وقت.', 'Once created, the actual weights drift with prices, and you can update your share’s value or the weights at any time.')}</p>
          </section>

          {editing && <button className="btn-danger w-full" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />{L('حذف المحفظة', 'Delete the portfolio')}</button>}
        </div>
      </Sheet>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title={L('حذف المحفظة؟', 'Delete the portfolio?')}
        body={L(`ستُحذف «${account?.name ?? ''}» وكل مكوّناتها نهائيًا.`, `“${account?.name ?? ''}” and all its components will be permanently deleted.`)}
        confirmLabel={L('حذف', 'Delete')} onConfirm={() => { if (account) deleteAccount(account.id); onClose() }} />
    </>
  )
}
