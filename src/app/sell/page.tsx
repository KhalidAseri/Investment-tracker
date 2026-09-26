import type { Metadata } from 'next'
import PageHeader from '@/components/gold/PageHeader'
import SellCalculator from '@/components/gold/SellCalculator'

export const metadata: Metadata = {
  title: 'بيع',
  description: 'احسب كم راح تستلم لو بعت ذهبك اليوم',
}

export default function GoldSellPage() {
  return (
    <>
      <PageHeader
        title="بيع الذهب"
        subtitle="كم راح يدفع لك المحل فعلياً لو بعت اليوم، وكم ربحت أو خسرت."
      />
      <SellCalculator />
    </>
  )
}
