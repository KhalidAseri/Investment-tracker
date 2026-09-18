'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Crown, Scale, Trash2 } from 'lucide-react'
import { reverseEngineerQuote } from '@/lib/gold/calculator'
import { getCurrency } from '@/lib/gold/constants'
import { formatGrams, formatMoney, formatMoneyShort } from '@/lib/gold/format'
import { getOrigin, getPieceType } from '@/lib/gold/rate-card'
import { clearOffers, deleteOffer, getOffers } from '@/lib/gold/storage'
import type { MarketSnapshot, SavedOffer } from '@/lib/gold/types'
import { cn } from '@/lib/utils'

/**
 * Side-by-side view of the quotes the user captured while shopping.
 *
 * Totals alone can't be compared — two quotes are usually for different weights,
 * and the spot price moves between shop visits. So every offer is reduced to the
 * one figure that *is* comparable: the making charge per gram implied by that
 * quote, measured against the spot price at the moment it was captured.
 */
export default function OfferComparison() {
  const [offers, setOffers] = useState<SavedOffer[]>([])

  useEffect(() => {
    setOffers(getOffers())
  }, [])

  const handleDelete = useCallback((id: string) => {
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

        const reversed = reverseEngineerQuote(offer.quotedTotal, true, offer.input, market)
        return { offer, currency, ...reversed }
      })
      .sort((a, b) => a.makingPerGram - b.makingPerGram)
  }, [offers])

  const best = rows[0]

  if (offers.length === 0) {
    return (
      <div className="card text-center">
        <Scale className="mx-auto h-10 w-10 text-gray-300" />
        <h2 className="mt-3 text-base font-bold text-gray-900">ما فيه عروض محفوظة</h2>
        <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-gray-500">
          لما تكون في السوق وتسأل محل عن السعر، ارجع لصفحة الشراء، اكتب السعر اللي عرضه واسم المحل
          واضغط &quot;احفظ&quot;. بعدها قارن كل العروض هنا وتعرف أي محل فعلاً أرخص.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card bg-amber-50/50">
        <p className="text-xs leading-relaxed text-gray-600">
          المقارنة بالمصنعية للجرام، لأن السعر الإجمالي وحده ما ينفع للمقارنة: الأوزان تختلف وسعر
          الذهب نفسه يتغير بين زيارة وزيارة. الأقل مصنعية هو الأرخص فعلياً.
        </p>
      </div>

      {rows.map(({ offer, currency, makingPerGram, goldValue, makingTotal }) => {
        const isBest = offer.id === best?.offer.id && rows.length > 1
        const piece = getPieceType(offer.input.pieceType)
        const origin = getOrigin(offer.input.origin)

        return (
          <div
            key={offer.id}
            className={cn(
              'card relative',
              isBest && 'ring-2 ring-green-500 ring-offset-2'
            )}
          >
            {isBest && (
              <span className="absolute -top-2.5 start-4 inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-0.5 text-[10px] font-bold text-white">
                <Crown className="h-3 w-3" />
                الأفضل
              </span>
            )}

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-gray-900">{offer.shopName}</h3>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {piece.labelAr} · {origin.labelAr} · عيار {offer.input.karat} ·{' '}
                  {formatGrams(offer.input.weightGrams * offer.input.quantity)}
                </p>
              </div>
              <button
                onClick={() => handleDelete(offer.id)}
                aria-label="حذف العرض"
                className="shrink-0 rounded-lg p-1.5 text-gray-400 active:bg-gray-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3">
              <div>
                <p className="text-[10px] font-medium text-gray-500">المصنعية/جم</p>
                <p
                  className={cn(
                    'text-sm font-extrabold tabular-nums',
                    isBest ? 'text-green-700' : 'text-gray-900'
                  )}
                >
                  {formatMoney(makingPerGram, currency, { decimals: 0 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500">قيمة الذهب</p>
                <p className="text-sm font-bold tabular-nums text-gray-700">
                  {formatMoneyShort(goldValue, currency)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-gray-500">السعر المعروض</p>
                <p className="text-sm font-bold tabular-nums text-gray-900">
                  {formatMoneyShort(offer.quotedTotal, currency)}
                </p>
              </div>
            </div>

            {makingTotal < 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-red-700">
                السعر المعروض أقل من قيمة الذهب نفسه وقت الحفظ. راجع الوزن والعيار — أو تأكد إن
                القطعة مدموغة فعلاً بهذا العيار.
              </p>
            )}
          </div>
        )
      })}

      <button
        onClick={() => {
          clearOffers()
          setOffers([])
        }}
        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 active:bg-gray-50"
      >
        حذف كل العروض
      </button>
    </div>
  )
}
