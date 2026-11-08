// Analysis hub: الأداء · التوزيع · المخاطر · التكاليف (see REDESIGN.md, ADVISOR-FEATURE.md).
// The segment follows the address (#/analysis/returns | map | risk | costs); #/analysis alone opens the last one used.
import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from '../lib/store'
import { useDerived, sleeveColors } from '../lib/derived'
import { holdingValue, LAYER_NAMES, LAYER_ORDER } from '../lib/calc'
import { num0, num1, pct, sar } from '../lib/format'
import { currencyLabel, exposure } from '../lib/wealth'
import { useClassReturns, useExposure } from '../lib/market'
import { usePlan } from '../lib/usePlan'
import { riskMap } from '../lib/risk'
import { industryLabel, sharePct } from '../lib/lookthrough'
import { REGION_AR, REGION_ORDER, countryLabel } from '../lib/countries'
import { ASSET_CLASS_LABEL, SECTOR_LABEL, type AssetClass, type SectorKey } from '../lib/catalog'
import type { Layer } from '../lib/types'
import { Card, Chev, Money, Pct, Tile } from '../components/kit'
import { Segmented } from '../components/ui'
import { Donut } from '../components/viz'
import { RiskList } from '../components/RiskList'
import { haptic, layerColor } from '../lib/ui'
import { IconAlert, IconBuilding, IconLayers, IconPie, IconWallet } from '../components/icons'
import { Costs, NoAssets, Returns } from './Performance'
import '../components/Insights.css'
import './Analysis.css'

const WorldMap = lazy(() => import('../components/WorldMap'))

type Tab = 'returns' | 'map' | 'risk' | 'costs'
const TABS: Array<{ k: Tab; label: string }> = [
  { k: 'returns', label: 'الأداء' },
  { k: 'map', label: 'التوزيع' },
  { k: 'risk', label: 'المخاطر' },
  { k: 'costs', label: 'التكاليف' },
]
/** old and alternative segment names still open the right segment */
const ALIAS: Record<string, Tab> = {
  returns: 'returns', performance: 'returns', map: 'map', mix: 'map', allocation: 'map', geo: 'map',
  risk: 'risk', risks: 'risk', costs: 'costs', fees: 'costs',
}
const KEY = 'masar-analysis-tab'
const tabFromHash = (): Tab | null => {
  const m = location.hash.match(/^#\/?(?:analysis|performance)\/([^/?#]+)/)
  return m ? ALIAS[decodeURIComponent(m[1]).toLowerCase()] ?? null : null
}
const readTab = (): Tab => {
  try { const v = localStorage.getItem(KEY) ?? ''; return ALIAS[v] ?? 'returns' } catch { return 'returns' }
}
const saveTab = (t: Tab) => { try { localStorage.setItem(KEY, t) } catch { /* private mode */ } }

export default function Analysis() {
  const [tab, setTab] = useState<Tab>(() => tabFromHash() ?? readTab())
  useEffect(() => {
    const sync = () => { const t = tabFromHash(); if (t) setTab(t) }
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  const pick = (t: Tab) => {
    if (t === tab) return
    haptic()
    setTab(t)
    saveTab(t)
    // the address follows the segment without adding a history step
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}#/analysis/${t}`) } catch { /* sandboxed */ }
  }
  return (
    <div className="an">
      <div className="segmented full an-tabs" role="group" aria-label="أقسام التحليل">
        {TABS.map((t) => <button key={t.k} type="button" aria-pressed={tab === t.k} onClick={() => pick(t.k)}>{t.label}</button>)}
      </div>
      <div key={tab} className="an-pane">
        {tab === 'returns' ? <Returns /> : tab === 'map' ? <Allocation /> : tab === 'risk' ? <Risks /> : <Costs />}
      </div>
    </div>
  )
}

// ---------- shared ----------
/** one decimal under 10%, whole numbers above */
const share = (v: number) => pct(v, Math.abs(v) < 10 ? 1 : 0)
const pointsWord = (v: number) => (Number.isInteger(v) && v >= 3 && v <= 10 ? 'نقاط' : 'نقطة')
const sleevesText = (n: number) => (n === 1 ? 'شريحة واحدة' : n === 2 ? 'شريحتان' : n <= 10 ? `${n} شرائح` : `${n} شريحة`)
const countriesText = (n: number) => (n === 1 ? 'دولة واحدة' : n === 2 ? 'دولتان' : n <= 10 ? `${n} دول` : `${n} دولة`)
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

interface ShareRow { key: string; label: string; value: number }
/** Rows of «label · share · amount» with a bar, largest first; folds after `limit`. */
function ShareList({ title, rows, total, color, limit = 8, note }: { title?: string; rows: ShareRow[]; total: number; color: string; limit?: number; note?: ReactNode }) {
  const [all, setAll] = useState(false)
  const list = rows.filter((r) => r.value > 0.5).sort((a, b) => b.value - a.value)
  const shown = all ? list : list.slice(0, limit)
  const max = Math.max(0, ...list.map((r) => r.value))
  if (!list.length) return null
  return (
    <div className="an-expo-group">
      {title && <h4>{title}</h4>}
      {shown.map((r) => {
        const p = sharePct(r.value, total)
        return (
          <div key={r.key} className="expo-row">
            <div className="an-expo-line"><span>{r.label}</span><span><b>{share(p)}</b><Money v={r.value} short /></span></div>
            <div className="expo-track"><i style={{ width: `${Math.max(1.5, max > 0 ? (r.value / max) * 100 : 0)}%`, background: color }} /></div>
          </div>
        )
      })}
      {list.length > limit && (
        <button type="button" className="btn quiet small an-more" onClick={() => { haptic(); setAll((v) => !v) }}>{all ? 'عرض أقل' : `عرض الكل (${list.length})`}</button>
      )}
      {note && <p className="an-foot flat">{note}</p>}
    </div>
  )
}

// ---------- التوزيع ----------
function Allocation() {
  const { readOnly } = useStore()
  const [scope, setScope] = useState<'all' | 'main'>('all')
  const ex = useExposure(scope)
  const total = ex.total

  const rows = useMemo(() => {
    const countries: ShareRow[] = Object.entries(ex.byCountry).filter(([c]) => c !== 'XX' && c !== 'XC').map(([c, v]) => ({ key: c, label: countryLabel(c), value: v }))
    const regions: ShareRow[] = REGION_ORDER.filter((r) => (ex.byRegion[r] ?? 0) > 0 && r !== 'XX').map((r) => ({ key: r, label: REGION_AR[r] ?? r, value: ex.byRegion[r] }))
    const sectors: ShareRow[] = (Object.entries(ex.bySector) as Array<[SectorKey, number]>).map(([k, v]) => ({ key: k, label: SECTOR_LABEL[k] ?? k, value: v }))
    const industries: ShareRow[] = Object.entries(ex.byIndustry).map(([k, v]) => ({ key: k, label: industryLabel(k), value: v }))
    const classes: ShareRow[] = (Object.entries(ex.byClass) as Array<[AssetClass, number]>).map(([k, v]) => ({ key: k, label: ASSET_CLASS_LABEL[k] ?? k, value: v }))
    const currencies: ShareRow[] = Object.entries(ex.byCurrency).map(([k, v]) => ({ key: k, label: currencyLabel(k), value: v }))
    return { countries, regions, sectors, industries, classes, currencies }
  }, [ex])

  if (total <= 0) return <NoAssets readOnly={readOnly} text="أضف أصولك، ثم يظهر هنا توزيعها على الدول والقطاعات." />
  const gold = ex.byCountry.XC ?? 0
  const unknown = ex.byCountry.XX ?? 0
  const nCountries = rows.countries.filter((r) => sharePct(r.value, total) >= 1).length
  const coverage = Math.round(ex.coverage * 100)

  return (
    <div className="an-cols">
      <div className="an-c">
        <Card className="an-o1 an-map" title="أين أموالك في العالم">
          <div className="an-scope">
            <Segmented label="النطاق" value={scope} onChange={(v) => { haptic(); setScope(v) }}
              options={[{ value: 'all', label: 'كل أصولك' }, { value: 'main', label: 'المحفظة الرئيسية' }]} />
          </div>
          <Suspense fallback={<div className="skeleton wm-skel" />}>
            <WorldMap byCountry={ex.byCountry} total={total} />
          </Suspense>
          <div className="an-map-facts">
            <span>في {countriesText(Math.max(1, nCountries))}</span>
            {gold > 0 && <span><i className="dot" style={{ background: 'var(--hedge)' }} />ذهب وسلع بلا دولة <b><Pct v={sharePct(gold, total)} /></b></span>}
            {unknown > 0 && <span><i className="dot" style={{ background: 'var(--line-strong)' }} />غير محدد <b><Pct v={sharePct(unknown, total)} /></b></span>}
          </div>
        </Card>

        <Card className="an-o2" title="الدول والمناطق">
          <div className="an-expo">
            <ShareList title="حسب الدولة" rows={rows.countries} total={total} color="var(--accent)" limit={8} />
            <ShareList title="حسب المنطقة" rows={rows.regions} total={total} color="var(--growth)" limit={12} />
          </div>
        </Card>

        <PlanMix />
      </div>

      <div className="an-c">
        <Card className="an-o3" title="القطاعات">
          <div className="an-expo">
            <ShareList title="حسب القطاع" rows={rows.sectors} total={total} color="var(--income)" limit={8}
              note={ex.unknownSector > 0.5 ? <>قطاع <Money v={ex.unknownSector} short /> غير معروف.</> : undefined} />
            <ShareList title="أكبر الصناعات" rows={rows.industries} total={total} color="var(--safety)" limit={6} />
          </div>
        </Card>

        <Card className="an-o4" title="الفئات والعملات">
          <div className="an-expo">
            <ShareList title="حسب فئة الأصل" rows={rows.classes} total={total} color="var(--growth)" limit={8} />
            <ShareList title="حسب العملة" rows={rows.currencies} total={total} color="var(--hedge)" limit={6} />
          </div>
        </Card>

        <Card className="an-o5 an-cov" title="دقة التوزيع">
          <div className="an-cov-top">
            <b><bdi dir="ltr">{coverage}%</bdi></b>
            <span>{coverage >= 99 ? 'نعرف دولة وقطاع كل أصولك.' : 'من محفظتك نعرف دولته وقطاعه.'}</span>
          </div>
          <div className="progress"><i style={{ width: `${coverage}%` }} /></div>
          {ex.unknown.length > 0 && <>
            <p className="an-foot">{readOnly ? 'أصول بلا تفاصيل:' : 'حدّد توزيع هذه الأصول من صفحتها لتكتمل الصورة:'}</p>
            <div className="an-unknown">
              {ex.unknown.slice(0, 6).map((u) => (
                <a key={u.id} className="ri" href={`#/asset/${encodeURIComponent(u.id)}`} onClick={() => haptic()}>
                  <span className="ri-main"><b>{u.name}</b></span>
                  <span className="ri-end"><Money v={u.value} short /></span>
                  <Chev />
                </a>
              ))}
            </div>
          </>}
          <p className="an-foot">من بيانات الصناديق المنشورة وبيانات السوق؛ تشمل {scope === 'all' ? 'محافظ الأهداف والاحتياطيات' : 'المحفظة الرئيسية فقط'}.</p>
        </Card>
      </div>
    </div>
  )
}

/** Layers against the plan's targets, and how concentrated the holdings are (the earlier «التنويع»). */
function PlanMix() {
  const { holdings, accounts, sleeves, fx, settings, readOnly } = useStore()
  const d = useDerived()
  const wide = useWide()
  const colors = useMemo(() => sleeveColors(sleeves), [sleeves])
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
      expo, total, ranked, layers: layers.size, top: ranked[0] ?? null,
      topShare: total && ranked[0] ? (ranked[0].v / total) * 100 : 0,
      top3Share: total ? (ranked.slice(0, 3).reduce((s, x) => s + x.v, 0) / total) * 100 : 0,
      accounts: used.length, intl: used.filter(isIntl).length,
    }
  }, [holdings, accounts, sleeves, fx])
  if (!d || !settings) return null

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

  return <>
    <Card title="التوزيع حسب الطبقة" className="an-o6">
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

    <Card title="مقارنة بالأوزان المستهدفة" className="an-o7" action={readOnly ? null : { label: 'الخطة', href: '#/plan/doc' }}>
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
            {x.out && (
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

    <div className="an-col an-o8">
      <div className="tiles an-tiles">
        <Tile icon={warn ? <IconAlert /> : <IconPie />} label="أكبر أصل" href={inv.top ? `#/asset/${inv.top.h.id}` : undefined}
          value={<span className={warn ? 'an-warn' : ''}>{share(inv.topShare)}</span>} sub={<span className="an-tsub" dir="auto">{inv.top?.h.name ?? '—'}</span>} />
        <Tile tone="blue" icon={<IconLayers />} label="أكبر 3 أصول" value={share(inv.top3Share)} sub="من كل استثماراتك" />
        <Tile tone="income" icon={<IconWallet />} label="عدد الأصول" value={num0(inv.ranked.length)}
          sub={inv.layers ? `في ${inv.layers === 1 ? 'طبقة واحدة' : inv.layers === 2 ? 'طبقتين' : `${inv.layers} طبقات`} من 4` : 'بلا طبقات بعد'} />
        <Tile tone="gold" icon={<IconBuilding />} label="عدد الحسابات" value={num0(inv.accounts)}
          sub={inv.intl === 0 ? 'كلها داخل السعودية' : inv.intl === inv.accounts ? 'كلها خارج السعودية' : `منها ${num0(inv.intl)} خارج السعودية`} />
      </div>
    </div>
  </>
}

// ---------- المخاطر ----------
function Risks() {
  const { holdings, accounts, fx, readOnly } = useStore()
  const ex = useExposure('all')
  const { returns, loading } = useClassReturns()
  const { doc, progress } = usePlan()
  const items = useMemo(() => {
    if (ex.total <= 0) return []
    const e = progress?.emergency
    const t = progress?.treasury
    return riskMap({
      exposure: ex, holdings, accounts, fx, doc,
      emergency: e && e.enabled ? { value: e.value, target: e.target, monthsCovered: e.coverMonths ?? 0 } : null,
      treasury: t && t.enabled ? { months: t.coverMonths ?? 0 } : null,
      returns,
    })
  }, [ex, holdings, accounts, fx, doc, progress, returns])

  if (ex.total <= 0) return <NoAssets readOnly={readOnly} text="أضف أصولك، ثم تظهر هنا المخاطر التي تتعرض لها محفظتك وتلك التي تفاديتها." />
  return (
    <div className="stack" style={{ gap: 14 }}>
      <p className="an-lead">قراءة لمحفظتك الحالية بالأرقام{loading && !Object.keys(returns).length ? '؛ نجلب البيانات التاريخية…' : '، والهبوط التاريخي من بيانات السوق الفعلية'}. ليست توقعاً لما سيحدث.</p>
      <RiskList items={items} />
    </div>
  )
}
