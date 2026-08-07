import { lookupProduct } from './productLookup'
import { sendWebPush } from './webpush'

export interface Env {
  DB: D1Database
  FAMILY_ROOM: DurableObjectNamespace
  APP_NAME: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
}

type MasterRow = {
  id: string
  family_id: string
  name: string
  brand: string | null
  barcode: string | null
  size_label: string | null
  image_url: string | null
  category: string
  frequent: number
  default_notes: string | null
  week_add_count: number | null
  last_added_to_week_at: number | null
  created_at: number
  updated_at: number
}

type ShopRow = {
  id: string
  family_id: string
  master_item_id: string
  quantity: string
  notes: string
  checked: number
  checked_at: number | null
  added_at: number
  added_by: string | null
}

type MemberRow = {
  id: string
  family_id: string
  display_name: string
  last_seen_at: number
  joined_at: number
}

/** Consider someone "active" if seen in the last 10 minutes. */
const ACTIVE_MS = 10 * 60 * 1000

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

function cors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  return null
}

function familyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function mapMaster(r: MasterRow) {
  return {
    id: r.id,
    familyId: r.family_id,
    name: r.name,
    brand: r.brand ?? undefined,
    barcode: r.barcode ?? undefined,
    sizeLabel: r.size_label ?? undefined,
    imageUrl: r.image_url ?? undefined,
    category: r.category,
    frequent: Boolean(r.frequent),
    defaultNotes: r.default_notes ?? undefined,
    weekAddCount: r.week_add_count ?? 0,
    lastAddedToWeekAt: r.last_added_to_week_at ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapShop(r: ShopRow) {
  return {
    id: r.id,
    familyId: r.family_id,
    masterItemId: r.master_item_id,
    quantity: r.quantity,
    notes: r.notes,
    checked: Boolean(r.checked),
    checkedAt: r.checked_at ?? undefined,
    addedAt: r.added_at,
    addedBy: r.added_by ?? undefined,
  }
}

function mapMember(r: MemberRow) {
  const now = Date.now()
  return {
    id: r.id,
    familyId: r.family_id,
    displayName: r.display_name,
    lastSeenAt: r.last_seen_at,
    joinedAt: r.joined_at,
    active: now - r.last_seen_at < ACTIVE_MS,
  }
}

async function upsertMember(
  db: D1Database,
  familyId: string,
  member: { id: string; displayName: string } | undefined | null,
) {
  if (!member?.id) return
  const now = Date.now()
  const name = (member.displayName || 'Me').trim() || 'Me'
  await db
    .prepare(
      `INSERT INTO family_members (id, family_id, display_name, last_seen_at, joined_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(family_id, id) DO UPDATE SET
         display_name = excluded.display_name,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(member.id, familyId, name, now, now)
    .run()
}

async function loadFamilyBundle(db: D1Database, familyId: string) {
  const family = await db
    .prepare('SELECT id, code, name, created_at as createdAt FROM families WHERE id = ?')
    .bind(familyId)
    .first<{ id: string; code: string; name: string; createdAt: number }>()

  if (!family) return null

  const master = await db
    .prepare('SELECT * FROM master_items WHERE family_id = ? ORDER BY updated_at DESC')
    .bind(familyId)
    .all<MasterRow>()

  const shopping = await db
    .prepare('SELECT * FROM shopping_items WHERE family_id = ? ORDER BY added_at DESC')
    .bind(familyId)
    .all<ShopRow>()

  const members = await db
    .prepare(
      'SELECT * FROM family_members WHERE family_id = ? ORDER BY last_seen_at DESC',
    )
    .bind(familyId)
    .all<MemberRow>()

  const memberList = (members.results ?? []).map(mapMember)

  return {
    family: {
      id: family.id,
      code: family.code,
      name: family.name,
      createdAt: family.createdAt,
    },
    masterItems: (master.results ?? []).map(mapMaster),
    shoppingItems: (shopping.results ?? []).map(mapShop),
    members: memberList,
    memberCount: memberList.length,
    activeCount: memberList.filter((m) => m.active).length,
  }
}

async function broadcast(env: Env, familyId: string) {
  const id = env.FAMILY_ROOM.idFromName(familyId)
  const stub = env.FAMILY_ROOM.get(id)
  const bundle = await loadFamilyBundle(env.DB, familyId)
  if (!bundle) return
  await stub.fetch('https://room/broadcast', {
    method: 'POST',
    body: JSON.stringify({ type: 'snapshot', payload: bundle }),
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const preflight = cors(request)
    if (preflight) return preflight

    const url = new URL(request.url)
    const path = url.pathname

    try {
      // WebSocket upgrade → Durable Object room
      if (path.startsWith('/api/ws/')) {
        const familyId = path.slice('/api/ws/'.length)
        if (!familyId) return json({ error: 'Missing family id' }, 400)
        const id = env.FAMILY_ROOM.idFromName(familyId)
        const stub = env.FAMILY_ROOM.get(id)
        return stub.fetch(request)
      }

      if (path === '/api/health') {
        return json({
          ok: true,
          app: env.APP_NAME,
          push: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
        })
      }

      // Public VAPID key for client push subscribe
      if (path === '/api/push/vapid-public-key' && request.method === 'GET') {
        if (!env.VAPID_PUBLIC_KEY) {
          return json({ error: 'Push not configured' }, 503)
        }
        return json({ publicKey: env.VAPID_PUBLIC_KEY })
      }

      // Product barcode lookup (proxied so we can send a proper User-Agent
      // and try multiple databases — browsers strip UA and OFF 404s look like errors)
      const productMatch = path.match(/^\/api\/product\/([^/]+)$/)
      if (productMatch && request.method === 'GET') {
        const code = decodeURIComponent(productMatch[1]!)
        const result = await lookupProduct(code)
        // Always 200 — "not found" is a normal result, not an HTTP error
        return json(result)
      }

      if (path === '/api/families' && request.method === 'POST') {
        const body = (await request.json()) as {
          name?: string
          member?: { id: string; displayName: string }
        }
        const id = crypto.randomUUID()
        const code = familyCode()
        const name = (body.name || 'Our Family').trim()
        const createdAt = Date.now()
        await env.DB.prepare(
          'INSERT INTO families (id, code, name, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(id, code, name, createdAt)
          .run()
        await upsertMember(env.DB, id, body.member)
        return json({ id, code, name, createdAt })
      }

      if (path === '/api/families/join' && request.method === 'POST') {
        const body = (await request.json()) as {
          code?: string
          member?: { id: string; displayName: string }
        }
        const code = (body.code || '').trim().toUpperCase()
        const family = await env.DB.prepare(
          'SELECT id FROM families WHERE code = ?',
        )
          .bind(code)
          .first<{ id: string }>()
        if (!family) return json({ error: 'Not found' }, 404)
        await upsertMember(env.DB, family.id, body.member)
        const bundle = await loadFamilyBundle(env.DB, family.id)
        return json(bundle)
      }

      // --- Web Push subscribe / unsubscribe ---
      const pushSubMatch = path.match(/^\/api\/families\/([^/]+)\/push\/subscribe$/)
      if (pushSubMatch && request.method === 'POST') {
        const familyId = pushSubMatch[1]!
        const body = (await request.json()) as {
          memberId?: string
          subscription?: {
            endpoint?: string
            keys?: { p256dh?: string; auth?: string }
          }
        }
        const endpoint = body.subscription?.endpoint
        const p256dh = body.subscription?.keys?.p256dh
        const auth = body.subscription?.keys?.auth
        if (!endpoint || !p256dh || !auth) {
          return json({ error: 'Invalid subscription' }, 400)
        }
        const family = await env.DB.prepare('SELECT id FROM families WHERE id = ?')
          .bind(familyId)
          .first()
        if (!family) return json({ error: 'Not found' }, 404)
        const now = Date.now()
        await env.DB.prepare(
          `INSERT INTO push_subscriptions (endpoint, family_id, member_id, p256dh, auth, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(endpoint) DO UPDATE SET
             family_id = excluded.family_id,
             member_id = excluded.member_id,
             p256dh = excluded.p256dh,
             auth = excluded.auth,
             last_seen_at = excluded.last_seen_at`,
        )
          .bind(endpoint, familyId, body.memberId ?? null, p256dh, auth, now, now)
          .run()
        return json({ ok: true })
      }

      const pushUnsubMatch = path.match(
        /^\/api\/families\/([^/]+)\/push\/unsubscribe$/,
      )
      if (pushUnsubMatch && request.method === 'POST') {
        const body = (await request.json()) as { endpoint?: string }
        if (body.endpoint) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
            .bind(body.endpoint)
            .run()
        }
        return json({ ok: true })
      }

      // Heartbeat / register presence for a member
      const memberMatch = path.match(/^\/api\/families\/([^/]+)\/members$/)
      if (memberMatch && request.method === 'POST') {
        const familyId = memberMatch[1]!
        const body = (await request.json()) as {
          id?: string
          displayName?: string
        }
        if (!body.id) return json({ error: 'Missing member id' }, 400)
        const family = await env.DB.prepare('SELECT id FROM families WHERE id = ?')
          .bind(familyId)
          .first()
        if (!family) return json({ error: 'Not found' }, 404)
        await upsertMember(env.DB, familyId, {
          id: body.id,
          displayName: body.displayName || 'Me',
        })
        const bundle = await loadFamilyBundle(env.DB, familyId)
        // Notify others of roster update (same snapshot channel)
        await broadcast(env, familyId)
        return json(bundle)
      }

      // Remove a member from the family roster (cleans up duplicate / unwanted accounts)
      const removeMemberMatch = path.match(
        /^\/api\/families\/([^/]+)\/members\/([^/]+)$/,
      )
      if (removeMemberMatch && request.method === 'DELETE') {
        const familyId = removeMemberMatch[1]!
        const memberId = decodeURIComponent(removeMemberMatch[2]!)
        if (!memberId) return json({ error: 'Missing member id' }, 400)
        const family = await env.DB.prepare('SELECT id FROM families WHERE id = ?')
          .bind(familyId)
          .first()
        if (!family) return json({ error: 'Not found' }, 404)

        await env.DB.prepare(
          'DELETE FROM family_members WHERE family_id = ? AND id = ?',
        )
          .bind(familyId, memberId)
          .run()
        // Drop push subscriptions tied to that member so they stop getting pings
        await env.DB.prepare(
          'DELETE FROM push_subscriptions WHERE family_id = ? AND member_id = ?',
        )
          .bind(familyId, memberId)
          .run()

        const bundle = await loadFamilyBundle(env.DB, familyId)
        await broadcast(env, familyId)
        return json(bundle)
      }

      const familyMatch = path.match(/^\/api\/families\/([^/]+)$/)
      if (familyMatch && request.method === 'GET') {
        const bundle = await loadFamilyBundle(env.DB, familyMatch[1]!)
        if (!bundle) return json({ error: 'Not found' }, 404)
        return json(bundle)
      }

      const syncMatch = path.match(/^\/api\/families\/([^/]+)\/sync$/)
      if (syncMatch && request.method === 'PUT') {
        const familyId = syncMatch[1]!
        const body = (await request.json()) as {
          family: { id: string; code: string; name: string; createdAt: number }
          member?: { id: string; displayName: string }
          masterItems: Array<{
            id: string
            familyId: string
            name: string
            brand?: string
            barcode?: string
            sizeLabel?: string
            imageUrl?: string
            category: string
            frequent: boolean
            defaultNotes?: string
            weekAddCount?: number
            lastAddedToWeekAt?: number
            createdAt: number
            updatedAt: number
          }>
          shoppingItems: Array<{
            id: string
            familyId: string
            masterItemId: string
            quantity: string
            notes: string
            checked: boolean
            checkedAt?: number
            addedAt: number
            addedBy?: string
          }>
          notify?: {
            title?: string
            body?: string
            excludeMemberId?: string
          }
        }

        // Ensure family row exists
        await env.DB.prepare(
          `INSERT INTO families (id, code, name, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, code = excluded.code`,
        )
          .bind(
            body.family.id,
            body.family.code,
            body.family.name,
            body.family.createdAt,
          )
          .run()

        await upsertMember(env.DB, familyId, body.member)

        // Replace lists for this family (simple last-write-wins snapshot sync)
        await env.DB.prepare('DELETE FROM shopping_items WHERE family_id = ?')
          .bind(familyId)
          .run()
        await env.DB.prepare('DELETE FROM master_items WHERE family_id = ?')
          .bind(familyId)
          .run()

        const stmts: D1PreparedStatement[] = []
        for (const m of body.masterItems) {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO master_items
              (id, family_id, name, brand, barcode, size_label, image_url, category, frequent, default_notes, week_add_count, last_added_to_week_at, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              m.id,
              familyId,
              m.name,
              m.brand ?? null,
              m.barcode ?? null,
              m.sizeLabel ?? null,
              m.imageUrl ?? null,
              m.category,
              m.frequent ? 1 : 0,
              m.defaultNotes ?? null,
              m.weekAddCount ?? 0,
              m.lastAddedToWeekAt ?? null,
              m.createdAt,
              m.updatedAt,
            ),
          )
        }
        for (const s of body.shoppingItems) {
          stmts.push(
            env.DB.prepare(
              `INSERT INTO shopping_items
              (id, family_id, master_item_id, quantity, notes, checked, checked_at, added_at, added_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              s.id,
              familyId,
              s.masterItemId,
              s.quantity ?? '',
              s.notes ?? '',
              s.checked ? 1 : 0,
              s.checkedAt ?? null,
              s.addedAt,
              s.addedBy ?? null,
            ),
          )
        }
        if (stmts.length) {
          await env.DB.batch(stmts)
        }

        await broadcast(env, familyId)

        // Fan-out Web Push to other devices in the family
        let pushSent = 0
        let pushFailed = 0
        let pushSkipped = 0
        if (body.notify?.title && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
          const subs = await env.DB.prepare(
            'SELECT endpoint, p256dh, auth, member_id FROM push_subscriptions WHERE family_id = ?',
          )
            .bind(familyId)
            .all<{
              endpoint: string
              p256dh: string
              auth: string
              member_id: string | null
            }>()

          const payload = JSON.stringify({
            title: body.notify.title,
            body: body.notify.body || 'Shopping list updated',
            url: '/',
            tag: 'family-shop-list',
          })

          const exclude = body.notify.excludeMemberId
          const rows = subs.results ?? []
          if (rows.length === 0) {
            // No devices have push enabled for this family
            pushSkipped = 0
          }
          for (const sub of rows) {
            // Skip the sender's device(s) so they don't ping themselves
            if (exclude && sub.member_id && sub.member_id === exclude) {
              pushSkipped++
              continue
            }
            const result = await sendWebPush({
              subscription: {
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
              payload,
              vapidPublicKey: env.VAPID_PUBLIC_KEY,
              vapidPrivateKey: env.VAPID_PRIVATE_KEY,
              subject: env.VAPID_SUBJECT,
            })
            if (result.ok) {
              pushSent++
            } else {
              pushFailed++
              if (result.gone) {
                await env.DB.prepare(
                  'DELETE FROM push_subscriptions WHERE endpoint = ?',
                )
                  .bind(sub.endpoint)
                  .run()
              }
            }
          }
        }

        return json({
          ok: true,
          push: {
            sent: pushSent,
            failed: pushFailed,
            skipped: pushSkipped,
            configured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
          },
        })
      }

      // Send a test push to all family devices except the caller (debug / verify setup)
      const testPushMatch = path.match(/^\/api\/families\/([^/]+)\/push\/test$/)
      if (testPushMatch && request.method === 'POST') {
        const familyId = testPushMatch[1]!
        if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
          return json({ error: 'Push not configured on server' }, 503)
        }
        const body = (await request.json().catch(() => ({}))) as {
          excludeMemberId?: string
          title?: string
          body?: string
        }
        const subs = await env.DB.prepare(
          'SELECT endpoint, p256dh, auth, member_id FROM push_subscriptions WHERE family_id = ?',
        )
          .bind(familyId)
          .all<{
            endpoint: string
            p256dh: string
            auth: string
            member_id: string | null
          }>()

        const payload = JSON.stringify({
          title: body.title || 'Family Shop',
          body: body.body || 'Test notification — push is working!',
          url: '/',
          tag: 'family-shop-test',
        })

        let sent = 0
        let failed = 0
        let skipped = 0
        const errors: string[] = []
        for (const sub of subs.results ?? []) {
          if (
            body.excludeMemberId &&
            sub.member_id &&
            sub.member_id === body.excludeMemberId
          ) {
            skipped++
            continue
          }
          const result = await sendWebPush({
            subscription: {
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
            payload,
            vapidPublicKey: env.VAPID_PUBLIC_KEY,
            vapidPrivateKey: env.VAPID_PRIVATE_KEY,
            subject: env.VAPID_SUBJECT,
          })
          if (result.ok) sent++
          else {
            failed++
            if (result.error) errors.push(result.error.slice(0, 120))
            if (result.gone) {
              await env.DB.prepare(
                'DELETE FROM push_subscriptions WHERE endpoint = ?',
              )
                .bind(sub.endpoint)
                .run()
            }
          }
        }
        return json({
          ok: true,
          total: (subs.results ?? []).length,
          sent,
          failed,
          skipped,
          errors: errors.slice(0, 3),
        })
      }

      return json({ error: 'Not found' }, 404)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Server error'
      return json({ error: message }, 500)
    }
  },
}

/** Per-family WebSocket room for realtime list updates. */
export class FamilyRoom implements DurableObject {
  private sessions: Set<WebSocket> = new Set()

  constructor(
    private state: DurableObjectState,
    _env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const body = await request.text()
      for (const ws of this.sessions) {
        try {
          ws.send(body)
        } catch {
          this.sessions.delete(ws)
        }
      }
      return new Response('ok')
    }

    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 })
    }

    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    server.accept()
    this.sessions.add(server)

    server.addEventListener('close', () => this.sessions.delete(server))
    server.addEventListener('error', () => this.sessions.delete(server))
    server.addEventListener('message', (event) => {
      // Optional client ping / echo for presence
      if (typeof event.data === 'string' && event.data === 'ping') {
        server.send(JSON.stringify({ type: 'pong' }))
      }
    })

    return new Response(null, { status: 101, webSocket: client })
  }
}
