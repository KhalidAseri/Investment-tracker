import { z } from 'zod'

export const accountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  nameAr: z.string().min(1, 'Arabic name is required'),
  type: z.string().min(1, 'Account type is required'),
  currency: z.string().default('SAR'),
  description: z.string().optional(),
})

export const holdingSchema = z.object({
  accountId: z.string().min(1),
  symbol: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  nameAr: z.string().optional(),
  shares: z.number().min(0).default(0),
  averageCost: z.number().min(0).default(0),
  currentValue: z.number().optional(),
  targetAllocation: z.number().min(0).max(1).optional(),
  sector: z.string().optional(),
  indexTracked: z.string().optional(),
})

export const transactionSchema = z.object({
  accountId: z.string().min(1),
  holdingId: z.string().optional(),
  type: z.enum(['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL']),
  symbol: z.string().optional(),
  shares: z.number().optional(),
  pricePerShare: z.number().optional(),
  totalAmount: z.number(),
  currency: z.string().default('SAR'),
  date: z.string().or(z.date()),
  notes: z.string().optional(),
})

export const dividendSchema = z.object({
  holdingId: z.string().min(1),
  amount: z.number().min(0),
  perShare: z.number().min(0),
  exDate: z.string().or(z.date()),
  payDate: z.string().or(z.date()),
  currency: z.string().default('SAR'),
})

export type AccountInput = z.infer<typeof accountSchema>
export type HoldingInput = z.infer<typeof holdingSchema>
export type TransactionInput = z.infer<typeof transactionSchema>
export type DividendInput = z.infer<typeof dividendSchema>
