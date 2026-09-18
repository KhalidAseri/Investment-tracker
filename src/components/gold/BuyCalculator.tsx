'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  ChevronDown,
  Info,
  Save,
  Sparkles,
  ThumbsUp,
  TrendingDown,
} from 'lucide-react'
import { analyzeQuote, computeBuy } from '@/lib/gold/calculator'
import { KARATS } from '@/lib/gold/constants'
import { formatGrams, formatMoney, formatMoneyShort, formatPercent } from '@/lib/gold/format'
import {
  getMakingChargeSarPerGram,
  getOrigin,
  getPieceType,
  ORIGINS,
  PIECE_TYPES,
  type MakingBand,
} from '@/lib/gold/rate-card'
import { getPrefs, getRateCard, saveOffer, savePrefs, saveRateCard } from '@/lib/gold/storage'
import type { BuyInput, FairnessVerdict, Karat, OriginId, PieceTypeId, RateCard } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import { BreakdownRow, Field, NumberInput, Segmented, Select } from './Controls'
import LivePriceBar from './LivePriceBar'
import { useGoldMarket } from './useGoldMarket'

const DEFAULT_INPUT: BuyInput = {
  karat: 21,
  weightGrams: 10,
  pieceType: 'chain',
  origin: 'saudi',
  quantity: 1,
  quotedTotal: null,
}

const BANDS: { value: MakingBand; label: string; sublabel: string }[] = [
  { value: 'low', label: 'منخفضة', sublabel: 'محل منافس' },
  { value: 'typical', label: 'متوسطة', sublabel: 'الأكثر شيوعاً' },
  { value: 'high', label: 'مرتفعة', sublabel: 'محل راقٍ' },
]

const VERDICT_STYLES: Record<
  FairnessVerdict,
  { bg: string; text: string; icon: typeof ThumbsUp; label: string }
> = {
  great: { bg: 'bg-green-50 border-green-200', text: 'text-green-900', icon: Sparkles, label: 'صفقة ممتازة' },
  fair: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-900', icon: ThumbsUp, label: 'سعر منطقي' },
  high: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-900', icon: AlertTriangle, label: 'أعلى من المتوقع' },
  overpriced: { bg: 'bg-red-50 border-red-200', text: 'text-red-900', icon: AlertTriangle, label: 'سعر مرتفع' },
}

export default function BuyCalculator() {
  const marketState = useGoldMarket()
  const { market } = marketState

  const [input, setInput] = useState<BuyInput>(DEFAULT_INPUT)
  const [rateCard, setRateCard] = useState<RateCard>(getRateCard)
  const [band, setBand] = useState<MakingBand>('typical')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [quoted, setQuoted] = useState<number>(0)
  const [quotedIncludesVat, setQuotedIncludesVat] = useState(true)
  const [shopName, setShopName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  // Resume the last session's inputs.
  useEffect(() => {
    const prefs = getPrefs()
    if (prefs.lastBuyInput) setInput({ ...DEFAULT_INPUT, ...prefs.lastBuyInput })
    setRateCard(getRateCard())
  }, [])

  const update = (patch: Partial<BuyInput>) => {
    setInput((prev) => {
      const next = { ...prev, ...patch }
      savePrefs({ lastBuyInput: next })
      return next
    })
  }

  const updateRateCard = (patch: Partial<RateCard>) => {
    setRateCard((prev) => {
      const next = { ...prev, ...patch }
      saveRateCard(next)
      return next
    })
  }

  const piece = getPieceType(input.pieceType)
  const origin = getOrigin(input.origin)

  const breakdown = useMemo(
    () => (market ? computeBuy(input, market, rateCard, band) : null),
    [input, market, rateCard, band]
  )

  const fairness = useMemo(
    () =>
      market && quoted > 0 ? analyzeQuote(input, market, rateCard, quoted, quotedIncludesVat) : null,
    [input, market, rateCard, quoted, quotedIncludesVat]
  )

  /** Reference making charge before any user override, for the hint text. */
  const referenceMakingSar = getMakingChargeSarPerGram(
    input.pieceType,
    input.origin,
    input.karat,
    band
  )

  const unusualKarat =
    !piece.commonKarats.includes(input.karat) || !origin.commonKarats.includes(input.karat)

  const handleSaveOffer = () => {
    if (!market || quoted <= 0) return
    saveOffer({
      shopName: shopName.trim() || 'محل بدون اسم',
      input,
      quotedTotal: quoted,
      currency: market.currency.code,
      spotUsdPerOunce: market.spot.usdPerOunce,
      notes: '',
    })
    setSavedFlash(true)
    setShopName('')
    setTimeout(() => setSavedFlash(false), 2500)
  }

  return (
    <div className="space-y-4">
      <LivePriceBar state={marketState} karat={input.karat} />

      {/* ===== Inputs ===== */}
      <div className="card space-y-5">
        <Field label="العيار" hint={KARATS.find((k) => k.karat === input.karat)?.noteAr}>
          <Segmented
            options={KARATS.map((k) => ({
              value: k.karat,
              label: `عيار ${k.karat}`,
              sublabel: String(k.stamp),
            }))}
            value={input.karat}
            onChange={(karat) => update({ karat: karat as Karat })}
          />
        </Field>

        <Field
          label="الوزن بالجرام"
          hint="أدخل وزن الذهب فقط. لو فيها فصوص أو أحجار، اطلب من البائع وزنها منفصلاً — الفص يُحسب عليك وقت الشراء ولا قيمة له وقت البيع."
        >
          <NumberInput
            value={input.weightGrams}
            onChange={(weightGrams) => update({ weightGrams })}
            step={0.5}
            min={0}
            max={10000}
            suffix="جم"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع القطعة">
            <Select
              options={PIECE_TYPES.map((p) => ({ value: p.id, label: p.labelAr }))}
              value={input.pieceType}
              onChange={(pieceType) => update({ pieceType: pieceType as PieceTypeId })}
            />
          </Field>
          <Field label="الدقة / المنشأ">
            <Select
              options={ORIGINS.map((o) => ({ value: o.id, label: o.labelAr }))}
              value={input.origin}
              onChange={(originId) => update({ origin: originId as OriginId })}
            />
          </Field>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
          <p className="flex gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
              <strong className="font-semibold text-gray-800">{piece.labelAr}:</strong> {piece.noteAr}
            </span>
          </p>
          <p className="mt-2 flex gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
              <strong className="font-semibold text-gray-800">{origin.labelAr}:</strong> {origin.noteAr}
            </span>
          </p>
        </div>

        {unusualKarat && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              تركيبة غير معتادة: {piece.labelAr} {origin.labelAr} بعيار {input.karat} قليل في السوق.
              تأكد من الدمغة داخل القطعة قبل الشراء.
            </span>
          </p>
        )}

        <Field label="عدد القطع">
          <NumberInput
            value={input.quantity}
            onChange={(quantity) => update({ quantity: Math.max(1, Math.round(quantity)) })}
            step={1}
            min={1}
            max={999}
            inputMode="numeric"
            suffix="قطعة"
          />
        </Field>

        <Field
          label="مستوى المصنعية المتوقع"
          hint={
            piece.bullion
              ? 'السبائك والعملات تُسعَّر بنسبة صغيرة من قيمة المعدن، لا بمصنعية الجرام.'
              : `المرجع لهذه التركيبة: ${referenceMakingSar.toFixed(0)} ريال/جم قبل التحويل للعملة المختارة.`
          }
        >
          <Segmented options={BANDS} value={band} onChange={setBand} size="sm" />
        </Field>
      </div>

      {/* ===== Breakdown ===== */}
      {breakdown && market && (
        <div className="card">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">تفصيل السعر</h2>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input
                type="checkbox"
                checked={rateCard.includeVat}
                onChange={(e) => updateRateCard({ includeVat: e.target.checked })}
                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              شامل الضريبة
            </label>
          </div>

          <div className="mt-2 divide-y divide-gray-100">
            <BreakdownRow
              label={`قيمة الذهب (${formatGrams(input.weightGrams * input.quantity)} عيار ${input.karat})`}
              hint={`${formatMoney(breakdown.pricePerGramKarat, market.currency)} للجرام`}
              value={formatMoney(breakdown.goldValue, market.currency)}
            />
            <BreakdownRow
              label="المصنعية"
              hint={
                piece.bullion
                  ? 'نسبة السبيكة/العملة فوق سعر المعدن'
                  : `${formatMoney(breakdown.makingPerGram, market.currency)} للجرام`
              }
              value={formatMoney(breakdown.makingTotal, market.currency)}
            />
            {breakdown.shopMargin > 0 && (
              <BreakdownRow
                label="ربح المحل المضاف"
                value={formatMoney(breakdown.shopMargin, market.currency)}
              />
            )}
            <BreakdownRow
              label="الإجمالي قبل الضريبة"
              value={formatMoney(breakdown.totalWithoutVat, market.currency)}
              emphasis="strong"
            />
            <BreakdownRow
              label={`ضريبة القيمة المضافة (${formatPercent(breakdown.vatRate * 100, 0)})`}
              hint={
                breakdown.vatRate === 0
                  ? 'ذهب استثماري بنقاء 99% فأعلى على شكل سبيكة أو عملة — معفى بنسبة صفر'
                  : 'الضريبة على كامل الفاتورة (الذهب + المصنعية) وليست على المصنعية فقط'
              }
              value={formatMoney(breakdown.vat, market.currency)}
              emphasis="muted"
            />
            <BreakdownRow
              label={rateCard.includeVat ? 'الإجمالي شامل الضريبة' : 'الإجمالي بدون ضريبة'}
              value={formatMoney(
                rateCard.includeVat ? breakdown.totalWithVat : breakdown.totalWithoutVat,
                market.currency
              )}
              emphasis="total"
            />
          </div>

          {/* What you actually lose the moment you walk out */}
          <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-orange-900">
              <TrendingDown className="h-4 w-4" />
              لو بعتها اليوم
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] font-medium text-orange-700">المحل بيشتريها بـ</p>
                <p className="text-lg font-bold tabular-nums text-orange-900">
                  {formatMoneyShort(breakdown.instantResale, market.currency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-orange-700">خسارة فورية</p>
                <p className="text-lg font-bold tabular-nums text-orange-900">
                  {formatMoneyShort(breakdown.instantLoss, market.currency)}
                  <span className="ms-1 text-xs font-semibold">
                    ({formatPercent(breakdown.instantLossPercent, 0)})
                  </span>
                </p>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-orange-800">
              المصنعية {formatMoneyShort(breakdown.makingTotal + breakdown.shopMargin, market.currency)}
              {breakdown.vat > 0 && (
                <> والضريبة {formatMoneyShort(breakdown.vat, market.currency)}</>
              )}
              {' '}— ولا واحد منهما يرجع لك عند البيع. القطع اللي مصنعيتها أقل تخسر أقل.
            </p>
          </div>
        </div>
      )}

      {/* ===== Is the shop's quote fair? ===== */}
      <div className="card space-y-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">هل سعر المحل منطقي؟</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            اكتب السعر اللي قاله لك البائع، ونطلع لك المصنعية الحقيقية اللي يحاسبك عليها.
          </p>
        </div>

        <Field label="السعر اللي عرضه المحل">
          <NumberInput
            value={quoted}
            onChange={setQuoted}
            step={50}
            min={0}
            suffix={market?.currency.symbolAr}
            placeholder="0"
          />
        </Field>

        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input
            type="checkbox"
            checked={quotedIncludesVat}
            onChange={(e) => setQuotedIncludesVat(e.target.checked)}
            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          السعر المعروض شامل الضريبة
        </label>

        {fairness && market && (
          <>
            {(() => {
              const style = VERDICT_STYLES[fairness.verdict]
              const Icon = style.icon
              return (
                <div className={cn('rounded-xl border p-4', style.bg)}>
                  <p className={cn('flex items-center gap-2 text-sm font-bold', style.text)}>
                    <Icon className="h-4 w-4" />
                    {style.label}
                  </p>
                  <p className={cn('mt-2 text-xs leading-relaxed', style.text)}>
                    {fairness.messageAr}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/10 pt-3">
                    <div>
                      <p className={cn('text-[11px] font-medium opacity-80', style.text)}>
                        الفرق عن السعر المتوقع
                      </p>
                      <p className={cn('text-sm font-bold tabular-nums', style.text)}>
                        {fairness.difference >= 0 ? '+' : ''}
                        {formatMoneyShort(fairness.difference, market.currency)}
                      </p>
                    </div>
                    <div>
                      <p className={cn('text-[11px] font-medium opacity-80', style.text)}>
                        فاوض للوصول إلى
                      </p>
                      <p className={cn('text-sm font-bold tabular-nums', style.text)}>
                        {formatMoneyShort(fairness.suggestedTarget, market.currency)}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Save for side-by-side comparison later */}
            <div className="flex gap-2">
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="اسم المحل (للمقارنة لاحقاً)"
                className="min-w-0 flex-1 rounded-xl border-gray-200 py-2.5 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
              />
              <button
                onClick={handleSaveOffer}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white active:bg-gray-700"
              >
                {savedFlash ? <BadgeCheck className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {savedFlash ? 'انحفظ' : 'احفظ'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* ===== Advanced assumptions ===== */}
      <div className="card">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-start"
        >
          <span className="text-sm font-bold text-gray-900">إعدادات متقدمة</span>
          <ChevronDown
            className={cn('h-4 w-4 text-gray-400 transition-transform', showAdvanced && 'rotate-180')}
          />
        </button>

        {showAdvanced && (
          <div className="mt-4 space-y-5">
            <Field
              label="مصنعية مخصصة لكل جرام"
              hint="لو البائع قال لك المصنعية بالضبط، اكتبها هنا وتجاهل التقديرات. اتركها فاضية للرجوع للتقدير التلقائي."
            >
              <NumberInput
                value={rateCard.makingChargeOverride ?? 0}
                onChange={(v) =>
                  updateRateCard({ makingChargeOverride: v > 0 ? v : null, makingChargeMode: 'perGram' })
                }
                step={5}
                min={0}
                suffix={market?.currency.symbolAr}
              />
            </Field>

            <Field
              label="ربح إضافي للمحل"
              hint="في السوق السعودي ربح المحل عادةً داخل المصنعية نفسها، فاتركها صفر إلا إذا كان محلك يفصلها في الفاتورة."
            >
              <NumberInput
                value={Math.round(rateCard.shopMarginPercent * 1000) / 10}
                onChange={(v) => updateRateCard({ shopMarginPercent: Math.max(0, v) / 100 })}
                step={1}
                min={0}
                max={100}
                suffix="%"
              />
            </Field>

            <Field
              label="نسبة ما يدفعه المحل عند إعادة الشراء"
              hint="المحلات تشتري بخصم 0.5%–2% من قيمة المعدن. قلّلها لو محلك يخصم أكثر."
            >
              <NumberInput
                value={Math.round(rateCard.buybackFactor * 1000) / 10}
                onChange={(v) =>
                  updateRateCard({ buybackFactor: Math.min(100, Math.max(0, v)) / 100 })
                }
                step={0.5}
                min={0}
                max={100}
                suffix="%"
              />
            </Field>
          </div>
        )}
      </div>
    </div>
  )
}
