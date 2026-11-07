import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { dateLong, pct, sar, sarShort } from '../lib/format'
import { ASSET_KIND_LABEL, DEBT_LABEL, exposure, netWorth, otherAssetValue, payoffWithExtra, type Slice } from '../lib/wealth'
import type { Obligation, OtherAsset } from '../lib/types'
import { Empty, Knob } from '../components/ui'
import { IconPlus } from '../components/icons'
import { ObligationSheet, OtherAssetSheet, monthsText } from '../components/WealthSheets'

function Bars({ title, slices, color }: { title: string; slices: Slice[]; color: string }) {
  return (
    <div className="panel stack" style={{ gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {slices.length === 0 && <p className="small muted">لا أصول بعد.</p>}
      {slices.map((s) => (
        <div key={s.key} className="expo-row">
          <div className="row between small"><span>{s.label}</span><span><b>{pct(s.pct, 0)}</b> <span className="muted">· {sarShort(s.value)}</span></span></div>
          <div className="expo-track"><i style={{ width: `${Math.max(1.5, s.pct)}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}

export default function NetWorth() {
  const { otherAssets, obligations, holdings, accounts, fx, readOnly, settings } = useStore()
  const d = useDerived()
  const [asset, setAsset] = useState<Partial<OtherAsset> | null>(null)
  const [debt, setDebt] = useState<Partial<Obligation> | null>(null)
  const [extra, setExtra] = useState(1000)
  const [focusDebt, setFocusDebt] = useState<string | null>(null)

  const nw = useMemo(() => d && netWorth({
    invested: d.totals.total, goals: Object.values(d.totals.goals).reduce((a, b) => a + b, 0), outside: d.totals.outside, otherAssets, obligations,
  }), [d, otherAssets, obligations])
  const expo = useMemo(() => exposure(holdings, accounts, fx), [holdings, accounts, fx])
  if (!d || !nw) return null

  const goalsValue = Object.values(d.totals.goals).reduce((a, b) => a + b, 0)
  const lines = [
    { label: 'محفظة الاستقلال', value: d.totals.total },
    ...(goalsValue > 0 ? [{ label: 'محافظ الأهداف', value: goalsValue }] : []),
    ...(d.totals.outside > 0 ? [{ label: 'حسابات خارج الخطة', value: d.totals.outside }] : []),
    ...(nw.other > 0 ? [{ label: 'العقار والأصول الأخرى', value: nw.other }] : []),
  ]
  const debtsWithBalance = nw.debts.filter((x) => x.months != null && x.balance > 0)
  const target = debtsWithBalance.find((x) => x.debt.id === focusDebt) ?? debtsWithBalance[0]
  const faster = target ? payoffWithExtra(target.debt, extra) : null
  const recurring = obligations.filter((o) => o.balance == null)

  return (
    <>
      <section className="status" style={{ paddingTop: 0 }}>
        <p className="kicker">صافي ثروتك</p>
        <p className="headline"><span className={`figure ${nw.net < 0 ? 'bad' : ''}`}>{sar(nw.net)}</span></p>
        <p className="muted small">كل ما تملكه ({sarShort(nw.assets)}) ناقص ما عليك من ديون ({sarShort(nw.owed)}).</p>
      </section>

      <div className="panel flush">
        {lines.map((l) => (
          <div key={l.label} className="list-item" style={{ cursor: 'default' }}><div className="grow">{l.label}</div><div className="amount">{sar(l.value)}</div></div>
        ))}
        {nw.owed > 0 && <div className="list-item" style={{ cursor: 'default' }}><div className="grow">الديون المتبقية</div><div className="amount bad">−{sar(nw.owed)}</div></div>}
      </div>

      <section className="section">
        <div className="section-head"><h2>العقار والأصول الأخرى</h2>
          {!readOnly && <button className="btn primary small" onClick={() => setAsset({ name: '', kind: 'real_estate', value: 0 })}><IconPlus /> أصل</button>}
        </div>
        {otherAssets.length === 0 ? (
          <Empty title="أضف بيتك أو أرضك أو سيارتك"><p className="muted small">تدخل في صافي ثروتك فقط، ولا تؤثر على خطة الاستقلال أو أوزان المحفظة.</p></Empty>
        ) : (
          <div className="panel flush">
            {otherAssets.map((a) => (
              <button key={a.id} className="list-item" onClick={() => !readOnly && setAsset(a)} style={readOnly ? { cursor: 'default' } : undefined}>
                <div className="grow"><div>{a.name}</div><div className="meta">{ASSET_KIND_LABEL[a.kind]}، قُدّر في {dateLong(a.value_date)}{a.appreciation_pct ? `، ${a.appreciation_pct > 0 ? '+' : ''}${a.appreciation_pct}% سنوياً` : ''}</div></div>
                <div className="amount">{sar(otherAssetValue(a))}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>الديون</h2>
          {!readOnly && <button className="btn primary small" onClick={() => setDebt({ name: '', kind: 'personal_loan', monthly_amount: 0, balance: 0, sort: obligations.length + 1 })}><IconPlus /> دين</button>}
        </div>
        {nw.debts.length === 0 && recurring.length === 0 ? (
          <Empty title="لا ديون مسجّلة"><p className="muted small">أضف التمويل أو السلفة بالمبلغ المتبقي والقسط، فيظهر متى تنتهي وكم توفّر لو دفعت أكثر.</p></Empty>
        ) : (
          <div className="panel flush">
            {nw.debts.map((x) => (
              <button key={x.debt.id} className="list-item" onClick={() => !readOnly && setDebt(x.debt)} style={readOnly ? { cursor: 'default' } : undefined}>
                <div className="grow"><div>{x.debt.name}</div>
                  <div className="meta">{DEBT_LABEL[x.debt.kind ?? 'other']}، قسط {sar(Number(x.debt.monthly_amount))}{x.months != null ? `، ينتهي ${x.payoffDate ? dateLong(x.payoffDate).replace(/^\d+ /, '') : ''} (بعد ${monthsText(x.months)})` : ''}</div>
                </div>
                <div className="amount">{sar(x.balance)}</div>
              </button>
            ))}
            {recurring.map((o) => (
              <button key={o.id} className="list-item" onClick={() => !readOnly && setDebt(o)} style={readOnly ? { cursor: 'default' } : undefined}>
                <div className="grow"><div>{o.name}</div><div className="meta">{DEBT_LABEL[o.kind ?? 'other']}، المتبقي غير مُدخل{o.end_year ? `، حتى ${o.end_year}` : ''}</div></div>
                <div className="amount muted">{sar(Number(o.monthly_amount))} / شهر</div>
              </button>
            ))}
          </div>
        )}
        {target && (
          <div className="panel stack" style={{ marginTop: 12 }}>
            <h3 style={{ margin: 0 }}>لو دفعت أكثر كل شهر</h3>
            {debtsWithBalance.length > 1 && (
              <div className="segmented" role="group" aria-label="الدين">
                {debtsWithBalance.map((x) => <button key={x.debt.id} type="button" aria-pressed={x.debt.id === target.debt.id} onClick={() => setFocusDebt(x.debt.id)}>{x.debt.name}</button>)}
              </div>
            )}
            <Knob label="زيادة شهرية على القسط" value={extra} min={0} max={Math.max(5000, Math.round(Number(target.debt.monthly_amount) * 1.5 / 500) * 500)} step={250} onChange={setExtra} display={sar(extra)} />
            {faster && faster.saved > 0 ? (
              <p className="small">ينتهي «{target.debt.name}» قبل موعده بـ <b>{monthsText(faster.saved)}</b>{faster.interestSaved > 1 ? <> وتوفّر أرباحاً نحو <b className="good">{sar(faster.interestSaved)}</b></> : null}.
                {!target.debt.rate_pct && ' (بلا نسبة ربح مسجّلة، فالتوفير في الوقت فقط.)'}</p>
            ) : <p className="small muted">حرّك المؤشر لترى أثر الزيادة.</p>}
            <p className="tiny muted">قارن نسبة ربح الدين بعائد خطتك المتوقع ({pct(settings?.expected_return ?? 0)}): سداد دين بربح أعلى من عائدك المتوقع أجدى من استثمار المبلغ.</p>
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>أين أموالك المستثمرة؟</h2></div>
        <div className="stack">
          <Bars title="حسب السوق" slices={expo.region} color="var(--growth)" />
          <Bars title="حسب العملة" slices={expo.currency} color="var(--income)" />
          <Bars title="حسب مكان الحساب" slices={expo.custody} color="var(--accent)" />
        </div>
        <p className="tiny muted" style={{ marginTop: 8 }}>تشمل كل الاستثمارات ومحافظ الأهداف. السوق مقدّر من اسم الأصل ورمزه، ويمكنك تصحيحه من صفحة الأصل.</p>
      </section>

      {asset && <OtherAssetSheet initial={asset} onClose={() => setAsset(null)} />}
      {debt && <ObligationSheet initial={debt} onClose={() => setDebt(null)} />}
    </>
  )
}
