import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { holdingSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('accountId')

  const where = accountId ? { accountId } : {}

  const holdings = await prisma.holding.findMany({
    where,
    include: {
      account: { select: { id: true, name: true, nameAr: true, type: true, currency: true } },
      _count: { select: { dividends: true, transactions: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(holdings)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = holdingSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const holding = await prisma.holding.create({
    data: parsed.data,
  })

  return NextResponse.json(holding, { status: 201 })
}
