'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  Crosshair,
  Info,
  MoveHorizontal,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WifiOff,
} from 'lucide-react'
import { CURRENCIES, GRAMS_PER_TROY_OUNCE, getPurity } from '@/lib/gold/constants'
import { backtest, forecast, windowStats, type Direction } from '@/lib/gold/forecast'
import { formatAgeAr, formatMoney } from '@/lib/gold/format'
import { DAY_MS } from '@/lib/gold/history'
import { tapFeedback } from '@/lib/haptics'
import { getPrefs } from '@/lib/gold/storage'
import type { CurrencyCode, Karat } from '@/lib/gold/types'
import { cn } from '@/lib/utils'
import AnimatedNumber from './AnimatedNumber'
import { SegmentSwitch } from './Controls'
import MoneyRange from './MoneyRange'
import PriceChart, { formatDateAr, type ChartPoint, type ConePoint } from './PriceChart'
import { SPRING, TAP } from './motion'
import { useGoldMarket } from './useGoldMarket'
import { usePriceHistory } from './usePriceHistory'

/**
 * The market screen: where the gram has been over the year, and where it is
 * likely to be in a month.
 *
 * Every figure is per gram, in the chosen karat and currency, because that is
 * how the rest of the app — and every shop counter — prices gold. The history
 * is fetched in USD per ounce and converted at today's exchange rate, which is
 * exact for the Gulf's pegged currencies.
 *
 * The forecast leads with a range, not a direction, because that is the part
 * that holds up: the screen replays the method over the past year and states
 * how often each part of it was right.
 */

const KARAT_OPTIONS: { value: `${Karat}`; label: string }[] = [
  { value: '24', label: 'عيار 24' },
  { value: '22', label: 'عيار 22' },
  { value: '21', label: 'عيار 21' },
  { value: '18', label: 'عيار 18' },
]

const RANGE_OPTIONS = [
  { value: '30', label: 'شهر', phrase: 'خلال شهر' },
  { value: '90', label: '3 شهور', phrase: 'خلال 3 شهور' },
  { value: '182', label: '6 شهور', phrase: 'خلال 6 شهور' },
  { value: '365', label: 'سنة', phrase: 'خلال سنة' },
] as const
type RangeValue = (typeof RANGE_OPTIONS)[number]['value']

const DIRECTION: Record<
  Direction,
  { label: string; icon: typeof TrendingUp; chip: string; takeaway: string }
> = {
  up: {
    label: 'ميل للصعود',
    icon: TrendingUp,
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    takeaway:
      'الميل للصعود ضعيف، لكن لو ناوي تشتري قريب فالتأجيل على أمل نزول ما هو في صالحك غالبًا.',
  },
  down: {
    label: 'ميل للنزول',
    icon: TrendingDown,
    chip: 'bg-red-50 text-red-800 ring-red-200',
    takeaway:
      'الميل للنزول ضعيف: لو مو مستعجل ممكن تنتظر، بس لا تبني قرارك عليه — السعر ممكن يمشي عكسه.',
  },
  flat: {
    label: 'ما فيه اتجاه واضح',
    icon: MoveHorizontal,
    chip: 'bg-gray-100 text-gray-800 ring-gray-200',
    takeaway:
      'الكفّتين متقاربة: لو تحتاج تشتري، لا تأجل على أمل نزول، ولو تبيع لا تنتظر على أمل صعود.',
  },
}

const pct = (v: number, digits = 1) => `${Math.abs(v * 100).toFixed(digits)}%`

export default function Market() {
  const marketState = useGoldMarket()
  const { market, currency, setCurrency } = marketState
  const { history, loading, failed, refresh } = usePriceHistory()

  const [karat, setKarat] = useState<Karat>(21)
  const [range, setRange] = useState<RangeValue>('365')
  useEffect(() => {
    const saved = getPrefs().lastBuyInput?.karat
    if (saved && KARAT_OPTIONS.some((o) => o.value === String(saved))) setKarat(saved)
  }, [])

  const points = history?.points ?? null
  const rangeDays = Number(range)

  const fc = useMemo(() => (points ? forecast(points) : null), [points])
  const bt = useMemo(() => (points ? backtest(points) : null), [points])

  // USD/oz → a gram of this karat in the display currency. The history source
  // and the live price differ by a fraction of a percent (PAXG trades at a
  // small premium), so the series is scaled to end exactly on the live price
  // the rest of the app shows — unless the gap is too big to be that.
  const toGram = useMemo(() => {
    if (!market || !points?.length) return null
    const lastUsd = points[points.length - 1].usd
    const ratio = market.spot.usdPerOunce / lastUsd
    const calibrate = market.spot.source !== 'manual' && Math.abs(ratio - 1) < 0.03 ? ratio : 1
    const factor = (calibrate * market.fx.perUsd * getPurity(karat)) / GRAMS_PER_TROY_OUNCE
    return (usd: number) => usd * factor
  }, [market, points, karat])

  const chart = useMemo(() => {
    if (!points || !toGram) return null
    const from = points[points.length - 1].t - rangeDays * DAY_MS
    const visible: ChartPoint[] = points
      .filter((p) => p.t >= from)
      .map((p) => ({ t: p.t, v: toGram(p.usd) }))
    const cone: ConePoint[] | null = fc
      ? fc.path.map((c) => ({
          t: c.t,
          median: toGram(c.median),
          lo80: toGram(c.lo80),
          hi80: toGram(c.hi80),
          lo50: toGram(c.lo50),
          hi50: toGram(c.hi50),
        }))
      : null
    return { visible, cone }
  }, [points, toGram, fc, rangeDays])

  const stats = useMemo(
    () => (points ? windowStats(points, rangeDays) : null),
    [points, rangeDays]
  )
  const yearStats = useMemo(() => (points ? windowStats(points, 365) : null), [points])

  const cur = market?.currency

  // ---- No data at all ----
  if (failed && !history) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-red-900">تعذّر جلب تاريخ السعر</p>
            <p className="mt-1 text-xs leading-relaxed text-red-700">
              تأكد من الإنترنت وحاول مرة ثانية. أول ما ينجح، يتحفظ على جوالك ويشتغل بدون نت.
            </p>
            <motion.button
              whileTap={TAP}
              onClick={refresh}
              className="mt-3 h-10 rounded-xl bg-red-600 px-4 text-xs font-bold text-white"
            >
              إعادة المحاولة
            </motion.button>
          </div>
        </div>
      </section>
    )
  }

  if (!chart || !cur || !stats || !toGram) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-11 animate-pulse rounded-2xl bg-gray-200/70" />
        <div className="animate-pulse space-y-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100">
          <div className="h-3 w-32 rounded bg-gray-200" />
          <div className="h-10 w-44 rounded-lg bg-gray-200" />
          <div className="h-[232px] rounded-2xl bg-gray-100" />
        </div>
        <div className="h-64 animate-pulse rounded-3xl bg-white shadow-sm ring-1 ring-gray-100" />
      </div>
    )
  }

  const today = chart.visible[chart.visible.length - 1].v
  const up = stats.change >= 0
  const phrase = RANGE_OPTIONS.find((o) => o.value === range)!.phrase
  const fromPeak = yearStats ? toGram(yearStats.last.usd) / toGram(yearStats.high.usd) - 1 : 0
  const dir = fc ? DIRECTION[fc.direction] : null
  const cone = chart.cone

  return (
    <div className="space-y-4">
      <SegmentSwitch
        options={KARAT_OPTIONS}
        value={String(karat) as `${Karat}`}
        onChange={(v) => setKarat(Number(v) as Karat)}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ---- History ---- */}
        <motion.section
          initial={{ y: 10 }}
          animate={{ y: 0 }}
          transition={SPRING}
          className="min-w-0 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-gray-100"
        >
          <div className="flex items-start justify-between gap-3 px-1">
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-500">جرام عيار {karat} اليوم</p>
              <bdi className="mt-1 block text-[2.1rem] font-extrabold leading-none text-gray-900">
                <AnimatedNumber value={today} format={(v) => formatMoney(v, cur)} />
              </bdi>
              <motion.p
                key={`${range}-${karat}`}
                initial={{ y: 4 }}
                animate={{ y: 0 }}
                className={cn(
                  'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1',
                  up
                    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                    : 'bg-red-50 text-red-800 ring-red-200'
                )}
              >
                {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {up ? 'ارتفع' : 'نزل'} <bdi dir="ltr">{pct(stats.change)}</bdi> {phrase}
              </motion.p>
            </div>

            <div className="relative shrink-0">
              <select
                value={currency}
                onChange={(e) => {
                  tapFeedback('light')
                  setCurrency(e.target.value as CurrencyCode)
                }}
                aria-label="العملة"
                className="h-9 appearance-none rounded-lg border-0 bg-gray-100 bg-none py-0 pe-7 ps-3 text-xs font-extrabold text-gray-800 focus:ring-2 focus:ring-amber-400"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbolAr}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute inset-y-0 end-2 my-auto h-3.5 w-3.5 text-gray-500" />
            </div>
          </div>

          <div className="mt-3">
            <SegmentSwitch
              options={RANGE_OPTIONS.map(({ value, label }) => ({ value, label }))}
              value={range}
              onChange={setRange}
            />
          </div>

          <div className="mt-3">
            <PriceChart
              history={chart.visible}
              cone={cone}
              currency={cur}
              rangeDays={rangeDays}
            />
          </div>
          <p className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-400">
            <Crosshair className="h-3 w-3" />
            اسحب إصبعك على الرسم لتشوف سعر أي يوم
          </p>

          <dl className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: `أعلى ${phrase}`, value: toGram(stats.high.usd), sub: formatDateAr(stats.high.t, false) },
              { label: `أقل ${phrase}`, value: toGram(stats.low.usd), sub: formatDateAr(stats.low.t, false) },
            ].map((s) => (
              <div key={s.label} className="min-w-0 rounded-2xl bg-gray-50 px-2.5 py-2">
                <dt className="truncate text-[10px] font-bold text-gray-500">{s.label}</dt>
                <dd className="mt-0.5 text-sm font-extrabold text-gray-900">
                  <bdi>{formatMoney(s.value, cur, { decimals: s.value >= 100 ? 0 : 1 })}</bdi>
                </dd>
                <dd className="text-[10px] font-semibold text-gray-400">{s.sub}</dd>
              </div>
            ))}
            <div className="min-w-0 rounded-2xl bg-gray-50 px-2.5 py-2">
              <dt className="truncate text-[10px] font-bold text-gray-500">تحت قمة السنة</dt>
              <dd className="mt-0.5 text-sm font-extrabold text-gray-900">
                {fromPeak > -0.0005 ? 'عند القمة' : <bdi dir="ltr">−{pct(fromPeak)}</bdi>}
              </dd>
              {yearStats && (
                <dd className="text-[10px] font-semibold text-gray-400">
                  القمة {formatDateAr(yearStats.high.t, false)}
                </dd>
              )}
            </div>
          </dl>
        </motion.section>

        {/* ---- Forecast ---- */}
        {fc && dir && cone && (
          <motion.section
            initial={{ y: 14 }}
            animate={{ y: 0 }}
            transition={{ ...SPRING, delay: 0.06 }}
            className="min-w-0 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-gray-100"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-gray-900">بعد شهر من اليوم</h2>
                <p className="text-[11px] font-semibold text-gray-500">
                  إلى {formatDateAr(fc.end.t)}
                </p>
              </div>
              <motion.span
                key={fc.direction}
                initial={{ scale: 0.6, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 480, damping: 18 }}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1',
                  dir.chip
                )}
              >
                <dir.icon className="h-4 w-4" />
                {dir.label}
              </motion.span>
            </div>

            <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-xs font-bold text-amber-900">جرام عيار {karat} غالبًا بين</p>
              <p className="mt-1">
                <MoneyRange
                  low={cone[cone.length - 1].lo80}
                  high={cone[cone.length - 1].hi80}
                  currency={cur}
                  className="text-[1.75rem] font-extrabold leading-tight text-gray-900"
                />
              </p>
              <p className="mt-1 text-[11px] font-semibold text-amber-900/80">
                بنسبة 80% — يعني 8 من كل 10 مرات يقع السعر داخله
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-amber-200/70 pt-3 text-xs">
                <span className="font-bold text-amber-900">التقدير الأوسط</span>
                <bdi className="text-base font-extrabold text-gray-900">
                  <AnimatedNumber
                    value={cone[cone.length - 1].median}
                    format={(v) => formatMoney(v, cur, { decimals: today >= 100 ? 0 : cur.decimals })}
                  />
                </bdi>
              </div>
            </div>

            {/* Up vs down, as two halves of one bar. */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-extrabold">
                <span className="flex items-center gap-1 text-emerald-800">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  أعلى من اليوم <bdi dir="ltr">{Math.round(fc.pUp * 100)}%</bdi>
                </span>
                <span className="flex items-center gap-1 text-red-800">
                  أقل من اليوم <bdi dir="ltr">{100 - Math.round(fc.pUp * 100)}%</bdi>
                  <ArrowDownRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                <motion.div
                  className="h-full rounded-s-full bg-emerald-500"
                  initial={{ width: '50%' }}
                  animate={{ width: `${fc.pUp * 100}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 18, delay: 0.3 }}
                />
                <div className="h-full flex-1 rounded-e-full bg-red-500" />
              </div>
            </div>

            {/* Why. */}
            <h3 className="mt-5 text-xs font-extrabold text-gray-900">على وش مبني؟</h3>
            <ul className="mt-2 divide-y divide-gray-100 text-xs">
              {[
                fc.signals.change30 !== null && {
                  label: 'آخر 30 يوم',
                  word: fc.signals.change30 >= 0 ? 'ارتفع' : 'نزل',
                  figure: pct(fc.signals.change30),
                  sign: Math.sign(fc.signals.change30),
                },
                fc.signals.vsSma50 !== null && {
                  label: 'مقارنة بمتوسط 50 يوم',
                  word: fc.signals.vsSma50 >= 0 ? 'أعلى بـ' : 'أقل بـ',
                  figure: pct(fc.signals.vsSma50),
                  sign: Math.sign(fc.signals.vsSma50),
                },
                {
                  label: 'اتجاه آخر شهرين',
                  word: fc.signals.trendPerMonth >= 0 ? 'صاعد' : 'نازل',
                  figure: `${pct(fc.signals.trendPerMonth)} بالشهر`,
                  sign: Math.sign(fc.signals.trendPerMonth),
                },
                {
                  label: 'الحركة المعتادة في شهر',
                  word: 'تقريبًا',
                  figure: `±${pct(fc.signals.monthlyVol)}`,
                  sign: 0,
                },
              ]
                .filter(Boolean)
                .map((row) => {
                  const r = row as { label: string; word: string; figure: string; sign: number }
                  // The figure is its own isolate: "5.6%" dropped into Arabic
                  // text otherwise comes out as "%5.6".
                  const [num, ...rest] = r.figure.split(' ')
                  return (
                    <li key={r.label} className="flex items-center justify-between gap-3 py-2">
                      <span className="font-semibold text-gray-600">{r.label}</span>
                      <span className="flex items-center gap-1 font-extrabold text-gray-900">
                        {r.sign > 0 && <ArrowUpRight className="h-3.5 w-3.5 text-emerald-600" />}
                        {r.sign < 0 && <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />}
                        <span>
                          {r.word} <bdi dir="ltr">{num}</bdi>
                          {rest.length > 0 && ` ${rest.join(' ')}`}
                        </span>
                      </span>
                    </li>
                  )
                })}
            </ul>

            {/* How good is it — measured, not claimed. */}
            {bt && (
              <div className="mt-4 rounded-2xl bg-gray-50 p-4">
                <p className="text-xs font-extrabold text-gray-900">
                  جرّبنا نفس الطريقة على السنة اللي فاتت
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-gray-100">
                    <p className="text-[10px] font-bold text-gray-500">النطاق صاب</p>
                    <p className="text-xl font-extrabold text-gray-900">
                      <bdi dir="ltr">{Math.round(bt.coverage80 * 100)}%</bdi>
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-gray-100">
                    <p className="text-[10px] font-bold text-gray-500">الاتجاه صاب</p>
                    <p className="text-xl font-extrabold text-gray-900">
                      {bt.directionHitRate === null ? (
                        '—'
                      ) : (
                        <bdi dir="ltr">{Math.round(bt.directionHitRate * 100)}%</bdi>
                      )}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-600">
                  من {bt.samples} توقع سابق. النطاق يُعتمد عليه، أما الاتجاه فقريب من رمي عملة — عشان
                  كذا نعطيك نطاق مو رقم واحد.
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2 rounded-2xl bg-sky-50 p-3 text-[11px] leading-relaxed text-sky-900 ring-1 ring-sky-100">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <p>
                <span className="font-extrabold">وش يعني لك؟ </span>
                {dir.takeaway}
              </p>
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
              تقدير إحصائي من حركة السعر نفسه، ما يعرف عن الأخبار والقرارات القادمة — مو نصيحة
              استثمارية.
            </p>
          </motion.section>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-1 text-[10px] font-semibold text-gray-400">
        <span className="min-w-0 truncate">
          المصدر: {history!.sourceLabelAr} · {formatAgeAr(history!.fetchedAt)}
          {history!.isStale && ' (نسخة محفوظة)'}
          {!cur.pegged && ' · بسعر صرف اليوم'}
        </span>
        <motion.button
          whileTap={TAP}
          onClick={() => {
            tapFeedback('medium')
            refresh()
          }}
          disabled={loading}
          aria-label="تحديث البيانات"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-gray-500 ring-1 ring-gray-200 disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </motion.button>
      </div>
    </div>
  )
}
