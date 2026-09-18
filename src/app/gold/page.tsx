import type { Metadata } from 'next'
import BuyCalculator from '@/components/gold/BuyCalculator'
import GoldNav from '@/components/gold/GoldNav'

export const metadata: Metadata = {
  title: 'حاسبة الذهب | شراء',
  description: 'احسب سعر الذهب بالمصنعية والضريبة قبل ما تشتري',
}

export default function GoldBuyPage() {
  return (
    <div dir="rtl" className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">حاسبة الذهب</h1>
        <p className="mt-1 text-xs text-gray-500">
          اعرف السعر العادل قبل ما تدخل المحل — بالمصنعية والضريبة وسعر إعادة البيع.
        </p>
      </div>
      <GoldNav />
      <BuyCalculator />
    </div>
  )
}
