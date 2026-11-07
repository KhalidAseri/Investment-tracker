import { useEffect, useRef, useState, type ReactNode } from 'react'
import { lockConfig, recentlyUnlocked, verifyLock } from '../lib/lock'
import { useStore } from '../lib/store'

/** Covers the app until Face ID / fingerprint succeeds; locks again after the chosen time away. */
export function LockGate({ children }: { children: ReactNode }) {
  const { signOut } = useStore()
  const [locked, setLocked] = useState(() => !!lockConfig() && !recentlyUnlocked())
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const hiddenAt = useRef<number | null>(null)
  const tried = useRef(false)

  useEffect(() => {
    const on = () => {
      const c = lockConfig()
      if (!c) return
      if (document.visibilityState === 'hidden') hiddenAt.current = Date.now()
      else if (hiddenAt.current && Date.now() - hiddenAt.current >= c.minutes * 60000) setLocked(true)
    }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  const unlock = async () => {
    setBusy(true); setFailed(false)
    const ok = await verifyLock()
    setBusy(false)
    if (ok) { setLocked(false); tried.current = false } else setFailed(true)
  }
  useEffect(() => { if (locked && !tried.current) { tried.current = true; unlock() } }, [locked]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!locked) return <>{children}</>
  return (
    <div className="auth lock-screen">
      <div className="auth-card stack" style={{ textAlign: 'center' }}>
        <img className="mark" src="./icons/icon-192.png" alt="" />
        <h1>مسار مقفل</h1>
        <p className="lead">افتحه ببصمة الوجه أو الإصبع.</p>
        <button className="btn primary" disabled={busy} onClick={unlock}>{busy ? 'بانتظار التحقق…' : 'افتح'}</button>
        {failed && <p className="small bad" role="alert">لم يتم التحقق. حاول مجدداً.</p>}
        <button className="btn quiet" onClick={() => signOut()}>ادخل بكلمة المرور بدلاً من ذلك</button>
      </div>
    </div>
  )
}
