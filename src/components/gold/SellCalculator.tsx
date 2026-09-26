'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Info, TrendingDown, TrendingUp } from 'lucide-react'
import { computeSell } from '@/lib/gold/calculator'
import { KARATS } from '@/lib/gold/constants'
import { formatMoney, formatMoneyShort, formatPercent } from '@/lib/gold/format'
import { getRateCard, saveRateCard } from '@/lib/gold/storage'
import type { Karat, RateCard } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import { BreakdownRow, Field, NumberInput, Segmented } from './Controls'
import LivePriceBar from './LivePriceBar'
import { cardIn, stagger } from './motion'
import { useGoldMarket } from './useGoldMarket'

/** Weights people actually bring in to sell. */
const WEIGHT_PRESETS = [5, 10, 15, 20, 30, 50]

export default function SellCalculator() {
  const marketState = useGoldMarket()
  const { market } = marketState

  const [karat, setKarat] = useState<Karat>(21)
  const [weightGrams, setWeightGrams] = useState(10)
  const [originalPrice, setOriginalPrice] = useState(0)
  const [rateCard, setRateCard] = useState<RateCard>(getRateCard)

  useEffect(() => {
    setRateCard(getRateCard())
  }, [])

  const updateRateCard = (patch: Partial<RateCard>) => {
    setRateCard((prev) => {
      const next = { ...prev, ...patch }
      saveRateCard(next)
      return next
    })
  }

  const result = useMemo(
    () =>
      market
        ? computeSell(
            {
              karat,
              weightGrams,
              originalPurchasePrice: originalPrice > 0 ? originalPrice : null,
            },
            market,
            rateCard
          )
        : null,
    [karat, weightGrams, originalPrice, market, rateCard]
  )

  return (
    <motion.div variants={stagger()} initial="hidden" animate="show" className="space-y-4">
      <LivePriceBar state={marketState} karat={karat} />

      <motion.section variants={cardIn} className="card space-y-5">
        <Field
          label="عيار الذهب اللي تبي تبيعه"
          hint="الرقم مدموغ داخل القطعة: 875 يعني عيار 21، و750 يعني عيار 18."
        >
          <Segmented
            options={KARATS.map((k) => ({
              value: k.karat,
              label: `عيار ${k.karat}`,
              sublabel: String(k.stamp),
            }))}
            value={karat}
            onChange={(k) => setKarat(k as Karat)}
          />
        </Field>

        <Field
          label="الوزن بالجرام"
          hint="وزن الذهب فقط. الفصوص والأحجار تُخصم من الوزن عند البيع ولا يُدفع لك مقابلها."
        >
          <NumberInput
            value={weightGrams}
            onChange={setWeightGrams}
            step={0.5}
            min={0}
            max={10000}
            suffix="جم"
            presets={WEIGHT_PRESETS}
          />
        </Field>

        <Field
          label="كم اشتريتها؟ (اختياري)"
          hint="اكتب المبلغ اللي دفعته وقت الشراء عشان نحسب لك ربحك أو خسارتك الفعلية."
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
          hint="المحلات تشتري بخصم 0.5%–2% عادةً. لو المحل عرض عليك أقل، عدّل النسبة وشوف الفرق."
        >
          <NumberInput
            value={Math.round(rateCard.buybackFactor * 1000) / 10}
            onChange={(v) => updateRateCard({ buybackFactor: Math.min(100, Math.max(0, v)) / 100 })}
            step={0.5}
            min={0}
            max={100}
            suffix="%"
          />
        </Field>
      </motion.section>

      {result && market && (
        <>
          <motion.section
            variants={cardIn}
            className="overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white shadow-lg shadow-emerald-600/25"
          >
            <p className="text-xs font-semibold text-emerald-100">المتوقع أن تستلمه</p>
            <AnimatedNumber
              value={result.estimatedPayout}
              format={(v) => formatMoneyShort(v, market.currency)}
              countOnMount
              className="mt-1 block text-[2.1rem] font-extrabold leading-tight"
            />

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3">
              <div>
                <p className="text-[11px] text-emerald-100">أفضل حالة (محل منافس)</p>
                <AnimatedNumber
                  value={result.bestCasePayout}
                  format={(v) => formatMoneyShort(v, market.currency)}
                  className="block text-sm font-bold"
                />
              </div>
              <div>
                <p className="text-[11px] text-emerald-100">أسوأ حالة (بيع كـ&quot;كسر&quot;)</p>
                <AnimatedNumber
                  value={result.worstCasePayout}
                  format={(v) => formatMoneyShort(v, market.currency)}
                  className="block text-sm font-bold"
                />
              </div>
            </div>
          </motion.section>

          <motion.section variants={cardIn} className="card">
            <h2 className="text-base font-bold text-gray-900">تفصيل البيع</h2>
            <div className="mt-2 divide-y divide-gray-100">
              <BreakdownRow
                label="قيمة الذهب بسعر السوق"
                hint={`${formatMoney(result.pricePerGramKarat, market.currency)} للجرام عيار ${karat}`}
                value={
                  <AnimatedNumber
                    value={result.marketValue}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
              />
              <BreakdownRow
                label="خصم المحل"
                hint={`${formatPercent(result.deductionPercent)} من قيمة المعدن`}
                value={
                  <AnimatedNumber
                    value={result.deduction}
                    format={(v) => `− ${formatMoney(v, market.currency)}`}
                  />
                }
                emphasis="muted"
              />
              <BreakdownRow
                label="صافي ما تستلمه"
                value={
                  <AnimatedNumber
                    value={result.estimatedPayout}
                    format={(v) => formatMoney(v, market.currency)}
                  />
                }
                emphasis="total"
              />
            </div>

            <AnimatePresence>
              {result.profitLoss !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  className={cn(
                    'mt-4 rounded-xl border p-4',
                    result.profitLoss >= 0
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  )}
                >
                  <p
                    className={cn(
                      'flex items-center gap-2 text-sm font-bold',
                      result.profitLoss >= 0 ? 'text-emerald-900' : 'text-red-900'
                    )}
                  >
                    <motion.span
                      initial={{ scale: 0, rotate: -25 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    >
                      {result.profitLoss >= 0 ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                    </motion.span>
                    {result.profitLoss >= 0 ? 'ربح' : 'خسارة'}{' '}
                    <AnimatedNumber
                      value={Math.abs(result.profitLoss)}
                      format={(v) => formatMoneyShort(v, market.currency)}
                    />
                    {result.profitLossPercent !== null && (
                      <span className="text-xs font-bold">
                        ({formatPercent(Math.abs(result.profitLossPercent), 1)})
                      </span>
                    )}
                  </p>
                  <p
                    className={cn(
                      'mt-2 text-[11px] leading-relaxed',
                      result.profitLoss >= 0 ? 'text-emerald-800' : 'text-red-800'
                    )}
                  >
                    {result.profitLoss >= 0
                      ? 'ارتفاع سعر الذهب غطّى المصنعية والضريبة اللي دفعتها وقت الشراء.'
                      : 'الفرق غالباً مصنعية وضريبة دفعتها وقت الشراء ولا تُسترجع عند البيع.'}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.section>
        </>
      )}

      <motion.section variants={cardIn} className="card">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Info className="h-4 w-4 text-amber-600" />
          قبل ما تبيع
        </h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-gray-600">
          {[
            'دوّر على أكثر من محل — الفرق بين محل ومحل يوصل لمئات الريالات على نفس القطعة.',
            'المحل اللي اشتريت منه غالباً يعطيك أفضل سعر، خصوصاً لو معك الفاتورة الأصلية.',
            'اطلب وزن القطعة أمامك، وتأكد إن الميزان صفر قبل ما يحطها.',
            'المصنعية اللي دفعتها وقت الشراء ما تُسترجع — المحل يشتري بالوزن والعيار فقط.',
            'ضريبة القيمة المضافة اللي دفعتها لا تُسترد لك كمستهلك.',
            'لا تبيع وقت هبوط حاد في السعر إلا إذا كنت مضطر — الذهب يتذبذب كثير.',
          ].map((tip, i) => (
            <motion.li
              key={tip}
              initial={{ x: 10 }}
              whileInView={{ x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
              className="flex gap-2"
            >
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
              <span>{tip}</span>
            </motion.li>
          ))}
        </ul>
      </motion.section>
    </motion.div>
  )
}
