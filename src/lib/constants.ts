export const ACCOUNT_TYPES = {
  EMPLOYER_SAVINGS: 'EMPLOYER_SAVINGS',
  SAUDI_STOCKS: 'SAUDI_STOCKS',
  MANAGED_PORTFOLIO: 'MANAGED_PORTFOLIO',
} as const

export type AccountType = (typeof ACCOUNT_TYPES)[keyof typeof ACCOUNT_TYPES]

export const TRANSACTION_TYPES = {
  BUY: 'BUY',
  SELL: 'SELL',
  DIVIDEND: 'DIVIDEND',
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
} as const

export type TransactionType = (typeof TRANSACTION_TYPES)[keyof typeof TRANSACTION_TYPES]

export const ACCOUNT_CONFIGS: Record<
  AccountType,
  {
    label: { en: string; ar: string }
    description: { en: string; ar: string }
    icon: string
    color: string
  }
> = {
  EMPLOYER_SAVINGS: {
    label: {
      en: 'Employer Savings Program',
      ar: 'برنامج ادخار الموظفين',
    },
    description: {
      en: 'Central Bank supervised, 10% salary auto-deduction',
      ar: 'بإشراف البنك المركزي، خصم تلقائي 10% من الراتب',
    },
    icon: 'Building2',
    color: 'blue',
  },
  SAUDI_STOCKS: {
    label: {
      en: 'Saudi Stock Market (Tadawul)',
      ar: 'السوق السعودي (تداول)',
    },
    description: {
      en: 'Direct stock investments with dividend growth strategy',
      ar: 'استثمارات مباشرة في الأسهم بهدف نمو التوزيعات',
    },
    icon: 'TrendingUp',
    color: 'green',
  },
  MANAGED_PORTFOLIO: {
    label: {
      en: 'Managed Portfolio (Darahem)',
      ar: 'محفظة مُدارة (دراهم)',
    },
    description: {
      en: 'Mix of gold ETFs, US index funds, and global indices',
      ar: 'مزيج من صناديق الذهب وصناديق المؤشرات الأمريكية والعالمية',
    },
    icon: 'Wallet',
    color: 'purple',
  },
}

export const COMMON_SYMBOLS = {
  saudi: [
    { symbol: '2222.SR', name: 'Saudi Aramco', nameAr: 'أرامكو السعودية' },
    { symbol: '1120.SR', name: 'Al Rajhi Bank', nameAr: 'مصرف الراجحي' },
    { symbol: '2010.SR', name: 'SABIC', nameAr: 'سابك' },
    { symbol: '1010.SR', name: 'Riyad Bank', nameAr: 'بنك الرياض' },
    { symbol: '2380.SR', name: 'ACWA Power', nameAr: 'أكوا باور' },
    { symbol: '7010.SR', name: 'STC', nameAr: 'الاتصالات السعودية' },
    { symbol: '1180.SR', name: 'Al Inma Bank', nameAr: 'مصرف الإنماء' },
    { symbol: '2350.SR', name: 'Saudi Kayan', nameAr: 'كيان السعودية' },
  ],
  global: [
    { symbol: 'ACWI', name: 'MSCI All Country World Index ETF', nameAr: 'صندوق مؤشر MSCI العالمي' },
    { symbol: 'VT', name: 'Vanguard Total World Stock ETF', nameAr: 'صندوق فانغارد العالمي' },
    { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', nameAr: 'صندوق S&P 500' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF', nameAr: 'صندوق SPDR S&P 500' },
    { symbol: 'DIA', name: 'SPDR Dow Jones ETF', nameAr: 'صندوق داو جونز' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust', nameAr: 'صندوق ناسداك 100' },
    { symbol: 'GLD', name: 'SPDR Gold Shares', nameAr: 'صندوق الذهب SPDR' },
    { symbol: 'IAU', name: 'iShares Gold Trust', nameAr: 'صندوق الذهب iShares' },
  ],
  indices: [
    { symbol: '^TASI', name: 'Tadawul All Share Index', nameAr: 'مؤشر تداول' },
    { symbol: '^DJI', name: 'Dow Jones Industrial Average', nameAr: 'مؤشر داو جونز' },
    { symbol: '^GSPC', name: 'S&P 500', nameAr: 'مؤشر S&P 500' },
    { symbol: '^IXIC', name: 'NASDAQ Composite', nameAr: 'مؤشر ناسداك' },
  ],
  currencies: [
    { symbol: 'USDSAR=X', name: 'USD/SAR', nameAr: 'دولار/ريال' },
  ],
}
