import type { AssetClass } from '../types.ts'

export interface SharePayload {
  v: 1
  /** ISO date of the snapshot. */
  d: string
  /** Display name chosen by the sharer. */
  n: string
  /** Total value; omitted when the sharer shares percentages only. */
  t?: number
  /** Asset-class split: [class, percent]. */
  c: [AssetClass, number][]
  /** Region split after look-through: [label, percent]. */
  r: [string, number][]
  /** Sector split of equities: [label, percent]. */
  s: [string, number][]
  /** Top holdings: [name, percent, class]; empty when names are hidden. */
  h: [string, number, AssetClass][]
  /** Goal progress percent, if a goal is set. */
  g?: number
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function encodeShare(p: SharePayload): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(p)))
}

export function decodeShare(hash: string): SharePayload | null {
  try {
    const raw = hash.replace(/^#/, '')
    if (!raw) return null
    const p = JSON.parse(new TextDecoder().decode(fromBase64Url(raw)))
    if (p?.v !== 1 || !Array.isArray(p.c)) return null
    return {
      v: 1,
      d: String(p.d ?? ''),
      n: String(p.n ?? '').slice(0, 60),
      t: typeof p.t === 'number' ? p.t : undefined,
      c: p.c,
      r: Array.isArray(p.r) ? p.r : [],
      s: Array.isArray(p.s) ? p.s : [],
      h: Array.isArray(p.h) ? p.h : [],
      g: typeof p.g === 'number' ? p.g : undefined,
    }
  } catch {
    return null
  }
}
