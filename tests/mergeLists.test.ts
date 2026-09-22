import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyRemoteSnapshot,
  localHasExclusiveItems,
  mergeShoppingItems,
  toSyncPayload,
  withClearShop,
  withDeleteMaster,
  withDeleteShop,
  withToggleChecked,
  type ListState,
} from '../src/lib/mergeLists.ts'
import type { MasterItem, ShoppingItem } from '../src/types.ts'

function master(partial: Partial<MasterItem> & Pick<MasterItem, 'id' | 'name'>): MasterItem {
  return {
    familyId: 'fam',
    category: 'dairy',
    frequent: false,
    createdAt: 1000,
    updatedAt: 1000,
    ...partial,
  }
}

function shop(partial: Partial<ShoppingItem> & Pick<ShoppingItem, 'id' | 'masterItemId'>): ShoppingItem {
  return {
    familyId: 'fam',
    quantity: '',
    notes: '',
    checked: false,
    addedAt: 1000,
    ...partial,
  }
}

function lists(partial: Partial<ListState> = {}): ListState {
  return {
    masterItems: partial.masterItems ?? [],
    shoppingItems: partial.shoppingItems ?? [],
    tombstones: partial.tombstones ?? [],
    updatedAt: partial.updatedAt ?? 1000,
  }
}

const milk = master({ id: 'm-milk', name: 'Milk' })
const bread = master({ id: 'm-bread', name: 'Bread', category: 'bakery' })
const milkRow = shop({ id: 's-milk', masterItemId: 'm-milk' })
const breadRow = shop({ id: 's-bread', masterItemId: 'm-bread', addedAt: 1100 })

test('delete week item stays gone against a snapshot that still has it', () => {
  const before = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  const deleted = withDeleteShop(before, 's-milk', 5000)
  const stale = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  const merged = applyRemoteSnapshot(deleted, stale)
  assert.deepEqual(merged.shoppingItems.map((s) => s.id), ['s-bread'])
  assert.equal(
    localHasExclusiveItems(
      deleted.masterItems,
      stale.masterItems,
      deleted.shoppingItems,
      stale.shoppingItems,
      deleted.tombstones,
    ),
    false,
  )
})

test('delete master is not merged back', () => {
  const before = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  const deleted = withDeleteMaster(before, 'm-milk', 6000)
  const stale = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  const merged = applyRemoteSnapshot(deleted, stale)
  assert.ok(!merged.masterItems.some((m) => m.id === 'm-milk'))
  assert.ok(merged.masterItems.some((m) => m.id === 'm-bread'))
  assert.ok(!merged.shoppingItems.some((s) => s.id === 's-milk'))
})

test('clear week payload is empty and master remains', () => {
  const before = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  const cleared = withClearShop(before, 'all', 7000)
  const payload = toSyncPayload(cleared)
  assert.deepEqual(payload.shoppingItems, [])
  assert.equal(payload.masterItems.length, 2)
  const stale = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 2000,
  })
  assert.deepEqual(applyRemoteSnapshot(cleared, stale).shoppingItems, [])
})

test('check off is not a delete', () => {
  const before = lists({ masterItems: [milk], shoppingItems: [milkRow], updatedAt: 2000 })
  const checked = withToggleChecked(before, 's-milk', 4500)
  assert.equal(checked.tombstones.length, 0)
  assert.equal(checked.shoppingItems[0]?.checked, true)
  assert.equal(checked.masterItems.length, 1)
})

test('idle device does not resurrect a delete', () => {
  const shared = lists({
    masterItems: [milk, bread],
    shoppingItems: [milkRow, breadRow],
    updatedAt: 3000,
  })
  const deleted = withDeleteShop(shared, 's-milk', 8000)
  assert.ok(!applyRemoteSnapshot(shared, deleted).shoppingItems.some((s) => s.id === 's-milk'))
  assert.ok(!applyRemoteSnapshot(deleted, shared).shoppingItems.some((s) => s.id === 's-milk'))
})

test('offline delete wins over a cloud copy with no tombstone', () => {
  const remote = lists({
    masterItems: [milk],
    shoppingItems: [milkRow],
    updatedAt: 2000,
  })
  const offline = withDeleteShop(remote, 's-milk', 5500)
  const merged = applyRemoteSnapshot(offline, remote)
  assert.deepEqual(merged.shoppingItems, [])
  const server = applyRemoteSnapshot(remote, toSyncPayload(merged))
  assert.deepEqual(server.shoppingItems, [])
})

test('union without a tombstone still keeps a one-sided row, tombstone removes it', () => {
  assert.equal(mergeShoppingItems([milkRow], []).length, 1)
  assert.equal(
    mergeShoppingItems([milkRow], [], [{ id: 's-milk', kind: 'shop', deletedAt: 9000 }]).length,
    0,
  )
})
