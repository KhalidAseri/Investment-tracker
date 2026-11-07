import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { sleeveColors, useDerived } from '../lib/derived'
import { LAYER_NAMES, LAYER_ORDER, currentTarget } from '../lib/calc'
import { pct } from '../lib/format'
import type { Layer, Sleeve } from '../lib/types'
import { MixBar } from '../components/charts'
import { NumberField, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus } from '../components/icons'

export default function Plan() {
  const { settings, sleeves, updateSettings, readOnly } = useStore()
  const d = useDerived()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
  const [editing, setEditing] = useState<Partial<Sleeve> | null>(null)
  if (!settings || !d) return null
  const s = settings
  const sumNow = d.targetSum.now
  const sumFi = d.targetSum.fi
  const parts = (key: 'target_now' | 'target_fi') => sleeves.map((x) => ({ key: x.id, value: Number(x[key]), color: colors[x.id]?.color, opacity: colors[x.id]?.opacity ?? 1, label: x.name }))
  const okSum = (v: number) => Math.abs(v - 100) < 0.05

  return (
    <>
      <p className="muted" style={{ marginBottom: 6 }}>الأوزان هنا هي ما تقيس عليه المحفظة، وما يقسّم به مخطط الإيداع. تنتقل الأوزان تدريجياً من «الآن» إلى «عند الاستقلال» بين {s.glide_start_year} و{s.independence_year}.</p>

      <section className="section">
        <div className="section-head"><h2>الأوزان المستهدفة</h2>
          {!readOnly && <button className="btn primary small" onClick={() => setEditing({ name: '', layer: 'growth', target_now: 0, target_fi: 0, accepts_new_money: true, zakat_rate: 2.5, sort: sleeves.length + 1 })}><IconPlus /> طبقة جديدة</button>}
        </div>
        <div className="panel">
          <div className="stack" style={{ gap: 8 }}>
            <div className="row between small"><span>الآن</span><span className={okSum(sumNow) ? 'good' : 'bad'}>المجموع {pct(sumNow)}</span></div>
            <MixBar parts={parts('target_now')} />
            <div className="row between small" style={{ marginTop: 6 }}><span>عند الاستقلال ({s.independence_year})</span><span className={okSum(sumFi) ? 'good' : 'bad'}>المجموع {pct(sumFi)}</span></div>
            <MixBar parts={parts('target_fi')} />
          </div>
          <div className="table-wrap"><table className="table" style={{ marginTop: 16 }}>
            <thead><tr><th>الطبقة</th><th className="n">الآن</th><th className="n">هذا العام</th><th className="n">عند الاستقلال</th></tr></thead>
            <tbody>
              {LAYER_ORDER.flatMap((layer) => sleeves.filter((x) => x.layer === layer)).map((x) => (
                <tr key={x.id} style={{ cursor: readOnly ? 'default' : 'pointer' }} onClick={() => !readOnly && setEditing(x)} tabIndex={readOnly ? undefined : 0} onKeyDown={(e) => !readOnly && e.key === 'Enter' && setEditing(x)}>
                  <td>
                    <div className="row" style={{ gap: 8 }}><span className="dot" style={{ background: colors[x.id]?.color, opacity: colors[x.id]?.opacity }} />
                      <span>{x.name}</span></div>
                    <div className="tiny muted" style={{ marginInlineStart: 18 }}>{LAYER_NAMES[x.layer]}{!x.accepts_new_money ? '، مغلقة للإيداع' : ''}</div>
                  </td>
                  <td className="n">{pct(x.target_now)}</td>
                  <td className="n">{pct(currentTarget(x, s))}</td>
                  <td className="n">{pct(x.target_fi)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {(!okSum(sumNow) || !okSum(sumFi)) && <p className="small bad" style={{ marginTop: 10 }}>اجعل مجموع كل عمود 100% حتى تكون المقارنة دقيقة.</p>}
        </div>
      </section>

      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <section className="section">
        <div className="section-head"><h2>مسار الانتقال</h2></div>
        <div className="panel grid2">
          <NumberField plain label="بداية الانتقال للدخل" value={s.glide_start_year} min={2026} max={s.independence_year} onChange={(v) => updateSettings({ glide_start_year: Math.round(v) })} />
          <NumberField plain label="سنة الاستقلال المستهدفة" value={s.independence_year} min={2027} max={2060} onChange={(v) => updateSettings({ independence_year: Math.round(v) })} />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>قواعد المتابعة</h2></div>
        <div className="panel stack">
          <div className="grid2">
            <NumberField label="حد الانحراف قبل التنبيه" value={s.rebalance_band} suffix="نقطة" decimals={1} onChange={(v) => updateSettings({ rebalance_band: v })} />
            <NumberField plain label="سنة الميلاد" value={s.birth_year} onChange={(v) => updateSettings({ birth_year: Math.round(v) })} />
            <NumberField label="قسط التمويل العقاري" value={s.mortgage_monthly} suffix="ريال" onChange={(v) => updateSettings({ mortgage_monthly: v })} />
            <NumberField plain label="آخر سنة للقسط" value={s.mortgage_end_year} onChange={(v) => updateSettings({ mortgage_end_year: Math.round(v) })} />
          </div>
          <p className="small muted">نسبة السحب والاحتياطي وقواعد الحماية في صفحة <a href="#/income">«الدخل الشهري»</a>.</p>
        </div>
      </section>
      </fieldset>

      {editing && <SleeveSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function SleeveSheet({ initial, onClose }: { initial: Partial<Sleeve>; onClose: () => void }) {
  const { upsert, remove, notify, holdings } = useStore()
  const [x, setX] = useState<Partial<Sleeve>>(initial)
  const set = (p: Partial<Sleeve>) => setX((v) => ({ ...v, ...p }))
  const used = holdings.filter((h) => h.sleeve_id === x.id).length
  const saveIt = async () => {
    if (!x.name?.trim()) { notify('اكتب اسم الطبقة'); return }
    const ok = await upsert('sleeves', {
      id: x.id, name: x.name.trim(), layer: x.layer ?? 'growth', target_now: Number(x.target_now ?? 0), target_fi: Number(x.target_fi ?? 0),
      accepts_new_money: !!x.accepts_new_money, expected_return: x.expected_return ?? null, yield_pct: x.yield_pct ?? null,
      zakat_rate: Number(x.zakat_rate ?? 2.5), note: x.note ?? null, sort: x.sort ?? 99,
    })
    if (ok) { notify('حُفظت الطبقة'); onClose() }
  }
  return (
    <Sheet title={x.id ? 'تعديل طبقة' : 'طبقة جديدة'} onClose={onClose} footer={<>
      {x.id && <button className="btn danger" onClick={async () => {
        if (confirm(used ? `في هذه الطبقة ${used} أصل سيصبح بلا طبقة. حذفها؟` : 'حذف هذه الطبقة؟')) { await remove('sleeves', x.id!); onClose() }
      }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="الاسم" value={x.name ?? ''} onChange={(v) => set({ name: v })} placeholder="مثال: صكوك حكومية سعودية" />
        <SelectField<Layer> label="المجموعة" value={(x.layer ?? 'growth') as Layer} onChange={(v) => set({ layer: v })}
          options={LAYER_ORDER.map((l) => ({ value: l, label: LAYER_NAMES[l] }))} />
        <div className="grid2">
          <NumberField label="الوزن الآن" value={x.target_now ?? 0} suffix="%" decimals={1} onChange={(v) => set({ target_now: v })} />
          <NumberField label="الوزن عند الاستقلال" value={x.target_fi ?? 0} suffix="%" decimals={1} onChange={(v) => set({ target_fi: v })} />
          <NumberField label="العائد المتوقع" value={x.expected_return ?? 0} suffix="%" decimals={1} onChange={(v) => set({ expected_return: v })} />
        </div>
        <Switch label="تقبل الإيداع الجديد" hint="إن أُغلقت يتجاهلها مخطط الإيداع" checked={!!x.accepts_new_money} onChange={(v) => set({ accepts_new_money: v })} />
        <TextField label="الأداة المقترحة أو ملاحظة" value={x.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}
