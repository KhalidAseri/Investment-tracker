'use client'

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { Locale } from '@/types'
import enMessages from '../../../messages/en.json'
import arMessages from '../../../messages/ar.json'

type Messages = typeof enMessages

interface LocaleContextType {
  locale: Locale
  dir: 'rtl' | 'ltr'
  t: Messages
  setLocale: (locale: Locale) => void
}

const LocaleContext = createContext<LocaleContextType | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    document.documentElement.lang = newLocale
    document.documentElement.dir = newLocale === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('locale', newLocale)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('locale') as Locale | null
    if (saved && (saved === 'en' || saved === 'ar')) {
      setLocale(saved)
    }
  }, [setLocale])

  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const t = locale === 'ar' ? arMessages : enMessages

  return (
    <LocaleContext.Provider value={{ locale, dir, t, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const context = useContext(LocaleContext)
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider')
  }
  return context
}
