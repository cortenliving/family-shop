import type { MasterItem, ShoppingItem, Tombstone } from '../types'

/**
 * PHASE 0 — deletes came back because these unions kept a row that only one
 * side still had, and localHasExclusiveItems() re-pushed that row. A delete
 * now writes a tombstone. Merge drops the id when the tombstone is at least
 * as new as the row. Tombstoned ids do not count as exclusive items.
 */

export const TOMBSTONE_CAP = 500

export interface ListState {
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
  tombstones: Tombstone[]
  updatedAt: number
}

export function shopStamp(item: ShoppingItem): number {
  return Math.max(item.addedAt || 0, item.updatedAt || 0, item.checkedAt || 0)
}

export function capTombstones(list: Tombstone[]): Tombstone[] {
  const map = new Map<string, Tombstone>()
  for (const t of list) {
    if (!t || (t.kind !== 'master' && t.kind !== 'shop') || !t.id || !t.deletedAt) continue
    const key = `${t.kind}:${t.id}`
    const prev = map.get(key)
    if (!prev || t.deletedAt >= prev.deletedAt) map.set(key, t)
  }
  return [...map.values()].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, TOMBSTONE_CAP)
}

export function tombstoneWins(
  tombstones: Tombstone[],
  kind: Tombstone['kind'],
  id: string,
  stamp: number,
): boolean {
  let deletedAt = -1
  for (const t of tombstones) {
    if (t.kind === kind && t.id === id && t.deletedAt > deletedAt) deletedAt = t.deletedAt
  }
  return deletedAt >= 0 && deletedAt >= stamp
}

/**
 * Union master libraries by id. Keeps items that exist only on one side
 * so a stale/smaller cloud snapshot cannot delete products you just added.
 */
export function mergeMasterItems(
  local: MasterItem[],
  remote: MasterItem[],
  tombstones: Tombstone[] = [],
): MasterItem[] {
  const map = new Map<string, MasterItem>()

  for (const m of remote) {
    map.set(m.id, m)
  }

  for (const m of local) {
    const r = map.get(m.id)
    if (!r) {
      map.set(m.id, m)
      continue
    }
    const preferLocal = (m.updatedAt ?? 0) >= (r.updatedAt ?? 0)
    const newer = preferLocal ? m : r
    const older = preferLocal ? r : m
    map.set(m.id, {
      ...older,
      ...newer,
      // Preserve the richest learning / star signals
      frequent: Boolean(m.frequent || r.frequent),
      weekAddCount: Math.max(m.weekAddCount ?? 0, r.weekAddCount ?? 0),
      lastAddedToWeekAt: (() => {
        const a = m.lastAddedToWeekAt ?? 0
        const b = r.lastAddedToWeekAt ?? 0
        const max = Math.max(a, b)
        return max > 0 ? max : undefined
      })(),
      // Prefer non-empty product details
      brand: newer.brand || older.brand,
      barcode: newer.barcode || older.barcode,
      sizeLabel: newer.sizeLabel || older.sizeLabel,
      imageUrl: newer.imageUrl || older.imageUrl,
      defaultNotes: newer.defaultNotes || older.defaultNotes,
    })
  }

  return [...map.values()].filter(
    (item) => !tombstoneWins(tombstones, 'master', item.id, item.updatedAt || 0),
  )
}

/**
 * Union shopping rows by id. Also collapses duplicate open rows
 * for the same master item (keep newest).
 */
export function mergeShoppingItems(
  local: ShoppingItem[],
  remote: ShoppingItem[],
  tombstones: Tombstone[] = [],
): ShoppingItem[] {
  const byId = new Map<string, ShoppingItem>()

  for (const s of remote) {
    byId.set(s.id, s)
  }
  for (const s of local) {
    const r = byId.get(s.id)
    if (!r) {
      byId.set(s.id, s)
      continue
    }
    const localT = shopStamp(s)
    const remoteT = shopStamp(r)
    byId.set(s.id, localT >= remoteT ? s : r)
  }

  const openByMaster = new Map<string, ShoppingItem>()
  const checked: ShoppingItem[] = []

  for (const s of byId.values()) {
    if (tombstoneWins(tombstones, 'shop', s.id, shopStamp(s))) continue
    if (s.checked) {
      checked.push(s)
      continue
    }
    const prev = openByMaster.get(s.masterItemId)
    if (!prev || s.addedAt >= prev.addedAt) {
      openByMaster.set(s.masterItemId, s)
    }
  }

  return [...openByMaster.values(), ...checked].filter(
    (item) => !tombstoneWins(tombstones, 'shop', item.id, shopStamp(item)),
  )
}

/** True if local has any master or shopping row missing from remote. */
export function localHasExclusiveItems(
  localMaster: MasterItem[],
  remoteMaster: MasterItem[],
  localShop: ShoppingItem[],
  remoteShop: ShoppingItem[],
  tombstones: Tombstone[] = [],
): boolean {
  const remoteMasterIds = new Set(remoteMaster.map((m) => m.id))
  const remoteShopIds = new Set(remoteShop.map((s) => s.id))
  if (
    localMaster.some(
      (m) =>
        !remoteMasterIds.has(m.id) &&
        !tombstoneWins(tombstones, 'master', m.id, m.updatedAt || 0),
    )
  ) {
    return true
  }
  if (
    localShop.some(
      (s) =>
        !remoteShopIds.has(s.id) && !tombstoneWins(tombstones, 'shop', s.id, shopStamp(s)),
    )
  ) {
    return true
  }
  return false
}

export function tombstonesMissingFrom(source: Tombstone[], dest: Tombstone[]): boolean {
  const have = new Map<string, number>()
  for (const t of dest) {
    const key = `${t.kind}:${t.id}`
    have.set(key, Math.max(have.get(key) ?? -1, t.deletedAt))
  }
  return source.some((t) => (have.get(`${t.kind}:${t.id}`) ?? -1) < t.deletedAt)
}

export function snapshotTime(state: ListState): number {
  let max = state.updatedAt || 0
  for (const t of state.tombstones) max = Math.max(max, t.deletedAt || 0)
  for (const m of state.masterItems) max = Math.max(max, m.updatedAt || 0)
  for (const s of state.shoppingItems) max = Math.max(max, shopStamp(s))
  return max
}

/** Tombstones always apply. Item rows from an older remote snapshot do not. */
export function applyRemoteSnapshot(local: ListState, remote: ListState): ListState {
  const tombstones = capTombstones([...local.tombstones, ...remote.tombstones])
  const remoteIsOlder = snapshotTime(remote) < snapshotTime(local)
  const masterItems = mergeMasterItems(
    local.masterItems,
    remoteIsOlder ? [] : remote.masterItems,
    tombstones,
  )
  const masterIds = new Set(masterItems.map((m) => m.id))
  const shoppingItems = mergeShoppingItems(
    local.shoppingItems,
    remoteIsOlder ? [] : remote.shoppingItems,
    tombstones,
  ).filter((s) => masterIds.has(s.masterItemId))
  return {
    masterItems,
    shoppingItems,
    tombstones,
    updatedAt: Math.max(local.updatedAt || 0, remoteIsOlder ? 0 : remote.updatedAt || 0),
  }
}

export function withDeleteShop(state: ListState, id: string, now: number): ListState {
  if (!state.shoppingItems.some((s) => s.id === id)) return state
  return {
    ...state,
    shoppingItems: state.shoppingItems.filter((s) => s.id !== id),
    tombstones: capTombstones([...state.tombstones, { id, kind: 'shop', deletedAt: now }]),
    updatedAt: now,
  }
}

export function withDeleteMaster(state: ListState, id: string, now: number): ListState {
  const shopRows = state.shoppingItems.filter((s) => s.masterItemId === id)
  return {
    ...state,
    masterItems: state.masterItems.filter((m) => m.id !== id),
    shoppingItems: state.shoppingItems.filter((s) => s.masterItemId !== id),
    tombstones: capTombstones([
      ...state.tombstones,
      { id, kind: 'master', deletedAt: now },
      ...shopRows.map((s) => ({ id: s.id, kind: 'shop' as const, deletedAt: now })),
    ]),
    updatedAt: now,
  }
}

export function withClearShop(
  state: ListState,
  mode: 'checked' | 'all',
  now: number,
): ListState {
  const doomed = state.shoppingItems.filter((s) => (mode === 'all' ? true : s.checked))
  if (doomed.length === 0) return state
  return {
    ...state,
    shoppingItems: state.shoppingItems.filter((s) => !doomed.some((d) => d.id === s.id)),
    tombstones: capTombstones([
      ...state.tombstones,
      ...doomed.map((s) => ({ id: s.id, kind: 'shop' as const, deletedAt: now })),
    ]),
    updatedAt: now,
  }
}

export function withToggleChecked(state: ListState, id: string, now: number): ListState {
  let found = false
  const shoppingItems = state.shoppingItems.map((s) => {
    if (s.id !== id) return s
    found = true
    const checked = !s.checked
    return { ...s, checked, checkedAt: checked ? now : undefined, updatedAt: now }
  })
  if (!found) return state
  return { ...state, shoppingItems, updatedAt: now }
}

export function toSyncPayload(state: ListState): ListState {
  const tombstones = capTombstones(state.tombstones)
  const masterItems = mergeMasterItems(state.masterItems, [], tombstones)
  const ids = new Set(masterItems.map((m) => m.id))
  return {
    masterItems,
    shoppingItems: mergeShoppingItems(state.shoppingItems, [], tombstones).filter((s) =>
      ids.has(s.masterItemId),
    ),
    tombstones,
    updatedAt: state.updatedAt,
  }
}
