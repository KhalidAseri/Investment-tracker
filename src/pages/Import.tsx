import { useMemo, useRef, useState } from 'react'
import { useStore } from '../lib/store'
import { holdingValue } from '../lib/calc'
import { dateLong, num2, sar, todayISO } from '../lib/format'
import { drahimCsvKind, parseDrahimCsv, parseDrahimPdf, type DrahimCsvRow, type DrahimReport } from '../lib/tools'
import type { Account, Holding, Transaction } from '../lib/types'
import { Segmented, SelectField } from '../components/ui'

// ---------- matching helpers ----------
const norm = (s: string) => s.normalize('NFKC')
  .replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\bصندوق\b/g, ' ').replace(/\s+/g, ' ').trim()
const digits = (s: string) => (s.match(/\d+/g) ?? []).join(',')

function matchHolding(name: string, holdings: Holding[]): Holding | null {
  const n = norm(name)
  const exact = holdings.find((h) => norm(h.name) === n)
  if (exact) return exact
  const near = holdings.filter((h) => digits(h.name) === digits(name) && (norm(h.name).includes(n) || n.includes(norm(h.name))))
  return near.length === 1 ? near[0] : null
}

/** Mubasher ids for the Al Rajhi funds Drahim holds, so new holdings price themselves. */
const KNOWN_FUNDS: Array<{ re: RegExp; id: string; monthly: boolean }> = [
  { re: /الراجحي للتوزيعات الشهرية\s*2$/, id: '6046', monthly: true },
  { re: /الراجحي للتوزيعات الشهرية$/, id: '5885', monthly: true },
]

const TX_LABEL: Record<string, string> = { dividend: 'توزيع أرباح', withdrawal: 'سحب', deposit: 'إيداع', fee: 'رسوم', zakat: 'زكاة', other: 'أخرى' }
const dayDiff = (a: string, b: string) => Math.abs((new Date(a).getTime() - new Date(b).getTime()) / 86400000)
const probableDup = (existing: Transaction[], kind: string, amount: number, date: string, extId: string) =>
  existing.find((t) => t.external_id !== extId && t.kind === kind && Math.abs(Math.abs(Number(t.amount_sar)) - amount) < 0.01 && dayDiff(t.tx_date, date) <= 2)
const endOfMonth = (period: string) => { const [y, m] = period.split('-').map(Number); const d = new Date(Date.UTC(y, m, 0)); return d.toISOString().slice(0, 10) }

interface OpRow { key: string; extId: string; date: string; kind: string; label: string; amount: number; holdingId: string; on: boolean; status: 'new' | 'imported' | 'dup' }
interface HoldRow { key: string; name: string; units: number; value: number; portfolio: string | null; match: Holding | null; on: boolean }

export default function Import() {
  const [source, setSource] = useState<'pdf' | 'csv'>('pdf')
  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>استورد بيانات محفظتك في دراهم بدلاً من إدخالها يدوياً. تراجع كل شيء قبل حفظه، ولا يتكرر ما استوردته من قبل.</p>
      <Segmented label="نوع الملف" value={source} onChange={setSource}
        options={[{ value: 'pdf', label: 'التقرير الشهري (PDF)' }, { value: 'csv', label: 'ملف العمليات (CSV)' }]} />
      <div style={{ marginTop: 14 }}>{source === 'pdf' ? <PdfImport /> : <CsvImport />}</div>
    </>
  )
}

/** Finds the Drahim account, or prepares one to be created on save. */
function useDrahimAccount() {
  const { accounts } = useStore()
  return accounts.find((a) => /دراهم|drahim/i.test(a.name)) ?? null
}

function useEnsureAccount() {
  const { upsert, accounts } = useStore()
  const existing = useDrahimAccount()
  return async (): Promise<Account | null> => existing ?? (await upsert<Partial<Account>>('accounts', {
    name: 'دراهم', kind: 'broker', is_ibkr: false, exclude_from_portfolio: false, country: 'SA', note: 'محفظة مُدارة في دراهم', sort: accounts.length + 1,
  }) as Account | null)
}

function guessIncomeSleeve(name: string, sleeves: ReturnType<typeof useStore>['sleeves']) {
  if (/توزيع|دخل|مرابح|صكوك/.test(name)) return sleeves.find((s) => /توزيع/.test(s.name))?.id ?? sleeves.find((s) => s.layer === 'income')?.id ?? null
  return null
}

// ---------- monthly report ----------
function PdfImport() {
  const { holdings, transactions, sleeves, upsert, insertMany, notify, readOnly } = useStore()
  const drahim = useDrahimAccount()
  const ensureAccount = useEnsureAccount()
  const file = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'reading' | 'review' | 'saving' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<DrahimReport | null>(null)
  const [holds, setHolds] = useState<HoldRow[]>([])
  const [ops, setOps] = useState<OpRow[]>([])
  const [feeOn, setFeeOn] = useState(true)
  const live = holdings.filter((h) => !h.archived)

  const read = async (f: File) => {
    setError(null); setState('reading')
    const r = await parseDrahimPdf(f)
    if (!r.ok) { setError(r.error); setState('idle'); return }
    const rep = r.report
    setReport(rep)
    const hr: HoldRow[] = rep.holdings.map((h, i) => ({ key: `h${i}`, ...h, match: matchHolding(h.name, live), on: true }))
    setHolds(hr)
    const largest = (portfolio: string | null) => {
      const inPortfolio = hr.filter((x) => x.portfolio === portfolio).sort((a, b) => b.value - a.value)[0]
      return inPortfolio?.match?.id ?? (inPortfolio ? `new:${inPortfolio.key}` : '')
    }
    setOps(rep.operations.filter((o) => ['dividend', 'withdrawal', 'deposit', 'zakat'].includes(o.kind)).map((o, i) => {
      const extId = `drahim:pdf:${o.date}:${o.kind}:${o.amount.toFixed(2)}:${i}`
      const imported = transactions.some((t) => t.external_id === extId)
      const dup = probableDup(transactions, o.kind, o.amount, o.date, extId)
      return { key: `o${i}`, extId, date: o.date, kind: o.kind, label: o.label, amount: o.amount, holdingId: largest(o.portfolio), on: !imported && !dup, status: imported ? 'imported' : dup ? 'dup' : 'new' }
    }))
    setFeeOn(!transactions.some((t) => t.external_id === `drahim:fee:${rep.period}`))
    setState('review')
  }

  const save = async () => {
    if (!report) return
    setState('saving')
    const acc = await ensureAccount()
    if (!acc) { setState('review'); return }
    const asOf = report.period ? endOfMonth(report.period) : todayISO()
    const ids: Record<string, string> = {}
    for (const r of holds.filter((x) => x.on)) {
      const price = r.units > 0 ? r.value / r.units : r.value
      if (r.match) {
        const newerPrice = r.match.price_updated_at && r.match.price_updated_at.slice(0, 10) > asOf
        await upsert('holdings', { id: r.match.id, quantity: r.units, ...(newerPrice ? {} : { price, price_updated_at: `${asOf}T12:00:00Z` }) })
        ids[r.key] = r.match.id
      } else {
        const known = KNOWN_FUNDS.find((k) => k.re.test(r.name.trim()))
        const saved = await upsert<Partial<Holding>>('holdings', {
          name: r.name, account_id: acc.id, sleeve_id: guessIncomeSleeve(r.name, sleeves), symbol: known?.id ?? null, price_source: known ? 'nav' : 'manual',
          currency: 'SAR', quantity: r.units, price, price_updated_at: `${asOf}T12:00:00Z`, zakatable: true, region: 'SA',
          payout_freq: known?.monthly ? 'monthly' : 'none', payout_basis: 'rate', sort: holdings.length + 1,
        })
        if (saved?.id) {
          ids[r.key] = saved.id
          // money already invested before the app knew about it: not a gain
          await insertMany('transactions', [{ tx_date: asOf, kind: 'transfer', amount_sar: Math.round(r.value * 100) / 100, holding_id: saved.id, account_id: acc.id, sleeve_id: saved.sleeve_id ?? null,
            quantity: null, price: null, currency: 'SAR', source: 'import', external_id: `drahim:add:${saved.id}`, note: `إضافة أصل قائم: ${r.name}` }])
        }
      }
    }
    const holdingFor = (v: string) => (v.startsWith('new:') ? ids[v.slice(4)] ?? null : v || null)
    const rows: Record<string, unknown>[] = ops.filter((o) => o.on && o.status !== 'imported').map((o) => ({
      tx_date: o.date, kind: o.kind, amount_sar: o.amount, holding_id: holdingFor(o.holdingId), account_id: acc.id, sleeve_id: null, quantity: null, price: null,
      currency: 'SAR', source: 'import', external_id: o.extId, note: `دراهم: ${o.label}`,
    }))
    const fee = report.fees.reduce((s, f) => s + f.amount, 0)
    if (feeOn && fee > 0 && report.period && !transactions.some((t) => t.external_id === `drahim:fee:${report.period}`)) {
      rows.push({ tx_date: asOf, kind: 'fee', amount_sar: fee, holding_id: null, account_id: acc.id, sleeve_id: null, quantity: null, price: null, currency: 'SAR', source: 'import',
        external_id: `drahim:fee:${report.period}`, note: `دراهم: ${report.fees.map((f) => f.label).join('، ')} عن ${report.periodLabel ?? report.period}` })
    }
    const ok = await insertMany('transactions', rows)
    if (ok) { notify('استُورد التقرير'); setState('done') } else setState('review')
  }

  if (readOnly) return <p className="muted">الاستيراد لصاحب المحفظة فقط.</p>
  if (state === 'done') return (
    <div className="panel stack">
      <h3 style={{ margin: 0 }}>تم الاستيراد</h3>
      <p className="small">حُدّثت أصول دراهم وسُجّلت العمليات. كرّر هذا كل شهر عند وصول التقرير.</p>
      <button className="btn ghost" onClick={() => { setState('idle'); setReport(null) }}>استورد تقريراً آخر</button>
    </div>
  )
  const holdingOptions = [
    { value: '', label: 'بلا أصل محدد' },
    ...holds.filter((h) => !h.match).map((h) => ({ value: `new:${h.key}`, label: `${h.name} (جديد)` })),
    ...live.filter((h) => !h.goal_id).map((h) => ({ value: h.id, label: h.name })),
  ]
  const fee = report?.fees.reduce((s, f) => s + f.amount, 0) ?? 0
  return (
    <div className="stack">
      {state !== 'review' && (
        <div className="panel stack">
          <p className="small">من تطبيق دراهم: <b>الحساب ← التقارير ← تقرير الاستثمارات الشهري</b>، ثم شارك ملف PDF إلى جهازك وارفعه هنا.</p>
          <input ref={file} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = '' }} />
          <button className="btn primary" disabled={state === 'reading'} onClick={() => file.current?.click()}>{state === 'reading' ? 'نقرأ التقرير…' : 'اختر ملف التقرير'}</button>
          {error && <p className="small bad" role="alert">{error}</p>}
        </div>
      )}
      {state !== 'idle' && state !== 'reading' && report && <>
        <section className="status" style={{ paddingTop: 0 }}>
          <p className="kicker">تقرير {report.periodLabel ?? 'دراهم'}</p>
          <p className="headline"><span className="figure">{sar(report.total ?? holds.reduce((s, h) => s + h.value, 0))}</span></p>
          <p className="muted small">{drahim ? `تُحدَّث الأصول في حساب «${drahim.name}».` : 'سيُنشأ حساب باسم «دراهم» وتوضع فيه الأصول.'}</p>
        </section>

        <h3 style={{ margin: '4px 0 0' }}>الأصول</h3>
        <div className="panel flush">
          {holds.map((r) => {
            const price = r.units ? r.value / r.units : r.value
            return (
              <label key={r.key} className="list-item import-row">
                <input type="checkbox" checked={r.on} onChange={(e) => setHolds((l) => l.map((x) => (x.key === r.key ? { ...x, on: e.target.checked } : x)))} />
                <div className="grow">
                  <div>{r.name}</div>
                  <div className="meta">
                    {r.match
                      ? <>يحدّث «{r.match.name}»: {num2(Number(r.match.quantity))} ← <b>{num2(r.units)}</b> وحدة، سعر الوحدة {price.toFixed(4)}</>
                      : <>أصل جديد: {num2(r.units)} وحدة بسعر {price.toFixed(4)}</>}
                  </div>
                </div>
                <div className="amount">{sar(r.value)}</div>
              </label>
            )
          })}
        </div>
        {holds.some((r) => !r.match) && (
          <p className="tiny muted">لم أجد مقابلاً لبعض الأصول في محفظتك فستُضاف جديدة. إن كان الأصل موجوداً باسم مختلف فغيّر اسمه في المحفظة ليطابق التقرير ثم أعد الاستيراد.</p>
        )}

        {ops.length > 0 && <>
          <h3 style={{ margin: '8px 0 0' }}>العمليات</h3>
          <div className="panel flush">
            {ops.map((o) => (
              <div key={o.key} className="list-item import-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                <input type="checkbox" aria-label={`استورد ${TX_LABEL[o.kind]} ${dateLong(o.date)}`} checked={o.on} disabled={o.status === 'imported'}
                  onChange={(e) => setOps((l) => l.map((x) => (x.key === o.key ? { ...x, on: e.target.checked } : x)))} />
                <div className="grow stack" style={{ gap: 6 }}>
                  <div>{TX_LABEL[o.kind] ?? o.label} <span className="muted small">· {dateLong(o.date)}</span></div>
                  {o.status === 'imported' && <span className="chip">استُورد سابقاً</span>}
                  {o.status === 'dup' && <span className="chip warn">يبدو مسجّلاً مسبقاً؛ حدّده إن لم يكن كذلك</span>}
                  {o.kind === 'dividend' && o.status !== 'imported' && (
                    <SelectField label="من أي صندوق؟" value={o.holdingId} onChange={(v) => setOps((l) => l.map((x) => (x.key === o.key ? { ...x, holdingId: v } : x)))} options={holdingOptions} />
                  )}
                </div>
                <div className="amount">{sar(o.amount)}</div>
              </div>
            ))}
          </div>
          <p className="tiny muted">التقرير يذكر التوزيعات على مستوى المحفظة؛ اختر الصندوق الصحيح لكل توزيع ليُحسب التطهير بدقة.</p>
        </>}

        {fee > 0 && (
          <label className="switch">
            <span className="stack" style={{ gap: 2 }}><span>سجّل رسوم دراهم: {num2(fee)} ريال</span><small className="muted tiny">{report.fees.map((f) => f.label).join('، ')}</small></span>
            <input type="checkbox" role="switch" checked={feeOn} onChange={(e) => setFeeOn(e.target.checked)} />
          </label>
        )}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary grow" disabled={state === 'saving'} onClick={save}>{state === 'saving' ? 'نحفظ…' : 'احفظ ما حددته'}</button>
          <button className="btn ghost" onClick={() => { setState('idle'); setReport(null) }}>إلغاء</button>
        </div>
      </>}
    </div>
  )
}

// ---------- transactions export ----------
function CsvImport() {
  const { holdings, transactions, upsert, insertMany, notify, readOnly, fx } = useStore()
  const drahim = useDrahimAccount()
  const ensureAccount = useEnsureAccount()
  const file = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Array<DrahimCsvRow & { kind: string; extId: string; on: boolean; status: OpRow['status'] }> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [holdingId, setHoldingId] = useState('')
  const [setCost, setSetCost] = useState(true)
  const [busy, setBusy] = useState(false)
  const live = holdings.filter((h) => !h.archived && !h.goal_id)
  const defaultHolding = useMemo(() => {
    const inDrahim = live.filter((h) => drahim && h.account_id === drahim.id)
    return [...(inDrahim.length ? inDrahim : live)].sort((a, b) => holdingValue(b, fx) - holdingValue(a, fx))[0]?.id ?? ''
  }, [live, drahim, fx])

  const load = (text: string) => {
    setError(null)
    const r = parseDrahimCsv(text)
    if (r.error) { setError(r.error); setRows(null); return }
    const mapped = r.rows.map((x) => {
      const kind = drahimCsvKind(x)
      const extId = `drahim:${x.id}`
      const imported = transactions.some((t) => t.external_id === extId)
      const dup = !imported && probableDup(transactions, kind, x.amount, x.date, extId)
      return { ...x, kind, extId, on: !imported && !dup, status: (imported ? 'imported' : dup ? 'dup' : 'new') as OpRow['status'] }
    }).sort((a, b) => b.date.localeCompare(a.date))
    setRows(mapped)
    const byName = r.rows[0]?.account ? matchHolding(r.rows[0].account, live) : null
    setHoldingId(byName?.id ?? defaultHolding)
  }

  const chosen = rows?.filter((r) => r.on && r.status !== 'imported') ?? []
  const deposits = rows?.filter((r) => r.kind === 'deposit').reduce((s, r) => s + r.amount, 0) ?? 0
  const target = holdings.find((h) => h.id === holdingId)
  const sum = (k: string) => chosen.filter((r) => r.kind === k).reduce((s, r) => s + r.amount, 0)

  const save = async () => {
    setBusy(true)
    const acc = await ensureAccount()
    if (!acc) { setBusy(false); return }
    const ok = await insertMany('transactions', chosen.map((r) => ({
      tx_date: r.date, kind: r.kind, amount_sar: r.amount, holding_id: holdingId || null, account_id: acc.id, sleeve_id: target?.sleeve_id ?? null, quantity: null, price: null,
      currency: 'SAR', source: 'import', external_id: r.extId, note: `دراهم: ${r.label}`,
    })))
    if (ok && setCost && target && target.cost_basis == null && deposits > 0) await upsert('holdings', { id: target.id, cost_basis: deposits })
    setBusy(false)
    if (ok) { notify(`استُوردت ${chosen.length} عملية`); setRows(null) }
  }

  if (readOnly) return <p className="muted">الاستيراد لصاحب المحفظة فقط.</p>
  return (
    <div className="stack">
      {!rows && (
        <div className="panel stack">
          <p className="small">من تطبيق دراهم صدّر عمليات الصندوق كملف CSV، ثم ارفعه هنا. يُعرف كل سطر برقمه فلا يتكرر إن استوردت الملف مرة أخرى.</p>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()); e.target.value = '' }} />
          <button className="btn primary" onClick={() => file.current?.click()}>اختر ملف CSV</button>
          {error && <p className="small bad" role="alert">{error}</p>}
        </div>
      )}
      {rows && <>
        <div className="facts" style={{ marginTop: 0 }}>
          <div className="fact"><div className="v">{sar(sum('dividend'))}</div><div className="l">توزيعات</div></div>
          <div className="fact"><div className="v">{sar(sum('deposit'))}</div><div className="l">إيداعات</div></div>
          <div className="fact"><div className="v">{sar(sum('withdrawal'))}</div><div className="l">سحوبات</div></div>
        </div>
        <SelectField label="العمليات تخص أصل" value={holdingId} onChange={setHoldingId}
          options={[{ value: '', label: 'بلا أصل محدد' }, ...live.map((h) => ({ value: h.id, label: h.name }))]} />
        {target && target.cost_basis == null && deposits > 0 && (
          <label className="switch">
            <span className="stack" style={{ gap: 2 }}><span>اجعل تكلفة «{target.name}» مجموع الإيداعات</span><small className="muted tiny">{sar(deposits)}، ليظهر ربحه في صفحة الأداء</small></span>
            <input type="checkbox" role="switch" checked={setCost} onChange={(e) => setSetCost(e.target.checked)} />
          </label>
        )}
        <div className="panel flush">
          {rows.map((r) => (
            <label key={r.id} className="list-item import-row">
              <input type="checkbox" checked={r.on} disabled={r.status === 'imported'} onChange={(e) => setRows((l) => l!.map((x) => (x.id === r.id ? { ...x, on: e.target.checked } : x)))} />
              <div className="grow">
                <div>{TX_LABEL[r.kind]} <span className="muted small">· {dateLong(r.date)}</span></div>
                <div className="meta">{r.label}{r.status === 'imported' ? '، استُورد سابقاً' : r.status === 'dup' ? '، يبدو مسجّلاً مسبقاً' : ''}</div>
              </div>
              <div className={`amount ${r.kind === 'withdrawal' ? 'bad' : ''}`}>{r.kind === 'withdrawal' ? '−' : ''}{sar(r.amount)}</div>
            </label>
          ))}
        </div>
        <p className="tiny muted">تواريخ ملف العمليات قد تختلف يوماً عن تواريخ التقرير الشهري؛ لذلك يُعلَّم ما يشبه عملية مسجّلة ولا يُحدَّد تلقائياً.</p>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn primary grow" disabled={busy || chosen.length === 0} onClick={save}>{busy ? 'نحفظ…' : chosen.length ? `استورد ${chosen.length} عملية` : 'لا جديد للاستيراد'}</button>
          <button className="btn ghost" onClick={() => setRows(null)}>إلغاء</button>
        </div>
      </>}
    </div>
  )
}
