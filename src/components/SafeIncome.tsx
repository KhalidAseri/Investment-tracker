// «كم تقتطع شهرياً؟»: the share of the portfolio that can be paid out each year through the income account so that zakat is
// paid and, by the chosen rule, the portfolio keeps its real value after 10 years or the money lasts 30 years — as
// probabilities from historical data (lib/sustain.ts via useSustain). The owner can adopt a level in the plan.
import { useState } from 'react'
import { useStore } from '../lib/store'
import { useSustain } from '../lib/market'
import { usePlan, usePlanOps } from '../lib/usePlan'
import type { PlanIncome } from '../lib/plan'
import type { SustainLevel } from '../lib/sustain'
import { haptic } from '../lib/ui'
import { Card, KV, Money, Pct } from './kit'
import { Segmented } from './ui'
import './Insights.css'

type Rule = 'grow' | 'last'
type Basis = 'income' | 'current'
const NAME: Record<string, string> = { '0.9': 'آمن جداً', '0.75': 'متوازن', '0.5': 'الحد الأعلى' }
const nameOf = (c: number) => NAME[String(c)] ?? `${Math.round(c * 100)}%`
const round1 = (v: number) => Math.round(v * 10) / 10
const ym = (s: string) => s.replace('-', '/')
const monthsCount = (n: number) => (n <= 10 ? `${n} أشهر` : `${n} شهراً`)

export function SafeIncome() {
  const { readOnly } = useStore()
  const { doc, progress } = usePlan()
  const ops = usePlanOps()
  const hasPhases = !!doc?.phases.length
  const planValue = progress?.planValue ?? 0
  const inc = doc?.income ?? null
  const goalCap = doc?.goal.target_capital
    ?? (doc?.goal.monthly_income && inc && inc.annual_pct > 0 ? (doc.goal.monthly_income * 12) / (inc.annual_pct / 100) : null)
  const empty = !(planValue > 0)
  const value = empty ? goalCap ?? 1_000_000 : undefined
  const basisOf: 'value' | 'goal' | 'million' = !empty ? 'value' : goalCap ? 'goal' : 'million'

  const [rule, setRule] = useState<Rule>('grow')
  const [basis, setBasis] = useState<Basis>(hasPhases ? 'income' : 'current')
  const want: Basis = empty && hasPhases ? 'income' : basis
  const { result, input } = useSustain({ basis: want, value })
  const [picked, setSel] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  if (empty && !hasPhases) {
    return (
      <Card title="كم تقتطع شهرياً؟">
        <p className="ins-note">أضف أصولك أو صمّم خطتك، ثم يظهر هنا ما يمكن اقتطاعه شهرياً مع تغطية الزكاة.</p>
      </Card>
    )
  }

  const levels: SustainLevel[] = !result ? [] : rule === 'grow' ? result.levels : result.longevity ?? []
  // until the owner picks, the most cautious level that pays an income
  const sel = picked ?? (levels.find((l) => l.annualPct >= 0.05) ?? levels[0])?.confidence ?? 0.9
  const chosen = levels.find((l) => l.confidence === sel) ?? levels[0] ?? null
  const usedBasis = input?.basis ?? want
  const total = input?.value ?? value ?? planValue
  const zakatPct = result && total > 0 ? (result.zakatAnnual / total) * 100 : 0
  const years = rule === 'grow' ? (input?.horizonYears ?? 10) : (result?.longevityYears ?? 30)
  const safest = levels[0]
  const low = rule === 'grow' && !!safest && safest.annualPct < 2.5
  const planPct = inc && inc.method === 'percent' ? Number(inc.annual_pct) || 0 : null
  const adoptPct = chosen ? round1(chosen.annualPct) : 0
  const same = planPct != null && Math.abs(planPct - adoptPct) < 0.05

  const adopt = async () => {
    if (!doc || !chosen || !(adoptPct > 0)) return
    haptic()
    setBusy(true)
    const income: PlanIncome = inc
      ? { ...inc, method: 'percent', annual_pct: adoptPct }
      : { start: doc.goal.target_date ?? null, method: 'percent', annual_pct: adoptPct, fixed_monthly: null, band_pct: 10, treasury_months: 12,
          transfer_day: 27, no_sell_drawdown_pct: 20, build_from: null, instruments: [] }
    await ops.save({ ...doc, income })
    setBusy(false)
  }

  return (
    <Card title="كم تقتطع شهرياً؟" className="si">
      <div className="si-body">
        <p className="si-lead">نسبة سنوية تُصرف عبر حساب الدخل بعد دفع الزكاة، من محاكاة آلاف السيناريوهات على بيانات الأسواق التاريخية.</p>
        <Segmented label="القاعدة" value={rule} onChange={(v) => { haptic(); setRule(v) }}
          options={[{ value: 'grow', label: 'تبقى المحفظة تنمو' }, { value: 'last', label: 'يكفي 30 سنة' }]} />
        <p className="ins-note">{rule === 'grow'
          ? `تحافظ المحفظة مع حساب الدخل على قيمتها بعد التضخم بعد ${years} سنوات.`
          : `لا ينفد المال طوال ${years} سنة، مع دخل ثابت القيمة بعد التضخم.`}</p>

        {!result ? <div className="skeleton si-skel" aria-label="جارٍ الحساب" /> : <>
          <div className="si-levels" role="radiogroup" aria-label="مستوى الأمان">
            {levels.map((l) => (
              <button key={l.confidence} type="button" className="si-level" aria-pressed={sel === l.confidence} onClick={() => { haptic(); setSel(l.confidence) }}>
                <i className="si-dot" />
                <span className="si-name"><b>{nameOf(l.confidence)}</b><span>ينجح في <Pct v={l.confidence * 100} digits={0} /> من السيناريوهات التاريخية</span></span>
                <span className="si-val">
                  <b><Pct v={l.annualPct} /></b>
                  <span>≈ <Money v={l.monthly} /> شهرياً</span>
                </span>
                {sel === l.confidence && (
                  <span className="si-more">التغيّر الوسيط لقيمتها الحقيقية بعد {rule === 'grow' ? `${years} سنوات` : `${years} سنة`}: {Math.abs(l.medianGrowth) < 0.5 ? 'نحو الصفر' : <Pct v={l.medianGrowth} signed />}</span>
                )}
              </button>
            ))}
          </div>
          <p className="ins-note">
            {basisOf === 'value' ? <>المبالغ بقيمة محفظتك وحساب الدخل اليوم (<Money v={total} />).</>
              : basisOf === 'goal' ? <>محفظتك فارغة بعد، فالمبالغ على رأس المال المستهدف في خطتك (<Money v={total} />).</>
              : <>محفظتك فارغة بعد، فالمبالغ لكل مليون ريال.</>}
          </p>

          {low && (
            <p className="si-low">النسبة الآمنة منخفضة لأن العائد الحقيقي المتوقع للمزيج نحو <Pct v={result.stats.meanReal} /> سنوياً بعد التضخم، وتأخذ الزكاة منه نحو <Pct v={zakatPct} digits={2} />، فيبقى القليل للسحب مع الحفاظ على القيمة.</p>
          )}
          {result.failAtZero >= 10 && rule === 'grow' && (
            <p className="si-low">حتى دون أي سحب، لا يحافظ هذا المزيج على قيمته الحقيقية في <Pct v={result.failAtZero} digits={0} /> من السيناريوهات.</p>
          )}

          <div className="si-facts">
            <KV label="الزكاة" value={<>نحو <Money v={result.zakatAnnual} /> سنوياً</>} sub="مغطاة: تُدفع قبل الدخل في الحساب" />
            <KV label="استقرار الدخل" value={result.stability.cutYears > 0 ? <>ينخفض في <Pct v={result.stability.cutYears} digits={0} /> من السنوات</> : 'نادراً ما ينخفض'}
              sub={result.stability.cutYears > 0 ? <>أسوأ انخفاض سنوي <Pct v={result.stability.worstChange} signed /> (الهامش يحدّه)</> : 'عن العام السابق'} />
          </div>

          <details className="more">
            <summary>كيف حُسب؟</summary>
            <div className="more-body">
              <div className="si-facts">
                <KV label="أساس الحساب" value={usedBasis === 'income' ? 'أوزان مرحلة الدخل' : 'محفظتك الحالية'} sub={usedBasis === 'income' && input?.phase ? `مرحلة «${input.phase}»` : undefined} />
                <KV label="عائد المزيج بعد التضخم" value={<><Pct v={result.stats.meanReal} /> سنوياً</>} sub={<>تذبذب <Pct v={result.stats.vol} /></>} />
                <KV label="أكبر هبوط تاريخي للمزيج" value={<Pct v={-Math.abs(result.stats.maxDrawdown)} signed />} />
                <KV label="البيانات" value={monthsCount(result.stats.months)} sub={result.stats.from ? <bdi dir="ltr">{ym(result.stats.from)} – {ym(result.stats.to)}</bdi> : undefined} />
                <KV label="قواعد الحساب" value={<><Pct v={input?.rule.bandPct ?? 10} digits={0} /> هامش · دخل {input?.rule.treasuryMonths ?? 12} شهراً</>} sub={<>تضخم <Pct v={input?.inflation ?? 2} /> سنوياً</>} />
              </div>
              {result.note && <p className="ins-note">{result.note}</p>}
              <div className="choice-chips" role="group" aria-label="أساس الحساب">
                <button type="button" aria-pressed={want === 'current'} disabled={empty} onClick={() => { haptic(); setBasis('current') }}>مكوّنات محفظتك الحالية</button>
                <button type="button" aria-pressed={want === 'income'} disabled={!hasPhases} onClick={() => { haptic(); setBasis('income') }}>أوزان مرحلة الدخل في خطتك</button>
              </div>
              {want === 'income' && usedBasis === 'current' && <p className="ins-note">خطتك بلا أوزان لمرحلة الدخل، فاستُخدمت مكوّنات محفظتك.</p>}
            </div>
          </details>

          {!readOnly && chosen && (
            <div className="si-adopt">
              {doc ? (
                <button type="button" className="btn primary block" disabled={busy || same || !(adoptPct > 0)} onClick={adopt}>
                  {busy ? 'جارٍ الحفظ…' : !(adoptPct > 0) ? 'لا دخل آمن عند هذا المستوى' : same ? <>نسبة خطتك <Pct v={adoptPct} /> بالفعل</> : <>اعتمد <Pct v={adoptPct} /> في خطتي</>}
                </button>
              ) : <a className="btn soft block" href="#/plan">أنشئ خطتك لاعتماد نسبة</a>}
              <p className="ins-note">
                {planPct != null && !same ? <>في خطتك الآن <Pct v={planPct} />. </> : null}
                {progress?.treasury.approved ? 'مبلغ هذه السنة معتمد، وتسري النسبة من المراجعة السنوية القادمة.' : 'احتمالات من بيانات تاريخية، وليست وعداً بالنتائج.'}
              </p>
            </div>
          )}
          {readOnly && <p className="ins-note">احتمالات من بيانات تاريخية، وليست وعداً بالنتائج.</p>}
        </>}
      </div>
    </Card>
  )
}
