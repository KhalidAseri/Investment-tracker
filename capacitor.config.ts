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
    // Android 15 (targetSdk 35) forces edge-to-edge: the WebView is drawn
    // under the status bar and the gesture bar unless something insets it.
    // Capacitor's default is to leave that alone, which put the app's top
    // controls behind the clock and signal icons. 'auto' makes Capacitor
    // apply the system-bar insets as margins on Android 15+, and do nothing
    // on older versions, where the system never drew under the bars anyway.
    adjustMarginsForEdgeToEdge: 'auto',
  },
}

export default config
