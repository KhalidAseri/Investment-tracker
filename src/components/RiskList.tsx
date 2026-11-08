// «المخاطر»: the risks the portfolio is exposed to (high → low) and the ones it has avoided, from lib/risk.ts.
import { Fragment, type ReactNode } from 'react'
import { RISK_LEVEL_LABEL, type RiskItem, type RiskLevel } from '../lib/risk'
import { Money } from './kit'
import {
  IconAlert, IconBuilding, IconCash, IconChart, IconCheck, IconCoins, IconDoc, IconFlag, IconIncome, IconLayers, IconPie, IconScale,
  IconShield, IconSparkle, IconUp, IconWallet,
} from './icons'
import './Insights.css'

const ICON: Record<string, ReactNode> = {
  market: <IconChart />, emergency: <IconShield />, sequence: <IconIncome />, holding: <IconPie />, country: <IconFlag />,
  sector: <IconLayers />, currency: <IconCash />, rates: <IconScale />, credit: <IconDoc />, liquidity: <IconCoins />,
  inflation: <IconUp />, manager: <IconBuilding />, custody: <IconWallet />, us_estate: <IconDoc />, shariah: <IconSparkle />,
}
const LEVELS: RiskLevel[] = ['high', 'medium', 'low', 'avoided']
const COUNT: Record<RiskLevel, (n: number) => string> = {
  high: (n) => (n === 1 ? 'خطر مرتفع' : n === 2 ? 'خطران مرتفعان' : `${n} مخاطر مرتفعة`),
  medium: (n) => (n === 1 ? 'خطر متوسط' : n === 2 ? 'خطران متوسطان' : `${n} مخاطر متوسطة`),
  low: (n) => (n === 1 ? 'خطر منخفض' : n === 2 ? 'خطران منخفضان' : `${n} مخاطر منخفضة`),
  avoided: (n) => (n === 1 ? 'خطر تفاديته' : n === 2 ? 'خطران تفاديتهما' : `${n} مخاطر تفاديتها`),
}

/** Numbers, percentages and ranges inside Arabic text, each kept left-to-right (e.g. «−6.3%», «3–7»). */
const NUM_RE = /[−+-]?\d[\d.,]*(?:\s?[–-]\s?\d[\d.,]*)?\s?%?/g
export function BidiText({ text }: { text: string }) {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(NUM_RE)) {
    const i = m.index ?? 0
    // a hyphen between words is not a minus sign
    let s = m[0]
    let start = i
    if ((s[0] === '-' || s[0] === '+') && i > 0 && /\S/.test(text[i - 1])) { s = s.slice(1); start = i + 1 }
    if (start > last) out.push(text.slice(last, start))
    out.push(<bdi key={start} dir="ltr">{s.trim()}</bdi>)
    if (/\s$/.test(s)) out.push(' ')
    last = start + s.length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out.map((x, k) => <Fragment key={k}>{x}</Fragment>)}</>
}

function RiskCard({ r }: { r: RiskItem }) {
  return (
    <article className={`rk-card lvl-${r.level}`}>
      <div className="rk-top">
        <span className="rk-ico">{ICON[r.key] ?? <IconAlert />}</span>
        <b>{r.title}</b>
        <span className="rk-lvl">{RISK_LEVEL_LABEL[r.level]}</span>
      </div>
      <p className="rk-metric"><BidiText text={r.metric} />{r.amount != null && r.amount > 0 && <> · <Money v={r.amount} /></>}</p>
      {r.value != null && Number.isFinite(r.value) && (
        <div className="rk-bar" role="img" aria-label={`${Math.round(r.value)}%`}><i style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }} /></div>
      )}
      {r.detail && <p className="rk-detail"><BidiText text={r.detail} /></p>}
      {r.tip && <p className="rk-tip">{r.level === 'avoided' ? <IconCheck /> : <IconSparkle />}<span><BidiText text={r.tip} /></span></p>}
    </article>
  )
}

export function RiskList({ items }: { items: RiskItem[] }) {
  const count = (l: RiskLevel) => items.filter((r) => r.level === l).length
  const exposed = items.filter((r) => r.level !== 'avoided')
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
  const avoided = items.filter((r) => r.level === 'avoided')
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="rk-sum" aria-label="ملخص المخاطر">
        {LEVELS.map((l) => count(l) > 0 && <span key={l} className={`chip lvl-${l}`}>{COUNT[l](count(l))}</span>)}
      </div>
      {exposed.length > 0 && (
        <section className="rk-group">
          <h3>معرّض لها<small>من الأعلى إلى الأقل</small></h3>
          <div className="rk-grid">{exposed.map((r) => <RiskCard key={r.key} r={r} />)}</div>
        </section>
      )}
      {avoided.length > 0 && (
        <section className="rk-group">
          <h3>تفاديتها<small>وكيف</small></h3>
          <div className="rk-grid">{avoided.map((r) => <RiskCard key={r.key} r={r} />)}</div>
        </section>
      )}
    </div>
  )
}
