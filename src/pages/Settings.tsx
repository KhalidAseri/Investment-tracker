import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ago, dateLong, sar, todayISO } from '../lib/format'
import type { Account, Viewer } from '../lib/types'
import { supabase } from '../lib/supabase'
import { disablePush, enablePush, pushState, testPush, type PushState } from '../lib/push'
import { Segmented, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus, IconRefresh } from '../components/icons'
import { disableLock, enableLock, lockAvailable, lockConfig, setLockMinutes } from '../lib/lock'

type Theme = 'auto' | 'light' | 'dark'
export const applyTheme = (t: Theme) => {
  if (t === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

export default function Settings() {
  const store = useStore()
  const { ibkr, saveIbkr, clearIbkr, refreshMarket, refreshing, notify, accounts, session, settings, updateSettings, signOut, readOnly } = store
  const d = useDerived()
  const [queryId, setQueryId] = useState(ibkr?.query_id ?? '')
  const [token, setToken] = useState('')
  const [editing, setEditing] = useState<Partial<Account> | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('masar-theme') as Theme) || 'auto')
  const connected = !!ibkr?.query_id

  const connect = async () => {
    if (!queryId.trim() || (!token.trim() && !connected)) { notify('أدخل رقم التقرير والرمز'); return }
    const ok = await saveIbkr(queryId.trim(), token.trim())
    if (!ok) return
    setToken('')
    notify('حُفظ الربط؛ جارٍ جلب التقرير…')
    const r = await refreshMarket('ibkr')
    notify(r.message)
  }

  const exportData = () => {
    const data = {
      exported_at: new Date().toISOString(), settings: store.settings, sleeves: store.sleeves, accounts: store.accounts,
      holdings: store.holdings, transactions: store.transactions, events: store.events, snapshots: store.snapshots, watchlist: store.watchlist,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `masar-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const appearance = (
    <section className="section">
      <div className="section-head"><h2>المظهر والتثبيت</h2></div>
      <div className="panel stack">
        <div className="row between wrap"><span>المظهر</span>
          <Segmented label="المظهر" value={theme} onChange={(t) => { setTheme(t); localStorage.setItem('masar-theme', t); applyTheme(t) }}
            options={[{ value: 'auto', label: 'تلقائي' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'داكن' }]} />
        </div>
        <hr className="rule" style={{ margin: '4px 0' }} />
        <p className="small"><b>على الآيفون:</b> افتح الرابط في Safari ثم زر المشاركة ← «إضافة إلى الشاشة الرئيسية».</p>
        <p className="small"><b>على الماك:</b> افتح الرابط في Safari ثم القائمة «ملف» ← «إضافة إلى Dock»، أو في Chrome اضغط أيقونة التثبيت في شريط العنوان.</p>
        <p className="small"><b>على الأندرويد:</b> افتح الرابط في Chrome ثم القائمة ⋮ ← «تثبيت التطبيق».</p>
        <p className="small muted">سجّل الدخول بالحساب نفسه على أجهزتك، وكل تعديل يظهر على الأخرى خلال ثوانٍ.</p>
      </div>
    </section>
  )

  if (readOnly) return (
    <>
      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head"><h2>وضع المتابعة</h2></div>
        <div className="panel stack">
          <p className="small">أنت تتابع هذه المحفظة للاطلاع فقط: ترى الأرقام والخطة والتقدم كما هي، ولا يمكنك تعديل شيء. أي تغيير يجريه صاحبها يظهر لك فوراً.</p>
          <p className="small muted">في صفحة «المستقبل» يمكنك تجربة الأرقام بحرية؛ تجاربك لا تُحفظ ولا تغيّر خطته.</p>
        </div>
      </section>
      {appearance}
      <section className="section">
        <div className="section-head"><h2>حسابك</h2></div>
        <div className="panel stack">
          <p className="small muted">مسجّل باسم <span className="ltr">{session?.user.email}</span>.</p>
          <div><button className="btn danger" onClick={() => { if (confirm('تسجيل الخروج من هذا الجهاز؟')) signOut() }}>تسجيل الخروج</button></div>
        </div>
      </section>
    </>
  )

  return (
    <>
      <section className="section" style={{ marginTop: 0 }}>
        <div className="section-head"><h2>ربط Interactive Brokers</h2>
          {connected && <span className={`chip ${ibkr?.last_status === 'error' ? 'bad' : ibkr?.last_status === 'ok' ? 'accent' : ''}`}>
            {ibkr?.last_status === 'error' ? 'تعذّرت آخر مزامنة' : ibkr?.last_status === 'ok' ? 'متصل' : 'لم يُزامَن بعد'}</span>}
        </div>
        <div className="panel stack">
          <p className="small">يقرأ التطبيق تقريراً يومياً من حسابك (للقراءة فقط) كل صباح الساعة 5، فتتحدث الأصول العالمية وعملياتها وتوزيعاتها دون كلمة مرورك.</p>
          {connected && <p className="small muted">آخر مزامنة {ago(ibkr?.last_sync_at)}{ibkr?.last_message ? `: ${ibkr.last_message}` : ''}</p>}
          <div className="grid2">
            <TextField label="رقم التقرير (Query ID)" value={queryId} onChange={setQueryId} ltr placeholder="123456" />
            <label className="field"><span>الرمز (Token)</span>
              <input className="input" type="password" dir="ltr" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={connected ? 'محفوظ؛ اكتب رمزاً جديداً لتغييره' : ''} />
            </label>
          </div>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn primary" disabled={refreshing} onClick={connect}>{refreshing ? <IconRefresh className="spin" /> : null}احفظ وزامن الآن</button>
            {connected && <button className="btn ghost" disabled={refreshing} onClick={async () => notify((await refreshMarket('ibkr')).message)}>زامن الآن</button>}
            {connected && <button className="btn danger" onClick={async () => { if (confirm('إلغاء الربط وحذف الرمز من الخادم؟')) { await clearIbkr(); setQueryId(''); notify('أُلغي الربط') } }}>إلغاء الربط</button>}
          </div>
          <details>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>كيف أحصل على الرقم والرمز؟</summary>
            <ol className="steps small" style={{ marginTop: 10 }}>
              <li>ادخل إلى بوابة IBKR من المتصفح (Client Portal).</li>
              <li>افتح <span className="kbd">Performance &amp; Reports</span> ثم <span className="kbd">Flex Queries</span>.</li>
              <li>بجانب <span className="kbd">Activity Flex Query</span> اضغط + وسمِّ التقرير «مسار».</li>
              <li>اختر الأقسام الأربعة: <span className="kbd">Open Positions</span> و<span className="kbd">Trades</span> و<span className="kbd">Cash Transactions</span> و<span className="kbd">Cash Report</span>، وحدّد كل الحقول في كل قسم.</li>
              <li>اجعل الصيغة <span className="kbd">XML</span> والفترة <span className="kbd">Last 30 Calendar Days</span>، ثم احفظ. الرقم الظاهر بجانب اسم التقرير هو رقم التقرير.</li>
              <li>في الصفحة نفسها افتح <span className="kbd">Flex Web Service Configuration</span>، فعّل الخدمة، واضغط <span className="kbd">Generate</span> لإنشاء الرمز بأطول صلاحية متاحة.</li>
              <li>الصق الرقم والرمز هنا واضغط «احفظ وزامن الآن». إذا انتهت صلاحية الرمز ستظهر لك رسالة لتجديده.</li>
            </ol>
          </details>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>الحسابات</h2>
          <button className="btn quiet small" onClick={() => setEditing({ name: '', kind: 'broker', is_ibkr: false, exclude_from_portfolio: false, sort: accounts.length + 1 })}><IconPlus /> حساب</button>
        </div>
        <div className="panel flush">
          {accounts.map((a) => (
            <button key={a.id} className="list-item" onClick={() => setEditing(a)}>
              <div className="grow"><div>{a.name}</div><div className="meta">{a.note ?? ''}{a.exclude_from_portfolio ? ' (خارج المحفظة)' : ''}</div></div>
              <div className="amount">{sar(d?.totals.byAccount[a.id] ?? 0)}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>المقارنة بالخطة</h2></div>
        <div className="panel stack">
          <p className="small">تُقاس «متقدم أو متأخر» من نقطة بداية: {settings?.baseline_value ? <><b className="figure">{sar(settings.baseline_value)}</b> بتاريخ {dateLong(settings.baseline_date)}</> : 'لم تُحدَّد بعد'}.</p>
          <button className="btn ghost" onClick={() => { if (d && confirm('اعتماد قيمة اليوم نقطة بداية جديدة للمقارنة؟')) { updateSettings({ baseline_value: Math.round(d.totals.total), baseline_date: todayISO() }); notify('اعتُمدت قيمة اليوم نقطة بداية') } }}>
            ابدأ المقارنة من اليوم
          </button>
        </div>
      </section>

      <AppLock />
      <Notifications />
      <Sharing />
      {appearance}

      <section className="section">
        <div className="section-head"><h2>بياناتك</h2></div>
        <div className="panel stack">
          <p className="small muted">مسجّل باسم <span className="ltr">{session?.user.email}</span>. بياناتك محفوظة في قاعدة بياناتك على Supabase، ولا يراها إلا من تضيفه للمتابعة.</p>
          <div className="row wrap" style={{ gap: 10 }}>
            <button className="btn ghost" onClick={exportData}>نزّل نسخة احتياطية</button>
            <button className="btn danger" onClick={() => { if (confirm('تسجيل الخروج من هذا الجهاز؟')) signOut() }}>تسجيل الخروج</button>
          </div>
        </div>
      </section>

      {editing && <AccountSheet initial={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function AccountSheet({ initial, onClose }: { initial: Partial<Account>; onClose: () => void }) {
  const { upsert, remove, notify } = useStore()
  const [a, setA] = useState<Partial<Account>>(initial)
  const set = (p: Partial<Account>) => setA((v) => ({ ...v, ...p }))
  const saveIt = async () => {
    if (!a.name?.trim()) { notify('اكتب اسم الحساب'); return }
    const ok = await upsert('accounts', { id: a.id, name: a.name.trim(), kind: a.kind ?? 'broker', is_ibkr: !!a.is_ibkr, exclude_from_portfolio: !!a.exclude_from_portfolio, note: a.note || null, sort: a.sort ?? 9 })
    if (ok) { notify('حُفظ الحساب'); onClose() }
  }
  return (
    <Sheet title={a.id ? 'تعديل حساب' : 'حساب جديد'} onClose={onClose} footer={<>
      {a.id && <button className="btn danger" onClick={async () => { if (confirm('حذف الحساب؟ ستبقى أصوله بلا حساب.')) { await remove('accounts', a.id!); onClose() } }}>حذف</button>}
      <button className="btn primary" onClick={saveIt}>حفظ</button>
    </>}>
      <div className="stack">
        <TextField label="الاسم" value={a.name ?? ''} onChange={(v) => set({ name: v })} />
        <SelectField label="النوع" value={a.kind ?? 'broker'} onChange={(v) => set({ kind: v as Account['kind'] })}
          options={[{ value: 'broker', label: 'وسيط' }, { value: 'bank', label: 'بنك' }, { value: 'savings_program', label: 'برنامج ادخار' }, { value: 'other', label: 'أخرى' }]} />
        <Switch label="هذا حساب IBKR" hint="تُضاف إليه المراكز القادمة من التقرير اليومي" checked={!!a.is_ibkr} onChange={(v) => set({ is_ibkr: v })} />
        <Switch label="خارج المحفظة" hint="مثل صندوق الطوارئ: يظهر لكن لا يُحسب في الأوزان ولا الهدف" checked={!!a.exclude_from_portfolio} onChange={(v) => set({ exclude_from_portfolio: v })} />
        <TextField label="ملاحظة" value={a.note ?? ''} onChange={(v) => set({ note: v })} />
      </div>
    </Sheet>
  )
}

const PUSH_TEXT: Record<PushState, string> = {
  on: 'مفعّلة على هذا الجهاز',
  off: 'غير مفعّلة على هذا الجهاز',
  denied: 'محظورة من المتصفح',
  unsupported: 'غير مدعومة في هذا المتصفح',
  'needs-install': 'ثبّت التطبيق أولاً',
}

function AppLock() {
  const { notify, session } = useStore()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [cfg, setCfg] = useState(lockConfig())
  const [minutes, setMinutes] = useState(String(cfg?.minutes ?? 5))
  const [busy, setBusy] = useState(false)
  useEffect(() => { lockAvailable().then(setAvailable) }, [])
  const toggle = async (on: boolean) => {
    if (!on) { disableLock(); setCfg(null); notify('أُلغي القفل على هذا الجهاز'); return }
    setBusy(true)
    const r = await enableLock(session?.user.email ?? '', Number(minutes))
    setBusy(false)
    if (r.ok) { setCfg(lockConfig()); notify('فُعّل القفل بالبصمة') } else notify(r.error ?? 'تعذّر التفعيل')
  }
  return (
    <section className="section">
      <div className="section-head"><h2>القفل بالبصمة</h2>{cfg && <span className="chip accent ok">مفعّل</span>}</div>
      <div className="panel stack">
        {available === false ? (
          <p className="small muted">هذا الجهاز أو المتصفح لا يدعم بصمة الوجه أو الإصبع للمواقع. على الآيفون أضف التطبيق إلى الشاشة الرئيسية، وعلى الماك استخدم Safari أو Chrome مع Touch ID.</p>
        ) : <>
          <Switch label="اطلب Face ID أو البصمة عند فتح التطبيق" hint="يخص هذا الجهاز فقط؛ فعّله على كل جهاز تستخدمه" checked={!!cfg} onChange={(v) => { if (!busy) toggle(v) }} />
          <SelectField label="أقفله بعد مغادرته" value={minutes} onChange={(v) => { setMinutes(v); if (cfg) { setLockMinutes(Number(v)); setCfg(lockConfig()) } }}
            options={[{ value: '0', label: 'فوراً' }, { value: '1', label: 'بعد دقيقة' }, { value: '5', label: 'بعد 5 دقائق' }, { value: '15', label: 'بعد 15 دقيقة' }]} />
          <p className="tiny muted">إن تعذّرت البصمة يمكنك الدخول بكلمة المرور دائماً.</p>
        </>}
      </div>
    </section>
  )
}

function Notifications() {
  const { notify } = useStore()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const refresh = useCallback(() => { pushState().then(setState) }, [])
  useEffect(refresh, [refresh])
  const run = async (fn: () => Promise<{ ok: boolean; message: string } | void>) => {
    setBusy(true)
    try { const r = await fn(); if (r) notify(r.message) } finally { setBusy(false); refresh() }
  }
  return (
    <section className="section">
      <div className="section-head"><h2>الإشعارات</h2>
        {state && <span className={`chip ${state === 'on' ? 'accent ok' : state === 'denied' ? 'bad' : 'off'}`}>{PUSH_TEXT[state]}</span>}
      </div>
      <div className="panel stack">
        <p className="small">يصلك إشعار على هذا الجهاز صباحاً عند:</p>
        <ul className="steps small" style={{ margin: 0 }}>
          <li>اقتراب موعد في التقويم بثلاثة أيام (المكافأة، السلفة، الزكاة، المراجعة).</li>
          <li>ابتعاد طبقة عن وزنها المستهدف أكثر من الحد الذي اخترته (مرة في الأسبوع على الأكثر).</li>
          <li>وصول سهم في قائمة المراقبة إلى سعر الشراء.</li>
          <li>تعذّر مزامنة IBKR.</li>
        </ul>
        {state === 'needs-install' && <p className="small warn">على الآيفون تعمل الإشعارات بعد إضافة التطبيق إلى الشاشة الرئيسية وفتحه منها.</p>}
        {state === 'denied' && <p className="small warn">سمحت سابقاً بحظر الإشعارات لهذا الموقع. افتح إعدادات الموقع في المتصفح واسمح بالإشعارات، ثم عد هنا.</p>}
        {state === 'unsupported' && <p className="small muted">جرّب Chrome على الأندرويد، أو Safari أو Chrome على الماك.</p>}
        <div className="row wrap" style={{ gap: 10 }}>
          {(state === 'off' || state === 'denied') && <button className="btn primary" disabled={busy} onClick={() => run(enablePush)}>فعّل الإشعارات على هذا الجهاز</button>}
          {state === 'on' && <>
            <button className="btn ghost" disabled={busy} onClick={() => run(testPush)}>أرسل إشعاراً تجريبياً</button>
            <button className="btn danger" disabled={busy} onClick={() => run(async () => { await disablePush(); return { ok: true, message: 'أُوقفت الإشعارات على هذا الجهاز' } })}>أوقفها</button>
          </>}
        </div>
        <p className="tiny muted">فعّلها على كل جهاز تريد أن تصله الإشعارات عليه.</p>
      </div>
    </section>
  )
}

function Sharing() {
  const { notify } = useStore()
  const [viewers, setViewers] = useState<Viewer[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('portfolio_viewers').select('*').order('created_at')
    setViewers((data ?? []) as Viewer[])
  }, [])
  useEffect(() => { load() }, [load])
  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { notify('اكتب بريداً إلكترونياً صحيحاً'); return }
    setBusy(true)
    const { error } = await supabase.from('portfolio_viewers').insert({ viewer_email: e })
    setBusy(false)
    if (error) { notify(/duplicate|unique/i.test(error.message) ? 'هذا البريد مضاف مسبقاً' : 'تعذّرت الإضافة: ' + error.message); return }
    setEmail('')
    notify('أُضيف. أرسل له رابط التطبيق لينشئ حسابه بهذا البريد.')
    load()
  }
  const removeViewer = async (v: Viewer) => {
    if (!confirm(`إيقاف متابعة ${v.viewer_email}؟`)) return
    await supabase.from('portfolio_viewers').delete().eq('id', v.id)
    notify('أُوقفت المتابعة')
    load()
  }
  return (
    <section className="section">
      <div className="section-head"><h2>المتابعة العائلية</h2></div>
      <div className="panel stack">
        <p className="small">أضف بريد من تريد أن يتابع التقدم من جهازه، مثل زوجتك أو أحد أفراد أسرتك: يرى المحفظة والخطة والتوقعات والتقويم، ولا يستطيع التعديل، ولا يرى رمز IBKR.</p>
        {viewers && viewers.length > 0 && (
          <div className="panel flush">
            {viewers.map((v) => (
              <div key={v.id} className="list-item" style={{ cursor: 'default' }}>
                <div className="grow"><div className="ltr">{v.viewer_email}</div><div className="meta">للاطلاع فقط</div></div>
                <button className="btn danger small" onClick={() => removeViewer(v)}>إيقاف</button>
              </div>
            ))}
          </div>
        )}
        <div className="row wrap" style={{ gap: 10, alignItems: 'flex-end' }}>
          <label className="field grow" style={{ minWidth: 220 }}><span>البريد الإلكتروني</span>
            <input className="input" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com"
              onKeyDown={(e) => { if (e.key === 'Enter') add() }} /></label>
          <button className="btn primary" disabled={busy} onClick={add}>أضف</button>
        </div>
        <ol className="steps small" style={{ margin: 0 }}>
          <li>أضف بريده هنا.</li>
          <li>أرسل له رابط التطبيق، ويختار «أول مرة؟ أنشئ حسابك» بالبريد نفسه وكلمة مرور خاصة به.</li>
          <li>يثبّت التطبيق على جواله، فيرى التقدم أولاً بأول.</li>
        </ol>
      </div>
    </section>
  )
}
