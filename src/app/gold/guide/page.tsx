import type { Metadata } from 'next'
import { AlertTriangle, CheckCircle2, Coins, Gem, Receipt } from 'lucide-react'
import GoldNav from '@/components/gold/GoldNav'
import { KARATS } from '@/lib/gold/constants'
import { ORIGINS, PIECE_TYPES } from '@/lib/gold/rate-card'

export const metadata: Metadata = {
  title: 'حاسبة الذهب | نصائح الشراء',
  description: 'نصائح عملية عشان تحصل على أفضل صفقة ذهب',
}

const TIPS = [
  'قارن المصنعية بالريال للجرام بين المحلات، مو السعر الإجمالي للقطعة — القطع تختلف أوزانها.',
  'اطلب فاتورة تفصّل: وزن الذهب، العيار، سعر الجرام، المصنعية، والضريبة كل واحد على حدة.',
  'تأكد من وجود الدمغة (ختم العيار) داخل القطعة، ولا تشتري ذهب بلا دمغة مصنع أو تاجر معروف.',
  'اطلب وزن القطعة أمامك، وشوف الميزان على صفر قبل ما يحطها.',
  'تجنّب القطع المرصّعة بالفصوص والزركون — وزنها يُحسب عليك وقت الشراء ويُخصم كامل وقت البيع.',
  'القطع الثقيلة البسيطة (الدبل والأساور المصمتة) أفضل للادخار لأن مصنعيتها أقل.',
  'المرتعشة والأطقم والشغل اليدوي المعقد أغلى مصنعية بكثير — اشترها للزينة، لا للادخار.',
  'فاوض على المصنعية تحديداً، خصوصاً في الأوزان الكبيرة (٥٠ جرام فأكثر) وفي المحلات الصغيرة.',
  'المصنعية تضيع غالباً بالكامل عند إعادة البيع — المحل يشتري بسعر المعدن الخام فقط.',
  'لو هدفك الادخار بأقل تكلفة، السبائك والعملات عيار 24 هي الأقل مصنعية على الإطلاق.',
  'تجنّب الشراء في مواسم الأعراس والأعياد، لأن الطلب يرتفع وترتفع معه المصنعية.',
  'اشترِ من محل مرخّص تقدر ترجع له، وبعضهم يعطيك إعادة شراء بخصم أقل لو معك الفاتورة الأصلية.',
]

export default function GoldGuidePage() {
  // Non-bullion pieces, cheapest workmanship first — this ordering is the
  // single most useful thing on the page for a saver.
  const byMakingCharge = PIECE_TYPES.filter((p) => !p.bullion).sort(
    (a, b) => a.baseMakingPerGram.typical - b.baseMakingPerGram.typical
  )

  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">نصائح الشراء</h1>
        <p className="mt-1 text-xs text-gray-500">
          اللي تحتاج تعرفه قبل ما تدفع، عشان تطلع بأفضل صفقة.
        </p>
      </div>
      <GoldNav />

      {/* The single rule that matters most */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-amber-900">
          <Gem className="h-4 w-4" />
          القاعدة الذهبية
        </h2>
        <p className="mt-2 text-xs leading-relaxed text-amber-900">
          سعر الذهب نفسه واحد في كل المحلات — يتحدد من البورصة العالمية ولا أحد يتحكم فيه. الفرق
          الوحيد بين محل ومحل هو <strong className="font-bold">المصنعية</strong>. فلما تقارن، قارن
          المصنعية للجرام فقط، وكل شيء ثاني تفاصيل.
        </p>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          ١٢ نصيحة عملية
        </h2>
        <ol className="mt-3 space-y-3">
          {TIPS.map((tip, i) => (
            <li key={tip} className="flex gap-3 text-xs leading-relaxed text-gray-700">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">
                {i + 1}
              </span>
              <span>{tip}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Piece types ranked by how much of your money is craftsmanship */}
      <div className="card">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Coins className="h-4 w-4 text-amber-600" />
          ترتيب القطع من الأرخص مصنعيةً
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
          الأرقام بالريال للجرام، لقطعة سعودية عيار 21. تقديرية وتتغير حسب المحل والتصميم.
        </p>
        <div className="mt-3 space-y-2">
          {byMakingCharge.map((piece) => (
            <div
              key={piece.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{piece.labelAr}</p>
                <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">{piece.noteAr}</p>
              </div>
              <p className="shrink-0 text-xs font-bold tabular-nums text-gray-700">
                {piece.baseMakingPerGram.low}–{piece.baseMakingPerGram.high} ر.س
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Origin cheat-sheet */}
      <div className="card">
        <h2 className="text-base font-bold text-gray-900">الفرق بين الدقّات</h2>
        <div className="mt-3 space-y-2">
          {ORIGINS.map((origin) => (
            <div key={origin.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900">{origin.labelAr}</p>
                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-gray-600 ring-1 ring-gray-200">
                  ×{origin.makingMultiplier.toFixed(2)} مصنعية
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">{origin.noteAr}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Hallmark reference — useful standing in the shop */}
      <div className="card">
        <h2 className="text-base font-bold text-gray-900">الدمغة والعيار</h2>
        <p className="mt-1 text-[11px] text-gray-500">
          الرقم المحفور داخل القطعة يوضح نسبة الذهب فيها.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {KARATS.map((k) => (
            <div key={k.karat} className="rounded-xl bg-gray-50 p-3">
              <p className="text-sm font-bold text-gray-900">عيار {k.karat}</p>
              <p className="text-[11px] font-semibold text-amber-700">دمغة {k.stamp}</p>
              <p className="mt-1 text-[10px] leading-relaxed text-gray-500">{k.noteAr}</p>
            </div>
          ))}
        </div>
      </div>

      {/* VAT — the most commonly misunderstood part */}
      <div className="card">
        <h2 className="flex items-center gap-2 text-base font-bold text-gray-900">
          <Receipt className="h-4 w-4 text-amber-600" />
          الضريبة على الذهب في السعودية
        </h2>
        <ul className="mt-3 space-y-2.5 text-xs leading-relaxed text-gray-700">
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>
              المصوغات الذهبية تخضع لضريبة <strong className="font-bold">15%</strong> على{' '}
              <strong className="font-bold">كامل الفاتورة</strong> — قيمة الذهب والمصنعية معاً، وليس
              على المصنعية فقط كما يظن البعض.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>
              الإعفاء (نسبة صفر) للذهب الاستثماري فقط، وبثلاثة شروط معاً: نقاء 99% فأعلى،{' '}
              <em>و</em> على شكل سبيكة أو عملة متداولة، <em>و</em> الغرض استثماري.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>
              لذلك المجوهرات عيار 24 <strong className="font-bold">تخضع للضريبة</strong> رغم نقائها،
              لأن شكلها وغرضها للزينة لا للاستثمار.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
            <span>الضريبة اللي تدفعها كمستهلك لا تُسترد لك عند إعادة البيع.</span>
          </li>
        </ul>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="flex gap-2 text-[11px] leading-relaxed text-gray-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>
            أرقام المصنعية في التطبيق تقديرية ومبنية على أسعار منشورة من محلات ومواقع سعودية، وتختلف
            من محل لآخر ومن تصميم لآخر. استخدمها كمرجع للتفاوض، وللأحكام الضريبية الرسمية ارجع لهيئة
            الزكاة والضريبة والجمارك. السعر الفوري يُجلب من مصادر مجانية وقد يختلف قليلاً عن سعر
            محلك.
          </span>
        </p>
      </div>
    </div>
  )
}
