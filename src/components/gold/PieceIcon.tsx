'use client'

import type { PieceTypeId } from '@/lib/gold/types'

/**
 * Silhouettes for the fourteen piece types.
 *
 * Drawn by hand rather than pulled from an icon set, because no general set has
 * a غويشة, a مرتعشة or a سبيكة — and those distinctions are exactly the ones
 * that carry the price. A shopper recognises the shape of what is in front of
 * them far faster than they read its name off a dropdown.
 *
 * All glyphs share one grid (24×24), one stroke weight and `currentColor`, so
 * they read as one family and inherit the selected/unselected colour.
 */

const GLYPHS: Record<PieceTypeId, React.ReactNode> = {
  // Plain band — a single unadorned circle.
  weddingBand: <circle cx="12" cy="12" r="6.5" />,

  // Ring: a band with a raised stone.
  ring: (
    <>
      <circle cx="12" cy="14" r="5.5" />
      <path d="M9.5 6.5 12 3l2.5 3.5L12 9z" />
    </>
  ),

  // Machine chain: repeating links running corner to corner.
  chain: (
    <>
      <ellipse cx="7" cy="17" rx="2.6" ry="1.8" transform="rotate(-45 7 17)" />
      <ellipse cx="12" cy="12" rx="2.6" ry="1.8" transform="rotate(-45 12 12)" />
      <ellipse cx="17" cy="7" rx="2.6" ry="1.8" transform="rotate(-45 17 7)" />
    </>
  ),

  // Bracelet: an oval band with a clasp.
  bracelet: (
    <>
      <ellipse cx="12" cy="12" rx="8" ry="5.5" />
      <path d="M12 6.5v11" />
    </>
  ),

  // Bangle: solid and thick — two concentric circles.
  bangle: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
    </>
  ),

  // Anklet: a band with small drops along the bottom.
  anklet: (
    <>
      <ellipse cx="12" cy="10" rx="7.5" ry="5" />
      <path d="M7 14.5v2.5M12 15v3M17 14.5v2.5" />
    </>
  ),

  // Pendant: a chain arc carrying a drop.
  pendant: (
    <>
      <path d="M5 5a9 9 0 0 0 14 0" />
      <path d="M12 9.6v3.4" />
      <circle cx="12" cy="16" r="3" />
    </>
  ),

  // Earrings: a facing pair of hooks with drops.
  earrings: (
    <>
      <path d="M7 4a3 3 0 0 0-3 3v2" />
      <circle cx="4" cy="14" r="3" />
      <path d="M17 4a3 3 0 0 1 3 3v2" />
      <circle cx="20" cy="14" r="3" />
    </>
  ),

  // Braided necklace: a doubled arc, wider than a plain chain.
  necklace: (
    <>
      <path d="M4 5a10 10 0 0 0 16 0" />
      <path d="M4.5 8a9 9 0 0 0 15 0" />
      <circle cx="12" cy="17.5" r="2" />
    </>
  ),

  // Full set: a necklace arc plus the ring that comes with it.
  set: (
    <>
      <path d="M3.5 4.5a9.5 9.5 0 0 0 15 0" />
      <circle cx="11" cy="12" r="2.4" />
      <circle cx="6" cy="18" r="2.8" />
      <circle cx="17" cy="16.5" r="3.4" />
    </>
  ),

  // Murtaisha: the trembling piece — an arc hung with many strands.
  murtaisha: (
    <>
      <path d="M3 5a11 11 0 0 0 18 0" />
      <path d="M5 8.5V13M8 10.5v5.5M12 11.5v8M16 10.5v5.5M19 8.5V13" />
      <circle cx="12" cy="20.5" r="1.2" />
    </>
  ),

  // Coin: a struck disc.
  coin: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
    </>
  ),

  // Bar: an ingot, narrower at the top.
  bar: (
    <>
      <path d="M6.5 8h11l2.5 8H4z" />
      <path d="M8.5 12h7" />
    </>
  ),

  // Scrap: mismatched broken pieces.
  scrap: (
    <>
      <path d="M4 9.5 8 5l4.5 3-1.5 5z" />
      <path d="M13 13.5 18 11l2.5 5-4.5 3z" />
      <path d="M4.5 16.5 8 14l2 4-4 1.5z" />
    </>
  ),
}

export default function PieceIcon({
  piece,
  className,
}: {
  piece: PieceTypeId
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {GLYPHS[piece]}
    </svg>
  )
}
