import type { Metadata } from 'next'
import Market from '@/components/gold/Market'
import PageHeader from '@/components/gold/PageHeader'

export const metadata: Metadata = {
  title: 'السوق',
  description: 'سعر جرام الذهب خلال سنة، وتوقع نطاقه خلال الشهر الجاي',
}

export default function MarketPage() {
  return (
    <>
      <PageHeader
        title="السوق"
        subtitle="سعر الجرام خلال سنة، ووين ممكن يكون بعد شهر."
      />
      <Market />
    </>
  )
}
