import { hasRemoteApi, remoteSubscribePush, remoteUnsubscribePush } from './sync'

const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

export function vapidConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && hasRemoteApi())
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    // vite-plugin-pwa registers automatically; wait for ready
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function getPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await getRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return Boolean(sub)
}

/**
 * Ask permission, create a Web Push subscription, and register it for the family.
 * Requires PWA service worker + VITE_VAPID_PUBLIC_KEY + API.
 */
export async function enablePushNotifications(
  familyId: string,
  memberId?: string,
): Promise<{ ok: boolean; message: string }> {
  if (!pushSupported()) {
    return {
      ok: false,
      message:
        'Push needs a modern browser. On iPhone: Add to Home Screen first (Safari → Share → Add to Home Screen).',
    }
  }
  if (!vapidConfigured()) {
    return {
      ok: false,
      message: 'Push is not configured on the server yet (missing VAPID keys).',
    }
  }
  if (!hasRemoteApi()) {
    return { ok: false, message: 'Cloud sync is required for family push.' }
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    return {
      ok: false,
      message: 'Notification permission denied. Enable it in system settings.',
    }
  }

  const reg = await getRegistration()
  if (!reg) {
    return {
      ok: false,
      message: 'Service worker not ready. Reload the app and try again.',
    }
  }

  try {
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!) as BufferSource,
      })
    }

    const json = sub.toJSON()
    const ok = await remoteSubscribePush(familyId, json, memberId)
    if (!ok) {
      return { ok: false, message: 'Could not save subscription on the server.' }
    }

    // Local confirmation so the user knows it works
    try {
      await reg.showNotification('Family Shop', {
        body: 'Notifications on — you’ll hear when family updates the list.',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'family-shop-enabled',
      })
    } catch {
      /* ignore show failure */
    }

    return { ok: true, message: 'Push notifications enabled for this device' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Subscribe failed'
    return {
      ok: false,
      message: /denied|permission/i.test(msg)
        ? 'Permission denied'
        : `Could not enable push: ${msg}`,
    }
  }
}

export async function disablePushNotifications(familyId: string): Promise<boolean> {
  const reg = await getRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return true
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  await remoteUnsubscribePush(familyId, endpoint)
  return true
}
