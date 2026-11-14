'use client'

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { RiskProfile } from '@/lib/types'
import { PROFILE_LABEL, PROFILE_TARGETS } from '@/lib/labels'
import { Chips, Field, NumberInput } from './ui'

/** Three numbers the whole plan is built on. Everything here can be changed later. */
export default function Onboarding() {
  const { L, settings, updateSettings } = useStore()
  const [expenses, setExpenses] = useState(settings.monthlyExpenses)
  const [contribution, setContribution] = useState(settings.monthlyContribution)
  const [goal, setGoal] = useState(settings.goal.amount)
  const [profile, setProfile] = useState<Exclude<RiskProfile, 'CUSTOM'>>('BALANCED')
  const hints: Record<typeof profile, string> = {
    CONSERVATIVE: L('تقلب أقل ونمو أهدأ — يناسب مدة أقل من 5 سنوات.', 'Lower swings, calmer growth — fits horizons under 5 years.'),
    BALANCED: L('نمو مع وسادة من الصكوك والذهب — يناسب 5 إلى 10 سنوات.', 'Growth with a sukuk and gold cushion — fits 5 to 10 years.'),
    GROWTH: L('أعلى نمو متوقع وأعلى تقلب — يناسب أكثر من 10 سنوات.', 'Highest expected growth and swings — fits 10+ years.'),
  }

  const finish = (skip: boolean) =>
    updateSettings(skip ? { onboarded: true } : {
      onboarded: true,
      monthlyExpenses: expenses,
      monthlyContribution: contribution,
      riskProfile: profile,
      targets: { ...PROFILE_TARGETS[profile] },
      targetsSet: true,
      goal: { ...settings.goal, amount: goal },
    })

  return (
    <section className="card space-y-4">
      <div>
        <h2 className="text-lg font-bold">{L('أهلًا بك — لنضبط خطتك', 'Welcome — let’s set up your plan')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{L('ثلاثة أرقام تكفي ليبدأ التطبيق بتوجيهك. تقدر تعدّلها لاحقًا من «الخطة».', 'Three numbers are enough for the app to start guiding you. You can change them later under Plan.')}</p>
      </div>
      <Field label={L('مصاريفك الشهرية تقريبًا', 'Your approximate monthly expenses')} hint={L('لتحديد حجم صندوق الطوارئ.', 'Sizes your emergency fund.')}>
        <NumberInput value={expenses} onChange={setExpenses} suffix={L('ر.س', 'SAR')} />
      </Field>
      <Field label={L('كم تستثمر شهريًا؟', 'How much do you invest each month?')} hint={L('يشمل الخصم التلقائي لبرنامج ادخار جهة العمل.', 'Include any automatic employer-plan deduction.')}>
        <NumberInput value={contribution} onChange={setContribution} suffix={L('ر.س', 'SAR')} />
      </Field>
      <Field label={L('المبلغ الذي تطمح للوصول إليه (اختياري)', 'The amount you are aiming for (optional)')}>
        <NumberInput value={goal} onChange={setGoal} suffix={L('ر.س', 'SAR')} />
      </Field>
      <Field group label={L('أسلوبك في الاستثمار', 'Your investing style')} hint={hints[profile]}>
        <Chips wrap value={profile} onChange={setProfile} options={(['CONSERVATIVE', 'BALANCED', 'GROWTH'] as const).map((p) => ({ value: p, label: L(PROFILE_LABEL[p].ar, PROFILE_LABEL[p].en) }))} />
      </Field>
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={() => finish(false)}>{L('ابدأ', 'Start')}</button>
        <button className="btn-ghost" onClick={() => finish(true)}>{L('تخطي', 'Skip')}</button>
      </div>
    </section>
  )
}
