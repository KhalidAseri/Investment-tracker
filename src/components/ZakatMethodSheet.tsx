// How zakat is worked out for one holding: the guide's text for its class, the default and the accepted alternatives as
// choices (with the zakatable share for «الجزء الزكوي»), the sources, and the amount at today's value. Saves
// holding.zakat_method / zakat_ratio (null = follow the default).
import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { usePlan } from '../lib/usePlan'
import { ZAKAT_RATE, holdingValue, zakatRuleOf } from '../lib/calc'
import { ASSET_CLASS_LABEL, ZAKAT_GUIDE, ZAKAT_METHOD_LABEL, type ZakatMethod } from '../lib/catalog'
import { holdingClass, holdingContext } from '../lib/lookthrough'
import { haptic } from '../lib/ui'
import type { Holding } from '../lib/types'
import { NumberField, Sheet } from './ui'
import { Money } from './kit'
import { IconLink } from './icons'
import './Insights.css'

interface Option { key: string; method: ZakatMethod; ratio: number | null; text: string; tag?: string }
const keyOf = (m: ZakatMethod, r: number | null) => (m === 'zakatable_assets' ? `${m}:${r ?? ''}` : m)
const CHECK_RE = /\s*للتأكد راجع جهة شرعية موثوقة\.?/g
const factorOf = (m: ZakatMethod, r: number | null) => (m === 'market' ? 1 : m === 'zakatable_assets' ? Math.min(100, Math.max(0, r ?? 100)) / 100 : 0)

/** Short label of a holding's method, e.g. «على الجزء الزكوي (25%)». */
export function zakatMethodText(method: ZakatMethod, ratio: number | null): string {
  if (method === 'zakatable_assets') return ratio != null ? `على الجزء الزكوي (\u2066${+ratio.toFixed(1)}%\u2069)` : 'على الجزء الزكوي من القيمة'
  return ZAKAT_METHOD_LABEL[method]
}

export function ZakatMethodSheet({ holding, onClose }: { holding: Holding; onClose: () => void }) {
  const { fx, upsert, notify, readOnly, sleeves, goals } = useStore()
  const { ctx, doc } = usePlan()
  const opts = ctx?.zakat ?? {}
  const h = holding
  const value = Math.max(0, holdingValue(h, fx))

  const { options, current, cls, guideText, sources } = useMemo(() => {
    const rule = zakatRuleOf(h, opts)
    const base = zakatRuleOf({ ...h, zakat_method: null, zakat_ratio: null, zakatable: true }, opts)
    const c = rule.cls ?? holdingClass(h, holdingContext({ doc, sleeves, goals }))
    const g = ZAKAT_GUIDE[c]
    const list: Option[] = []
    const push = (o: Option) => { if (!list.some((x) => x.key === o.key)) list.push(o) }
    push({ key: 'default', method: base.method, ratio: base.ratio, text: base.source === 'instrument' ? 'كما تحدده بيانات الأداة.' : 'الرأي الشائع للمستثمر طويل الأجل في هذه الفئة.', tag: 'الافتراضي' })
    if (g && keyOf(g.method, g.ratio) !== keyOf(base.method, base.ratio)) push({ key: keyOf(g.method, g.ratio), method: g.method, ratio: g.ratio, text: 'الرأي الشائع لهذه الفئة في دليل الزكاة.' })
    for (const a of g?.alternatives ?? []) {
      const k = keyOf(a.method, a.ratio)
      if (k === keyOf(base.method, base.ratio)) continue
      push({ key: k, method: a.method, ratio: a.ratio, text: a.text })
    }
    if (base.method !== 'exempt') push({ key: 'exempt', method: 'exempt', ratio: null, text: 'لا يدخل في حساب زكاتك هنا (مال للاستعمال الشخصي، أو تحسبه بطريقتك).' })
    // the holding's own choice
    let cur = 'default'
    if (rule.source === 'choice' || (rule.source === 'holding' && rule.method === 'exempt')) cur = 'exempt'
    else if (rule.source === 'holding') {
      const same = (o: Option) => o.method === rule.method && (o.method !== 'zakatable_assets' || o.ratio === rule.ratio)
      const hit = list.find(same) ?? list.find((o) => o.method === rule.method)
      if (hit) cur = hit.key
    }
    return { options: list, current: cur, cls: c, guideText: (g?.text ?? '').replace(CHECK_RE, '').trim(), sources: g?.sources ?? [] }
  }, [h, opts, doc, sleeves, goals])

  const [sel, setSel] = useState(current)
  const chosen = options.find((o) => o.key === sel) ?? options[0]
  const [ratio, setRatio] = useState<number | null>(() => (h.zakat_method === 'zakatable_assets' ? h.zakat_ratio ?? null : null) ?? chosen?.ratio ?? null)
  const [busy, setBusy] = useState(false)
  const r = chosen?.method === 'zakatable_assets' ? ratio ?? chosen.ratio : null
  const amount = chosen ? (value * factorOf(chosen.method, r) * ZAKAT_RATE) / 100 : 0

  const pick = (o: Option) => {
    haptic()
    setSel(o.key)
    if (o.method === 'zakatable_assets') setRatio(o.ratio ?? ratio ?? 25)
  }
  const save = async () => {
    if (!chosen) return
    setBusy(true)
    const row: Partial<Holding> = chosen.key === 'default'
      ? { id: h.id, zakat_method: null, zakat_ratio: null, zakatable: true }
      : { id: h.id, zakat_method: chosen.method, zakat_ratio: chosen.method === 'zakatable_assets' ? r : null, zakatable: chosen.method !== 'exempt' }
    const ok = await upsert<Partial<Holding>>('holdings', row)
    setBusy(false)
    if (ok) { notify('حُفظت طريقة الزكاة'); onClose() }
  }

  return (
    <Sheet title="طريقة حساب الزكاة" onClose={onClose}
      footer={readOnly ? undefined : <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'جارٍ الحفظ…' : 'احفظ'}</button>}>
      <div className="stack zms">
        <div className="zms-head">
          <b>{h.name}</b>
          <span className="chip">{ASSET_CLASS_LABEL[cls]}</span>
        </div>
        {guideText && <p className="zms-guide">{guideText}</p>}

        <div className="zms-opts" role="radiogroup" aria-label="طريقة الحساب">
          {options.map((o) => (
            <label key={o.key} className={`zms-opt ${sel === o.key ? 'on' : ''}`}>
              <input type="radio" name="zakat-method" checked={sel === o.key} disabled={readOnly} onChange={() => pick(o)} />
              <span className="zms-txt">
                <b>{zakatMethodText(o.method, o.method === 'zakatable_assets' ? o.ratio : null)}{o.tag && <em className="chip accent">{o.tag}</em>}</b>
                <span>{o.text}</span>
              </span>
            </label>
          ))}
        </div>

        {chosen?.method === 'zakatable_assets' && !readOnly && (
          <NumberField label="الجزء الزكوي من القيمة" value={r} suffix="%" decimals={1} min={0} max={100} onChange={(v) => setRatio(v)}
            hint="من إفصاح الصندوق أو قوائم الشركة؛ ويُقدَّر بالربع (25%) عند تعذّر حسابه." />
        )}

        <div className="zms-amt" aria-live="polite">
          <span>زكاته بقيمة اليوم</span>
          <b><Money v={amount} /></b>
          {chosen?.method === 'income_only' && <small>تُضم التوزيعات المقبوضة إلى نقدك وتُزكّى معه.</small>}
          {chosen?.method === 'paid_by_entity' && <small>تدفعها الشركة أو الجهة نيابةً عنك.</small>}
        </div>

        {sources.length > 0 && (
          <details className="more">
            <summary>المصادر<span className="sum-sub">{sources.length}</span></summary>
            <div className="more-body zms-src">
              {sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noreferrer noopener"><IconLink />{s.title}</a>
              ))}
            </div>
          </details>
        )}
        <p className="zms-check">للتأكد راجع جهة شرعية موثوقة.</p>
      </div>
    </Sheet>
  )
}
