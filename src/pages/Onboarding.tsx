import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { num0, sar } from '../lib/format'
import { ASSET_TYPES, TEMPLATES, type AssetType } from '../lib/profile'
import type { IncomeStream } from '../lib/types'
import { MixBar } from '../components/charts'
import { NumberField, Segmented, SelectField, Switch, TextField } from '../components/ui'
import { IconClose, IconPlus } from '../components/icons'
import { LAYER_VAR } from '../lib/derived'

type ObligationRow = { name: string; monthly_amount: number; end_year: number | null }
type AssetRow = { name: string; value: number; type: AssetType; platform: string }

const STEPS = ['التزاماتك', 'ما تملكه الآن', 'أسلوب المحفظة']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
const PLATFORMS = ['الراجحي المالية', 'Interactive Brokers', 'دراية المالية', 'الأهلي المالية', 'الإنماء للاستثمار', 'الجزيرة كابيتال', 'برنامج ادخار جهة العمل', 'حساب بنكي']
const OBLIGATION_CHIPS = ['تمويل عقاري', 'قرض شخصي', 'تمويل سيارة', 'قسط سلفة']

export default function Onboarding() {
  const { createPlan, signOut, session } = useStore()
  const thisYear = new Date().getFullYear()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [obligations, setObligations] = useState<ObligationRow[]>([])
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [emergency, setEmergency] = useState(0)
  const [template, setTemplate] = useState('balanced')

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
        extra: { template },
      },
      accounts,
      sleeves: tpl.sleeves.map(({ asset: _a, ...s }) => s),
      holdings,
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
          <b>لنجهّز محفظتك</b>
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
            <h2>التزاماتك الشهرية</h2>
            <p className="muted">الأقساط التي تستمر سنوات، مثل التمويل العقاري أو الشخصي. يمكنك لاحقاً إضافة المبلغ المتبقي لكل دين من «صافي الثروة».</p>
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

        {step === 1 && (
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
            <NumberField label="صندوق الطوارئ" value={emergency} suffix="ريال" onChange={setEmergency} hint="يظهر لكنه خارج المحفظة: لا يدخل في الأوزان" />
          </section>
        )}

        {step === 2 && (
          <section className="stack">
            <h2>أسلوب المحفظة</h2>
            <p className="muted">نقطة بداية للأوزان. تغيّر أي وزن أو تضيف طبقة متى شئت من صفحة الأوزان.</p>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" className={`template ${template === t.key ? 'on' : ''}`} onClick={() => setTemplate(t.key)} aria-pressed={template === t.key}>
                <b>{t.name}</b>
                <div className="small muted" style={{ margin: '4px 0 10px' }}>{t.desc}</div>
                <MixBar parts={t.sleeves.map((s, i) => ({ key: String(i), value: s.target_now, color: LAYER_VAR[s.layer], opacity: 1 - (i % 3) * 0.25, label: s.name }))} />
              </button>
            ))}
            <div className="panel stack" style={{ gap: 6 }}>
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
          : <button className="btn primary" disabled={busy} onClick={finish}>{busy ? 'نجهّز محفظتك…' : 'ابدأ'}</button>}
      </footer>
      <p className="tiny muted" style={{ textAlign: 'center', paddingBottom: 18 }}>الخطوة {num0(step + 1)} من {num0(STEPS.length)} · <span className="ltr">{session?.user.email}</span></p>
    </div>
  )
}
