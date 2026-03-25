'use client'

import { Globe, TrendingUp } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import Link from 'next/link'

export default function Header() {
  const { locale, setLocale } = useLocale()

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-14 lg:h-16">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        {/* Mobile logo */}
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-900">
            {locale === 'ar' ? 'استثماراتي' : 'InvestTrack'}
          </span>
        </Link>

        <div className="flex-1 hidden lg:block" />

        {/* Locale switcher */}
        <button
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
        >
          <Globe className="w-4 h-4" />
          {locale === 'en' ? 'العربية' : 'English'}
        </button>
      </div>
    </header>
  )
}
