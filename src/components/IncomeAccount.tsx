// «حساب الدخل»: how the stable monthly income works (yearly amount → income account → fixed monthly transfer), the account's
// balance against its target, this year's amount and the next transfer, with the sheets that move money in and out.
import { useStore } from '../lib/store'
import { usePlan } from '../lib/usePlan'
import { addMonthsISO, ymd } from '../lib/plan'
import { dateLong, relativeDays } from '../lib/format'

/** «بعد 12 يوماً» near, «بعد 5 أشهر» or «بعد 4 سنوات» far */
function until(iso: string) {
  const days = Math.round((Date.parse(iso + 'T12:00:00Z') - Date.now()) / 86400000)
  if (days <= 45) return relativeDays(iso)
  if (days < 365) { const m = Math.round(days / 30.4); return m === 2 ? 'بعد شهرين' : m <= 10 ? `بعد ${m} أشهر` : `بعد ${m} شهراً` }
  const y = Math.round(days / 365)
  return y === 1 ? 'بعد سنة' : y === 2 ? 'بعد سنتين' : y <= 10 ? `بعد ${y} سنوات` : `بعد ${y} سنة`
}
import { openAction } from '../lib/ui'
import { Card, Money, Pct } from './kit'
import { IconAlert } from './icons'
import './Insights.css'

/** «12 شهراً» · «شهرين» · «أقل من شهر» */
export const monthsWord = (n: number) => {
  const r = Math.round(n)
  if (n < 0.95) return 'أقل من شهر'
  return r === 1 ? 'شهر واحد' : r === 2 ? 'شهرين' : r <= 10 ? `${r} أشهر` : `${r} شهراً`
}

export function IncomeAccount() {
  const { readOnly } = useStore()
  const { doc, progress, today } = usePlan()
  const inc = doc?.income ?? null
  const t = progress?.treasury

  if (!inc || !t) {
    return (
      <Card title="حساب الدخل" className="ia">
        <div className="ia-body">
          <ol className="ins-steps">
            <li><span>في المراجعة السنوية يُعتمد <b>مبلغ الدخل للسنة</b> نسبةً من قيمة المحفظة.</span></li>
            <li><span>يُنقل المبلغ إلى <b>حساب الدخل</b>، وهو حساب نقدي منفصل معروف الرصيد.</span></li>
            <li><span>تحوّل منه <b>مبلغاً ثابتاً كل شهر</b>، فيبقى دخلك مستقراً مهما تقلّبت الأسواق.</span></li>
          </ol>
          <p className="ins-note">لم تحدّد حساب الدخل في خطتك بعد.</p>
          {!readOnly && <div className="ins-ctas"><a className="btn soft" href="#/plan/doc">حدّده في الخطة</a></div>}
        </div>
      </Card>
    )
  }

  const pct = t.target > 0 ? Math.min(100, (t.value / t.target) * 100) : 0
  const day = Math.max(1, Math.min(28, Math.round(Number(inc.transfer_day) || 27)))
  /** the transfer day of the month of `iso`, or of the next month when that day has passed */
  const onOrAfter = (iso: string) => { const d = ymd(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), day); return d >= iso ? d : addMonthsISO(d, 1) }
  const thisMonth = ymd(Number(today.slice(0, 4)), Number(today.slice(5, 7)), day)
  const nextTransfer = !t.started ? (inc.start ? onOrAfter(inc.start) : null) : t.transferredThisMonth ? addMonthsISO(thisMonth, 1) : thisMonth
  const due = t.started && !t.transferredThisMonth && today >= thisMonth
  const year = today.slice(0, 4)
  const state = t.started ? { label: 'يعمل', cls: 'accent' } : t.building ? { label: 'قيد التعبئة', cls: 'warn' } : { label: 'لم يبدأ', cls: '' }
  const band = Number(inc.band_pct) || 0

  return (
    <Card title={<>حساب الدخل<span className={`chip ${state.cls}`}>{state.label}</span></>} className="ia"
      action={readOnly ? null : { label: 'الإعدادات', href: '#/plan/doc' }}>
      <div className="ia-body">
        <ol className="ins-steps">
          <li><span>في المراجعة السنوية يُعتمد مبلغ السنة: {inc.method === 'fixed'
            ? <>مبلغ ثابت قدره <Money v={(Number(inc.fixed_monthly) || 0) * 12} /></>
            : <><b><Pct v={Number(inc.annual_pct) || 0} /></b> من قيمة المحفظة{band > 0 && <>، ولا يتغير عن العام السابق بأكثر من <Pct v={band} /></>}</>}.</span></li>
          <li><span>يُنقل إلى حساب الدخل ليبقى فيه دخل <b>{monthsWord(Number(inc.treasury_months) || 0)}</b>.</span></li>
          <li><span>تحوّل منه <b>مبلغاً ثابتاً</b> يوم <b><bdi dir="ltr">{day}</bdi></b> من كل شهر.</span></li>
        </ol>

        <div className="ia-bal">
          <div className="ia-bal-top">
            <b><Money v={t.value} /></b>
            <span>{t.target > 0 ? <>من <Money v={t.target} /> مستهدفة</> : 'حدّد قاعدة الدخل ليُحسب الهدف'}</span>
          </div>
          <div className="progress" role="img" aria-label={`رصيد الحساب ${Math.round(pct)}% من هدفه`}><i style={{ width: `${pct}%` }} /></div>
          <div className="ia-bal-sub">
            <span>{t.coverMonths != null ? <>يغطي {monthsWord(t.coverMonths)} من الدخل</> : 'بلا دخل محدد بعد'}</span>
            {t.shortfall > 0.5 && <span>ينقصه <Money v={t.shortfall} /></span>}
          </div>
        </div>

        <div className="ia-facts">
          <div className="ia-fact">
            <span>{t.approved ? `مبلغ ${year} المعتمد` : `مبلغ ${year} التقديري`}</span>
            <b><Money v={t.annualIncome} /></b>
            <small>{t.approved ? 'اعتُمد في المراجعة' : 'يُعتمد في المراجعة السنوية'}</small>
          </div>
          <div className="ia-fact">
            <span>التحويل الشهري</span>
            <b><Money v={t.monthlyIncome} /></b>
            <small>ثابت طوال السنة</small>
          </div>
          <div className="ia-fact">
            <span>{t.started ? 'التحويل القادم' : 'يبدأ الدخل'}</span>
            <b>{t.started ? (due ? 'مستحق الآن' : nextTransfer ? dateLong(nextTransfer) : '—') : inc.start ? dateLong(inc.start) : 'بلا موعد'}</b>
            <small>{t.started ? (due ? `منذ ${dateLong(thisMonth)}` : nextTransfer ? relativeDays(nextTransfer) : '') : inc.start ? until(inc.start) : 'حدّده في الخطة'}</small>
          </div>
          <div className="ia-fact">
            <span>{t.started ? 'شهور مغطاة' : t.building ? 'بدأت التعبئة' : 'تبدأ التعبئة'}</span>
            <b>{t.started ? (t.coverMonths != null ? monthsWord(t.coverMonths) : '—') : t.buildFrom ? dateLong(t.buildFrom) : '—'}</b>
            <small>{t.started ? `الهدف ${monthsWord(Number(inc.treasury_months) || 0)}` : t.building ? (t.monthlyMove > 0 ? <>انقل نحو <Money v={t.monthlyMove} /> شهرياً</> : 'بدأت') : t.buildFrom ? until(t.buildFrom) : ''}</small>
          </div>
        </div>

        {t.holdSales && (
          <p className="ia-hold"><IconAlert /><span>المحفظة دون قمتها بأكثر من <Pct v={Number(inc.no_sell_drawdown_pct) || 0} />: لا تبع الأسهم لتعبئة الحساب، واصرف من رصيده والتوزيعات.</span></p>
        )}

        {!readOnly && (t.started || t.building) && (
          <div className="ins-ctas">
            <button type="button" className={`btn ${t.started && due ? 'soft' : 'primary'}`} onClick={() => openAction('treasury')}>انقل إلى الحساب</button>
            {t.started && <button type="button" className={`btn ${due ? 'primary' : 'soft'}`} onClick={() => openAction('withdraw')}>{t.transferredThisMonth ? 'سجّل تحويلاً آخر' : 'سجّل تحويل الشهر'}</button>}
          </div>
        )}
        {!readOnly && !t.started && !t.building && <p className="ins-note">ابدأ التعبئة من {t.buildFrom ? dateLong(t.buildFrom) : 'الموعد الذي تحدده في الخطة'}؛ حتى ذلك الحين تبقى أموالك مستثمرة.</p>}
      </div>
    </Card>
  )
}
