'use client'

import { Globe, DollarSign } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'

export default function SettingsPage() {
  const { t, locale, setLocale } = useLocale()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t.settings.title}</h1>

      {/* Language */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Globe className="w-5 h-5" />
          </div>
          <h2 className="font-semibold text-gray-900">{t.settings.language}</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setLocale('en')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${
              locale === 'en'
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-2xl mb-1">🇬🇧</p>
            <p className="font-medium">English</p>
          </button>
          <button
            onClick={() => setLocale('ar')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${
              locale === 'ar'
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-2xl mb-1">🇸🇦</p>
            <p className="font-medium">العربية</p>
          </button>
        </div>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">
          {locale === 'ar' ? 'عن التطبيق' : 'About'}
        </h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>
            {locale === 'ar'
              ? 'متتبع الاستثمارات - تطبيق لإدارة وتتبع جميع استثماراتك في مكان واحد'
              : 'Investment Tracker - Track and manage all your investments in one place'}
          </p>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              {locale === 'ar' ? 'الإصدار' : 'Version'} 1.0.0
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {locale === 'ar'
                ? 'بيانات السوق من Yahoo Finance'
                : 'Market data powered by Yahoo Finance'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
