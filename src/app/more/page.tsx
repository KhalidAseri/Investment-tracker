'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Copy, Download, ExternalLink, Share2, Trash2, Upload } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { AssetClass } from '@/lib/types'
import { ASSET_CLASSES, todayISO } from '@/lib/labels'
import { breakdown, classTotals } from '@/lib/engine/exposure'
import { goalStatus } from '@/lib/engine/plan'
import { dividendStats } from '@/lib/engine/valuation'
import { encodeShare, type SharePayload } from '@/lib/engine/share'
import { TIPS } from '@/lib/guide'
import { dateLabel, pct } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import { BarList } from '@/components/charts'
import { Chips, Confirm, Disclaimer, Field, Money, Notice, NumberInput, Stat, cx } from '@/components/ui'

type Tab = 'dividends' | 'guide' | 'share' | 'settings'
const TABS: Tab[] = ['dividends', 'guide', 'share', 'settings']
const round1 = (n: number) => Math.round(n * 10) / 10

export default function MorePage() {
  const { L, data, settings, view, updateSettings, exportData, importData, resetData } = useStore()
  const [hash, setHash] = useHash('dividends')
  const tab: Tab = (TABS as string[]).includes(hash) ? (hash as Tab) : 'dividends'
  const [openTip, setOpenTip] = useState<string | null>('irish')
  const [shareName, setShareName] = useState('')
  const [withAmounts, setWithAmounts] = useState(false)
  const [withNames, setWithNames] = useState(true)
  const [msg, setMsg] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const divs = useMemo(() => dividendStats(data, view.cost), [data, view.cost])
  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const holdsUsFund = data.assets.some((a) => a.isFund && a.domicile === 'US')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500) }

  const shareUrl = useMemo(() => {
    if (investRows.length === 0 || typeof window === 'undefined') return ''
    const total = investRows.reduce((s, r) => s + r.value, 0)
    const totals = classTotals(investRows)
    const goal = goalStatus(view, settings)
    const payload: SharePayload = {
      v: 1,
      d: todayISO(),
      n: shareName.trim(),
      t: withAmounts ? Math.round(total) : undefined,
      c: ASSET_CLASSES.filter((c) => totals[c] > 0).map((c) => [c, round1((totals[c] / total) * 100)] as [AssetClass, number]),
      r: breakdown(investRows, 'region', settings, L, true).slices.map((s) => [s.label, round1(s.pct)] as [string, number]),
      s: breakdown(investRows.filter((r) => r.asset.assetClass === 'EQUITY'), 'sector', settings, L).slices.slice(0, 6).map((s) => [s.label, round1(s.pct)] as [string, number]),
      h: withNames ? investRows.slice(0, 8).map((r) => [r.asset.name, round1((r.value / total) * 100), r.asset.assetClass] as [string, number, AssetClass]) : [],
      g: goal.target > 0 ? Math.round(goal.pct) : undefined,
    }
    const base = window.location.pathname.replace(/more\/?$/, 'share/')
    return `${window.location.origin}${base}#${encodeShare(payload)}`
  }, [investRows, view, settings, shareName, withAmounts, withNames, L])

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash(L('تم النسخ', 'Copied')) } catch { flash(L('تعذّر النسخ — انسخه يدويًا من الحقل', 'Could not copy — copy it from the field')) }
  }
  const nativeShare = async () => {
    try { await navigator.share({ title: L('محفظتي الاستثمارية', 'My portfolio'), url: shareUrl }) } catch { /* cancelled by the user */ }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportData()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `investments-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => flash(importData(String(reader.result)) ? L('تمت استعادة البيانات', 'Data restored') : L('الملف غير صالح', 'Invalid file'))
    reader.readAsText(file)
  }

  const labels: Record<Tab, string> = { dividends: L('التوزيعات', 'Dividends'), guide: L('دليل المستثمر', 'Investor guide'), share: L('المشاركة', 'Share'), settings: L('الإعدادات', 'Settings') }

  return (
    <>
      <Chips value={tab} onChange={setHash} options={TABS.map((t) => ({ value: t, label: labels[t] }))} />
      {msg && <div role="status" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white">{msg}</div>}

      {/* ---------- Dividends ---------- */}
      {tab === 'dividends' && (
        <>
          <section className="card">
            <h2 className="section-title">{L('دخل التوزيعات', 'Dividend income')}</h2>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Stat label={L('آخر 12 شهرًا', 'Last 12 months')}><Money value={divs.ttm} /></Stat>
              <Stat label={L('متوسط شهري', 'Monthly average')}><Money value={divs.monthlyAvg} /></Stat>
              <Stat label={L('العائد على التكلفة', 'Yield on cost')}><span className="num">{pct(divs.yieldOnCost, 2)}</span></Stat>
              <Stat label={L('النمو السنوي', 'Yearly growth')} sub={divs.growthPct === null ? L('يحتاج سنتين كاملتين', 'Needs two full years') : undefined}><span className="num">{divs.growthPct === null ? '—' : pct(divs.growthPct, 1, true)}</span></Stat>
            </div>
            <p className="hint mt-3">{L('سجّل كل توزيعة من صفحة الأصل ← «توزيعة». العائد محسوب على إجمالي المبلغ المستثمَر.', 'Record each dividend from the asset page → “Dividend”. Yield is computed on total amount invested.')}</p>
          </section>
          {divs.byYear.length > 0 && (
            <section className="card">
              <h2 className="section-title mb-3">{L('حسب السنة', 'By year')}</h2>
              <BarList items={divs.byYear.map((y) => ({ key: String(y.year), label: String(y.year), value: y.amount, pct: divs.byYear.reduce((s, x) => s + x.amount, 0) > 0 ? (y.amount / divs.byYear.reduce((s, x) => s + x.amount, 0)) * 100 : 0 }))} />
            </section>
          )}
          <section className="card">
            <h2 className="section-title mb-3">{L('حسب الأصل (كل الفترات)', 'By asset (all time)')}</h2>
            {divs.byAsset.length === 0 ? <p className="hint">{L('لا توزيعات مسجلة بعد.', 'No dividends recorded yet.')}</p> : (
              <ul className="divide-y divide-line">
                {divs.byAsset.map((d) => (
                  <li key={d.assetId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{d.name}</span><span className="text-xs text-ink-soft">{L(`${d.count} توزيعة`, `${d.count} payments`)}</span></span>
                    <Money value={d.amount} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {/* ---------- Guide ---------- */}
      {tab === 'guide' && (
        <>
          {holdsUsFund && <Notice tone="info" title={L('ينطبق عليك: لديك صناديق مقرها أمريكا', 'Applies to you: you hold US-domiciled funds')}>{L('اقرأ البطاقة الأولى عن البدائل الأيرلندية.', 'Read the first card on the Irish alternatives.')}</Notice>}
          <section className="card divide-y divide-line p-0">
            {TIPS.map((t) => {
              const c = settings.locale === 'ar' ? t.ar : t.en
              const open = openTip === t.id
              return (
                <div key={t.id}>
                  <button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-start" aria-expanded={open} onClick={() => setOpenTip(open ? null : t.id)}>
                    <span className="text-sm font-bold">{c.title}</span>
                    <ChevronDown className={cx('h-5 w-5 shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} aria-hidden />
                  </button>
                  {open && <div className="space-y-2 px-4 pb-4 text-[13.5px] leading-relaxed text-ink-soft">{c.body.map((p, i) => <p key={i}>{p}</p>)}</div>}
                </div>
              )
            })}
          </section>
          <Disclaimer>{L('محتوى تثقيفي عام وليس توصية استثمارية أو ضريبية أو فتوى. الأنظمة الضريبية تتغير؛ تحقق قبل اتخاذ القرار.', 'General educational content, not investment, tax or religious advice. Tax rules change; verify before deciding.')}</Disclaimer>
        </>
      )}

      {/* ---------- Share ---------- */}
      {tab === 'share' && (
        <section className="card space-y-4">
          <div>
            <h2 className="section-title">{L('شارك محفظتك', 'Share your portfolio')}</h2>
            <p className="hint mt-1">{L('رابط للقراءة فقط يحمل لقطة من توزيع محفظتك الاستثمارية كما هي الآن. البيانات مشفّرة داخل الرابط نفسه ولا تُرفع لأي خادم؛ من يملك الرابط يرى اللقطة.', 'A read-only link carrying a snapshot of your investable allocation as it is now. The data lives inside the link itself and is not uploaded anywhere; anyone with the link sees the snapshot.')}</p>
          </div>
          {investRows.length === 0 ? <p className="hint">{L('أضف أصولًا أولاً.', 'Add assets first.')}</p> : (
            <>
              <Field label={L('اسم يظهر للمستلم (اختياري)', 'Name shown to the recipient (optional)')}><input className="input" value={shareName} maxLength={40} onChange={(e) => setShareName(e.target.value)} placeholder={L('مثال: محفظة خالد', 'e.g. Khalid’s portfolio')} /></Field>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={withAmounts} onChange={(e) => setWithAmounts(e.target.checked)} /><span className="text-sm">{L('أظهر المبلغ الإجمالي', 'Show the total amount')}<span className="hint block">{L('الافتراضي: نِسب فقط بدون أي مبالغ.', 'Default: percentages only, no amounts.')}</span></span></label>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} /><span className="text-sm">{L('أظهر أسماء أكبر الأصول', 'Show the names of the largest holdings')}</span></label>
              <input className="input num text-xs" dir="ltr" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label={L('رابط المشاركة', 'Share link')} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => copy(shareUrl)}><Copy className="h-4 w-4" />{L('نسخ الرابط', 'Copy link')}</button>
                {typeof navigator !== 'undefined' && 'share' in navigator
                  ? <button className="btn-ghost" onClick={nativeShare}><Share2 className="h-4 w-4" />{L('مشاركة', 'Share')}</button>
                  : <a className="btn-ghost" href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{L('معاينة', 'Preview')}</a>}
              </div>
              <a className="block text-center text-sm font-semibold text-brand-700" href={shareUrl} target="_blank" rel="noreferrer">{L('عاين ما سيراه المستلم', 'Preview what the recipient sees')}</a>
            </>
          )}
        </section>
      )}

      {/* ---------- Settings ---------- */}
      {tab === 'settings' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('عام', 'General')}</h2>
            <Field group label={L('اللغة', 'Language')}><Chips wrap value={settings.locale} onChange={(locale) => updateSettings({ locale })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} /></Field>
            <Field label={L('سعر الدولار بالريال', 'USD rate in SAR')} hint={L('الربط الرسمي 3.75.', 'The official peg is 3.75.')}><NumberInput value={settings.fx.USD ?? 3.75} onChange={(USD) => updateSettings({ fx: { ...settings.fx, USD: USD || 3.75 } })} /></Field>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={settings.shariahFirst} onChange={(e) => updateSettings({ shariahFirst: e.target.checked })} /><span className="text-sm">{L('اعرض الصناديق المتوافقة شرعيًا أولاً عند الإضافة', 'List Shariah-compliant funds first when adding')}</span></label>
          </section>
          <section className="card space-y-3">
            <h2 className="section-title">{L('تفكيك الصناديق العالمية', 'Global fund look-through')}</h2>
            <p className="hint">{L('أوزان تقريبية لمؤشر عالمي واسع، تُستخدم لتقسيم أي أصل جغرافيته «عالمي». عدّلها حسب نشرة صندوقك.', 'Approximate weights of a broad world index, used to split any asset whose geography is “Global”. Adjust to your fund’s factsheet.')}</p>
            <div className="grid grid-cols-3 gap-3">
              {(['US', 'DEV', 'EM'] as const).map((k) => (
                <Field key={k} label={{ US: L('أمريكا', 'US'), DEV: L('متقدمة', 'Developed'), EM: L('ناشئة', 'Emerging') }[k]}><NumberInput value={settings.lookThrough[k]} onChange={(n) => updateSettings({ lookThrough: { ...settings.lookThrough, [k]: n } })} suffix="%" /></Field>
              ))}
            </div>
          </section>
          <section className="card space-y-3">
            <h2 className="section-title">{L('النسخ الاحتياطي', 'Backup')}</h2>
            <p className="hint">{L('بياناتك محفوظة على هذا الجهاز فقط. مسح بيانات المتصفح يحذفها — خذ نسخة احتياطية بعد كل مراجعة.', 'Your data is stored on this device only. Clearing browser data deletes it — take a backup after each review.')}</p>
            <button className="btn-ghost w-full" onClick={download}><Download className="h-4 w-4" />{L('تنزيل نسخة احتياطية', 'Download backup')}</button>
            <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />{L('استعادة من ملف (يستبدل البيانات الحالية)', 'Restore from file (replaces current data)')}</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            <button className="btn-danger w-full" onClick={() => setConfirmReset(true)}><Trash2 className="h-4 w-4" />{L('حذف كل البيانات', 'Delete all data')}</button>
            {data.snapshots.length > 0 && <p className="hint">{L('آخر لقطة محفوظة', 'Last saved snapshot')}: {dateLabel(data.snapshots[data.snapshots.length - 1].date, settings.locale)}</p>}
          </section>
          <Disclaimer>{L('الأسعار المباشرة تُجلب من Yahoo Finance عبر وسيط عام مجاني، وقد تتأخر أو تتعذر أحيانًا؛ عندها يُعرض آخر سعر محفوظ. التطبيق أداة تنظيم وتثقيف وليس مستشارًا ماليًا مرخصًا. الإصدار 3.0', 'Live prices come from Yahoo Finance through a free public relay and can be delayed or unavailable at times; the last saved price is shown then. The app is an organising and educational tool, not a licensed financial adviser. Version 3.0')}</Disclaimer>
        </>
      )}

      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} title={L('حذف كل البيانات؟', 'Delete all data?')}
        body={L('ستُحذف كل الأصول والعمليات والإعدادات واللقطات نهائيًا من هذا الجهاز. لا يمكن التراجع.', 'All assets, transactions, settings and snapshots will be permanently deleted from this device. This cannot be undone.')}
        confirmLabel={L('حذف الكل', 'Delete everything')} onConfirm={resetData} />
    </>
  )
}
