import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { accountSchema } from '@/lib/validations'

export async function GET(
  _request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const account = await prisma.account.findUnique({
    where: { id: params.accountId },
    include: {
      holdings: {
        include: {
          dividends: { orderBy: { payDate: 'desc' }, take: 5 },
        },
      },
      transactions: { orderBy: { date: 'desc' }, take: 20 },
      _count: { select: { holdings: true, transactions: true } },
    },
  })

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 })
  }

  return NextResponse.json(account)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const body = await request.json()
  const parsed = accountSchema.partial().safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const account = await prisma.account.update({
    where: { id: params.accountId },
    data: parsed.data,
  })

  return NextResponse.json(account)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { accountId: string } }
) {
  await prisma.account.delete({ where: { id: params.accountId } })
  return NextResponse.json({ success: true })
}
