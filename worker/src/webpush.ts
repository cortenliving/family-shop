/**
 * Web Push via Web Crypto (works on Cloudflare Workers).
 * Replaces the Node-only `web-push` package which fails silently on edge
 * (crypto.createECDH is not a function).
 */
import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from '@block65/webcrypto-web-push'

export type StoredPushSub = {
  endpoint: string
  p256dh: string
  auth: string
}

export async function sendWebPush(opts: {
  subscription: StoredPushSub
  payload: string
  vapidPublicKey: string
  vapidPrivateKey: string
  subject?: string
}): Promise<{ ok: boolean; status: number; error?: string; gone?: boolean }> {
  try {
    const vapid: VapidKeys = {
      subject: opts.subject || 'mailto:cortenliving@gmail.com',
      publicKey: opts.vapidPublicKey,
      privateKey: opts.vapidPrivateKey,
    }

    const subscription: PushSubscription = {
      endpoint: opts.subscription.endpoint,
      expirationTime: null,
      keys: {
        p256dh: opts.subscription.p256dh,
        auth: opts.subscription.auth,
      },
    }

    // buildPushPayload expects message data as a string (JSON body for the SW)
    const message: PushMessage = {
      data: opts.payload,
      options: {
        ttl: 86400,
        urgency: 'high',
      },
    }

    const init = await buildPushPayload(message, subscription, vapid)
    const res = await fetch(subscription.endpoint, init)
    const status = res.status

    if (status === 201 || status === 200) {
      return { ok: true, status }
    }

    return {
      ok: false,
      status,
      gone: status === 404 || status === 410,
      error: (await res.text().catch(() => '')) || `HTTP ${status}`,
    }
  } catch (e: unknown) {
    const err = e as { statusCode?: number; message?: string }
    const status = err.statusCode || 0
    return {
      ok: false,
      status,
      gone: status === 404 || status === 410,
      error: err.message || 'push failed',
    }
  }
}
