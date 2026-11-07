import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { IconClose } from './icons'
import { num0, num2, parseNum } from '../lib/format'

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [onClose])
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="إغلاق"><IconClose /></button>
        </div>
        {children}
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  )
}

/** Number input that shows grouped digits, accepts Arabic digits, and commits on blur/enter. */
export function NumberField({ label, value, onChange, suffix, hint, decimals = 0, min, max, plain }: {
  label: string; value: number | null | undefined; onChange: (v: number) => void; suffix?: string; hint?: string; decimals?: number; min?: number; max?: number; plain?: boolean
}) {
  const id = useId()
  const fmt = (v: number | null | undefined) => (v == null || Number.isNaN(v) ? '' : plain ? String(Math.round(v)) : decimals > 2 ? v.toLocaleString('en-US', { maximumFractionDigits: decimals }) : decimals ? num2(v) : num0(v))
  const [text, setText] = useState(fmt(value))
  const [focus, setFocus] = useState(false)
  useEffect(() => { if (!focus) setText(fmt(value)) }, [value, focus])
  const commit = () => {
    let n = parseNum(text)
    if (min != null) n = Math.max(min, n)
    if (max != null) n = Math.min(max, n)
    if (n !== value) onChange(n)
    setText(fmt(n))
  }
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <div className="input-wrap">
        <input id={id} className="input num" inputMode="decimal" value={text}
          onFocus={(e) => { setFocus(true); setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()) }}
          onBlur={() => { setFocus(false); commit() }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          onChange={(e) => setText(e.target.value)} />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function TextField({ label, value, onChange, placeholder, hint, ltr }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; ltr?: boolean }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input id={id} className="input" value={value} placeholder={placeholder} dir={ltr ? 'ltr' : 'auto'} onChange={(e) => onChange(e.target.value)} />
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function SelectField<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  const id = useId()
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="switch">
      <span className="stack" style={{ gap: 2 }}>
        <span>{label}</span>
        {hint && <small className="muted tiny">{hint}</small>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

/** Slider with its live value; used for the what-if knobs. */
export function Knob({ label, value, min, max, step, onChange, display, hint }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string; hint?: string
}) {
  const id = useId()
  return (
    <div className="knob">
      <div className="top">
        <label htmlFor={id}>{label}</label>
        <span className="val">{display}</span>
      </div>
      <input id={id} className="slider" type="range" min={min} max={max} step={step} value={value} dir="ltr"
        onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h3>{title}</h3>{children}</div>
}
