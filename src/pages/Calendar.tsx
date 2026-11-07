import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { upcoming } from '../lib/calc'
import { dateShort, monthName, relativeDays, sar, todayISO } from '../lib/format'
import type { EventKind, MoneyEvent } from '../lib/types'
import { NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus } from '../components/icons'

export const KIND_LABEL: Record<EventKind, string> = {
  bonus: 'مكافأة', advance: 'سلفة', vacation_bonus: 'مكافأة إجازة', vesting: 'استحقاق', zakat: 'زكاة',
  review: 'مراجعة', withdrawal: 'سحب', deposit: 'إيداع', other: 'أخرى',
}
const RECUR_LABEL = { none: 'مرة واحدة', monthly: 'كل شهر', yearly: 'كل سنة' } as const

export default function Calendar() {
  const { events } = useStore()
  const d = useDerived()
  const [editing, setEditing] = useState<Partial<MoneyEvent> | null>(null)
  const [range, setRange] = useState(365)
  const occ = useMemo(() => upcoming(events, todayISO(), range), [events, range])
  const groups = useMemo(() => {
    const m = new Map<string, typeof occ>()
    for (const o of occ) {
      const k = o.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), o])
    }
    return [...m.entries()]
  }, [occ])
  const later = events.filter((e) => e.recurrence === 'none' && !e.done && new Date(e.event_date).getTime() > Date.now() + range * 86400000)
  const inflowYear = occ.filter((o) => ['bonus', 'advance', 'vacation_bonus', 'deposit'].includes(o.event.kind)).reduce((a, o) => a + (o.event.amount ?? 0), 0)

  return (
    <>
      <div className="row wrap" style={{ gap: 10, marginBottom: 6 }}>
        <p className="grow muted">مواعيد الأموال الداخلة والخارجة. الدخل المتوقع للاستثمار خلال السنة القادمة: <b className="figure" style={{ color: 'var(--ink)' }}>{sar(inflowYear)}</b></p>
        <button className="btn primary small" onClick={() => setEditing({ title: '', kind: 'other', event_date: todayISO(), recurrence: 'none', amount: null, done: false })}><IconPlus /> موعد جديد</button>
      </div>
      {d?.fi && <p className="small muted">موعد الاستقلال المتوقع حسب مسارك الحالي: <b className="num">{Math.round(d.fi)}</b>.</p>}

      {groups.length === 0 && <div className="panel empty" style={{ marginTop: 20 }}><h3>لا مواعيد خلال هذه الفترة</h3><p>أضف موعد المكافأة أو تجديد السلفة أو الزكاة.</p></div>}
      {groups.map(([k, items]) => {
        const [y, m] = k.split('-').map(Number)
        return (
          <section className="section" key={k} style={{ marginTop: 22 }}>
            <div className="section-head"><h2>{monthName(m - 1)} {y}</h2></div>
            <div className="panel flush">
              {items.map((o, i) => (
                <button key={o.event.id + i} className="list-item" onClick={() => setEditing(o.event)}>
                  <div style={{ width: 70, flex: 'none', textAlign: 'center' }}>
                    <div className="figure" style={{ fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{Number(o.date.slice(8, 10))}</div>
                    <div className="tiny muted">{relativeDays(o.date)}</div>
                  </div>
                  <div className="grow">
                    <div>{o.event.title}</div>
                    <div className="meta">{KIND_LABEL[o.event.kind]}، {RECUR_LABEL[o.event.recurrence]}{o.event.note ? `، ${o.event.note}` : ''}</div>
                  </div>
                  {o.event.amount ? <div className="amount">{sar(o.event.amount)}</div> : null}
                </button>
              ))}
            </div>
          </section>
        )
      })}
      <div className="row" style={{ marginTop: 16, justifyContent: 'center' }}>
        {range < 3650 && <button className="btn ghost small" onClick={() => setRange((r) => (r < 1000 ? 1825 : 3650))}>اعرض {range < 1000 ? 'خمس سنوات' : 'عشر سنوات'}</button>}
      </div>
      {later.length > 0 && range < 3650 && (
        <p className="small muted" style={{ marginTop: 12, textAlign: 'center' }}>وبعدها: {later.map((e) => `${e.title} (${dateShort(e.event_date)} ${e.event_date.slice(0, 4)})`).join('، ')}</p>
      )}
      {editing && <EventSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function EventSheet({ initial, onClose }: { initial: Partial<MoneyEvent>; onClose: () => void }) {
  const { upsert, remove, notify } = useStore()
  const [e, setE] = useState<Partial<MoneyEvent>>(initial)
  const set = (p: Partial<MoneyEvent>) => setE((v) => ({ ...v, ...p }))
  const saveIt = async () => {
    if (!e.title?.trim()) { notify('اكتب عنوان الموعد'); return }
    const ok = await upsert('events', {
      id: e.id, title: e.title.trim(), kind: e.kind ?? 'other', event_date: e.event_date ?? todayISO(), amount: e.amount || null,
      recurrence: e.recurrence ?? 'none', done: !!e.done, note: e.note || null,
    })
    if (ok) { notify('حُفظ الموعد'); onClose() }
  }
  return (
    <Sheet title={e.id ? 'تعديل موعد' : 'موعد جديد'} onClose={onClose} footer={<>
      {e.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا الموعد؟')) { await remove('events', e.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="العنوان" value={e.title ?? ''} onChange={(v) => set({ title: v })} placeholder="مثال: المكافأة السنوية" />
        <div className="grid2">
          <SelectField<EventKind> label="النوع" value={(e.kind ?? 'other') as EventKind} onChange={(v) => set({ kind: v })}
            options={(Object.keys(KIND_LABEL) as EventKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          <SelectField label="التكرار" value={e.recurrence ?? 'none'} onChange={(v) => set({ recurrence: v as MoneyEvent['recurrence'] })}
            options={(Object.keys(RECUR_LABEL) as Array<keyof typeof RECUR_LABEL>).map((k) => ({ value: k, label: RECUR_LABEL[k] }))} />
        </div>
        <div className="grid2">
          <label className="field"><span>التاريخ</span><input className="input" type="date" value={e.event_date ?? ''} onChange={(ev) => set({ event_date: ev.target.value })} /></label>
          <NumberField label="المبلغ" value={e.amount ?? 0} suffix="ريال" onChange={(v) => set({ amount: v })} />
        </div>
        <TextField label="ملاحظة" value={e.note ?? ''} onChange={(v) => set({ note: v })} />
        {e.recurrence === 'none' && <Switch label="تم" checked={!!e.done} onChange={(v) => set({ done: v })} />}
      </div>
    </Sheet>
  )
}
