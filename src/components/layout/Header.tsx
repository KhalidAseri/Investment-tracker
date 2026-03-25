'use client'

import { Menu, Globe } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { locale, setLocale, t } = useLocale()

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-16">
      <div className="flex items-center justify-between h-full px-4 lg:px-6">
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex-1" />

        {/* Locale switcher */}
        <button
          onClick={() => setLocale(locale === 'en' ? 'ar' : 'en')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Globe className="w-4 h-4" />
          {locale === 'en' ? 'العربية' : 'English'}
        </button>
      </div>
    </header>
  )
}
