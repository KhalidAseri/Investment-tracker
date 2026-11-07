import { supabase } from './supabase'

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on'

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function deviceLabel() {
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return 'أندرويد'
  if (isIos()) return 'آيفون'
  if (/mac/i.test(ua)) return 'ماك'
  if (/windows/i.test(ua)) return 'ويندوز'
  return 'متصفح'
}

function keyToBytes(base64: string) {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  return navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    return sub && Notification.permission === 'granted' ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) return { ok: false, message: 'هذا المتصفح لا يدعم الإشعارات' }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, message: 'لم يُسمح بالإشعارات؛ فعّلها من إعدادات المتصفح لهذا الموقع' }
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'vapid' } })
  const publicKey: string | undefined = data?.publicKey
  if (error || !publicKey) return { ok: false, message: 'تعذّر تجهيز الإشعارات؛ أعد المحاولة' }
  try {
    const reg = await registration()
    await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) })
    const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
    const { error: e2 } = await supabase.from('push_subscriptions')
      .upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceLabel() }, { onConflict: 'endpoint' })
    if (e2) return { ok: false, message: 'تعذّر حفظ اشتراك الجهاز: ' + e2.message }
    return { ok: true, message: 'فُعّلت الإشعارات على هذا الجهاز' }
  } catch (e) {
    return { ok: false, message: 'تعذّر الاشتراك في الإشعارات: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export async function testPush(): Promise<{ ok: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke('daily-update', { body: { mode: 'push-test' } })
  if (error) return { ok: false, message: 'تعذّر إرسال الإشعار التجريبي' }
  return data?.ok ? { ok: true, message: 'أُرسل إشعار تجريبي؛ يصل خلال ثوانٍ' } : { ok: false, message: 'لا يوجد جهاز مشترك بعد؛ فعّل الإشعارات أولاً' }
}
