'use client'

import { useMemo, useState } from 'react'
import { Layers, Pencil, Plus } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Account } from '@/lib/types'
import { CLASS_COLOR, KIND_LABEL } from '@/lib/labels'
import { daysAgo, num, pct } from '@/lib/format'
import AssetWizard from '@/components/AssetWizard'
import AssetSheet from '@/components/AssetSheet'
import { Confirm, Delta, Empty, Field, Money, Sheet } from '@/components/ui'

export default function AssetsPage() {
  const { L, data, view, renameAccount, deleteAccount } = useStore()
  const [adding, setAdding] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState(false)

  const groups = useMemo(() => {
    return data.accounts
      .map((account) => {
        const rows = view.rows.filter((r) => r.asset.accountId === account.id)
        return { account, rows, total: rows.reduce((s, r) => s + r.value, 0) }
      })
      .sort((a, b) => b.total - a.total)
  }, [data.accounts, view.rows])

  return (
    <>
      {data.assets.length === 0 ? (
        <Empty icon={<Layers className="h-7 w-7" />} title={L('أضف أول أصل', 'Add your first asset')}
          body={L('سهم، صندوق، ادخار جهة العمل، ذهب، نقد أو عقار. الأصول المدرجة تتحدث أسعارها تلقائيًا، والباقي تحدّث قيمته بضغطة.', 'A stock, fund, employer plan, gold, cash or property. Listed assets update automatically; the rest you update with one tap.')}
          action={<button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{L('إضافة أصل', 'Add asset')}</button>} />
      ) : (
        <>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-ink-soft">{L(`${data.assets.length} أصل في ${data.accounts.length} جهة`, `${data.assets.length} assets across ${data.accounts.length} providers`)}</p>
              <p className="text-2xl font-bold"><Money value={view.netWorth} /></p>
            </div>
            <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{L('أصل', 'Asset')}</button>
          </div>

          {groups.map(({ account, rows, total }) => (
            <section key={account.id} className="card p-0">
              <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold">{account.name}</h2>
                  <p className="text-xs text-ink-soft">{L(KIND_LABEL[account.kind].ar, KIND_LABEL[account.kind].en)} · <span className="num">{pct(view.netWorth > 0 ? (total / view.netWorth) * 100 : 0, 0)}</span></p>
                </div>
                <div className="flex items-center gap-1">
                  <Money value={total} className="text-sm font-semibold" />
                  <button onClick={() => { setEditAccount(account); setName(account.name) }} className="flex h-11 w-9 items-center justify-center text-ink-faint hover:text-ink" aria-label={L('تعديل الجهة', 'Edit provider')}><Pencil className="h-4 w-4" /></button>
                </div>
              </div>
              {rows.length === 0 && <p className="px-4 py-3 text-sm text-ink-soft">{L('لا أصول في هذه الجهة.', 'No assets here.')}</p>}
              <ul className="divide-y divide-line">
                {rows.map((r) => {
                  const a = r.asset
                  const age = daysAgo(a.valueUpdatedAt)
                  // Symbol and quantity are isolated so Latin tickers do not reorder inside Arabic text.
                  const sub = a.pricing === 'live'
                    ? <><span className="num">{a.symbol}</span> · <span className="num">{num(a.quantity, 'auto')}</span>{r.source === 'cost' ? ' · ' + L('بانتظار السعر', 'awaiting price') : r.source === 'cached' ? ' · ' + L('سعر محفوظ', 'saved price') : ''}</>
                    : L('قيمة يدوية', 'Manual') + (age !== null && age > 30 ? ' · ' + L(`لم تُحدَّث منذ ${age} يوم`, `not updated for ${age}d`) : '')
                  return (
                    <li key={a.id}>
                      <button onClick={() => setOpenId(a.id)} className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-start hover:bg-surface">
                        <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: CLASS_COLOR[a.assetClass] }} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-semibold">{a.name}</span>
                            {a.isEmergencyFund && <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">{L('طوارئ', 'Emergency')}</span>}
                          </span>
                          <span className={`block truncate text-xs ${a.pricing === 'manual' && age !== null && age > 30 ? 'text-warn-600' : 'text-ink-soft'}`}>{sub}</span>
                        </span>
                        <span className="shrink-0 text-end">
                          <Money value={r.value} className="block text-sm font-semibold" />
                          {r.cost > 0 && <Delta percent={r.gainPct} className="text-xs" />}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <AssetWizard open={adding} onClose={() => setAdding(false)} />
      <AssetSheet assetId={openId} onClose={() => setOpenId(null)} />

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
