import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useStore } from './lib/store'
import { supabase } from './lib/supabase'
import Home from './pages/Home'
import Portfolio from './pages/Portfolio'
import Asset from './pages/Asset'
import QuickUpdate from './pages/QuickUpdate'
import Deposit from './pages/Deposit'
import Plan from './pages/Plan'
import Design from './pages/Design'
import Calendar from './pages/Calendar'
import Activity, { TxSheet } from './pages/Activity'
import Settings from './pages/Settings'
import Watchlist from './pages/Watchlist'
import Payouts, { RecordPayoutSheet } from './pages/Payouts'
import Goals from './pages/Goals'
import Onboarding from './pages/Onboarding'
import Analysis from './pages/Analysis'
import NetWorth from './pages/NetWorth'
import Import from './pages/Import'
import Report from './pages/Report'
import Me from './pages/Me'
import Review from './pages/Review'
import { EmergencySheet, RebalanceSheet, TreasurySheet, WithdrawSheet } from './components/PlanSheets'
import { BuySheet } from './components/BuySheet'
import { LockGate } from './components/LockGate'
import { AddAssetSheet } from './components/AddAsset'
import { Sheet } from './components/ui'
import { markUnlocked } from './lib/lock'
import { greeting, haptic, todayLabel, usePrivacy, type ActionKind, type ActionRequest } from './lib/ui'
import { todayISO } from './lib/format'
import { useDerived } from './lib/derived'
import { usePlan } from './lib/usePlan'
import {
  IconCalendar, IconChevron, IconCoins, IconFlag, IconDeposit, IconEye, IconEyeOff, IconHome, IconList, IconSettings, IconTarget, IconWallet,
  IconChart, IconScale, IconImport, IconDoc, IconPlus, IconPencil, IconCash, IconUser, IconShield, IconIncome, IconBuilding,
} from './components/icons'

export type Route = 'home' | 'portfolio' | 'goals' | 'watch' | 'asset' | 'update' | 'deposit' | 'income' | 'analysis' | 'networth' | 'me'
  | 'calendar' | 'activity' | 'import' | 'report' | 'plan' | 'design' | 'review' | 'settings'
export type Go = (r: Route, param?: string) => void

const TITLES: Record<Route, string> = {
  home: 'الرئيسية', portfolio: 'المحفظة', goals: 'المحفظة', watch: 'المحفظة', asset: 'تفاصيل الأصل', update: 'تحديث القيم',
  deposit: 'إيداع جديد', income: 'الدخل', analysis: 'التحليل', networth: 'صافي الثروة', me: 'حسابي', calendar: 'التقويم',
  activity: 'العمليات', import: 'الاستيراد من دراهم', report: 'التقرير السنوي', plan: 'الخطة', design: 'صمّم خطتي', review: 'المراجعة السنوية', settings: 'الإعدادات',
}
const ALIASES: Record<string, Route> = { holdings: 'portfolio', payouts: 'income', performance: 'analysis', more: 'me', outlook: 'home', profile: 'home' }
/** which bottom tab a page belongs to */
const PARENT: Partial<Record<Route, Route>> = { goals: 'portfolio', watch: 'portfolio', asset: 'portfolio', update: 'portfolio', review: 'plan', design: 'plan', analysis: 'home' }
const MAIN: Route[] = ['home', 'portfolio', 'goals', 'watch', 'plan', 'income']

type Nav = { r: Route; label: string; icon: (p: any) => JSX.Element }
/** desktop sidebar */
const PRIMARY: Nav[] = [
  { r: 'home', label: 'الرئيسية', icon: IconHome },
  { r: 'portfolio', label: 'المحفظة', icon: IconWallet },
  { r: 'plan', label: 'الخطة', icon: IconTarget },
  { r: 'income', label: 'الدخل', icon: IconCoins },
  { r: 'analysis', label: 'التحليل', icon: IconChart },
]
/** mobile tab bar: two tabs, the ＋ button, two tabs */
const TABS: [Nav[], Nav[]] = [
  [PRIMARY[0], PRIMARY[1]],
  [PRIMARY[2], PRIMARY[3]],
]
const SECONDARY: Nav[] = [
  { r: 'deposit', label: 'إيداع جديد', icon: IconDeposit },
  { r: 'update', label: 'تحديث القيم', icon: IconPencil },
  { r: 'goals', label: 'الأهداف', icon: IconFlag },
  { r: 'watch', label: 'المراقبة', icon: IconEye },
  { r: 'networth', label: 'صافي الثروة', icon: IconScale },
  { r: 'calendar', label: 'التقويم', icon: IconCalendar },
  { r: 'activity', label: 'العمليات', icon: IconList },
  { r: 'import', label: 'الاستيراد', icon: IconImport },
  { r: 'report', label: 'التقرير السنوي', icon: IconDoc },
  { r: 'settings', label: 'الإعدادات', icon: IconSettings },
]
const VIEWER_HIDDEN: Route[] = ['deposit', 'import', 'update', 'design']

const readRoute = (): { route: Route; param: string } => {
  const raw = location.hash.replace(/^#\/?/, '')
  const [head, ...rest] = raw.split('/')
  const r = (ALIASES[head] ?? head) as Route
  return { route: r && r in TITLES ? r : 'home', param: decodeURIComponent(rest.join('/')) }
}

export default function App() {
  const { session, ready, loading, error, settings, save, toast, readOnly, needsSetup } = useStore()
  const [{ route, param }, setLoc] = useState(readRoute)
  const [req, setReq] = useState<ActionRequest | null>(null)
  const action = req?.kind ?? null
  const setAction = (k: ActionKind | null, param?: string) => setReq(k ? { kind: k, param } : null)
  // stable: a sheet re-focuses its first field whenever onClose changes
  const closeAction = useCallback(() => setReq(null), [])
  useEffect(() => {
    const on = () => { setLoc(readRoute()); window.scrollTo({ top: 0 }) }
    const act = (e: Event) => {
      const d = (e as CustomEvent).detail as ActionRequest | ActionKind | null
      setReq(typeof d === 'string' ? { kind: d } : d?.kind ? d : { kind: 'sheet' })
    }
    window.addEventListener('hashchange', on)
    window.addEventListener('masar:action', act)
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('masar:action', act) }
  }, [])
  const go: Go = (r, p) => { haptic(); location.hash = r === 'home' ? '/' : `/${r}${p ? `/${encodeURIComponent(p)}` : ''}` }
  if (!ready) return <Splash />
  if (!session) return <Auth />
  if (error) return (
    <div className="auth"><div className="auth-card panel stack">
      <h2>تعذّر تحميل بياناتك</h2><p className="muted small">{error}</p>
      <button className="btn primary" onClick={() => location.reload()}>أعد المحاولة</button>
    </div></div>
  )
  if (loading) return <Splash text="نجهّز محفظتك…" />
  if (needsSetup) return <>{<Onboarding />}{toast && <div className="toast" role="status">{toast}</div>}</>
  if (!settings) return <NoAccess />

  const current: Route = readOnly && VIEWER_HIDDEN.includes(route) ? 'home' : route
  const tab = PARENT[current] ?? current
  const isMain = MAIN.includes(current)
  const page: Record<Route, ReactNode> = {
    home: <Home go={go} />, portfolio: <Portfolio go={go} />, goals: <Goals />, watch: <Watchlist />, asset: <Asset id={param} go={go} />,
    update: <QuickUpdate go={go} />, deposit: <Deposit param={param} />, income: <Payouts />, analysis: <Analysis />, networth: <NetWorth />,
    me: <Me go={go} />, calendar: <Calendar />, activity: <Activity />, import: <Import />, report: <Report />, plan: <Plan go={go} param={param} />, design: <Design param={param} />,
    review: <Review go={go} />, settings: <Settings />,
  }
  // a sidebar entry is current when it is the page itself, or the page's parent when the page has no entry of its own
  const sideActive = (r: Route) => r === current || (r === tab && !PRIMARY.some((n) => n.r === current))
  const secondary = readOnly ? SECONDARY.filter((n) => !VIEWER_HIDDEN.includes(n.r)) : SECONDARY

  return (
    <LockGate>
    <div className="app">
      <nav className="sidebar" aria-label="التنقل">
        <div className="brand"><img src="./icons/icon-192.png" width={34} height={34} alt="" style={{ borderRadius: 10 }} /><b>مسار</b></div>
        {!readOnly && <button className="btn primary side-add" onClick={() => setAction('sheet')}><IconPlus /> إضافة</button>}
        {PRIMARY.map((n) => (
          <button key={n.r} className="side-link" aria-current={sideActive(n.r) ? 'page' : undefined} onClick={() => go(n.r)}><n.icon />{n.label}</button>
        ))}
        <div className="side-group">المزيد</div>
        {secondary.map((n) => (
          <button key={n.r} className="side-link" aria-current={current === n.r ? 'page' : undefined} onClick={() => go(n.r)}><n.icon />{n.label}</button>
        ))}
        <div className="side-foot">{readOnly ? <span className="save-dot">للاطلاع فقط</span> : <span className="save-dot" data-s={save}>{saveText(save)}</span>}</div>
      </nav>
      <main className="main">
        <TopBar route={current} isMain={isMain} go={go} save={save} readOnly={readOnly} />
        {readOnly && current === 'home' && <div className="viewer-banner"><IconEye width={18} height={18} /><span><b>وضع المتابعة</b>: ترى المحفظة أولاً بأول، والتعديل لصاحبها.</span></div>}
        <div className="page" key={current + param}>{page[current]}</div>
      </main>
      <nav className="tabbar" aria-label="التنقل الرئيسي">
        {TABS[0].map((n) => <TabButton key={n.r} n={n} active={tab === n.r} onClick={() => go(n.r)} />)}
        {!readOnly && <div className="fab-slot"><button className="fab" aria-label="إضافة" onClick={() => { haptic(12); setAction('sheet') }}><IconPlus /></button></div>}
        {TABS[1].map((n) => <TabButton key={n.r} n={n} active={tab === n.r} onClick={() => go(n.r)} />)}
      </nav>
      {action === 'sheet' && <ActionSheet go={go} onPick={(k) => setAction(k)} onClose={closeAction} />}
      {action === 'asset' && <AddAssetSheet onClose={closeAction} />}
      {action === 'payout' && <RecordPayoutSheet initial={{ date: todayISO() }} onClose={closeAction} />}
      {action === 'tx' && <TxSheet initial={{ kind: 'withdrawal', tx_date: todayISO(), amount_sar: 0, currency: 'SAR', source: 'manual' }} onClose={closeAction} />}
      {action === 'rebalance' && <RebalanceSheet param={req?.param} onClose={closeAction} />}
      {action === 'treasury' && <TreasurySheet param={req?.param} onClose={closeAction} />}
      {action === 'withdraw' && <WithdrawSheet param={req?.param} onClose={closeAction} />}
      {action === 'emergency' && <EmergencySheet param={req?.param} onClose={closeAction} />}
      {action === 'buy' && <BuySheet key={req?.param ?? ''} param={req?.param} onClose={closeAction} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
    </LockGate>
  )
}

function TabButton({ n, active, onClick }: { n: Nav; active: boolean; onClick: () => void }) {
  return <button className="tab" aria-current={active ? 'page' : undefined} onClick={onClick}><n.icon />{n.label}</button>
}

function TopBar({ route, isMain, go, save, readOnly }: { route: Route; isMain: boolean; go: Go; save: string; readOnly: boolean }) {
  const [hidden, toggle] = usePrivacy()
  const { session } = useStore()
  const letter = (session?.user.email ?? 'م').charAt(0).toUpperCase()
  const back = () => { if (history.length > 1) history.back(); else go(PARENT[route] ?? 'home') }
  const showSave = save === 'saving' || save === 'error'
  return (
    <header className={`topbar ${isMain ? '' : 'sub'}`}>
      {!isMain && <button className="icon-btn" aria-label="رجوع" onClick={back} style={{ transform: 'scaleX(-1)' }}><IconChevron /></button>}
      {route === 'home'
        ? <div className="greet"><b>{greeting()}</b><span>{todayLabel()}</span></div>
        : <h1>{TITLES[route]}</h1>}
      {showSave && !readOnly && <span className="save-dot" data-s={save}>{saveText(save)}</span>}
      <button className="icon-btn" aria-label={hidden ? 'أظهر المبالغ' : 'أخفِ المبالغ'} aria-pressed={hidden} onClick={toggle}>{hidden ? <IconEyeOff /> : <IconEye />}</button>
      {isMain && <button className="icon-btn me-btn" aria-label="حسابي" onClick={() => go('me')}>{/^[a-z]$/i.test(letter) ? letter : <IconUser />}</button>}
    </header>
  )
}

type ActionTile = { key: string; icon: ReactNode; title: string; text: string; run: () => void; badge?: number }

function ActionSheet({ go, onPick, onClose }: { go: Go; onPick: (k: ActionKind) => void; onClose: () => void }) {
  const d = useDerived()
  const { doc, progress } = usePlan()
  const stale = d?.staleManual.length ?? 0
  const to = (r: Route) => { onClose(); go(r) }
  const tiles: ActionTile[] = [
    { key: 'deposit', icon: <IconDeposit />, title: 'إيداع جديد', text: 'قسّم مبلغاً على محفظتك وأهدافك', run: () => to('deposit') },
    { key: 'asset', icon: <IconWallet />, title: 'أصل جديد', text: 'سهم، صندوق، مرابحة أو غيرها', run: () => onPick('asset') },
    { key: 'update', icon: <IconPencil />, title: 'تحديث القيم', text: 'حدّث الأصول اليدوية دفعة واحدة', run: () => to('update'), badge: stale },
    { key: 'payout', icon: <IconCoins />, title: 'توزيع وصلني', text: 'سجّل أرباحاً نقدية استلمتها', run: () => onPick('payout') },
    { key: 'import', icon: <IconImport />, title: 'استيراد من دراهم', text: 'التقرير الشهري أو ملف العمليات', run: () => to('import') },
    { key: 'tx', icon: <IconCash />, title: 'عملية أخرى', text: 'سحب، زكاة مدفوعة، رسوم', run: () => onPick('tx') },
  ]
  // from the active plan: the emergency fund and the income account
  const em = progress?.emergency
  const tr = progress?.treasury
  const plan: ActionTile[] = []
  if (em?.enabled) plan.push({ key: 'emergency', icon: <IconShield />, title: 'صندوق الطوارئ', text: em.shortfall > 0.5 ? 'أكمل احتياطيك' : 'أضف إلى احتياطيك', run: () => onPick('emergency') })
  if (doc?.income && tr) {
    plan.push({ key: 'treasury', icon: <IconBuilding />, title: 'حساب الدخل', text: 'بيع من المحفظة أو إيداع مباشر', run: () => onPick('treasury') })
    if (tr.started) plan.push({ key: 'withdraw', icon: <IconIncome />, title: 'تحويل الدخل الشهري', text: 'من حساب الدخل إلى حسابك', run: () => onPick('withdraw') })
  }
  const tile = (t: ActionTile, wide = false) => (
    <button key={t.key} type="button" className={`action-tile ${wide ? 'wide' : ''}`} onClick={() => { haptic(); t.run() }}>
      <span className="ico">{t.icon}</span>
      <b>{t.title}</b>
      <span>{t.text}</span>
      {!!t.badge && <i className="badge">{t.badge}</i>}
    </button>
  )
  return (
    <Sheet title="ماذا تريد أن تفعل؟" onClose={onClose}>
      <div className="action-grid">{tiles.map((t) => tile(t))}</div>
      {plan.length > 0 && <>
        <div className="action-group">من خطتك</div>
        {/* an odd last tile takes the whole row so the grid stays even */}
        <div className="action-grid">{plan.map((t, i) => tile(t, plan.length % 2 === 1 && i === plan.length - 1))}</div>
      </>}
    </Sheet>
  )
}

const saveText = (s: string) => (s === 'saving' ? 'يحفظ…' : s === 'saved' ? 'محفوظ' : s === 'error' ? 'لم يُحفظ' : 'متزامن')

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
      markUnlocked()
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
        <p className="lead">محفظتك في مكان واحد: قيمتها وأداؤها، وتوزيعاتها، وأين تضع ريالك القادم.</p>
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
