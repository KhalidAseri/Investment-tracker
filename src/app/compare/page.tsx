import type { Metadata } from 'next'
import GoldNav from '@/components/gold/GoldNav'
import OfferComparison from '@/components/gold/OfferComparison'

export const metadata: Metadata = {
  title: 'مقارنة العروض',
  description: 'قارن عروض المحلات بالمصنعية للجرام',
}

export default function GoldComparePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">مقارنة العروض</h1>
        <p className="mt-1 text-xs text-gray-500">
          كل العروض اللي حفظتها، مرتبة من الأرخص مصنعيةً للأغلى.
        </p>
      </div>
      <GoldNav />
      <OfferComparison />
    </div>
  )
}
