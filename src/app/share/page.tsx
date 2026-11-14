'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { CLASS_COLOR, CLASS_LABEL } from '@/lib/labels'
import { decodeShare, type SharePayload } from '@/lib/engine/share'
import { dateLabel, num, pct } from '@/lib/format'
import { BarList, Meter, SegBar } from '@/components/charts'
import { Disclaimer, Empty } from '@/components/ui'
import { Share2 } from 'lucide-react'

export default function SharePage() {
  const { L, settings } = useStore()
  const [payload, setPayload] = useState<SharePayload | null | undefined>(undefined)
  useEffect(() => {
    const read = () => setPayload(decodeShare(window.location.hash))
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])

  if (payload === undefined) return null
  if (payload === null) {
    return <Empty icon={<Share2 className="h-7 w-7" />} title={L('رابط المشاركة غير صالح', 'This share link is not valid')} body={L('قد يكون الرابط مقطوعًا. اطلب من صاحبه إرساله كاملًا.', 'The link may be truncated. Ask the sender for the full link.')} />
  }

  const classes = payload.c.map(([k, p]) => ({ key: k, label: L(CLASS_LABEL[k]?.ar ?? k, CLASS_LABEL[k]?.en ?? k), pct: p, color: CLASS_COLOR[k] ?? '#6250d6' }))
  const list = (rows: [string, number][]) => rows.map(([label, p]) => ({ key: label, label, value: 0, pct: p }))

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs text-ink-soft">{L('لقطة للقراءة فقط', 'Read-only snapshot')} · {dateLabel(payload.d, settings.locale)}</p>
        <h1 className="mt-1 text-2xl font-bold">{payload.n || L('محفظة استثمارية', 'Investment portfolio')}</h1>
        {payload.t !== undefined && <p className="mt-1 text-lg font-semibold"><span className="num">{num(payload.t, 0)}</span> <span className="text-sm text-ink-soft">{L('ر.س', 'SAR')}</span></p>}
      </header>

      <section className="card">
        <h2 className="section-title">{L('حسب فئة الأصل', 'By asset class')}</h2>
        <div className="mt-3"><SegBar parts={classes} /></div>
        <ul className="mt-3 space-y-2">
          {classes.map((c) => (
            <li key={c.key} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} aria-hidden />{c.label}</span>
              <span className="num font-semibold">{pct(c.pct)}</span>
            </li>
          ))}
        </ul>
      </section>

      {payload.r.length > 0 && <section className="card"><h2 className="section-title mb-3">{L('حسب الجغرافيا', 'By geography')}</h2><BarList showAmounts={false} items={list(payload.r)} /></section>}
      {payload.s.length > 0 && <section className="card"><h2 className="section-title mb-3">{L('قطاعات الأسهم', 'Equity sectors')}</h2><BarList showAmounts={false} items={list(payload.s)} /></section>}
      {payload.h.length > 0 && (
        <section className="card"><h2 className="section-title mb-3">{L('أكبر المراكز', 'Largest positions')}</h2>
          <BarList showAmounts={false} items={payload.h.map(([name, p, k]) => ({ key: name, label: name, value: 0, pct: p, color: CLASS_COLOR[k] }))} />
        </section>
      )}
      {payload.g !== undefined && (
        <section className="card">
          <div className="mb-2 flex items-baseline justify-between"><h2 className="section-title">{L('التقدم نحو الهدف', 'Progress to goal')}</h2><span className="num text-sm font-bold">{pct(payload.g, 0)}</span></div>
          <Meter value={payload.g} label={L('التقدم نحو الهدف', 'Progress to goal')} />
        </section>
      )}
      <Disclaimer>{L('لقطة شاركها صاحب المحفظة في تاريخها ولا تتحدث تلقائيًا. ليست توصية استثمارية.', 'A snapshot shared by the portfolio owner on that date; it does not update. Not investment advice.')}</Disclaimer>
    </div>
  )
}
