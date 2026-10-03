import type { Metadata } from 'next'
import PageHeader from '@/components/gold/PageHeader'
import ShopTour from '@/components/gold/ShopTour'

export const metadata: Metadata = {
  title: 'جولتي',
  description: 'قارن المحلات اللي زرتها بالمصنعية للجرام',
}

export default function ShopTourPage() {
  return (
    <>
      <PageHeader
        title="جولتي"
        subtitle="المحلات اللي سألتها، مرتّبة من الأرخص مصنعيةً للأغلى."
      />
      <ShopTour />
    </>
  )
}
