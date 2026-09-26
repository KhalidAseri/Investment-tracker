import type { Metadata } from 'next'
import BuyCalculator from '@/components/gold/BuyCalculator'
import PageHeader from '@/components/gold/PageHeader'

export const metadata: Metadata = {
  description: 'احسب سعر الذهب بالمصنعية والضريبة قبل ما تشتري',
}

export default function GoldBuyPage() {
  return (
    <>
      <PageHeader
        title="حاسبة الذهب"
        subtitle="اعرف السعر العادل قبل ما تدخل المحل — بالمصنعية والضريبة وسعر إعادة البيع."
      />
      <BuyCalculator />
    </>
  )
}
