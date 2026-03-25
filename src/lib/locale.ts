import type { Locale } from '@/types'

export function getTranslations(locale: Locale) {
  // Dynamic import would be better but for simplicity we use require
  if (locale === 'ar') {
    return require('../../messages/ar.json')
  }
  return require('../../messages/en.json')
}

export function getDirection(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr'
}
