import type {
  AppSnapshot,
  Family,
  FamilyMember,
  MasterItem,
  MemberProfile,
  ShoppingItem,
} from '../types'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export type FamilyBundle = {
  family: Family
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
  members?: FamilyMember[]
  memberCount?: number
  activeCount?: number
}

export function hasRemoteApi(): boolean {
  return Boolean(API_BASE)
}

export function apiUrl(path: string): string {
  if (!API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export async function remoteCreateFamily(
  name: string,
  member?: MemberProfile | null,
): Promise<Family | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl('/api/families'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        member: member
          ? { id: member.id, displayName: member.displayName }
          : undefined,
      }),
    })
    if (!res.ok) return null
    return (await res.json()) as Family
  } catch {
    return null
  }
}

export async function remoteJoinFamily(
  code: string,
  member?: MemberProfile | null,
): Promise<FamilyBundle | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl(`/api/families/join`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        member: member
          ? { id: member.id, displayName: member.displayName }
          : undefined,
      }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function remotePushSnapshot(
  snapshot: AppSnapshot,
  opts?: {
    notify?: { title: string; body: string; excludeMemberId?: string }
  },
): Promise<boolean> {
  if (!hasRemoteApi() || !snapshot.family) return false
  try {
    const res = await fetch(apiUrl(`/api/families/${snapshot.family.id}/sync`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        masterItems: snapshot.masterItems,
        shoppingItems: snapshot.shoppingItems,
        family: snapshot.family,
        member: snapshot.member
          ? {
              id: snapshot.member.id,
              displayName: snapshot.member.displayName,
            }
          : undefined,
        notify: opts?.notify,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function remoteSubscribePush(
  familyId: string,
  subscription: PushSubscriptionJSON,
  memberId?: string,
): Promise<boolean> {
  if (!hasRemoteApi()) return false
  try {
    const res = await fetch(apiUrl(`/api/families/${familyId}/push/subscribe`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription, memberId }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function remoteUnsubscribePush(
  familyId: string,
  endpoint: string,
): Promise<boolean> {
  if (!hasRemoteApi()) return false
  try {
    const res = await fetch(
      apiUrl(`/api/families/${familyId}/push/unsubscribe`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function remotePullSnapshot(
  familyId: string,
): Promise<FamilyBundle | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl(`/api/families/${familyId}`))
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Register / heartbeat so others see you on the family roster. */
export async function remoteRegisterMember(
  familyId: string,
  member: MemberProfile,
): Promise<FamilyBundle | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(apiUrl(`/api/families/${familyId}/members`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: member.id,
        displayName: member.displayName,
      }),
    })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

/** Remove a member account from the family roster (e.g. duplicates). */
export async function remoteRemoveMember(
  familyId: string,
  memberId: string,
): Promise<FamilyBundle | null> {
  if (!hasRemoteApi()) return null
  try {
    const res = await fetch(
      apiUrl(
        `/api/families/${familyId}/members/${encodeURIComponent(memberId)}`,
      ),
      { method: 'DELETE' },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export type RealtimeHandlers = {
  onSnapshot: (data: FamilyBundle) => void
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
          payload?: FamilyBundle
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
