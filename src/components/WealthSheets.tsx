import { useState } from 'react'
import { useStore } from '../lib/store'
import { obligationsCache } from '../lib/profile'
import { dateLong, sar, todayISO } from '../lib/format'
import { ASSET_KIND_LABEL, DEBT_LABEL, debtView, otherAssetValue } from '../lib/wealth'
import type { DebtKind, Obligation, OtherAsset, OtherAssetKind } from '../lib/types'
import { NumberField, SelectField, Sheet, Switch, TextField } from './ui'

const monthsText = (n: number) => {
  const y = Math.floor(n / 12), m = n % 12
  const ys = y === 0 ? '' : y === 1 ? 'سنة' : y === 2 ? 'سنتين' : y <= 10 ? `${y} سنوات` : `${y} سنة`
  const ms = m === 0 ? '' : m === 1 ? 'شهر' : m === 2 ? 'شهرين' : m <= 10 ? `${m} أشهر` : `${m} شهراً`
  return [ys, ms].filter(Boolean).join(' و') || 'أقل من شهر'
}
export { monthsText }

/** A debt or a recurring commitment: instalment, end year, and (optionally) what is still owed. */
export function ObligationSheet({ initial, onClose }: { initial: Partial<Obligation>; onClose: () => void }) {
  const { upsert, remove, notify, obligations, updateSettings } = useStore()
  const [x, setX] = useState<Partial<Obligation>>({ kind: 'other', ...initial })
  const [hasBalance, setHasBalance] = useState(initial.balance != null)
  const set = (p: Partial<Obligation>) => setX((v) => ({ ...v, ...p }))
  const syncCache = (list: Obligation[]) => updateSettings(obligationsCache(list))
  const preview = hasBalance && Number(x.balance) > 0 ? debtView({ ...(x as Obligation), balance: Number(x.balance), balance_date: x.balance_date ?? todayISO() }) : null
  const saveIt = async () => {
    if (!x.name?.trim()) { notify('اكتب اسم الالتزام'); return }
    const saved = await upsert('obligations', {
      id: x.id, name: x.name.trim(), kind: x.kind ?? 'other', monthly_amount: Number(x.monthly_amount ?? 0), end_year: x.end_year || null,
      balance: hasBalance ? Number(x.balance ?? 0) : null, balance_date: hasBalance ? x.balance_date || todayISO() : null,
      rate_pct: hasBalance ? x.rate_pct || null : null, note: x.note || null, sort: x.sort ?? 99,
    })
    if (saved) {
      syncCache([...obligations.filter((o) => o.id !== saved.id), saved as Obligation])
      notify('حُفظ')
      onClose()
    }
  }
  return (
    <Sheet title={x.id ? 'تعديل التزام' : 'دين أو التزام'} onClose={onClose} footer={<>
      {x.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا الالتزام؟')) { await remove('obligations', x.id!); syncCache(obligations.filter((o) => o.id !== x.id)); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <div className="grid2">
          <TextField label="الاسم" value={x.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: تمويل عقاري" />
          <SelectField label="النوع" value={x.kind ?? 'other'} onChange={(v) => set({ kind: v as DebtKind })}
            options={(Object.keys(DEBT_LABEL) as DebtKind[]).map((k) => ({ value: k, label: DEBT_LABEL[k] }))} />
        </div>
        <div className="grid2">
          <NumberField label="القسط الشهري" value={x.monthly_amount ?? 0} suffix="ريال" onChange={(v) => set({ monthly_amount: v })} />
          <NumberField plain label="ينتهي سنة" value={x.end_year ?? null} onChange={(v) => set({ end_year: Math.round(v) || null })} hint={preview?.payoffDate ? `بالحساب: ${dateLong(preview.payoffDate)}` : undefined} />
        </div>
        <Switch label="أعرف المبلغ المتبقي" hint="يدخل في صافي ثروتك، ويتناقص كل شهر بالقسط" checked={hasBalance} onChange={setHasBalance} />
        {hasBalance && (
          <div className="panel inset stack" style={{ gap: 10 }}>
            <div className="grid2">
              <NumberField label="المتبقي عليك" value={x.balance ?? null} suffix="ريال" onChange={(v) => set({ balance: v })} />
              <label className="field"><span>كما في تاريخ</span>
                <input className="input" type="date" value={x.balance_date ?? todayISO()} onChange={(e) => set({ balance_date: e.target.value || null })} />
              </label>
            </div>
            <NumberField label="نسبة الربح السنوية" value={x.rate_pct ?? null} suffix="%" decimals={2} onChange={(v) => set({ rate_pct: v || null })}
              hint="اتركها فارغة إن كانت السلفة بلا أرباح أو كان المتبقي يشمل الأرباح" />
            {preview && (
              <p className="small">
                {preview.months == null
                  ? 'القسط لا يغطي الأرباح الشهرية؛ راجع الأرقام.'
                  : <>ينتهي بعد <b>{monthsText(preview.months)}</b>{preview.interestLeft ? <>، وتدفع أرباحاً متبقية نحو <b className="figure">{sar(preview.interestLeft)}</b></> : null}.</>}
              </p>
            )}
          </div>
        )}
        <TextField label="ملاحظة" value={x.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}

/** Real estate, land, a car or a business: anything owned that is not a market investment. */
export function OtherAssetSheet({ initial, onClose }: { initial: Partial<OtherAsset>; onClose: () => void }) {
  const { upsert, remove, notify, otherAssets } = useStore()
  const [x, setX] = useState<Partial<OtherAsset>>({ kind: 'real_estate', value_date: todayISO(), ...initial })
  const set = (p: Partial<OtherAsset>) => setX((v) => ({ ...v, ...p }))
  const now = otherAssetValue({ ...(x as OtherAsset), value: Number(x.value ?? 0) })
  const saveIt = async () => {
    if (!x.name?.trim()) { notify('اكتب اسم الأصل'); return }
    const saved = await upsert('other_assets', {
      id: x.id, name: x.name.trim(), kind: x.kind ?? 'other', value: Number(x.value ?? 0), value_date: x.value_date || todayISO(),
      appreciation_pct: x.appreciation_pct ?? null, note: x.note || null, sort: x.sort ?? otherAssets.length + 1,
    })
    if (saved) { notify('حُفظ'); onClose() }
  }
  return (
    <Sheet title={x.id ? 'تعديل أصل' : 'أصل خارج المحفظة'} onClose={onClose} footer={<>
      {x.id && <button className="btn danger" onClick={async () => { if (confirm('حذف هذا الأصل؟')) { await remove('other_assets', x.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <div className="grid2">
          <TextField label="الاسم" value={x.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: البيت" />
          <SelectField label="النوع" value={x.kind ?? 'other'} onChange={(v) => set({ kind: v as OtherAssetKind })}
            options={(Object.keys(ASSET_KIND_LABEL) as OtherAssetKind[]).map((k) => ({ value: k, label: ASSET_KIND_LABEL[k] }))} />
        </div>
        <div className="grid2">
          <NumberField label="القيمة التقديرية" value={x.value ?? null} suffix="ريال" onChange={(v) => set({ value: v })} hint="سعر البيع المتوقع اليوم، لا سعر الشراء" />
          <label className="field"><span>تاريخ التقدير</span>
            <input className="input" type="date" value={x.value_date ?? todayISO()} onChange={(e) => set({ value_date: e.target.value || null })} />
          </label>
        </div>
        <NumberField label="التغير السنوي المتوقع" value={x.appreciation_pct ?? null} suffix="%" decimals={1} min={-30} max={30} onChange={(v) => set({ appreciation_pct: v || null })}
          hint={x.kind === 'vehicle' ? 'السيارة تفقد عادةً 10–15% سنوياً؛ اكتبها بالسالب' : 'اتركه فارغاً لتبقى القيمة كما أدخلتها حتى تحدّثها'} />
        {Number(x.appreciation_pct) !== 0 && x.appreciation_pct != null && Math.abs(now - Number(x.value ?? 0)) >= 1 && (
          <p className="small">قيمته اليوم بالتقدير: <b className="figure">{sar(now)}</b></p>
        )}
        <TextField label="ملاحظة" value={x.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
