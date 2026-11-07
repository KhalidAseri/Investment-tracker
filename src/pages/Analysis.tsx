// Analysis hub: الأداء · التنويع · التكاليف (see REDESIGN.md).
import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { useDerived, sleeveColors } from '../lib/derived'
import { holdingValue, LAYER_NAMES, LAYER_ORDER } from '../lib/calc'
import { num0, num1, pct, sar, sarShort } from '../lib/format'
import { exposure, type Slice } from '../lib/wealth'
import type { Layer } from '../lib/types'
import { Card, Money, Tile } from '../components/kit'
import { Donut } from '../components/viz'
import { haptic, layerColor } from '../lib/ui'
import { IconAlert, IconBuilding, IconLayers, IconPie, IconWallet } from '../components/icons'
import { Costs, NoAssets, Returns } from './Performance'
import './Analysis.css'

type Tab = 'returns' | 'mix' | 'costs'
const TABS: Array<{ k: Tab; label: string }> = [
  { k: 'returns', label: 'الأداء' },
  { k: 'mix', label: 'التنويع' },
  { k: 'costs', label: 'التكاليف' },
]
const KEY = 'masar-analysis-tab'
const readTab = (): Tab => {
  try { const v = localStorage.getItem(KEY); return v === 'mix' || v === 'costs' ? v : 'returns' } catch { return 'returns' }
}
const saveTab = (t: Tab) => { try { localStorage.setItem(KEY, t) } catch { /* private mode */ } }

export default function Analysis() {
  const [tab, setTab] = useState<Tab>(readTab)
  const pick = (t: Tab) => { if (t === tab) return; haptic(); setTab(t); saveTab(t) }
  return (
    <div className="an">
      <div className="segmented full an-tabs" role="group" aria-label="أقسام التحليل">
        {TABS.map((t) => <button key={t.k} type="button" aria-pressed={tab === t.k} onClick={() => pick(t.k)}>{t.label}</button>)}
      </div>
      <div key={tab} className="an-pane">
        {tab === 'returns' ? <Returns /> : tab === 'mix' ? <Diversification /> : <Costs />}
      </div>
    </div>
  )
}

// ---------- التنويع ----------
/** one decimal under 10%, whole numbers above */
const share = (v: number) => pct(v, Math.abs(v) < 10 ? 1 : 0)
const pointsWord = (v: number) => (Number.isInteger(v) && v >= 3 && v <= 10 ? 'نقاط' : 'نقطة')
const sleevesText = (n: number) => (n === 1 ? 'شريحة واحدة' : n === 2 ? 'شريحتان' : n <= 10 ? `${n} شرائح` : `${n} شريحة`)
const isIntl = (a: { country?: string | null; is_ibkr: boolean }) => (a.country ?? (a.is_ibkr ? 'INTL' : 'SA')) === 'INTL'

function useWide(query = '(min-width: 960px)') {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const sync = () => setOn(mq.matches)
    sync()
    mq.addEventListener?.('change', sync)
    return () => mq.removeEventListener?.('change', sync)
  }, [query])
  return on
}

function ExpoGroup({ title, slices, color }: { title: string; slices: Slice[]; color: string }) {
  return (
    <div className="an-expo-group">
      <h4>{title}</h4>
      {slices.map((s) => (
        <div key={s.key} className="expo-row">
          <div className="an-expo-line"><span>{s.label}</span><span><b>{share(s.pct)}</b><span className="money">{sarShort(s.value)}</span></span></div>
          <div className="expo-track"><i style={{ width: `${Math.max(1.5, s.pct)}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}

function Diversification() {
  const { holdings, accounts, sleeves, fx, settings, readOnly } = useStore()
  const d = useDerived()
  const wide = useWide()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])

  // everything invested: the main portfolio and the goal portfolios, without accounts kept outside the plan
  const inv = useMemo(() => {
    const excluded = new Set(accounts.filter((a) => a.exclude_from_portfolio).map((a) => a.id))
    const list = holdings.filter((h) => !h.archived && !(h.account_id && excluded.has(h.account_id)) && holdingValue(h, fx) > 0)
    const ranked = list.map((h) => ({ h, v: holdingValue(h, fx) })).sort((a, b) => b.v - a.v)
    const expo = exposure(list, accounts, fx)
    const total = expo.total
    const used = accounts.filter((a) => list.some((h) => h.account_id === a.id))
    const layerOf = new Map(sleeves.map((s) => [s.id, s.layer]))
    const layers = new Set(list.map((h) => (h.sleeve_id ? layerOf.get(h.sleeve_id) : undefined)).filter(Boolean))
    return {
      expo, total, ranked, layers: layers.size,
      top: ranked[0] ?? null,
      topShare: total && ranked[0] ? (ranked[0].v / total) * 100 : 0,
      top3Share: total ? (ranked.slice(0, 3).reduce((s, x) => s + x.v, 0) / total) * 100 : 0,
      accounts: used.length, intl: used.filter(isIntl).length,
    }
  }, [holdings, accounts, sleeves, fx])

  if (!d || !settings) return null
  if (inv.total <= 0) return <NoAssets readOnly={readOnly} text="أضف أصولك، ثم يظهر هنا توزيعها ومدى تركّزها." />

  const main = d.totals.total
  const target = (l: Layer) => sleeves.filter((s) => s.layer === l).reduce((a, s) => a + (Number(s.target_now) || 0), 0)
  const legend = [
    ...LAYER_ORDER.map((l) => ({ key: l, label: LAYER_NAMES[l], value: d.totals.byLayer[l], color: layerColor(l), target: target(l) as number | null }))
      .filter((p) => p.value > 0 || (p.target ?? 0) > 0),
    ...(d.totals.unassigned > 0 ? [{ key: 'none', label: 'بلا شريحة', value: d.totals.unassigned, color: 'var(--line-strong)', target: null }] : []),
  ]
  // out of range = outside the active plan phase's band when the sleeve has one, otherwise target ± rebalance_band (Drift.out)
  const band = Number(settings.rebalance_band) || 0
  const hasBands = d.drift.some((x) => x.sleeve.band_min != null || x.sleeve.band_max != null)
  const out = d.drift.filter((x) => x.out)
  const scale = Math.max(1, ...d.drift.map((x) => Math.max(x.actual, x.target))) * 1.08
  const warn = inv.topShare > 25

  // two independent columns on desktop; on phones the four blocks run in order 1–4
  return (
    <div className="an-cols">
      <div className="an-c">
        <Card title="التوزيع حسب الطبقة" className="an-o1">
          {main > 0 ? (
            <div className="donut-wrap an-donut">
              <Donut parts={legend} size={wide ? 152 : 116} thickness={wide ? 18 : 14} title="توزيع المحفظة الرئيسية حسب الطبقة">
                <b><Money v={main} short /></b><span>المحفظة</span>
              </Donut>
              <div className="donut-legend">
                <div className="an-legend-cap"><span>الطبقة</span><span>الحالي / الهدف</span></div>
                {legend.map((p) => (
                  <div key={p.key} className="legend-item">
                    <i className="dot" style={{ background: p.color }} />
                    <span className="name">{p.label}</span>
                    <span className="val">{share(main ? (p.value / main) * 100 : 0)}</span>
                    <span className="tgt">{p.target != null ? `/ ${share(p.target)}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="an-hint flat">المحفظة الرئيسية بلا قيمة بعد؛ أصولك كلها في محافظ الأهداف.</p>}
        </Card>

        <Card title="مقارنة بالأوزان المستهدفة" className="an-o3" action={readOnly ? null : { label: 'الخطة', href: '#/plan/doc' }}>
          <p className={`an-status ${out.length ? 'warn' : 'good'}`}>
            {hasBands
              ? (out.length ? `${sleevesText(out.length)} خارج نطاق خطتك` : 'كل الشرائح ضمن نطاق خطتك')
              : out.length
                ? <>{sleevesText(out.length)} خارج ±<bdi dir="ltr">{num1(band)}</bdi> {pointsWord(band)} من الهدف</>
                : <>كل الشرائح ضمن ±<bdi dir="ltr">{num1(band)}</bdi> {pointsWord(band)} من الهدف</>}
          </p>
          <div className="an-cap flat"><span>الشريحة</span><span>الحالي / الهدف</span></div>
          {d.drift.map((x) => {
            const c = colors[x.sleeve.id] ?? { color: layerColor(x.sleeve.layer), opacity: 1 }
            const off = x.out
            const own = x.sleeve.band_min != null || x.sleeve.band_max != null
            const over = x.actual > x.max
            const beyond = over ? x.actual - x.max : x.min - x.actual
            return (
              <div key={x.sleeve.id} className="alloc-row">
                <div className="alloc-name"><i className="dot" style={{ background: c.color, opacity: c.opacity }} /><span dir="auto">{x.sleeve.name}</span></div>
                <div className="alloc-nums"><b>{share(x.actual)}</b> <span className="muted">/ {share(x.target)}</span>
                  {own && <small className="an-range">النطاق <bdi dir="ltr">{num1(x.min)}–{num1(x.max)}%</bdi></small>}</div>
                <div className="alloc-bar" role="img" aria-label={`${x.sleeve.name}: الحالي ${share(x.actual)}، الهدف ${share(x.target)}${own ? `، النطاق من ${num1(x.min)} إلى ${num1(x.max)}` : ''}`}>
                  {own && <i className="band" style={{ insetInlineStart: `${Math.min(100, (x.min / scale) * 100)}%`, width: `${Math.max(0, Math.min(100, (x.max / scale) * 100) - Math.min(100, (x.min / scale) * 100))}%` }} />}
                  <i className="fill" style={{ width: `${Math.min(100, (x.actual / scale) * 100)}%`, background: c.color, opacity: c.opacity }} />
                  <i className="mark" style={{ insetInlineStart: `calc(${Math.min(100, (x.target / scale) * 100)}% - 1px)` }} />
                </div>
                {off && (
                  <div className="an-drift">
                    <small className="chip warn">
                      {own ? <>{over ? 'أعلى' : 'أقل'} من نطاقها بـ <bdi dir="ltr">{num1(beyond)}</bdi> {pointsWord(Number(num1(beyond)))}</>
                        : <>{x.diff > 0 ? 'أعلى' : 'أقل'} من الهدف بـ <bdi dir="ltr">{num1(Math.abs(x.diff))}</bdi> {pointsWord(Number(num1(Math.abs(x.diff))))}</>}
                    </small>
                    <span>{x.diff > 0 ? 'زيادة' : 'ينقصها'} <span className="money">{sar(Math.abs(x.gapValue))}</span></span>
                  </div>
                )}
              </div>
            )
          })}
          {d.drift.length === 0 && <p className="an-hint flat">لا شرائح بعد.{!readOnly && <> حدّدها في <a href="#/plan/doc">الخطة</a>.</>}</p>}
        </Card>
      </div>

      <div className="an-c">
        <div className="an-col an-o2">
          <div className="tiles an-tiles">
            <Tile icon={warn ? <IconAlert /> : <IconPie />} label="أكبر أصل" href={inv.top ? `#/asset/${inv.top.h.id}` : undefined}
              value={<span className={warn ? 'an-warn' : ''}>{share(inv.topShare)}</span>} sub={<span className="an-tsub" dir="auto">{inv.top?.h.name ?? '—'}</span>} />
            <Tile tone="blue" icon={<IconLayers />} label="أكبر 3 أصول" value={share(inv.top3Share)} sub="من كل استثماراتك" />
            <Tile tone="income" icon={<IconWallet />} label="عدد الأصول" value={num0(inv.ranked.length)}
              sub={inv.layers ? `في ${inv.layers === 1 ? 'طبقة واحدة' : inv.layers === 2 ? 'طبقتين' : `${inv.layers} طبقات`} من 4` : 'بلا طبقات بعد'} />
            <Tile tone="gold" icon={<IconBuilding />} label="عدد الحسابات" value={num0(inv.accounts)}
              sub={inv.intl === 0 ? 'كلها داخل السعودية' : inv.intl === inv.accounts ? 'كلها خارج السعودية' : `منها ${num0(inv.intl)} خارج السعودية`} />
          </div>
          {warn && (
            <div className="banner an-static an-note" role="note">
              <span className="ico"><IconAlert /></span>
              <p>أكبر أصل لديك يتجاوز ربع استثماراتك.</p>
            </div>
          )}
        </div>

        <Card title="أين تستثمر أموالك" className="an-o4">
          <div className="an-expo">
            <ExpoGroup title="حسب السوق" slices={inv.expo.region} color="var(--growth)" />
            <ExpoGroup title="حسب العملة" slices={inv.expo.currency} color="var(--income)" />
            <ExpoGroup title="حسب مكان الحساب" slices={inv.expo.custody} color="var(--accent)" />
          </div>
          <p className="an-foot">تشمل محافظ الأهداف، والسوق مقدّر من اسم الأصل ورمزه.</p>
        </Card>
      </div>
    </div>
  )
}
