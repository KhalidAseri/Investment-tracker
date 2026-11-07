import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import { haptic } from '../lib/ui'
import { Chev } from '../components/kit'
import {
  IconCalendar, IconChart, IconDoc, IconImport, IconList, IconLogout, IconScale, IconSettings, IconTarget, IconUser, IconPencil, IconDeposit, IconLink,
} from '../components/icons'
import type { Go, Route } from '../App'

type Item = { r: Route; icon: ReactNode; title: string; sub: string; owner?: boolean }
const GROUPS: Array<{ title: string; items: Item[] }> = [
  { title: 'محفظتي', items: [
    { r: 'deposit', icon: <IconDeposit />, title: 'إيداع جديد', sub: 'قسّم مبلغاً على طبقاتك وأهدافك', owner: true },
    { r: 'update', icon: <IconPencil />, title: 'تحديث القيم', sub: 'الأصول التي تُدخل قيمتها بنفسك', owner: true },
    { r: 'plan', icon: <IconTarget />, title: 'الخطة', sub: 'المراحل والأوزان والتصدير والاستيراد' },
    { r: 'analysis', icon: <IconChart />, title: 'التحليل', sub: 'الأداء والتنويع والتكاليف' },
    { r: 'networth', icon: <IconScale />, title: 'صافي الثروة', sub: 'العقار والأصول الأخرى والديون' },
  ] },
  { title: 'السجلات', items: [
    { r: 'activity', icon: <IconList />, title: 'العمليات', sub: 'الإيداعات والتوزيعات والسحوبات' },
    { r: 'calendar', icon: <IconCalendar />, title: 'التقويم', sub: 'المكافأة والزكاة والمواعيد المهمة' },
    { r: 'report', icon: <IconDoc />, title: 'التقرير السنوي', sub: 'ملخص السنة للطباعة أو الحفظ' },
  ] },
  { title: 'البيانات والتطبيق', items: [
    { r: 'import', icon: <IconImport />, title: 'الاستيراد من دراهم', sub: 'التقرير الشهري أو ملف العمليات', owner: true },
    { r: 'settings', icon: <IconLink />, title: 'الحسابات وربط IBKR', sub: 'منصاتك والربط الآلي', owner: true },
    { r: 'settings', icon: <IconSettings />, title: 'الإعدادات', sub: 'الإشعارات والبصمة والمتابعة العائلية والمظهر' },
  ] },
]

export default function Me({ go }: { go: Go }) {
  const { session, readOnly, signOut } = useStore()
  const email = session?.user.email ?? ''
  return (
    <>
      <section className="card me-head">
        <span className="avatar" style={{ width: 54, height: 54, fontSize: 22, background: 'linear-gradient(145deg, var(--hero-3), var(--hero-1))' }}>
          {/^[a-z]/i.test(email) ? email[0].toUpperCase() : <IconUser width={24} height={24} />}
        </span>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="ltr" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</b>
          <span className="small muted">{readOnly ? 'تتابع المحفظة للاطلاع فقط' : 'صاحب المحفظة'}</span>
        </div>
      </section>
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => !(readOnly && i.owner))
        if (!items.length) return null
        return (
          <section key={g.title} className="section">
            <div className="section-head"><h2>{g.title}</h2></div>
            <div className="card flush">
              {items.map((i) => (
                <button key={i.title} type="button" className="attn" onClick={() => go(i.r)}>
                  <span className="ico">{i.icon}</span>
                  <p>{i.title}<small>{i.sub}</small></p>
                  <Chev />
                </button>
              ))}
            </div>
          </section>
        )
      })}
      <section className="section">
        <button type="button" className="btn ghost block" onClick={() => { haptic(); if (confirm('تسجيل الخروج من هذا الجهاز؟')) signOut() }}><IconLogout /> تسجيل الخروج</button>
      </section>
    </>
  )
}
