// Building blocks of the redesigned interface (see REDESIGN.md).
import type { ReactNode } from 'react'
import { num0, num2 } from '../lib/format'
import { assetColor, haptic, initialsOf, SHORT_MONTHS } from '../lib/ui'
import { holdingValue } from '../lib/calc'
import { holdingPnL } from '../lib/wealth'
import type { Fx, Holding, Sleeve } from '../lib/types'
import { IconChevron, IconDown, IconUp } from './icons'

/** A riyal amount; blurred in privacy mode. */
export function Money({ v, short, signed, className = '' }: { v: number; short?: boolean; signed?: boolean; className?: string }) {
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  const a = Math.abs(v || 0)
  const [num, unit] = !short ? [num0(a), 'ريال'] : a >= 1_000_000 ? [num2(a / 1_000_000), 'مليون'] : a >= 10_000 ? [num0(a / 1000), 'ألف'] : [num0(a), 'ريال']
  // the number is isolated left-to-right so its sign stays in place inside Arabic text
  return <span className={`money ${className}`}><bdi dir="ltr">{sign}{num}</bdi> {unit}</span>
}

/** A percentage kept left-to-right inside Arabic text, e.g. +4.2% */
export function Pct({ v, signed, digits = 1 }: { v: number; signed?: boolean; digits?: number }) {
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  return <bdi dir="ltr">{sign}{Math.abs(v || 0).toFixed(digits).replace(/\.0+$/, '')}%</bdi>
}

/** Change pill: arrow + amount and/or percent. */
export function Pill({ value, pct, label, className = '' }: { value?: number | null; pct?: number | null; label?: string; className?: string }) {
  const basis = pct ?? value ?? 0
  const dir = basis > 0.0001 ? 'up' : basis < -0.0001 ? 'down' : ''
  const pctText = pct != null ? `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 2 : 1).replace(/\.?0+$/, '')}%` : null
  return (
    <span className={`pill ${dir} ${className}`}>
      {dir === 'up' ? <IconUp /> : dir === 'down' ? <IconDown /> : null}
      <span className="money">
        {value != null && <><bdi dir="ltr">{num0(Math.abs(value))}</bdi> ريال</>}
        {value != null && pctText && ' · '}
        {pctText && <bdi dir="ltr">{pctText}</bdi>}
      </span>
      {label && <span style={{ fontWeight: 400, opacity: 0.85 }}>{label}</span>}
    </span>
  )
}

export function Avatar({ name, symbol, color = 'var(--accent)', size = 40 }: { name: string; symbol?: string | null; color?: string; size?: number }) {
  const t = initialsOf(name, symbol)
  const fs = t.length >= 4 ? size * 0.27 : t.length === 3 ? size * 0.32 : t.length === 2 ? size * 0.38 : size * 0.44
  return (
    <span className="avatar" aria-hidden style={{ width: size, height: size, fontSize: fs, background: `linear-gradient(145deg, color-mix(in srgb, ${color} 82%, white), ${color})` }}>{t}</span>
  )
}

export function Tile({ icon, label, value, sub, href, onClick, tone = '' }: {
  icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; href?: string; onClick?: () => void; tone?: '' | 'income' | 'gold' | 'blue'
}) {
  const inner = <>
    <span className="tile-ico">{icon}</span>
    <span className="tile-label">{label}</span>
    <span className="tile-value">{value}</span>
    {sub != null && <span className="tile-sub">{sub}</span>}
  </>
  return href
    ? <a className={`tile ${tone}`} href={href} onClick={() => haptic()}>{inner}</a>
    : <button type="button" className={`tile ${tone}`} onClick={() => { haptic(); onClick?.() }}>{inner}</button>
}

export function Card({ title, action, children, className = '', flush }: {
  title?: ReactNode; action?: { label: string; href?: string; onClick?: () => void } | null; children: ReactNode; className?: string; flush?: boolean
}) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className}`}>
      {(title || action) && (
        <div className="card-head">
          {title ? <h3>{title}</h3> : <span />}
          {action && (action.href
            ? <a className="link" href={action.href}>{action.label}</a>
            : <button type="button" className="link" onClick={action.onClick}>{action.label}</button>)}
        </div>
      )}
      {children}
    </section>
  )
}

export function KV({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return <div className="kv"><span>{label}</span><b>{value}{sub != null && <small>{sub}</small>}</b></div>
}

export function StackBar({ parts, thin }: { parts: Array<{ key: string; value: number; color: string; label?: string }>; thin?: boolean }) {
  const total = parts.reduce((a, p) => a + Math.max(0, p.value), 0) || 1
  return (
    <div className={`stackbar ${thin ? 'thin' : ''}`} role="img" aria-label={parts.map((p) => `${p.label ?? p.key} ${Math.round((p.value / total) * 100)}%`).join('، ')}>
      {parts.filter((p) => p.value > 0).map((p) => <i key={p.key} style={{ flexGrow: p.value, background: p.color }} />)}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: { label: string; onClick?: () => void; href?: string } }) {
  return (
    <div className="empty">
      {icon && <div className="empty-ico">{icon}</div>}
      <h3>{title}</h3>
      {text && <p className="small">{text}</p>}
      {action && (action.href ? <a className="btn primary small" href={action.href}>{action.label}</a>
        : <button type="button" className="btn primary small" onClick={action.onClick}>{action.label}</button>)}
    </div>
  )
}

export function DateBadge({ iso, today }: { iso: string; today?: string }) {
  const d = new Date(iso + 'T12:00:00')
  return <span className={`date-badge ${today === iso ? 'today' : ''}`}><b>{d.getDate()}</b><span>{SHORT_MONTHS[d.getMonth()]}</span></span>
}

/** A holding in a list: avatar, name, detail line, value and gain (or weight). */
export function AssetRow({ h, sleeves, fx, total, sub, onClick, stale }: {
  h: Holding; sleeves: Sleeve[]; fx: Fx; total?: number; sub?: ReactNode; onClick?: () => void; stale?: boolean
}) {
  const v = holdingValue(h, fx)
  const p = holdingPnL(h, fx)
  return (
    <button type="button" className="ri" onClick={() => { haptic(); onClick?.() }}>
      <Avatar name={h.name} symbol={h.symbol && h.price_source === 'yahoo' ? h.symbol : null} color={assetColor(h, sleeves)} />
      <span className="ri-main"><b>{h.name}{stale && <i className="stale-dot" title="يحتاج تحديث" />}</b><span>{sub}</span></span>
      <span className="ri-end">
        <Money v={v} />
        {p.pct != null
          ? <span className={`sub ${p.pct > 0 ? 'good' : p.pct < 0 ? 'bad' : ''}`}><Pct v={p.pct} signed /></span>
          : total ? <span className="sub"><Pct v={(v / total) * 100} /> من المحفظة</span> : null}
      </span>
    </button>
  )
}

export function SegLinks({ items }: { items: Array<{ href: string; label: string; active: boolean }> }) {
  return (
    <nav className="segmented full" aria-label="أقسام">
      {items.map((i) => <a key={i.href} href={i.href} aria-current={i.active ? 'page' : undefined} onClick={() => haptic()}>{i.label}</a>)}
    </nav>
  )
}

/** Chevron pointing "forward" in RTL. */
export const Chev = () => <IconChevron className="chev" />
