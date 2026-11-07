import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from './lib/store'
import { supabase } from './lib/supabase'
import Overview from './pages/Overview'
import Holdings from './pages/Holdings'
import Deposit from './pages/Deposit'
import Outlook from './pages/Outlook'
import Plan from './pages/Plan'
import Calendar from './pages/Calendar'
import Activity from './pages/Activity'
import Settings from './pages/Settings'
import { IconCalendar, IconChevron, IconDeposit, IconHome, IconHorizon, IconList, IconMore, IconRefresh, IconSettings, IconTarget, IconWallet } from './components/icons'

export type Route = 'home' | 'holdings' | 'deposit' | 'outlook' | 'plan' | 'calendar' | 'activity' | 'settings' | 'more'
export type Go = (r: Route) => void

const TITLES: Record<Route, string> = {
  home: 'مسارك', holdings: 'المحفظة', deposit: 'مخطط الإيداع', outlook: 'المستقبل والدخل', plan: 'الخطة والأوزان',
  calendar: 'التقويم', activity: 'العمليات', settings: 'الإعدادات', more: 'المزيد',
}
const NAV: Array<{ r: Route; label: string; icon: (p: any) => JSX.Element; desc?: string }> = [
  { r: 'home', label: 'الرئيسية', icon: IconHome },
  { r: 'holdings', label: 'المحفظة', icon: IconWallet },
  { r: 'deposit', label: 'الإيداع', icon: IconDeposit },
  { r: 'outlook', label: 'المستقبل', icon: IconHorizon },
  { r: 'plan', label: 'الخطة', icon: IconTarget, desc: 'الأوزان المستهدفة وقواعد المتابعة والسحب' },
  { r: 'calendar', label: 'التقويم', icon: IconCalendar, desc: 'المكافأة والسلفة والزكاة والمراجعة السنوية' },
  { r: 'activity', label: 'العمليات', icon: IconList, desc: 'الإيداعات والتوزيعات وعمليات IBKR' },
  { r: 'settings', label: 'الإعدادات', icon: IconSettings, desc: 'ربط IBKR والحسابات والمظهر والنسخ الاحتياطي' },
]
const TABS: Route[] = ['home', 'holdings', 'deposit', 'outlook', 'more']

const readRoute = (): Route => {
  const h = location.hash.replace(/^#\/?/, '') as Route
  return h && h in TITLES ? h : 'home'
}

export default function App() {
  const { session, ready, loading, error, settings, save, refreshing, refreshMarket, notify, toast, reload } = useStore()
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const on = () => { setRoute(readRoute()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go: Go = (r) => { location.hash = r === 'home' ? '/' : `/${r}` }

  if (!ready) return <Splash />
  if (!session) return <Auth />
  if (error) return (
    <div className="auth"><div className="auth-card panel stack">
      <h2>تعذّر تحميل بياناتك</h2><p className="muted small">{error}</p>
      <button className="btn primary" onClick={() => location.reload()}>أعد المحاولة</button>
    </div></div>
  )
  if (loading || !settings) return <Splash text="نجهّز خطتك…" />

  const page: Record<Route, ReactNode> = {
    home: <Overview go={go} />, holdings: <Holdings />, deposit: <Deposit />, outlook: <Outlook />, plan: <Plan />,
    calendar: <Calendar />, activity: <Activity />, settings: <Settings />, more: <More go={go} />,
  }
  const activeTab = TABS.includes(route) ? route : 'more'

  return (
    <div className="app">
      <nav className="sidebar" aria-label="التنقل">
        <div className="brand"><img src="./icons/icon-192.png" width={34} height={34} alt="" style={{ borderRadius: 9 }} /><b>مسار</b></div>
        {NAV.map((n) => (
          <button key={n.r} className="side-link" aria-current={route === n.r ? 'page' : undefined} onClick={() => go(n.r)}>
            <n.icon />{n.label}
          </button>
        ))}
        <div className="side-foot"><span className="save-dot" data-s={save}>{saveText(save)}</span></div>
      </nav>

      <main className="main">
        <header className="topbar">
          {route !== 'home' && !TABS.includes(route) && (
            <button className="icon-btn" aria-label="رجوع" onClick={() => go('more')} style={{ transform: 'scaleX(-1)' }}><IconChevron /></button>
          )}
          <h1>{TITLES[route]}</h1>
          <span className="save-dot" data-s={save}>{saveText(save)}</span>
          <button className="icon-btn" aria-label="حدّث الأسعار والبيانات" disabled={refreshing}
            onClick={async () => { const r = await refreshMarket('all'); notify(r.message); reload() }}>
            <IconRefresh className={refreshing ? 'spin' : ''} />
          </button>
        </header>
        {page[route]}
      </main>

      <nav className="tabbar" aria-label="التنقل الرئيسي">
        {TABS.map((t) => {
          const n = t === 'more' ? { label: 'المزيد', icon: IconMore } : NAV.find((x) => x.r === t)!
          return (
            <button key={t} className="tab" aria-current={activeTab === t ? 'page' : undefined} onClick={() => go(t)}>
              <n.icon />{n.label}
            </button>
          )
        })}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

const saveText = (s: string) => (s === 'saving' ? 'يحفظ…' : s === 'saved' ? 'محفوظ' : s === 'error' ? 'لم يُحفظ' : 'متزامن')

function More({ go }: { go: Go }) {
  return (
    <div className="panel flush">
      {NAV.filter((n) => n.desc).map((n) => (
        <button key={n.r} className="list-item" onClick={() => go(n.r)}>
          <span className="icon-btn" style={{ border: 0, background: 'var(--sunken)' }}><n.icon /></span>
          <div className="grow"><div>{n.label}</div><div className="meta">{n.desc}</div></div>
          <IconChevron width={18} height={18} />
        </button>
      ))}
    </div>
  )
}

function Splash({ text }: { text?: string }) {
  return (
    <div className="auth"><div style={{ textAlign: 'center' }}>
      <img src="./icons/icon-192.png" width={64} height={64} alt="" style={{ borderRadius: 18 }} />
      {text && <p className="muted" style={{ marginTop: 14 }}>{text}</p>}
    </div></div>
  )
}

function Auth() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (mode === 'up') {
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: location.origin + location.pathname } })
        if (error) throw error
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
    } catch (err: any) {
      const m = String(err?.message ?? '')
      setMsg(
        /restricted|Database error saving new user/i.test(m) ? 'التسجيل في هذا التطبيق مقصور على صاحبه.'
          : /Invalid login/i.test(m) ? 'البريد أو كلمة المرور غير صحيحة. إن كانت أول مرة فاختر «إنشاء الحساب».'
          : /already registered/i.test(m) ? 'هذا البريد مسجل مسبقاً؛ اختر «تسجيل الدخول».'
          : /Password should be/i.test(m) ? 'كلمة المرور قصيرة؛ استخدم 8 أحرف على الأقل.'
          : 'تعذّر الدخول: ' + m,
      )
    } finally { setBusy(false) }
  }
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <img className="mark" src="./icons/icon-192.png" alt="" />
        <h1>مسار</h1>
        <p className="lead">خطتك نحو الاستقلال المالي: أين أنت، وأين تضع ريالك القادم، ومتى تصل.</p>
        <div className="stack">
          <label className="field"><span>البريد الإلكتروني</span>
            <input className="input" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field"><span>كلمة المرور</span>
            <input className="input" type="password" dir="ltr" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {msg && <p className="small bad" role="alert">{msg}</p>}
          <button className="btn primary" disabled={busy} type="submit">{busy ? 'لحظة…' : mode === 'in' ? 'تسجيل الدخول' : 'إنشاء الحساب والدخول'}</button>
          <button className="btn quiet" type="button" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
            {mode === 'in' ? 'أول مرة؟ أنشئ حسابك' : 'لديك حساب؟ سجّل الدخول'}
          </button>
        </div>
      </form>
    </div>
  )
}
