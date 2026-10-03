'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, Pencil, RefreshCw, Undo2, WifiOff } from 'lucide-react'
import type { BuyRange, SellRange } from '@/lib/gold/calculator'
import { CURRENCIES } from '@/lib/gold/constants'
import { formatAgeAr, formatMoney, formatPercent } from '@/lib/gold/format'
import { tapFeedback } from '@/lib/haptics'
import type { CurrencyCode, Karat } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import MoneyRange from './MoneyRange'
import { SPRING, SPRING_SOFT, TAP } from './motion'
import type { GoldMarketState } from './useGoldMarket'

/**
 * The dashboard: one card, every figure per gram.
 *
 * This merges what used to be three stacked surfaces — a live-price banner, a
 * headline total and four stat tiles — that repeated each other (the metal
 * price appeared twice) and priced the whole piece, when a buyer comparing
 * shops thinks per gram. Now the card answers one question at a glance: what
 * should a gram of this cost, all in?
 *
 * Under the headline, the gram is taken apart into metal, workmanship and tax,
 * each with its share of the price, and the last line says what a shop would
 * pay you back for that same gram. Nothing on it depends on the weight, which
 * belongs to the piece further down the screen.
 */

/** The validated categorical trio for the gram's composition. */
const PART_COLORS = {
  gold: '#d97706',
  making: '#7c3aed',
  vat: '#0891b2',
} as const


export default function GoldCard({
  state,
  mode,
  karat,
  context,
  buy,
  sell,
  heroRef,
}: {
  state: GoldMarketState
  mode: 'buy' | 'sell'
  karat: Karat
  /** What the price is for, e.g. "سلسال · سعودي". */
  context?: string
  buy: BuyRange | null
  sell: SellRange | null
  /** Receives the headline figure, so the screen can tell when it has scrolled away. */
  heroRef?: (el: HTMLElement | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { market, loading, failed, refreshing, refresh, currency, setCurrency } = state

  const commitManual = () => {
    const parsed = Number(draft.replace(/[^\d.]/g, ''))
    state.setManualSpot(Number.isFinite(parsed) && parsed > 0 ? parsed : null)
    setEditing(false)
  }

  const header = market && (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold backdrop-blur',
          market.spot.isStale ? 'bg-red-950/30 text-red-50' : 'bg-white/15 text-white'
        )}
      >
        {market.spot.isStale ? (
          <AlertTriangle className="h-3 w-3 shrink-0" />
        ) : (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
          </span>
        )}
        <span className="truncate">
          {market.spot.source === 'manual' ? 'سعر يدوي' : 'مباشر'} ·{' '}
          {formatAgeAr(market.spot.fetchedAt)}
        </span>
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {/* The forms plugin paints its own dark chevron into every select,
            which vanished against the gold; it is switched off (bg-none) and
            a white one drawn in its place. */}
        <div className="relative">
          <select
            value={currency}
            onChange={(e) => {
              tapFeedback('light')
              setCurrency(e.target.value as CurrencyCode)
            }}
            aria-label="العملة"
            className="h-9 appearance-none rounded-lg border-0 bg-white/15 bg-none py-0 pe-7 ps-3 text-xs font-extrabold text-white backdrop-blur focus:ring-2 focus:ring-white/40 [&>option]:text-gray-900"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.symbolAr}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute inset-y-0 end-2 my-auto h-3.5 w-3.5 text-white/85" />
        </div>
        <motion.button
          whileTap={TAP}
          onClick={() => {
            tapFeedback('light')
            setDraft(String(Math.round(market.spot.usdPerOunce)))
            setEditing((v) => !v)
          }}
          aria-label="إدخال سعر الأونصة يدوياً"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur active:bg-white/25"
        >
          <Pencil className="h-3.5 w-3.5" />
        </motion.button>
        <motion.button
          whileTap={TAP}
          onClick={() => {
            tapFeedback('medium')
            refresh()
          }}
          disabled={refreshing || loading}
          aria-label="تحديث السعر"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 backdrop-blur active:bg-white/25 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', (refreshing || loading) && 'animate-spin')} />
        </motion.button>
      </div>
    </div>
  )

  const editor = (
    <AnimatePresence initial={false}>
      {editing && market && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={SPRING_SOFT}
          className="overflow-hidden"
        >
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/15 p-2">
            <input
              autoFocus
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="سعر الأونصة بالدولار"
              aria-label="سعر الأونصة بالدولار"
              className="h-9 min-w-0 flex-1 rounded-lg border-0 bg-white/20 px-3 text-sm font-bold text-white placeholder:text-white/60 focus:ring-2 focus:ring-white/40"
            />
            <motion.button
              whileTap={TAP}
              onClick={commitManual}
              className="h-9 rounded-lg bg-white px-3 text-xs font-extrabold text-amber-700"
            >
              حفظ
            </motion.button>
            {market.spot.source === 'manual' && (
              <button
                onClick={() => {
                  state.setManualSpot(null)
                  setEditing(false)
                }}
                className="h-9 px-1.5 text-xs font-bold text-white/85"
              >
                رجوع للمباشر
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[10px] text-white/75">
            الأونصة الآن:{' '}
            <bdi className="font-bold">${market.spot.usdPerOunce.toFixed(2)}</bdi>
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  )

  // ---- States without a price ----
  if (failed && !market) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-900">تعذّر جلب سعر الذهب</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              تأكد من الإنترنت وحاول مرة ثانية، أو أدخل سعر الأونصة بالدولار يدوياً.
            </p>
            <div className="mt-3 flex gap-2">
              <motion.button
                whileTap={TAP}
                onClick={refresh}
                className="h-9 rounded-lg bg-red-600 px-3 text-xs font-bold text-white"
              >
                إعادة المحاولة
              </motion.button>
              <input
                inputMode="decimal"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitManual}
                placeholder="سعر الأونصة $"
                aria-label="سعر الأونصة بالدولار"
                className="h-9 min-w-0 flex-1 rounded-lg border-red-200 text-sm font-bold focus:border-red-400 focus:ring-red-400"
              />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!market || (mode === 'buy' ? !buy : !sell)) {
    return (
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 to-amber-600 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-6 w-40 rounded-full bg-white/30" />
          <div className="h-3 w-48 rounded bg-white/30" />
          <div className="h-11 w-44 rounded-lg bg-white/40" />
          <div className="h-3 w-36 rounded bg-white/30" />
          <div className="h-28 rounded-2xl bg-white/25" />
        </div>
      </section>
    )
  }

  const cur = market.currency

  // ---- Selling: what a shop pays per gram ----
  if (mode === 'sell' && sell) {
    return (
      <motion.section
        key="sell"
        initial={{ y: 10 }}
        animate={{ y: 0 }}
        transition={SPRING}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-700/25"
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="gold-sheen absolute inset-y-0 -inset-x-full" />
        </div>
        <div className="relative">
          {header}
          {editor}

          <p className="mt-5 text-xs font-bold text-emerald-50">
            المحل يشتري منك جرام عيار {karat} بـ
          </p>
          <p ref={heroRef} className="mt-1">
            <MoneyRange
              low={sell.perGram.low}
              high={sell.perGram.high}
              currency={cur}
              className="text-[2.4rem] font-extrabold leading-none"
            />
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-emerald-50">
            حسب المعتاد: المحلات تخصم 0.5% إلى 2% من سعر السوق.
          </p>

          <div className="mt-4 flex items-center justify-between rounded-2xl bg-black/15 px-4 py-3">
            <span className="text-xs font-bold text-emerald-50">سعر السوق للجرام</span>
            <bdi className="text-base font-extrabold">
              <AnimatedNumber value={sell.metalPerGram} format={(v) => formatMoney(v, cur)} />
            </bdi>
          </div>
        </div>
      </motion.section>
    )
  }

  // ---- Buying: what a gram should cost, all in ----
  const b = buy!
  const parts = [
    { key: 'gold', label: `ذهب عيار ${karat}`, value: b.metalPerGram, color: PART_COLORS.gold },
    { key: 'making', label: 'مصنعية', value: b.makingPerGram.typical, color: PART_COLORS.making },
    {
      key: 'vat',
      label: `ضريبة ${formatPercent(b.typical.vatRate * 100, 0)}`,
      value: b.vatPerGram,
      color: PART_COLORS.vat,
    },
  ].filter((p) => p.value > 0)
  const whole = parts.reduce((sum, p) => sum + p.value, 0)

  return (
    <motion.section
      key="buy"
      initial={{ y: 10 }}
      animate={{ y: 0 }}
      transition={SPRING}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-700 p-5 text-white shadow-lg shadow-amber-700/25"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="gold-sheen absolute inset-y-0 -inset-x-full" />
      </div>

      <div className="relative">
        {header}
        {editor}

        <p className="mt-5 text-xs font-bold text-amber-50">
          سعر الجرام العادل{context ? ` · ${context}` : ''}
        </p>
        <bdi
          ref={heroRef}
          className="mt-1 block text-[2.6rem] font-extrabold leading-none"
        >
          <AnimatedNumber value={b.perGram.typical} format={(v) => formatMoney(v, cur)} />
        </bdi>
        <p className="mt-2 text-[11px] font-semibold text-amber-50">
          شامل المصنعية والضريبة · عادةً بين{' '}
          <MoneyRange
            low={b.perGram.low}
            high={b.perGram.high}
            currency={cur}
            withSymbol={false}
            className="font-extrabold text-white"
          />
        </p>

        {/* The gram, taken apart. */}
        <div className="mt-4 rounded-2xl bg-white p-4 text-gray-900 shadow-sm">
          <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            {parts.map((part) => (
              <motion.div
                key={part.key}
                className="h-full"
                style={{ backgroundColor: part.color }}
                initial={false}
                animate={{ width: `${(part.value / whole) * 100}%` }}
                transition={SPRING_SOFT}
              />
            ))}
          </div>

          <div className="mt-3 space-y-2">
            {parts.map((part) => (
              <div key={part.key} className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: part.color }}
                />
                <span className="flex-1 text-xs font-semibold text-gray-600">{part.label}</span>
                <span className="w-9 text-end text-[11px] font-bold tabular-nums text-gray-400">
                  {Math.round((part.value / whole) * 100)}%
                </span>
                <bdi className="w-24 text-end text-sm font-extrabold">
                  <AnimatedNumber value={part.value} format={(v) => formatMoney(v, cur)} />
                </bdi>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2 border-t border-dashed border-gray-200 pt-3">
            <Undo2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <span className="flex-1 text-xs font-semibold text-gray-600">لو بعته للمحل</span>
            <MoneyRange
              low={b.resalePerGram.low}
              high={b.resalePerGram.high}
              currency={cur}
              className="text-sm font-extrabold text-emerald-700"
            />
          </div>
        </div>
      </div>
    </motion.section>
  )
}
