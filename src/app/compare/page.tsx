import type { Metadata } from 'next'
import OfferComparison from '@/components/gold/OfferComparison'
import PageHeader from '@/components/gold/PageHeader'

export const metadata: Metadata = {
  title: 'مقارنة العروض',
  description: 'قارن عروض المحلات بالمصنعية للجرام',
}

export default function GoldComparePage() {
  return (
    <>
      <PageHeader
        title="مقارنة العروض"
        subtitle="كل العروض اللي حفظتها، مرتبة من الأرخص مصنعيةً للأغلى."
      />
      <OfferComparison />
    </>
  )
}
