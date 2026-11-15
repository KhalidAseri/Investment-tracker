import type { AssetClass, AssetProfile, Pick2, Settings } from '../types.ts'
import { ASSET_CLASSES, CLASS_LABEL, LIQUIDITY_LABEL, REGION_LABEL, SECTORS, defaultLiquidity, regionOfCountry } from '../labels.ts'
import type { AssetView } from './valuation.ts'

export type Axis = 'class' | 'region' | 'country' | 'sector' | 'currency' | 'platform' | 'liquidity'
export type Profiles = Record<string, AssetProfile>
/** Country code -> display name; injected so the engine carries no country table of its own. */
export type CountryNamer = (code: string) => string

export interface Slice {
  key: string
  label: string
  value: number
  pct: number
  /** Which assets make up the slice, largest first. */
  parts: { assetId: string; name: string; value: number }[]
}

export interface Breakdown {
  axis: Axis
  slices: Slice[]
  total: number
  topPct: number
  /** Effective number of equally-sized buckets (1 / HHI). */
  effectiveN: number
  level: 'concentrated' | 'moderate' | 'diversified'
  /** Share of the total (0-100) that rests on researched profiles rather than the asset's own single field. */
  profiledPct: number
}

type Weights = Record<string, number>

/** Normalises a weight map to fractions that sum to 1; null when it is empty or unusable. */
function fractions(w: Weights | undefined): [string, number][] | null {
  if (!w) return null
  const entries = Object.entries(w).filter(([, v]) => v > 0)
  const sum = entries.reduce((s, [, v]) => s + v, 0)
  return sum > 0 ? entries.map(([k, v]) => [k, v / sum]) : null
}

export interface BreakdownOptions {
  profiles?: Profiles
  countryName?: CountryNamer
  /** Split un-profiled "Global" assets with the approximate settings weights. Default true. */
  lookThrough?: boolean
}

/**
 * How the portfolio is spread along one axis. An asset with a researched profile contributes its
 * real look-through weights (a world fund spreads over its countries and sectors); one without
 * contributes its whole value to its own class / region / sector.
 */
export function breakdown(rows: AssetView[], axis: Axis, settings: Settings, L: Pick2, opts: BreakdownOptions = {}): Breakdown {
  const profiles = opts.profiles ?? {}
  const lookThrough = opts.lookThrough ?? true
  const nameOf = opts.countryName ?? ((c: string) => c)
  const map = new Map<string, { label: string; value: number; parts: Map<string, { assetId: string; name: string; value: number }> }>()
  let profiled = 0

  const add = (key: string, label: string, value: number, r: AssetView) => {
    if (!(value > 0)) return
    const cur = map.get(key) ?? { label, value: 0, parts: new Map() }
    cur.value += value
    const part = cur.parts.get(r.asset.id) ?? { assetId: r.asset.id, name: r.asset.name, value: 0 }
    part.value += value
    cur.parts.set(r.asset.id, part)
    map.set(key, cur)
  }
  const regionLabel = (k: keyof typeof REGION_LABEL) => L(REGION_LABEL[k].ar, REGION_LABEL[k].en)
  const sectorLabel = (k: string) => { const s = SECTORS[k] ?? SECTORS.OTHER; return L(s.ar, s.en) }

  for (const r of rows) {
    const a = r.asset
    const p = profiles[a.id]
    switch (axis) {
      case 'class': {
        const f = fractions(p?.classSplit as Weights | undefined)
        if (f) { profiled += r.value; for (const [k, w] of f) { const c = (ASSET_CLASSES as string[]).includes(k) ? (k as AssetClass) : 'OTHER'; add(c, L(CLASS_LABEL[c].ar, CLASS_LABEL[c].en), r.value * w, r) } }
        else add(a.assetClass, L(CLASS_LABEL[a.assetClass].ar, CLASS_LABEL[a.assetClass].en), r.value, r)
        break
      }
      case 'country':
      case 'region': {
        const f = fractions(p?.countries)
        if (f) {
          profiled += r.value
          for (const [code, w] of f) {
            if (axis === 'country') add(code, code === 'OTHER' ? L('دول أخرى', 'Other countries') : nameOf(code), r.value * w, r)
            else if (code === 'OTHER') add('EM', regionLabel('EM'), r.value * w, r)
            else { const reg = regionOfCountry(code); add(reg, regionLabel(reg), r.value * w, r) }
          }
        } else if (a.region === 'GLOBAL' && lookThrough) {
          const lt = settings.lookThrough
          const sum = lt.US + lt.DEV + lt.EM || 1
          for (const k of ['US', 'DEV', 'EM'] as const) {
            if (axis === 'region') add(k, regionLabel(k), (r.value * lt[k]) / sum, r)
            else add(k === 'US' ? 'US' : k === 'DEV' ? '~DEV' : '~EM', k === 'US' ? nameOf('US') : regionLabel(k), (r.value * lt[k]) / sum, r)
          }
        } else if (axis === 'region') add(a.region, regionLabel(a.region), r.value, r)
        else if (a.region === 'SA' || a.region === 'US') add(a.region, nameOf(a.region), r.value, r)
        else add('~' + a.region, regionLabel(a.region), r.value, r)   // a region, not one country
        break
      }
      case 'sector': {
        const f = fractions(p?.sectors)
        if (f) { profiled += r.value; for (const [k, w] of f) add(SECTORS[k] ? k : 'OTHER', sectorLabel(k), r.value * w, r) }
        else add(SECTORS[a.sector] ? a.sector : 'NA', sectorLabel(SECTORS[a.sector] ? a.sector : 'NA'), r.value, r)
        break
      }
      case 'currency':
        add(a.currency, a.currency, r.value, r)
        break
      case 'platform':
        add(a.accountId, r.account?.name ?? L('بدون جهة', 'No provider'), r.value, r)
        break
      case 'liquidity': {
        const lq = defaultLiquidity(a)
        add(lq, L(LIQUIDITY_LABEL[lq].ar, LIQUIDITY_LABEL[lq].en), r.value, r)
        break
      }
    }
  }

  const total = Array.from(map.values()).reduce((s, v) => s + v.value, 0)
  const slices = Array.from(map, ([key, v]) => ({
    key, label: v.label, value: v.value, pct: total > 0 ? (v.value / total) * 100 : 0,
    parts: Array.from(v.parts.values()).sort((x, y) => y.value - x.value),
  })).sort((x, y) => y.value - x.value)
  const hhi = slices.reduce((s, x) => s + (x.pct / 100) ** 2, 0)
  const topPct = slices[0]?.pct ?? 0
  return {
    axis, slices, total, topPct,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    level: topPct > 70 ? 'concentrated' : topPct > 50 ? 'moderate' : 'diversified',
    profiledPct: total > 0 ? Math.min(100, (profiled / total) * 100) : 0,
  }
}

/** Value per asset class, looking through profiled assets (a balanced fund counts as part equity, part sukuk). */
export function classTotals(rows: AssetView[], profiles: Profiles = {}): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>
  for (const r of rows) {
    const f = fractions(profiles[r.asset.id]?.classSplit as Weights | undefined)
    if (f) for (const [k, w] of f) out[(ASSET_CLASSES as string[]).includes(k) ? (k as AssetClass) : 'OTHER'] += r.value * w
    else out[r.asset.assetClass] += r.value
  }
  return out
}

export interface Insight {
  id: string
  severity: 'warn' | 'info' | 'good'
  title: string
  body: string
}

const STALE_DAYS = 30

export function staleManualRows(rows: AssetView[], now = Date.now()): AssetView[] {
  return rows.filter((r) => {
    if (r.asset.pricing !== 'manual' || r.value <= 0) return false
    const t = new Date(r.asset.valueUpdatedAt).getTime()
    return !t || now - t > STALE_DAYS * 86400000
  })
}

/** Risk findings across every axis, for the investable (non-emergency) part of the portfolio. */
export function insights(rows: AssetView[], settings: Settings, L: Pick2, now = Date.now(), profiles: Profiles = {}): Insight[] {
  const out: Insight[] = []
  const total = rows.reduce((s, r) => s + r.value, 0)
  if (total <= 0) return out
  const pct = (v: number) => (v / total) * 100
  const fmt = (n: number) => n.toFixed(0) + '%'

  for (const r of rows) {
    if (!r.asset.isFund && r.asset.assetClass !== 'CASH' && pct(r.value) > 15) {
      out.push({
        id: 'single-' + r.asset.id,
        severity: 'warn',
        title: L(`تركّز في أصل واحد: ${r.asset.name}`, `Single-asset concentration: ${r.asset.name}`),
        body: L(
          `يمثل ${fmt(pct(r.value))} من محفظتك الاستثمارية. الأصل المنفرد فوق 15% يجعل نتيجتك مرهونة بشركة واحدة — وجّه المساهمات القادمة لغيره بدل بيعه.`,
          `It is ${fmt(pct(r.value))} of your investable portfolio. A single holding above 15% ties your outcome to one issuer — steer new money elsewhere rather than selling.`,
        ),
      })
    }
  }

  const equityRows = rows.filter((r) => r.asset.assetClass === 'EQUITY')
  if (equityRows.some((r) => r.value > 0)) {
    const sec = breakdown(equityRows, 'sector', settings, L, { profiles })
    const top = sec.slices.find((s) => s.key !== 'DIVERSIFIED' && s.key !== 'NA' && s.key !== 'OTHER')
    if (top && top.pct > 30) {
      out.push({
        id: 'sector',
        severity: 'warn',
        title: L(`تركّز قطاعي: ${top.label}`, `Sector concentration: ${top.label}`),
        body: L(`${fmt(top.pct)} من أسهمك في قطاع واحد. صندوق مؤشر واسع يوزّع هذا الخطر تلقائيًا.`, `${fmt(top.pct)} of your equities sit in one sector. A broad index fund spreads this automatically.`),
      })
    }
    const reg = breakdown(equityRows, 'region', settings, L, { profiles })
    const topR = reg.slices[0]
    if (topR && topR.pct > 70) {
      const home = topR.key === 'SA'
      out.push({
        id: 'region',
        severity: 'warn',
        title: L(`تركّز جغرافي: ${topR.label}`, `Geographic concentration: ${topR.label}`),
        body: home
          ? L(`${fmt(topR.pct)} من أسهمك في السوق المحلي، ودخلك أيضًا مرتبط بنفس الاقتصاد. التعرض العالمي يخفف هذا الارتباط.`, `${fmt(topR.pct)} of your equities are in the home market, and your salary depends on the same economy. Global exposure reduces that link.`)
          : L(`${fmt(topR.pct)} من أسهمك في منطقة واحدة. أضف أسواقًا أخرى (متقدمة/ناشئة/محلية) لتوزيع الخطر.`, `${fmt(topR.pct)} of your equities are in one region. Add other markets to spread the risk.`),
      })
    }
  }

  const platform = breakdown(rows, 'platform', settings, L)
  if (platform.slices.length > 0 && platform.topPct > 60) {
    out.push({
      id: 'platform',
      severity: 'info',
      title: L(`أغلب المحفظة عند جهة واحدة: ${platform.slices[0].label}`, `Most of the portfolio sits with one provider: ${platform.slices[0].label}`),
      body: L(`${fmt(platform.topPct)} من أصولك عند منصة واحدة. تأكد من ترخيصها وفصل أصول العملاء، وفكّر بتوزيع المبالغ الكبيرة على أكثر من جهة.`, `${fmt(platform.topPct)} of your assets are with one platform. Check its licence and client-asset segregation, and consider splitting large balances.`),
    })
  }

  const totals = classTotals(rows, profiles)
  const incomeCash = rows.filter((r) => r.asset.isIncomeAccount).reduce((s, r) => s + r.value, 0)
  if (pct(totals.CASH - incomeCash) > 25) {
    out.push({
      id: 'cash-drag',
      severity: 'info',
      title: L('نقد زائد خارج صندوق الطوارئ', 'Excess cash outside the emergency fund'),
      body: L(`${fmt(pct(totals.CASH - incomeCash))} من محفظتك الاستثمارية نقد. النقد يحميك اليوم لكن التضخم يأكله مع الوقت — استثمر الزائد تدريجيًا حسب توزيعك المستهدف.`, `${fmt(pct(totals.CASH - incomeCash))} of your investable portfolio is cash. It is safe today but inflation erodes it — invest the excess gradually toward your targets.`),
    })
  }
  if (pct(totals.CRYPTO) > 10) {
    out.push({
      id: 'crypto',
      severity: 'warn',
      title: L('وزن مرتفع للعملات الرقمية', 'High crypto weight'),
      body: L(`${fmt(pct(totals.CRYPTO))} من المحفظة في أصل شديد التقلب. اجعله بحجم تتحمل خسارته كاملًا.`, `${fmt(pct(totals.CRYPTO))} of the portfolio is in a highly volatile asset. Size it to what you could lose entirely.`),
    })
  }

  const usFunds = rows.filter((r) => r.asset.isFund && r.asset.domicile === 'US')
  if (usFunds.length > 0) {
    out.push({
      id: 'us-domicile',
      severity: 'info',
      title: L('صناديق مقرها أمريكا', 'US-domiciled funds'),
      body: L(`لديك ${usFunds.length} صندوق مقره أمريكا. لغير الأمريكيين قد يكون البديل الأيرلندي (UCITS) لنفس المؤشر أوفر ضريبيًا — راجع «دليل المستثمر».`, `You hold ${usFunds.length} US-domiciled fund(s). For non-US investors the Irish (UCITS) version of the same index can be more tax-efficient — see the investor guide.`),
    })
  }

  const stale = staleManualRows(rows, now)
  if (stale.length > 0) {
    out.push({
      id: 'stale',
      severity: 'info',
      title: L(`${stale.length} أصل يدوي يحتاج تحديث القيمة`, `${stale.length} manual asset(s) need a value update`),
      body: L('مرّ أكثر من 30 يومًا على آخر تحديث، فالتحليل قد لا يعكس الواقع.', 'More than 30 days since the last update, so the analysis may be off.'),
    })
  }

  if (out.every((i) => i.severity !== 'warn')) {
    out.unshift({
      id: 'ok',
      severity: 'good',
      title: L('لا تركّزات مقلقة', 'No worrying concentrations'),
      body: L('لا يوجد أصل أو قطاع أو منطقة يتجاوز حدود التنبيه.', 'No single asset, sector or region breaches the alert thresholds.'),
    })
  }
  return out
}
