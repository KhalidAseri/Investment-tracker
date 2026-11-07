import { useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { PortfolioTabs } from './Portfolio'
import { useDerived } from '../lib/derived'
import { usePlan } from '../lib/usePlan'
import { holdingValue } from '../lib/calc'
import { dateLong, pct, sar, sarShort } from '../lib/format'
import { GOAL_PRESETS, presetForYears, requiredMonthly, type GoalStatus } from '../lib/profile'
import { openAction } from '../lib/ui'
import type { Goal, GoalBucket, GoalKind, Holding } from '../lib/types'
import { Empty, NumberField, Segmented, Sheet, TextField } from '../components/ui'
import { Money, Pct } from '../components/kit'
import { monthsText } from '../components/PlanSheets'
import { IconBuilding, IconClose, IconPlus, IconShield } from '../components/icons'
import { HoldingSheet } from './Holdings'

const monthsLeftText = (m: number | null) => (m == null ? 'بلا موعد' : m === 0 ? 'هذا الشهر' : m < 12 ? `بعد ${m} ${m <= 10 ? 'أشهر' : 'شهراً'}` : `بعد ${(m / 12).toFixed(m % 12 ? 1 : 0)} سنة`)

type Special = Exclude<GoalKind, 'goal'>
/** the two goals the plan knows by kind: the emergency fund and the income treasury (kept outside the main portfolio) */
export const KIND_NAME: Record<Special, string> = { emergency: 'صندوق الطوارئ', income: 'خزانة الدخل' }
const CASH: GoalBucket[] = [{ key: 'cash', name: 'سيولة', weight: 100 }]
const isSpecial = (g: Pick<Goal, 'kind'>): g is Goal & { kind: Special } => g.kind === 'emergency' || g.kind === 'income'

function KindBadge({ kind }: { kind: Special }) {
  return kind === 'emergency'
    ? <span className="chip accent"><IconShield width={14} height={14} /> {KIND_NAME.emergency}</span>
    : <span className="chip" style={{ background: 'color-mix(in srgb, var(--income) 14%, transparent)', color: 'var(--income)' }}><IconBuilding width={14} height={14} /> {KIND_NAME.income}</span>
}

export default function Goals() {
  const { goals, holdings, fx, readOnly, accounts } = useStore()
  const d = useDerived()
  const { doc, progress } = usePlan()
  const [editing, setEditing] = useState<Partial<Goal> | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [holding, setHolding] = useState<Partial<Holding> | null>(null)
  if (!d) return null
  const special = d.goalStats.filter((st) => isSpecial(st.goal)).sort((a, b) => (a.goal.kind === 'emergency' ? -1 : 1) - (b.goal.kind === 'emergency' ? -1 : 1))
  const active = d.goalStats.filter((st) => !isSpecial(st.goal))
  const archived = goals.filter((g) => g.archived)
  const totalNeed = active.reduce((a, g) => a + g.need, 0)
  const has = (k: Special) => goals.some((g) => g.kind === k && !g.archived)
  // the plan defines a reserve that has no goal yet: offer to create it
  const missing = (['emergency', 'income'] as const).filter((k) => !has(k) && (k === 'emergency' ? !!doc?.emergency : !!doc?.income))
  const defaultAccount = accounts.find((a) => !a.exclude_from_portfolio)?.id ?? null

  const newGoal = (kind: GoalKind = 'goal') => {
    const p = GOAL_PRESETS[1]
    setEditing(kind === 'goal'
      ? { kind, name: '', target_amount: 0, target_date: null, expected_return: p.expected, allocation: p.buckets, priority: goals.length + 1, sort: goals.length + 1 }
      : { kind, name: KIND_NAME[kind], target_amount: 0, target_date: null, expected_return: 0, allocation: CASH, priority: 1, sort: kind === 'emergency' ? -2 : -1 })
  }

  const specialView = (st: GoalStatus): SpecialView => {
    const g = st.goal
    if (g.kind === 'emergency') {
      const e = progress?.emergency
      const target = e && e.target > 0 ? e.target : Number(g.target_amount)
      const fromPlan = !!doc?.emergency && doc.emergency.months > 0 && doc.emergency.monthly_expense > 0
      return {
        kind: 'emergency', value: st.value, target,
        sub: <>
          {e?.coverMonths != null ? <>يغطي {monthsText(e.coverMonths)}{doc?.emergency?.months ? ` من ${doc.emergency.months}` : ''} من مصروفك</> : null}
          {fromPlan ? ' · الهدف من خطتك' : e?.coverMonths == null && 'حدّد مصروفك الشهري في الخطة ليُحسب الهدف'}
        </>,
        ctas: readOnly ? null : <button className="btn primary small" onClick={() => openAction('emergency')}>{target > st.value + 0.5 ? 'أكمله' : 'أضف إليه'}</button>,
      }
    }
    const t = progress?.treasury
    const target = t && t.target > 0 ? t.target : Number(g.target_amount)
    return {
      kind: 'income', value: st.value, target,
      sub: <>
        {t && t.monthlyIncome > 0 ? <>دخلك الشهري <Money v={t.monthlyIncome} /></> : 'حدّد قاعدة الدخل في خطتك'}
        {t?.coverMonths != null && t.monthlyIncome > 0 && <> · تغطي {monthsText(t.coverMonths)}{doc?.income?.treasury_months ? ` من ${doc.income.treasury_months}` : ''}</>}
      </>,
      ctas: readOnly ? null : <>
        <button className="btn primary small" onClick={() => openAction('treasury')}>انقل إليها</button>
        {t?.started && <button className="btn soft small" onClick={() => openAction('withdraw')}>حوّل الدخل الشهري</button>}
      </>,
    }
  }

  return (
    <>
      <PortfolioTabs active="goals" />

      {(special.length > 0 || (missing.length > 0 && !readOnly)) && (
        <section style={{ marginBottom: 22 }}>
          <div className="section-head"><h2>احتياطيات خطتك</h2></div>
          {special.map((st) => (
            <GoalCard key={st.goal.id} st={st} special={specialView(st)} open={open === st.goal.id} onToggle={() => setOpen(open === st.goal.id ? null : st.goal.id)}
              items={holdings.filter((h) => h.goal_id === st.goal.id && !h.archived)} fxValue={(h) => holdingValue(h, fx)}
              onEdit={() => setEditing(st.goal)} onHolding={(h) => setHolding(h)} readOnly={readOnly} defaultAccount={defaultAccount} />
          ))}
          {!readOnly && missing.map((k) => (
            <button key={k} type="button" className="goal-card" style={{ borderStyle: 'dashed', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 10, marginTop: special.length ? 12 : 0 }} onClick={() => newGoal(k)}>
              <IconPlus width={18} height={18} /><span className="grow">أنشئ {KIND_NAME[k]}<span className="small muted" style={{ display: 'block' }}>خطتك تحدده؛ أنشئه لتتابع رصيده هنا</span></span>
            </button>
          ))}
        </section>
      )}

      <p className="muted" style={{ marginBottom: 14 }}>محافظ منفصلة لأهداف لها مبلغ وموعد، مثل دفعة بيت أو سيارة. لا تدخل في أوزان المحفظة الرئيسية.</p>

      {active.length > 0 && (
        <div className="facts" style={{ marginTop: 0, marginBottom: 18 }}>
          <div className="fact"><div className="v">{active.length}</div><div className="l">{active.length === 1 ? 'هدف نشط' : 'أهداف نشطة'}</div></div>
          <div className="fact"><div className="v">{sarShort(active.reduce((a, g) => a + g.value, 0))}</div><div className="l">مجموع ما ادّخرته لها</div></div>
          <div className="fact"><div className="v">{sarShort(totalNeed)}</div><div className="l">تحتاجها شهرياً</div></div>
        </div>
      )}

      <div className="section-head"><h2>أهدافك</h2>{!readOnly && <button className="btn primary small" onClick={() => newGoal()}><IconPlus /> هدف جديد</button>}</div>
      {active.length === 0 && <div className="panel"><Empty title="لا أهداف بعد"><p className="small" style={{ marginTop: 6 }}>أنشئ هدفاً بمبلغه وموعده، ويقترح التطبيق توزيعاً مناسباً لمدته ومبلغاً شهرياً يوصلك إليه.</p></Empty></div>}

      {active.map((st) => (
        <GoalCard key={st.goal.id} st={st} open={open === st.goal.id} onToggle={() => setOpen(open === st.goal.id ? null : st.goal.id)}
          items={holdings.filter((h) => h.goal_id === st.goal.id && !h.archived)} fxValue={(h) => holdingValue(h, fx)}
          onEdit={() => setEditing(st.goal)} onHolding={(h) => setHolding(h)} readOnly={readOnly} defaultAccount={defaultAccount} />
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

interface SpecialView { kind: Special; value: number; target: number; sub: ReactNode; ctas: ReactNode }

function GoalCard({ st, special, open, onToggle, items, fxValue, onEdit, onHolding, readOnly, defaultAccount }: {
  st: GoalStatus; special?: SpecialView; open: boolean; onToggle: () => void; items: Holding[]; fxValue: (h: Holding) => number
  onEdit: () => void; onHolding: (h: Partial<Holding>) => void; readOnly: boolean; defaultAccount: string | null
}) {
  const g = st.goal
  const buckets: GoalBucket[] = Array.isArray(g.allocation) && g.allocation.length ? g.allocation : [{ key: 'main', name: 'الأصول', weight: 100 }]
  const byBucket = (key: string) => items.filter((h) => (h.goal_bucket ?? buckets[0].key) === key).reduce((a, h) => a + fxValue(h), 0)
  const target = special ? special.target : Number(g.target_amount)
  const progress = target > 0 ? Math.min(1, st.value / target) : 0
  const left = Math.max(0, target - st.value)
  const showName = special && g.name.trim() !== KIND_NAME[special.kind]
  return (
    <div className="goal-card" role="group" aria-label={g.name}>
      <button type="button" onClick={onToggle} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }} aria-expanded={open}>
        <div className="row between" style={{ gap: 10 }}>
          {special ? <KindBadge kind={special.kind} /> : <b style={{ fontSize: 17 }}>{g.name}</b>}
          {special
            ? (target > 0 && <span className="small figure">{left <= 0.5 ? <span className="good">اكتمل</span> : <Pct v={progress * 100} digits={0} />}</span>)
            : <span className="small muted">{monthsLeftText(st.months)}{g.target_date ? ` · ${dateLong(g.target_date)}` : ''}</span>}
        </div>
        {showName && <b style={{ display: 'block', fontSize: 16, marginTop: 8 }}>{g.name}</b>}
        <div className="row between small" style={{ margin: '10px 0 6px' }}>
          {special
            ? <span><b className="figure" style={{ fontSize: 17 }}><Money v={st.value} /></b>{target > 0 && <> من <Money v={target} /></>}</span>
            : <><span><b className="figure">{sar(st.value)}</b> من {sar(target)}</span><span className="figure">{pct(progress * 100, 0)}</span></>}
        </div>
        {(target > 0 || !special) && <div className="progress"><i style={{ width: `${progress * 100}%` }} /></div>}
        <p className="small" style={{ marginTop: 10 }}>
          {special ? <span className="muted">{special.sub}</span>
            : left <= 0 ? <span className="good">اكتمل المبلغ. انقل الأصول إلى سيولة قبل الموعد بوقت كافٍ.</span>
            : st.months == null ? 'حدّد موعداً ليُحسب المبلغ الشهري.'
            : <>تحتاج <b className="figure">{sar(st.need)}</b> شهرياً بعائد متوقع {pct(Number(g.expected_return))}.</>}
        </p>
      </button>
      {special?.ctas && <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>{special.ctas}</div>}
      {open && (
        <div className="stack" style={{ marginTop: 12, gap: 10 }}>
          <hr className="rule" style={{ margin: 0 }} />
          {!special && buckets.map((b) => {
            const v = byBucket(b.key)
            const actual = st.value > 0 ? (v / st.value) * 100 : 0
            return (
              <div key={b.key}>
                <div className="row between small"><span>{b.name}</span><span><b className="figure">{sar(v)}</b> · {pct(actual, 0)} والهدف {pct(b.weight, 0)}</span></div>
                <div className="progress" style={{ height: 6, marginTop: 4 }}><i style={{ width: `${Math.min(100, actual)}%`, opacity: 0.8 }} /></div>
              </div>
            )
          })}
          {items.length > 0 ? (
            <div className="panel flush">
              {items.map((h) => (
                <button key={h.id} className="list-item" onClick={() => !readOnly && onHolding(h)} style={readOnly ? { cursor: 'default' } : undefined}>
                  <div className="grow"><div>{h.name}</div><div className="meta">{buckets.find((b) => b.key === h.goal_bucket)?.name ?? buckets[0].name}</div></div>
                  <div className="amount">{sar(fxValue(h))}</div>
                </button>
              ))}
            </div>
          ) : special && <p className="small muted">لا أصول فيه بعد؛ أول مبلغ تضيفه يُنشئ له رصيداً نقدياً.</p>}
          {!readOnly && (
            <div className="row wrap" style={{ gap: 8 }}>
              <button className="btn ghost small" onClick={() => onHolding({ name: '', price_source: 'manual', currency: 'SAR', quantity: 1, price: 0, zakatable: true, goal_id: g.id, goal_bucket: buckets[0].key, account_id: defaultAccount, sleeve_id: null, payout_freq: 'none', payout_basis: 'rate' })}><IconPlus /> أصل {special ? 'فيه' : 'لهذا الهدف'}</button>
              <button className="btn quiet small" onClick={onEdit}>{special ? 'تعديل' : 'تعديل الهدف'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GoalSheet({ initial, onClose }: { initial: Partial<Goal>; onClose: () => void }) {
  const { upsert, remove, notify, holdings, goals } = useStore()
  const { progress } = usePlan()
  const [g, setG] = useState<Partial<Goal>>({ kind: 'goal', ...initial })
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }))
  const kind: GoalKind = g.kind ?? 'goal'
  const special = kind !== 'goal'
  const buckets = g.allocation ?? []
  const years = g.target_date ? (new Date(g.target_date).getTime() - Date.now()) / (365.25 * 86400000) : null
  const suggested = years != null ? presetForYears(years) : null
  const sum = buckets.reduce((a, b) => a + Number(b.weight || 0), 0)
  const presetKey = GOAL_PRESETS.find((p) => JSON.stringify(p.buckets) === JSON.stringify(buckets))?.key ?? 'custom'
  const months = g.target_date ? Math.max(0, Math.round((new Date(g.target_date).getTime() - Date.now()) / (30.44 * 86400000))) : null
  const used = holdings.filter((h) => h.goal_id === g.id).length
  // at most one goal of each special kind
  const taken = (k: Special) => goals.some((x) => x.kind === k && !x.archived && x.id !== g.id)
  const kinds: Array<{ value: GoalKind; label: string }> = [
    { value: 'goal', label: 'هدف عادي' },
    ...(['emergency', 'income'] as const).filter((k) => !taken(k)).map((k) => ({ value: k as GoalKind, label: KIND_NAME[k] })),
  ]
  const planTarget = kind === 'emergency' ? progress?.emergency.target ?? 0 : kind === 'income' ? progress?.treasury.target ?? 0 : 0
  const pickKind = (k: GoalKind) => {
    const name = (g.name ?? '').trim()
    const isDefault = !name || Object.values(KIND_NAME).includes(name)
    set({ kind: k, ...(isDefault ? { name: k === 'goal' ? '' : KIND_NAME[k] } : {}), ...(k !== 'goal' && Math.abs(sum - 100) > 0.5 ? { allocation: CASH } : {}) })
  }

  const saveIt = async () => {
    if (!g.name?.trim()) { notify('اكتب اسم الهدف'); return }
    if (special && taken(kind as Special)) { notify(`يوجد ${KIND_NAME[kind as Special]} من قبل`); return }
    const alloc = special && Math.abs(sum - 100) > 0.5 ? CASH : buckets
    if (!special && Math.abs(sum - 100) > 0.5) { notify('اجعل مجموع التوزيع 100%'); return }
    const ok = await upsert('goals', {
      id: g.id, kind, name: g.name.trim(), target_amount: Number(g.target_amount ?? 0), target_date: special ? null : g.target_date || null,
      expected_return: special ? 0 : Number(g.expected_return ?? 5),
      allocation: alloc.map((b, i) => ({ key: b.key || `b${i}`, name: b.name.trim() || `جزء ${i + 1}`, weight: Number(b.weight) })), priority: g.priority ?? 1,
      note: g.note || null, archived: !!g.archived, sort: g.sort ?? 99,
    })
    if (ok) { notify(special ? `حُفظ ${KIND_NAME[kind as Special]}` : 'حُفظ الهدف'); onClose() }
  }
  const setBucket = (i: number, p: Partial<GoalBucket>) => set({ allocation: buckets.map((b, j) => (j === i ? { ...b, ...p } : b)) })

  return (
    <Sheet title={g.id ? (special ? `تعديل ${KIND_NAME[kind as Special]}` : 'تعديل هدف') : special ? KIND_NAME[kind as Special] : 'هدف جديد'} onClose={onClose} footer={<>
      {g.id && <button className="btn danger" onClick={async () => {
        if (confirm(used ? `حذف الهدف؟ أصوله (${used}) تعود إلى المحفظة الرئيسية.` : 'حذف الهدف؟')) { await remove('goals', g.id!); onClose() }
      }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        {kinds.length > 1 && (
          <div className="field">
            <span>النوع</span>
            <Segmented label="نوع الهدف" value={kind} onChange={pickKind} options={kinds} />
            {special && <small>{kind === 'emergency' ? 'احتياطي نقدي خارج المحفظة، هدفه من خطتك.' : 'نقد تصرف منه دخلك الشهري، وتصله التوزيعات.'}</small>}
          </div>
        )}
        <TextField label={special ? 'الاسم' : 'اسم الهدف'} value={g.name ?? ''} onChange={(v) => set({ name: v })} placeholder={special ? KIND_NAME[kind as Special] : 'مثال: الدفعة الأولى للبيت'} />
        {special ? (
          <NumberField label="المبلغ المستهدف" value={g.target_amount ?? 0} suffix="ريال" onChange={(v) => set({ target_amount: v })}
            hint={planTarget > 0 ? <>تستخدم الشاشات هدف خطتك <Money v={planTarget} /></> : 'يُستخدم حين لا تحدده الخطة'} />
        ) : (
          <div className="grid2">
            <NumberField label="المبلغ المستهدف" value={g.target_amount ?? 0} suffix="ريال" onChange={(v) => set({ target_amount: v })} />
            <label className="field"><span>الموعد</span><input className="input" type="date" value={g.target_date ?? ''} onChange={(e) => set({ target_date: e.target.value || null })} /></label>
          </div>
        )}
        {!special && <>
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
        </>}
        {g.id && (
          <label className="switch"><span>{special ? 'أرشفه' : 'أرشف الهدف (اكتمل أو أُلغي)'}</span>
            <input type="checkbox" role="switch" checked={!!g.archived} onChange={(e) => set({ archived: e.target.checked })} /></label>
        )}
        <TextField label="ملاحظة" value={g.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
