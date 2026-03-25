'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale } from '@/components/shared/LocaleContext'
import { ACCOUNT_CONFIGS } from '@/lib/constants'
import { createAccount } from '@/lib/storage'
import LoadingSpinner from '@/components/shared/LoadingSpinner'

function NewAccountForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, locale } = useLocale()
  const presetType = searchParams.get('type')

  const [form, setForm] = useState({
    name: '', nameAr: '', type: 'SAUDI_STOCKS' as string, currency: 'SAR', description: '',
  })

  useEffect(() => {
    if (presetType && ACCOUNT_CONFIGS[presetType]) {
      const config = ACCOUNT_CONFIGS[presetType]
      setForm((f) => ({
        ...f,
        type: presetType,
        name: config.label.en,
        nameAr: config.label.ar,
      }))
    }
  }, [presetType])

  function handleTypeSelect(type: string) {
    const config = ACCOUNT_CONFIGS[type]
    if (config) {
      setForm({ ...form, type, name: config.label.en, nameAr: config.label.ar })
    } else {
      setForm({ ...form, type })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.nameAr.trim()) return
    const account = createAccount(form as any)
    router.push(`/accounts/detail?id=${account.id}`)
  }

  const typeEntries = Object.entries(ACCOUNT_CONFIGS)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.accounts.addAccount}</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{t.accounts.type}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {typeEntries.map(([type, config]) => {
              const isSelected = form.type === type
              return (
                <button key={type} type="button" onClick={() => handleTypeSelect(type)}
                  className={`p-3 rounded-lg border-2 text-start transition-all ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <p className="font-medium text-sm text-gray-900">{locale === 'ar' ? config.label.ar : config.label.en}</p>
                  <p className="text-xs text-gray-500 mt-1">{locale === 'ar' ? config.description.ar : config.description.en}</p>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t.accounts.name}</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t.accounts.nameAr}</label>
            <input type="text" dir="rtl" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" required /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t.accounts.currency}</label>
            <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm text-sm">
              <option value="SAR">{t.common.sar} (SAR)</option><option value="USD">{t.common.usd} (USD)</option>
            </select></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">{t.accounts.description}</label>
            <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm" /></div>
        </div>

        <div className="flex gap-3 pt-2">
          <button type="submit" className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">{t.common.save}</button>
          <button type="button" onClick={() => router.back()} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">{t.common.cancel}</button>
        </div>
      </form>
    </div>
  )
}

export default function NewAccountPage() {
  return <Suspense fallback={<LoadingSpinner />}><NewAccountForm /></Suspense>
}
