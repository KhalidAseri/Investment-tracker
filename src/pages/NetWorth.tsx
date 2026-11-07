// «صافي الثروة»: everything owned minus everything owed, with a payoff calculator.
import { useMemo, useState, type ReactNode, type SVGProps } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { holdingValue } from '../lib/calc'
import { monthName, num0, pct, sar, signedPct, todayISO } from '../lib/format'
import { ASSET_KIND_LABEL, DEBT_LABEL, debtView, mainFlows, netWorth, otherAssetValue, payoffWithExtra, performance } from '../lib/wealth'
import type { DebtKind, Obligation, OtherAsset, OtherAssetKind } from '../lib/types'
import { Knob } from '../components/ui'
import { Empty, Money, StackBar } from '../components/kit'
import { IconBuilding, IconCash, IconChart, IconDoc, IconFlag, IconHome, IconLayers, IconPlus, IconScale, IconSparkle, IconWallet } from '../components/icons'
import { ObligationSheet, OtherAssetSheet, monthsText } from '../components/WealthSheets'
import { haptic, useCountUp } from '../lib/ui'
import './NetWorth.css'

const IconCar = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
    <path d="M4 16.5V12l2-5h12l2 5v4.5" /><path d="M3.5 12h17" /><path d="M4 16.5h16" /><path d="M6 16.5V19M18 16.5V19" /><circle cx="7.5" cy="14.2" r=".6" fill="currentColor" /><circle cx="16.5" cy="14.2" r=".6" fill="currentColor" />
  </svg>
)
const ASSET_ICON: Record<OtherAssetKind, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  real_estate: IconHome, land: IconLayers, vehicle: IconCar, business: IconBuilding, other: IconSparkle,
}
const DEBT_ICON: Record<DebtKind, (p: SVGProps<SVGSVGElement>) => JSX.Element> = {
  mortgage: IconHome, personal_loan: IconCash, advance: IconCash, car: IconCar, card: IconWallet, other: IconDoc,
}

const monthYear = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso.slice(0, 10) + 'T12:00:00')
  return `${monthName(d.getMonth())} ${d.getFullYear()}`
}
const counted = (n: number, one: string, two: string, few: string, many: string) =>
  (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`)
const assetsText = (n: number) => counted(n, 'أصل واحد', 'أصلان', 'أصول', 'أصلاً')
const goalsText = (n: number) => counted(n, 'هدف واحد', 'هدفان', 'أهداف', 'هدفاً')
const rateText = (r: number) => `${+r.toFixed(2)}%`

/** One line in a card: icon, name, detail, amount. A link, a button, or plain text for viewers. */
function Line({ icon, tone = '', name, sub, end, href, onClick }: {
  icon: ReactNode; tone?: string; name: string; sub?: ReactNode; end: ReactNode; href?: string; onClick?: () => void
}) {
  const body = <>
    <span className={`nw-ico ${tone}`}>{icon}</span>
    <span className="ri-main"><b>{name}</b>{sub != null && <span>{sub}</span>}</span>
    <span className="ri-end">{end}</span>
  </>
  if (href) return <a className="ri" href={href} onClick={() => haptic()}>{body}</a>
  if (onClick) return <button type="button" className="ri" onClick={() => { haptic(); onClick() }}>{body}</button>
  return <div className="ri nw-static">{body}</div>
}

export default function NetWorth() {
  const { otherAssets, obligations, holdings, accounts, goals, fx, readOnly, settings, snapshots, transactions } = useStore()
  const d = useDerived()
  const [asset, setAsset] = useState<Partial<OtherAsset> | null>(null)
  const [debt, setDebt] = useState<Partial<Obligation> | null>(null)
  const [extra, setExtra] = useState(1000)
  const [focusDebt, setFocusDebt] = useState<string | null>(null)

  const goalsValue = d ? Object.values(d.totals.goals).reduce((a, b) => a + b, 0) : 0
  const nw = useMemo(() => d && netWorth({
    invested: d.totals.total, goals: goalsValue, outside: d.totals.outside, otherAssets, obligations,
  }), [d, goalsValue, otherAssets, obligations])
  const shown = useCountUp(nw?.net ?? 0)
  // compare with what the portfolio has actually earned per year (needs about a year of daily values)
  const earned = useMemo(() => performance(snapshots, mainFlows(transactions, holdings, accounts), undefined, d?.totals.total ?? 0, todayISO()).annualized, [snapshots, transactions, holdings, accounts, d?.totals.total])
  if (!d || !nw) return null

  const owner = !readOnly
  const share = (v: number) => (nw.assets > 0 ? pct((v / nw.assets) * 100, v / nw.assets >= 0.1 ? 0 : 1) : '')
  const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
  const live = holdings.filter((h) => !h.archived && holdingValue(h, fx) > 0)
  const mainCount = live.filter((h) => !h.goal_id && !(h.account_id && excluded.has(h.account_id))).length
  const activeGoals = goals.filter((g) => !g.archived)
  const outsideNames = accounts.filter((a) => a.exclude_from_portfolio && live.some((h) => !h.goal_id && h.account_id === a.id)).map((a) => a.name)
  const thisYear = new Date().getFullYear()

  // debts: with a balance (largest first), recurring commitments, then the ones already paid off
  const views = obligations.map((o) => debtView(o))
  const owing = views.filter((x) => x.debt.balance != null && x.balance > 0).sort((a, b) => b.balance - a.balance)
  const recurring = obligations.filter((o) => o.balance == null && !(o.end_year && o.end_year < thisYear))
  const paid = views.filter((x) => x.debt.balance != null && x.balance <= 0).map((x) => x.debt)
  const monthly = [...owing.map((x) => x.debt), ...recurring].reduce((a, o) => a + (Number(o.monthly_amount) || 0), 0)

  const payable = owing.filter((x) => x.months != null)
  const target = payable.find((x) => x.debt.id === focusDebt) ?? payable[0]
  const faster = target ? payoffWithExtra(target.debt, extra) : null
  const rate = Number(target?.debt.rate_pct) || 0

  return (
    <div className="nw">
      <section className="hero nw-hero">
        <div className="hero-top"><span>صافي ثروتك</span><span className="nw-hero-ico"><IconScale /></span></div>
        <div className="hero-value">{shown < -0.5 ? '−' : ''}{num0(Math.abs(shown))}<small>ريال</small></div>
        <div className="nw-split">
          <StackBar parts={[
            { key: 'own', value: nw.assets, color: 'var(--nw-own)', label: 'ما تملكه' },
            { key: 'owe', value: nw.owed, color: 'var(--nw-owe)', label: 'ما عليك' },
          ]} />
          <div className="nw-legend">
            <div><span><i className="own" />ما تملكه</span><b className="money">{sar(nw.assets)}</b></div>
            <div><span><i className="owe" />ما عليك</span><b className="money">{sar(nw.owed)}</b></div>
          </div>
        </div>
      </section>

      <div className="layout even nw-grid">
        <section className="card flush nw-card">
          <div className="card-head"><h3>ما تملكه</h3><Money v={nw.assets} className="nw-total" /></div>
          <Line icon={<IconChart />} name="المحفظة الرئيسية" sub={assetsText(mainCount)} href="#/portfolio"
            end={<><Money v={d.totals.total} /><span className="sub">{share(d.totals.total)}</span></>} />
          {(goalsValue > 0 || activeGoals.length > 0) && (
            <Line icon={<IconFlag />} tone="goal" name="محافظ الأهداف" sub={activeGoals.length ? goalsText(activeGoals.length) : undefined} href="#/goals"
              end={<><Money v={goalsValue} /><span className="sub">{share(goalsValue)}</span></>} />
          )}
          {d.totals.outside > 0 && (
            <Line icon={<IconCash />} tone="calm" name="حسابات خارج الخطة" sub={outsideNames.join('، ') || undefined} href="#/portfolio"
              end={<><Money v={d.totals.outside} /><span className="sub">{share(d.totals.outside)}</span></>} />
          )}
          {otherAssets.map((a) => {
            const Icon = ASSET_ICON[a.kind] ?? IconSparkle
            const v = otherAssetValue(a)
            const change = Number(a.appreciation_pct) || 0
            return (
              <Line key={a.id} icon={<Icon />} tone="calm" name={a.name}
                sub={`${ASSET_KIND_LABEL[a.kind] ?? 'أخرى'} · ${change ? `${signedPct(change)} سنوياً` : `قيمة ${monthYear(a.value_date)}`}`}
                onClick={owner ? () => setAsset(a) : undefined}
                end={<><Money v={v} /><span className="sub">{share(v)}</span></>} />
            )
          })}
          {owner && (
            <button type="button" className="nw-add" onClick={() => { haptic(); setAsset({ name: '', kind: 'real_estate', value: 0 }) }}>
              <IconPlus />{otherAssets.length ? 'أضف عقاراً أو أصلاً آخر' : 'أضف بيتك أو أرضك أو سيارتك'}
            </button>
          )}
        </section>

        <div className="nw-col">
          <section className="card flush nw-card">
            <div className="card-head"><h3>ما عليك</h3>{(owing.length > 0 || recurring.length > 0) && <Money v={nw.owed} className="nw-total" />}</div>
            {owing.length === 0 && recurring.length === 0 && paid.length === 0 ? (
              <Empty icon={<IconScale />} title="لا ديون مسجّلة" text={owner ? 'أضف التمويل أو السلفة لترى متى تنتهي.' : undefined}
                action={owner ? { label: 'أضف ديناً', onClick: () => setDebt({ name: '', kind: 'personal_loan', monthly_amount: 0, balance: 0, sort: obligations.length + 1 }) } : undefined} />
            ) : <>
              {owing.map((x) => {
                const Icon = DEBT_ICON[x.debt.kind] ?? IconDoc
                return (
                  <Line key={x.debt.id} icon={<Icon />} tone="debt" name={x.debt.name}
                    sub={`قسط ${sar(Number(x.debt.monthly_amount))}${x.debt.rate_pct ? ` · ${rateText(Number(x.debt.rate_pct))}` : ''}`}
                    onClick={owner ? () => setDebt(x.debt) : undefined}
                    end={<><Money v={x.balance} /><span className="sub">{x.payoffDate ? `حتى ${monthYear(x.payoffDate)}` : x.months == null ? 'القسط لا يغطي الربح' : ''}</span></>} />
                )
              })}
              {recurring.map((o) => {
                const Icon = DEBT_ICON[o.kind] ?? IconDoc
                return (
                  <Line key={o.id} icon={<Icon />} tone="calm" name={o.name}
                    sub={`${DEBT_LABEL[o.kind] ?? 'التزام'}${o.end_year ? ` · حتى ${o.end_year}` : ''}`}
                    onClick={owner ? () => setDebt(o) : undefined}
                    end={<><Money v={Number(o.monthly_amount)} /><span className="sub">شهرياً</span></>} />
                )
              })}
              {paid.map((o) => {
                const Icon = DEBT_ICON[o.kind] ?? IconDoc
                return (
                  <Line key={o.id} icon={<Icon />} tone="calm" name={o.name} sub={DEBT_LABEL[o.kind] ?? 'التزام'}
                    onClick={owner ? () => setDebt(o) : undefined} end={<span className="chip accent">سُدّد</span>} />
                )
              })}
              {monthly > 0 && <div className="nw-kv"><span>الأقساط الشهرية</span><Money v={monthly} /></div>}
            </>}
            {owner && (owing.length > 0 || recurring.length > 0 || paid.length > 0) && (
              <button type="button" className="nw-add" onClick={() => { haptic(); setDebt({ name: '', kind: 'personal_loan', monthly_amount: 0, balance: 0, sort: obligations.length + 1 }) }}>
                <IconPlus />أضف ديناً أو التزاماً
              </button>
            )}
          </section>

          {target && (
            <section className="card nw-payoff">
              <div className="card-head"><h3>لو دفعت أكثر</h3></div>
              {payable.length > 1 && (
                <div className="segmented full" role="group" aria-label="الدين">
                  {payable.map((x) => (
                    <button key={x.debt.id} type="button" aria-pressed={x.debt.id === target.debt.id} onClick={() => { haptic(); setFocusDebt(x.debt.id) }}>{x.debt.name}</button>
                  ))}
                </div>
              )}
              <Knob label="زيادة على القسط شهرياً" value={extra} min={0} step={250}
                max={Math.max(5000, Math.round((Number(target.debt.monthly_amount) * 1.5) / 500) * 500)}
                onChange={setExtra} display={sar(extra)} />
              {faster && faster.saved > 0 ? (
                <div className="nw-res">
                  <div>
                    <span>ينتهي قبل موعده بـ</span>
                    <b>{monthsText(faster.saved)}</b>
                    <small>في {monthYear(faster.payoffDate)}</small>
                  </div>
                  <div>
                    <span>توفّر من الأرباح</span>
                    {rate > 0 && faster.interestSaved > 1
                      ? <b className="good"><Money v={faster.interestSaved} /></b>
                      : <b className="muted">—</b>}
                    <small>{rate > 0 ? `بنسبة ${rateText(rate)} سنوياً` : 'بلا نسبة ربح مسجّلة'}</small>
                  </div>
                </div>
              ) : <p className="small muted">حرّك المؤشر لترى أثر الزيادة.</p>}
              {rate > 0 && (
                <p className="nw-verdict">
                  {earned == null
                    ? `قارن ربح هذا الدين ${rateText(rate)} بما تحققه استثماراتك سنوياً: إن كان الدين أعلى فسداده أولاً أجدى.`
                    : rate > earned
                      ? `ربح هذا الدين ${rateText(rate)} أعلى مما حققته استثماراتك سنوياً (${rateText(earned)})، فسداده أولاً أجدى.`
                      : `حققت استثماراتك ${rateText(earned)} سنوياً، وهو أعلى من ربح هذا الدين ${rateText(rate)}.`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {asset && <OtherAssetSheet initial={asset} onClose={() => setAsset(null)} />}
      {debt && <ObligationSheet initial={debt} onClose={() => setDebt(null)} />}
    </div>
  )
}
