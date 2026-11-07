import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived } from '../lib/derived'
import { LAYER_NAMES, LAYER_ORDER, holdingValue } from '../lib/calc'
import { num0, num2, pct, sarShort } from '../lib/format'
import { haptic, layerColor, openAction } from '../lib/ui'
import { AssetRow, Empty, Money, Pct, SegLinks } from '../components/kit'
import { Donut } from '../components/viz'
import { IconPencil, IconPlus, IconWallet } from '../components/icons'
import type { Go } from '../App'
import type { Holding } from '../lib/types'

/** Segmented header shared by the three views of the portfolio tab. */
export function PortfolioTabs({ active }: { active: 'portfolio' | 'goals' | 'watch' }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <SegLinks items={[
        { href: '#/portfolio', label: 'الأصول', active: active === 'portfolio' },
        { href: '#/goals', label: 'الأهداف', active: active === 'goals' },
        { href: '#/watch', label: 'المراقبة', active: active === 'watch' },
      ]} />
    </div>
  )
}

type GroupBy = 'sleeve' | 'account'
const GKEY = 'masar-group'

export default function Portfolio({ go }: { go: Go }) {
  const { holdings, sleeves, accounts, fx, readOnly } = useStore()
  const d = useDerived()
  const [group, setGroup] = useState<GroupBy>(() => { try { return (localStorage.getItem(GKEY) as GroupBy) || 'sleeve' } catch { return 'sleeve' } })
  const pickGroup = (g: GroupBy) => { haptic(); setGroup(g); try { localStorage.setItem(GKEY, g) } catch { /* ignore */ } }

  const data = useMemo(() => {
    if (!d) return null
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const live = holdings.filter((h) => !h.archived && !h.goal_id && (holdingValue(h, fx) > 0 || Number(h.quantity) !== 0))
    const inside = live.filter((h) => !(h.account_id && excluded.has(h.account_id)))
    const outside = live.filter((h) => h.account_id && excluded.has(h.account_id))
    const byValue = (a: Holding, b: Holding) => holdingValue(b, fx) - holdingValue(a, fx)
    const groups: Array<{ key: string; title: string; sub?: string; color?: string; items: Holding[]; value: number; target?: number }> = []
    if (group === 'sleeve') {
      for (const layer of LAYER_ORDER) {
        for (const s of sleeves.filter((x) => x.layer === layer)) {
          const items = inside.filter((h) => h.sleeve_id === s.id).sort(byValue)
          if (!items.length && !(Number(s.target_now) > 0)) continue
          groups.push({ key: s.id, title: s.name, color: layerColor(layer), items, value: items.reduce((a, h) => a + holdingValue(h, fx), 0), target: Number(s.target_now) })
        }
      }
      const none = inside.filter((h) => !h.sleeve_id || !sleeves.some((s) => s.id === h.sleeve_id)).sort(byValue)
      if (none.length) groups.push({ key: 'none', title: 'بلا طبقة', items: none, value: none.reduce((a, h) => a + holdingValue(h, fx), 0) })
    } else {
      for (const a of accounts.filter((x) => !x.exclude_from_portfolio)) {
        const items = inside.filter((h) => h.account_id === a.id).sort(byValue)
        if (items.length) groups.push({ key: a.id, title: a.name, sub: a.is_ibkr ? 'يتحدث من IBKR' : a.country === 'INTL' ? 'خارج السعودية' : undefined, items, value: items.reduce((x, h) => x + holdingValue(h, fx), 0) })
      }
      const none = inside.filter((h) => !h.account_id).sort(byValue)
      if (none.length) groups.push({ key: 'none', title: 'بلا حساب', items: none, value: none.reduce((a, h) => a + holdingValue(h, fx), 0) })
    }
    const layers = LAYER_ORDER.filter((l) => sleeves.some((s) => s.layer === l)).map((l) => ({
      key: l, label: LAYER_NAMES[l], color: layerColor(l), value: d.totals.byLayer[l] ?? 0,
      target: sleeves.filter((s) => s.layer === l).reduce((a, s) => a + Number(s.target_now), 0),
    }))
    return { inside, outside, groups, layers }
  }, [d, holdings, sleeves, accounts, fx, group])

  if (!d || !data) return null
  const total = d.totals.total
  const stale = new Set(d.staleManual.map((h) => h.id))
  const staleCount = d.staleManual.filter((h) => !h.goal_id).length
  const sleeveName = (id: string | null) => sleeves.find((s) => s.id === id)?.name ?? 'بلا طبقة'
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'بلا حساب'
  const units = (h: Holding) => (h.price_source === 'manual' && Number(h.quantity) === 1 ? 'قيمة إجمالية' : `${num2(Number(h.quantity))} وحدة`)
  const subOf = (h: Holding) => (group === 'sleeve' ? `${accountName(h.account_id)} · ${units(h)}` : `${sleeveName(h.sleeve_id)} · ${units(h)}`)

  return (
    <>
      <PortfolioTabs active="portfolio" />

      {data.inside.length === 0 ? (
        <div className="card">
          <Empty icon={<IconWallet />} title="محفظتك فارغة" text="أضف أصولك من الأسهم والصناديق والمرابحة لتبدأ المتابعة."
            action={readOnly ? undefined : { label: 'أضف أول أصل', onClick: () => openAction('asset') }} />
        </div>
      ) : <>
        <section className="card port-summary">
          <div className="donut-wrap">
            <Donut size={136} thickness={15} parts={data.layers.map((l) => ({ key: l.key, value: l.value, color: l.color, label: l.label }))} title="التوزيع حسب الطبقة">
              <div><b className="money">{sarShort(total)}</b><span>{num0(data.inside.length)} {data.inside.length <= 10 && data.inside.length > 2 ? 'أصول' : 'أصل'}</span></div>
            </Donut>
            <div className="donut-legend">
              {data.layers.map((l) => {
                const actual = total ? (l.value / total) * 100 : 0
                return (
                  <div key={l.key} className="legend-item">
                    <i className="dot" style={{ background: l.color }} />
                    <span className="name">{l.label}</span>
                    <span className="val"><Pct v={actual} digits={0} /></span>
                    <span className="tgt">من <Pct v={l.target} digits={0} /></span>
                  </div>
                )
              })}
              <a className="tiny" href="#/analysis" style={{ fontWeight: 600 }}>تفاصيل التنويع</a>
            </div>
          </div>
        </section>

        {!readOnly && staleCount > 0 && (
          <button type="button" className="banner" style={{ marginTop: 12 }} onClick={() => go('update')}>
            <span className="ico"><IconPencil /></span>
            <p>حدّث القيم اليدوية<small>{staleCount === 1 ? 'أصل واحد مضى' : `${staleCount} أصول مضى`} على آخر تحديث لها أكثر من شهر</small></p>
          </button>
        )}

        <div className="section-head" style={{ marginTop: 20 }}>
          <div className="segmented" role="group" aria-label="التجميع">
            <button type="button" aria-pressed={group === 'sleeve'} onClick={() => pickGroup('sleeve')}>حسب الطبقة</button>
            <button type="button" aria-pressed={group === 'account'} onClick={() => pickGroup('account')}>حسب الحساب</button>
          </div>
          {!readOnly && <button className="btn soft small" onClick={() => openAction('asset')}><IconPlus /> أصل</button>}
        </div>

        <div className="stack" style={{ gap: 14 }}>
          {data.groups.map((g) => (
            <section key={g.key} className="card flush">
              <div className="group-head">
                {g.color && <i className="dot" style={{ background: g.color }} />}
                <span className="grow" style={{ minWidth: 0 }}><b>{g.title}</b>{g.sub && <span> · {g.sub}</span>}</span>
                <span className="figure"><Money v={g.value} short /></span>
                <span className="chip" title="نسبتها من المحفظة ومن المستهدف"><Pct v={total ? (g.value / total) * 100 : 0} digits={0} />{g.target != null && <> من <Pct v={g.target} digits={0} /></>}</span>
              </div>
              {g.items.length ? g.items.map((h) => (
                <AssetRow key={h.id} h={h} sleeves={sleeves} fx={fx} total={total} sub={subOf(h)} stale={stale.has(h.id)} onClick={() => go('asset', h.id)} />
              )) : <p className="small muted" style={{ padding: '2px 16px 14px' }}>لا أصول بعد في هذه الطبقة.</p>}
            </section>
          ))}

          {data.outside.length > 0 && (
            <section className="card flush">
              <div className="group-head"><span className="grow"><b>خارج الخطة</b><span> · لا تدخل في الأوزان</span></span><span className="figure"><Money v={data.outside.reduce((a, h) => a + holdingValue(h, fx), 0)} short /></span></div>
              {data.outside.map((h) => <AssetRow key={h.id} h={h} sleeves={sleeves} fx={fx} sub={accountName(h.account_id)} onClick={() => go('asset', h.id)} />)}
            </section>
          )}
        </div>
      </>}
    </>
  )
}
