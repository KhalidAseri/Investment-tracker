// «المراجعة السنوية»: الزكاة → التطهير → إعادة التوازن → دخل السنة → الحفظ, one step per screen.
// Writes doc.reviews through usePlanOps().recordReview (which also approves the year's income and marks the yearly step done).
// No forecasting: the income suggestion is the plan's own rule applied to today's plan value.
import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { usePlan, usePlanOps } from '../lib/usePlan'
import { annualIncome, addDaysISO, type PlanReview } from '../lib/plan'
import { ZAKAT_RATE } from '../lib/calc'
import { dateLong } from '../lib/format'
import { purification } from '../lib/wealth'
import { haptic, layerColor, openAction } from '../lib/ui'
import { Card, Empty, KV, Money, Pct } from '../components/kit'
import { NumberField, Switch } from '../components/ui'
import { Range } from '../components/PlanSheets'
import { IconAlert, IconCheck, IconDoc, IconScale } from '../components/icons'
import type { Go } from '../App'
import './Review.css'

type StepKey = 'zakat' | 'purification' | 'rebalance' | 'income' | 'save'
const STEP_TITLE: Record<StepKey, string> = {
  zakat: 'الزكاة', purification: 'التطهير', rebalance: 'إعادة التوازن', income: 'دخل السنة', save: 'الملاحظات والحفظ',
}
const round = (v: number) => Math.round(v)

export default function Review({ go }: { go: Go }) {
  const { readOnly, transactions, holdings } = useStore()
  const d = useDerived()
  const { doc, progress, today } = usePlan()
  const ops = usePlanOps()
  const year = progress?.review.year ?? Number(today.slice(0, 4))
  const entry = progress?.review.entry ?? null
  const [mode, setMode] = useState<'summary' | 'wizard'>(entry || readOnly ? 'summary' : 'wizard')
  const [step, setStep] = useState(0)
  const [zakat, setZakat] = useState<number | null>(entry?.zakat_paid ?? null)
  const [pur, setPur] = useState<number | null>(entry?.purification_paid ?? null)
  const [rebalanced, setRebalanced] = useState(entry?.rebalanced ?? false)
  const [notes, setNotes] = useState(entry?.notes ?? '')
  const [busy, setBusy] = useState(false)

  // purification: dividends since the last review of an earlier year (or the last 12 months)
  const prevReview = doc ? [...doc.reviews].filter((r) => r.year < year).sort((a, b) => b.year - a.year)[0] ?? null : null
  const purFrom = prevReview?.date && prevReview.date < today ? addDaysISO(prevReview.date, 1) : addDaysISO(today, -365)
  const purEst = useMemo(() => purification(transactions, holdings, purFrom, today), [transactions, holdings, purFrom, today])

  // income of the year: the plan's rule on today's plan value, kept within last year ± band
  const inc = doc?.income ?? null
  const incomeStep = !!inc && !!progress && (progress.treasury.started || (!!inc.start && Number(inc.start.slice(0, 4)) <= year))
  const prevAnnual = prevReview?.income_annual ?? (doc?.state.income_year != null && doc.state.income_year < year ? doc.state.income_annual : null)
  const suggestion = inc && progress ? annualIncome(inc, progress.planValue, prevAnnual) : null
  const [income, setIncome] = useState<number | null>(entry?.income_annual ?? (suggestion ? round(suggestion.annual) : null))

  const steps: StepKey[] = ['zakat', 'purification', 'rebalance', ...(incomeStep ? ['income' as const] : []), 'save']

  if (!d || !progress) return null
  if (!doc) {
    return (
      <Card>
        <Empty icon={<IconDoc />} title={readOnly ? 'لا توجد خطة نشطة' : 'ابنِ خطتك أولاً'} text="تُحفظ المراجعة السنوية في خطتك النشطة."
          action={readOnly ? undefined : { label: 'ابنِ خطتك', href: '#/plan/doc' }} />
      </Card>
    )
  }

  const values = { zakat_paid: zakat, purification_paid: pur, rebalanced, income_annual: incomeStep ? income : null, notes: notes.trim() || null }
  const save = async () => {
    if (busy) return
    setBusy(true)
    const review: PlanReview = { year, date: today, value: round(progress.planValue), ...values }
    const ok = await ops.recordReview(review)
    setBusy(false)
    if (ok) go('plan', 'progress')
  }

  if (mode === 'summary') {
    const shown = entry ?? (readOnly ? progress.review.last : null)
    return (
      <div className="rv">
        <section className="hero rv-hero">
          <div className="hero-top"><span>المراجعة السنوية</span><span className="rv-badge">{entry ? <><IconCheck /> سُجّلت</> : 'لم تُسجَّل بعد'}</span></div>
          <h2 className="rv-title">{shown ? `مراجعة ${shown.year}` : `مراجعة ${year}`}</h2>
          <p className="rv-sub">{shown ? `في ${dateLong(shown.date)}` : 'لم تُسجَّل مراجعة هذه السنة بعد'}</p>
        </section>
        {shown ? <ReviewSummary r={shown} /> : <Card><p className="small muted">يسجّلها صاحب المحفظة في شهر المراجعة.</p></Card>}
        {!readOnly && (
          <div className="rv-foot">
            <button className="btn ghost" onClick={() => go('plan', 'progress')}>التقدم</button>
            <button className="btn primary" onClick={() => { haptic(); setStep(0); setMode('wizard') }}>عدّل</button>
          </div>
        )}
      </div>
    )
  }

  const key = steps[Math.min(step, steps.length - 1)]
  const last = step >= steps.length - 1
  const next = () => { haptic(); setStep((s) => Math.min(steps.length - 1, s + 1)); window.scrollTo({ top: 0 }) }
  const back = () => { haptic(); if (step === 0) { if (entry) setMode('summary'); else go('plan') } else { setStep((s) => s - 1); window.scrollTo({ top: 0 }) } }

  return (
    <div className="rv">
      <section className="hero rv-hero" aria-label="خطوات المراجعة">
        <div className="hero-top"><span>المراجعة السنوية {year}</span><span>الخطوة {step + 1} من {steps.length}</span></div>
        <h2 className="rv-title">{STEP_TITLE[key]}</h2>
        <div className="rv-dots" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          {steps.map((s, i) => <i key={s} className={i < step ? 'done' : i === step ? 'on' : ''} />)}
        </div>
      </section>

      <div className="rv-body" key={key}>
        {key === 'zakat' && (
          <>
            <Card title="زكاتك التقديرية">
              <div className="rv-big"><Money v={d.zakat.amount} /></div>
              <p className="rv-help">ربع العشر من أصولك الخاضعة للزكاة بقيمتها اليوم.</p>
              {d.zakat.items.length > 0 && (
                <div className="rv-list">
                  {d.zakat.items.slice(0, 4).map((x) => (
                    <div key={x.holding.id} className="rv-row"><span dir="auto">{x.holding.name}</span><Money v={(x.value * ZAKAT_RATE) / 100} /></div>
                  ))}
                  {d.zakat.items.length > 4 && <div className="rv-row muted"><span>وأصول أخرى</span><Money v={d.zakat.items.slice(4).reduce((a, x) => a + (x.value * ZAKAT_RATE) / 100, 0)} /></div>}
                </div>
              )}
            </Card>
            <Card>
              <PaidField label="ما دفعته من الزكاة" value={zakat} onChange={setZakat} estimate={d.zakat.amount} />
            </Card>
          </>
        )}

        {key === 'purification' && (
          <>
            <Card title="التطهير المقدّر">
              <div className="rv-big"><Money v={purEst.total} /></div>
              <p className="rv-help">{prevReview ? `من توزيعات وصلتك منذ مراجعة ${prevReview.year}` : 'من توزيعات آخر 12 شهراً'}{purEst.dividends > 0 && <> وقدرها <Money v={purEst.dividends} /></>}.</p>
              {purEst.rows.length > 0 ? (
                <div className="rv-list">
                  {purEst.rows.slice(0, 5).map((r) => (
                    <div key={r.holding.id} className="rv-row"><span dir="auto">{r.holding.name} <small className="muted">· <Pct v={r.pct} /></small></span><Money v={r.due} /></div>
                  ))}
                </div>
              ) : <p className="rv-help">لا توزيعات عليها نسبة تطهير في هذه الفترة.</p>}
            </Card>
            <Card>
              <PaidField label="ما أخرجته للتطهير" value={pur} onChange={setPur} estimate={purEst.total} />
            </Card>
          </>
        )}

        {key === 'rebalance' && (
          <>
            <Card title="الالتزام بالأوزان">
              <div className={`rv-status ${progress.outOfBand.length ? 'warn' : 'good'}`}>
                {progress.outOfBand.length ? <IconAlert /> : <IconCheck />}
                <span>{progress.outOfBand.length === 0 ? 'كل الطبقات ضمن نطاقها'
                  : progress.outOfBand.length === 1 ? `«${progress.outOfBand[0].name}» خارج نطاقها`
                  : progress.outOfBand.length === 2 ? 'طبقتان خارج نطاقهما' : `${progress.outOfBand.length} طبقات خارج نطاقها`}</span>
              </div>
              <div className="rv-list">
                {progress.bands.filter((b) => b.value > 0 || b.target > 0).map((b) => (
                  <div key={b.key} className={`rv-band ${b.status !== 'ok' ? 'out' : ''}`}>
                    <span className="nm"><i className="dot" style={{ background: layerColor(b.layer) }} /><span dir="auto">{b.name}</span></span>
                    <span className="v"><b><Pct v={b.actual} /></b> <small>النطاق <Range min={b.min} max={b.max} /></small></span>
                  </div>
                ))}
              </div>
              <button className="btn soft block" style={{ marginTop: 14 }} onClick={() => openAction('rebalance')}><IconScale /> اعرض خطة إعادة التوازن</button>
            </Card>
            <Card>
              <Switch label="أعدت التوازن" hint="بعد تنفيذ الأوامر لدى الوسيط" checked={rebalanced} onChange={setRebalanced} />
            </Card>
          </>
        )}

        {key === 'income' && inc && suggestion && (
          <>
            <Card title="الدخل المقترح لهذه السنة">
              <div className="rv-big"><Money v={suggestion.annual} /></div>
              <p className="rv-help">شهرياً <Money v={suggestion.monthly} /></p>
              <div style={{ marginTop: 8 }}>
                {inc.method === 'fixed'
                  ? <KV label="مبلغ ثابت في خطتك" value={<Money v={(inc.fixed_monthly ?? 0)} />} sub="شهرياً" />
                  : <KV label={<>نسبة السحب <Pct v={inc.annual_pct} /> من قيمة الخطة</>} value={<Money v={suggestion.raw} />} sub={<>قيمة الخطة <Money v={progress.planValue} /></>} />}
                {prevAnnual != null && <KV label="دخل العام الماضي" value={<Money v={prevAnnual} />} />}
                {inc.method === 'percent' && suggestion.low != null && suggestion.high != null && (
                  <KV label={<>المسموح (±<Pct v={inc.band_pct} />)</>} value={<><Money v={suggestion.low} /> – <Money v={suggestion.high} /></>} />
                )}
              </div>
              {suggestion.clamped && (
                <div className="rv-status warn" style={{ marginTop: 12 }}>
                  <IconAlert /><span>{suggestion.clamped === 'up' ? 'حُدّت الزيادة' : 'حُدّ الخفض'} بسقف التغيّر في خطتك.</span>
                </div>
              )}
            </Card>
            <Card>
              <NumberField label="الدخل السنوي المعتمد" value={income} suffix="ريال" min={0} onChange={setIncome}
                hint={income ? <>شهرياً <Money v={income / 12} /></> : undefined} />
              {income != null && round(income) !== round(suggestion.annual) && (
                <button type="button" className="btn quiet small" style={{ marginTop: 6 }} onClick={() => setIncome(round(suggestion.annual))}>أعد المقترح</button>
              )}
            </Card>
          </>
        )}

        {key === 'save' && (
          <>
            <ReviewSummary r={{ year, date: today, value: round(progress.planValue), ...values }} pending />
            <Card>
              <label className="field"><span>ملاحظات</span>
                <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: رفعت نسبة الصكوك بالأموال الجديدة" />
              </label>
            </Card>
          </>
        )}
      </div>

      <div className="rv-foot">
        <button className="btn ghost" onClick={back}>{step === 0 ? 'إلغاء' : 'رجوع'}</button>
        {last
          ? <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'احفظ المراجعة'}</button>
          : <button className="btn primary" onClick={next}>التالي</button>}
      </div>
    </div>
  )
}

/** amount paid: empty until entered; one tap fills the estimate */
function PaidField({ label, value, onChange, estimate }: { label: string; value: number | null; onChange: (v: number | null) => void; estimate: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <NumberField label={label} value={value} suffix="ريال" min={0} onChange={(v) => onChange(v)} />
      <div className="choice-chips">
        {estimate > 0 && <button type="button" aria-pressed={value != null && round(value) === round(estimate)} onClick={() => { haptic(); onChange(round(estimate)) }}>المقدّر</button>}
        <button type="button" aria-pressed={value === 0} onClick={() => { haptic(); onChange(0) }}>لا شيء</button>
        {value != null && <button type="button" onClick={() => { haptic(); onChange(null) }}>امسح</button>}
      </div>
    </div>
  )
}

function ReviewSummary({ r, pending }: { r: PlanReview; pending?: boolean }) {
  const paid = (v: number | null): ReactNode => (v == null ? <span className="muted rv-none">لم يُسجَّل</span> : <Money v={v} />)
  return (
    <Card title={pending ? 'ملخص المراجعة' : undefined}>
      <KV label="قيمة الخطة" value={<Money v={r.value} />} sub={pending ? 'اليوم' : undefined} />
      <KV label="الزكاة المدفوعة" value={paid(r.zakat_paid)} />
      <KV label="التطهير" value={paid(r.purification_paid)} />
      <KV label="إعادة التوازن" value={r.rebalanced ? <span className="good">تمّت</span> : <span className="muted rv-none">لم تتم</span>} />
      {r.income_annual != null && <KV label="دخل السنة المعتمد" value={<Money v={r.income_annual} />} sub={<>شهرياً <Money v={r.income_annual / 12} /></>} />}
      {!pending && r.notes && <p className="rv-notes" dir="auto">{r.notes}</p>}
    </Card>
  )
}
