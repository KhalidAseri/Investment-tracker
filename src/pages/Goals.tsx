import { useState } from 'react'
import { useStore } from '../lib/store'
import { PortfolioTabs } from './Portfolio'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { dateLong, pct, sar, sarShort } from '../lib/format'
import { GOAL_PRESETS, presetForYears, requiredMonthly, type GoalStatus } from '../lib/profile'
import type { Goal, GoalBucket, Holding } from '../lib/types'
import { Empty, NumberField, Segmented, Sheet, TextField } from '../components/ui'
import { IconClose, IconPlus } from '../components/icons'
import { HoldingSheet } from './Holdings'

const monthsText = (m: number | null) => (m == null ? 'بلا موعد' : m === 0 ? 'هذا الشهر' : m < 12 ? `بعد ${m} ${m <= 10 ? 'أشهر' : 'شهراً'}` : `بعد ${(m / 12).toFixed(m % 12 ? 1 : 0)} سنة`)

export default function Goals() {
  const { goals, holdings, fx, readOnly, accounts } = useStore()
  const d = useDerived()
  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [holding, setHolding] = useState<Partial<Holding> | null>(null)
  if (!d) return null
  const active = d.goalStats
  const archived = goals.filter((g) => g.archived)
  const totalNeed = active.reduce((a, g) => a + g.need, 0)

  const newGoal = () => {
    const p = GOAL_PRESETS[1]
    setEditing({ name: '', target_amount: 0, target_date: null, expected_return: p.expected, allocation: p.buckets, priority: goals.length + 1, sort: goals.length + 1 })
  }

  return (
    <>
      <PortfolioTabs active="goals" />
      <p className="muted" style={{ marginBottom: 14 }}>محافظ منفصلة لأهداف لها مبلغ وموعد، مثل دفعة بيت أو سيارة. لا تدخل في أوزان المحفظة الرئيسية.</p>

      {active.length > 0 && (
        <div className="facts" style={{ marginTop: 0, marginBottom: 18 }}>
          <div className="fact"><div className="v">{active.length}</div><div className="l">{active.length === 1 ? 'هدف نشط' : 'أهداف نشطة'}</div></div>
          <div className="fact"><div className="v">{sarShort(active.reduce((a, g) => a + g.value, 0))}</div><div className="l">مجموع ما ادّخرته لها</div></div>
          <div className="fact"><div className="v">{sarShort(totalNeed)}</div><div className="l">تحتاجها شهرياً</div></div>
        </div>
      )}

      <div className="section-head"><h2>أهدافك</h2>{!readOnly && <button className="btn primary small" onClick={newGoal}><IconPlus /> هدف جديد</button>}</div>
      {active.length === 0 && <div className="panel"><Empty title="لا أهداف بعد"><p className="small" style={{ marginTop: 6 }}>أنشئ هدفاً بمبلغه وموعده، ويقترح التطبيق توزيعاً مناسباً لمدته ومبلغاً شهرياً يوصلك إليه.</p></Empty></div>}

      {active.map((st) => (
        <GoalCard key={st.goal.id} st={st} open={open === st.goal.id} onToggle={() => setOpen(open === st.goal.id ? null : st.goal.id)}
          items={holdings.filter((h) => h.goal_id === st.goal.id && !h.archived)} fxValue={(h) => holdingValue(h, fx)}
          onEdit={() => setEditing(st.goal)} onHolding={(h) => setHolding(h)} readOnly={readOnly}
          defaultAccount={accounts.find((a) => !a.exclude_from_portfolio)?.id ?? null} />
      ))}

      {archived.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>أهداف مكتملة أو مؤرشفة</h2></div>
          <div className="panel flush">
            {archived.map((g) => (
              <button key={g.id} className="list-item" onClick={() => !readOnly && setEditing(g)}>
                <div className="grow"><div>{g.name}</div><div className="meta">{sar(Number(g.target_amount))}{g.target_date ? `، ${dateLong(g.target_date)}` : ''}</div></div>
              </button>
            ))}
          </div>
        </section>
      )}

      {editing && <GoalSheet initial={editing} onClose={() => setEditing(null)} />}
      {holding && <HoldingSheet initial={holding} onClose={() => setHolding(null)} />}
    </>
  )
}

function GoalCard({ st, open, onToggle, items, fxValue, onEdit, onHolding, readOnly, defaultAccount }: {
  st: GoalStatus; open: boolean; onToggle: () => void; items: Holding[]; fxValue: (h: Holding) => number
  onEdit: () => void; onHolding: (h: Partial<Holding>) => void; readOnly: boolean; defaultAccount: string | null
}) {
  const g = st.goal
  const buckets: GoalBucket[] = Array.isArray(g.allocation) && g.allocation.length ? g.allocation : [{ key: 'main', name: 'الأصول', weight: 100 }]
  const byBucket = (key: string) => items.filter((h) => (h.goal_bucket ?? buckets[0].key) === key).reduce((a, h) => a + fxValue(h), 0)
  const left = Math.max(0, Number(g.target_amount) - st.value)
  return (
    <div className="goal-card" role="group" aria-label={g.name}>
      <button type="button" onClick={onToggle} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }} aria-expanded={open}>
        <div className="row between" style={{ gap: 10 }}>
          <b style={{ fontSize: 17 }}>{g.name}</b>
          <span className="small muted">{monthsText(st.months)}{g.target_date ? ` · ${dateLong(g.target_date)}` : ''}</span>
        </div>
        <div className="row between small" style={{ margin: '10px 0 6px' }}>
          <span><b className="figure">{sar(st.value)}</b> من {sar(Number(g.target_amount))}</span>
          <span className="figure">{pct(st.progress * 100, 0)}</span>
        </div>
        <div className="progress"><i style={{ width: `${st.progress * 100}%` }} /></div>
        <p className="small" style={{ marginTop: 10 }}>
          {left <= 0 ? <span className="good">اكتمل المبلغ. انقل الأصول إلى سيولة قبل الموعد بوقت كافٍ.</span>
            : st.months == null ? 'حدّد موعداً ليُحسب المبلغ الشهري.'
            : <>تحتاج <b className="figure">{sar(st.need)}</b> شهرياً بعائد متوقع {pct(Number(g.expected_return))}.</>}
        </p>
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          <hr className="rule" style={{ margin: 0 }} />
          {buckets.map((b) => {
            const v = byBucket(b.key)
            const actual = st.value > 0 ? (v / st.value) * 100 : 0
            return (
              <div key={b.key}>
                <div className="row between small"><span>{b.name}</span><span><b className="figure">{sar(v)}</b> · {pct(actual, 0)} والهدف {pct(b.weight, 0)}</span></div>
                <div className="progress" style={{ height: 6, marginTop: 4 }}><i style={{ width: `${Math.min(100, actual)}%`, opacity: 0.8 }} /></div>
              </div>
            )
          })}
          {items.length > 0 && (
            <div className="panel flush">
              {items.map((h) => (
                <button key={h.id} className="list-item" onClick={() => !readOnly && onHolding(h)} style={readOnly ? { cursor: 'default' } : undefined}>
                  <div className="grow"><div>{h.name}</div><div className="meta">{buckets.find((b) => b.key === h.goal_bucket)?.name ?? buckets[0].name}</div></div>
                  <div className="amount">{sar(fxValue(h))}</div>
                </button>
              ))}
            </div>
          )}
          {!readOnly && (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn ghost small" onClick={() => onHolding({ name: '', price_source: 'manual', currency: 'SAR', quantity: 1, price: 0, zakatable: true, goal_id: g.id, goal_bucket: buckets[0].key, account_id: defaultAccount, sleeve_id: null, payout_freq: 'none', payout_basis: 'rate' })}><IconPlus /> أصل لهذا الهدف</button>
              <button className="btn quiet small" onClick={onEdit}>تعديل الهدف</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GoalSheet({ initial, onClose }: { initial: Partial<Goal>; onClose: () => void }) {
  const { upsert, remove, notify, holdings } = useStore()
  const [g, setG] = useState<Partial<Goal>>(initial)
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }))
  const buckets = g.allocation ?? []
  const years = g.target_date ? (new Date(g.target_date).getTime() - Date.now()) / (365.25 * 86400000) : null
  const suggested = years != null ? presetForYears(years) : null
  const sum = buckets.reduce((a, b) => a + Number(b.weight || 0), 0)
  const presetKey = GOAL_PRESETS.find((p) => JSON.stringify(p.buckets) === JSON.stringify(buckets))?.key ?? 'custom'
  const months = g.target_date ? Math.max(0, Math.round((new Date(g.target_date).getTime() - Date.now()) / (30.44 * 86400000))) : null
  const used = holdings.filter((h) => h.goal_id === g.id).length

  const saveIt = async () => {
    if (!g.name?.trim()) { notify('اكتب اسم الهدف'); return }
    if (Math.abs(sum - 100) > 0.5) { notify('اجعل مجموع التوزيع 100%'); return }
    const ok = await upsert('goals', {
      id: g.id, name: g.name.trim(), target_amount: Number(g.target_amount ?? 0), target_date: g.target_date || null, expected_return: Number(g.expected_return ?? 5),
      allocation: buckets.map((b, i) => ({ key: b.key || `b${i}`, name: b.name.trim() || `جزء ${i + 1}`, weight: Number(b.weight) })), priority: g.priority ?? 1,
      note: g.note || null, archived: !!g.archived, sort: g.sort ?? 99,
    })
    if (ok) { notify('حُفظ الهدف'); onClose() }
  }
  const setBucket = (i: number, p: Partial<GoalBucket>) => set({ allocation: buckets.map((b, j) => (j === i ? { ...b, ...p } : b)) })

  return (
    <Sheet title={g.id ? 'تعديل هدف' : 'هدف جديد'} onClose={onClose} footer={<>
      {g.id && <button className="btn danger" onClick={async () => {
        if (confirm(used ? `حذف الهدف؟ أصوله (${used}) تعود إلى المحفظة الرئيسية.` : 'حذف الهدف؟')) { await remove('goals', g.id!); onClose() }
      }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="اسم الهدف" value={g.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: الدفعة الأولى للبيت" />
        <div className="grid2">
          <NumberField label="المبلغ المستهدف" value={g.target_amount ?? 0} suffix="ريال" onChange={(v) => set({ target_amount: v })} />
          <label className="field"><span>الموعد</span><input className="input" type="date" value={g.target_date ?? ''} onChange={(e) => set({ target_date: e.target.value || null })} /></label>
        </div>
        <div className="field">
          <span>التوزيع</span>
          <Segmented label="التوزيع" value={presetKey} onChange={(k) => {
            const p = GOAL_PRESETS.find((x) => x.key === k)
            if (p) set({ allocation: p.buckets, expected_return: p.expected })
          }} options={[...GOAL_PRESETS.map((p) => ({ value: p.key, label: p.name })), ...(presetKey === 'custom' ? [{ value: 'custom', label: 'مخصص' }] : [])]} />
          <small>{suggested ? `لمدة ${years! < 1 ? 'أقل من سنة' : `${Math.round(years!)} ${years! < 2.5 ? 'سنة' : 'سنوات'}`} يناسب «${suggested.name}»: ${suggested.desc}.` : 'حدّد الموعد ليقترح التطبيق توزيعاً مناسباً لمدته.'}</small>
        </div>
        {buckets.map((b, i) => (
          <div key={i} className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div className="grow"><TextField label={i === 0 ? 'الجزء' : ''} value={b.name} onChange={(v) => setBucket(i, { name: v })} /></div>
            <div style={{ width: 120 }}><NumberField label={i === 0 ? 'الوزن' : ''} value={b.weight} suffix="%" onChange={(v) => setBucket(i, { weight: v })} /></div>
            <button className="icon-btn" aria-label="حذف الجزء" onClick={() => set({ allocation: buckets.filter((_, j) => j !== i) })}><IconClose /></button>
          </div>
        ))}
        <div className="row between">
          <button className="btn ghost small" onClick={() => set({ allocation: [...buckets, { key: `b${Date.now().toString(36)}`, name: '', weight: 0 }] })}><IconPlus /> جزء</button>
          <span className={`small ${Math.abs(sum - 100) > 0.5 ? 'bad' : 'muted'}`}>المجموع {pct(sum, 0)}</span>
        </div>
        <NumberField label="العائد المتوقع" value={g.expected_return ?? 5} suffix="%" decimals={1} onChange={(v) => set({ expected_return: v })} />
        {months != null && Number(g.target_amount) > 0 && (
          <p className="small">تحتاج نحو <b className="figure">{sar(requiredMonthly(Number(g.target_amount), 0, months, Number(g.expected_return ?? 5)))}</b> شهرياً من الصفر لتصل في الموعد.</p>
        )}
        {g.id && (
          <label className="switch"><span>أرشف الهدف (اكتمل أو أُلغي)</span>
            <input type="checkbox" role="switch" checked={!!g.archived} onChange={(e) => set({ archived: e.target.checked })} /></label>
        )}
        <TextField label="ملاحظة" value={g.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
