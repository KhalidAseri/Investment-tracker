'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { AssetClass, AssetProfile } from '@/lib/types'
import { ASSET_CLASSES, CLASS_COLOR, CLASS_LABEL, SECTORS } from '@/lib/labels'
import world from '@/lib/world-paths.json'
import { dateLabel, pct } from '@/lib/format'
import { BarList, countryName } from './charts'
import { Disclaimer, NumberInput, Sheet } from './ui'

type Weights = Record<string, number>
const toItems = (w: Weights | undefined, label: (k: string) => string, color?: (k: string) => string | undefined) =>
  Object.entries(w ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: label(k), value: 0, pct: v, color: color?.(k) }))

/** Rows of "what / how much" for one weight map. */
function WeightEditor({ title, weights, onChange, options }: { title: string; weights: Weights; onChange: (w: Weights) => void; options: { value: string; label: string }[] }) {
  const { L } = useStore()
  const rows = Object.entries(weights)
  const sum = rows.reduce((s, [, v]) => s + (v || 0), 0)
  const unused = options.filter((o) => !(o.value in weights))
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between"><p className="text-sm font-semibold">{title}</p><span className={`num text-xs ${Math.abs(sum - 100) < 0.6 || rows.length === 0 ? 'text-ink-soft' : 'text-warn-600'}`}>{L('المجموع', 'Total')} {pct(sum, 0)}</span></div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-2">
          <select className="input flex-1 py-2 text-sm" value={k} aria-label={title} onChange={(e) => { const { [k]: old, ...rest } = weights; onChange({ ...rest, [e.target.value]: old }) }}>
            {options.filter((o) => o.value === k || !(o.value in weights)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <div className="w-24"><NumberInput value={v} onChange={(n) => onChange({ ...weights, [k]: n })} suffix="%" /></div>
          <button className="flex h-11 w-9 items-center justify-center text-ink-faint hover:text-loss" aria-label={L('حذف', 'Remove')} onClick={() => { const { [k]: _gone, ...rest } = weights; onChange(rest) }}><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      {unused.length > 0 && <button className="flex min-h-[36px] items-center gap-1 text-sm font-semibold text-link" onClick={() => onChange({ ...weights, [unused[0].value]: Math.max(0, 100 - sum) })}><Plus className="h-4 w-4" />{L('إضافة', 'Add')}</button>}
    </div>
  )
}

/** One asset's look-through: what Claude recorded, with its sources, and a manual override. */
export default function ProfileSheet({ assetId, onClose }: { assetId: string | null; onClose: () => void }) {
  const { L, data, settings, setProfile } = useStore()
  const asset = data.assets.find((a) => a.id === assetId)
  const profile = assetId ? data.profiles[assetId] : undefined
  const [edit, setEdit] = useState<AssetProfile | null>(null)
  useEffect(() => { setEdit(null) }, [assetId])
  if (!asset) return null

  const sectorLabel = (k: string) => { const s = SECTORS[k] ?? SECTORS.OTHER; return L(s.ar, s.en) }
  const classLabel = (k: string) => { const c = CLASS_LABEL[k as AssetClass]; return c ? L(c.ar, c.en) : k }
  const cName = (k: string) => (k === 'OTHER' ? L('دول أخرى', 'Other countries') : countryName(k, settings.locale))
  const countryOptions = [...world.countries.map((c) => ({ value: c.id, label: settings.locale === 'ar' ? c.ar : c.en })).sort((a, b) => a.label.localeCompare(b.label, settings.locale)), { value: 'OTHER', label: L('دول أخرى', 'Other countries') }]

  const startEdit = () => setEdit({
    confidence: 'estimated', classSplit: { [asset.assetClass]: 100 }, countries: {}, sectors: {},
    ...profile, assetId: asset.id, source: 'user', locked: true, asOf: profile?.asOf ?? '', updatedAt: new Date().toISOString(),
  })
  const save = async () => {
    if (!edit) return
    await setProfile(asset.id, { ...edit, updatedAt: new Date().toISOString() })
    setEdit(null)
  }

  return (
    <Sheet open onClose={() => (edit ? setEdit(null) : onClose())} title={edit ? L(`تعديل توزيع: ${asset.name}`, `Edit breakdown: ${asset.name}`) : asset.name} footer={
      edit ? (
        <div className="flex gap-2"><button className="btn-primary flex-1" onClick={save}>{L('حفظ التعديل', 'Save')}</button><button className="btn-ghost flex-1" onClick={() => setEdit(null)}>{L('إلغاء', 'Cancel')}</button></div>
      ) : (
        <div className="flex gap-2">
          <button className="btn-soft flex-1" onClick={startEdit}>{L('تعديل يدوي', 'Edit by hand')}</button>
          {profile?.locked && <button className="btn-ghost" onClick={() => setProfile(asset.id, null)}>{L('احذف تعديلي', 'Remove my edit')}</button>}
        </div>
      )
    }>
      {edit ? (
        <div className="space-y-5">
          <WeightEditor title={L('تقسيم الفئات', 'Asset-class split')} weights={(edit.classSplit ?? {}) as Weights} onChange={(w) => setEdit({ ...edit, classSplit: w as AssetProfile['classSplit'] })} options={ASSET_CLASSES.map((c) => ({ value: c, label: classLabel(c) }))} />
          <WeightEditor title={L('الدول', 'Countries')} weights={edit.countries ?? {}} onChange={(countries) => setEdit({ ...edit, countries })} options={countryOptions} />
          <WeightEditor title={L('القطاعات', 'Sectors')} weights={edit.sectors ?? {}} onChange={(sectors) => setEdit({ ...edit, sectors })} options={Object.keys(SECTORS).filter((k) => k !== 'NA').map((k) => ({ value: k, label: sectorLabel(k) }))} />
          <Disclaimer>{L('تعديلك اليدوي يُقفل هذا الأصل: التحديثات الربعية لا تكتب فوقه. الأوزان تُطبَّع تلقائيًا إن لم يكن مجموعها 100.', 'Your edit locks this asset: quarterly refreshes will not overwrite it. Weights are normalised if they do not sum to 100.')}</Disclaimer>
        </div>
      ) : !profile ? (
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-ink-soft">{L('لم يُحلَّل هذا الأصل بعد. التحليل يستخدم الآن تصنيفه المبدئي (فئة واحدة، منطقة واحدة، قطاع واحد).', 'This asset has not been analysed yet. The analysis currently uses its preliminary classification (one class, one region, one sector).')}</p>
          <p className="text-sm leading-relaxed text-ink-soft">{L('اطلب من كلود تحليله في أي وقت، أو انتظر التحديث الربعي، أو أدخل توزيعه يدويًا.', 'Ask Claude to analyse it at any time, wait for the quarterly refresh, or enter its breakdown by hand.')}</p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-tint px-2.5 py-1 font-semibold text-link">{profile.locked ? L('معدَّل يدويًا', 'Edited by you') : L('حلّله كلود', 'Analysed by Claude')}</span>
            <span className="rounded-full bg-surface px-2.5 py-1 font-medium text-ink-soft">{profile.confidence === 'reported' ? L('من نشرة المُصدر', 'From the issuer') : L('مقدَّر من المؤشر', 'Estimated from benchmark')}</span>
            {profile.asOf && <span className="rounded-full bg-surface px-2.5 py-1 font-medium text-ink-soft">{L('بيانات', 'As of')} {dateLabel(profile.asOf, settings.locale)}</span>}
          </div>
          {profile.benchmark && <p className="text-sm text-ink-soft">{L('المؤشر المتبوع', 'Benchmark')}: <span className="font-medium text-ink">{profile.benchmark}</span>{profile.domicile && <> · {L('المقر', 'Domicile')}: <span className="font-medium text-ink">{profile.domicile}</span></>}</p>}
          {profile.note && <p className="text-sm leading-relaxed text-ink-soft">{profile.note}</p>}
          {Object.keys(profile.classSplit ?? {}).length > 0 && <section><h3 className="mb-2 text-sm font-semibold">{L('تقسيم الفئات', 'Asset-class split')}</h3><BarList showAmounts={false} items={toItems(profile.classSplit as Weights, classLabel, (k) => CLASS_COLOR[k as AssetClass])} /></section>}
          {Object.keys(profile.countries ?? {}).length > 0 && <section><h3 className="mb-2 text-sm font-semibold">{L('الدول', 'Countries')}</h3><BarList showAmounts={false} items={toItems(profile.countries, cName)} /></section>}
          {Object.keys(profile.sectors ?? {}).length > 0 && <section><h3 className="mb-2 text-sm font-semibold">{L('القطاعات', 'Sectors')}</h3><BarList showAmounts={false} items={toItems(profile.sectors, sectorLabel)} /></section>}
          {Object.keys(profile.industries ?? {}).length > 0 && <section><h3 className="mb-2 text-sm font-semibold">{L('الصناعات', 'Industries')}</h3><BarList showAmounts={false} items={toItems(profile.industries, (k) => k)} /></section>}
          {(profile.topHoldings?.length ?? 0) > 0 && (
            <section><h3 className="mb-2 text-sm font-semibold">{L('أكبر المكونات', 'Top holdings')}</h3>
              <ul className="divide-y divide-line rounded-2xl border border-line">{profile.topHoldings!.map((h) => <li key={h.name} className="flex justify-between gap-3 px-4 py-2 text-sm"><span className="min-w-0 truncate">{h.name}</span><span className="num font-medium">{pct(h.weight)}</span></li>)}</ul>
            </section>
          )}
          {(profile.sources?.length ?? 0) > 0 && (
            <section><h3 className="mb-2 text-sm font-semibold">{L('المصادر', 'Sources')}</h3>
              <ul className="space-y-1.5">{profile.sources!.map((s) => <li key={s.url}><a className="inline-flex items-center gap-1.5 text-sm font-medium text-link" href={s.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{s.title}</a></li>)}</ul>
            </section>
          )}
        </div>
      )}
    </Sheet>
  )
}
