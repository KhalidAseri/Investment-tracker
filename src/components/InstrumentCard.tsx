// One instrument pick (advisor.pickInstrument) as a card: what to buy, where, its cost and yield, the suitable tenor for
// sukuk and cash, and ≈ units for an amount. Shared by the Plan tab, the deposit planner, the wizard and the BuySheet.
// Read-only: actions are passed in by the caller.
import type { ReactNode } from 'react'
import { ASSET_CLASS_LABEL, PLATFORM_LABEL, marketKey, type CatalogItem, type Platform } from '../lib/catalog'
import type { InstrumentPick } from '../lib/advisor'
import type { MarketInputs } from '../lib/marketTypes'
import type { Holding } from '../lib/types'
import { num2 } from '../lib/format'
import { layerColor } from '../lib/ui'
import { Avatar, Money, Pct } from './kit'
import './InstrumentCard.css'

/** «3 سنوات» · «أقل من سنة» */
export function tenorText(years: number | null | undefined): string | null {
  if (years == null || !Number.isFinite(years)) return null
  const r = Math.round(years * 10) / 10
  if (r < 1) return 'أقل من سنة'
  if (r === 1) return 'سنة'
  if (r === 2) return 'سنتان'
  if (Number.isInteger(r) && r >= 3 && r <= 10) return `${r} سنوات`
  return `${r} سنة`
}

/** «سيولة يومية» · «تسوية خلال يومين» · «لأجل محدد» · «مقيّد» */
const LIQ: Record<CatalogItem['liquidity'], string> = { daily: 'سيولة يومية', 'T+2': 'يُباع في السوق', term: 'لأجل محدد', locked: 'مقيّد' }

/** The Arabic name without a trailing English part in brackets (for inline lists). */
export const shortName = (name: string) => name.replace(/\s*\((?=[^)]*[A-Za-z])[^)]*\)\s*$/, '').trim() || name

/** Ticker or fund id kept left-to-right. */
export const Ticker = ({ v }: { v: string | null | undefined }) => (v ? <bdi dir="ltr" className="ic-tk">{v}</bdi> : null)

/** short platform name for chips: «دراية العالمية» */
export const platformShort = (p: Platform | null | undefined) => (p ? PLATFORM_LABEL[p].replace(/\s*\(.*\)$/, '') : null)

export function InstrumentCard({ pick, item: itemIn, holding: holdingIn, amount, market, reason, showReason = true, compact, action, className = '' }: {
  pick?: InstrumentPick | null
  item?: CatalogItem | null
  holding?: Holding | null
  amount?: number | null
  market?: MarketInputs
  /** overrides pick.reason */
  reason?: ReactNode
  showReason?: boolean
  compact?: boolean
  action?: ReactNode
  className?: string
}) {
  const item = itemIn !== undefined ? itemIn : pick?.item ?? null
  const holding = holdingIn !== undefined ? holdingIn : pick?.holding ?? null
  if (!item && !holding) {
    return (
      <div className={`ic ic-empty ${className}`}>
        <p className="small muted">{reason ?? pick?.reason ?? 'لا أداة محددة بعد'}</p>
        {action}
      </div>
    )
  }
  const name = item?.name ?? holding!.name
  const key = item ? marketKey(item) : holding?.symbol ?? null
  const yieldPct = key && market ? market.yields[key] ?? null : null
  const platform = pick?.platform ?? item?.platforms[0] ?? null
  const ticker = item ? item.symbol : holding?.symbol ?? null
  const color = item ? layerColor(item.layer) : 'var(--accent)'
  const units = pick?.units ?? null
  const price = pick?.price ?? null
  const cur = pick?.currency ?? item?.currency ?? null
  const dur = pick?.duration ?? null
  const tenor = tenorText(item?.duration_years)
  return (
    <div className={`ic ${compact ? 'compact' : ''} ${className}`}>
      <div className="ic-head">
        <Avatar name={name} symbol={ticker && /^[A-Z]/i.test(ticker) ? ticker : null} color={color} size={compact ? 36 : 42} />
        <div className="ic-main">
          <b className="ic-name">{name}</b>
          <span className="ic-sub">
            {ticker && <Ticker v={ticker} />}
            {item?.source === 'nav' && item.fund_id && !ticker && <span>صندوق <Ticker v={item.fund_id} /></span>}
            {platform && <span>{platformShort(platform)}</span>}
            {!compact && item && <span>{ASSET_CLASS_LABEL[item.class]}</span>}
          </span>
        </div>
        {holding && <span className="chip accent ic-own">تملكه</span>}
      </div>

      {!compact && item && (
        <div className="ic-facts">
          {item.ter != null && <span>الرسوم <b><Pct v={item.ter} digits={2} /></b></span>}
          {yieldPct != null && yieldPct > 0 && <span>التوزيع <b><Pct v={yieldPct} digits={1} /></b></span>}
          {tenor && <span>المدة <b>{tenor}</b></span>}
          <span>{LIQ[item.liquidity]}</span>
          {item.min_investment != null && item.min_investment > 1 && <span>الحد الأدنى <b><Money v={item.min_investment} /></b></span>}
        </div>
      )}

      {amount != null && amount > 0 && units != null && price != null && (
        <p className="ic-units">≈ <b className="figure"><bdi dir="ltr">{units >= 100 ? Math.round(units).toLocaleString('en-US') : num2(units)}</bdi></b> وحدة بسعر <bdi dir="ltr" className="figure">{num2(price)}</bdi> {!cur || cur === 'SAR' ? 'ريال' : <bdi dir="ltr">{cur}</bdi>}</p>
      )}

      {dur && (
        <div className="ic-dur">
          <span className="chip ic-tenor">{dur.label}</span>
          {!compact && <small>{dur.reason}</small>}
        </div>
      )}

      {showReason && (reason ?? pick?.reason) && <p className="ic-why">{reason ?? pick?.reason}</p>}
      {action && <div className="ic-actions">{action}</div>}
    </div>
  )
}
