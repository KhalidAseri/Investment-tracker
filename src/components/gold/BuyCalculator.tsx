'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import {
  AlertTriangle,
  BadgeCheck,
  Handshake,
  Info,
  Save,
  Sparkles,
  ThumbsUp,
  TrendingDown,
} from 'lucide-react'
import { analyzeQuote, computeBuy, sarToDisplay } from '@/lib/gold/calculator'
import { KARATS } from '@/lib/gold/constants'
import { formatGrams, formatMoney, formatMoneyShort, formatPercent } from '@/lib/gold/format'
import {
  getBullionFeePercent,
  getMakingChargeSarPerGram,
  getOrigin,
  getPieceType,
  ORIGINS,
  PIECE_TYPES,
  type MakingBand,
} from '@/lib/gold/rate-card'
import { getPrefs, getRateCard, saveOffer, savePrefs, saveRateCard } from '@/lib/gold/storage'
import { successFeedback, tapFeedback } from '@/lib/haptics'
import type {
  BuyInput,
  FairnessVerdict,
  Karat,
  OriginId,
  PieceType,
  PieceTypeId,
  RateCard,
} from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import CostBar from './CostBar'
import {
  BreakdownRow,
  Disclosure,
  Field,
  NumberInput,
  PieceGrid,
  Segmented,
  Select,
  ToggleChip,
} from './Controls'
import FairnessMeter from './FairnessMeter'
import LivePriceBar from './LivePriceBar'
import { cardIn, stagger, TAP } from './motion'
import { useGoldMarket } from './useGoldMarket'

const DEFAULT_INPUT: BuyInput = {
  karat: 21,
  weightGrams: 10,
  pieceType: 'chain',
  origin: 'saudi',
  quantity: 1,
  quotedTotal: null,
}

/** Weights people actually buy, offered as one-tap chips. */
const WEIGHT_PRESETS = [5, 10, 15, 20, 30, 50]

const BANDS: { value: MakingBand; label: string; sublabel: string }[] = [
  { value: 'low', label: 'منخفضة', sublabel: 'محل منافس' },
  { value: 'typical', label: 'متوسطة', sublabel: 'الأكثر شيوعاً' },
  { value: 'high', label: 'مرتفعة', sublabel: 'محل راقٍ' },
]

const VERDICT_STYLES: Record<
  FairnessVerdict,
  { bg: string; text: string; icon: typeof ThumbsUp; label: string }
> = {
  great: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-900', icon: Sparkles, label: 'صفقة ممتازة' },
  fair: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-900', icon: ThumbsUp, label: 'سعر منطقي' },
  high: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-900', icon: AlertTriangle, label: 'أعلى من المتوقع' },
  overpriced: { bg: 'bg-red-50 border-red-200', text: 'text-red-900', icon: AlertTriangle, label: 'سعر مرتفع' },
}

export default function BuyCalculator() {
  const marketState = useGoldMarket()
  const { market } = marketState

  const [input, setInput] = useState<BuyInput>(DEFAULT_INPUT)
  const [rateCard, setRateCard] = useState<RateCard>(getRateCard)
  const [band, setBand] = useState<MakingBand>('typical')
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

  const total = breakdown
    ? rateCard.includeVat
      ? breakdown.totalWithVat
      : breakdown.totalWithoutVat
    : 0

  /** Making charge per gram for a piece, in the display currency, for the grid. */
  const pieceCostLabel = (p: PieceType) => {
    if (!market) return '—'
    if (p.bullion) {
      return `+${formatPercent(getBullionFeePercent(input.weightGrams, band) * 100, 1)}`
    }
    const perGram = sarToDisplay(
      getMakingChargeSarPerGram(p.id, input.origin, input.karat, band),
      market
    )
    return `${formatMoney(perGram, market.currency, { decimals: 0, withSymbol: false })}/جم`
  }

  const unusualKarat =
    !piece.commonKarats.includes(input.karat) || !origin.commonKarats.includes(input.karat)

  // Drives the sticky total: it appears only once the real result card has
  // scrolled away, so the answer is on screen the entire time you are editing.
  const resultRef = useRef<HTMLDivElement>(null)
  const resultVisible = useInView(resultRef, { margin: '-90px 0px -40% 0px' })

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
    successFeedback()
    setSavedFlash(true)
    setShopName('')
    setTimeout(() => setSavedFlash(false), 2500)
  }

  return (
    <>
      <motion.div variants={stagger()} initial="hidden" animate="show" className="space-y-4">
        <LivePriceBar state={marketState} karat={input.karat} />

        {/* ===== What are you looking at? ===== */}
        <motion.section variants={cardIn} className="card space-y-5">
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
            hint="وزن الذهب فقط. لو فيها فصوص، اطلب وزنها منفصلاً — الفص يُحسب عليك وقت الشراء ولا قيمة له وقت البيع."
          >
            <NumberInput
              value={input.weightGrams}
              onChange={(weightGrams) => update({ weightGrams })}
              step={0.5}
              min={0}
              max={10000}
              suffix="جم"
              presets={WEIGHT_PRESETS}
            />
          </Field>

          <Field
            label="نوع القطعة"
            hint={`${piece.labelAr}: ${piece.noteAr}`}
          >
            <PieceGrid
              pieces={PIECE_TYPES}
              value={input.pieceType}
              onChange={(pieceType) => update({ pieceType: pieceType as PieceTypeId })}
              costLabel={pieceCostLabel}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الدقة / المنشأ">
              <Select
                options={ORIGINS.map((o) => ({ value: o.id, label: o.labelAr }))}
                value={input.origin}
                onChange={(originId) => update({ origin: originId as OriginId })}
              />
            </Field>
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
          </div>

          <p className="flex gap-2 rounded-xl bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
            <span>
              <strong className="font-bold text-gray-800">{origin.labelAr}:</strong> {origin.noteAr}
            </span>
          </p>

          <AnimatePresence>
            {unusualKarat && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start gap-2 overflow-hidden rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  تركيبة غير معتادة: {piece.labelAr} {origin.labelAr} بعيار {input.karat} قليل في
                  السوق. تأكد من الدمغة داخل القطعة قبل الشراء.
                </span>
              </motion.p>
            )}
          </AnimatePresence>

          <Field
            label="مستوى المصنعية المتوقع"
            hint={
              piece.bullion
                ? 'السبائك والعملات تُسعَّر بنسبة صغيرة من قيمة المعدن، لا بمصنعية الجرام.'
                : 'المصنعية تختلف من محل لآخر على نفس القطعة. جرّب المستويات الثلاثة وشوف الفرق.'
            }
          >
            <Segmented options={BANDS} value={band} onChange={setBand} size="sm" />
          </Field>
        </motion.section>

        {/* ===== The answer ===== */}
        {breakdown && market && (
          <motion.section variants={cardIn} ref={resultRef} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-gray-500">
                  {rateCard.includeVat ? 'السعر العادل شامل الضريبة' : 'السعر العادل بدون ضريبة'}
                </p>
                <AnimatedNumber
                  value={total}
                  format={(v) => formatMoney(v, market.currency)}
                  countOnMount
                  className="mt-1 block text-[2.1rem] font-extrabold leading-tight text-gray-900"
                />
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatGrams(input.weightGrams * input.quantity)} · عيار {input.karat} ·{' '}
                  {piece.labelAr}
                </p>
              </div>
              <ToggleChip
                checked={rateCard.includeVat}
                onChange={(includeVat) => updateRateCard({ includeVat })}
                label="بالضريبة"
              />
            </div>

            <CostBar
              className="mt-5"
              currency={market.currency}
              slices={[
                {
                  key: 'gold',
                  label: 'ذهب',
                  amount: breakdown.goldValue,
                  bar: 'bg-amber-500',
                  dot: 'bg-amber-500',
                },
                {
                  key: 'making',
                  label: 'مصنعية',
                  amount: breakdown.makingTotal + breakdown.shopMargin,
                  bar: 'bg-orange-400',
                  dot: 'bg-orange-400',
                },
                ...(rateCard.includeVat
                  ? [
                      {
                        key: 'vat',
                        label: 'ضريبة',
                        amount: breakdown.vat,
                        bar: 'bg-gray-400',
                        dot: 'bg-gray-400',
                      },
                    ]
                  : []),
              ]}
            />

            <div className="mt-4 divide-y divide-gray-100">
              <BreakdownRow
                label={`قيمة الذهب (${formatGrams(input.weightGrams * input.quantity)} عيار ${input.karat})`}
                hint={`${formatMoney(breakdown.pricePerGramKarat, market.currency)} للجرام`}
                value={
                  <AnimatedNumber
                    value={breakdown.goldValue}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
              />
              <BreakdownRow
                label="المصنعية"
                hint={
                  piece.bullion
                    ? 'نسبة السبيكة/العملة فوق سعر المعدن'
                    : `${formatMoney(breakdown.makingPerGram, market.currency)} للجرام`
                }
                value={
                  <AnimatedNumber
                    value={breakdown.makingTotal}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
              />
              {breakdown.shopMargin > 0 && (
                <BreakdownRow
                  label="ربح المحل المضاف"
                  value={formatMoney(breakdown.shopMargin, market.currency)}
                />
              )}
              <BreakdownRow
                label={`ضريبة القيمة المضافة (${formatPercent(breakdown.vatRate * 100, 0)})`}
                hint={
                  breakdown.vatRate === 0
                    ? 'ذهب استثماري بنقاء 99% فأعلى على شكل سبيكة أو عملة — معفى بنسبة صفر'
                    : 'الضريبة على كامل الفاتورة (الذهب + المصنعية) وليست على المصنعية فقط'
                }
                value={
                  <AnimatedNumber
                    value={breakdown.vat}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
                emphasis="muted"
              />
              <BreakdownRow
                label={rateCard.includeVat ? 'الإجمالي شامل الضريبة' : 'الإجمالي بدون ضريبة'}
                value={
                  <AnimatedNumber
                    value={total}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
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
                  <p className="text-[11px] font-semibold text-orange-700">المحل بيشتريها بـ</p>
                  <AnimatedNumber
                    value={breakdown.instantResale}
                    format={(v) => formatMoneyShort(v, market.currency)}
                    className="block text-lg font-bold text-orange-900"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-orange-700">خسارة فورية</p>
                  <p className="text-lg font-bold text-orange-900">
                    <AnimatedNumber
                      value={breakdown.instantLoss}
                      format={(v) => formatMoneyShort(v, market.currency)}
                    />
                    <span className="ms-1 text-xs font-bold">
                      ({formatPercent(breakdown.instantLossPercent, 0)})
                    </span>
                  </p>
                </div>
              </div>
              <p className="mt-2.5 text-[11px] leading-relaxed text-orange-800">
                المصنعية{' '}
                {formatMoneyShort(breakdown.makingTotal + breakdown.shopMargin, market.currency)}
                {breakdown.vat > 0 && <> والضريبة {formatMoneyShort(breakdown.vat, market.currency)}</>}{' '}
                — ولا واحد منهما يرجع لك عند البيع. القطع اللي مصنعيتها أقل تخسر أقل.
              </p>
            </div>
          </motion.section>
        )}

        {/* ===== Is the shop's quote fair? ===== */}
        <motion.section variants={cardIn} className="card space-y-4">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
              <Handshake className="h-4 w-4 text-amber-600" />
              هل سعر المحل منطقي؟
            </h2>
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

          <ToggleChip
            checked={quotedIncludesVat}
            onChange={setQuotedIncludesVat}
            label="السعر المعروض شامل الضريبة"
          />

          <AnimatePresence mode="wait">
            {fairness && market && (
              <motion.div
                key={fairness.verdict}
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                className="space-y-4"
              >
                {(() => {
                  const style = VERDICT_STYLES[fairness.verdict]
                  const Icon = style.icon
                  return (
                    <div className={cn('rounded-xl border p-4', style.bg)}>
                      <p className={cn('flex items-center gap-2 text-sm font-bold', style.text)}>
                        <Icon className="h-4 w-4" />
                        {style.label}
                      </p>

                      <FairnessMeter
                        className="mt-4"
                        differencePercent={fairness.differencePercent}
                        verdict={fairness.verdict}
                      />

                      <p className={cn('mt-4 text-xs leading-relaxed', style.text)}>
                        {fairness.messageAr}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-black/10 pt-3">
                        <div>
                          <p className={cn('text-[11px] font-semibold opacity-80', style.text)}>
                            الفرق عن السعر المتوقع
                          </p>
                          <p className={cn('text-sm font-bold tabular-nums', style.text)}>
                            {fairness.difference >= 0 ? '+' : ''}
                            {formatMoneyShort(fairness.difference, market.currency)}
                          </p>
                        </div>
                        <div>
                          <p className={cn('text-[11px] font-semibold opacity-80', style.text)}>
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
                  <motion.button
                    whileTap={TAP}
                    onClick={handleSaveOffer}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white transition-colors',
                      savedFlash ? 'bg-emerald-600' : 'bg-gray-900 active:bg-gray-700'
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={savedFlash ? 'saved' : 'idle'}
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="flex items-center gap-1.5"
                      >
                        {savedFlash ? (
                          <>
                            <BadgeCheck className="h-4 w-4" /> انحفظ
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" /> احفظ
                          </>
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ===== Advanced assumptions ===== */}
        <motion.section variants={cardIn} className="card">
          <Disclosure title="إعدادات متقدمة">
            <div className="space-y-5">
              <Field
                label="مصنعية مخصصة لكل جرام"
                hint="لو البائع قال لك المصنعية بالضبط، اكتبها هنا وتجاهل التقديرات. صفر = رجوع للتقدير التلقائي."
              >
                <NumberInput
                  value={rateCard.makingChargeOverride ?? 0}
                  onChange={(v) =>
                    updateRateCard({
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
          </Disclosure>
        </motion.section>
      </motion.div>

      {/* ===== Sticky answer ===== */}
      <AnimatePresence>
        {breakdown && market && !resultVisible && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-gray-500">
                  {rateCard.includeVat ? 'السعر العادل بالضريبة' : 'السعر العادل بدون ضريبة'}
                </p>
                <AnimatedNumber
                  value={total}
                  format={(v) => formatMoney(v, market.currency)}
                  className="block text-lg font-extrabold leading-tight text-gray-900"
                />
              </div>
              <div className="shrink-0 text-end">
                <p className="text-[10px] font-bold text-orange-600">لو بعتها اليوم</p>
                <AnimatedNumber
                  value={breakdown.instantResale}
                  format={(v) => formatMoneyShort(v, market.currency)}
                  className="block text-sm font-bold text-orange-800"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
