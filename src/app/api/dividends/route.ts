import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { dividendSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const holdingId = searchParams.get('holdingId')
  const limit = parseInt(searchParams.get('limit') ?? '100')

  const where = holdingId ? { holdingId } : {}

  const dividends = await prisma.dividend.findMany({
    where,
    include: {
      holding: {
        select: {
          id: true,
          name: true,
          nameAr: true,
          symbol: true,
          account: { select: { id: true, name: true, nameAr: true } },
        },
      },
    },
    orderBy: { payDate: 'desc' },
    take: limit,
  })

  return NextResponse.json(dividends)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = dividendSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const data = {
    ...parsed.data,
    exDate: new Date(parsed.data.exDate),
    payDate: new Date(parsed.data.payDate),
  }

  const dividend = await prisma.dividend.create({ data })

  // Also create a DIVIDEND transaction
  const holding = await prisma.holding.findUnique({
    where: { id: data.holdingId },
    select: { accountId: true, symbol: true },
  })

  if (holding) {
    await prisma.transaction.create({
      data: {
        accountId: holding.accountId,
        holdingId: data.holdingId,
        type: 'DIVIDEND',
        symbol: holding.symbol,
        totalAmount: data.amount,
        currency: data.currency,
        date: data.payDate,
        notes: `Dividend: ${data.perShare} per share`,
      },
    })
  }

  return NextResponse.json(dividend, { status: 201 })
}
