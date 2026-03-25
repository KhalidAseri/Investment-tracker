import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Clear existing data
  await prisma.dividend.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.holding.deleteMany()
  await prisma.account.deleteMany()
  await prisma.marketCache.deleteMany()

  // 1. Employer Savings Program
  const employerSavings = await prisma.account.create({
    data: {
      name: 'Employer Savings Program',
      nameAr: 'برنامج ادخار الموظفين',
      type: 'EMPLOYER_SAVINGS',
      currency: 'SAR',
      description: 'Central Bank supervised, 10% salary auto-deduction. Split between Al Ahli Bank (70% global stocks) and Central Bank money market (30%).',
    },
  })

  const ahliHolding = await prisma.holding.create({
    data: {
      accountId: employerSavings.id,
      symbol: 'ACWI',
      name: 'Al Ahli Bank Portfolio (Global Stocks)',
      nameAr: 'محفظة البنك الأهلي (أسهم عالمية)',
      shares: 150,
      averageCost: 95.50,
      targetAllocation: 0.70,
      indexTracked: 'MSCI All Country World Index',
    },
  })

  const cbHolding = await prisma.holding.create({
    data: {
      accountId: employerSavings.id,
      name: 'Central Bank Money Market Fund',
      nameAr: 'صندوق النقد - البنك المركزي',
      shares: 1,
      averageCost: 0,
      currentValue: 18500,
      targetAllocation: 0.30,
      indexTracked: 'Money Market',
    },
  })

  // 2. Saudi Stocks (Tadawul)
  const saudiStocks = await prisma.account.create({
    data: {
      name: 'Saudi Stock Market (Tadawul)',
      nameAr: 'السوق السعودي (تداول)',
      type: 'SAUDI_STOCKS',
      currency: 'SAR',
      description: 'Direct stock investments focused on dividend growth strategy.',
    },
  })

  const aramco = await prisma.holding.create({
    data: {
      accountId: saudiStocks.id,
      symbol: '2222.SR',
      name: 'Saudi Aramco',
      nameAr: 'أرامكو السعودية',
      shares: 200,
      averageCost: 30.50,
      sector: 'Energy',
    },
  })

  const rajhi = await prisma.holding.create({
    data: {
      accountId: saudiStocks.id,
      symbol: '1120.SR',
      name: 'Al Rajhi Bank',
      nameAr: 'مصرف الراجحي',
      shares: 50,
      averageCost: 78.00,
      sector: 'Banking',
    },
  })

  const stc = await prisma.holding.create({
    data: {
      accountId: saudiStocks.id,
      symbol: '7010.SR',
      name: 'STC',
      nameAr: 'الاتصالات ا��سعودية',
      shares: 100,
      averageCost: 45.00,
      sector: 'Telecom',
    },
  })

  const sabic = await prisma.holding.create({
    data: {
      accountId: saudiStocks.id,
      symbol: '2010.SR',
      name: 'SABIC',
      nameAr: 'سابك',
      shares: 80,
      averageCost: 92.00,
      sector: 'Materials',
    },
  })

  // 3. Darahem Managed Portfolio
  const darahem = await prisma.account.create({
    data: {
      name: 'Darahem Portfolio',
      nameAr: 'محفظة دراهم',
      type: 'MANAGED_PORTFOLIO',
      currency: 'SAR',
      description: 'Managed portfolio via Darahem app. Mix of gold ETFs and US market index funds.',
    },
  })

  await prisma.holding.create({
    data: {
      accountId: darahem.id,
      symbol: 'GLD',
      name: 'SPDR Gold Shares',
      nameAr: 'صندوق الذهب SPDR',
      shares: 10,
      averageCost: 180.00,
      targetAllocation: 0.10,
      sector: 'Commodities',
    },
  })

  await prisma.holding.create({
    data: {
      accountId: darahem.id,
      symbol: 'VOO',
      name: 'Vanguard S&P 500 ETF',
      nameAr: 'صندوق S&P 500',
      shares: 8,
      averageCost: 420.00,
      targetAllocation: 0.50,
      indexTracked: 'S&P 500',
    },
  })

  await prisma.holding.create({
    data: {
      accountId: darahem.id,
      symbol: 'DIA',
      name: 'SPDR Dow Jones ETF',
      nameAr: 'صندوق داو جونز',
      shares: 5,
      averageCost: 350.00,
      targetAllocation: 0.40,
      indexTracked: 'Dow Jones Industrial Average',
    },
  })

  // Sample Dividends for Saudi Stocks
  const dividendData = [
    { holdingId: aramco.id, amount: 380, perShare: 1.90, exDate: '2025-03-10', payDate: '2025-04-01', currency: 'SAR' },
    { holdingId: aramco.id, amount: 370, perShare: 1.85, exDate: '2024-09-10', payDate: '2024-10-01', currency: 'SAR' },
    { holdingId: aramco.id, amount: 360, perShare: 1.80, exDate: '2024-03-10', payDate: '2024-04-01', currency: 'SAR' },
    { holdingId: rajhi.id, amount: 187.5, perShare: 3.75, exDate: '2025-04-15', payDate: '2025-05-01', currency: 'SAR' },
    { holdingId: rajhi.id, amount: 175, perShare: 3.50, exDate: '2024-10-15', payDate: '2024-11-01', currency: 'SAR' },
    { holdingId: stc.id, amount: 400, perShare: 4.00, exDate: '2025-05-01', payDate: '2025-05-20', currency: 'SAR' },
    { holdingId: stc.id, amount: 380, perShare: 3.80, exDate: '2024-05-01', payDate: '2024-05-20', currency: 'SAR' },
  ]

  for (const div of dividendData) {
    await prisma.dividend.create({
      data: {
        ...div,
        exDate: new Date(div.exDate),
        payDate: new Date(div.payDate),
      },
    })
  }

  // Sample Transactions
  const transactionData = [
    { accountId: saudiStocks.id, holdingId: aramco.id, type: 'BUY', symbol: '2222.SR', shares: 200, pricePerShare: 30.50, totalAmount: 6100, date: '2023-06-15', notes: 'Initial purchase' },
    { accountId: saudiStocks.id, holdingId: rajhi.id, type: 'BUY', symbol: '1120.SR', shares: 50, pricePerShare: 78.00, totalAmount: 3900, date: '2023-08-20', notes: 'Dividend growth play' },
    { accountId: saudiStocks.id, holdingId: stc.id, type: 'BUY', symbol: '7010.SR', shares: 100, pricePerShare: 45.00, totalAmount: 4500, date: '2023-10-05', notes: 'Telecom sector' },
    { accountId: saudiStocks.id, holdingId: sabic.id, type: 'BUY', symbol: '2010.SR', shares: 80, pricePerShare: 92.00, totalAmount: 7360, date: '2024-01-10', notes: 'Materials diversification' },
    { accountId: employerSavings.id, type: 'DEPOSIT', totalAmount: 2500, date: '2025-01-01', notes: 'Monthly salary deduction 10%' },
    { accountId: employerSavings.id, type: 'DEPOSIT', totalAmount: 2500, date: '2025-02-01', notes: 'Monthly salary deduction 10%' },
    { accountId: employerSavings.id, type: 'DEPOSIT', totalAmount: 2500, date: '2025-03-01', notes: 'Monthly salary deduction 10%' },
    { accountId: darahem.id, type: 'DEPOSIT', totalAmount: 5000, date: '2024-06-01', notes: 'Initial deposit' },
    { accountId: darahem.id, type: 'DEPOSIT', totalAmount: 2000, date: '2025-01-15', notes: 'Monthly top-up' },
  ]

  for (const tx of transactionData) {
    await prisma.transaction.create({
      data: {
        ...tx,
        date: new Date(tx.date),
      },
    })
  }

  console.log('Seed data created successfully!')
  console.log(`- ${3} accounts`)
  console.log(`- ${8} holdings`)
  console.log(`- ${dividendData.length} dividends`)
  console.log(`- ${transactionData.length} transactions`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
