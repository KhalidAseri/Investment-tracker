import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const symbol = searchParams.get('symbol')
  const period = searchParams.get('period') ?? '1mo'

  if (!symbol) {
    return NextResponse.json({ error: 'symbol parameter required' }, { status: 400 })
  }

  try {
    const yahooFinance = (await import('yahoo-finance2')).default

    const result: any[] = await yahooFinance.historical(symbol, {
      period1: getStartDate(period),
      period2: new Date(),
    })

    const data = result.map((item: any) => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    }))

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 })
  }
}

function getStartDate(period: string): Date {
  const now = new Date()
  switch (period) {
    case '1w':
      return new Date(now.setDate(now.getDate() - 7))
    case '1mo':
      return new Date(now.setMonth(now.getMonth() - 1))
    case '3mo':
      return new Date(now.setMonth(now.getMonth() - 3))
    case '6mo':
      return new Date(now.setMonth(now.getMonth() - 6))
    case '1y':
      return new Date(now.setFullYear(now.getFullYear() - 1))
    case '5y':
      return new Date(now.setFullYear(now.getFullYear() - 5))
    default:
      return new Date(now.setMonth(now.getMonth() - 1))
  }
}
