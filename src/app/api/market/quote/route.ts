import { NextRequest, NextResponse } from 'next/server'
import { getQuote, getQuotes } from '@/lib/market'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbols = searchParams.get('symbols')

  if (!symbols) {
    return NextResponse.json({ error: 'symbols parameter required' }, { status: 400 })
  }

  const symbolList = symbols.split(',').map((s) => s.trim()).filter(Boolean)

  if (symbolList.length === 1) {
    const quote = await getQuote(symbolList[0])
    if (!quote) {
      return NextResponse.json({ error: 'Symbol not found' }, { status: 404 })
    }
    return NextResponse.json(quote)
  }

  const quotes = await getQuotes(symbolList)
  return NextResponse.json(quotes)
}
