import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.khalidaseri.investmenttracker',
  appName: 'استثماراتي',
  webDir: 'out',
  server: { androidScheme: 'https' },
  android: { adjustMarginsForEdgeToEdge: 'auto' },
  // Route fetch() through the system HTTP stack: price requests then reach the source directly,
  // without the browser's cross-origin limits or the public relays the website depends on.
  plugins: { CapacitorHttp: { enabled: true } },
}

export default config
