import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { num0, sar } from '../lib/format'
import { ASSET_TYPES, FREQUENCY_LABEL, STREAM_KINDS, TEMPLATES, type AssetType } from '../lib/profile'
import type { IncomeStream } from '../lib/types'
import { MixBar } from '../components/charts'
import { NumberField, Segmented, SelectField, Switch, TextField } from '../components/ui'
import { IconClose, IconPlus } from '../components/icons'
import { LAYER_VAR } from '../lib/derived'

type StreamRow = { kind: IncomeStream['kind']; name: string; amount: number; frequency: IncomeStream['frequency']; month: string; invest_pct: number }
type ObligationRow = { name: string; monthly_amount: number; end_year: number | null }
type AssetRow = { name: string; value: number; type: AssetType; platform: string }

const STEPS = ['عنك وهدفك', 'ما تستثمره', 'التزاماتك', 'ما تملكه الآن', 'أسلوب المحفظة']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const PLATFORMS = ['الراجحي المالية', 'Interactive Brokers', 'دراية المالية', 'الأهلي المالية', 'الإنماء للاستثمار', 'الجزيرة كابيتال', 'برنامج ادخار جهة العمل', 'حساب بنكي']
const OBLIGATION_CHIPS = ['تمويل عقاري', 'قرض شخصي', 'تمويل سيارة', 'قسط سلفة']

export default function Onboarding() {
  const { createPlan, signOut, session } = useStore()
  const thisYear = new Date().getFullYear()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [birthYear, setBirthYear] = useState(thisYear - 30)
  const [target, setTarget] = useState(15000)
  const [includesObligations, setIncludesObligations] = useState(true)
  const [targetAge, setTargetAge] = useState(45)
  const [varies, setVaries] = useState(false)
  const [monthly, setMonthly] = useState(3000)
  const [depositDay, setDepositDay] = useState(27)
  const [streams, setStreams] = useState<StreamRow[]>([])
  const [obligations, setObligations] = useState<ObligationRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [emergency, setEmergency] = useState(0)
  const [template, setTemplate] = useState('balanced')

  const yearly = useMemo(() => monthly * 12 + streams.reduce((a, r) => {
    const v = r.amount * (r.invest_pct / 100)
    return a + (r.frequency === 'monthly' ? v * 12 : r.frequency === 'once' ? 0 : v)
  }, 0), [monthly, streams])
  const independence = birthYear + targetAge
  const tpl = TEMPLATES.find((t) => t.key === template)!

  const finish = async () => {
    setBusy(true)
    const platforms = [...new Set(assets.map((a) => a.platform.trim()).filter(Boolean))]
    const accounts = platforms.map((name) => ({
      name, is_ibkr: /ibkr|interactive/i.test(name),
      kind: /ادخار/.test(name) ? 'savings_program' : /بنك|bank|حساب/i.test(name) ? 'bank' : 'broker',
    }))
    if (emergency > 0) accounts.push({ name: 'صندوق الطوارئ', kind: 'bank', is_ibkr: false, exclude: true } as never)
    const holdings = assets.filter((a) => a.name.trim() && a.value > 0).map((a, i) => ({
      name: a.name.trim(), value: a.value, sort: i + 1,
      ...(a.platform.trim() ? { account: platforms.indexOf(a.platform.trim()) } : {}),
      sleeve: Math.max(0, tpl.sleeves.findIndex((s) => s.asset === a.type)),
    }))
    if (emergency > 0) holdings.push({ name: 'صندوق الطوارئ', value: emergency, sort: holdings.length + 1, account: accounts.length - 1 } as never)
    const ok = await createPlan({
      settings: {
        monthly_income_target: target, birth_year: birthYear, independence_year: independence, glide_start_year: Math.max(thisYear, independence - 3),
        include_mortgage: !includesObligations, monthly_invest: monthly, deposit_day: depositDay, annual_contribution: Math.round(yearly),
        contribution_growth: 3, expected_return: tpl.expected, extra: { monthly_varies: varies, template },
      },
      accounts,
      sleeves: tpl.sleeves.map(({ asset: _a, ...s }) => s),
      holdings,
      streams: streams.filter((r) => r.amount > 0).map((r, i) => ({ ...r, month: r.month || null, sort: i + 1 })),
      obligations: obligations.filter((o) => o.name.trim() && o.monthly_amount > 0).map((o, i) => ({ ...o, sort: i + 1 })),
    })
    setBusy(false)
    if (ok) location.hash = '/'
  }

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  return (
    <div className="onboard">
      <header className="onboard-head">
        <img src="./icons/icon-192.png" width={36} height={36} alt="" style={{ borderRadius: 10 }} />
        <div className="grow">
          <b>لنبنِ خطتك</b>
          <div className="tiny muted">{STEPS.length} أسئلة قصيرة، وكل شيء قابل للتعديل لاحقاً</div>
        </div>
        <button className="btn quiet small" onClick={() => { if (confirm('تسجيل الخروج؟')) signOut() }}>خروج</button>
      </header>
      <ol className="stepper" aria-label="خطوات الإعداد">
        {STEPS.map((t, i) => <li key={t} aria-current={i === step ? 'step' : undefined} className={i < step ? 'done' : ''} title={t}><span>{i + 1}</span><em>{t}</em></li>)}
      </ol>

      <main className="onboard-body">
        {step === 0 && (
          <section className="stack">
            <h2>عنك وهدفك</h2>
            <p className="muted">كم دخلاً شهرياً من استثماراتك يكفيك لتعيش دون الاعتماد على الراتب؟</p>
            <div className="grid2">
              <NumberField plain label="سنة ميلادك" value={birthYear} min={1940} max={thisYear - 16} onChange={(v) => setBirthYear(Math.round(v))} />
              <NumberField label="الدخل الشهري المستهدف" value={target} suffix="ريال" onChange={setTarget} hint="بقيمة ريال اليوم" />
            </div>
            <Switch label="المبلغ يشمل التزاماتك الشهرية" hint="مثل أقساط التمويل العقاري والقروض. أطفئه إن كنت تريد المبلغ صافياً بعد الأقساط"
              checked={includesObligations} onChange={setIncludesObligations} />
            <NumberField plain label="في أي عمر تريد الوصول؟" value={targetAge} min={Math.max(25, thisYear - birthYear + 2)} max={75} onChange={(v) => setTargetAge(Math.round(v))}
              hint={`أي في سنة ${independence}. سيحسب التطبيق هل يصل مسارك في هذا الموعد.`} />
          </section>
        )}

        {step === 1 && (
          <section className="stack">
            <h2>ما تستثمره</h2>
            <Segmented label="الإيداع من الراتب" value={varies ? 'varies' : 'fixed'} onChange={(v) => setVaries(v === 'varies')}
              options={[{ value: 'fixed', label: 'مبلغ شهري ثابت تقريباً' }, { value: 'varies', label: 'يتغير كل شهر' }]} />
            <div className="grid2">
              <NumberField label={varies ? 'متوسطه الشهري تقريباً' : 'المبلغ الشهري'} value={monthly} suffix="ريال" onChange={setMonthly} />
              <NumberField plain label="يوم الإيداع في الشهر" value={depositDay} min={1} max={28} onChange={(v) => setDepositDay(Math.round(v))} hint="عادةً بعد نزول الراتب" />
            </div>
            <h3 style={{ marginTop: 8 }}>دخل إضافي تستثمر منه</h3>
            <p className="small muted">أضف ما ينطبق عليك؛ يظهر في التقويم ويقترح التطبيق تقسيمه حين يصل.</p>
            <div className="chips">
              {STREAM_KINDS.map((k) => (
                <button key={k.kind} type="button" className="btn ghost small" onClick={() => setStreams((r) => [...r, { kind: k.kind, name: k.label, amount: 0, frequency: k.frequency, month: '', invest_pct: k.invest }])}>
                  <IconPlus /> {k.label}
                </button>
              ))}
            </div>
            {streams.map((r, i) => {
              const set = (p: Partial<StreamRow>) => setStreams((rows) => rows.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return (
                <div key={i} className="panel inset stack" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="grow"><TextField label="الاسم" value={r.name} onChange={(v) => set({ name: v })} /></div>
                    <button className="icon-btn" aria-label="حذف" onClick={() => setStreams((rows) => rows.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-end' }}><IconClose /></button>
                  </div>
                  <div className="grid2">
                    <NumberField label="المبلغ" value={r.amount} suffix="ريال" onChange={(v) => set({ amount: v })} />
                    <SelectField label="كم مرة؟" value={r.frequency} onChange={(v) => set({ frequency: v })}
                      options={(Object.keys(FREQUENCY_LABEL) as Array<IncomeStream['frequency']>).map((f) => ({ value: f, label: FREQUENCY_LABEL[f] }))} />
                    {r.frequency !== 'monthly' && (
                      <SelectField label="في أي شهر غالباً؟" value={r.month} onChange={(v) => set({ month: v })}
                        options={[{ value: '', label: 'غير ثابت' }, ...MONTHS.map((m, k) => ({ value: String(k + 1), label: m }))]} />
                    )}
                    <NumberField label="كم تستثمر منه؟" value={r.invest_pct} suffix="%" min={0} max={100} onChange={(v) => set({ invest_pct: v })} />
                  </div>
                </div>
              )
            })}
            <p className="small">تستثمر سنوياً نحو <b className="figure">{sar(yearly)}</b>.</p>
          </section>
        )}

        {step === 2 && (
          <section className="stack">
            <h2>التزاماتك الشهرية</h2>
            <p className="muted">الأقساط التي تستمر سنوات. {includesObligations ? 'دخلك المستهدف يشملها، فهي للعرض وللتخطيط بعد انتهائها.' : 'ستُضاف فوق دخلك المستهدف حتى تنتهي.'}</p>
            <div className="chips">
              {OBLIGATION_CHIPS.map((n) => (
                <button key={n} type="button" className="btn ghost small" onClick={() => setObligations((r) => [...r, { name: n, monthly_amount: 0, end_year: null }])}><IconPlus /> {n}</button>
              ))}
            </div>
            {obligations.length === 0 && <p className="small muted">لا التزامات؟ تجاوز هذه الخطوة.</p>}
            {obligations.map((o, i) => {
              const set = (p: Partial<ObligationRow>) => setObligations((rows) => rows.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return (
                <div key={i} className="panel inset stack" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="grow"><TextField label="الاسم" value={o.name} onChange={(v) => set({ name: v })} /></div>
                    <button className="icon-btn" aria-label="حذف" onClick={() => setObligations((rows) => rows.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-end' }}><IconClose /></button>
                  </div>
                  <div className="grid2">
                    <NumberField label="القسط الشهري" value={o.monthly_amount} suffix="ريال" onChange={(v) => set({ monthly_amount: v })} />
                    <NumberField plain label="ينتهي سنة" value={o.end_year} min={thisYear} max={thisYear + 40} onChange={(v) => set({ end_year: Math.round(v) || null })} />
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {step === 3 && (
          <section className="stack">
            <h2>ما تملكه الآن</h2>
            <p className="muted">الأرصدة الحالية بالقيمة التقريبية. التفاصيل (الوحدات، الرموز، الربط الآلي) تضيفها لاحقاً من صفحة المحفظة.</p>
            <datalist id="platforms">{PLATFORMS.map((p) => <option key={p} value={p} />)}</datalist>
            {assets.map((a, i) => {
              const set = (p: Partial<AssetRow>) => setAssets((rows) => rows.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return (
                <div key={i} className="panel inset stack" style={{ gap: 10 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <div className="grow"><TextField label="الاسم" value={a.name} onChange={(v) => set({ name: v })} placeholder="مثال: صندوق التوزيعات الشهرية" /></div>
                    <button className="icon-btn" aria-label="حذف" onClick={() => setAssets((rows) => rows.filter((_, j) => j !== i))} style={{ alignSelf: 'flex-end' }}><IconClose /></button>
                  </div>
                  <div className="grid2">
                    <NumberField label="القيمة الحالية" value={a.value} suffix="ريال" onChange={(v) => set({ value: v })} />
                    <SelectField label="نوعه" value={a.type} onChange={(v) => set({ type: v })} options={ASSET_TYPES.map((t) => ({ value: t.type, label: t.label }))} />
                  </div>
                  <label className="field"><span>أين هو؟</span>
                    <input className="input" list="platforms" value={a.platform} onChange={(e) => set({ platform: e.target.value })} placeholder="اسم المنصة أو البنك" /></label>
                </div>
              )
            })}
            <button className="btn ghost" onClick={() => setAssets((r) => [...r, { name: '', value: 0, type: 'income_fund', platform: r[r.length - 1]?.platform ?? '' }])}><IconPlus /> أضف أصلاً</button>
            <NumberField label="صندوق الطوارئ" value={emergency} suffix="ريال" onChange={setEmergency} hint="يظهر لكنه خارج المحفظة: لا يدخل في الأوزان ولا في الهدف" />
          </section>
        )}

        {step === 4 && (
          <section className="stack">
            <h2>أسلوب المحفظة</h2>
            <p className="muted">نقطة بداية للأوزان. تغيّر أي وزن أو تضيف طبقة متى شئت من صفحة الخطة.</p>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className={`template ${template === t.key ? 'on' : ''}`} onClick={() => setTemplate(t.key)} aria-pressed={template === t.key}>
                <div className="row between"><b>{t.name}</b><span className="small muted">عائد متوقع {t.expected}%</span></div>
                <div className="small muted" style={{ margin: '4px 0 10px' }}>{t.desc}</div>
                <MixBar parts={t.sleeves.map((s, i) => ({ key: String(i), value: s.target_now, color: LAYER_VAR[s.layer], opacity: 1 - (i % 3) * 0.25, label: s.name }))} />
              </button>
            ))}
            <div className="panel stack" style={{ gap: 6 }}>
              <div className="row between small"><span>الدخل المستهدف</span><b className="figure">{sar(target)} شهرياً</b></div>
              <div className="row between small"><span>الموعد</span><b>{independence} (سن {targetAge})</b></div>
              <div className="row between small"><span>تستثمر سنوياً</span><b className="figure">{sar(yearly)}</b></div>
              <div className="row between small"><span>تملك الآن</span><b className="figure">{sar(assets.reduce((a, x) => a + x.value, 0))}</b></div>
            </div>
          </section>
        )}
      </main>

      <footer className="onboard-foot">
        {step > 0 && <button className="btn ghost" onClick={back}>السابق</button>}
        <div className="grow" />
        {step < STEPS.length - 1
          ? <button className="btn primary" onClick={next}>التالي</button>
          : <button className="btn primary" disabled={busy} onClick={finish}>{busy ? 'نجهّز خطتك…' : 'أنشئ خطتي'}</button>}
      </footer>
      <p className="tiny muted" style={{ textAlign: 'center', paddingBottom: 18 }}>الخطوة {num0(step + 1)} من {num0(STEPS.length)} · <span className="ltr">{session?.user.email}</span></p>
    </div>
  )
}
