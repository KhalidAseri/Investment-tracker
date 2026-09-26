'use client'

import { AlertTriangle, Info } from 'lucide-react'
import { KARATS } from '@/lib/gold/constants'
import { formatMoney, formatPercent } from '@/lib/gold/format'
import {
  getBullionFeePercent,
  getMakingChargeSarPerGram,
  getOrigin,
  getPieceType,
  ORIGINS,
  PIECE_TYPES,
  type MakingBand,
} from '@/lib/gold/rate-card'
import { sarToDisplay } from '@/lib/gold/calculator'
import type {
  BuyInput,
  Karat,
  MarketSnapshot,
  OriginId,
  PieceType,
  PieceTypeId,
  RateCard,
} from '@/lib/gold/types'
import {
  Disclosure,
  Field,
  NumberInput,
  PieceGrid,
  Segmented,
  Select,
  ToggleChip,
} from './Controls'
import WeightPicker from './WeightPicker'

const BANDS: { value: MakingBand; label: string; sublabel: string }[] = [
  { value: 'low', label: 'منخفضة', sublabel: 'محل منافس' },
  { value: 'typical', label: 'متوسطة', sublabel: 'الأكثر شيوعاً' },
  { value: 'high', label: 'مرتفعة', sublabel: 'محل راقٍ' },
]

/**
 * Every input, on one surface, in the order someone describes a piece:
 * what it is, what karat, how heavy, and what the shop is asking.
 *
 * The four that matter are always open. Origin, workmanship band, quantity
 * and the buy-back assumptions sit behind a disclosure with defaults that
 * suit the Saudi market, because a tool that demands you know what دقة means
 * before it will show you a price has stopped being useful.
 */
export default function BuyForm({
  input,
  onInput,
  band,
  onBand,
  rateCard,
  onRateCard,
  quoted,
  onQuoted,
  quotedIncludesVat,
  onQuotedIncludesVat,
  market,
}: {
  input: BuyInput
  onInput: (patch: Partial<BuyInput>) => void
  band: MakingBand
  onBand: (band: MakingBand) => void
  rateCard: RateCard
  onRateCard: (patch: Partial<RateCard>) => void
  quoted: number
  onQuoted: (value: number) => void
  quotedIncludesVat: boolean
  onQuotedIncludesVat: (value: boolean) => void
  market: MarketSnapshot | null
}) {
  const piece = getPieceType(input.pieceType)
  const origin = getOrigin(input.origin)

  const unusualKarat =
    !piece.commonKarats.includes(input.karat) || !origin.commonKarats.includes(input.karat)

  /** Making charge per gram for a piece, in the display currency, for the grid. */
  const pieceCostLabel = (p: PieceType) => {
    if (!market) return '—'
    if (p.bullion) return `+${formatPercent(getBullionFeePercent(input.weightGrams, band) * 100, 1)}`
    const perGram = sarToDisplay(
      getMakingChargeSarPerGram(p.id, input.origin, input.karat, band),
      market
    )
    return `${formatMoney(perGram, market.currency, { decimals: 0, withSymbol: false })}/جم`
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-5">
        <Field label="العيار" hint={KARATS.find((k) => k.karat === input.karat)?.noteAr}>
          <Segmented
            options={KARATS.map((k) => ({
              value: k.karat,
              label: `عيار ${k.karat}`,
              sublabel: String(k.stamp),
            }))}
            value={input.karat}
            onChange={(karat) => onInput({ karat: karat as Karat })}
          />
        </Field>

        <Field
          label="الوزن"
          hint="وزن الذهب فقط. لو فيها فصوص، اطلب وزنها منفصلاً — الفص يُحسب عليك وقت الشراء ولا قيمة له وقت البيع."
        >
          <WeightPicker
            value={input.weightGrams}
            onChange={(weightGrams) => onInput({ weightGrams })}
          />
        </Field>

        <Field label="نوع القطعة" hint={`${piece.labelAr}: ${piece.noteAr}`}>
          <PieceGrid
            pieces={PIECE_TYPES}
            value={input.pieceType}
            onChange={(pieceType) => onInput({ pieceType: pieceType as PieceTypeId })}
            costLabel={pieceCostLabel}
          />
        </Field>

        {unusualKarat && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              تركيبة غير معتادة: {piece.labelAr} {origin.labelAr} بعيار {input.karat} قليل في
              السوق. تأكد من الدمغة داخل القطعة قبل الشراء.
            </span>
          </p>
        )}
      </div>

      <div className="card space-y-4">
        <Field
          label="السعر اللي طلبه المحل"
          hint="اكتبه ونقول لك تشتري أو تفاوض، ونطلع لك المصنعية الحقيقية اللي يحاسبك عليها."
        >
          <NumberInput
            value={quoted}
            onChange={onQuoted}
            step={50}
            min={0}
            suffix={market?.currency.symbolAr}
            placeholder="0"
          />
        </Field>
        <ToggleChip
          checked={quotedIncludesVat}
          onChange={onQuotedIncludesVat}
          label="السعر المعروض شامل الضريبة"
        />
      </div>

      <div className="card">
        <Disclosure title="تفاصيل أدق">
          <div className="space-y-5">
            <Field label="الدقة / المنشأ">
              <Select
                options={ORIGINS.map((o) => ({ value: o.id, label: o.labelAr }))}
                value={input.origin}
                onChange={(originId) => onInput({ origin: originId as OriginId })}
              />
            </Field>

            <p className="flex gap-2 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
              <span>
                <strong className="font-bold text-gray-800">{origin.labelAr}:</strong>{' '}
                {origin.noteAr}
              </span>
            </p>

            <Field
              label="مستوى المصنعية المتوقع"
              hint={
                piece.bullion
                  ? 'السبائك والعملات تُسعَّر بنسبة صغيرة من قيمة المعدن، لا بمصنعية الجرام.'
                  : 'المصنعية تختلف من محل لآخر على نفس القطعة. جرّب المستويات وشوف الفرق.'
              }
            >
              <Segmented options={BANDS} value={band} onChange={onBand} size="sm" />
            </Field>

            <Field label="عدد القطع">
              <NumberInput
                value={input.quantity}
                onChange={(quantity) => onInput({ quantity: Math.max(1, Math.round(quantity)) })}
                step={1}
                min={1}
                max={999}
                inputMode="numeric"
                suffix="قطعة"
              />
            </Field>

            <Field
              label="مصنعية مخصصة لكل جرام"
              hint="لو البائع قال لك المصنعية بالضبط، اكتبها هنا. صفر = رجوع للتقدير التلقائي."
            >
              <NumberInput
                value={rateCard.makingChargeOverride ?? 0}
                onChange={(v) =>
                  onRateCard({
                    makingChargeOverride: v > 0 ? v : null,
                    makingChargeMode: 'perGram',
                  })
                }
                step={5}
                min={0}
                suffix={market?.currency.symbolAr}
              />
            </Field>

            <Field
              label="نسبة ما يدفعه المحل عند إعادة الشراء"
              hint="المحلات تشتري بخصم 0.5%–2% من قيمة المعدن. قلّلها لو محلك يخصم أكثر."
            >
              <NumberInput
                value={Math.round(rateCard.buybackFactor * 1000) / 10}
                onChange={(v) => onRateCard({ buybackFactor: Math.min(100, Math.max(0, v)) / 100 })}
                step={0.5}
                min={0}
                max={100}
                suffix="%"
              />
            </Field>
          </div>
        </Disclosure>
      </div>
    </div>
  )
}
