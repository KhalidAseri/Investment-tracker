import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { monthName, sar, todayISO, dateShort } from '../lib/format'
import type { Transaction, TxKind } from '../lib/types'
import { NumberField, Segmented, SelectField, Sheet, TextField } from '../components/ui'
import { IconPlus } from '../components/icons'

export const TX_LABEL: Record<TxKind, string> = {
  deposit: 'إيداع', buy: 'شراء', sell: 'بيع', dividend: 'توزيع أرباح', withdrawal: 'سحب', fee: 'رسوم', tax: 'ضريبة مستقطعة',
  zakat: 'زكاة', transfer: 'تحويل', income: 'دخل',
}
const OUT: TxKind[] = ['withdrawal', 'fee', 'tax', 'zakat', 'sell']
type Filter = 'all' | 'in' | 'dividend' | 'trade'

export default function Activity() {
  const { transactions, holdings, accounts, readOnly } = useStore()
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<Partial<Transaction> | null>(null)
  const year = String(new Date().getFullYear())
  const ytd = useMemo(() => {
    const t = transactions.filter((x) => x.tx_date.startsWith(year))
    const sum = (k: TxKind[]) => t.filter((x) => k.includes(x.kind)).reduce((a, x) => a + Number(x.amount_sar), 0)
    return { deposits: sum(['deposit']), dividends: sum(['dividend', 'income']), costs: sum(['fee', 'tax']) }
  }, [transactions, year])
  const list = transactions.filter((x) =>
    filter === 'all' ? true : filter === 'in' ? x.kind === 'deposit' || x.kind === 'withdrawal' : filter === 'dividend' ? ['dividend', 'income', 'tax'].includes(x.kind) : x.kind === 'buy' || x.kind === 'sell')
  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of list) m.set(t.tx_date.slice(0, 7), [...(m.get(t.tx_date.slice(0, 7)) ?? []), t])
    return [...m.entries()]
  }, [list])
  const hName = (id: string | null) => holdings.find((h) => h.id === id)?.name
  const aName = (id: string | null) => accounts.find((a) => a.id === id)?.name

  return (
    <>
      <div className="facts" style={{ marginTop: 0 }}>
        <div className="fact"><div className="v">{sar(ytd.deposits)}</div><div className="l">إيداعاتك في {year}</div></div>
        <div className="fact"><div className="v">{sar(ytd.dividends)}</div><div className="l">توزيعات ودخل في {year}</div></div>
        <div className="fact"><div className="v">{sar(ytd.costs)}</div><div className="l">رسوم وضرائب مستقطعة</div></div>
      </div>
      <div className="row wrap" style={{ gap: 10, margin: '18px 0 4px' }}>
        <Segmented label="تصفية العمليات" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'الكل' }, { value: 'in', label: 'إيداع وسحب' }, { value: 'dividend', label: 'توزيعات' }, { value: 'trade', label: 'شراء وبيع' },
        ]} />
        <span className="grow" />
        {!readOnly && <button className="btn primary small" onClick={() => setEditing({ kind: 'deposit', tx_date: todayISO(), amount_sar: 0, currency: 'SAR', source: 'manual' })}><IconPlus /> عملية</button>}
      </div>
      {groups.length === 0 && <div className="panel empty" style={{ marginTop: 16 }}><h3>لا عمليات بعد</h3><p>تُسجَّل الإيداعات من صفحة الإيداع، وتصل عمليات IBKR تلقائياً بعد الربط.</p></div>}
      {groups.map(([k, items]) => {
        const [y, m] = k.split('-').map(Number)
        return (
          <section className="section" key={k} style={{ marginTop: 20 }}>
            <div className="section-head"><h2>{monthName(m - 1)} {y}</h2></div>
            <div className="panel flush">
              {items.map((t) => (
                <button key={t.id} className="list-item" onClick={() => !readOnly && t.source !== 'ibkr' && setEditing(t)} style={{ cursor: readOnly || t.source === 'ibkr' ? 'default' : 'pointer' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>{TX_LABEL[t.kind]}{t.source === 'ibkr' && <span className="chip accent">IBKR</span>}{t.source === 'import' && <span className="chip">مستورد</span>}</div>
                    <div className="meta">{dateShort(t.tx_date)}{hName(t.holding_id) ? `، ${hName(t.holding_id)}` : aName(t.account_id) ? `، ${aName(t.account_id)}` : ''}{t.note && !t.note.startsWith('إيداع موزّع') ? `، ${t.note}` : ''}</div>
                  </div>
                  <div className={`amount ${OUT.includes(t.kind) ? '' : 'good'}`}>{OUT.includes(t.kind) ? '−' : '+'}{sar(Number(t.amount_sar))}</div>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      {editing && <TxSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function TxSheet({ initial, onClose }: { initial: Partial<Transaction>; onClose: () => void }) {
  const { upsert, remove, notify, holdings, accounts, sleeves } = useStore()
  const [t, setT] = useState<Partial<Transaction>>(initial)
  const set = (p: Partial<Transaction>) => setT((v) => ({ ...v, ...p }))
  const saveIt = async () => {
    if (!(Number(t.amount_sar) > 0)) { notify('اكتب المبلغ'); return }
    const h = holdings.find((x) => x.id === t.holding_id)
    const ok = await upsert('transactions', {
      id: t.id, kind: t.kind ?? 'deposit', tx_date: t.tx_date ?? todayISO(), amount_sar: Number(t.amount_sar), holding_id: t.holding_id ?? null,
      account_id: t.account_id ?? h?.account_id ?? null, sleeve_id: h?.sleeve_id ?? t.sleeve_id ?? null, note: t.note || null, currency: 'SAR', source: 'manual',
    })
    if (ok) { notify('حُفظت العملية'); onClose() }
  }
  return (
    <Sheet title={t.id ? 'تعديل عملية' : 'عملية جديدة'} onClose={onClose} footer={<>
      {t.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذه العملية؟')) { await remove('transactions', t.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <div className="grid2">
          <SelectField<TxKind> label="النوع" value={(t.kind ?? 'deposit') as TxKind} onChange={(v) => set({ kind: v })}
            options={(Object.keys(TX_LABEL) as TxKind[]).map((k) => ({ value: k, label: TX_LABEL[k] }))} />
          <label className="field"><span>التاريخ</span><input className="input" type="date" value={t.tx_date ?? ''} onChange={(e) => set({ tx_date: e.target.value })} /></label>
        </div>
        <NumberField label="المبلغ بالريال" value={t.amount_sar ?? 0} suffix="ريال" decimals={2} onChange={(v) => set({ amount_sar: v })} />
        <SelectField label="الأصل" value={t.holding_id ?? ''} onChange={(v) => set({ holding_id: v || null })}
          options={[{ value: '', label: 'بلا أصل محدد' }, ...holdings.filter((h) => !h.archived).map((h) => ({ value: h.id, label: h.name }))]} />
        {!t.holding_id && (
          <div className="grid2">
            <SelectField label="الحساب" value={t.account_id ?? ''} onChange={(v) => set({ account_id: v || null })} options={[{ value: '', label: 'بلا حساب' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
            <SelectField label="الطبقة" value={t.sleeve_id ?? ''} onChange={(v) => set({ sleeve_id: v || null })} options={[{ value: '', label: 'بلا طبقة' }, ...sleeves.map((s) => ({ value: s.id, label: s.name }))]} />
          </div>
        )}
        <TextField label="ملاحظة" value={t.note ?? ''} onChange={(v) => set({ note: v })} />
        <p className="tiny muted">تسجيل العملية لا يغيّر رصيد الأصل؛ حدّث الرصيد من صفحة المحفظة أو سجّل الإيداع من مخطط الإيداع.</p>
      </div>
    </Sheet>
  )
}
