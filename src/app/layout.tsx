import type { Metadata } from 'next'
import './globals.css'
import { LocaleProvider } from '@/components/shared/LocaleContext'
import AppShell from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'Investment Tracker | متتبع الاستثمارات',
  description: 'Track all your investments in one place | تتبع جميع استثماراتك في مكان واحد',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <LocaleProvider>
          <AppShell>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  )
}
