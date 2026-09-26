import type { Metadata } from 'next'
import Calculator from '@/components/gold/Calculator'
import PageHeader from '@/components/gold/PageHeader'

export const metadata: Metadata = {
  description: 'احسب سعر الذهب بالمصنعية والضريبة قبل ما تشتري، واعرف كم تستلم لو بعت',
}

export default function CalculatorPage() {
  return (
    <>
      <PageHeader
        title="حاسبة الذهب"
        subtitle="اعرف السعر العادل قبل ما تدخل المحل — بالمصنعية والضريبة وسعر إعادة البيع."
      />
      <Calculator />
    </>
  )
}
