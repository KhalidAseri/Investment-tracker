'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BadgeCheck, Info, MapPin, Store, TrendingDown, TrendingUp } from 'lucide-react'
import { analyzeQuote, buyRange, sarToDisplay, sellRange } from '@/lib/gold/calculator'
import { KARATS } from '@/lib/gold/constants'
import { formatGrams, formatMoney, formatPercent } from '@/lib/gold/format'
import {
  DEFAULT_RATE_CARD,
  getBullionFeePercent,
  getMakingChargeSarPerGram,
  getOrigin,
  getPieceType,
  ORIGINS,
  PIECE_TYPES,
} from '@/lib/gold/rate-card'
import { getPrefs, saveOffer, savePrefs } from '@/lib/gold/storage'
import { successFeedback } from '@/lib/haptics'
import type { BuyInput, Karat, OriginId, PieceType, PieceTypeId } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import {
  Field,
  KaratGrid,
  MoneyInput,
  PieceGrid,
  SegmentSwitch,
  Select,
  ToggleChip,
} from './Controls'
import GoldCard from './GoldCard'
import MoneyRange from './MoneyRange'
import { SPRING, TAP } from './motion'
import TopBar from './TopBar'
import Verdict from './Verdict'
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

/**
 * Every assumption the calculator used to let the user override — a custom
 * making charge, an extra shop margin, the buy-back percentage — has gone from
 * the screen. Each was a question most people could not answer, and a wrong
 * answer silently skewed every number. The market's usual values are used
 * instead, and where the market genuinely varies the screen shows a range.
 *
 * The stored rate card is deliberately ignored for the same reason: someone who
 * set 99% buy-back on an older version would otherwise carry an invisible
 * setting they can no longer see or change.
 */
const RATE_CARD = DEFAULT_RATE_CARD

type Mode = 'buy' | 'sell'

/**
 * Whether an element is on screen, following the element as it comes and goes.
 *
 * framer-motion's `useInView` attaches its observer once, when the component
 * mounts. The headline figure doesn't exist then — the card is still a loading
 * skeleton — so the observer never attached, `inView` stayed false, and the
 * top bar sat on screen over a perfectly visible headline. Taking the element
 * itself (via a callback ref) means the observer attaches when it appears.
 *
 * Reports "on screen" while there is nothing to watch, so the bar can't flash
 * up during loading.
 */
function useOnScreen(el: Element | null): boolean {
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    if (!el) {
      setOnScreen(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return onScreen
}

/**
 * The calculator: a per-gram dashboard, then the piece.
 *
 * The screen is split along the line the numbers actually divide on. What a
 * gram costs depends only on karat, piece type and origin, so those sit with
 * the dashboard. Weight and the shop's price belong to one particular piece,
 * so they sit together below, next to the verdict they produce.
 */
export default function Calculator() {
  const marketState = useGoldMarket()
  const { market } = marketState

  const [mode, setMode] = useState<Mode>('buy')
  const [input, setInput] = useState<BuyInput>(DEFAULT_INPUT)
  const [quoted, setQuoted] = useState(0)
  const [quotedIncludesVat, setQuotedIncludesVat] = useState(true)
  const [originalPrice, setOriginalPrice] = useState(0)
  const [shopName, setShopName] = useState('')
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    const prefs = getPrefs()
    // Quantity is no longer offered, so an old saved value must not linger.
    if (prefs.lastBuyInput) setInput({ ...DEFAULT_INPUT, ...prefs.lastBuyInput, quantity: 1 })
  }, [])

  const update = (patch: Partial<BuyInput>) => {
    setInput((prev) => {
      const next = { ...prev, ...patch, quantity: 1 }
      savePrefs({ lastBuyInput: next })
      return next
    })
  }

  const piece = getPieceType(input.pieceType)
  const origin = getOrigin(input.origin)

  const buy = useMemo(() => (market ? buyRange(input, market, RATE_CARD) : null), [input, market])
  const sell = useMemo(
    () =>
      market
        ? sellRange(
            {
              karat: input.karat,
              weightGrams: input.weightGrams,
              originalPurchasePrice: originalPrice > 0 ? originalPrice : null,
            },
            market
          )
        : null,
    [input.karat, input.weightGrams, originalPrice, market]
  )
  const fairness = useMemo(
    () =>
      market && quoted > 0 && input.weightGrams > 0
        ? analyzeQuote(input, market, RATE_CARD, quoted, quotedIncludesVat)
        : null,
    [input, market, quoted, quotedIncludesVat]
  )

  /** Making charge per gram for a piece, in the display currency, for the grid. */
  const pieceCostLabel = (p: PieceType) => {
    if (!market) return '—'
    if (p.bullion) {
      return `+${formatPercent(getBullionFeePercent(input.weightGrams || 1, 'typical') * 100, 1)}`
    }
    const perGram = sarToDisplay(
      getMakingChargeSarPerGram(p.id, input.origin, input.karat, 'typical'),
      market
    )
    return `${formatMoney(perGram, market.currency, { decimals: 0, withSymbol: false })}/جم`
  }

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
    setTimeout(() => setSavedFlash(false), 2400)
  }

  // The slim top bar takes over the moment the headline per-gram figure has
  // scrolled out of sight — not when the whole card has, by which point the
  // user would have been editing blind for half a screen.
  const [heroEl, setHeroEl] = useState<HTMLElement | null>(null)
  const heroInView = useOnScreen(heroEl)

  const cur = market?.currency
  const grams = input.weightGrams

  return (
    <div className="space-y-4">
      {market && cur && (
        <TopBar
          show={!heroInView}
          tone={mode === 'buy' ? 'gold' : 'green'}
          label={
            mode === 'buy'
              ? `الجرام عيار ${input.karat} · ${piece.shortLabelAr ?? piece.labelAr}`
              : `المحل يشتري جرام عيار ${input.karat}`
          }
          value={
            mode === 'buy' && buy ? (
              <AnimatedNumber value={buy.perGram.typical} format={(v) => formatMoney(v, cur)} />
            ) : sell ? (
              <MoneyRange low={sell.perGram.low} high={sell.perGram.high} currency={cur} />
            ) : null
          }
        />
      )}

      <SegmentSwitch
        options={[
          { value: 'buy', label: 'أشتري', icon: Store },
          { value: 'sell', label: 'أبيع', icon: TrendingDown },
        ]}
        value={mode}
        onChange={setMode}
      />

      {/* `grid-cols-1` and `min-w-0` are load-bearing: a grid track left to
          size itself takes the width of its widest child. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
        <div className="min-w-0 space-y-4 lg:sticky lg:top-6">
          <GoldCard
            state={marketState}
            mode={mode}
            karat={input.karat}
            context={
              piece.bullion ? piece.labelAr : `${piece.shortLabelAr ?? piece.labelAr} · ${origin.labelAr}`
            }
            buy={buy}
            sell={sell}
            heroRef={setHeroEl}
          />

          {/* What sets the per-gram price. Kept beside the dashboard so the
              cause and its effect are on screen together. */}
          <section className="card space-y-5">
            <Field label="العيار" hint={KARATS.find((k) => k.karat === input.karat)?.noteAr}>
              <KaratGrid value={input.karat} onChange={(karat: Karat) => update({ karat })} />
            </Field>

            <AnimatePresence initial={false}>
              {mode === 'buy' && (
                <motion.div
                  key="buy-controls"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING}
                  className="space-y-5 overflow-hidden"
                >
                  <Field label="نوع القطعة" hint={piece.noteAr}>
                    <PieceGrid
                      pieces={PIECE_TYPES}
                      value={input.pieceType}
                      onChange={(pieceType: PieceTypeId) => update({ pieceType })}
                      costLabel={pieceCostLabel}
                    />
                  </Field>

                  {/* Bars and coins are priced on metal alone, so where they
                      were made doesn't change anything — no point asking. */}
                  {!piece.bullion && (
                    <Field label="الدقة / المنشأ" hint={origin.noteAr}>
                      <Select
                        label="الدقة / المنشأ"
                        options={ORIGINS.map((o) => ({ value: o.id, label: o.labelAr }))}
                        value={input.origin}
                        onChange={(originId) => update({ origin: originId as OriginId })}
                      />
                    </Field>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* ===== The piece in your hand ===== */}
        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'buy' ? (
              <motion.section
                key="buy-piece"
                initial={{ x: 16 }}
                animate={{ x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={SPRING}
                className="card space-y-5"
              >
                <h2 className="text-base font-extrabold text-gray-900">قطعتك</h2>

                <Field label="الوزن">
                  <WeightPicker value={grams} onChange={(weightGrams) => update({ weightGrams })} />
                </Field>

                {buy && cur && grams > 0 && (
                  <div className="rounded-2xl bg-amber-50/70 p-4">
                    <p className="text-[11px] font-bold text-amber-800">
                      السعر العادل لقطعتك ({formatGrams(grams)})
                    </p>
                    <bdi className="mt-1 block text-[1.75rem] font-extrabold leading-tight text-gray-900">
                      <AnimatedNumber
                        value={buy.typical.totalWithVat}
                        format={(v) => formatMoney(v, cur, { decimals: 0 })}
                      />
                    </bdi>
                    <p className="mt-1 text-[11px] font-semibold text-gray-500">
                      عادةً بين{' '}
                      <MoneyRange
                        low={buy.low.totalWithVat}
                        high={buy.high.totalWithVat}
                        currency={cur}
                        className="font-bold text-gray-700"
                      />{' '}
                      شامل الضريبة
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-3 border-t border-amber-200/70 pt-3">
                      <div>
                        <p className="text-[10px] font-bold text-gray-500">لو بعتها اليوم</p>
                        <MoneyRange
                          low={buy.resalePerGram.low * grams}
                          high={buy.resalePerGram.high * grams}
                          currency={cur}
                          className="text-sm font-extrabold text-emerald-700"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-gray-500">تخسر فوراً تقريباً</p>
                        <bdi className="block text-sm font-extrabold text-orange-700">
                          <AnimatedNumber
                            value={Math.max(
                              0,
                              buy.typical.totalWithVat - buy.resalePerGram.typical * grams
                            )}
                            format={(v) => formatMoney(v, cur, { decimals: 0 })}
                          />
                        </bdi>
                      </div>
                    </div>
                  </div>
                )}

                <Field
                  label="كم طلب المحل؟"
                  aside={
                    <ToggleChip
                      checked={quotedIncludesVat}
                      onChange={setQuotedIncludesVat}
                      label="شامل الضريبة"
                    />
                  }
                  hint={
                    fairness
                      ? undefined
                      : 'اكتب السعر اللي قاله البائع ونقول لك تشتري أو تفاوض.'
                  }
                >
                  <MoneyInput
                    value={quoted}
                    onChange={setQuoted}
                    unit={cur?.symbolAr}
                    label="السعر اللي طلبه المحل"
                  />
                </Field>

                <AnimatePresence>
                  {fairness && cur && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      className="space-y-3"
                    >
                      <div className="overflow-hidden rounded-2xl">
                        <Verdict fairness={fairness} currency={cur} />
                      </div>

                      <p className="flex gap-2 text-[11px] leading-relaxed text-gray-500">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
                        <span>
                          المصنعية اللي يحاسبك عليها فعلياً:{' '}
                          <bdi className="font-bold text-gray-800">
                            {formatMoney(fairness.impliedMakingPerGram, cur, { decimals: 0 })}
                          </bdi>{' '}
                          للجرام.
                        </span>
                      </p>

                      <div className="flex gap-2">
                        <input
                          value={shopName}
                          onChange={(e) => setShopName(e.target.value)}
                          placeholder="اسم المحل"
                          aria-label="اسم المحل"
                          className="h-12 min-w-0 flex-1 rounded-xl border-gray-200 text-sm shadow-sm focus:border-amber-500 focus:ring-amber-500"
                        />
                        <motion.button
                          whileTap={TAP}
                          onClick={handleSaveOffer}
                          className={cn(
                            'inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-white transition-colors',
                            savedFlash ? 'bg-emerald-600' : 'bg-gray-900 active:bg-gray-700'
                          )}
                        >
                          <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                              key={savedFlash ? 'saved' : 'idle'}
                              initial={{ y: 8, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -8, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="flex items-center gap-1.5"
                            >
                              {savedFlash ? (
                                <>
                                  <BadgeCheck className="h-4 w-4" /> انضاف
                                </>
                              ) : (
                                <>
                                  <MapPin className="h-4 w-4" /> أضف للجولة
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
            ) : (
              <motion.section
                key="sell-piece"
                initial={{ x: -16 }}
                animate={{ x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={SPRING}
                className="card space-y-5"
              >
                <h2 className="text-base font-extrabold text-gray-900">قطعتك</h2>

                <Field
                  label="الوزن"
                  hint="الفصوص والأحجار تُخصم من الوزن عند البيع ولا يُدفع لك مقابلها."
                >
                  <WeightPicker value={grams} onChange={(weightGrams) => update({ weightGrams })} />
                </Field>

                {sell && cur && grams > 0 && (
                  <div className="rounded-2xl bg-emerald-50/80 p-4">
                    <p className="text-[11px] font-bold text-emerald-800">
                      تستلم لقطعتك ({formatGrams(grams)})
                    </p>
                    <p className="mt-1">
                      <MoneyRange
                        low={sell.total.low}
                        high={sell.total.high}
                        currency={cur}
                        className="text-[1.75rem] font-extrabold leading-tight text-gray-900"
                      />
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-gray-500">
                      بسعر السوق كاملاً كانت تساوي{' '}
                      <bdi>{formatMoney(sell.metalPerGram * grams, cur, { decimals: 0 })}</bdi>
                    </p>
                  </div>
                )}

                <Field
                  label="كم اشتريتها؟"
                  hint="اختياري — نحسب لك ربحك أو خسارتك."
                >
                  <MoneyInput
                    value={originalPrice}
                    onChange={setOriginalPrice}
                    unit={cur?.symbolAr}
                    label="سعر الشراء الأصلي"
                  />
                </Field>

                <AnimatePresence>
                  {sell?.profitLoss && cur && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                      className={cn(
                        'rounded-2xl p-4 text-white',
                        sell.profitLoss.typical >= 0 ? 'bg-emerald-600' : 'bg-red-600'
                      )}
                    >
                      <p className="flex items-center gap-2 text-lg font-extrabold">
                        <motion.span
                          initial={{ scale: 0, rotate: -25 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                        >
                          {sell.profitLoss.typical >= 0 ? (
                            <TrendingUp className="h-5 w-5" />
                          ) : (
                            <TrendingDown className="h-5 w-5" />
                          )}
                        </motion.span>
                        {sell.profitLoss.typical >= 0 ? 'ربح تقريباً' : 'خسارة تقريباً'}{' '}
                        <bdi>
                          <AnimatedNumber
                            value={Math.abs(sell.profitLoss.typical)}
                            format={(v) => formatMoney(v, cur, { decimals: 0 })}
                          />
                        </bdi>
                      </p>
                      <p className="mt-1 text-[11px] leading-relaxed text-white/85">
                        {sell.profitLoss.typical >= 0
                          ? 'ارتفاع سعر الذهب غطّى المصنعية والضريبة اللي دفعتها وقت الشراء.'
                          : 'الفرق غالباً مصنعية وضريبة دفعتها وقت الشراء ولا تُسترجع عند البيع.'}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
