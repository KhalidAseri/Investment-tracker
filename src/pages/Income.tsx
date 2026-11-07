import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { dateShort, monthName, pct, relativeDays, sar, sarShort, todayISO } from '../lib/format'
import { incomeEngine, monthDone, type EngineStep } from '../lib/income'
import type { PlanSettings } from '../lib/types'
import { NumberField, Segmented, SelectField } from '../components/ui'
import { IconCheck } from '../components/icons'

const METHOD_HELP: Record<PlanSettings['income_method'], string> = {
  value: 'كل يناير تأخذ نسبة ثابتة من قيمة المحفظة. الدخل يتبع السوق، وقواعد الحماية تمنع القفزات الكبيرة صعوداً أو هبوطاً.',
  profit: 'تأخذ حصة من ربح السنة الماضية فقط، فلا يُمس رأس المال. الدخل يتذبذب أكثر، والاحتياطي يغطي السنوات الضعيفة.',
  fixed: 'تحدّد مبلغاً شهرياً ثابتاً يزيد مع التضخم. الأبسط، لكن راقب نسبته من المحفظة حتى لا تتجاوز الحد الآمن.',
}

export default function Income() {
  const store = useStore()
  const { settings, updateSettings, readOnly, transactions, accounts, upsert, notify, sleeves, holdings, fx, snapshots } = store
  const d = useDerived()
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [allMonths, setAllMonths] = useState(false)
  const today = todayISO()
  const thisYear = new Date().getFullYear()

  const ifToday = useMemo(() => {
    if (!settings || !d || d.engine.started) return null
    const projectedAt = (y: number) => (d.proj.find((p) => p.year >= y) ?? d.proj[d.proj.length - 1]).mid
    return incomeEngine({ s: { ...settings, income_start_year: thisYear, income_approved_year: null }, totals: d.totals, sleeves, holdings, fx, snapshots, transactions, projectedAt })
  }, [settings, d, sleeves, holdings, fx, snapshots, transactions, thisYear])

  if (!settings || !d) return null
  const s = settings
  const e = d.engine
  const fromDist = Math.min(e.distributions, e.annual)
  const fromReserve = Math.max(0, e.annual - fromDist)
  const reserveAcc = accounts.find((a) => a.id === s.reserve_account_id)
  const reserveName = reserveAcc?.name ?? 'حساب الاحتياطي'
  const monthly = e.steps.filter((x) => x.kind === 'monthly')
  const upcomingMonths = monthly.filter((x) => x.date >= today).slice(0, 2).map((x) => x.key)
  const visibleSteps: EngineStep[] = !e.started
    ? [...e.steps.filter((x) => x.kind !== 'monthly'), { ...monthly[0], key: 'monthly-all', title: `التحويل الشهري، يوم ${s.income_transfer_day} من كل شهر`, detail: `12 تحويلاً من الاحتياطي إلى حسابك، مجموعها ${sar(e.annual)}` }]
    : allMonths ? e.steps
    : e.steps.filter((x) => x.kind !== 'monthly' || upcomingMonths.includes(x.key) || (x.date < today && !monthDone(transactions, x.date)))
  const hiddenMonths = e.steps.length - visibleSteps.length

  const recordMonth = async (st: EngineStep) => {
    setBusyKey(st.key)
    const ok = await upsert('transactions', {
      tx_date: st.date <= today ? st.date : today, kind: 'withdrawal', amount_sar: Math.round(st.amount ?? e.monthly), account_id: reserveAcc?.id ?? null,
      currency: 'SAR', source: 'manual', note: `التحويل الشهري لشهر ${monthName(Number(st.date.slice(5, 7)) - 1)}`,
    })
    setBusyKey(null)
    if (ok) notify('سُجّل التحويل الشهري')
  }

  return (
    <>
      <section className="status">
        <p className="kicker">{e.started ? `دخلك لعام ${e.year}` : `يبدأ دخلك في يناير ${e.startYear}`}</p>
        <p className="headline">
          <span className="figure">{sar(e.monthly)}</span> شهرياً{' '}
          {e.started && <span className={`chip ${e.approved ? 'accent' : 'warn'}`} style={{ verticalAlign: 'middle', fontSize: 13 }}>{e.approved ? 'معتمد' : 'مقترح'}</span>}
        </p>
        <p className="muted" style={{ marginTop: 6 }}>
          {e.started
            ? e.approved ? `يُحوَّل يوم ${s.income_transfer_day} من كل شهر من احتياطي الدخل في ${reserveName}.` : 'هذا ما تعطيه قاعدتك الآن. اعتمده في مراجعة يناير ليصبح دخل السنة الثابت.'
            : <>بقيمة ريال ذلك العام. {ifToday ? <>لو بدأ اليوم لكان <b className="figure">{sar(ifToday.monthly)}</b> شهرياً.</> : null}</>}
        </p>
        <p className="small" style={{ marginTop: 8 }}>
          يغطي <b className={e.coverage >= 0.98 ? 'good' : 'warn'}>{pct(Math.min(999, e.coverage * 100), 0)}</b> من دخلك المستهدف ({sar(e.need / 12)} شهرياً{e.started ? '' : ` في ${e.year}`}).
        </p>
        {!readOnly && e.started && (
          <div className="row wrap" style={{ gap: 10, marginTop: 12 }}>
            {!e.approved
              ? <button className="btn primary" onClick={() => { updateSettings({ income_approved_annual: Math.round(e.annual), income_approved_year: e.year }); notify(`اعتُمد دخل ${e.year}`) }}>اعتمد دخل {e.year}: {sar(e.annual)} سنوياً</button>
              : <button className="btn ghost small" onClick={() => { if (confirm('إلغاء اعتماد دخل هذا العام وإعادة حسابه؟')) updateSettings({ income_approved_annual: null, income_approved_year: null }) }}>أعد الحساب</button>}
          </div>
        )}
      </section>

      <div className="facts">
        <div className="fact"><div className="v">{sarShort(e.annual)}</div><div className="l">الدخل السنوي</div></div>
        <div className="fact"><div className="v">{pct(e.effRate)}</div><div className="l">من قيمة المحفظة</div></div>
        <div className="fact"><div className="v">{Math.floor(e.reserveMonths)} شهراً</div><div className="l">يغطيها احتياطي الدخل</div></div>
      </div>

      <section className="section">
        <div className="section-head"><h2>كيف حُسب</h2><p>{e.started ? 'خطوة بخطوة' : `تقدير لعام ${e.year}`}</p></div>
        <div className="panel flush">
          {e.ledger.map((l, i) => (
            <div key={i} className="list-item" style={{ cursor: 'default' }}>
              <div className="grow"><div style={{ fontWeight: l.strong ? 600 : undefined }}>{l.label}</div>{l.note && <div className="meta">{l.note}</div>}</div>
              <div className="amount" style={{ fontWeight: l.strong ? 600 : undefined }}>{l.value}</div>
            </div>
          ))}
        </div>
        {e.estimateNote && <p className="small muted" style={{ marginTop: 8 }}>{e.estimateNote}</p>}
      </section>

      <section className="section">
        <div className="section-head"><h2>من أين يأتي</h2></div>
        <div className="panel stack">
          <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--sunken)' }} role="img"
            aria-label={`التوزيعات ${pct((fromDist / (e.annual || 1)) * 100, 0)}، الاحتياطي ${pct((fromReserve / (e.annual || 1)) * 100, 0)}`}>
            <div style={{ width: `${(fromDist / (e.annual || 1)) * 100}%`, background: 'var(--income)' }} />
            <div style={{ width: `${(fromReserve / (e.annual || 1)) * 100}%`, background: 'var(--safety)' }} />
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row between small"><span><i className="dot" style={{ display: 'inline-block', background: 'var(--income)', marginInlineEnd: 6 }} />التوزيعات النقدية المتوقعة{e.distributionsEstimated ? ' (تقديرية)' : ''}</span><b className="figure">{sar(fromDist)}</b></div>
            <div className="row between small"><span><i className="dot" style={{ display: 'inline-block', background: 'var(--safety)', marginInlineEnd: 6 }} />من احتياطي الدخل</span><b className="figure">{sar(fromReserve)}</b></div>
          </div>
          {e.distributionsEstimated && <p className="tiny muted">{e.started ? 'لم تُدخل توزيعات أدواتك بعد، فقُدّرت من نسبة التوزيع لكل طبقة. أكملها من صفحة «التوزيعات».' : 'مقدّرة من نسبة التوزيع لكل طبقة عند أوزان الاستقلال.'}</p>}
          <hr className="rule" style={{ margin: '4px 0' }} />
          <div className="row between small"><span>احتياطي الدخل {e.started ? 'الآن' : 'المتوقع'}</span><b className="figure">{sar(e.reserveNow)}</b></div>
          <div className="row between small"><span>المطلوب ({s.reserve_months} شهراً من الدخل)</span><b className="figure">{sar(e.reserveTarget)}</b></div>
          <p className="tiny muted">الاحتياطي سيولة ومرابحة في {reserveName}، تُصرف منها التحويلات الشهرية، فلا تضطر للبيع وقت هبوط الأسواق.{!reserveAcc && !readOnly ? <> حدّد حسابه من <a href="#/profile">«وضعي المالي»</a>.</> : null}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>ماذا تبيع في {monthName(s.income_review_month - 1)}</h2></div>
        <div className="panel stack">
          {!e.started ? (
            <p className="small">يبدأ البيع السنوي مع بدء الدخل. كل {monthName(s.income_review_month - 1)} يحسب التطبيق ما ينقص الاحتياطي، ويقترح البيع من الطبقات الأعلى من وزنها المستهدف أولاً.</p>
          ) : e.skipSale ? (
            <p className="small warn">المحفظة أقل من أعلى قيمة لها بـ {e.drawdown.toFixed(0)}%. لا تبع هذا العام، واصرف من الاحتياطي حتى تتعافى الأسواق.</p>
          ) : e.sellAmount <= 0 ? (
            <p className="small good">الاحتياطي مع التوزيعات المتوقعة يكفي. لا حاجة للبيع هذا العام.</p>
          ) : <>
            <p className="small">بع <b className="figure">{sar(e.sellAmount)}</b> وانقلها إلى الاحتياطي، موزعة هكذا:</p>
            <div className="panel flush">
              {e.sells.map((x) => (
                <div key={x.sleeve.id} className="list-item" style={{ cursor: 'default' }}>
                  <div className="grow"><div>{x.sleeve.name}</div><div className="meta">{x.over > 0 ? `أعلى من وزنها بـ ${sarShort(x.over)}` : 'حسب حجمها'}</div></div>
                  <div className="amount">{sar(x.amount)}</div>
                </div>
              ))}
            </div>
          </>}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>{e.started ? `جدول ${e.year}` : `هكذا ستبدو سنتك في ${e.year}`}</h2></div>
        {e.started && (
          <div className="panel stack" style={{ marginBottom: 12 }}>
            <div className="row between small"><span>صرفت هذا العام</span><span><b className="figure">{sar(e.spent)}</b> من {sar(e.annual)}</span></div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--sunken)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (e.spent / (e.annual || 1)) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
            </div>
          </div>
        )}
        <div className="panel flush">
          {visibleSteps.map((st) => {
            const done = st.kind === 'monthly' ? monthDone(transactions, st.date) : st.kind === 'review' ? e.approved : false
            const due = st.date <= today
            return (
              <div key={st.key} className="list-item" style={{ cursor: 'default', opacity: e.started && done ? 0.7 : 1 }}>
                <div style={{ width: 62, flex: 'none', textAlign: 'center' }}>
                  <div className="small" style={{ fontWeight: 600 }}>{dateShort(st.date)}</div>
                  {e.started && <div className="tiny muted">{done ? 'تم' : relativeDays(st.date)}</div>}
                </div>
                <div className="grow"><div>{st.title}</div>{st.detail && <div className="meta">{st.detail}</div>}</div>
                <div className="amount">
                  {st.amount ? <>{sar(st.amount)}{st.key === 'monthly-all' ? <div className="tiny muted">كل شهر</div> : null}</> : null}
                  {e.started && done && <div className="good"><IconCheck width={16} height={16} /></div>}
                  {e.started && !done && due && st.kind === 'monthly' && !readOnly && (
                    <div><button className="btn quiet small" style={{ padding: '2px 0', minHeight: 0 }} disabled={busyKey === st.key} onClick={() => recordMonth(st)}>سجّله</button></div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {e.started && (hiddenMonths > 0 || allMonths) && (
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn ghost small" onClick={() => setAllMonths((v) => !v)}>{allMonths ? 'اعرض القادم فقط' : `اعرض كل الأشهر (${hiddenMonths} أخرى)`}</button>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>قواعد الدخل</h2></div>
        <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="panel stack">
            <Segmented label="طريقة حساب الدخل" value={s.income_method} onChange={(v) => updateSettings({ income_method: v })}
              options={[{ value: 'value', label: 'نسبة من القيمة' }, { value: 'profit', label: 'نسبة من الربح' }, { value: 'fixed', label: 'مبلغ ثابت' }]} />
            <p className="small muted">{METHOD_HELP[s.income_method]}</p>
            <div className="grid2">
              {s.income_method === 'value' && <NumberField label="نسبة السحب السنوية" value={s.withdrawal_rate} suffix="%" decimals={1} onChange={(v) => updateSettings({ withdrawal_rate: v })} hint={`الآمنة لعمر طويل ${s.safe_withdrawal_rate}%`} />}
              {s.income_method === 'profit' && <NumberField label="حصتك من الربح" value={s.income_profit_share} suffix="%" min={0} max={100} onChange={(v) => updateSettings({ income_profit_share: v })} hint="والباقي يبقى ليكبر رأس المال" />}
              {s.income_method === 'fixed' && <NumberField label="المبلغ الشهري" value={s.income_fixed_monthly ?? s.monthly_income_target} suffix="ريال" onChange={(v) => updateSettings({ income_fixed_monthly: v })} hint="بقيمة ريال اليوم" />}
              <NumberField label="احتياطي الدخل" value={s.reserve_months} suffix="شهراً" min={0} max={60} onChange={(v) => updateSettings({ reserve_months: Math.round(v) })} />
              <NumberField label="يوم التحويل الشهري" value={s.income_transfer_day} plain min={1} max={28} onChange={(v) => updateSettings({ income_transfer_day: Math.round(v) })} />
              <SelectField label="شهر المراجعة والبيع" value={String(s.income_review_month)} onChange={(v) => updateSettings({ income_review_month: Number(v) })}
                options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: monthName(i) }))} />
            </div>
            <div className="field">
              <span>سنة بدء الدخل</span>
              <div className="row wrap" style={{ gap: 8 }}>
                <Segmented label="سنة بدء الدخل" value={s.income_start_year && s.income_start_year <= thisYear ? 'now' : 'fi'}
                  onChange={(v) => updateSettings({ income_start_year: v === 'now' ? thisYear : null })}
                  options={[{ value: 'fi', label: `مع الاستقلال (${s.independence_year})` }, { value: 'now', label: 'من هذا العام' }]} />
              </div>
              <small>{s.income_start_year && s.income_start_year <= thisYear ? 'الدخل يعمل الآن: تظهر التحويلات الشهرية في التقويم وتصلك تنبيهاتها.' : 'غيّر سنة الاستقلال من صفحة «المستقبل».'}</small>
            </div>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>قواعد الحماية</summary>
              <div className="grid2" style={{ marginTop: 12 }}>
                <NumberField label="أقصى تغيير سنوي في الدخل" value={s.guard_cut} suffix="%" decimals={1} onChange={(v) => updateSettings({ guard_cut: v })} />
                <NumberField label="هبوط يوقف الزيادة والبيع" value={s.guard_drawdown} suffix="%" decimals={1} onChange={(v) => updateSettings({ guard_drawdown: v })} />
                <NumberField label="سحب مرتفع يستدعي الخفض" value={s.guard_high_rate} suffix="%" decimals={1} onChange={(v) => updateSettings({ guard_high_rate: v })} />
                <NumberField label="سحب منخفض يسمح بالزيادة" value={s.guard_low_rate} suffix="%" decimals={1} onChange={(v) => updateSettings({ guard_low_rate: v })} />
              </div>
              <p className="tiny muted" style={{ marginTop: 8 }}>تنطبق حدود التغيير السنوي على طريقة «نسبة من القيمة»، وقاعدة الهبوط على كل الطرق.</p>
            </details>
          </div>
        </fieldset>
        <p className="small muted" style={{ marginTop: 10 }}>
          لترى دخلك على مدى 35 سنة وتجرّب هبوط الأسواق، افتح <a href="#/outlook">«المستقبل»</a>. والتوزيعات بالتفصيل في <a href="#/payouts">«التوزيعات»</a>.
        </p>
      </section>
    </>
  )
}
