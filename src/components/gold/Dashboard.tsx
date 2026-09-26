'use client'

import { formatMoney, formatMoneyShort, formatPercent } from '@/lib/gold/format'
import type {
  BuyBreakdown,
  CurrencyInfo,
  FairnessCheck,
  Karat,
  SellBreakdown,
} from '@/lib/gold/types'
import AnimatedNumber from './AnimatedNumber'
import CostBar, { COST_COLORS } from './CostBar'
import { BreakdownRow, Disclosure, ToggleChip } from './Controls'
import StatTile from './StatTile'
import Verdict from './Verdict'

/**
 * The dashboard: everything the calculation produced, above the form that
 * produced it.
 *
 * One hero figure leads — the fair price, or what you'd be paid if selling —
 * and the supporting numbers sit under it as tiles rather than as a table,
 * because each is a single current value and a value is its own best form.
 * The arithmetic that justifies them is still a tap away, but it no longer
 * competes with the answer for the top of the screen.
 */

export function BuyDashboard({
  breakdown,
  fairness,
  currency,
  karat,
  weightLabel,
  totalGrams,
  includeVat,
  onIncludeVatChange,
  bullion,
}: {
  breakdown: BuyBreakdown
  fairness: FairnessCheck | null
  currency: CurrencyInfo
  karat: Karat
  weightLabel: string
  /** Total grams across all pieces, for the per-gram cost. */
  totalGrams: number
  includeVat: boolean
  onIncludeVatChange: (value: boolean) => void
  bullion: boolean
}) {
  const total = includeVat ? breakdown.totalWithVat : breakdown.totalWithoutVat
  const paidPerGram = totalGrams > 0 ? total / totalGrams : 0

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-500">
                {includeVat ? 'السعر العادل شامل الضريبة' : 'السعر العادل بدون ضريبة'}
              </p>
              {/* The one hero figure on this view. */}
              <bdi className="mt-1 block text-[2.4rem] font-extrabold leading-none text-gray-900 sm:text-[3rem]">
                <AnimatedNumber value={total} format={(v) => formatMoney(v, currency)} />
              </bdi>
              <p className="mt-1.5 text-xs text-gray-500">
                {weightLabel} · عيار {karat}
              </p>
            </div>
            <ToggleChip checked={includeVat} onChange={onIncludeVatChange} label="بالضريبة" />
          </div>
        </div>

        {fairness && <Verdict fairness={fairness} currency={currency} />}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        {/* Not the metal price — the live bar above already shows that. This is
            what a gram actually costs you once workmanship and tax are in,
            which is the comparison nobody makes for you. */}
        <StatTile
          label="تدفع فعلياً للجرام"
          tone="gold"
          value={<AnimatedNumber value={paidPerGram} format={(v) => formatMoney(v, currency)} />}
          note={`قيمة المعدن ${formatMoney(breakdown.pricePerGramKarat, currency)}`}
        />
        <StatTile
          label={bullion ? 'علاوة السبيكة' : 'المصنعية للجرام'}
          value={
            <AnimatedNumber
              value={breakdown.makingPerGram}
              format={(v) => formatMoney(v, currency)}
            />
          }
          note={`${formatPercent(breakdown.premiumShare * 100, 0)} من السعر`}
        />
        <StatTile
          label="لو بعتها اليوم"
          value={
            <AnimatedNumber
              value={breakdown.instantResale}
              format={(v) => formatMoneyShort(v, currency)}
            />
          }
          note="ما يدفعه المحل بسعر المعدن"
        />
        <StatTile
          label="الخسارة الفورية"
          tone="warning"
          value={
            <AnimatedNumber
              value={breakdown.instantLoss}
              format={(v) => formatMoneyShort(v, currency)}
            />
          }
          note={`${formatPercent(breakdown.instantLossPercent, 0)} من اللي دفعته`}
        />
      </div>

      <div className="card">
        <p className="text-sm font-bold text-gray-900">وين راحت فلوسك</p>
        <CostBar
          className="mt-3"
          currency={currency}
          slices={[
            { key: 'gold', label: 'ذهب', amount: breakdown.goldValue, ...COST_COLORS.gold },
            {
              key: 'making',
              label: 'مصنعية',
              amount: breakdown.makingTotal + breakdown.shopMargin,
              ...COST_COLORS.making,
            },
            ...(includeVat
              ? [{ key: 'vat', label: 'ضريبة', amount: breakdown.vat, ...COST_COLORS.vat }]
              : []),
          ]}
        />

        <div className="mt-4 border-t border-gray-100 pt-3">
          <Disclosure title="تفصيل السعر">
            <div className="divide-y divide-gray-100">
              <BreakdownRow
                label={`قيمة الذهب (${weightLabel})`}
                hint={`${formatMoney(breakdown.pricePerGramKarat, currency)} للجرام`}
                value={
                  <AnimatedNumber
                    value={breakdown.goldValue}
                    format={(v) => formatMoney(v, currency)}
                  />
                }
              />
              <BreakdownRow
                label="المصنعية"
                hint={
                  bullion
                    ? 'نسبة السبيكة/العملة فوق سعر المعدن'
                    : `${formatMoney(breakdown.makingPerGram, currency)} للجرام`
                }
                value={
                  <AnimatedNumber
                    value={breakdown.makingTotal}
                    format={(v) => formatMoney(v, currency)}
                  />
                }
              />
              {breakdown.shopMargin > 0 && (
                <BreakdownRow
                  label="ربح المحل المضاف"
                  value={formatMoney(breakdown.shopMargin, currency)}
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
                  <AnimatedNumber value={breakdown.vat} format={(v) => formatMoney(v, currency)} />
                }
                emphasis="muted"
              />
              <BreakdownRow
                label={includeVat ? 'الإجمالي شامل الضريبة' : 'الإجمالي بدون ضريبة'}
                value={<AnimatedNumber value={total} format={(v) => formatMoney(v, currency)} />}
                emphasis="total"
              />
            </div>
          </Disclosure>
        </div>
      </div>
    </div>
  )
}

export function SellDashboard({
  sale,
  currency,
  karat,
  weightLabel,
}: {
  sale: SellBreakdown
  currency: CurrencyInfo
  karat: Karat
  weightLabel: string
}) {
  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="p-5">
          <p className="text-xs font-bold text-gray-500">المتوقع أن تستلمه</p>
          <bdi className="mt-1 block text-[2.4rem] font-extrabold leading-none text-gray-900 sm:text-[3rem]">
            <AnimatedNumber
              value={sale.estimatedPayout}
              format={(v) => formatMoney(v, currency)}
            />
          </bdi>
          <p className="mt-1.5 text-xs text-gray-500">
            {weightLabel} · عيار {karat}
          </p>
        </div>

        {sale.profitLoss !== null && (
          <div
            className={
              sale.profitLoss >= 0
                ? 'bg-emerald-600 p-4 text-white'
                : 'bg-red-600 p-4 text-white'
            }
          >
            <p className="text-lg font-extrabold leading-tight">
              {sale.profitLoss >= 0 ? 'ربحت' : 'خسرت'}{' '}
              <bdi>
                <AnimatedNumber
                  value={Math.abs(sale.profitLoss)}
                  format={(v) => formatMoneyShort(v, currency)}
                />
              </bdi>
              {sale.profitLossPercent !== null && (
                <span className="text-sm font-bold">
                  {' '}
                  ({formatPercent(Math.abs(sale.profitLossPercent), 1)})
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/85">
              {sale.profitLoss >= 0
                ? 'ارتفاع سعر الذهب غطّى المصنعية والضريبة اللي دفعتها وقت الشراء.'
                : 'الفرق غالباً مصنعية وضريبة دفعتها وقت الشراء ولا تُسترجع عند البيع.'}
            </p>
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label="سعر الجرام"
          tone="gold"
          value={
            <AnimatedNumber
              value={sale.pricePerGramKarat}
              format={(v) => formatMoney(v, currency)}
            />
          }
          note={`عيار ${karat} بسعر السوق`}
        />
        <StatTile
          label="خصم المحل"
          tone="warning"
          value={
            <AnimatedNumber value={sale.deduction} format={(v) => formatMoneyShort(v, currency)} />
          }
          note={`${formatPercent(sale.deductionPercent)} من قيمة المعدن`}
        />
        <StatTile
          label="أفضل حالة"
          value={
            <AnimatedNumber
              value={sale.bestCasePayout}
              format={(v) => formatMoneyShort(v, currency)}
            />
          }
          note="محل منافس يشتري بخصم بسيط"
        />
        <StatTile
          label="أسوأ حالة"
          value={
            <AnimatedNumber
              value={sale.worstCasePayout}
              format={(v) => formatMoneyShort(v, currency)}
            />
          }
          note="لو اشتروها منك كـ«كسر»"
        />
      </div>

      <div className="card">
        <Disclosure title="تفصيل البيع">
          <div className="divide-y divide-gray-100">
            <BreakdownRow
              label="قيمة الذهب بسعر السوق"
              hint={`${formatMoney(sale.pricePerGramKarat, currency)} للجرام عيار ${karat}`}
              value={
                <AnimatedNumber
                  value={sale.marketValue}
                  format={(v) => formatMoney(v, currency)}
                />
              }
            />
            <BreakdownRow
              label="خصم المحل"
              hint={`${formatPercent(sale.deductionPercent)} من قيمة المعدن`}
              value={
                <AnimatedNumber
                  value={sale.deduction}
                  format={(v) => `− ${formatMoney(v, currency)}`}
                />
              }
              emphasis="muted"
            />
            <BreakdownRow
              label="صافي ما تستلمه"
              value={
                <AnimatedNumber
                  value={sale.estimatedPayout}
                  format={(v) => formatMoney(v, currency)}
                />
              }
              emphasis="total"
            />
          </div>
        </Disclosure>
      </div>
    </div>
  )
}
