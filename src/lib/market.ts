import { prisma } from './db'

interface QuoteResult {
  symbol: string
  price: number
  change: number
  changePercent: number
  currency: string
  name: string
  updatedAt: Date
  isStale: boolean
}

const CACHE_TTL_MINUTES = 5

async function fetchYahooQuote(symbol: string): Promise<QuoteResult | null> {
  try {
    const yahooFinance = (await import('yahoo-finance2')).default
    const quote: any = await yahooFinance.quote(symbol)

    if (!quote || !quote.regularMarketPrice) return null

    const result: QuoteResult = {
      symbol,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChange ?? 0,
      changePercent: quote.regularMarketChangePercent ?? 0,
      currency: quote.currency ?? 'USD',
      name: quote.shortName ?? quote.longName ?? symbol,
      updatedAt: new Date(),
      isStale: false,
    }

    await prisma.marketCache.upsert({
      where: { symbol },
      update: {
        price: result.price,
        change: result.change,
        changePercent: result.changePercent,
        currency: result.currency,
        name: result.name,
      },
      create: {
        symbol,
        price: result.price,
        change: result.change,
        changePercent: result.changePercent,
        currency: result.currency,
        name: result.name,
      },
    })

    return result
  } catch (error) {
    console.error(`Failed to fetch quote for ${symbol}:`, error)
    return null
  }
}

async function getCachedQuote(symbol: string): Promise<QuoteResult | null> {
  const cached = await prisma.marketCache.findUnique({
    where: { symbol },
  })

  if (!cached) return null

  const ageMinutes = (Date.now() - cached.updatedAt.getTime()) / (1000 * 60)

  return {
    symbol: cached.symbol,
    price: cached.price,
    change: cached.change,
    changePercent: cached.changePercent,
    currency: cached.currency,
    name: cached.name ?? symbol,
    updatedAt: cached.updatedAt,
    isStale: ageMinutes > CACHE_TTL_MINUTES,
  }
}

export async function getQuote(symbol: string): Promise<QuoteResult | null> {
  const cached = await getCachedQuote(symbol)

  if (cached && !cached.isStale) {
    return cached
  }

  const fresh = await fetchYahooQuote(symbol)
  if (fresh) return fresh

  // Return stale cache as fallback
  if (cached) return { ...cached, isStale: true }

  return null
}

export async function getQuotes(symbols: string[]): Promise<Record<string, QuoteResult>> {
  const results: Record<string, QuoteResult> = {}

  const promises = symbols.map(async (symbol) => {
    const quote = await getQuote(symbol)
    if (quote) {
      results[symbol] = quote
    }
  })

  await Promise.all(promises)
  return results
}

export async function getExchangeRate(from: string = 'USD', to: string = 'SAR'): Promise<number> {
  if (from === to) return 1

  const symbol = `${from}${to}=X`
  const quote = await getQuote(symbol)
  return quote?.price ?? 3.75 // Default SAR/USD rate
}

export async function searchSymbol(query: string) {
  try {
    const yahooFinance = (await import('yahoo-finance2')).default
    const results: any = await yahooFinance.search(query)
    return results.quotes?.map((q: any) => ({
      symbol: q.symbol as string,
      name: (q.shortname ?? q.longname ?? q.symbol) as string,
      type: q.quoteType as string,
      exchange: q.exchange as string,
    })) ?? []
  } catch {
    return []
  }
}
