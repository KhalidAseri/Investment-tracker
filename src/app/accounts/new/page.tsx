'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/components/shared/LocaleContext'
import { ACCOUNT_CONFIGS, ACCOUNT_TYPES, type AccountType } from '@/lib/constants'

export default function NewAccountPage() {
  const router = useRouter()
  const { t, locale } = useLocale()
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    nameAr: '',
    type: ACCOUNT_TYPES.SAUDI_STOCKS as string,
    currency: 'SAR',
    description: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.ok) {
        const account = await res.json()
        router.push(`/accounts/${account.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t.accounts.addAccount}</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Account Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t.accounts.type}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.keys(ACCOUNT_CONFIGS) as AccountType[]).map((type) => {
              const config = ACCOUNT_CONFIGS[type]
              const isSelected = form.type === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setForm({
                      ...form,
                      type,
                      name: config.label.en,
                      nameAr: config.label.ar,
                    })
                  }}
                  className={`p-3 rounded-lg border-2 text-start transition-all ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="font-medium text-sm text-gray-900">
                    {locale === 'ar' ? config.label.ar : config.label.en}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {locale === 'ar' ? config.description.ar : config.description.en}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.accounts.name}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t.accounts.nameAr}
            </label>
            <input
              type="text"
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
              required
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.accounts.currency}
          </label>
          <select
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="SAR">{t.common.sar} (SAR)</option>
            <option value="USD">{t.common.usd} (USD)</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t.accounts.description}
          </label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {saving ? t.common.loading : t.common.save}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
          >
            {t.common.cancel}
          </button>
        </div>
      </form>
    </div>
  )
}
