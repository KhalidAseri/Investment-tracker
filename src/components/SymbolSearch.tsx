import { useEffect, useId, useRef, useState } from 'react'
import { TYPE_LABEL, searchSymbols, type SymbolResult } from '../lib/market'

/** Search the market by ticker or English name; picking a result hands it back. */
export function SymbolSearch({ onPick, label = 'ابحث في السوق', hint }: { onPick: (r: SymbolResult) => void; label?: string; hint?: string }) {
  const id = useId()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SymbolResult[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const seq = useRef(0)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults([]); setState('idle'); return }
    const n = ++seq.current
    setState('loading')
    const t = window.setTimeout(async () => {
      try {
        const r = await searchSymbols(term)
        if (n === seq.current) { setResults(r); setState('done') }
      } catch {
        if (n === seq.current) setState('error')
      }
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])

  return (
    <div className="symbol-search">
      <label className="field" htmlFor={id}>
        <span>{label}</span>
        <input id={id} className="input" dir="auto" value={q} onChange={(e) => setQ(e.target.value)} placeholder="الرمز أو الاسم بالإنجليزية، مثل 2222 أو ISWD أو Al Rajhi"
          autoComplete="off" aria-controls={`${id}-list`} />
        {hint && <small>{hint}</small>}
      </label>
      {state === 'loading' && <p className="small muted" role="status">نبحث…</p>}
      {state === 'error' && <p className="small bad" role="alert">تعذّر البحث؛ تحقق من الاتصال وأعد المحاولة.</p>}
      {state === 'done' && results.length === 0 && <p className="small muted">لا نتائج. جرّب الرمز (مثل 1120) أو اسماً بالإنجليزية.</p>}
      {results.length > 0 && (
        <ul id={`${id}-list`} className="symbol-results" role="listbox" aria-label="نتائج البحث">
          {results.map((r) => (
            <li key={r.symbol}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onPick(r); setQ(''); setResults([]); setState('idle') }}>
                <span className="grow">
                  <span className="name">{r.name}</span>
                  <span className="meta"><span className="ltr">{r.symbol}</span> · {r.exchange}{TYPE_LABEL[r.type] ? ` · ${TYPE_LABEL[r.type]}` : ''}</span>
                </span>
                <span className="pick">اختر</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
