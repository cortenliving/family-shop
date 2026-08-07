import type { MasterItem, ShoppingItem } from '../types'

/**
 * Union master libraries by id. Keeps items that exist only on one side
 * so a stale/smaller cloud snapshot cannot delete products you just added.
 */
export function mergeMasterItems(
  local: MasterItem[],
  remote: MasterItem[],
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

  return [...map.values()]
}

/**
 * Union shopping rows by id. Also collapses duplicate open rows
 * for the same master item (keep newest).
 */
export function mergeShoppingItems(
  local: ShoppingItem[],
  remote: ShoppingItem[],
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
    const localT = Math.max(s.checkedAt ?? 0, s.addedAt)
    const remoteT = Math.max(r.checkedAt ?? 0, r.addedAt)
    byId.set(s.id, localT >= remoteT ? s : r)
  }

  const openByMaster = new Map<string, ShoppingItem>()
  const checked: ShoppingItem[] = []

  for (const s of byId.values()) {
    if (s.checked) {
      checked.push(s)
      continue
    }
    const prev = openByMaster.get(s.masterItemId)
    if (!prev || s.addedAt >= prev.addedAt) {
      openByMaster.set(s.masterItemId, s)
    }
  }

  return [...openByMaster.values(), ...checked]
}

/** True if local has any master or shopping row missing from remote. */
export function localHasExclusiveItems(
  localMaster: MasterItem[],
  remoteMaster: MasterItem[],
  localShop: ShoppingItem[],
  remoteShop: ShoppingItem[],
): boolean {
  const remoteMasterIds = new Set(remoteMaster.map((m) => m.id))
  const remoteShopIds = new Set(remoteShop.map((s) => s.id))
  if (localMaster.some((m) => !remoteMasterIds.has(m.id))) return true
  if (localShop.some((s) => !remoteShopIds.has(s.id))) return true
  return false
}
