import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ageAt, simulateIncome } from '../lib/calc'
import { num0, pct, sar, sarShort } from '../lib/format'
import { LinesChart, PathChart } from '../components/charts'
import { Knob, Segmented, Switch } from '../components/ui'

export default function Outlook() {
  const { settings, updateSettings, upsert, notify, readOnly } = useStore()
  const d = useDerived()
  const [stress, setStress] = useState<'none' | 'crash'>('none')
  const startYear = settings?.independence_year ?? 2038
  const startValue = useMemo(() => {
    if (!d || !settings) return 0
    const p = d.proj.find((x) => x.year >= startYear + 0.999) ?? d.proj[d.proj.length - 1]
    return p.mid
  }, [d, settings, startYear])
  const sims = useMemo(() => {
    if (!settings) return null
    const shock = stress === 'crash' ? -30 : 0
    return {
      low: simulateIncome(settings, startValue, settings.return_low, 35, shock),
      mid: simulateIncome(settings, startValue, settings.expected_return, 35, shock),
      high: simulateIncome(settings, startValue, settings.return_high, 35, shock),
    }
  }, [settings, startValue, stress])
  if (!settings || !d || !sims) return null
  const s = settings
  const thisYear = new Date().getFullYear()
  const fi = d.fi ? Math.round(d.fi) : null
  const deflate = Math.pow(1 + s.inflation_rate / 100, startYear - thisYear)
  const first = sims.mid[0]?.incomeMonthlyReal / deflate
  const at = (arr: typeof sims.mid, k: number) => (arr[k]?.incomeMonthlyReal ?? 0) / deflate
  const minIncome = Math.min(...sims.low.map((x) => x.incomeMonthlyReal / deflate))
  const birth = s.birth_year

  return (
    <>
      <section className="status">
        <p className="kicker">متى تصل؟</p>
        <p className="answer">
          {fi ? <>تبلغ هدفك عام <span className="num">{fi}</span> في سن <span className="num">{ageAt(s, fi)}</span></> : <>لا يصل المسار الحالي خلال 24 سنة</>}
        </p>
        <p className="muted" style={{ marginTop: 6 }}>
          {d.fiLow && d.fiHigh ? <>بين <b className="num">{Math.round(d.fiHigh)}</b> و<b className="num">{Math.round(d.fiLow)}</b> حسب العائد الفعلي. </> : null}
          للوصول في <b className="num">{s.independence_year}</b> تحتاج إيداعاً سنوياً يبدأ من <b className="num">{sarShort(d.needContribution)}</b>.
        </p>
      </section>

      <section className="section">
        <div className="section-head"><h2>خصّص خطتك</h2><button className="btn quiet small" onClick={() => {
          updateSettings({ monthly_income_target: 20000, withdrawal_rate: 4, expected_return: 6.5, return_low: 5, return_high: 8, inflation_rate: 2.5, annual_contribution: 300000, contribution_growth: 4, independence_year: 2038, include_mortgage: false })
          notify('أُعيدت قيم الدليل')
        }}>قيم الدليل</button></div>
        <div className="panel knobs">
          <Knob label="الدخل الشهري الذي تريده" value={s.monthly_income_target} min={5000} max={60000} step={500}
            display={sar(s.monthly_income_target)} hint="بقيمة ريال اليوم" onChange={(v) => updateSettings({ monthly_income_target: v })} />
          <Knob label="نسبة السحب السنوية" value={s.withdrawal_rate} min={3} max={5.5} step={0.1}
            display={pct(s.withdrawal_rate)} hint="3.5% آمنة جداً لعمر طويل، و4% مع قواعد الحماية" onChange={(v) => updateSettings({ withdrawal_rate: Math.round(v * 10) / 10 })} />
          <Knob label="الإيداع السنوي" value={s.annual_contribution} min={0} max={900000} step={10000}
            display={sar(s.annual_contribution)} hint={`يزيد ${pct(s.contribution_growth)} كل عام`} onChange={(v) => updateSettings({ annual_contribution: v })} />
          <Knob label="نمو الإيداع السنوي" value={s.contribution_growth} min={0} max={10} step={0.5}
            display={pct(s.contribution_growth)} onChange={(v) => updateSettings({ contribution_growth: v })} />
          <Knob label="العائد المتوقع" value={s.expected_return} min={3} max={10} step={0.25}
            display={pct(s.expected_return, 2)} hint={`المدى المرسوم من ${pct(s.return_low)} إلى ${pct(s.return_high)}`}
            onChange={(v) => updateSettings({ expected_return: v, return_low: Math.max(1, v - 1.5), return_high: v + 1.5 })} />
          <Knob label="التضخم" value={s.inflation_rate} min={1} max={5} step={0.25}
            display={pct(s.inflation_rate, 2)} onChange={(v) => updateSettings({ inflation_rate: v })} />
          <Knob label="سنة الاستقلال المستهدفة" value={s.independence_year} min={thisYear + 3} max={thisYear + 25} step={1}
            display={`${s.independence_year} (سن ${s.independence_year - birth})`} onChange={(v) => updateSettings({ independence_year: v, glide_start_year: Math.min(s.glide_start_year, v - 1) })} />
          <Switch label="أضف قسط التمويل العقاري للدخل المطلوب" hint={`${sar(s.mortgage_monthly)} شهرياً حتى ${s.mortgage_end_year}`}
            checked={s.include_mortgage} onChange={(v) => updateSettings({ include_mortgage: v })} />
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>{readOnly ? 'جرّب الأرقام بحرية؛ تجاربك لا تُحفظ ولا تغيّر الخطة.' : 'كل تغيير يُحفظ ويظهر فوراً على أجهزتك الأخرى.'}</p>
      </section>

      <section className="section">
        <PathChart settings={s} proj={d.proj} fi={d.fi} title="توقع نمو المحفظة مقابل الهدف" height={290} />
        <div className="legend">
          <span><i style={{ background: 'var(--accent)' }} />المتوقع</span>
          <span><i style={{ background: 'var(--accent)', opacity: 0.25, height: 8 }} />المدى المحتمل</span>
          <span><i style={{ background: 'var(--horizon)' }} />المحفظة المطلوبة مع التضخم</span>
        </div>
        <div className="facts">
          <div className="fact"><div className="v">{sarShort(d.capitalToday)}</div><div className="l">المطلوب بقيمة اليوم</div></div>
          <div className="fact"><div className="v">{sarShort(d.targetAtGoalYear)}</div><div className="l">المطلوب اسمياً في {s.independence_year}</div></div>
          <div className="fact"><div className="v">{sarShort(d.capitalSafe)}</div><div className="l">الهدف الآمن بنسبة {pct(s.safe_withdrawal_rate)}</div></div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>دخلك بعد الاستقلال</h2></div>
        <div style={{ marginBottom: 12 }}>
          <Segmented label="اختبار الضغط" value={stress} onChange={setStress} options={[{ value: 'none', label: 'سنوات عادية' }, { value: 'crash', label: 'هبوط 30% في أول سنة' }]} />
        </div>
        <p className="muted small" style={{ marginBottom: 12 }}>
          لو بدأت السحب في {startYear} بمحفظة متوقعة {sarShort(startValue)}، هذا دخلك الشهري بقيمة ريال اليوم سنة بعد سنة. القاعدة: {pct(s.withdrawal_rate)} من قيمة المحفظة، ولا يتغير الدخل أكثر من {pct(s.guard_cut)} عن العام السابق.
        </p>
        <div className="panel">
          <LinesChart title="الدخل الشهري الحقيقي بعد الاستقلال" yFormat={(v) => `${Math.round(v / 1000)} ألف`}
            reference={{ y: s.monthly_income_target, label: 'دخلك المستهدف' }}
            series={[
              { key: 'low', label: `عائد ${pct(s.return_low)}`, color: 'var(--warn)', dashed: true, points: sims.low.map((x) => ({ x: startYear - birth + x.year, y: x.incomeMonthlyReal / deflate })) },
              { key: 'high', label: `عائد ${pct(s.return_high)}`, color: 'var(--growth)', dashed: true, points: sims.high.map((x) => ({ x: startYear - birth + x.year, y: x.incomeMonthlyReal / deflate })) },
              { key: 'mid', label: `عائد ${pct(s.expected_return)}`, color: 'var(--accent)', points: sims.mid.map((x) => ({ x: startYear - birth + x.year, y: x.incomeMonthlyReal / deflate })) },
            ]} />
          <div className="legend">
            <span><i style={{ background: 'var(--accent)' }} />عائد {pct(s.expected_return)}</span>
            <span><i style={{ background: 'var(--growth)' }} />عائد {pct(s.return_high)}</span>
            <span><i style={{ background: 'var(--warn)' }} />عائد {pct(s.return_low)}</span>
            <span>المحور الأفقي: عمرك</span>
          </div>
          <h3 style={{ marginTop: 18 }}>الدخل الشهري بقيمة ريال اليوم</h3>
          <div className="table-wrap"><table className="table" style={{ marginTop: 6 }}>
            <thead><tr><th>العائد</th><th className="n">أول سنة</th><th className="n">بعد 10 سنوات</th><th className="n">بعد 25 سنة</th></tr></thead>
            <tbody>
              {(['high', 'mid', 'low'] as const).map((k) => (
                <tr key={k}>
                  <td className="n" style={{ textAlign: 'start' }}>{pct(k === 'high' ? s.return_high : k === 'mid' ? s.expected_return : s.return_low)}</td>
                  <td className="n">{num0(at(sims[k], 0))}</td><td className="n">{num0(at(sims[k], 10))}</td><td className="n">{num0(at(sims[k], 25))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <p className="small" style={{ marginTop: 12 }}>
            {first >= s.monthly_income_target * 0.98
              ? <>في السيناريو المتوقع يبدأ دخلك عند <b className="figure">{sar(first)}</b> شهرياً، وأقل دخل في أسوأ سيناريو <b className="figure">{sar(minIncome)}</b>.</>
              : <>في السيناريو المتوقع يبدأ دخلك عند <b className="figure">{sar(first)}</b>، أي أقل من هدفك. أخّر سنة الاستقلال أو ارفع الإيداع.</>}
          </p>
        </div>
        {!readOnly && <div className="row wrap" style={{ marginTop: 12, gap: 10 }}>
          <button className="btn ghost" onClick={async () => {
            const amount = Math.round((startValue * s.withdrawal_rate) / 100 / 12)
            const ok = await upsert('events', { title: 'التحويل الشهري من احتياطي الدخل', kind: 'withdrawal', event_date: `${startYear}-01-27`, amount, recurrence: 'monthly', note: 'يُعاد حسابه كل يناير' })
            if (ok) notify('أُضيف التحويل الشهري إلى التقويم')
          }}>أضف التحويل الشهري إلى التقويم</button>
        </div>}
      </section>
    </>
  )
}
