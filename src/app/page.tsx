import type { Metadata } from 'next'
import Calculator from '@/components/gold/Calculator'

export const metadata: Metadata = {
  description: 'سعر جرام الذهب العادل بالمصنعية والضريبة، وهل سعر المحل منطقي، وكم تستلم لو بعت',
}

// No page title here: the gold card at the top of the calculator is the
// header, and a heading above it only pushed the price further down.
export default function CalculatorPage() {
  return <Calculator />
}
