'use client'

import { motion, useReducedMotion } from 'motion/react'
import { Flag } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Journey, StationId } from '@/lib/engine/journey'
import { Sheet, cx } from './ui'

const LABEL: Record<StationId, { ar: string; en: string }> = {
  ef: { ar: 'الطوارئ', en: 'Safety' }, g25: { ar: 'الربع', en: '25%' }, g50: { ar: 'النصف', en: 'Half' }, g75: { ar: 'ثلاثة أرباع', en: '75%' }, g100: { ar: 'الهدف', en: 'Goal' },
}

/** The app's signature: the route from the emergency fund to the goal, with the stations along it. */
export function JourneyLine({ journey, draw = false }: { journey: Journey; draw?: boolean }) {
  const { L, settings } = useStore()
  const reduce = useReducedMotion()
  const rtl = settings.locale === 'ar'
  const pos = Math.max(0, Math.min(100, journey.position))
  const from = draw && !reduce ? 0 : pos / 100
  return (
    <div className="relative h-14" role="img" aria-label={L(`موقعك على الطريق: ${pos.toFixed(0)}%`, `Your place on the route: ${pos.toFixed(0)}%`)}>
      <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-track" />
      <motion.div className="absolute inset-x-0 top-3 h-1 rounded-full bg-accent" style={{ transformOrigin: rtl ? 'right' : 'left' }}
        initial={{ scaleX: from }} animate={{ scaleX: pos / 100 }} transition={{ duration: draw ? 1.1 : 0.5, ease: [0.22, 1, 0.36, 1] }} />
      {journey.stations.map((s) => {
        const last = s.at >= 99.5
        return (
          <div key={s.id} className={cx('absolute top-0 flex flex-col', last ? 'items-end' : 'items-center')} style={last ? { insetInlineEnd: 0 } : { insetInlineStart: `${s.at}%`, transform: `translateX(${rtl ? 50 : -50}%)` }}>
            <span className={cx('mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2', s.reached ? 'border-accent bg-accent text-white' : 'border-line bg-card text-ink-faint')}>
              {s.id === 'g100' && <Flag className="h-3 w-3" aria-hidden />}
            </span>
            <span className={cx('mt-2 whitespace-nowrap text-xs', s.reached ? 'font-medium text-ink' : 'text-ink-soft')}>{L(LABEL[s.id].ar, LABEL[s.id].en)}</span>
          </div>
        )
      })}
    </div>
  )
}

const TITLE: Record<string, { ar: string; en: string; bodyAr: string; bodyEn: string }> = {
  ef: { ar: 'اكتمل صندوق الطوارئ', en: 'Your emergency fund is complete', bodyAr: 'من الآن كل مساهمة تذهب للاستثمار وتقرّبك من هدفك.', bodyEn: 'From here every contribution goes to investing and moves you toward your goal.' },
  g25: { ar: 'قطعت ربع الطريق إلى هدفك', en: 'A quarter of the way to your goal', bodyAr: 'الربع الأول هو الأبطأ. ما بعده يساعدك فيه نمو ما جمعته.', bodyEn: 'The first quarter is the slowest. After it, growth on what you have built helps.' },
  g50: { ar: 'وصلت منتصف الطريق', en: 'You are halfway there', bodyAr: 'نصف هدفك صار عندك.', bodyEn: 'Half of your goal is yours.' },
  g75: { ar: 'ثلاثة أرباع الطريق', en: 'Three quarters of the way', bodyAr: 'بقي الربع الأخير. راجع خطة الدخل لتجهّز ما بعد الهدف.', bodyEn: 'One quarter left. Look at the income plan to prepare for what comes after.' },
  g100: { ar: 'بلغت هدفك', en: 'You reached your goal', bodyAr: 'حوّل المحفظة إلى دخل منتظم من محطة الدخل في الخطة.', bodyEn: 'Turn the portfolio into regular income from the income station in the plan.' },
}

/** Shown once, the first time a station is reached. */
export function MilestoneSheet({ id, journey, onClose }: { id: string | null; journey: Journey; onClose: () => void }) {
  const { L } = useStore()
  const t = id ? TITLE[id] : null
  return (
    <Sheet open={!!t} onClose={onClose} title={L('محطة جديدة', 'A new station')} footer={<button className="btn-primary w-full" onClick={onClose}>{L('متابعة', 'Continue')}</button>}>
      {t && (
        <div className="space-y-5 py-2">
          <JourneyLine journey={journey} draw />
          <div>
            <p className="text-xl font-semibold leading-snug">{L(t.ar, t.en)}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{L(t.bodyAr, t.bodyEn)}</p>
          </div>
        </div>
      )}
    </Sheet>
  )
}
