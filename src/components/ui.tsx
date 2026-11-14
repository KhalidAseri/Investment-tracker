'use client'

import { useEffect, useId, useState } from 'react'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleCheck, Info, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { num, parseNumber, pct, unit } from '@/lib/format'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Amount in the base currency. Respects the hide-amounts toggle. */
export function Money({ value, currency = 'SAR', sign = false, className }: { value: number; currency?: string; sign?: boolean; className?: string }) {
  const { settings } = useStore()
  if (settings.hideAmounts) return <span className={cx('num', className)}>••••</span>
  return (
    <span className={cx('num whitespace-nowrap', className)}>
      {sign && value > 0 ? '+' : ''}
      {num(value, Math.abs(value) >= 100 ? 0 : 'auto')} <span className="text-[0.72em] font-medium opacity-70">{unit(currency, settings.locale)}</span>
    </span>
  )
}

/** Gain/loss: arrow + sign + colour, so direction never rests on colour alone. */
export function Delta({ value, percent, className }: { value?: number; percent?: number; className?: string }) {
  const ref = value ?? percent ?? 0
  const Icon = ref >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cx('inline-flex items-center gap-0.5 font-medium', ref > 0 ? 'text-gain' : ref < 0 ? 'text-loss' : 'text-ink-soft', className)}>
      {ref !== 0 && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
      {value !== undefined && <Money value={value} sign />}
      {percent !== undefined && <span className="num">{value !== undefined ? `(${pct(percent, 1, true)})` : pct(percent, 1, true)}</span>}
    </span>
  )
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { L } = useStore()
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button className="absolute inset-0 bg-black/45" onClick={onClose} aria-label={L('إغلاق', 'Close')} tabIndex={-1} />
      <div className="sheet-panel relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="text-base font-bold">{title}</h2>
          <button onClick={onClose} className="-me-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface" aria-label={L('إغلاق', 'Close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({ open, title, body, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; body: string; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  const { L } = useStore()
  return (
    <Sheet open={open} onClose={onClose} title={title} footer={
      <div className="flex gap-2">
        <button className="btn-danger flex-1" onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        <button className="btn-ghost flex-1" onClick={onClose}>{L('إلغاء', 'Cancel')}</button>
      </div>
    }>
      <p className="text-sm leading-relaxed text-ink-soft">{body}</p>
    </Sheet>
  )
}

/**
 * A labelled control. Use `group` when the content is a set of buttons or several inputs:
 * a <label> around buttons would name every button after the whole group and forward taps to the first one.
 */
export function Field({ label, hint, group = false, children }: { label: string; hint?: string; group?: boolean; children: React.ReactNode }) {
  const id = useId()
  if (group) {
    return (
      <div role="group" aria-labelledby={id}>
        <span id={id} className="label">{label}</span>
        {children}
        {hint && <span className="hint mt-1 block">{hint}</span>}
      </div>
    )
  }
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint mt-1 block">{hint}</span>}
    </label>
  )
}

/** Numeric text input: decimal keypad on phones, accepts Arabic digits, never fights the caret. */
export function NumberInput({ value, onChange, suffix, placeholder, autoFocus }: { value: number; onChange: (n: number) => void; suffix?: string; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    setText((t) => (parseNumber(t) === value ? t : value ? String(value) : ''))
  }, [value])
  return (
    <div className="relative">
      <input
        className={cx('input text-start tabular-nums', suffix && 'pe-14')}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder ?? '0'}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          onChange(parseNumber(e.target.value))
        }}
      />
      {suffix && <span aria-hidden className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-ink-faint">{suffix}</span>}
    </div>
  )
}

export function Chips<T extends string | number>({ value, options, onChange, wrap = false }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; wrap?: boolean }) {
  return (
    <div className={cx('flex gap-2', wrap ? 'flex-wrap' : 'no-scrollbar -mx-4 overflow-x-auto px-4')} role="tablist">
      {options.map((o) => (
        <button key={String(o.value)} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={cx('chip', o.value === value && 'chip-on')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Notice({ tone, title, children, action }: { tone: 'warn' | 'info' | 'good'; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'good' ? CircleCheck : Info
  const style = tone === 'warn' ? 'border-amber-200 bg-warn-50' : tone === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-line bg-white'
  const iconStyle = tone === 'warn' ? 'text-warn-600' : tone === 'good' ? 'text-gain' : 'text-brand-600'
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-3.5', style)}>
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', iconStyle)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {children && <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>
      <h2 className="text-base font-bold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-soft">{label}</p>
      <div className="mt-0.5 text-lg font-bold leading-tight">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface px-3 py-2.5 text-xs leading-relaxed text-ink-soft">{children}</p>
}

/** A range control with its current value shown beside the label. */
export function Slider({ label, value, min, max, step, onChange, display, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; display?: string; hint?: React.ReactNode }) {
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="num text-sm font-bold">{display ?? value}</span>
      </div>
      <input id={id} type="range" className="mt-1 h-8 w-full cursor-pointer accent-brand-600" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}
