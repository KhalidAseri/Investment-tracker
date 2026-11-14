'use client'

import { useMemo, useState } from 'react'
import { Briefcase, ChevronLeft, ChevronRight, Coins, Gem, Globe, Home, Landmark, Package, Search, TrendingUp } from 'lucide-react'
import { useStore, type NewAsset } from '@/lib/store'
import type { AccountKind, AssetClass, Region } from '@/lib/types'
import { ASSET_KINDS, KARATS, searchCatalog, type AssetKind, type CatalogItem } from '@/lib/catalog'
import { ASSET_CLASSES, CLASS_LABEL, KIND_LABEL, REGION_LABEL, SECTORS, ZAKAT_LABEL, DEFAULT_ZAKAT_PERCENT, defaultZakatMode } from '@/lib/labels'
import { fxRate } from '@/lib/engine/valuation'
import type { ZakatFields } from '@/lib/engine/zakat'
import { ZakatControl } from './ZakatControl'
import { emergencyStatus } from '@/lib/engine/plan'
import { TROY_OUNCE_GRAMS, GOLD_SYMBOL } from '@/lib/engine/zakat'
import { fetchQuote } from '@/lib/market-client'
import { Chips, Field, NumberInput, Sheet, cx } from './ui'

const ICONS: Record<string, React.ElementType> = { TrendingUp, Globe, Briefcase, Landmark, Gem, Home, Coins, Package }

interface Draft {
  name: string
  symbol: string
  assetClass: AssetClass
  region: Region
  sector: string
  currency: string
  isFund: boolean
  domicile: string
  bullion: boolean
  karat: number
  quantity: number
  unitCost: number
  value: number
  invested: number
  isEmergencyFund: boolean
  accountId: string
  newAccount: string
  zakat: ZakatFields
  /** Once the user picks a treatment it no longer follows the asset class. */
  zakatTouched: boolean
}

export default function AssetWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { L, data, settings, view, addAsset } = useStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [kind, setKind] = useState<AssetKind | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showClass, setShowClass] = useState(false)
  const [showZakat, setShowZakat] = useState(false)
  const [checking, setChecking] = useState(false)
  const Back = settings.locale === 'ar' ? ChevronRight : ChevronLeft
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const reset = () => { setStep(1); setKind(null); setQuery(''); setDraft(null); setShowClass(false); setShowZakat(false) }
  const close = () => { reset(); onClose() }

  const efIncomplete = settings.monthlyExpenses > 0 && !emergencyStatus(view, settings).ready

  const startDraft = (k: AssetKind, item?: CatalogItem, custom?: { symbol: string; name?: string; currency?: string }, bullion = false) => {
    const sameKind = data.accounts.find((a) => a.kind === k.accountKind)
    const zBase = { assetClass: item?.assetClass ?? k.assetClass, region: item?.region ?? k.region, isFund: bullion ? true : item?.isFund ?? k.isFund, symbol: k.pricing === 'live' ? (bullion ? GOLD_SYMBOL : item?.symbol ?? custom?.symbol ?? '') : null, pricing: k.pricing }
    setDraft({
      zakat: { zakatMode: defaultZakatMode(zBase), zakatPercent: DEFAULT_ZAKAT_PERCENT, zakatPerUnit: 0, zakatAmount: 0 },
      zakatTouched: false,
      name: item ? L(item.ar, item.en) : custom?.name ?? (bullion ? L('ذهب (سبائك)', 'Gold bullion') : ''),
      symbol: bullion ? GOLD_SYMBOL : item?.symbol ?? custom?.symbol ?? '',
      assetClass: item?.assetClass ?? k.assetClass,
      region: item?.region ?? k.region,
      sector: item?.sector ?? k.sector,
      currency: bullion ? 'SAR' : item?.currency ?? custom?.currency ?? k.currency,
      isFund: bullion ? true : item?.isFund ?? k.isFund,
      domicile: item?.domicile ?? '',
      bullion,
      karat: 24,
      quantity: 0, unitCost: 0, value: 0, invested: 0,
      isEmergencyFund: k.id === 'CASH' && efIncomplete,
      accountId: sameKind?.id ?? data.accounts[0]?.id ?? '',
      newAccount: sameKind || data.accounts[0] ? '' : L(KIND_LABEL[k.accountKind].ar, KIND_LABEL[k.accountKind].en),
    })
    setStep(3)
  }

  const pickKind = (k: AssetKind) => {
    setKind(k)
    if (k.pricing === 'manual') startDraft(k)
    else setStep(2)
  }

  const useCustomSymbol = async () => {
    if (!kind) return
    const symbol = query.trim().toUpperCase()
    if (!symbol) return
    setChecking(true)
    const q = await fetchQuote(symbol)
    setChecking(false)
    startDraft(kind, undefined, { symbol, name: q?.name ?? symbol, currency: q?.currency })
  }

  const results = useMemo(() => (kind ? searchCatalog(kind.id, query, settings.shariahFirst) : []), [kind, query, settings.shariahFirst])

  const live = !!draft && kind?.pricing === 'live'
  // Until the user picks a treatment, it follows the class chosen in the classification fields.
  const zakatShown: ZakatFields = !draft ? { zakatMode: 'FULL', zakatPercent: DEFAULT_ZAKAT_PERCENT } : draft.zakatTouched ? draft.zakat
    : { ...draft.zakat, zakatMode: defaultZakatMode({ assetClass: draft.assetClass, region: draft.region, isFund: draft.isFund, symbol: live ? draft.symbol : null, pricing: kind?.pricing ?? 'manual' }) }
  const canSave = !!draft && draft.name.trim().length > 0 && (draft.accountId || draft.newAccount.trim()) && (live ? draft.quantity > 0 : draft.value > 0)

  const save = () => {
    if (!draft || !kind) return
    const base = { assetClass: draft.assetClass, region: draft.region, isFund: draft.isFund, symbol: live ? draft.symbol : null, pricing: kind.pricing }
    const asset: NewAsset = {
      name: draft.name.trim(),
      ...base,
      sector: draft.sector,
      currency: draft.currency,
      priceFactor: draft.bullion ? draft.karat / 24 / TROY_OUNCE_GRAMS : 1,
      quantity: live ? draft.quantity : 0,
      costBasis: live ? draft.quantity * draft.unitCost : draft.invested || draft.value,
      manualValue: live ? 0 : draft.value,
      valueUpdatedAt: new Date().toISOString(),
      isEmergencyFund: draft.isEmergencyFund,
      ...(draft.zakatTouched ? draft.zakat : { ...draft.zakat, zakatMode: defaultZakatMode(base) }),
      domicile: draft.domicile,
    }
    const existing = data.accounts.find((a) => a.id === draft.accountId)
    const kindOfAccount: AccountKind = kind.accountKind
    addAsset(asset, existing && !draft.newAccount.trim() ? { id: existing.id, name: existing.name, kind: existing.kind } : { name: draft.newAccount.trim(), kind: kindOfAccount })
    close()
  }

  const title = step === 1 ? L('إضافة أصل', 'Add asset') : kind ? L(kind.ar, kind.en) : ''
  const unitLabel = draft?.bullion ? L('جرام', 'g') : undefined

  return (
    <Sheet open={open} onClose={close} title={title} footer={step === 3 ? (
      <div className="flex gap-2">
        <button className="btn-ghost" onClick={() => setStep(kind?.pricing === 'manual' ? 1 : 2)} aria-label={L('رجوع', 'Back')}><Back className="h-5 w-5" /></button>
        <button className="btn-primary flex-1" disabled={!canSave} onClick={save}>{L('حفظ الأصل', 'Save asset')}</button>
      </div>
    ) : undefined}>
      {/* Step 1 — what kind of asset */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-2.5">
          {ASSET_KINDS.map((k) => {
            const Icon = ICONS[k.icon] ?? Package
            return (
              <button key={k.id} onClick={() => pickKind(k)} className="flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-line bg-white p-3.5 text-start transition hover:border-brand-500 active:scale-[0.98]">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <span className="text-sm font-semibold leading-tight">{L(k.ar, k.en)}</span>
                <span className="text-[11px] leading-snug text-ink-soft">{L(k.hintAr, k.hintEn)}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Step 2 — pick from the catalogue or type a symbol */}
      {step === 2 && kind && (
        <div className="space-y-3">
          <button className="flex items-center gap-1 text-sm font-medium text-brand-600" onClick={() => setStep(1)}><Back className="h-4 w-4" />{L('تغيير النوع', 'Change type')}</button>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input className="input ps-9" placeholder={L('ابحث بالاسم أو الرمز', 'Search by name or symbol')} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {kind.id === 'GOLD' && !query && (
            <button onClick={() => startDraft(kind, undefined, undefined, true)} className="flex w-full items-center justify-between rounded-2xl border border-brand-500 bg-brand-50 p-3.5 text-start">
              <span>
                <span className="block text-sm font-semibold">{L('سبائك أو مشغولات بالجرام', 'Bullion or jewellery by gram')}</span>
                <span className="text-xs text-ink-soft">{L('يُسعَّر مباشرة من سعر الذهب العالمي حسب العيار', 'Priced live from the gold spot price by karat')}</span>
              </span>
              <Gem className="h-5 w-5 text-brand-600" />
            </button>
          )}
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {results.map((c) => (
              <li key={c.symbol}>
                <button onClick={() => startDraft(kind, c)} className="flex min-h-[56px] w-full items-center justify-between gap-3 bg-white px-3.5 py-2 text-start hover:bg-surface">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{L(c.ar, c.en)}</span>
                    <span className="num text-xs text-ink-soft">{c.symbol}</span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {c.shariah && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-gain">{L('متوافق شرعيًا', 'Shariah')}</span>}
                    {c.domicile === 'IE' && <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-ink-soft">{L('أيرلندي', 'Irish')}</span>}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="bg-white px-3.5 py-4 text-sm text-ink-soft">{L('غير موجود في القائمة.', 'Not in the list.')}</li>}
          </ul>
          {query.trim() && (
            <button className="btn-soft w-full" disabled={checking} onClick={useCustomSymbol}>
              {checking ? L('جاري التحقق من الرمز…', 'Checking symbol…') : L(`استخدم الرمز «${query.trim().toUpperCase()}»`, `Use symbol “${query.trim().toUpperCase()}”`)}
            </button>
          )}
          <p className="hint">{L('رموز تداول تنتهي بـ ‎.SR (مثل 2222.SR)، ولندن بـ ‎.L (مثل CSPX.L).', 'Tadawul symbols end in .SR (e.g. 2222.SR), London in .L (e.g. CSPX.L).')}</p>
        </div>
      )}

      {/* Step 3 — amounts and where it is held */}
      {step === 3 && draft && kind && (
        <div className="space-y-4">
          <Field label={L('الاسم', 'Name')}>
            <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={L('مثال: صندوق الأهلي للأسهم العالمية', 'e.g. Global equity fund')} />
          </Field>

          {live ? (
            <>
              {draft.bullion && (
                <Field group label={L('العيار', 'Karat')}>
                  <Chips wrap value={draft.karat} onChange={(karat) => set({ karat })} options={KARATS.map((k) => ({ value: k, label: String(k) }))} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label={draft.bullion ? L('الوزن', 'Weight') : L('الكمية', 'Quantity')}>
                  <NumberInput value={draft.quantity} onChange={(quantity) => set({ quantity })} suffix={unitLabel} />
                </Field>
                <Field label={draft.bullion ? L('متوسط سعر الشراء للجرام', 'Avg. cost per gram') : L('متوسط سعر الشراء', 'Average cost')}>
                  <NumberInput value={draft.unitCost} onChange={(unitCost) => set({ unitCost })} suffix={draft.currency} />
                </Field>
              </div>
              <p className="hint">{L('السعر الحالي يُجلب تلقائيًا. إن لم تعرف متوسط الشراء اتركه فارغًا وعدّله لاحقًا.', 'The current price is fetched automatically. If you do not know your average cost, leave it empty and edit later.')}</p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={L('القيمة الحالية', 'Current value')}>
                  <NumberInput value={draft.value} onChange={(value) => set({ value })} suffix={draft.currency} />
                </Field>
                <Field label={L('المبلغ المستثمَر', 'Amount invested')} hint={L('اتركه فارغًا إن كان يساوي القيمة', 'Leave empty if equal to the value')}>
                  <NumberInput value={draft.invested} onChange={(invested) => set({ invested })} suffix={draft.currency} />
                </Field>
              </div>
              <Field group label={L('العملة', 'Currency')}>
                <Chips wrap value={draft.currency} onChange={(currency) => set({ currency })} options={[{ value: 'SAR', label: L('ريال', 'SAR') }, { value: 'USD', label: L('دولار', 'USD') }]} />
              </Field>
            </>
          )}

          {(kind.id === 'CASH' || draft.isEmergencyFund) && (
            <label className="flex items-start gap-3 rounded-2xl border border-line p-3.5">
              <input type="checkbox" className="mt-0.5 h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={draft.isEmergencyFund} onChange={(e) => set({ isEmergencyFund: e.target.checked })} />
              <span>
                <span className="block text-sm font-semibold">{L('هذا جزء من صندوق الطوارئ', 'This is part of my emergency fund')}</span>
                <span className="hint">{L('يُحتسب للطوارئ ويُستثنى من تحليل الاستثمار.', 'Counted toward the emergency fund and left out of the investment analysis.')}</span>
              </span>
            </label>
          )}

          <Field group label={L('أين تحتفظ به؟', 'Where is it held?')}>
            <div className="space-y-2">
              {data.accounts.length > 0 && (
                <Chips wrap value={draft.newAccount ? '__new' : draft.accountId} onChange={(v) => (v === '__new' ? set({ newAccount: L(KIND_LABEL[kind.accountKind].ar, KIND_LABEL[kind.accountKind].en) }) : set({ accountId: v, newAccount: '' }))}
                  options={[...data.accounts.map((a) => ({ value: a.id, label: a.name })), { value: '__new', label: L('+ جهة جديدة', '+ New') }]} />
              )}
              {(draft.newAccount || data.accounts.length === 0) && (
                <input className="input" value={draft.newAccount} onChange={(e) => set({ newAccount: e.target.value })} placeholder={L('اسم المنصة أو البنك', 'Platform or bank name')} />
              )}
            </div>
          </Field>

          <div className="rounded-2xl border border-line">
            <button className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3.5 py-2 text-start" aria-expanded={showZakat} onClick={() => setShowZakat((v) => !v)}>
              <span><span className="block text-xs text-ink-soft">{L('الزكاة', 'Zakat')}</span><span className="text-sm font-semibold">{L(ZAKAT_LABEL[zakatShown.zakatMode].ar, ZAKAT_LABEL[zakatShown.zakatMode].en)}{zakatShown.zakatMode === 'PERCENT' ? ` (${zakatShown.zakatPercent}%)` : ''}</span></span>
              <span className="text-sm font-semibold text-brand-700">{showZakat ? L('إخفاء', 'Hide') : L('تغيير', 'Change')}</span>
            </button>
            {showZakat && (
              <div className="border-t border-line p-3.5">
                <ZakatControl value={zakatShown} onChange={(patch) => set({ zakat: { ...zakatShown, ...patch }, zakatTouched: true })}
                  assetValue={(live ? draft.quantity * draft.unitCost : draft.value) * fxRate(draft.currency, settings.fx)} quantity={draft.quantity} currency={draft.currency} live={live} />
              </div>
            )}
          </div>

          <button className="text-sm font-medium text-brand-600" onClick={() => setShowClass((v) => !v)} aria-expanded={showClass}>
            {showClass ? L('إخفاء التصنيف', 'Hide classification') : L('تعديل التصنيف (الفئة، الجغرافيا، القطاع)', 'Edit classification (class, region, sector)')}
          </button>
          {showClass && <ClassFields value={draft} onChange={set} />}
        </div>
      )}
    </Sheet>
  )
}

/** Shared by the wizard and the edit form: how the asset is counted on each analysis axis. */
export function ClassFields({ value, onChange }: { value: { assetClass: AssetClass; region: Region; sector: string; isFund: boolean }; onChange: (p: { assetClass?: AssetClass; region?: Region; sector?: string; isFund?: boolean }) => void }) {
  const { L } = useStore()
  return (
    <div className={cx('space-y-3 rounded-2xl bg-surface p-3.5')}>
      <Field label={L('فئة الأصل', 'Asset class')}>
        <select className="input" value={value.assetClass} onChange={(e) => onChange({ assetClass: e.target.value as AssetClass })}>
          {ASSET_CLASSES.map((c) => <option key={c} value={c}>{L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en)}</option>)}
        </select>
      </Field>
      <Field label={L('الجغرافيا', 'Geography')} hint={L('«عالمي» يُفكَّك تقريبيًا إلى أمريكا ومتقدمة وناشئة في التحليل.', '“Global” is split approximately into US, developed and emerging in the analysis.')}>
        <select className="input" value={value.region} onChange={(e) => onChange({ region: e.target.value as Region })}>
          {(Object.keys(REGION_LABEL) as Region[]).map((r) => <option key={r} value={r}>{L(REGION_LABEL[r].ar, REGION_LABEL[r].en)}</option>)}
        </select>
      </Field>
      <Field label={L('القطاع', 'Sector')}>
        <select className="input" value={value.sector} onChange={(e) => onChange({ sector: e.target.value })}>
          {Object.entries(SECTORS).map(([k, v]) => <option key={k} value={k}>{L(v.ar, v.en)}</option>)}
        </select>
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-5 w-5 rounded border-line text-brand-600 focus:ring-brand-500" checked={value.isFund} onChange={(e) => onChange({ isFund: e.target.checked })} />
        <span className="text-sm">{L('صندوق متنوع (لا يُعد تركّزًا في أصل واحد)', 'Diversified fund (not counted as single-asset concentration)')}</span>
      </label>
    </div>
  )
}
