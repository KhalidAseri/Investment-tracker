'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, CircleCheck, CircleDashed, Copy, Download, ExternalLink, Lock, Share2, Smartphone, Trash2, Upload } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { AssetClass } from '@/lib/types'
import { ASSET_CLASSES, todayISO } from '@/lib/labels'
import { breakdown, classTotals } from '@/lib/engine/exposure'
import { goalStatus } from '@/lib/engine/plan'
import { encodeShare, type SharePayload } from '@/lib/engine/share'
import { fetchRuns, type ProfileRun } from '@/lib/cloud'
import { TIPS } from '@/lib/guide'
import { dateLabel } from '@/lib/format'
import { useHash } from '@/lib/useHash'
import ProfileSheet from '@/components/ProfileSheet'
import { Chips, Confirm, Disclaimer, Field, Money, Notice, NumberInput, cx } from '@/components/ui'

type Tab = 'account' | 'profiles' | 'settings' | 'guide' | 'share'
const TABS: Tab[] = ['account', 'profiles', 'settings', 'guide', 'share']
const round1 = (n: number) => Math.round(n * 10) / 10
/** The public site: share links and the app download must point here even when running inside the Android app. */
const SITE = 'https://khalidaseri.github.io/Investment-tracker'
const isNative = () => typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()

export default function MorePage() {
  const store = useStore()
  const { L, data, settings, view, updateSettings, exportData, importData, resetData, cloudUser, syncStatus, syncError } = store
  const [hash, setHash] = useHash('account')
  const tab: Tab = (TABS as string[]).includes(hash) ? (hash as Tab) : 'account'
  const [openTip, setOpenTip] = useState<string | null>('irish')
  const [shareName, setShareName] = useState('')
  const [withAmounts, setWithAmounts] = useState(false)
  const [withNames, setWithNames] = useState(true)
  const [msg, setMsg] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [runs, setRuns] = useState<ProfileRun[]>([])
  const [profileOf, setProfileOf] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const investRows = useMemo(() => view.rows.filter((r) => !r.asset.isEmergencyFund), [view.rows])
  const holdsUsFund = data.assets.some((a) => a.isFund && a.domicile === 'US')
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(''), 3500) }
  useEffect(() => { if (cloudUser) fetchRuns().then(setRuns).catch(() => {}) }, [cloudUser, syncStatus])

  const shareUrl = useMemo(() => {
    if (investRows.length === 0) return ''
    const total = investRows.reduce((s, r) => s + r.value, 0)
    const totals = classTotals(investRows, data.profiles)
    const goal = goalStatus(view, settings)
    const opts = { profiles: data.profiles }
    const payload: SharePayload = {
      v: 1, d: todayISO(), n: shareName.trim(),
      t: withAmounts ? Math.round(total) : undefined,
      c: ASSET_CLASSES.filter((c) => totals[c] > 0).map((c) => [c, round1((totals[c] / total) * 100)] as [AssetClass, number]),
      r: breakdown(investRows, 'region', settings, L, opts).slices.map((s) => [s.label, round1(s.pct)] as [string, number]),
      s: breakdown(investRows.filter((r) => r.asset.assetClass === 'EQUITY'), 'sector', settings, L, opts).slices.slice(0, 6).map((s) => [s.label, round1(s.pct)] as [string, number]),
      h: withNames ? investRows.slice(0, 8).map((r) => [r.asset.name, round1((r.value / total) * 100), r.asset.assetClass] as [string, number, AssetClass]) : [],
      g: goal.target > 0 ? Math.round(goal.pct) : undefined,
    }
    return `${SITE}/share/#${encodeShare(payload)}`
  }, [investRows, view, settings, data.profiles, shareName, withAmounts, withNames, L])

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); flash(L('تم النسخ', 'Copied')) } catch { flash(L('تعذّر النسخ — انسخه يدويًا من الحقل', 'Could not copy — copy it from the field')) }
  }
  const nativeShare = async () => { try { await navigator.share({ title: L('محفظتي الاستثمارية', 'My portfolio'), url: shareUrl }) } catch { /* cancelled by the user */ } }
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
  const doSignIn = async () => {
    setBusy(true)
    setAuthError('')
    const err = await store.signIn(email, password)
    setBusy(false)
    if (err) setAuthError(/invalid/i.test(err) ? L('البريد أو كلمة المرور غير صحيحة.', 'Wrong email or password.') : err)
    else setPassword('')
  }

  const labels: Record<Tab, string> = { account: L('الحساب', 'Account'), profiles: L('توزيعات الأصول', 'Asset breakdowns'), settings: L('الإعدادات', 'Settings'), guide: L('الدليل', 'Guide'), share: L('المشاركة', 'Share') }
  const syncText = { off: '', syncing: L('جاري المزامنة…', 'Syncing…'), synced: L('متزامن', 'In sync'), error: L('تعذّرت المزامنة', 'Sync failed'), conflict: L('تعارض يحتاج قرارك', 'Conflict needs your decision') }[syncStatus]
  const analysed = data.assets.filter((a) => data.profiles[a.id]).length

  return (
    <>
      <Chips value={tab} onChange={setHash} options={TABS.map((t) => ({ value: t, label: labels[t] }))} />
      {msg && <div role="status" className="rounded-xl bg-ink px-4 py-3 text-sm font-medium text-surface">{msg}</div>}

      {/* ---------- Account & sync ---------- */}
      {tab === 'account' && (
        <>
          {!cloudUser ? (
            <section className="card space-y-4">
              <div>
                <h2 className="section-title">{L('اربط حسابك', 'Connect your account')}</h2>
                <p className="hint mt-1">{L('بعد الدخول تُرفع محفظتك لمخزنك الخاص، فيصير عندك نسخ احتياطي ومزامنة بين الجوال والموقع، ويستطيع كلود قراءة أصولك وتسجيل توزيع كل أصل.', 'Once signed in your portfolio is uploaded to your private store: a backup, sync between phone and site, and Claude can read your assets and record each one’s breakdown.')}</p>
              </div>
              <Field label={L('البريد الإلكتروني', 'Email')}><input className="input" type="email" autoComplete="username" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <Field label={L('كلمة المرور', 'Password')} hint={L('نفس بريدك وكلمة مرورك في تطبيق «مسار».', 'The same email and password you use in the Masar app.')}><input className="input" type="password" autoComplete="current-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && email && password && doSignIn()} /></Field>
              {authError && <p role="alert" className="text-sm font-medium text-loss">{authError}</p>}
              <button className="btn-primary w-full" disabled={busy || !email || !password} onClick={doSignIn}>{busy ? L('جاري الدخول…', 'Signing in…') : L('دخول ومزامنة', 'Sign in and sync')}</button>
              <p className="hint">{L('التطبيق يعمل كاملًا بدون دخول؛ بياناتك حينها على هذا الجهاز فقط.', 'The app works fully without signing in; your data then stays on this device only.')}</p>
            </section>
          ) : (
            <section className="card space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="section-title">{L('حسابك مرتبط', 'Your account is connected')}</h2><p className="num mt-0.5 truncate text-sm text-ink-soft">{cloudUser}</p></div>
                <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', syncStatus === 'synced' ? 'bg-good-tint text-gain' : syncStatus === 'error' || syncStatus === 'conflict' ? 'bg-loss-tint text-loss' : 'bg-surface text-ink-soft')} role="status">{syncText}</span>
              </div>
              {syncStatus === 'conflict' && (
                <Notice tone="warn" title={L('المحفظة عُدّلت هنا وعلى جهاز آخر', 'The portfolio changed here and on another device')}
                  action={<div className="flex flex-wrap gap-2"><button className="btn-soft" onClick={() => store.resolveConflict('local')}>{L('أبقِ نسخة هذا الجهاز', 'Keep this device')}</button><button className="btn-soft" onClick={() => store.resolveConflict('remote')}>{L('أبقِ النسخة السحابية', 'Keep the cloud copy')}</button></div>}>
                  {L('اختر أي نسخة تبقى؛ الأخرى تُستبدل. إن لم تكن متأكدًا خذ نسخة احتياطية من الإعدادات أولاً.', 'Choose which copy to keep; the other is replaced. If unsure, take a backup from Settings first.')}
                </Notice>
              )}
              {syncStatus === 'error' && <Notice tone="warn" title={L('تعذّرت المزامنة', 'Sync failed')}>{syncError}</Notice>}
              <div className="flex gap-2">
                <button className="btn-soft flex-1" disabled={syncStatus === 'syncing'} onClick={() => store.syncNow()}>{L('مزامنة الآن', 'Sync now')}</button>
                <button className="btn-ghost" onClick={() => store.signOut()}>{L('خروج', 'Sign out')}</button>
              </div>
              <p className="hint">{L('الخروج لا يحذف بياناتك من هذا الجهاز ولا من المخزن.', 'Signing out deletes nothing, on this device or in the store.')}</p>
            </section>
          )}
          {cloudUser && runs.length > 0 && (
            <section className="card">
              <h2 className="section-title mb-3">{L('آخر تحديثات كلود للتوزيعات', 'Claude’s latest breakdown updates')}</h2>
              <ul className="divide-y divide-line">
                {runs.map((r) => <li key={r.ran_at} className="py-3 text-sm"><p className="text-xs text-ink-soft">{dateLabel(r.ran_at, settings.locale)}</p><p className="mt-0.5 leading-relaxed">{r.summary}</p></li>)}
              </ul>
            </section>
          )}
          {!isNative() && (
            <section className="card flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-tint text-link"><Smartphone className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{L('تطبيق أندرويد', 'Android app')}</h2><p className="hint">{L('أسعار مباشرة أوثق، ويعمل بلا متصفح.', 'More reliable live prices, no browser needed.')}</p></div>
              <a className="btn-primary shrink-0" href={`${SITE}/download/istithmarati.apk`}><Download className="h-4 w-4" />{L('تحميل', 'Download')}</a>
            </section>
          )}
        </>
      )}

      {/* ---------- Asset breakdowns ---------- */}
      {tab === 'profiles' && (
        <>
          <section className="card space-y-2">
            <h2 className="section-title">{L('توزيع كل أصل', 'Each asset’s breakdown')}</h2>
            <p className="hint">{L('كلود يبحث في المصادر الرسمية لكل أصل ويسجّل هنا توزيعه على الدول والقطاعات والفئات، ويحدّثه كل ربع سنة. التحليل يعتمد على هذه القائمة.', 'Claude researches each asset’s official sources and records here how it spreads across countries, sectors and classes, refreshing it every quarter. The analysis relies on this list.')}</p>
            <p className="text-sm"><span className="num font-semibold">{analysed}</span> {L('من', 'of')} <span className="num font-semibold">{data.assets.length}</span> {L('أصل محلَّل', 'assets analysed')}</p>
            {!cloudUser && <Notice tone="info" title={L('اربط حسابك ليصل كلود إلى أصولك', 'Connect your account so Claude can reach your assets')} action={<button className="btn-soft" onClick={() => setHash('account')}>{L('الحساب', 'Account')}</button>} />}
            {cloudUser && analysed < data.assets.length && <p className="hint">{L('لتحليل الأصول المنتظرة الآن: اطلب من كلود «حلّل أصولي الجديدة».', 'To analyse the pending assets now, ask Claude to “analyse my new assets”.')}</p>}
          </section>
          <section className="card p-0">
            <ul className="divide-y divide-line">
              {data.assets.map((a) => {
                const p = data.profiles[a.id]
                const Icon = !p ? CircleDashed : p.locked ? Lock : CircleCheck
                return (
                  <li key={a.id}>
                    <button className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-start hover:bg-surface" onClick={() => setProfileOf(a.id)}>
                      <Icon className={cx('h-5 w-5 shrink-0', !p ? 'text-ink-faint' : p.locked ? 'text-warn-600' : 'text-gain')} aria-hidden />
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{a.name}</span>
                        <span className="text-xs text-ink-soft">{!p ? L('بانتظار التحليل — تصنيف مبدئي', 'Pending — preliminary classification') : p.locked ? L('معدَّل يدويًا', 'Edited by you') : L(`حلّله كلود · بيانات ${dateLabel(p.asOf, settings.locale)}`, `Analysed by Claude · as of ${dateLabel(p.asOf, settings.locale)}`)}</span></span>
                    </button>
                  </li>
                )
              })}
              {data.assets.length === 0 && <li className="px-4 py-3 text-sm text-ink-soft">{L('لا أصول بعد.', 'No assets yet.')}</li>}
            </ul>
          </section>
        </>
      )}

      {/* ---------- Settings ---------- */}
      {tab === 'settings' && (
        <>
          <section className="card space-y-4">
            <h2 className="section-title">{L('المظهر واللغة', 'Appearance & language')}</h2>
            <Field group label={L('المظهر', 'Theme')}><Chips wrap value={settings.theme} onChange={(theme) => updateSettings({ theme })} options={[{ value: 'system', label: L('حسب الجوال', 'System') }, { value: 'light', label: L('فاتح', 'Light') }, { value: 'dark', label: L('داكن', 'Dark') }]} /></Field>
            <Field group label={L('اللغة', 'Language')}><Chips wrap value={settings.locale} onChange={(locale) => updateSettings({ locale })} options={[{ value: 'ar', label: 'العربية' }, { value: 'en', label: 'English' }]} /></Field>
          </section>
          <section className="card space-y-4">
            <h2 className="section-title">{L('الحسابات', 'Calculations')}</h2>
            <Field label={L('سعر الدولار بالريال', 'USD rate in SAR')} hint={L('الربط الرسمي 3.75.', 'The official peg is 3.75.')}><NumberInput value={settings.fx.USD ?? 3.75} onChange={(USD) => updateSettings({ fx: { ...settings.fx, USD: USD || 3.75 } })} /></Field>
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-accent focus:ring-accent" checked={settings.shariahFirst} onChange={(e) => updateSettings({ shariahFirst: e.target.checked })} /><span className="text-sm">{L('اعرض الصناديق المتوافقة شرعيًا أولاً عند الإضافة', 'List Shariah-compliant funds first when adding')}</span></label>
            <div>
              <p className="label">{L('تقدير الصناديق العالمية غير المحلَّلة', 'Estimate for un-analysed global funds')}</p>
              <div className="grid grid-cols-3 gap-3">
                {(['US', 'DEV', 'EM'] as const).map((k) => (
                  <Field key={k} label={{ US: L('أمريكا', 'US'), DEV: L('متقدمة', 'Developed'), EM: L('ناشئة', 'Emerging') }[k]}><NumberInput value={settings.lookThrough[k]} onChange={(n) => updateSettings({ lookThrough: { ...settings.lookThrough, [k]: n } })} suffix="%" /></Field>
                ))}
              </div>
              <p className="hint mt-1">{L('تُستخدم فقط إلى أن يُحلَّل الصندوق في «توزيعات الأصول».', 'Used only until the fund is analysed under Asset breakdowns.')}</p>
            </div>
          </section>
          <section className="card space-y-3">
            <h2 className="section-title">{L('النسخ الاحتياطي', 'Backup')}</h2>
            <p className="hint">{cloudUser ? L('محفظتك تُحفظ في مخزنك السحابي تلقائيًا. الملف نسخة إضافية تحتفظ بها أنت.', 'Your portfolio is saved to your cloud store automatically. The file is an extra copy you keep.') : L('بياناتك على هذا الجهاز فقط. مسح بيانات المتصفح أو التطبيق يحذفها — خذ نسخة احتياطية أو اربط حسابك.', 'Your data is on this device only. Clearing browser or app data deletes it — take a backup or connect your account.')}</p>
            <button className="btn-ghost w-full" onClick={download}><Download className="h-4 w-4" />{L('تنزيل نسخة احتياطية', 'Download backup')}</button>
            <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />{L('استعادة من ملف (يستبدل البيانات الحالية)', 'Restore from file (replaces current data)')}</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onFile} />
            <button className="btn-danger w-full" onClick={() => setConfirmReset(true)}><Trash2 className="h-4 w-4" />{L('حذف كل البيانات من هذا الجهاز', 'Delete all data from this device')}</button>
          </section>
          <Disclaimer>{L('الأسعار من Yahoo Finance: داخل تطبيق أندرويد تُجلب مباشرة، وفي المتصفح عبر وسطاء مجانيين قد يتعذرون فيُعرض آخر سعر محفوظ. التطبيق أداة تنظيم وتثقيف وليس مستشارًا ماليًا مرخصًا. الإصدار 6.0', 'Prices come from Yahoo Finance: fetched directly inside the Android app, and through free relays in the browser, which can fail — the last saved price is shown then. The app is an organising and educational tool, not a licensed financial adviser. Version 6.0')}</Disclaimer>
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
                    <span className="text-sm font-semibold">{c.title}</span>
                    <ChevronDown className={cx('h-5 w-5 shrink-0 text-ink-faint transition-transform duration-300', open && 'rotate-180')} aria-hidden />
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
            <p className="hint mt-1">{L('رابط للقراءة فقط يحمل لقطة من توزيع محفظتك الاستثمارية كما هي الآن. البيانات داخل الرابط نفسه؛ من يملك الرابط يرى اللقطة.', 'A read-only link carrying a snapshot of your investable allocation as it is now. The data lives inside the link itself; anyone with the link sees the snapshot.')}</p>
          </div>
          {investRows.length === 0 ? <p className="hint">{L('أضف أصولًا أولاً.', 'Add assets first.')}</p> : (
            <>
              <Field label={L('اسم يظهر للمستلم (اختياري)', 'Name shown to the recipient (optional)')}><input className="input" value={shareName} maxLength={40} onChange={(e) => setShareName(e.target.value)} placeholder={L('مثال: محفظة خالد', 'e.g. Khalid’s portfolio')} /></Field>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-accent focus:ring-accent" checked={withAmounts} onChange={(e) => setWithAmounts(e.target.checked)} /><span className="text-sm">{L('أظهر المبلغ الإجمالي', 'Show the total amount')}<span className="hint block">{L('الافتراضي: نِسب فقط بدون أي مبالغ.', 'Default: percentages only, no amounts.')}</span></span></label>
              <label className="flex items-start gap-3"><input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-accent focus:ring-accent" checked={withNames} onChange={(e) => setWithNames(e.target.checked)} /><span className="text-sm">{L('أظهر أسماء أكبر الأصول', 'Show the names of the largest holdings')}</span></label>
              <input className="input num text-xs" dir="ltr" readOnly value={shareUrl} onFocus={(e) => e.target.select()} aria-label={L('رابط المشاركة', 'Share link')} />
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-primary" onClick={() => copy(shareUrl)}><Copy className="h-4 w-4" />{L('نسخ الرابط', 'Copy link')}</button>
                {typeof navigator !== 'undefined' && 'share' in navigator
                  ? <button className="btn-ghost" onClick={nativeShare}><Share2 className="h-4 w-4" />{L('مشاركة', 'Share')}</button>
                  : <a className="btn-ghost" href={shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{L('معاينة', 'Preview')}</a>}
              </div>
            </>
          )}
        </section>
      )}

      <ProfileSheet assetId={profileOf} onClose={() => setProfileOf(null)} />
      <Confirm open={confirmReset} onClose={() => setConfirmReset(false)} title={L('حذف كل البيانات؟', 'Delete all data?')}
        body={L('ستُحذف كل الأصول والعمليات والإعدادات واللقطات من هذا الجهاز. النسخة السحابية لا تُمس: إن كان حسابك مرتبطًا فستعود عند المزامنة القادمة، فاخرج من الحساب أولاً إن أردت البدء من جهاز فارغ.', 'All assets, transactions, settings and snapshots will be deleted from this device. The cloud copy is not touched: if your account is connected it comes back on the next sync, so sign out first if you want to start from an empty device.')}
        confirmLabel={L('حذف الكل', 'Delete everything')} onConfirm={resetData} />
    </>
  )
}
