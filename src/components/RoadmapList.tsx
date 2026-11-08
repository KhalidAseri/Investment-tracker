// The build order (advisor.buildRoadmap) as a numbered vertical list: status, value against target, and on tap why it comes
// here, the instrument to buy (with alternatives and the sukuk tenor), the holdings inside it, and «اشتريته».
import { useState } from 'react'
import type { RoadmapItem } from '../lib/advisor'
import type { MarketInputs } from '../lib/marketTypes'
import { holdingValue } from '../lib/calc'
import { monthName } from '../lib/format'
import { haptic, layerColor, openAction } from '../lib/ui'
import { useStore } from '../lib/store'
import type { Layer } from '../lib/types'
import { Money } from './kit'
import { InstrumentCard, Ticker, shortName } from './InstrumentCard'
import { IconCheck } from './icons'
import './RoadmapList.css'

const monthYear = (iso: string) => `${monthName(Number(iso.slice(5, 7)) - 1)} ${iso.slice(0, 4)}`

/** colour of a roadmap item: reserves in the brand colour, sleeves by layer */
export const roadColor = (r: Pick<RoadmapItem, 'kind' | 'layer'>) =>
  r.kind === 'emergency' ? 'var(--accent)' : r.kind === 'treasury' ? 'var(--mint)' : layerColor(r.layer as Layer)

export function StatusPill({ r }: { r: RoadmapItem }) {
  switch (r.status) {
    case 'done': return <span className="rm-pill done"><IconCheck />مكتمل</span>
    case 'next': return <span className="rm-pill next">التالي</span>
    case 'building': return <span className="rm-pill building">قيد البناء</span>
    case 'waiting': return <span className="rm-pill waiting">{r.startAt ? <>ينتظر <Money v={r.startAt} short /></> : 'ينتظر'}</span>
    case 'later': return <span className="rm-pill waiting">لاحقاً</span>
    case 'missing': return <span className="rm-pill missing">ينقصه بيانات</span>
  }
}

export function RoadmapList({ items, market, onFix }: { items: RoadmapItem[]; market: MarketInputs; onFix?: (r: RoadmapItem) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const { readOnly, fx } = useStore()
  return (
    <ol className="rm">
      {items.map((r) => {
        const isOpen = open === r.key
        const sub = r.status === 'waiting'
          ? (r.startsOn ? `متوقعة نحو ${monthYear(r.startsOn)}` : 'تبدأ حين تكبر المحفظة')
          : r.status === 'later' && r.startsOn ? `يبدأ بناؤه في ${monthYear(r.startsOn)}` : null
        const inst = r.pick?.item ?? null
        return (
          <li key={r.key} className={`rm-item ${r.status} ${isOpen ? 'open' : ''}`}>
            <button type="button" className="rm-row" aria-expanded={isOpen} onClick={() => { haptic(); setOpen(isOpen ? null : r.key) }}>
              <span className="rm-n" style={{ ['--c' as string]: roadColor(r) }}>{r.status === 'done' ? <IconCheck /> : r.order}</span>
              <span className="rm-body">
                <span className="rm-top"><b>{r.title}</b><StatusPill r={r} /></span>
                {r.status !== 'missing' && r.target > 0 && (
                  <span className="rm-bar"><i style={{ width: `${Math.min(100, r.pct)}%`, background: roadColor(r) }} /></span>
                )}
                <span className="rm-sub">
                  {r.status === 'missing' ? r.why
                    : r.target > 0 ? <><Money v={r.value} short /> من <Money v={r.target} short />{r.remaining > 0.5 && r.status !== 'done' ? <> · ينقصه <Money v={r.remaining} short /></> : null}</>
                    : sub}
                  {sub && r.target > 0 && <span className="rm-when"> · {sub}</span>}
                </span>
                {!isOpen && inst && r.status !== 'done' && r.status !== 'missing' && (
                  <span className="rm-inst"><bdi>{shortName(inst.name)}</bdi>{inst.symbol && <> <Ticker v={inst.symbol} /></>}</span>
                )}
              </span>
            </button>
            {isOpen && (
              <div className="rm-more">
                <p className="rm-why">{r.why}</p>
                {r.pick && <InstrumentCard pick={r.pick} market={market} amount={r.remaining > 0.5 ? r.remaining : null} />}
                {r.pick && r.pick.alternatives.length > 0 && (
                  <p className="rm-alt">بدائل: {r.pick.alternatives.map((a, i) => <span key={a.id}>{i ? '، ' : ''}<bdi>{shortName(a.name)}</bdi>{a.symbol && <> <Ticker v={a.symbol} /></>}</span>)}</p>
                )}
                {r.holdings.length > 0 && (
                  <div className="rm-holds">
                    <span className="tiny muted">ما تملكه فيها</span>
                    {r.holdings.map((h) => (
                      <a key={h.id} className="rm-hold" href={`#/asset/${h.id}`} onClick={() => haptic()}>
                        <span>{h.name}</span><Money v={holdingValue(h, fx)} />
                      </a>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <div className="rm-ctas">
                    {r.status === 'missing'
                      ? onFix && <button type="button" className="btn soft small" onClick={() => onFix(r)}>أكمل البيانات</button>
                      : <>
                        <button type="button" className="btn primary small" onClick={() => openAction('buy', r.key)}>اشتريته</button>
                        {r.remaining > 0.5 && r.status !== 'done' && <a className="btn ghost small" href={`#/deposit/${Math.round(r.remaining)}`} onClick={() => haptic()}>خطّط المبلغ</a>}
                      </>}
                  </div>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
