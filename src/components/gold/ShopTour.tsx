'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { Crown, MapPin, Plus, Trash2 } from 'lucide-react'
import { reverseEngineerQuote } from '@/lib/gold/calculator'
import { getCurrency } from '@/lib/gold/constants'
import { formatGrams, formatMoney, formatMoneyShort } from '@/lib/gold/format'
import { getOrigin, getPieceType } from '@/lib/gold/rate-card'
import { clearOffers, deleteOffer, getOffers } from '@/lib/gold/storage'
import { tapFeedback } from '@/lib/haptics'
import type { MarketSnapshot, SavedOffer } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import PieceIcon from './PieceIcon'
import { SPRING, TAP } from './motion'

/**
 * The shops you have walked into, ranked.
 *
 * This used to be a passive list called "comparison". It is now framed as a
 * trip, because that is what it is: you are moving between shops asking about
 * the same piece, and what you need at each stop is to know whether this one
 * beats the last. The heading counts your stops, the leader wears the crown,
 * and the figure across the top is the only one that decides anything — what
 * walking to one more shop is worth, per gram.
 *
 * Totals can't be compared directly: the weights differ and gold itself moves
 * between visits. So each quote is reduced to the making charge per gram it
 * implies, measured against the spot price at the moment it was captured.
 */
export default function ShopTour() {
  const [offers, setOffers] = useState<SavedOffer[]>([])

  useEffect(() => {
    setOffers(getOffers())
  }, [])

  const handleDelete = useCallback((id: string) => {
    tapFeedback('medium')
    deleteOffer(id)
    setOffers(getOffers())
  }, [])

  const rows = useMemo(() => {
    return offers
      .map((offer) => {
        const currency = getCurrency(offer.currency)
        // Rebuild the market as it stood when this quote was taken, so a shop
        // isn't punished for being visited on a day gold happened to be high.
        const market: MarketSnapshot = {
          spot: {
            usdPerOunce: offer.spotUsdPerOunce,
            source: 'saved',
            sourceLabelAr: 'محفوظ',
            fetchedAt: offer.createdAt,
            isStale: false,
          },
          fx: { perUsd: currency.pegPerUsd, source: 'peg', fetchedAt: offer.createdAt, isStale: false },
          currency,
        }
        return { offer, currency, ...reverseEngineerQuote(offer.quotedTotal, true, offer.input, market) }
      })
      .sort((a, b) => a.makingPerGram - b.makingPerGram)
  }, [offers])

  // A negative implied making charge means the quote is below the raw metal
  // value — the weight, karat or price was mistyped. Crowning such an offer
  // would have the app recommend the very row it warns is impossible, so only
  // plausible offers can win, and the spread is measured across those alone.
  const plausible = rows.filter((row) => row.makingPerGram >= 0)
  const best = plausible[0]
  const worst = plausible[plausible.length - 1]
  const spread = plausible.length > 1 && best && worst ? worst.makingPerGram - best.makingPerGram : 0

  if (offers.length === 0) {
    return (
      <motion.div
        initial={{ scale: 0.97 }}
        animate={{ scale: 1 }}
        transition={SPRING}
        className="card text-center"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1.5 }}
          className="mx-auto w-fit"
        >
          <MapPin className="h-12 w-12 text-gray-300" />
        </motion.div>
        <h2 className="mt-3 text-base font-bold text-gray-900">جولتك ما بدأت</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-gray-500">
          كل ما تسأل محل عن سعر، ارجع للحاسبة واكتب السعر اللي قاله واسم المحل واضغط «أضف للجولة».
          بعدها نرتّب لك المحلات من الأرخص مصنعيةً للأغلى.
        </p>
        <motion.div whileTap={TAP} className="mt-5 inline-block">
          <Link
            href="/"
            onClick={() => tapFeedback('light')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white active:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            ابدأ من الحاسبة
          </Link>
        </motion.div>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      <motion.div
        initial={{ y: 10 }}
        animate={{ y: 0 }}
        transition={SPRING}
        className="overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-5 text-white"
      >
        <p className="text-xs font-semibold text-gray-300">
          زرت{' '}
          <bdi className="font-extrabold text-white">{offers.length}</bdi>{' '}
          {offers.length === 2 ? 'محلين' : offers.length <= 10 ? 'محلات' : 'محل'}
        </p>
        {spread > 0 && best ? (
          <>
            <p className="mt-1 text-xs text-gray-300">الفرق بين أرخصهم وأغلاهم</p>
            <bdi className="mt-0.5 block text-[2rem] font-extrabold leading-tight tabular-nums">
              <AnimatedNumber
                value={spread}
                format={(v) => formatMoney(v, best.currency, { decimals: 0 })}
              />
            </bdi>
            <p className="mt-1 text-xs font-semibold text-amber-300">على كل جرام تشتريه</p>
          </>
        ) : (
          <p className="mt-2 text-xs leading-relaxed text-gray-300">
            أضف محلاً ثانياً عشان نوريك كم يفرق سعر المصنعية بينهم.
          </p>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {rows.map(({ offer, currency, makingPerGram, goldValue }, rank) => {
          const isBest = offer.id === best?.offer.id && plausible.length > 1
          const piece = getPieceType(offer.input.pieceType)
          const origin = getOrigin(offer.input.origin)

          return (
            <motion.div
              key={offer.id}
              layout
              initial={{ y: 12 }}
              animate={{ y: 0 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              transition={SPRING}
              className={cn('card relative', isBest && 'ring-2 ring-emerald-500 ring-offset-2')}
            >
              {isBest && (
                <motion.span
                  initial={{ scale: 0, y: 6 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white"
                >
                  <Crown className="h-3 w-3" />
                  الأرخص
                </motion.span>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold',
                      isBest ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    )}
                  >
                    {rank + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-bold text-gray-900">{offer.shopName}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-500">
                      <PieceIcon piece={offer.input.pieceType} className="h-3.5 w-3.5 shrink-0" />
                      {piece.labelAr} · {origin.labelAr} · عيار {offer.input.karat} ·{' '}
                      {formatGrams(offer.input.weightGrams * offer.input.quantity)}
                    </p>
                  </div>
                </div>
                <motion.button
                  whileTap={TAP}
                  onClick={() => handleDelete(offer.id)}
                  aria-label="حذف المحل من الجولة"
                  className="shrink-0 rounded-lg p-1.5 text-gray-400 active:bg-gray-100"
                >
                  <Trash2 className="h-4 w-4" />
                </motion.button>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-500">المصنعية/جم</p>
                  <bdi
                    className={cn(
                      'block text-sm font-extrabold tabular-nums',
                      makingPerGram < 0
                        ? 'text-red-700'
                        : isBest
                          ? 'text-emerald-700'
                          : 'text-gray-900'
                    )}
                  >
                    <AnimatedNumber
                      value={makingPerGram}
                      format={(v) => formatMoney(v, currency, { decimals: 0 })}
                    />
                  </bdi>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-500">قيمة الذهب</p>
                  <bdi className="block text-sm font-bold tabular-nums text-gray-700">
                    {formatMoneyShort(goldValue, currency)}
                  </bdi>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-500">السعر المعروض</p>
                  <bdi className="block text-sm font-bold tabular-nums text-gray-900">
                    {formatMoneyShort(offer.quotedTotal, currency)}
                  </bdi>
                </div>
              </div>

              {makingPerGram < 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-red-700">
                  السعر المعروض أقل من قيمة الذهب نفسه وقت الحفظ. راجع الوزن والعيار — أو تأكد إن
                  القطعة مدموغة فعلاً بهذا العيار.
                </p>
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>

      <div className="flex gap-2 pt-1">
        <motion.div whileTap={TAP} className="flex-1">
          <Link
            href="/"
            onClick={() => tapFeedback('light')}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white active:bg-amber-700"
          >
            <Plus className="h-4 w-4" />
            أضف محلاً
          </Link>
        </motion.div>
        <motion.button
          whileTap={TAP}
          onClick={() => {
            tapFeedback('heavy')
            clearOffers()
            setOffers([])
          }}
          className="rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 active:bg-gray-50"
        >
          أنهِ الجولة
        </motion.button>
      </div>
    </div>
  )
}
