// Face ID / fingerprint lock for this device, through the browser's built-in passkey prompt (WebAuthn).
// It guards opening the app on this device; the account itself is still protected by the password and the database rules.
const KEY = 'masar-lock'
const UNLOCKED = 'masar-unlocked-at'

export interface LockConfig { id: string; minutes: number }

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0))
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function lockConfig(): LockConfig | null {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v?.id ? v : null } catch { return null }
}
const saveConfig = (c: LockConfig | null) => { try { c ? localStorage.setItem(KEY, JSON.stringify(c)) : localStorage.removeItem(KEY) } catch { /* private mode */ } }

export async function lockAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && !!window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

export async function enableLock(email: string, minutes: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: random(32),
      rp: { name: 'مسار', id: location.hostname },
      user: { id: random(16), name: email || 'masar', displayName: email || 'مسار' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } }) as PublicKeyCredential | null
    if (!cred) return { ok: false, error: 'لم يكتمل التفعيل' }
    saveConfig({ id: b64(cred.rawId), minutes })
    markUnlocked()
    return { ok: true }
  } catch (e) {
    const name = (e as DOMException)?.name
    return { ok: false, error: name === 'NotAllowedError' ? 'أُلغي التفعيل أو انتهت مهلته' : name === 'InvalidStateError' ? 'هذا الجهاز مسجّل مسبقاً' : 'جهازك أو متصفحك لا يدعم القفل بالبصمة هنا' }
  }
}

export function disableLock() { saveConfig(null) }
export function setLockMinutes(minutes: number) { const c = lockConfig(); if (c) saveConfig({ ...c, minutes }) }

export async function verifyLock(): Promise<boolean> {
  const c = lockConfig()
  if (!c) return true
  try {
    const r = await navigator.credentials.get({ publicKey: {
      challenge: random(32), rpId: location.hostname, userVerification: 'required', timeout: 60000,
      allowCredentials: [{ type: 'public-key', id: unb64(c.id), transports: ['internal', 'hybrid'] }],
    } })
    if (r) markUnlocked()
    return !!r
  } catch { return false }
}

/** after a password sign-in, or a successful unlock */
export function markUnlocked() { try { sessionStorage.setItem(UNLOCKED, String(Date.now())) } catch { /* ignore */ } }
export function recentlyUnlocked(withinMs = 60000) {
  try { return Date.now() - Number(sessionStorage.getItem(UNLOCKED) ?? 0) < withinMs } catch { return false }
}
