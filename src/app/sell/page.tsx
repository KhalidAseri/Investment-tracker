import type { Metadata } from 'next'
import GoldNav from '@/components/gold/GoldNav'
import SellCalculator from '@/components/gold/SellCalculator'

export const metadata: Metadata = {
  title: 'بيع',
  description: 'احسب كم راح تستلم لو بعت ذهبك اليوم',
}

export default function GoldSellPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-gray-900">بيع الذهب</h1>
        <p className="mt-1 text-xs text-gray-500">
          كم راح يدفع لك المحل فعلياً لو بعت اليوم، وكم ربحت أو خسرت.
        </p>
      </div>
      <GoldNav />
      <SellCalculator />
    </div>
  )
}
