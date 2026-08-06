/**
 * Web Push via the `web-push` package (nodejs_compat on Cloudflare Workers).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import webpush from 'web-push'

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
    webpush.setVapidDetails(
      opts.subject || 'mailto:cortenliving@gmail.com',
      opts.vapidPublicKey,
      opts.vapidPrivateKey,
    )

    const result = await webpush.sendNotification(
      {
        endpoint: opts.subscription.endpoint,
        keys: {
          p256dh: opts.subscription.p256dh,
          auth: opts.subscription.auth,
        },
      },
      opts.payload,
      {
        TTL: 86400,
        urgency: 'normal',
        headers: {},
      },
    )

    return { ok: true, status: result.statusCode || 201 }
  } catch (e: unknown) {
    const err = e as { statusCode?: number; body?: string; message?: string }
    const status = err.statusCode || 0
    return {
      ok: false,
      status,
      gone: status === 404 || status === 410,
      error: err.body || err.message || 'push failed',
    }
  }
}
