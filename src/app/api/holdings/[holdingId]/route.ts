import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { holdingSchema } from '@/lib/validations'

export async function GET(
  _request: NextRequest,
  { params }: { params: { holdingId: string } }
) {
  const holding = await prisma.holding.findUnique({
    where: { id: params.holdingId },
    include: {
      account: true,
      dividends: { orderBy: { payDate: 'desc' } },
      transactions: { orderBy: { date: 'desc' } },
    },
  })

  if (!holding) {
    return NextResponse.json({ error: 'Holding not found' }, { status: 404 })
  }

  return NextResponse.json(holding)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { holdingId: string } }
) {
  const body = await request.json()
  const parsed = holdingSchema.partial().safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  const holding = await prisma.holding.update({
    where: { id: params.holdingId },
    data: parsed.data,
  })

  return NextResponse.json(holding)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { holdingId: string } }
) {
  await prisma.holding.delete({ where: { id: params.holdingId } })
  return NextResponse.json({ success: true })
}
