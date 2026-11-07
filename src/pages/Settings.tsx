import { useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { ago, dateLong, sar, todayISO } from '../lib/format'
import type { Account } from '../lib/types'
import { Segmented, SelectField, Sheet, Switch, TextField } from '../components/ui'
import { IconPlus, IconRefresh } from '../components/icons'

type Theme = 'auto' | 'light' | 'dark'
export const applyTheme = (t: Theme) => {
  if (t === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
}

export default function Settings() {
  const store = useStore()
  const { ibkr, saveIbkr, clearIbkr, refreshMarket, refreshing, notify, accounts, session, settings, updateSettings, signOut } = store
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
      holdings: store.holdings, transactions: store.transactions, events: store.events, snapshots: store.snapshots,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `masar-backup-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

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

      <section className="section">
        <div className="section-head"><h2>المظهر والتثبيت</h2></div>
        <div className="panel stack">
          <div className="row between wrap"><span>المظهر</span>
            <Segmented label="المظهر" value={theme} onChange={(t) => { setTheme(t); localStorage.setItem('masar-theme', t); applyTheme(t) }}
              options={[{ value: 'auto', label: 'تلقائي' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'داكن' }]} />
          </div>
          <hr className="rule" style={{ margin: '4px 0' }} />
          <p className="small"><b>على الماك:</b> افتح الرابط في Safari ثم القائمة «ملف» ← «إضافة إلى Dock»، أو في Chrome اضغط أيقونة التثبيت في شريط العنوان.</p>
          <p className="small"><b>على الأندرويد:</b> افتح الرابط في Chrome ثم القائمة ⋮ ← «تثبيت التطبيق».</p>
          <p className="small muted">سجّل الدخول بالحساب نفسه على الجهازين، وكل تعديل يظهر على الآخر خلال ثوانٍ.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>بياناتك</h2></div>
        <div className="panel stack">
          <p className="small muted">مسجّل باسم <span className="ltr">{session?.user.email}</span>. بياناتك محفوظة في قاعدة بياناتك على Supabase، ولا يراها غيرك.</p>
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
