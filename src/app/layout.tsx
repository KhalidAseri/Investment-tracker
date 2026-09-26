import type { Metadata, Viewport } from 'next'
import './globals.css'
import GoldNav from '@/components/gold/GoldNav'

// Next does not apply `basePath` to metadata URLs, so they are prefixed here.
// Empty in the Android build, where Capacitor serves from the server root.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: {
    default: 'حاسبة الذهب',
    template: '%s | حاسبة الذهب',
  },
  description: 'احسب سعر الذهب بالمصنعية والضريبة قبل ما تشتري، واعرف كم تستلم لو بعت.',
  manifest: `${BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'حاسبة الذهب',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: `${BASE}/icons/icon.svg`,
    apple: `${BASE}/icons/icon.svg`,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#d97706',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="apple-touch-icon" href={`${BASE}/icons/icon.svg`} />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <main className="min-h-screen p-4 pb-24 lg:p-6">
          <div className="mx-auto max-w-2xl space-y-4">
            {/* The nav lives in the layout, not in each page: kept mounted
                across navigation, its active pill slides from tab to tab
                instead of blinking out and reappearing somewhere else. */}
            <GoldNav />
            {children}
          </div>
        </main>
      </body>
    </html>
  )
}
