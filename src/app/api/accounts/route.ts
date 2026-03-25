import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accountSchema } from '@/lib/validations'

export async function GET() {
  const accounts = await prisma.account.findMany({
    include: {
      _count: { select: { holdings: true, transactions: true } },
      holdings: {
        select: {
          id: true,
          shares: true,
          averageCost: true,
          currentValue: true,
          symbol: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(accounts)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const parsed = accountSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const account = await prisma.account.create({
    data: parsed.data,
  })

  return NextResponse.json(account, { status: 201 })
}
