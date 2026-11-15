'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import type { Asset, Transaction } from '@/lib/types'
import { fetchHistory, type HistoryRange, type PricePoint } from '@/lib/market-client'
import { manualIndex, performance, since, window } from '@/lib/engine/performance'
import { dateLabel, num, pct } from '@/lib/format'
import { LineChart } from './charts'
import { Chips, Delta, cx } from './ui'

const RANGES: HistoryRange[] = ['1m', '3m', '1y', '5y', 'max']

/** Price history and the figures read from it, for one asset. */
export default function AssetPerformance({ asset, txs, gainPct }: { asset: Asset; txs: Transaction[]; gainPct: number }) {
  const { L, settings } = useStore()
  const [range, setRange] = useState<HistoryRange>('1y')
  const [points, setPoints] = useState<PricePoint[] | null>(null)
  const live = asset.pricing === 'live' && !!asset.symbol

  useEffect(() => {
    if (!live) return
    let gone = false
    setPoints(null)
    // Fetch one range wide enough for the window, then cut locally: 5y and max need weekly/monthly data.
    fetchHistory(asset.symbol!, range === '1m' || range === '3m' ? '1y' : range).then((p) => { if (!gone) setPoints(p) })
    return () => { gone = true }
  }, [live, asset.symbol, range])

  // Manual assets: an index from the user's own value updates, with deposits and withdrawals taken out.
  const manual = useMemo(() => {
    if (live) return []
    let value = 0
    const events = [...txs].sort((a, b) => a.date.localeCompare(b.date)).flatMap((t) => {
      if (t.type !== 'DEPOSIT' && t.type !== 'WITHDRAW' && t.type !== 'VALUE_UPDATE') return []
      value = Math.max(0, value + t.dValue)
      return [{ day: t.date, type: t.type, amount: t.amount, valueAfter: value }]
    })
    return manualIndex(events)
  }, [live, txs])

  const series = useMemo(() => window(live ? points ?? [] : manual, since(range)), [live, points, manual, range])
  const perf = useMemo(() => performance(series), [series])
  const labels: Record<HistoryRange, string> = { '1m': L('شهر', '1M'), '3m': L('3 أشهر', '3M'), '1y': L('سنة', '1Y'), '5y': L('5 سنوات', '5Y'), max: L('الكل', 'All') }
  const firstBuy = txs.filter((t) => t.type === 'BUY').map((t) => t.date).sort()[0]

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="section-title">{L('الأداء', 'Performance')}</h3>
      </div>
      <Chips value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r, label: labels[r] }))} />

      {live && points === null ? (
        <div className="skeleton h-[170px]" aria-busy="true" />
      ) : series.length >= 2 ? (
        <LineChart points={series.map((p) => ({ x: p.day, y: p.close }))} label={L(`سعر ${asset.name}`, `${asset.name} price`)} height={170} />
      ) : (
        <p className="hint">{live
          ? L('لا يتوفر تاريخ أسعار لهذه الفترة بعد. للصناديق الاستثمارية يتراكم التاريخ مع كل تحديث يومي.', 'No price history for this period yet. For mutual funds the history builds up with each daily update.')
          : L('يظهر منحنى أداء هذا الأصل بعد تسجيل تحديثين للقيمة على الأقل.', 'A performance curve appears after at least two value updates.')}</p>
      )}

      {perf && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-surface p-3.5 text-sm">
          <div><dt className="text-xs text-ink-soft">{L(`عائد ${labels[range]}`, `${labels[range]} return`)}</dt><dd><Delta percent={perf.returnPct} className="text-base font-bold" /></dd></div>
          <div><dt className="text-xs text-ink-soft">{L('العائد السنوي المركّب', 'Annualised')}</dt><dd className="num font-bold">{perf.cagrPct === null ? '—' : pct(perf.cagrPct, 1, true)}</dd></div>
          {live && <>
            <div><dt className="text-xs text-ink-soft">{L('أعلى سعر', 'High')}</dt><dd className="num font-semibold">{num(perf.high.close, 2)} <span className="text-xs font-normal text-ink-soft">{dateLabel(perf.high.day, settings.locale)}</span></dd></div>
            <div><dt className="text-xs text-ink-soft">{L('أدنى سعر', 'Low')}</dt><dd className="num font-semibold">{num(perf.low.close, 2)} <span className="text-xs font-normal text-ink-soft">{dateLabel(perf.low.day, settings.locale)}</span></dd></div>
          </>}
          <div><dt className="text-xs text-ink-soft">{L('أقصى هبوط من قمة', 'Max drawdown')}</dt><dd className={cx('num font-semibold', perf.maxDrawdownPct < 0 && 'text-loss')}>{pct(perf.maxDrawdownPct, 1)}</dd></div>
          {live && <div><dt className="text-xs text-ink-soft">{L('بُعده عن القمة', 'Below the high')}</dt><dd className="num font-semibold">{pct(perf.fromHighPct, 1)}</dd></div>}
        </dl>
      )}
      <p className="hint">
        {L('عائدك أنت منذ الشراء', 'Your own return since buying')} <Delta percent={gainPct} className="text-xs" />
        {firstBuy && <> · {L('أول شراء', 'first buy')} {dateLabel(firstBuy, settings.locale)}</>}
        {live ? '' : ` · ${L('العائد هنا من تحديثات القيمة بعد استبعاد الإيداع والسحب.', 'Returns here come from value updates, excluding deposits and withdrawals.')}`}
      </p>
    </section>
  )
}
