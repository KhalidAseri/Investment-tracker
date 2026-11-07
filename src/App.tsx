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
import Watchlist from './pages/Watchlist'
import Income from './pages/Income'
import Payouts from './pages/Payouts'
import Goals from './pages/Goals'
import Profile from './pages/Profile'
import Onboarding from './pages/Onboarding'
import { IconCalendar, IconChevron, IconCoins, IconFlag, IconUser, IconDeposit, IconEye, IconIncome, IconHome, IconHorizon, IconList, IconMore, IconRefresh, IconSettings, IconTarget, IconWallet } from './components/icons'

export type Route = 'home' | 'holdings' | 'deposit' | 'outlook' | 'income' | 'payouts' | 'goals' | 'profile' | 'plan' | 'watch' | 'calendar' | 'activity' | 'settings' | 'more'
export type Go = (r: Route) => void

const TITLES: Record<Route, string> = {
  home: 'مسارك', holdings: 'المحفظة', deposit: 'مخطط الإيداع', outlook: 'المستقبل والدخل', plan: 'الخطة والأوزان',
  income: 'الدخل الشهري', payouts: 'التوزيعات', goals: 'الأهداف', profile: 'وضعي المالي', watch: 'قائمة المراقبة', calendar: 'التقويم', activity: 'العمليات', settings: 'الإعدادات', more: 'المزيد',
}
const NAV: Array<{ r: Route; label: string; icon: (p: any) => JSX.Element; desc?: string }> = [
  { r: 'home', label: 'الرئيسية', icon: IconHome },
  { r: 'holdings', label: 'المحفظة', icon: IconWallet },
  { r: 'deposit', label: 'الإيداع', icon: IconDeposit },
  { r: 'outlook', label: 'المستقبل', icon: IconHorizon },
  { r: 'income', label: 'الدخل', icon: IconIncome, desc: 'حساب دخلك السنوي، ومصادره، وما تبيعه، ومواعيد التحويل' },
  { r: 'payouts', label: 'التوزيعات', icon: IconCoins, desc: 'ما وصلك وما ينتظر وصوله من صناديق الدخل والصكوك' },
  { r: 'goals', label: 'الأهداف', icon: IconFlag, desc: 'محافظ منفصلة لدفعة بيت أو سيارة أو تعليم' },
  { r: 'profile', label: 'وضعي المالي', icon: IconUser, desc: 'ما تستثمره ومتى، والتزاماتك، وهدفك' },
  { r: 'plan', label: 'الخطة', icon: IconTarget, desc: 'الأوزان المستهدفة وقواعد المتابعة والسحب' },
  { r: 'watch', label: 'المراقبة', icon: IconEye, desc: 'الأسهم المباشرة وشروط شرائها وسعر الشراء' },
  { r: 'calendar', label: 'التقويم', icon: IconCalendar, desc: 'المكافأة والسلفة والزكاة والمراجعة السنوية' },
  { r: 'activity', label: 'العمليات', icon: IconList, desc: 'الإيداعات والتوزيعات وعمليات IBKR' },
  { r: 'settings', label: 'الإعدادات', icon: IconSettings, desc: 'ربط IBKR والإشعارات والمتابعة العائلية والمظهر' },
]
const OWNER_TABS: Route[] = ['home', 'holdings', 'deposit', 'outlook', 'more']
const VIEWER_TABS: Route[] = ['home', 'holdings', 'outlook', 'calendar', 'more']
const VIEWER_HIDDEN: Route[] = ['deposit']

const readRoute = (): Route => {
  const h = location.hash.replace(/^#\/?/, '') as Route
  return h && h in TITLES ? h : 'home'
}

export default function App() {
  const { session, ready, loading, error, settings, save, refreshing, refreshMarket, notify, toast, reload, readOnly, needsSetup } = useStore()
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
  if (loading) return <Splash text="نجهّز خطتك…" />
  if (needsSetup) return <>{<Onboarding />}{toast && <div className="toast" role="status">{toast}</div>}</>
  if (!settings) return <NoAccess />

  const TABS = readOnly ? VIEWER_TABS : OWNER_TABS
  const nav = readOnly ? NAV.filter((n) => !VIEWER_HIDDEN.includes(n.r)) : NAV
  const current: Route = readOnly && VIEWER_HIDDEN.includes(route) ? 'home' : route

  const page: Record<Route, ReactNode> = {
    home: <Overview go={go} />, holdings: <Holdings />, deposit: <Deposit />, outlook: <Outlook />, income: <Income />, payouts: <Payouts />, goals: <Goals />, profile: <Profile />, plan: <Plan />, watch: <Watchlist />,
    calendar: <Calendar />, activity: <Activity />, settings: <Settings />, more: <More go={go} items={nav.filter((n) => n.desc && !TABS.includes(n.r))} />,
  }
  const activeTab = TABS.includes(current) ? current : 'more'

  return (
    <div className="app">
      <nav className="sidebar" aria-label="التنقل">
        <div className="brand"><img src="./icons/icon-192.png" width={34} height={34} alt="" style={{ borderRadius: 9 }} /><b>مسار</b></div>
        {nav.map((n) => (
          <button key={n.r} className="side-link" aria-current={current === n.r ? 'page' : undefined} onClick={() => go(n.r)}>
            <n.icon />{n.label}
          </button>
        ))}
        <div className="side-foot">{readOnly ? <span className="save-dot">للاطلاع فقط</span> : <span className="save-dot" data-s={save}>{saveText(save)}</span>}</div>
      </nav>

      <main className="main">
        <header className="topbar">
          {current !== 'home' && !TABS.includes(current) && (
            <button className="icon-btn" aria-label="رجوع" onClick={() => go('more')} style={{ transform: 'scaleX(-1)' }}><IconChevron /></button>
          )}
          <h1>{TITLES[current]}</h1>
          {readOnly ? (
            <button className="icon-btn" aria-label="حدّث البيانات" onClick={async () => { await reload(); notify('حُدّثت البيانات') }}><IconRefresh /></button>
          ) : <>
            <span className="save-dot" data-s={save}>{saveText(save)}</span>
            <button className="icon-btn" aria-label="حدّث الأسعار والبيانات" disabled={refreshing}
              onClick={async () => { const r = await refreshMarket('all'); notify(r.message); reload() }}>
              <IconRefresh className={refreshing ? 'spin' : ''} />
            </button>
          </>}
        </header>
        {readOnly && current === 'home' && <div className="viewer-banner"><IconEye width={18} height={18} /><span><b>وضع المتابعة</b>: ترى التقدم أولاً بأول، والتعديل لصاحب المحفظة.</span></div>}
        {page[current]}
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

function More({ go, items }: { go: Go; items: typeof NAV }) {
  return (
    <div className="panel flush">
      {items.map((n) => (
        <button key={n.r} className="list-item" onClick={() => go(n.r)}>
          <span className="icon-btn" style={{ border: 0, background: 'var(--sunken)' }}><n.icon /></span>
          <div className="grow"><div>{n.label}</div><div className="meta">{n.desc}</div></div>
          <IconChevron width={18} height={18} />
        </button>
      ))}
    </div>
  )
}

function NoAccess() {
  const { signOut, session } = useStore()
  return (
    <div className="auth"><div className="auth-card panel stack">
      <h2>لا توجد محفظة لعرضها</h2>
      <p className="muted small">الحساب <span className="ltr">{session?.user.email}</span> لم يعد مضافاً لمتابعة أي محفظة. اطلب من صاحبها إضافة بريدك من الإعدادات.</p>
      <button className="btn ghost" onClick={() => signOut()}>تسجيل الخروج</button>
    </div></div>
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
        /restricted|Database error saving new user/i.test(m) ? 'التسجيل مقصور على صاحب التطبيق ومن يضيفه للمتابعة. تأكد أن بريدك مضاف.'
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
