import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { transactionSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')
  const holdingId = searchParams.get('holdingId')
  const limit = parseInt(searchParams.get('limit') ?? '50')

  const where: Record<string, unknown> = {}
  if (accountId) where.accountId = accountId
  if (holdingId) where.holdingId = holdingId

  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      account: { select: { id: true, name: true, nameAr: true } },
      holding: { select: { id: true, name: true, nameAr: true, symbol: true } },
    },
    orderBy: { date: 'desc' },
    take: limit,
  })

  return NextResponse.json(transactions)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = transactionSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const data = {
    ...parsed.data,
    date: new Date(parsed.data.date),
  }

  const transaction = await prisma.transaction.create({ data })

  // Update holding shares and average cost for BUY/SELL
  if (data.holdingId && data.shares && data.pricePerShare) {
    const holding = await prisma.holding.findUnique({
      where: { id: data.holdingId },
    })

    if (holding) {
      if (data.type === 'BUY') {
        const totalShares = holding.shares + data.shares
        const totalCost =
          holding.shares * holding.averageCost +
          data.shares * data.pricePerShare
        const newAvgCost = totalShares > 0 ? totalCost / totalShares : 0

        await prisma.holding.update({
          where: { id: data.holdingId },
          data: { shares: totalShares, averageCost: newAvgCost },
        })
      } else if (data.type === 'SELL') {
        const totalShares = Math.max(0, holding.shares - data.shares)
        await prisma.holding.update({
          where: { id: data.holdingId },
          data: { shares: totalShares },
        })
      }
    }
  }

  return NextResponse.json(transaction, { status: 201 })
}
