'use client'

import { useState, useRef } from 'react'
import { Globe, Download, Upload, Trash2, AlertTriangle } from 'lucide-react'
import { useLocale } from '@/components/shared/LocaleContext'
import { exportAllData, importAllData, resetAllData } from '@/lib/storage'

export default function SettingsPage() {
  const { t, locale, setLocale } = useLocale()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showReset, setShowReset] = useState(false)
  const [showImportChoice, setShowImportChoice] = useState(false)
  const [importJson, setImportJson] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    const data = exportAllData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `investment-tracker-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ type: 'success', text: t.settings.exportSuccess })
    setTimeout(() => setMessage(null), 3000)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setImportJson(reader.result as string)
      setShowImportChoice(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function doImport(merge: boolean) {
    if (!importJson) return
    const result = importAllData(importJson, merge)
    if (result.success) {
      setMessage({ type: 'success', text: t.settings.importSuccess })
      setTimeout(() => window.location.reload(), 1000)
    } else {
      setMessage({ type: 'error', text: `${t.settings.importError}: ${result.error}` })
    }
    setShowImportChoice(false)
    setImportJson(null)
    setTimeout(() => setMessage(null), 3000)
  }

  function handleReset() {
    resetAllData()
    window.location.reload()
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">{t.settings.title}</h1>

      {message && (
        <div className={`p-3 rounded-lg text-sm font-medium ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      )}

      {/* Language */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600"><Globe className="w-5 h-5" /></div>
          <h2 className="font-semibold text-gray-900">{t.settings.language}</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setLocale('en')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${locale === 'en' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className="text-2xl mb-1">🇬🇧</p><p className="font-medium">English</p>
          </button>
          <button onClick={() => setLocale('ar')}
            className={`p-4 rounded-lg border-2 text-center transition-all ${locale === 'ar' ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <p className="text-2xl mb-1">🇸🇦</p><p className="font-medium">العربية</p>
          </button>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-600"><Download className="w-5 h-5" /></div>
          <h2 className="font-semibold text-gray-900">{t.settings.dataManagement}</h2>
        </div>
        <div className="space-y-3">
          <button onClick={handleExport}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-start">
            <Download className="w-5 h-5 text-green-600 shrink-0" />
            <div><p className="font-medium text-sm text-gray-900">{t.settings.exportData}</p>
              <p className="text-xs text-gray-500">{t.settings.exportDesc}</p></div>
          </button>

          <button onClick={() => fileRef.current?.click()}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-start">
            <Upload className="w-5 h-5 text-blue-600 shrink-0" />
            <div><p className="font-medium text-sm text-gray-900">{t.settings.importData}</p>
              <p className="text-xs text-gray-500">{t.settings.importDesc}</p></div>
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

          <button onClick={() => setShowReset(true)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-red-200 hover:bg-red-50 transition-colors text-start">
            <Trash2 className="w-5 h-5 text-red-600 shrink-0" />
            <div><p className="font-medium text-sm text-red-600">{t.settings.resetData}</p>
              <p className="text-xs text-gray-500">{t.settings.resetDesc}</p></div>
          </button>
        </div>
      </div>

      {/* Import Choice Dialog */}
      {showImportChoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-gray-900">{t.settings.importData}</h3>
            <p className="text-sm text-gray-600">{t.settings.mergeOrReplace}</p>
            <div className="flex gap-3">
              <button onClick={() => doImport(true)} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">{t.settings.merge}</button>
              <button onClick={() => doImport(false)} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium">{t.settings.replace}</button>
              <button onClick={() => { setShowImportChoice(false); setImportJson(null) }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Confirmation */}
      {showReset && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
              <h3 className="font-semibold text-gray-900">{t.settings.resetData}</h3>
            </div>
            <p className="text-sm text-gray-600">{t.settings.resetConfirm}</p>
            <div className="flex gap-3">
              <button onClick={handleReset} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">{t.common.delete}</button>
              <button onClick={() => setShowReset(false)} className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">{t.common.cancel}</button>
            </div>
          </div>
        </div>
      )}

      {/* About */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-3">{locale === 'ar' ? 'عن التطبيق' : 'About'}</h2>
        <div className="space-y-2 text-sm text-gray-600">
          <p>{locale === 'ar'
            ? 'متتبع الاستثمارات - تطبيق لإدارة وتتبع جميع استثماراتك في مكان واحد'
            : 'Investment Tracker - Track and manage all your investments in one place'}</p>
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400">{locale === 'ar' ? 'الإصدار' : 'Version'} 2.0.0</p>
          </div>
        </div>
      </div>
    </div>
  )
}
