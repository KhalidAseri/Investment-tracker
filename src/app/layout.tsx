import type { Metadata, Viewport } from 'next'
import './globals.css'
import { StoreProvider } from '@/lib/store'
import AppShell from '@/components/AppShell'

// '/Investment-tracker' on the website, '' inside the Android app (see next.config.js).
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export const metadata: Metadata = {
  title: 'استثماراتي',
  description: 'مرشد محفظتك: التوزيع، المخاطر، الخطة، الدخل والزكاة',
  manifest: `${base}/manifest.json`,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'استثماراتي' },
  formatDetection: { telephone: false },
  icons: { icon: `${base}/icons/icon.svg`, apple: `${base}/icons/icon.svg` },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // the keyboard shrinks the page instead of covering it, so bottom sheets stay above it
  interactiveWidget: 'resizes-content',
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#fafafa' }, { media: '(prefers-color-scheme: dark)', color: '#09090b' }],
}

// Runs before first paint so a saved dark theme or English layout never flashes the default.
const BOOT = `try{var s=(JSON.parse(localStorage.getItem('investtrack_v3')||'{}').settings)||{},d=document.documentElement;if(s.theme==='dark'||s.theme==='light')d.setAttribute('data-theme',s.theme);if(s.locale==='en'){d.lang='en';d.dir='ltr'}}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  )
}
