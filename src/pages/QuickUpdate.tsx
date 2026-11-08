// Monthly refresh of the values entered by hand: stalest first, inline inputs, one save for everything.
import { useId, useState } from 'react'
import type { Go } from '../App'
import { useStore } from '../lib/store'
import { holdingValue, rateOf } from '../lib/calc'
import { num0, parseNum, sar } from '../lib/format'
import { assetColor, haptic, usePrivacy } from '../lib/ui'
import type { Fx, Holding } from '../lib/types'
import { Avatar, Empty, Money, Pill } from '../components/kit'
import { IconCheck } from '../components/icons'
import { SignedSar, curLabel, dueText, isLump, isStale, updatedLabel } from './Asset'
import { overdueDays, updateEveryLabel } from '../lib/staleness'
import './QuickUpdate.css'

type Edit = { price: number | null; qty: number | null; ok: boolean }
const NONE: Edit = { price: null, qty: null, ok: false }
/** input text: grouped digits, up to four decimals for unit prices */
const fmtInput = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 4 })

function rowState(h: Holding, e: Edit, fx: Fx) {
  const lump = isLump(h)
  const price = e.price ?? Number(h.price)
  const qty = lump ? 1 : e.qty ?? Number(h.quantity)
  const before = holdingValue(h, fx)
  const after = qty * price * rateOf(h.currency, fx)
  return { h, e, lump, price, qty, before, after, changed: price !== Number(h.price) || qty !== Number(h.quantity) }
}
type RowState = ReturnType<typeof rowState>

const needLabel = (n: number) =>
  n === 1 ? 'أصل يحتاج تحديثاً' : n === 2 ? 'أصلان يحتاجان تحديثاً' : n <= 10 ? `${n} أصول تحتاج تحديثاً` : `${n} أصلاً تحتاج تحديثاً`

export default function QuickUpdate({ go }: { go: Go }) {
  const { holdings, accounts, sleeves, fx, upsert, notify, readOnly } = useStore()
  // the order is fixed when the screen opens, so rows don't jump while saving
  // due ones first (most overdue first), then the rest by how soon they fall due
  const [order] = useState(() => {
    const now = Date.now()
    return holdings
      .filter((h) => !h.archived && (h.price_source === 'manual' || h.price_source === 'nav') && Number(h.quantity) > 0)
      .map((h) => ({ h, od: overdueDays(h, now) ?? -Infinity }))
      .sort((a, b) => b.od - a.od || (a.h.price_updated_at ?? '').localeCompare(b.h.price_updated_at ?? ''))
      .map((x) => x.h.id)
  })
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState(false)

  if (readOnly) return <div className="card"><Empty title="التحديث لصاحب المحفظة" /></div>
  const items = order.map((id) => holdings.find((h) => h.id === id)).filter((h): h is Holding => !!h && !h.archived)
  if (!items.length) return (
    <div className="card">
      <Empty icon={<IconCheck />} title="كل أصولك تتحدث تلقائياً" text="لا توجد أصول تُدخل قيمتها بنفسك." action={{ label: 'العودة إلى المحفظة', href: '#/portfolio' }} />
    </div>
  )

  const rows = items.map((h) => rowState(h, edits[h.id] ?? NONE, fx))
  const toSave = rows.filter((r) => r.changed || r.e.ok)
  const net = rows.filter((r) => r.changed).reduce((a, r) => a + r.after - r.before, 0)
  const stale = items.filter(isStale).length
  const setEdit = (id: string, p: Partial<Edit>) => setEdits((x) => ({ ...x, [id]: { ...(x[id] ?? NONE), ...p } }))

  const saveAll = async () => {
    if (!toSave.length || busy) return
    haptic()
    setBusy(true)
    const now = new Date().toISOString()
    let failed = 0
    for (const r of toSave) {
      const ok = await upsert('holdings', r.changed
        ? { id: r.h.id, price: r.price, quantity: r.qty, price_updated_at: now }
        : { id: r.h.id, price_updated_at: now })
      if (!ok) failed++
    }
    setBusy(false)
    if (failed) return // the store has already said what went wrong; unsaved rows keep their input
    notify(toSave.length === 1 ? 'حُفظ التحديث' : `حُفظت التحديثات (${toSave.length})`)
    if (history.length > 1) history.back(); else go('portfolio')
  }

  return (
    <div className="qu">
      <div className="qu-intro">
        <p>حدّث ما تغيّر، وأكّد ما بقي على حاله.</p>
        {stale > 0 && <span className="chip warn">{needLabel(stale)}</span>}
      </div>
      {[{ key: 'due', title: 'مستحق الآن', list: rows.filter((r) => isStale(r.h)) }, { key: 'later', title: 'لاحقاً', list: rows.filter((r) => !isStale(r.h)) }]
        .filter((g) => g.list.length > 0).map((g) => (
          <section key={g.key} className="qu-group">
            <h3 className={`qu-gh ${g.key}`}>{g.title}<span>{g.list.length}</span></h3>
            <div className="qu-list">
              {g.list.map((r) => (
                <UpdateRow key={r.h.id} r={r} color={assetColor(r.h, sleeves)} account={accounts.find((a) => a.id === r.h.account_id)?.name ?? null}
                  onEdit={(p) => setEdit(r.h.id, p)} />
              ))}
            </div>
          </section>
        ))}
      <div className="qu-bar">
        {Math.abs(net) >= 1 && <span className="qu-net">التغيّر<b className={net > 0 ? 'good' : 'bad'}><SignedSar v={net} /></b></span>}
        <button type="button" className="btn primary" disabled={!toSave.length || busy} onClick={saveAll}>
          {busy ? 'جارٍ الحفظ…' : toSave.length ? `احفظ التحديثات (${toSave.length})` : 'احفظ التحديثات'}
        </button>
      </div>
    </div>
  )
}

function UpdateRow({ r, color, account, onEdit }: { r: RowState; color: string; account: string | null; onEdit: (p: Partial<Edit>) => void }) {
  const { h, e, lump, before, after, changed } = r
  const [hidden] = usePrivacy()
  // the current figures are hints inside the inputs, kept out of sight when amounts are hidden
  const hint = (s: string) => (hidden ? '' : s)
  const cur = curLabel(h.currency)
  const diff = after - before
  const sub = [h.price_source === 'nav' && h.update_every_days == null ? 'يتحدث من مباشر' : updateEveryLabel(h), account].filter(Boolean).join(' · ')
  const due = dueText(h)
  return (
    <article className={`qu-item ${changed ? 'is-changed' : e.ok ? 'is-ok' : ''}`}>
      <div className="qu-head">
        <Avatar name={h.name} color={color} size={40} />
        <div className="qu-name">
          <b>{h.name}</b>
          {sub && <span>{sub}</span>}
        </div>
        <Money v={before} className="qu-now" />
      </div>
      <div className={`qu-inputs ${lump ? 'one' : ''}`}>
        {lump ? (
          <LiveNumber label="القيمة الجديدة" placeholder={hint(num0(Number(h.price)))} suffix={cur} onChange={(v) => onEdit({ price: v, ok: false })} />
        ) : <>
          <LiveNumber label="سعر الوحدة" placeholder={hint(fmtInput(Number(h.price)))} suffix={cur} onChange={(v) => onEdit({ price: v, ok: false })} />
          <LiveNumber label="الوحدات" placeholder={hint(fmtInput(Number(h.quantity)))} onChange={(v) => onEdit({ qty: v, ok: false })} />
        </>}
      </div>
      <div className="qu-foot">
        {changed ? <>
          <span className="lbl">بعد التحديث</span>
          <b className="figure">{sar(after)}</b>
          {Math.abs(diff) >= 1 && <Pill value={diff} />}
        </> : <>
          <span className={`qu-when ${isStale(h) && !e.ok ? 'warn' : ''}`}>{e.ok ? 'تُؤكَّد عند الحفظ' : isStale(h) && due ? due : <>{updatedLabel(h.price_updated_at)}{due ? ` · ${due}` : ''}</>}</span>
          <button type="button" className={`btn small qu-ok ${e.ok ? 'soft' : 'ghost'}`} aria-pressed={e.ok} onClick={() => { haptic(); onEdit({ ok: !e.ok }) }}>
            {e.ok && <IconCheck />}القيمة كما هي
          </button>
        </>}
      </div>
    </article>
  )
}

/** Number input that reports every keystroke (the new value and its difference show while typing). Empty means unchanged. */
function LiveNumber({ label, placeholder, suffix, onChange }: { label: string; placeholder: string; suffix?: string; onChange: (v: number | null) => void }) {
  const id = useId()
  const [text, setText] = useState('')
  return (
    <label className="field qu-field" htmlFor={id}>
      <span>{label}</span>
      <div className="input-wrap">
        <input id={id} className="input num" inputMode="decimal" autoComplete="off" placeholder={placeholder} value={text}
          onChange={(ev) => { const t = ev.target.value; setText(t); onChange(t.trim() ? Math.max(0, parseNum(t)) : null) }}
          onBlur={() => { if (text.trim()) setText(fmtInput(Math.max(0, parseNum(text)))) }}
          onKeyDown={(ev) => { if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur() }} />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  )
}
