'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Store, TrendingDown } from 'lucide-react'
import { analyzeQuote, computeBuy, computeSell } from '@/lib/gold/calculator'
import { KARATS } from '@/lib/gold/constants'
import { formatGrams, formatMoneyShort } from '@/lib/gold/format'
import { getPieceType, type MakingBand } from '@/lib/gold/rate-card'
import { getPrefs, getRateCard, saveOffer, savePrefs, saveRateCard } from '@/lib/gold/storage'
import { successFeedback, tapFeedback } from '@/lib/haptics'
import type { BuyInput, Karat, RateCard } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import BuyForm from './CalculatorForm'
import { Field, NumberInput, Segmented } from './Controls'
import { BuyDashboard, SellDashboard } from './Dashboard'
import LivePriceBar from './LivePriceBar'
import { SPRING, TAP } from './motion'
import WeightPicker from './WeightPicker'
import { useGoldMarket } from './useGoldMarket'

const DEFAULT_INPUT: BuyInput = {
  karat: 21,
  weightGrams: 10,
  pieceType: 'chain',
  origin: 'saudi',
  quantity: 1,
  quotedTotal: null,
}

type Mode = 'buy' | 'sell'

/**
 * The calculator screen: a dashboard of what the numbers say, over the form
 * that produces them.
 *
 * Buying and selling were separate destinations before. In a shop you are
 * plainly doing one or the other, and the inputs overlap almost entirely, so
 * it is a switch at the top rather than a place you navigate to — and the
 * karat and weight you already entered carry across when you flip it.
 *
 * On a phone the dashboard sits above the form and a slim bar pins the
 * headline figure to the bottom of the screen once you scroll down to edit.
 * Given the room, the two become columns and the dashboard stays put while
 * you work.
 */
export default function Calculator() {
  const marketState = useGoldMarket()
  const { market } = marketState

  const [mode, setMode] = useState<Mode>('buy')
  const [input, setInput] = useState<BuyInput>(DEFAULT_INPUT)
  const [rateCard, setRateCard] = useState<RateCard>(getRateCard)
  const [band, setBand] = useState<MakingBand>('typical')
  const [quoted, setQuoted] = useState(0)
  const [quotedIncludesVat, setQuotedIncludesVat] = useState(true)
  const [originalPrice, setOriginalPrice] = useState(0)
  const [shopName, setShopName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

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

  const breakdown = useMemo(
    () => (market ? computeBuy(input, market, rateCard, band) : null),
    [input, market, rateCard, band]
  )

  const fairness = useMemo(
    () =>
      market && quoted > 0 ? analyzeQuote(input, market, rateCard, quoted, quotedIncludesVat) : null,
    [input, market, rateCard, quoted, quotedIncludesVat]
  )

  const sale = useMemo(
    () =>
      market
        ? computeSell(
            {
              karat: input.karat,
              weightGrams: input.weightGrams,
              originalPurchasePrice: originalPrice > 0 ? originalPrice : null,
            },
            market,
            rateCard
          )
        : null,
    [input.karat, input.weightGrams, originalPrice, market, rateCard]
  )

  const fairTotal = breakdown
    ? rateCard.includeVat
      ? breakdown.totalWithVat
      : breakdown.totalWithoutVat
    : 0

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
    setTimeout(() => setSavedFlash(false), 2600)
  }

  const buyWeightLabel = formatGrams(input.weightGrams * input.quantity)

  return (
    <div className="space-y-4">
      {/* ===== Buying or selling ===== */}
      <div className="flex rounded-2xl bg-gray-200/70 p-1">
        {(
          [
            { value: 'buy', label: 'أشتري', icon: Store },
            { value: 'sell', label: 'أبيع', icon: TrendingDown },
          ] as const
        ).map((opt) => {
          const active = mode === opt.value
          return (
            <motion.button
              key={opt.value}
              whileTap={TAP}
              onClick={() => {
                tapFeedback('medium')
                setMode(opt.value)
              }}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-extrabold touch-manipulation',
                active ? 'text-gray-900' : 'text-gray-500'
              )}
            >
              {active && (
                <motion.span
                  layoutId="mode-pill"
                  transition={SPRING}
                  className="absolute inset-0 rounded-xl bg-white shadow-sm"
                />
              )}
              <opt.icon className="relative h-4 w-4" />
              <span className="relative">{opt.label}</span>
            </motion.button>
          )
        })}
      </div>

      <LivePriceBar state={marketState} karat={input.karat} />

      {/* `grid-cols-1` and `min-w-0` are load-bearing: a grid track left to size
          itself takes the width of its widest child, and the karat strip and
          piece grid are deliberately wider than the screen so they can scroll.
          Without these the whole page grows to ~700px and scrolls sideways. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        {/* ===== Dashboard ===== */}
        <div className="min-w-0 lg:sticky lg:top-4">
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'buy' && breakdown && market ? (
              <motion.div
                key="buy-dash"
                initial={{ x: 14 }}
                animate={{ x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={SPRING}
              >
                <BuyDashboard
                  breakdown={breakdown}
                  fairness={fairness}
                  currency={market.currency}
                  karat={input.karat}
                  weightLabel={buyWeightLabel}
                  totalGrams={input.weightGrams * input.quantity}
                  includeVat={rateCard.includeVat}
                  onIncludeVatChange={(includeVat) => updateRateCard({ includeVat })}
                  bullion={piece.bullion === true}
                />

                {/* Capture the shop while you are still standing in it. */}
                <AnimatePresence>
                  {fairness && (
                    <motion.div
                      initial={{ y: 10 }}
                      animate={{ y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 flex gap-2"
                    >
                      <input
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="اسم المحل"
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
                        {savedFlash ? (
                          <>
                            <BadgeCheck className="h-4 w-4" /> انضاف
                          </>
                        ) : (
                          <>
                            <Store className="h-4 w-4" /> أضف للجولة
                          </>
                        )}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : mode === 'sell' && sale && market ? (
              <motion.div
                key="sell-dash"
                initial={{ x: -14 }}
                animate={{ x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={SPRING}
              >
                <SellDashboard
                  sale={sale}
                  currency={market.currency}
                  karat={input.karat}
                  weightLabel={formatGrams(input.weightGrams)}
                />
              </motion.div>
            ) : (
              <div className="card">
                <div className="animate-pulse space-y-3">
                  <div className="h-3 w-32 rounded bg-gray-200" />
                  <div className="h-10 w-48 rounded bg-gray-200" />
                  <div className="h-3 w-24 rounded bg-gray-200" />
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* ===== Form ===== */}
        <div className="min-w-0">
          {mode === 'buy' ? (
            <BuyForm
              input={input}
              onInput={update}
              band={band}
              onBand={setBand}
              rateCard={rateCard}
              onRateCard={updateRateCard}
              quoted={quoted}
              onQuoted={setQuoted}
              quotedIncludesVat={quotedIncludesVat}
              onQuotedIncludesVat={setQuotedIncludesVat}
              market={market}
            />
          ) : (
            <div className="card space-y-5">
              <Field
                label="عيار الذهب اللي تبيعه"
                hint="الرقم مدموغ داخل القطعة: 875 يعني عيار 21، و750 يعني عيار 18."
              >
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
                label="الوزن"
                hint="الفصوص والأحجار تُخصم من الوزن عند البيع ولا يُدفع لك مقابلها."
              >
                <WeightPicker
                  value={input.weightGrams}
                  onChange={(weightGrams) => update({ weightGrams })}
                />
              </Field>

              <Field
                label="كم اشتريتها؟ (اختياري)"
                hint="اكتب المبلغ اللي دفعته وقت الشراء عشان نحسب ربحك أو خسارتك الفعلية."
              >
                <NumberInput
                  value={originalPrice}
                  onChange={setOriginalPrice}
                  step={100}
                  min={0}
                  suffix={market?.currency.symbolAr}
                  placeholder="0"
                />
              </Field>

              <Field
                label="نسبة ما يدفعه المحل من سعر السوق"
                hint="المحلات تشتري بخصم 0.5%–2% عادةً. لو المحل عرض أقل، عدّل النسبة وشوف الفرق."
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

      {/* ===== The headline, pinned while you edit ===== */}
      {market && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-white/95 px-4 py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          <div
            className="mx-auto flex max-w-2xl items-center justify-between gap-3"
            style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-gray-500">
                {mode === 'buy'
                  ? rateCard.includeVat
                    ? 'السعر العادل بالضريبة'
                    : 'السعر العادل بدون ضريبة'
                  : 'المتوقع أن تستلمه'}
              </p>
              <bdi className="block text-lg font-extrabold leading-tight text-gray-900">
                {formatMoneyShort(
                  mode === 'buy' ? fairTotal : (sale?.estimatedPayout ?? 0),
                  market.currency
                )}
              </bdi>
            </div>
            {mode === 'buy' && breakdown && (
              <div className="shrink-0 text-end">
                <p className="text-[10px] font-bold text-orange-600">لو بعتها اليوم</p>
                <bdi className="block text-sm font-bold text-orange-800">
                  {formatMoneyShort(breakdown.instantResale, market.currency)}
                </bdi>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
