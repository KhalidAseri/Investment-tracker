'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import type { AssetClass, RiskProfile } from '@/lib/types'
import { ASSET_CLASSES, CLASS_COLOR, CLASS_LABEL, PROFILE_LABEL, PROFILE_TARGETS } from '@/lib/labels'
import { Chips, Disclaimer, NumberInput, Sheet } from './ui'

export default function TargetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, settings, updateSettings } = useStore()
  const [profile, setProfile] = useState<RiskProfile>(settings.riskProfile)
  const [targets, setTargets] = useState<Record<AssetClass, number>>(settings.targets)
  useEffect(() => {
    if (open) { setProfile(settings.riskProfile); setTargets(settings.targets) }
  }, [open, settings.riskProfile, settings.targets])

  const total = ASSET_CLASSES.reduce((s, c) => s + (targets[c] || 0), 0)
  const pick = (p: RiskProfile) => {
    setProfile(p)
    if (p !== 'CUSTOM') setTargets({ ...PROFILE_TARGETS[p] })
  }

  return (
    <Sheet open={open} onClose={onClose} title={L('التوزيع المستهدف', 'Target allocation')} footer={
      <button className="btn-primary w-full" disabled={Math.round(total) !== 100} onClick={() => { updateSettings({ targets, riskProfile: profile, targetsSet: true }); onClose() }}>
        {Math.round(total) === 100 ? L('حفظ التوزيع', 'Save allocation') : L(`المجموع ${total}% — يجب أن يساوي 100%`, `Total ${total}% — must equal 100%`)}
      </button>
    }>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-soft">{L('اختر قالبًا ثم عدّل النسب كما تريد. التوزيع يخص محفظتك الاستثمارية؛ صندوق الطوارئ خارج الحساب.', 'Pick a template, then adjust. This applies to your investable portfolio; the emergency fund is outside it.')}</p>
        <Chips wrap value={profile} onChange={pick} options={(Object.keys(PROFILE_LABEL) as RiskProfile[]).map((p) => ({ value: p, label: L(PROFILE_LABEL[p].ar, PROFILE_LABEL[p].en) }))} />
        <ul className="space-y-2.5">
          {ASSET_CLASSES.map((c) => (
            <li key={c} className="flex items-center gap-3">
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: CLASS_COLOR[c] }} aria-hidden />
              <span className="flex-1 text-sm">{L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en)}</span>
              <div className="w-28"><NumberInput value={targets[c] || 0} onChange={(n) => { setTargets({ ...targets, [c]: n }); setProfile('CUSTOM') }} suffix="%" /></div>
            </li>
          ))}
        </ul>
        <Disclaimer>{L('القوالب نقطة بداية عامة وليست توصية شخصية. كلما طالت مدتك وزاد تحملك للتقلب أمكن رفع حصة الأسهم.', 'Templates are a general starting point, not personal advice. The longer your horizon and tolerance, the higher the equity share can be.')}</Disclaimer>
      </div>
    </Sheet>
  )
}
