'use client'

import { useEffect, useMemo, useState } from 'react'
import { CircleCheck } from 'lucide-react'
import { useStore } from '@/lib/store'
import { assetFreshness } from '@/lib/engine/freshness'
import { fxRate } from '@/lib/engine/valuation'
import { todayISO } from '@/lib/labels'
import { dateLabel, num, pct } from '@/lib/format'
import { Meter } from './charts'
import { Money, NumberInput, Sheet, cx, haptic } from './ui'

/**
 * One asset at a time: the last value, a field for the new one, and «unchanged». It walks through
 * every hand-valued asset, the most out of date first, then offers to save the review snapshot.
 */
export default function QuickUpdate({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, data, view, quotes, settings, addTransaction, completeReview } = useStore()
  const [ids, setIds] = useState<string[]>([])
  const [i, setI] = useState(0)
  const [value, setValue] = useState(0)
  const [before, setBefore] = useState(0)
  const [changed, setChanged] = useState(0)
  const [saved, setSaved] = useState(false)

  // The list is fixed when the sheet opens, so saving an asset does not reshuffle what comes next.
  useEffect(() => {
    if (!open) return
    const now = Date.now()
    const rows = view.rows.filter((r) => r.asset.pricing === 'manual')
      .map((r) => ({ r, f: assetFreshness(r, quotes, now) }))
      .sort((a, b) => Number(b.f.needsUser) - Number(a.f.needsUser) || (b.f.ageDays ?? 0) - (a.f.ageDays ?? 0) || b.r.value - a.r.value)
    setIds(rows.map((x) => x.r.asset.id)); setI(0); setChanged(0); setSaved(false); setBefore(view.netWorth)
    setValue(rows[0]?.r.asset.manualValue ?? 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapshot on open only
  }, [open])

  const row = useMemo(() => view.rows.find((r) => r.asset.id === ids[i]) ?? null, [view.rows, ids, i])
  const done = open && i >= ids.length
  const a = row?.asset
  const diff = a ? value - a.manualValue : 0
  const fresh = row ? assetFreshness(row, quotes) : null

  const next = () => {
    const n = i + 1
    setI(n)
    const upcoming = view.rows.find((r) => r.asset.id === ids[n])
    setValue(upcoming?.asset.manualValue ?? 0)
  }
  const record = (amount: number) => {
    if (!a) return
    // «unchanged» is recorded too: it is what makes the figure current again
    addTransaction(a.id, { type: 'VALUE_UPDATE', date: todayISO(), quantity: 0, price: 0, amount })
    if (Math.abs(amount - a.manualValue) >= 0.005) setChanged((c) => c + 1)
    haptic()
    next()
  }

  return (
    <Sheet open={open} onClose={onClose} title={L('تحديث القيم', 'Update values')} footer={
      done ? (
        <div className="flex gap-2">
          {ids.length > 0 && !saved && <button className="btn-primary flex-1" onClick={() => { completeReview(''); setSaved(true) }}>{L('احفظ لقطة المراجعة', 'Save the review snapshot')}</button>}
          <button className={cx(ids.length > 0 && !saved ? 'btn-ghost' : 'btn-primary flex-1')} onClick={onClose}>{L('تم', 'Done')}</button>
        </div>
      ) : a ? (
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={() => record(a.manualValue)}>{L('لم يتغيّر', 'Unchanged')}</button>
          <button className="btn-primary flex-1" disabled={!(value > 0)} onClick={() => record(value)}>{i + 1 < ids.length ? L('حفظ والتالي', 'Save and next') : L('حفظ', 'Save')}</button>
        </div>
      ) : undefined
    }>
      {done ? (
        ids.length === 0 ? (
          <p className="text-sm leading-relaxed text-ink-soft">{L('لا أصول بقيمة يدوية عندك. الأصول المسعَّرة تتحدث وحدها.', 'You have no hand-valued assets. Priced assets update on their own.')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CircleCheck className="h-7 w-7 shrink-0 text-gain" aria-hidden />
              <p className="text-base font-semibold">{L(`راجعت ${ids.length} أصل، وتغيّرت قيمة ${changed}`, `${ids.length} reviewed, ${changed} changed`)}</p>
            </div>
            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-ink-soft">{L('صافي القيمة قبل', 'Net worth before')}</dt><dd><Money value={before} className="font-medium" /></dd></div>
              <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-ink-soft">{L('صافي القيمة الآن', 'Net worth now')}</dt><dd><Money value={view.netWorth} className="font-semibold" /></dd></div>
              <div className="flex justify-between gap-3 px-4 py-3"><dt className="text-ink-soft">{L('الفرق', 'Difference')}</dt><dd><Money value={view.netWorth - before} sign className={cx('font-semibold', view.netWorth >= before ? 'text-gain' : 'text-loss')} /></dd></div>
            </dl>
            {saved && <p className="hint">{L('حُفظت اللقطة وسُجّلت المراجعة.', 'The snapshot is saved and the review recorded.')}</p>}
          </div>
        )
      ) : a && row ? (
        <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-baseline justify-between text-xs text-ink-soft"><span>{L('الأصل', 'Asset')} <span className="num">{i + 1}</span> {L('من', 'of')} <span className="num">{ids.length}</span></span></div>
            <Meter value={(i / ids.length) * 100} label={L('التقدم', 'Progress')} />
          </div>
          <div>
            <p className="text-lg font-semibold leading-snug">{a.name}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {row.account?.name && <>{row.account.name} · </>}
              {L('آخر قيمة', 'Last value')} <span className="num font-medium text-ink">{num(a.manualValue, 0)}</span> {a.currency}
              {fresh?.asOf && <> · <span className={cx(fresh.state === 'stale' && 'text-warn-600')}>{fresh.ageDays === 0 ? L('اليوم', 'today') : L(`قبل ${fresh.ageDays} يوم`, `${fresh.ageDays}d ago`)}</span> ({dateLabel(fresh.asOf, settings.locale)})</>}
            </p>
          </div>
          <label className="block">
            <span className="label">{L('قيمته الآن', 'What it is worth now')}</span>
            <NumberInput key={a.id} value={value} onChange={setValue} suffix={a.currency} autoFocus />
          </label>
          <p className="min-h-[20px] text-sm text-ink-soft">
            {Math.abs(diff) >= 0.005 && value > 0 && <>{L('التغيّر', 'Change')} <span className={cx('num font-semibold', diff > 0 ? 'text-gain' : 'text-loss')}>{diff > 0 ? '+' : ''}{num(diff * fxRate(a.currency, settings.fx), 0)}{a.manualValue > 0 && ` (${pct((diff / a.manualValue) * 100, 1, true)})`}</span></>}
          </p>
          <p className="hint">{L('من كشف الحساب أو تطبيق الجهة. لا يغيّر المبلغ المستثمَر؛ الإيداع والسحب يُسجَّلان من صفحة الأصل.', 'From the statement or the provider’s app. It does not change the amount invested; deposits and withdrawals are recorded from the asset page.')}</p>
        </div>
      ) : null}
    </Sheet>
  )
}
