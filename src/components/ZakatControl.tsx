'use client'

import { useStore } from '@/lib/store'
import type { ZakatMode } from '@/lib/types'
import { DEFAULT_ZAKAT_PERCENT, ZAKAT_HINT, ZAKAT_LABEL, ZAKAT_MODES, defaultZakatMode } from '@/lib/labels'
import { fxRate } from '@/lib/engine/valuation'
import { zakatDue, zakatRate, type ZakatFields } from '@/lib/engine/zakat'
import { pct } from '@/lib/format'
import { Field, Money, NumberInput, Sheet, Slider, cx } from './ui'

/**
 * How one asset is zakated. The same control serves the add-asset wizard, the asset page and
 * the zakat-day review, so a treatment is always chosen and read the same way.
 */
export function ZakatControl({ value, onChange, assetValue, quantity, currency, live }: {
  value: ZakatFields
  onChange: (patch: Partial<ZakatFields>) => void
  /** Market value in SAR. */
  assetValue: number
  quantity: number
  currency: string
  /** Per-share zakat only makes sense for assets held as a number of units. */
  live: boolean
}) {
  const { L, settings } = useStore()
  const rate = zakatRate(settings)
  const { due } = zakatDue(value, assetValue, quantity, fxRate(currency, settings.fx), rate)
  const modes = ZAKAT_MODES.filter((m) => live || m !== 'PER_UNIT')

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-brand-50 p-3.5">
        <p className="text-xs text-brand-700">{L('زكاة هذا الأصل في السنة', 'Zakat on this asset per year')}</p>
        <p className="text-2xl font-bold text-brand-900"><Money value={due} /></p>
        <p className="text-xs text-brand-700">{assetValue > 0 ? <><span className="num">{pct((due / assetValue) * 100, 2)}</span> {L('من قيمته', 'of its value')}</> : L('أدخل القيمة ليظهر المبلغ', 'Enter the value to see the amount')}</p>
      </div>

      <div role="radiogroup" aria-label={L('طريقة زكاة الأصل', 'Zakat treatment')} className="grid grid-cols-2 gap-2">
        {modes.map((m) => {
          const on = value.zakatMode === m
          return (
            <button key={m} type="button" role="radio" aria-checked={on} onClick={() => onChange({ zakatMode: m as ZakatMode })}
              className={cx('flex min-h-[76px] flex-col items-start gap-1 rounded-2xl border p-3 text-start transition', on ? 'border-brand-600 bg-brand-50' : 'border-line bg-white hover:border-brand-500')}>
              <span className="text-sm font-semibold leading-tight">{L(ZAKAT_LABEL[m].ar, ZAKAT_LABEL[m].en)}</span>
              <span className="text-[11px] leading-snug text-ink-soft">{L(ZAKAT_HINT[m].ar, ZAKAT_HINT[m].en)}</span>
            </button>
          )
        })}
      </div>

      {value.zakatMode === 'PERCENT' && (
        <Slider label={L('نسبة الوعاء الزكوي من القيمة', 'Zakatable share of value')} value={value.zakatPercent} min={0} max={100} step={5} display={`${value.zakatPercent}%`} onChange={(zakatPercent) => onChange({ zakatPercent })}
          hint={L('من قوائم الشركة أو نشرة الصندوق إن توفرت؛ 30% تقدير تقريبي شائع عند غيابها.', 'From the company’s statements or the fund factsheet when available; 30% is a common rough estimate otherwise.')} />
      )}
      {value.zakatMode === 'PER_UNIT' && (
        <Field label={L('زكاة السهم الواحد', 'Zakat per share')} hint={L(`تُضرب في الكمية (${quantity}).`, `Multiplied by the quantity (${quantity}).`)}>
          <NumberInput value={value.zakatPerUnit ?? 0} onChange={(zakatPerUnit) => onChange({ zakatPerUnit })} suffix={currency} />
        </Field>
      )}
      {value.zakatMode === 'AMOUNT' && (
        <Field label={L('مبلغ الزكاة السنوي لهذا الأصل', 'Yearly zakat amount for this asset')}>
          <NumberInput value={value.zakatAmount ?? 0} onChange={(zakatAmount) => onChange({ zakatAmount })} suffix={L('ر.س', 'SAR')} />
        </Field>
      )}
    </div>
  )
}

/** Bottom sheet around the control for an asset that already exists; changes save as they are made. */
export function ZakatSheet({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const { L, view, updateAsset } = useStore()
  const row = view.rows.find((r) => r.asset.id === assetId)
  if (!row) return null
  const a = row.asset
  return (
    <Sheet open onClose={onClose} title={L(`زكاة: ${a.name}`, `Zakat: ${a.name}`)} footer={
      <div className="flex gap-2">
        <button className="btn-primary flex-1" onClick={onClose}>{L('تم', 'Done')}</button>
        <button className="btn-ghost" onClick={() => updateAsset(a.id, { zakatMode: defaultZakatMode(a), zakatPercent: DEFAULT_ZAKAT_PERCENT })}>{L('الافتراضي', 'Default')}</button>
      </div>
    }>
      <ZakatControl value={a} onChange={(patch) => updateAsset(a.id, patch)} assetValue={row.value} quantity={a.quantity} currency={a.currency} live={a.pricing === 'live'} />
    </Sheet>
  )
}
