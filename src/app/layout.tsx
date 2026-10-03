import type { Metadata, Viewport } from 'next'
import './globals.css'
import BottomNav from '@/components/gold/BottomNav'

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
  // Lets the page extend under notches and system bars so the
  // env(safe-area-inset-*) paddings have real values to work with.
  viewportFit: 'cover',
  themeColor: '#f9fafb',
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
        {/* Top padding clears the status bar on iOS and in browsers that report
            a safe area; on Android the native shell insets the whole WebView
            instead (see capacitor.config.ts), so this resolves to the base
            padding there. Bottom padding leaves room for the navigation bar. */}
        <main
          className="min-h-screen px-4 pb-28 lg:px-6"
          style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
        >
          <div className="mx-auto max-w-2xl space-y-4 lg:max-w-5xl">{children}</div>
        </main>
        <BottomNav />
      </body>
    </html>
  )
}
