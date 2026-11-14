import type { AssetClass, Pick2, Settings } from '../types.ts'
import { ASSET_CLASSES, CLASS_LABEL, LIQUIDITY_LABEL, REGION_LABEL, SECTORS, defaultLiquidity } from '../labels.ts'
import type { AssetView } from './valuation.ts'

export type Axis = 'class' | 'region' | 'sector' | 'currency' | 'platform' | 'liquidity'

export interface Slice {
  key: string
  label: string
  value: number
  pct: number
}

export interface Breakdown {
  axis: Axis
  slices: Slice[]
  total: number
  topPct: number
  /** Effective number of equally-sized buckets (1 / HHI). */
  effectiveN: number
  level: 'concentrated' | 'moderate' | 'diversified'
}

function finish(axis: Axis, map: Map<string, { label: string; value: number }>): Breakdown {
  const total = Array.from(map.values()).reduce((s, v) => s + v.value, 0)
  const slices = Array.from(map, ([key, v]) => ({ key, label: v.label, value: v.value, pct: total > 0 ? (v.value / total) * 100 : 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
  const hhi = slices.reduce((s, x) => s + (x.pct / 100) ** 2, 0)
  const topPct = slices[0]?.pct ?? 0
  return {
    axis,
    slices,
    total,
    topPct,
    effectiveN: hhi > 0 ? 1 / hhi : 0,
    level: topPct > 70 ? 'concentrated' : topPct > 50 ? 'moderate' : 'diversified',
  }
}

export function breakdown(rows: AssetView[], axis: Axis, settings: Settings, L: Pick2, lookThrough = true): Breakdown {
  const map = new Map<string, { label: string; value: number }>()
  const add = (key: string, label: string, value: number) => {
    const cur = map.get(key) ?? { label, value: 0 }
    cur.value += value
    map.set(key, cur)
  }

  for (const r of rows) {
    const a = r.asset
    switch (axis) {
      case 'class':
        add(a.assetClass, L(CLASS_LABEL[a.assetClass].ar, CLASS_LABEL[a.assetClass].en), r.value)
        break
      case 'region': {
        if (a.region === 'GLOBAL' && lookThrough) {
          const lt = settings.lookThrough
          const sum = lt.US + lt.DEV + lt.EM || 1
          for (const k of ['US', 'DEV', 'EM'] as const) add(k, L(REGION_LABEL[k].ar, REGION_LABEL[k].en), (r.value * lt[k]) / sum)
        } else {
          add(a.region, L(REGION_LABEL[a.region].ar, REGION_LABEL[a.region].en), r.value)
        }
        break
      }
      case 'sector': {
        const s = SECTORS[a.sector] ?? SECTORS.NA
        add(SECTORS[a.sector] ? a.sector : 'NA', L(s.ar, s.en), r.value)
        break
      }
      case 'currency':
        add(a.currency, a.currency, r.value)
        break
      case 'platform':
        add(a.accountId, r.account?.name ?? L('بدون حساب', 'No account'), r.value)
        break
      case 'liquidity': {
        const lq = defaultLiquidity(a)
        add(lq, L(LIQUIDITY_LABEL[lq].ar, LIQUIDITY_LABEL[lq].en), r.value)
        break
      }
    }
  }
  return finish(axis, map)
}

export function classTotals(rows: AssetView[]): Record<AssetClass, number> {
  const out = Object.fromEntries(ASSET_CLASSES.map((c) => [c, 0])) as Record<AssetClass, number>
  for (const r of rows) out[r.asset.assetClass] += r.value
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
export function insights(rows: AssetView[], settings: Settings, L: Pick2, now = Date.now()): Insight[] {
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
  const equityTotal = equityRows.reduce((s, r) => s + r.value, 0)
  if (equityTotal > 0) {
    const sec = breakdown(equityRows, 'sector', settings, L)
    const top = sec.slices.find((s) => s.key !== 'DIVERSIFIED' && s.key !== 'NA')
    if (top && top.pct > 30) {
      out.push({
        id: 'sector',
        severity: 'warn',
        title: L(`تركّز قطاعي: ${top.label}`, `Sector concentration: ${top.label}`),
        body: L(
          `${fmt(top.pct)} من أسهمك في قطاع واحد. صندوق مؤشر واسع يوزّع هذا الخطر تلقائيًا.`,
          `${fmt(top.pct)} of your equities sit in one sector. A broad index fund spreads this automatically.`,
        ),
      })
    }
    const reg = breakdown(equityRows, 'region', settings, L, true)
    const topR = reg.slices[0]
    if (topR && topR.pct > 70) {
      const home = topR.key === 'SA'
      out.push({
        id: 'region',
        severity: 'warn',
        title: L(`تركّز جغرافي: ${topR.label}`, `Geographic concentration: ${topR.label}`),
        body: home
          ? L(
              `${fmt(topR.pct)} من أسهمك في السوق المحلي، ودخلك أيضًا مرتبط بنفس الاقتصاد. التعرض العالمي يخفف هذا الارتباط.`,
              `${fmt(topR.pct)} of your equities are in the home market, and your salary depends on the same economy. Global exposure reduces that link.`,
            )
          : L(
              `${fmt(topR.pct)} من أسهمك في منطقة واحدة. أضف أسواقًا أخرى (متقدمة/ناشئة/محلية) لتوزيع الخطر.`,
              `${fmt(topR.pct)} of your equities are in one region. Add other markets to spread the risk.`,
            ),
      })
    }
  }

  const platform = breakdown(rows, 'platform', settings, L)
  if (platform.slices.length > 0 && platform.topPct > 60 && total > 0) {
    out.push({
      id: 'platform',
      severity: 'info',
      title: L(`أغلب المحفظة عند جهة واحدة: ${platform.slices[0].label}`, `Most of the portfolio sits with one provider: ${platform.slices[0].label}`),
      body: L(
        `${fmt(platform.topPct)} من أصولك عند منصة واحدة. تأكد من ترخيصها وفصل أصول العملاء، وفكّر بتوزيع المبالغ الكبيرة على أكثر من جهة.`,
        `${fmt(platform.topPct)} of your assets are with one platform. Check its licence and client-asset segregation, and consider splitting large balances.`,
      ),
    })
  }

  const cash = rows.filter((r) => r.asset.assetClass === 'CASH').reduce((s, r) => s + r.value, 0)
  if (pct(cash) > 25) {
    out.push({
      id: 'cash-drag',
      severity: 'info',
      title: L('نقد زائد خارج صندوق الطوارئ', 'Excess cash outside the emergency fund'),
      body: L(
        `${fmt(pct(cash))} من محفظتك الاستثمارية نقد. النقد يحميك اليوم لكن التضخم يأكله مع الوقت — استثمر الزائد تدريجيًا حسب توزيعك المستهدف.`,
        `${fmt(pct(cash))} of your investable portfolio is cash. It is safe today but inflation erodes it — invest the excess gradually toward your targets.`,
      ),
    })
  }

  const crypto = rows.filter((r) => r.asset.assetClass === 'CRYPTO').reduce((s, r) => s + r.value, 0)
  if (pct(crypto) > 10) {
    out.push({
      id: 'crypto',
      severity: 'warn',
      title: L('وزن مرتفع للعملات الرقمية', 'High crypto weight'),
      body: L(
        `${fmt(pct(crypto))} من المحفظة في أصل شديد التقلب. اجعله بحجم تتحمل خسارته كاملًا.`,
        `${fmt(pct(crypto))} of the portfolio is in a highly volatile asset. Size it to what you could lose entirely.`,
      ),
    })
  }

  const usFunds = rows.filter((r) => r.asset.isFund && r.asset.domicile === 'US')
  if (usFunds.length > 0) {
    out.push({
      id: 'us-domicile',
      severity: 'info',
      title: L('صناديق مقرها أمريكا', 'US-domiciled funds'),
      body: L(
        `لديك ${usFunds.length} صندوق مقره أمريكا. لغير الأمريكيين قد يكون البديل الأيرلندي (UCITS) لنفس المؤشر أوفر ضريبيًا — راجع «دليل المستثمر».`,
        `You hold ${usFunds.length} US-domiciled fund(s). For non-US investors the Irish (UCITS) version of the same index can be more tax-efficient — see the investor guide.`,
      ),
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
