import type { AppSnapshot, Family, MasterItem, ShoppingItem } from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export function hasRemoteApi(): boolean {
  return Boolean(API_BASE)
}

export function apiUrl(path: string): string {
  if (!API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export async function remoteCreateFamily(name: string): Promise<Family | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl('/api/families'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) return null
    return (await res.json()) as Family
  } catch {
    return null
  }
}

export async function remoteJoinFamily(code: string): Promise<{
  family: Family
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
} | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl(`/api/families/join`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function remotePushSnapshot(snapshot: AppSnapshot): Promise<boolean> {
  if (!hasRemoteApi() || !snapshot.family) return false
  try {
    const res = await fetch(apiUrl(`/api/families/${snapshot.family.id}/sync`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterItems: snapshot.masterItems,
        shoppingItems: snapshot.shoppingItems,
        family: snapshot.family,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function remotePullSnapshot(familyId: string): Promise<{
  family: Family
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
} | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl(`/api/families/${familyId}`))
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export type RealtimeHandlers = {
  onSnapshot: (data: {
    masterItems: MasterItem[]
    shoppingItems: ShoppingItem[]
    family: Family
  }) => void
  onStatus: (status: 'connecting' | 'open' | 'closed' | 'error') => void
}

export function connectRealtime(
  familyId: string,
  handlers: RealtimeHandlers,
): () => void {
  if (!hasRemoteApi()) {
    handlers.onStatus('closed')
    return () => {}
  }

  const wsBase = API_BASE.replace(/^http/, 'ws')
  const url = `${wsBase}/api/ws/${familyId}`
  let ws: WebSocket | null = null
  let closed = false
  let retryMs = 1000
  let timer: ReturnType<typeof setTimeout> | null = null

  const connect = () => {
    if (closed) return
    handlers.onStatus('connecting')
    try {
      ws = new WebSocket(url)
    } catch {
      handlers.onStatus('error')
      scheduleRetry()
      return
    }

    ws.onopen = () => {
      retryMs = 1000
      handlers.onStatus('open')
    }
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string
          payload?: {
            masterItems: MasterItem[]
            shoppingItems: ShoppingItem[]
            family: Family
          }
        }
        if (msg.type === 'snapshot' && msg.payload) {
          handlers.onSnapshot(msg.payload)
        }
      } catch {
        /* ignore malformed */
      }
    }
    ws.onerror = () => handlers.onStatus('error')
    ws.onclose = () => {
      handlers.onStatus('closed')
      scheduleRetry()
    }
  }

  const scheduleRetry = () => {
    if (closed) return
    timer = setTimeout(() => {
      retryMs = Math.min(retryMs * 1.5, 15000)
      connect()
    }, retryMs)
  }

  connect()

  return () => {
    closed = true
    if (timer) clearTimeout(timer)
    ws?.close()
  }
}

export function broadcastLocalChange(familyId: string): void {
  try {
    const ch = new BroadcastChannel(`family-shop-${familyId}`)
    ch.postMessage({ type: 'local-change', at: Date.now() })
    ch.close()
  } catch {
    /* BroadcastChannel unavailable */
  }
}
