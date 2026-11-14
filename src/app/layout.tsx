import type { Metadata, Viewport } from 'next'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = {
  title: 'استثماراتي',
  description: 'مرشد محفظتك: التوزيع، المخاطر، الخطة، الدخل والزكاة',
  manifest: '/Investment-tracker/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'استثماراتي' },
  formatDetection: { telephone: false },
  icons: { icon: '/Investment-tracker/icons/icon.svg', apple: '/Investment-tracker/icons/icon.svg' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0f6b5d',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  )
}
