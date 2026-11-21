'use client'

import { useEffect, useMemo, useState } from 'react'
import { Layers, Pencil, Plus, Search, ArrowUpDown } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Account } from '@/lib/types'
import { ASSET_CLASSES, CLASS_LABEL, KIND_LABEL } from '@/lib/labels'
import { dividendStats, type AssetView } from '@/lib/engine/valuation'
import { dateLabel, num, pct } from '@/lib/format'
import { fetchHistory } from '@/lib/market-client'
import { assetFreshness } from '@/lib/engine/freshness'
import { isMutualFund } from '@/lib/catalog'
import { performance, since } from '@/lib/engine/performance'
import { useActions } from '@/components/AppShell'
import { BarList } from '@/components/charts'
import { Chips, Confirm, Delta, Empty, Field, Money, Sheet, Stat, Flash, ClassIcon } from '@/components/ui'

type Sort = 'value' | 'gain' | 'day' | 'year' | 'name'
type Group = 'account' | 'class'

export default function AssetsPage() {
  const { L, data, view, quotes, settings, renameAccount, deleteAccount } = useStore()
  const { openWizard, openAsset, openBasket } = useActions()
  const [tab, setTab] = useState<'assets' | 'income'>('assets')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('value')
  const [group, setGroup] = useState<Group>('account')
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [yearReturn, setYearReturn] = useState<Record<string, number | null>>({})

  // One-year return per priced asset, loaded only when that sort is chosen (histories are cached on the device).
  useEffect(() => {
    if (sort !== 'year') return
    let gone = false
    const live = data.assets.filter((a) => a.pricing === 'live' && a.symbol)
    Promise.all(live.map(async (a) => [a.id, performance((await fetchHistory(a.symbol!, '1y')).filter((p) => p.day >= (since('1y') ?? '')))?.returnPct ?? null] as const))
      .then((pairs) => { if (!gone) setYearReturn(Object.fromEntries(pairs)) })
    return () => { gone = true }
  }, [sort, data.assets])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const rows = view.rows.filter((r) => !needle || r.asset.name.toLowerCase().includes(needle) || (r.asset.symbol ?? '').toLowerCase().includes(needle))
    const order: Record<Sort, (a: AssetView, b: AssetView) => number> = {
      value: (a, b) => b.value - a.value, gain: (a, b) => b.gainPct - a.gainPct, day: (a, b) => b.dayChange - a.dayChange,
      year: (a, b) => (yearReturn[b.asset.id] ?? -Infinity) - (yearReturn[a.asset.id] ?? -Infinity), name: (a, b) => a.asset.name.localeCompare(b.asset.name, 'ar'),
    }
    const sorted = [...rows].sort(order[sort])
    const buckets = group === 'account'
      ? data.accounts.map((account) => ({ key: account.id, title: account.name, sub: account.basket ? L('محفظة بنِسب', 'Weighted portfolio') : L(KIND_LABEL[account.kind].ar, KIND_LABEL[account.kind].en), account: account as Account | null, rows: sorted.filter((r) => r.asset.accountId === account.id) }))
      : ASSET_CLASSES.map((c) => ({ key: c as string, title: L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), sub: '', account: null as Account | null, rows: sorted.filter((r) => r.asset.assetClass === c) }))
    return buckets.map((b) => ({ ...b, total: b.rows.reduce((s, r) => s + r.value, 0) })).filter((b) => b.rows.length > 0 || (group === 'account' && !needle)).sort((a, b) => b.total - a.total)
  }, [data.accounts, view.rows, q, sort, group, L, yearReturn])
  const divs = useMemo(() => dividendStats(data, view.cost), [data, view.cost])
  const divTotal = divs.byYear.reduce((s, y) => s + y.amount, 0)

  if (data.assets.length === 0) {
    return (
      <Empty icon={<Layers className="h-7 w-7" />} title={L('أضف أول أصل', 'Add your first asset')}
        body={L('سهم، صندوق، ادخار جهة العمل، ذهب، نقد أو عقار. الأصول المدرجة تتحدث أسعارها تلقائيًا، والباقي تحدّث قيمته بضغطة.', 'A stock, fund, employer plan, gold, cash or property. Listed assets update automatically; the rest you update with one tap.')}
        action={<button className="btn-primary" onClick={openWizard}><Plus className="h-4 w-4" />{L('إضافة أصل', 'Add asset')}</button>} />
    )
  }

  return (
    <>
      <div>
        <p className="text-[34px] font-semibold leading-none"><Money value={view.netWorth} /></p>
        <p className="mt-2 text-[13px] text-ink-soft">{L(`${data.assets.length} أصل في ${data.accounts.length} جهة`, `${data.assets.length} assets across ${data.accounts.length} providers`)}</p>
      </div>
      <Chips value={tab} onChange={setTab} options={[{ value: 'assets', label: L('الأصول', 'Assets') }, { value: 'income', label: L('التوزيعات', 'Dividends') }]} />

      {tab === 'assets' && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-faint" aria-hidden />
            <input className="input ps-10" type="search" enterKeyHint="search" placeholder={L('ابحث في أصولك', 'Search your assets')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={L('بحث في أصولك', 'Search your assets')} />
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1"><Chips value={group} onChange={setGroup} options={[{ value: 'account', label: L('حسب الجهة', 'By provider') }, { value: 'class', label: L('حسب الفئة', 'By class') }]} /></div>
            {/* a menu button: the native picker opens from it */}
            <div className="relative flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium text-link" style={{ backgroundColor: 'rgb(var(--fill) / 0.12)' }}>
              <ArrowUpDown className="h-4 w-4" aria-hidden />
              <span>{{ value: L('القيمة', 'Value'), gain: L('الربح', 'Gain'), day: L('اليوم', 'Today'), year: L('السنة', '1 year'), name: L('الاسم', 'Name') }[sort]}</span>
              <select className="absolute inset-0 h-full w-full cursor-pointer opacity-0" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={L('الترتيب', 'Sort')}>
                <option value="value">{L('الأعلى قيمة', 'Value')}</option>
                <option value="gain">{L('الأعلى ربحًا', 'Gain')}</option>
                <option value="day">{L('تغيّر اليوم', 'Today')}</option>
                <option value="year">{L('أداء السنة', '1-year return')}</option>
                <option value="name">{L('الاسم', 'Name')}</option>
              </select>
            </div>
          </div>

          {groups.map((g) => (
            <section key={g.key}>
              <div className="mb-2 flex items-end justify-between gap-2 px-1">
                <div className="min-w-0">
                  <h2 className="truncate text-[15px] font-semibold">{g.title}</h2>
                  <p className="text-[13px] text-ink-soft">{g.sub && `${g.sub} · `}<span className="num">{pct(view.netWorth > 0 ? (g.total / view.netWorth) * 100 : 0, 0)}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  <Money value={g.total} className="text-sm font-semibold" />
                  {g.account?.basket
                    ? <button onClick={() => openBasket(g.account!.id)} className="ms-1 flex min-h-[36px] items-center rounded-full bg-tint px-3 text-xs font-semibold text-link hover:bg-tint-2">{L('النِّسب والقيمة', 'Weights & value')}</button>
                    : g.account && <button onClick={() => { setEditAccount(g.account); setName(g.account!.name) }} className="flex h-11 w-9 items-center justify-center text-ink-faint hover:text-ink" aria-label={L('تعديل الجهة', 'Edit provider')}><Pencil className="h-4 w-4" /></button>}
                </div>
              </div>
              {g.rows.length === 0 && <p className="card text-sm text-ink-soft">{L('لا أصول في هذه الجهة.', 'No assets here.')}</p>}
              <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-card">
                {g.rows.map((r) => {
                  const a = r.asset
                  const f = assetFreshness(r, quotes)
                  const stale = f.state === 'stale' || f.state === 'missing'
                  const when = f.asOf ? dateLabel(f.asOf, settings.locale) : ''
                  const status = f.state === 'live' ? L('مباشر', 'live')
                    : f.state === 'published' ? L(`تقييم ${when}`, `valued ${when}`)
                    : f.state === 'missing' ? L('بانتظار السعر', 'awaiting price')
                    : f.state === 'stated' ? (a.pricing === 'manual' ? L('قيمة يدوية', 'manual value') : L('قيمة أدخلتها', 'value you entered'))
                    : a.pricing === 'manual' || f.needsUser ? L(`لم تُحدَّث منذ ${f.ageDays} يوم`, `not updated for ${f.ageDays}d`) : L(`آخر سعر ${when}`, `last price ${when}`)
                  // Symbol and quantity are isolated so Latin tickers do not reorder inside Arabic text.
                  const sub = a.pricing === 'live' && !isMutualFund(a.symbol)
                    ? <><span className="num">{a.symbol}</span> · {a.basketWeight != null ? <>{L('النسبة', 'weight')} <span className="num">{pct(a.basketWeight, a.basketWeight % 1 === 0 ? 0 : 1)}</span></> : <span className="num">{num(a.quantity, 'auto')}</span>} · {status}</>
                    : a.basketWeight != null ? <>{L('النسبة', 'weight')} <span className="num">{pct(a.basketWeight, a.basketWeight % 1 === 0 ? 0 : 1)}</span> · {status}</> : status
                  return (
                    <li key={a.id}>
                      <button onClick={() => openAsset(a.id)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-start">
                        <ClassIcon assetClass={a.assetClass} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <bdi className="truncate text-[15px] font-medium">{a.name}</bdi>
                            {a.isEmergencyFund && <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-link">{L('طوارئ', 'Emergency')}</span>}
                            {a.isIncomeAccount && <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-link">{L('دخل', 'Income')}</span>}
                          </span>
                          <span className={`block truncate text-[13px] ${stale ? 'text-warn-600' : 'text-ink-soft'}`}>{sub}</span>
                        </span>
                        <span className="shrink-0 text-end">
                          <Flash value={r.value} className="block"><Money value={r.value} className="text-[15px] font-semibold" /></Flash>
                          {sort === 'year' ? (yearReturn[a.id] != null ? <span className="text-xs text-ink-soft">{L('سنة', '1Y')} <Delta percent={yearReturn[a.id]!} className="text-xs" /></span> : <span className="text-xs text-ink-faint">—</span>)
                            : sort === 'day' && r.dayChange !== 0 ? <Delta value={r.dayChange} className="text-xs" /> : r.cost > 0 && <Delta percent={r.gainPct} className="text-xs" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
          {groups.length === 0 && <p className="py-6 text-center text-sm text-ink-soft">{L('لا نتائج.', 'No results.')}</p>}
        </>
      )}

      {tab === 'income' && (
        <>
          <section className="card">
            <h2 className="section-title">{L('دخل التوزيعات', 'Dividend income')}</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Stat label={L('آخر 12 شهرًا', 'Last 12 months')}><Money value={divs.ttm} /></Stat>
              <Stat label={L('متوسط شهري', 'Monthly average')}><Money value={divs.monthlyAvg} /></Stat>
              <Stat label={L('العائد على التكلفة', 'Yield on cost')}><span className="num">{pct(divs.yieldOnCost, 2)}</span></Stat>
              <Stat label={L('النمو السنوي', 'Yearly growth')} sub={divs.growthPct === null ? L('يحتاج سنتين كاملتين', 'Needs two full years') : undefined}><span className="num">{divs.growthPct === null ? '—' : pct(divs.growthPct, 1, true)}</span></Stat>
            </div>
            <p className="hint mt-3">{L('سجّل كل توزيعة من زر + ← «توزيعة أو عائد».', 'Record each dividend from the + button → “Dividend or income”.')}</p>
          </section>
          {divs.byYear.length > 0 && (
            <section className="card"><h2 className="section-title mb-3">{L('حسب السنة', 'By year')}</h2>
              <BarList items={divs.byYear.map((y) => ({ key: String(y.year), label: String(y.year), value: y.amount, pct: divTotal > 0 ? (y.amount / divTotal) * 100 : 0 }))} />
            </section>
          )}
          <section className="card">
            <h2 className="section-title mb-3">{L('حسب الأصل (كل الفترات)', 'By asset (all time)')}</h2>
            {divs.byAsset.length === 0 ? <p className="hint">{L('لا توزيعات مسجلة بعد.', 'No dividends recorded yet.')}</p> : (
              <ul className="divide-y divide-line">
                {divs.byAsset.map((d) => (
                  <li key={d.assetId} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.name}</span><span className="text-xs text-ink-soft">{L(`${d.count} توزيعة`, `${d.count} payments`)}</span></span>
                    <Money value={d.amount} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <Sheet open={!!editAccount} onClose={() => setEditAccount(null)} title={L('تعديل الجهة', 'Edit provider')} footer={
        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={!name.trim()} onClick={() => { if (editAccount) renameAccount(editAccount.id, name); setEditAccount(null) }}>{L('حفظ', 'Save')}</button>
          <button className="btn-danger" onClick={() => setConfirm(true)}>{L('حذف', 'Delete')}</button>
        </div>
      }>
        <Field label={L('اسم المنصة أو البنك', 'Platform or bank name')}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </Sheet>
      <Confirm open={confirm} onClose={() => setConfirm(false)} title={L('حذف الجهة؟', 'Delete provider?')}
        body={L(`سيُحذف «${editAccount?.name ?? ''}» مع كل أصوله وعملياته نهائيًا.`, `“${editAccount?.name ?? ''}” and all its assets and transactions will be permanently deleted.`)}
        confirmLabel={L('حذف', 'Delete')} onConfirm={() => { if (editAccount) deleteAccount(editAccount.id); setEditAccount(null) }} />
    </>
  )
}
