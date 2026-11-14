'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '@/lib/store'
import { CLASS_COLOR, ZAKAT_LABEL, todayISO } from '@/lib/labels'
import { annualTransfer, yearEndSummary } from '@/lib/engine/income'
import { nextHawlDate, zakatStatus } from '@/lib/engine/zakat'
import { pct } from '@/lib/format'
import { ZakatSheet } from './ZakatControl'
import { Delta, Disclaimer, Money, Notice, Sheet } from './ui'

/** Zakat day and the yearly transfer are the same day: review actual zakat, set the year's income, compare with the plan. */
export default function YearEndSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, data, settings, view, quotes, updateSettings } = useStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [editing, setEditing] = useState<string | null>(null)
  const Next = settings.locale === 'ar' ? ChevronLeft : ChevronRight

  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const zakat = useMemo(() => zakatStatus(view.rows, quotes, settings), [view.rows, quotes, settings])
  const t = useMemo(() => annualTransfer(investRows, zakat.due, data.snapshots, settings, L), [investRows, zakat.due, data.snapshots, settings, L])
  const y = useMemo(() => yearEndSummary(t, view.investable, view.cost, data.snapshots, settings), [t, view.investable, view.cost, data.snapshots, settings])
  if (!open) return null

  const close = () => { setStep(1); onClose() }
  const confirm = () => {
    updateSettings({
      income: { ...settings.income, annualIncome: t.income, lastRate: t.ratePct, lastTransferDate: todayISO() },
      zakat: {
        ...settings.zakat,
        lastPaidDate: todayISO(),
        lastPaidAmount: zakat.due,
        hawlDate: nextHawlDate(settings.zakat.hawlDate || todayISO(), settings.zakat.calendar),
        history: [
          { date: todayISO(), value: view.investable, planned: y.zakatPlanned, actual: zakat.due, income: t.income, items: zakat.rows.filter((r) => r.due > 0).map((r) => ({ name: r.name, amount: r.due })) },
          ...settings.zakat.history,
        ],
      },
    })
    close()
  }
  const titles = { 1: L('1 من 3 — راجع الزكاة الفعلية', '1 of 3 — Review actual zakat'), 2: L('2 من 3 — دخل السنة والتحويلة', '2 of 3 — Year’s income and transfer'), 3: L('3 من 3 — الخطة مقابل الفعلي', '3 of 3 — Plan vs actual') }
  const row = (label: string, plan: React.ReactNode, actual: React.ReactNode) => (
    <tr className="border-t border-line"><th scope="row" className="py-2.5 pe-2 text-start font-medium">{label}</th><td className="py-2.5 text-ink-soft">{plan}</td><td className="py-2.5 font-semibold">{actual}</td></tr>
  )

  return (
    <>
      <Sheet open onClose={close} title={titles[step]} footer={
        <div className="flex gap-2">
          {step > 1 && <button className="btn-ghost" onClick={() => setStep((step - 1) as 1 | 2)}>{L('رجوع', 'Back')}</button>}
          {step < 3
            ? <button className="btn-primary flex-1" onClick={() => setStep((step + 1) as 2 | 3)}>{step === 1 ? L('الزكاة صحيحة — التالي', 'Zakat is right — next') : L('التالي', 'Next')}<Next className="h-4 w-4" /></button>
            : <button className="btn-primary flex-1" disabled={view.investable <= 0} onClick={confirm}>{L('دفعتُ الزكاة ونفّذتُ التحويلة', 'I paid zakat and did the transfer')}</button>}
        </div>
      }>
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-ink-soft">{L('هذه زكاة كل أصل بقيمته اليوم. اضغط أي أصل لتعديل طريقته أو رقمه قبل الدفع.', 'This is each asset’s zakat at today’s value. Tap any asset to change its treatment or figure before paying.')}</p>
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {zakat.rows.map((r) => (
                <li key={r.assetId}>
                  <button className="flex min-h-[60px] w-full items-center justify-between gap-3 px-3.5 py-2 text-start hover:bg-surface" onClick={() => setEditing(r.assetId)}>
                    <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.name}</span><span className="text-xs text-ink-soft">{L(ZAKAT_LABEL[r.mode].ar, ZAKAT_LABEL[r.mode].en)} · <span className="num">{pct(r.effectivePct, 2)}</span></span></span>
                    <Money value={r.due} className="shrink-0 text-sm font-bold" />
                  </button>
                </li>
              ))}
              {zakat.rows.length === 0 && <li className="px-3.5 py-3 text-sm text-ink-soft">{L('لا أصول مسجلة.', 'No assets recorded.')}</li>}
            </ul>
            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L(`المخطط (${y.zakatPlannedPct}% من المحفظة)`, `Planned (${y.zakatPlannedPct}% of the portfolio)`)}</dt><dd><Money value={y.zakatPlanned} /></dd></div>
              <div className="flex justify-between bg-surface px-3.5 py-2.5"><dt className="font-semibold">{L('الفعلي', 'Actual')} (<span className="num">{pct(y.zakatActualPct, 2)}</span>)</dt><dd className="font-bold"><Money value={zakat.due} /></dd></div>
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L('الفرق يذهب لدخلك', 'The difference goes to your income')}</dt><dd><Delta value={y.zakatPlanned - zakat.due} /></dd></div>
            </dl>
            {zakat.aboveNisab === false && <Notice tone="info" title={L('الوعاء المسجل هنا دون النصاب', 'The base recorded here is below the nisab')}>{L('إن كان لك مال زكوي خارج التطبيق فاجمعه معه.', 'If you hold zakatable wealth outside the app, add it in.')}</Notice>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-brand-50 p-4">
              <p className="text-xs text-brand-700">{L('راتبك الشهري للسنة القادمة', 'Your monthly salary for the coming year')}</p>
              <p className="text-3xl font-bold text-brand-900"><Money value={t.monthly} /></p>
              <p className="mt-1 text-xs text-brand-700">{L('دخل السنة', 'Year’s income')} <Money value={t.income} /> = <span className="num">{pct(t.ratePct, 2)}</span> × {L('متوسط القيمة', 'average value')} <Money value={t.smoothed} /></p>
            </div>
            <p className="text-sm leading-relaxed text-ink-soft">
              {L(`نسبة الدخل = العائد ${settings.goal.expectedReturn}% − الزكاة الفعلية ${t.zakatRatePct.toFixed(2)}% − التضخم ${settings.goal.inflation}% − النمو ${settings.income.growthTarget}%.`, `Income rate = return ${settings.goal.expectedReturn}% − actual zakat ${t.zakatRatePct.toFixed(2)}% − inflation ${settings.goal.inflation}% − growth ${settings.income.growthTarget}%.`)}
              {t.smoothedMonths < 36 && L(` المتوسط على ${t.smoothedMonths} شهر متاح، ويكتمل إلى 36.`, ` Averaged over ${t.smoothedMonths} available month(s), building to 36.`)}
            </p>
            {t.rule === 'cut' && <Notice tone="warn" title={L('خُفّض الدخل 10%', 'Income cut 10%')}>{L('كان سيتجاوز الحد الأعلى من قيمة المحفظة الحالية.', 'It would exceed the upper bound of today’s value.')}</Notice>}
            {t.rule === 'raise' && <Notice tone="good" title={L('رُفع الدخل 10%', 'Income raised 10%')}>{L('كان أقل من الحد الأدنى من قيمة المحفظة الحالية.', 'It was below the lower bound of today’s value.')}</Notice>}
            {t.rule === 'held' && <Notice tone="warn" title={L('ثُبّت على دخل السنة الماضية', 'Held at last year’s income')}>{L('لا زيادة في سنة خسرت فيها المحفظة.', 'No raise in a year the portfolio lost value.')}</Notice>}
            {t.ratePct <= 0 && <Notice tone="warn" title={L('لا يبقى دخل هذه السنة', 'Nothing is left for income this year')}>{L('العائد المتوقع لا يغطي الزكاة والتضخم والنمو المطلوب. خفّض النمو المطلوب من خطة الدخل.', 'The expected return does not cover zakat, inflation and the growth target. Lower the growth target in the income plan.')}</Notice>}
            <dl className="divide-y divide-line rounded-2xl border border-line text-sm">
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L('التحويلة = الدخل + الزكاة', 'Transfer = income + zakat')}</dt><dd className="font-semibold"><Money value={t.transfer} /></dd></div>
              <div className="flex justify-between px-3.5 py-2.5"><dt className="text-ink-soft">{L('الموجود في حساب الدخل', 'Already in the income account')}</dt><dd><Money value={t.inAccount} /></dd></div>
              <div className="flex justify-between bg-surface px-3.5 py-2.5"><dt className="font-semibold">{L('المطلوب تحويله الآن', 'To move now')}</dt><dd className="font-bold"><Money value={t.need} /></dd></div>
            </dl>
            {t.need > 0 && (
              <div className="text-sm">
                <p className="mb-1.5 font-semibold">
                  {t.marketDown ? <>{L(`السوق نازل ${t.drawdownPct.toFixed(0)}% عن قمته — خذ من الاحتياط`, `The market is ${t.drawdownPct.toFixed(0)}% off its peak — take from the reserve`)} <Money value={t.fromReserve} />{t.sells.length > 0 && L('، والباقي من:', ', and the rest from:')}</> : L('بِع من الفئات الزائدة عن وزنها المستهدف:', 'Sell from the classes above their target weight:')}
                </p>
                {t.sells.length > 0 && (
                  <ul className="divide-y divide-line rounded-xl border border-line">
                    {t.sells.map((l) => <li key={l.assetClass} className="flex items-center justify-between gap-3 px-3 py-2"><span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CLASS_COLOR[l.assetClass] }} aria-hidden />{l.label}</span><Money value={l.amount} className="font-semibold" /></li>)}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-ink-soft"><th className="pb-2 text-start font-medium" /><th className="pb-2 text-start font-medium">{L('الخطة', 'Plan')}</th><th className="pb-2 text-start font-medium">{L('الفعلي', 'Actual')}</th></tr></thead>
              <tbody>
                {row(L('الزكاة', 'Zakat'), <span className="num">{pct(y.zakatPlannedPct, 2)}</span>, <span className="num">{pct(y.zakatActualPct, 2)}</span>)}
                {row(L('نسبة الدخل', 'Income rate'), <span className="num">{pct(y.incomeRatePlanned, 2)}</span>, <span className="num">{pct(y.incomeRateActual, 2)}</span>)}
                {row(L('دخل السنة', 'Year’s income'), <Money value={y.incomePlanned} />, <Money value={y.incomeActual} />)}
                {row(L('الراتب الشهري', 'Monthly salary'), <Money value={y.incomePlanned / 12} />, <Money value={y.incomeActual / 12} />)}
                {row(L('النمو الحقيقي', 'Real growth'), <span className="num">{pct(y.growthTarget, 1)}</span>, y.realizedRealPct === null ? <span className="font-normal text-ink-soft">{L('يظهر بعد سنة', 'After a year')}</span> : <span className="num">{pct(y.realizedRealPct, 1, true)}</span>)}
              </tbody>
            </table>
            {y.realizedPct !== null && <p className="hint">{L(`أداء السنة الماضية ${pct(y.realizedPct, 1, true)} صافيًا من الإيداعات والسحوبات، و${pct(y.realizedRealPct ?? 0, 1, true)} بعد تضخم ${settings.goal.inflation}% (تقريبي).`, `Last year returned ${pct(y.realizedPct, 1, true)} net of money added or withdrawn, ${pct(y.realizedRealPct ?? 0, 1, true)} after ${settings.goal.inflation}% inflation (approximate).`)}</p>}
            {y.incomeChangePct !== null && (
              <Notice tone={(y.incomeRealChangePct ?? 0) >= 0 ? 'good' : 'info'} title={L(`دخلك ${y.incomeChangePct >= 0 ? 'ارتفع' : 'انخفض'} ${Math.abs(y.incomeChangePct).toFixed(1)}% عن السنة الماضية`, `Your income ${y.incomeChangePct >= 0 ? 'rose' : 'fell'} ${Math.abs(y.incomeChangePct).toFixed(1)}% on last year`)}>
                {(y.incomeRealChangePct ?? 0) >= 0 ? L(`سبق التضخم بـ ${(y.incomeRealChangePct ?? 0).toFixed(1)} نقطة: قوتك الشرائية زادت.`, `Ahead of inflation by ${(y.incomeRealChangePct ?? 0).toFixed(1)} points: your purchasing power grew.`) : L(`أقل من التضخم بـ ${Math.abs(y.incomeRealChangePct ?? 0).toFixed(1)} نقطة: قوتك الشرائية نقصت هذه السنة.`, `Behind inflation by ${Math.abs(y.incomeRealChangePct ?? 0).toFixed(1)} points: your purchasing power fell this year.`)}
              </Notice>
            )}
            <Disclaimer>{L('عند التأكيد يُحفظ سجل هذه السنة مفصّلًا، يُثبَّت راتبك الشهري، وينتقل الموعد للحول القادم. سجّل بعدها عمليات البيع والإيداع الفعلية من صفحة كل أصل.', 'On confirming, this year is saved in detail, your monthly salary is fixed, and the date moves to next year. Then record the actual sales and deposits on each asset’s page.')}</Disclaimer>
          </div>
        )}
      </Sheet>
      <ZakatSheet assetId={editing} onClose={() => setEditing(null)} />
    </>
  )
}
