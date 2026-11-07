import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { dateLong, monthName, sar } from '../lib/format'
import { FREQUENCY_LABEL, STREAM_KINDS, STREAM_LABEL, nextStreamDate, obligationsCache, obligationsMonthly } from '../lib/profile'
import { todayISO } from '../lib/format'
import type { IncomeStream, Obligation } from '../lib/types'
import { Empty, NumberField, Segmented, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus } from '../components/icons'
import { ObligationSheet } from '../components/WealthSheets'
import { DEBT_LABEL, debtView } from '../lib/wealth'

export default function Profile() {
  const { settings, updateSettings, streams, obligations, accounts, readOnly } = useStore()
  const d = useDerived()
  const [stream, setStream] = useState<Partial<IncomeStream> | null>(null)
  const [obligation, setObligation] = useState<Partial<Obligation> | null>(null)
  const total = d?.contribution.total ?? 0
  const auto = settings?.contribution_mode !== 'manual'

  // keep the projection's yearly contribution in step with the situation
  useEffect(() => {
    if (!settings || readOnly || !auto) return
    if (Math.abs(Math.round(total) - Number(settings.annual_contribution)) >= 1) updateSettings({ annual_contribution: Math.round(total) })
  }, [total, auto, settings?.annual_contribution, readOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings || !d) return null
  const s = settings
  const varies = !!(s.extra as { monthly_varies?: boolean })?.monthly_varies
  const thisYear = new Date().getFullYear()
  const obligationsNow = obligationsMonthly(obligations)

  return (
    <>
      <p className="muted" style={{ marginBottom: 14 }}>هذا ما يبني عليه التطبيق خطتك: ما تستثمره ومتى، والتزاماتك، وهدفك. غيّر أي شيء ويتحدث كل حساب فوراً.</p>
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <section className="status" style={{ paddingTop: 0 }}>
          <p className="kicker">تستثمر سنوياً نحو</p>
          <p className="headline"><span className="figure">{sar(total)}</span></p>
        </section>
        <div className="panel flush">
          <div className="list-item" style={{ cursor: 'default' }}>
            <div className="grow"><div>الإيداع الشهري من الراتب</div><div className="meta">{varies ? 'يتغير؛ هذا متوسطه' : 'ثابت تقريباً'} × 12</div></div>
            <div className="amount">{sar(d.contribution.monthly)}</div>
          </div>
          {d.contribution.streams.map((r) => (
            <div key={r.stream.id} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow"><div>{r.stream.name}</div><div className="meta">{FREQUENCY_LABEL[r.stream.frequency]}، تستثمر {r.stream.invest_pct}% منه</div></div>
              <div className="amount">{sar(r.yearly)}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Switch label="استخدم هذا المبلغ في التوقعات" hint={auto ? 'يتحدث الإيداع السنوي في «المستقبل» تلقائياً من وضعك' : `التوقعات تستخدم مبلغاً تحدده بنفسك: ${sar(s.annual_contribution)}`}
            checked={auto} onChange={(v) => updateSettings({ contribution_mode: v ? 'auto' : 'manual', ...(v ? { annual_contribution: Math.round(total) } : {}) })} />
        </div>

        <section className="section">
          <div className="section-head"><h2>الإيداع من الراتب</h2></div>
          <div className="panel stack">
            <Segmented label="الإيداع من الراتب" value={varies ? 'varies' : 'fixed'} onChange={(v) => updateSettings({ extra: { ...s.extra, monthly_varies: v === 'varies' } })}
              options={[{ value: 'fixed', label: 'مبلغ ثابت تقريباً' }, { value: 'varies', label: 'يتغير كل شهر' }]} />
            <div className="grid2">
              <NumberField label={varies ? 'متوسطه الشهري' : 'المبلغ الشهري'} value={s.monthly_invest ?? 0} suffix="ريال" onChange={(v) => updateSettings({ monthly_invest: v })} />
              <NumberField plain label="يوم الإيداع" value={s.deposit_day} min={1} max={28} onChange={(v) => updateSettings({ deposit_day: Math.round(v) })} hint="يصلك تذكير في هذا اليوم" />
            </div>
            <NumberField label="نمو إيداعاتك سنوياً" value={s.contribution_growth} suffix="%" decimals={1} onChange={(v) => updateSettings({ contribution_growth: v })} hint="مع زيادة الراتب السنوية" />
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>الدخل الإضافي</h2>
            {!readOnly && <button className="btn primary small" onClick={() => setStream({ name: STREAM_KINDS[0].label, kind: 'bonus', amount: 0, frequency: 'yearly', month: null, invest_pct: 70, sort: streams.length + 1 })}><IconPlus /> مصدر</button>}
          </div>
          {streams.length === 0 ? <div className="panel"><Empty title="لا دخل إضافي بعد"><p className="small" style={{ marginTop: 6 }}>مكافأة سنوية، سلفة، برنامج ادخار، دخل جانبي.</p></Empty></div> : (
            <div className="panel flush">
              {streams.map((st) => {
                const next = nextStreamDate(st, todayISO())
                return (
                  <button key={st.id} className="list-item" onClick={() => !readOnly && setStream(st)} style={readOnly ? { cursor: 'default' } : undefined}>
                    <div className="grow">
                      <div>{st.name}</div>
                      <div className="meta">{STREAM_LABEL[st.kind]}، {FREQUENCY_LABEL[st.frequency]}{st.month ? ` في ${monthName(st.month - 1)}` : ''}{next ? `، القادم ${dateLong(next)}` : ''}</div>
                    </div>
                    <div className="amount">{sar(Number(st.amount))}<div className="tiny muted">تستثمر {st.invest_pct}%</div></div>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head"><h2>الالتزامات والديون</h2>
            {!readOnly && <button className="btn primary small" onClick={() => setObligation({ name: '', kind: 'other', monthly_amount: 0, end_year: null, balance: null, sort: obligations.length + 1 })}><IconPlus /> التزام</button>}
          </div>
          <div className="panel stack">
            {obligations.length > 0 && (
              <div className="panel flush">
                {obligations.map((o) => (
                  <button key={o.id} className="list-item" onClick={() => !readOnly && setObligation(o)} style={readOnly ? { cursor: 'default' } : undefined}>
                    <div className="grow"><div>{o.name}</div><div className="meta">{DEBT_LABEL[o.kind ?? 'other']}، {o.end_year ? `حتى ${o.end_year}` : 'بلا تاريخ انتهاء'}{o.end_year && o.end_year < thisYear ? '، انتهى' : ''}{o.balance != null ? `، المتبقي ${sar(debtView(o).balance)}` : ''}</div></div>
                    <div className="amount">{sar(Number(o.monthly_amount))}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="row between small"><span>مجموعها الآن</span><b className="figure">{sar(obligationsNow)} شهرياً</b></div>
            <Switch label="أضفها فوق الدخل المستهدف" hint={s.include_mortgage ? 'الدخل المطلوب = الهدف + الالتزامات حتى تنتهي' : 'دخلك المستهدف يشملها'}
              checked={s.include_mortgage} onChange={(v) => updateSettings({ include_mortgage: v })} />
          </div>
        </section>

        <section className="section">
          <div className="section-head"><h2>الهدف</h2></div>
          <div className="panel stack">
            <div className="grid2">
              <NumberField label="الدخل الشهري المستهدف" value={s.monthly_income_target} suffix="ريال" onChange={(v) => updateSettings({ monthly_income_target: v })} hint="بقيمة ريال اليوم" />
              <NumberField plain label="سنة الميلاد" value={s.birth_year} onChange={(v) => updateSettings({ birth_year: Math.round(v) })} />
              <NumberField plain label="سنة الاستقلال المستهدفة" value={s.independence_year} min={thisYear + 1} max={thisYear + 50} onChange={(v) => updateSettings({ independence_year: Math.round(v), glide_start_year: Math.min(s.glide_start_year, Math.round(v) - 1) })} hint={`في سن ${s.independence_year - s.birth_year}`} />
              <SelectField label="حساب احتياطي الدخل" value={s.reserve_account_id ?? ''} onChange={(v) => updateSettings({ reserve_account_id: v || null })}
                options={[{ value: '', label: 'لم يُحدَّد' }, ...accounts.filter((a) => !a.exclude_from_portfolio).map((a) => ({ value: a.id, label: a.name }))]} />
            </div>
          </div>
        </section>
      </fieldset>

      {stream && <StreamSheet initial={stream} onClose={() => setStream(null)} />}
      {obligation && <ObligationSheet initial={obligation} onClose={() => setObligation(null)} />}
    </>
  )
}

function StreamSheet({ initial, onClose }: { initial: Partial<IncomeStream>; onClose: () => void }) {
  const { upsert, remove, notify } = useStore()
  const [x, setX] = useState<Partial<IncomeStream>>(initial)
  const set = (p: Partial<IncomeStream>) => setX((v) => ({ ...v, ...p }))
  const saveIt = async () => {
    if (!x.name?.trim()) { notify('اكتب اسم المصدر'); return }
    const ok = await upsert('income_streams', {
      id: x.id, name: x.name.trim(), kind: x.kind ?? 'other', amount: Number(x.amount ?? 0), frequency: x.frequency ?? 'yearly',
      month: x.frequency === 'monthly' ? null : x.month ?? null, next_date: x.next_date || null, invest_pct: Number(x.invest_pct ?? 100), note: x.note || null, sort: x.sort ?? 99,
    })
    if (ok) { notify('حُفظ'); onClose() }
  }
  return (
    <Sheet title={x.id ? 'تعديل مصدر دخل' : 'مصدر دخل إضافي'} onClose={onClose} footer={<>
      {x.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا المصدر؟')) { await remove('income_streams', x.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <SelectField label="النوع" value={x.kind ?? 'other'} onChange={(v) => {
          const k = STREAM_KINDS.find((s) => s.kind === v)!
          set({ kind: v, ...(x.id ? {} : { name: k.label, frequency: k.frequency, invest_pct: k.invest }) })
        }} options={STREAM_KINDS.map((k) => ({ value: k.kind, label: k.label }))} />
        <TextField label="الاسم" value={x.name ?? ''} onChange={(v) => set({ name: v })} />
        <div className="grid2">
          <NumberField label="المبلغ" value={x.amount ?? 0} suffix="ريال" onChange={(v) => set({ amount: v })} hint="صافي ما يصلك" />
          <NumberField label="كم تستثمر منه؟" value={x.invest_pct ?? 100} suffix="%" min={0} max={100} onChange={(v) => set({ invest_pct: v })} />
          <SelectField label="كم مرة؟" value={x.frequency ?? 'yearly'} onChange={(v) => set({ frequency: v })}
            options={(Object.keys(FREQUENCY_LABEL) as Array<IncomeStream['frequency']>).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
          {x.frequency !== 'monthly' && (
            <SelectField label="في أي شهر غالباً؟" value={x.month ? String(x.month) : ''} onChange={(v) => set({ month: v ? Number(v) : null })}
              options={[{ value: '', label: 'غير ثابت' }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i) }))]} />
          )}
        </div>
        {x.frequency !== 'monthly' && (
          <label className="field"><span>الموعد القادم بالتحديد (اختياري)</span>
            <input className="input" type="date" value={x.next_date ?? ''} onChange={(e) => set({ next_date: e.target.value || null })} />
            <small>{x.frequency === 'irregular' ? 'مثل موعد تجديد السلفة المتوقع.' : 'إن عرفت اليوم بالتحديد؛ وإلا يُستخدم أول الشهر.'}</small>
          </label>
        )}
        <TextField label="ملاحظة" value={x.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
