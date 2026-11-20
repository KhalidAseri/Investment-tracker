'use client'

import { Children, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, animate, motion, useDragControls, useReducedMotion } from 'motion/react'
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

// Open sheets register their close handler here so the Android back button closes the top one first.
const sheetStack: (() => void)[] = []
export function closeTopSheet(): boolean {
  const close = sheetStack[sheetStack.length - 1]
  if (close) close()
  return !!close
}

/** Bottom sheet: springs up, can be dragged down by its handle to dismiss, closes on Escape or backdrop tap. */
/**
 * Where the keyboard overlays the page instead of shrinking it (iOS Safari, older browsers), this
 * keeps `--kb` equal to the part of the layout the keyboard covers; sheets sit above that. Where the
 * page itself shrinks (Android app, Chrome) the difference is zero and nothing moves twice.
 */
function trackKeyboard(): () => void {
  const vv = typeof window !== 'undefined' ? window.visualViewport : null
  if (!vv) return () => {}
  const update = () => {
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    document.documentElement.style.setProperty('--kb', covered > 60 ? `${covered}px` : '0px')
  }
  update()
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); document.documentElement.style.setProperty('--kb', '0px') }
}

/** Brings the field being typed in to the middle of the sheet once the keyboard has opened. */
function revealField(e: React.FocusEvent<HTMLElement>): void {
  const el = e.target as HTMLElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return
  if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'range'].includes(el.type)) return
  window.setTimeout(() => { if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, 320)
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { L } = useStore()
  const titleId = useId()
  const drag = useDragControls()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const close = () => closeRef.current()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    sheetStack.push(close)
    const stopKb = trackKeyboard()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      stopKb()
      sheetStack.splice(sheetStack.lastIndexOf(close), 1)
      document.body.style.overflow = sheetStack.length ? 'hidden' : prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-end justify-center sm:items-center" style={{ bottom: 'var(--kb, 0px)' }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <motion.button className="absolute inset-0 cursor-default bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={onClose} aria-label={L('إغلاق', 'Close')} tabIndex={-1} />
          <motion.div
            className="relative flex max-h-[92%] w-full max-w-xl flex-col rounded-t-3xl bg-card shadow-float sm:rounded-3xl"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 34, stiffness: 360 }}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, info) => { if (info.offset.y > 110 || info.velocity.y > 700) onClose() }}
          >
            <div className="flex cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing" onPointerDown={(e) => drag.start(e)} aria-hidden>
              <span className="h-1.5 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 pb-3 pt-1">
              <h2 id={titleId} className="text-base font-semibold">{title}</h2>
              <button onClick={onClose} className="-me-2 flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-surface" aria-label={L('إغلاق', 'Close')}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4" onFocus={revealField}>{children}</div>
            {footer && <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
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
export function NumberInput({ value, onChange, suffix, placeholder, autoFocus, ariaLabel }: { value: number; onChange: (n: number) => void; suffix?: string; placeholder?: string; autoFocus?: boolean; /** For a field with no visible label of its own (a cell in a list). */ ariaLabel?: string }) {
  const [text, setText] = useState(value ? String(value) : '')
  useEffect(() => {
    setText((t) => (parseNumber(t) === value ? t : value ? String(value) : ''))
  }, [value])
  return (
    <div className="relative">
      <input
        className={cx('input text-start tabular-nums', suffix && 'pe-14')}
        inputMode="decimal"
        aria-label={ariaLabel}
        enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
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

/** Choice chips. The active pill slides between options instead of jumping. */
export function Chips<T extends string | number>({ value, options, onChange, wrap = false }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; wrap?: boolean }) {
  const id = useId()
  return (
    <div className={cx('flex gap-2', wrap ? 'flex-wrap' : 'no-scrollbar -mx-4 overflow-x-auto px-4')} role="tablist">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={String(o.value)} role="tab" aria-selected={on} onClick={() => onChange(o.value)} className={cx('chip relative', on && 'border-transparent text-white')}>
            {on && <motion.span layoutId={`chip-${id}`} className="absolute inset-0 rounded-full bg-accent" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
            <span className="relative">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A number that rolls to its new value. Use it for the one or two headline figures of a screen, not every amount. */
export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(value)
  const reduce = useReducedMotion()
  const fmt = useRef(format)
  fmt.current = format
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || from.current === value) { el.textContent = fmt.current(value); from.current = value; return }
    const controls = animate(from.current, value, { duration: 0.7, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { el.textContent = fmt.current(v) } })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <span ref={ref} className={cx('num', className)}>{format(value)}</span>
}

/** Children fade and rise in, one after another. For the cards of a screen, once on entry. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const items = Children.toArray(children)
  return (
    <div className={className}>
      {items.map((child, i) => (
        <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, delay: Math.min(i, 6) * 0.05, ease: [0.16, 1, 0.3, 1] }}>
          {child}
        </motion.div>
      ))}
    </div>
  )
}

export function Notice({ tone, title, children, action }: { tone: 'warn' | 'info' | 'good'; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'good' ? CircleCheck : Info
  const style = tone === 'warn' ? 'border-warn-line bg-warn-tint' : tone === 'good' ? 'border-good-line bg-good-tint' : 'border-line bg-card'
  const iconStyle = tone === 'warn' ? 'text-warn-600' : tone === 'good' ? 'text-gain' : 'text-link'
  return (
    <div className={cx('flex gap-3 rounded-2xl border p-4', style)}>
      <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', iconStyle)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">{title}</p>
        {children && <div className="mt-1 text-[13px] leading-relaxed text-ink-soft">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-tint text-link">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-soft">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Stat({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-soft">{label}</p>
      <div className="mt-0.5 text-lg font-semibold leading-tight">{children}</div>
      {sub && <div className="mt-0.5 text-xs text-ink-soft">{sub}</div>}
    </div>
  )
}

export function Disclaimer({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface px-3 py-3 text-xs leading-relaxed text-ink-soft">{children}</p>
}

/** A range control with its current value shown beside the label. */
export function Slider({ label, value, min, max, step, onChange, display, hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; display?: string; hint?: React.ReactNode }) {
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        <span className="num text-sm font-semibold">{display ?? value}</span>
      </div>
      <input id={id} type="range" className="mt-1 h-8 w-full cursor-pointer" style={{ accentColor: 'rgb(var(--accent))' }} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** A short tick on phones that support it, for a saved value or a reached station. */
export function haptic(ms = 10): void {
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number) => boolean; userActivation?: { hasBeenActive: boolean } }
    // browsers refuse (and log) a vibration before the first tap
    if (nav.userActivation && !nav.userActivation.hasBeenActive) return
    nav.vibrate?.(ms)
  } catch { /* not supported */ }
}

/** A brief tint behind a figure when it changes, green up and red down, so a refreshed price is noticed. */
export function Flash({ value, children, className }: { value: number; children: React.ReactNode; className?: string }) {
  const prev = useRef(value)
  const [dir, setDir] = useState<'' | 'up' | 'down'>('')
  useEffect(() => {
    if (Math.abs(value - prev.current) < 0.005) return
    setDir(value > prev.current ? 'up' : 'down')
    prev.current = value
    const t = setTimeout(() => setDir(''), 900)
    return () => clearTimeout(t)
  }, [value])
  return <span className={cx('-mx-1 rounded-md px-1 transition-colors duration-500', dir === 'up' && 'bg-good-tint', dir === 'down' && 'bg-loss-tint', className)}>{children}</span>
}
