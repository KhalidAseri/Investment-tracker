import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.khalidaseri.goldcalculator',
  appName: 'حاسبة الذهب',
  // Capacitor copies this directory into the APK and serves it locally, so the
  // whole UI works offline. Only the live price lookups touch the network.
  webDir: 'out',
  server: {
    // Serve over https://localhost so the WebView treats the app as a secure
    // origin: localStorage then persists, and fetch behaves exactly as it does
    // on the deployed site. (This is Capacitor's default on Android; stated
    // explicitly because the whole app breaks quietly if it ever changes.)
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#f9fafb',
  },
}

export default config
