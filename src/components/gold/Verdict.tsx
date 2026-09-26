'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Handshake, ShieldCheck, Sparkles, TrendingDown } from 'lucide-react'
import { formatMoneyShort } from '@/lib/gold/format'
import type { CurrencyInfo, FairnessCheck, FairnessVerdict } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import FairnessMeter from './FairnessMeter'

/**
 * The judgement on the seller's price, as a band under the headline figure.
 *
 * The breakdown already says what the piece is worth. What it never said is
 * what to *do*, and that is the only thing a person holding a bracelet at a
 * counter actually needs. So this answers in a verb — buy it, haggle, walk —
 * and puts the price to negotiate towards right beside it.
 *
 * These are status colours, so they are never reused for anything else in the
 * app, and each ships with an icon and a word: the state is never carried by
 * hue alone.
 */

const ACTIONS: Record<
  FairnessVerdict,
  { verb: string; line: string; icon: typeof Handshake; panel: string; ink: string }
> = {
  great: {
    verb: 'خذها',
    line: 'أرخص من المتوقع لهذي القطعة',
    icon: Sparkles,
    panel: 'bg-emerald-600',
    ink: 'text-emerald-50',
  },
  fair: {
    verb: 'سعرها عدل',
    line: 'ضمن المعقول — تقدر تشتري بثقة',
    icon: ShieldCheck,
    panel: 'bg-sky-600',
    ink: 'text-sky-50',
  },
  high: {
    verb: 'فاوض',
    line: 'أعلى من المتوقع، وفيه مجال ينزل',
    icon: Handshake,
    panel: 'bg-amber-600',
    ink: 'text-amber-50',
  },
  overpriced: {
    verb: 'فاوض بقوة أو امشِ',
    line: 'الفرق كبير — جرّب محلاً ثانياً قبل ما تدفع',
    icon: TrendingDown,
    panel: 'bg-red-600',
    ink: 'text-red-50',
  },
}

export default function Verdict({
  fairness,
  currency,
}: {
  fairness: FairnessCheck
  currency: CurrencyInfo
}) {
  const action = ACTIONS[fairness.verdict]

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={fairness.verdict}
        initial={{ y: 8 }}
        animate={{ y: 0 }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        className={cn('p-4 text-white', action.panel)}
      >
        {/* Verdict, then where on the scale, then what to ask for. The target
            price used to share the first row with the verdict, and at 360px
            the longest verdict wrapped and its explanation ran into it. */}
        <div className="flex items-center gap-3">
          <motion.span
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.04 }}
            className="shrink-0 rounded-xl bg-black/15 p-2"
          >
            <action.icon className="h-5 w-5" />
          </motion.span>
          <div className="min-w-0">
            <p className="text-lg font-extrabold leading-tight">{action.verb}</p>
            <p className={cn('mt-0.5 text-[11px] font-semibold leading-snug', action.ink)}>
              {action.line}
            </p>
          </div>
        </div>

        <div className="mt-3.5 rounded-xl bg-black/15 p-3">
          <FairnessMeter
            differencePercent={fairness.differencePercent}
            verdict={fairness.verdict}
            tone="onColor"
          />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={cn('text-xs font-bold', action.ink)}>
            {fairness.verdict === 'great' || fairness.verdict === 'fair'
              ? 'السعر العادل'
              : 'اطلب هذا السعر'}
          </span>
          <bdi className="text-xl font-extrabold">
            <AnimatedNumber
              value={fairness.suggestedTarget}
              format={(v) => formatMoneyShort(v, currency)}
            />
          </bdi>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
