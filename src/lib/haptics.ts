/**
 * Touch feedback.
 *
 * On the Android build this is a real taptic pulse through Capacitor. In a
 * browser it falls back to the Vibration API where that exists, and is a no-op
 * everywhere else — so callers never have to ask which shell they are in.
 *
 * Every call is wrapped: haptics are a nicety, and a device that refuses them
 * (permissions, an unsupported browser, a desktop) must never break a tap.
 */
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

type Strength = 'light' | 'medium' | 'heavy'

const IMPACT: Record<Strength, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
}

/** Web fallback durations, in milliseconds. */
const FALLBACK_MS: Record<Strength, number> = { light: 8, medium: 14, heavy: 22 }

function webVibrate(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore — vibration is optional */
  }
}

/** A tap landed: selecting a karat, a piece type, a tab. */
export function tapFeedback(strength: Strength = 'light') {
  if (typeof window === 'undefined') return
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.impact({ style: IMPACT[strength] }).catch(() => {})
      return
    }
  } catch {
    /* fall through to the web path */
  }
  webVibrate(FALLBACK_MS[strength])
}

/** Something succeeded and is worth feeling: an offer saved, a verdict landed. */
export function successFeedback() {
  if (typeof window === 'undefined') return
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.notification().catch(() => {})
      return
    }
  } catch {
    /* fall through to the web path */
  }
  webVibrate(24)
}
