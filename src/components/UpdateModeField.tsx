// «طريقة التحديث»: a holding is priced automatically every day (Yahoo symbol or Saudi fund id), or its value is entered by
// hand at a frequency the owner picks (weekly … yearly, or any number of days). Used by AddAsset, HoldingSheet and Asset.
import { useState } from 'react'
import type { Holding } from '../lib/types'
import { DEFAULT_UPDATE_DAYS, UPDATE_EVERY_OPTIONS } from '../lib/staleness'
import { haptic } from '../lib/ui'
import { NumberField } from './ui'
import './Insights.css'

export type UpdateFields = Pick<Holding, 'price_source' | 'symbol' | 'update_every_days'>

/** chip labels, in the order of UPDATE_EVERY_OPTIONS */
const CHIP: Record<number, string> = { 7: 'أسبوعياً', 14: 'كل أسبوعين', 30: 'شهرياً', 91: 'كل 3 أشهر', 182: 'كل 6 أشهر', 365: 'سنوياً' }

/** The automatic source a symbol allows: a number is a Saudi fund id (Mubasher NAV), anything else a Yahoo symbol. */
export const autoSourceOf = (symbol: string | null | undefined): 'nav' | 'yahoo' | null => {
  const s = (symbol ?? '').trim()
  return !s ? null : /^\d+$/.test(s) ? 'nav' : 'yahoo'
}
export const isAutoSource = (src: Holding['price_source'] | undefined) => src === 'yahoo' || src === 'nav' || src === 'ibkr'

/** The fields to save when switching mode (switching back to automatic restores the source from the symbol). */
export function modePatch(cur: UpdateFields, mode: 'auto' | 'manual', every?: number | null): Partial<Holding> {
  if (mode === 'auto') {
    const src = autoSourceOf(cur.symbol)
    return src ? { price_source: src, update_every_days: null } : {}
  }
  const days = every ?? (cur.price_source === 'manual' ? cur.update_every_days : null) ?? DEFAULT_UPDATE_DAYS
  return { price_source: 'manual', update_every_days: days }
}

export function UpdateModeField({ value, onChange, label = 'طريقة التحديث' }: {
  value: UpdateFields; onChange: (patch: Partial<Holding>) => void; label?: string
}) {
  const src = value.price_source ?? 'manual'
  const every = Number(value.update_every_days) > 0 ? Math.round(Number(value.update_every_days)) : DEFAULT_UPDATE_DAYS
  const preset = UPDATE_EVERY_OPTIONS.some((o) => o.days === every)
  const [custom, setCustom] = useState(src === 'manual' && !preset)
  const autoOk = !!autoSourceOf(value.symbol)

  if (src === 'ibkr') {
    return (
      <div className="field umf">
        <span>{label}</span>
        <p className="umf-note">تلقائي يومياً من تقرير IBKR؛ تتحدث وحداته وسعره دون تدخل منك.</p>
      </div>
    )
  }
  const auto = src === 'yahoo' || src === 'nav'
  const pick = (mode: 'auto' | 'manual') => {
    if ((mode === 'auto') === auto) return
    haptic()
    onChange(modePatch(value, mode))
  }
  return (
    <div className="field umf">
      <span>{label}</span>
      <div className="segmented full" role="group" aria-label={label}>
        <button type="button" aria-pressed={auto} disabled={!autoOk} onClick={() => pick('auto')}>تلقائي يومياً</button>
        <button type="button" aria-pressed={!auto} onClick={() => pick('manual')}>يدوي</button>
      </div>
      {auto ? (
        <small>{src === 'nav' ? 'يتحدث سعر الوحدة كل صباح من مباشر.' : 'يتحدث السعر كل يوم من السوق.'}</small>
      ) : <>
        <div className="choice-chips umf-chips" role="group" aria-label="كل كم تحدّثه؟">
          {UPDATE_EVERY_OPTIONS.map((o) => (
            <button key={o.days} type="button" aria-pressed={!custom && every === o.days}
              onClick={() => { haptic(); setCustom(false); onChange({ price_source: 'manual', update_every_days: o.days }) }}>{CHIP[o.days] ?? o.label}</button>
          ))}
          <button type="button" aria-pressed={custom} onClick={() => { haptic(); setCustom(true) }}>مخصص</button>
        </div>
        {custom && (
          <NumberField label="كل كم يوماً؟" value={every} plain min={1} max={730} suffix="يوماً"
            onChange={(v) => onChange({ price_source: 'manual', update_every_days: Math.max(1, Math.round(v || DEFAULT_UPDATE_DAYS)) })} />
        )}
        <small>{autoOk ? 'تُدخل قيمته بنفسك، ويذكّرك التطبيق عند موعده.' : 'تُدخل قيمته بنفسك، ويذكّرك التطبيق عند موعده. التحديث التلقائي يحتاج رمز تداول أو رقم صندوق.'}</small>
      </>}
    </div>
  )
}
