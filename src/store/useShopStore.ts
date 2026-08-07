import { create } from 'zustand'
import { familyCode, uid } from '../lib/id'
import { loadSnapshot, saveSnapshot } from '../lib/storage'
import {
  broadcastLocalChange,
  connectRealtime,
  hasRemoteApi,
  remoteCreateFamily,
  remoteJoinFamily,
  remotePullSnapshot,
  remotePushSnapshot,
  remoteRegisterMember,
  remoteRemoveMember,
} from '../lib/sync'
import {
  barcodeVariants,
  lookupBarcode,
  mapOffCategories,
} from '../lib/openFoodFacts'
import {
  applyWeekAddLearning,
  usualShopCandidates,
} from '../lib/recommendations'
import {
  localHasExclusiveItems,
  mergeMasterItems,
  mergeShoppingItems,
} from '../lib/mergeLists'
import type {
  AppSnapshot,
  BarcodeCacheEntry,
  CategoryId,
  Family,
  FamilyMember,
  MasterItem,
  MemberProfile,
  ShoppingItem,
  TabId,
} from '../types'

interface ShopState {
  hydrated: boolean
  family: Family | null
  member: MemberProfile | null
  familyMembers: FamilyMember[]
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
  barcodeCache: Record<string, BarcodeCacheEntry>
  theme: 'light' | 'dark' | 'system'
  weeklyReminder: boolean
  tab: TabId
  search: string
  categoryFilter: CategoryId | 'all'
  syncStatus: 'offline' | 'local' | 'syncing' | 'live' | 'error'
  lastSyncedAt?: number
  toast: string | null
  pendingNotify: { title: string; body: string } | null

  hydrate: () => Promise<void>
  persist: () => Promise<void>
  setTab: (tab: TabId) => void
  setSearch: (q: string) => void
  setCategoryFilter: (c: CategoryId | 'all') => void
  setTheme: (t: 'light' | 'dark' | 'system') => void
  setWeeklyReminder: (on: boolean) => void
  setMemberName: (name: string) => void
  saveMemberName: (name?: string) => void
  showToast: (msg: string) => void
  clearToast: () => void
  refreshMembers: () => Promise<void>
  /** Remove a duplicate/unwanted person from the family roster (not yourself). */
  removeFamilyMember: (memberId: string) => Promise<boolean>

  createFamily: (name: string) => Promise<void>
  joinFamily: (code: string) => Promise<boolean>
  leaveFamily: () => Promise<void>

  addMasterItem: (input: {
    name: string
    category?: CategoryId
    brand?: string
    barcode?: string
    sizeLabel?: string
    imageUrl?: string
    frequent?: boolean
    defaultNotes?: string
    addToWeek?: boolean
    quantity?: string
    notes?: string
  }) => string
  updateMasterItem: (id: string, patch: Partial<MasterItem>) => void
  deleteMasterItem: (id: string) => void
  toggleFrequent: (id: string) => void
  addToWeek: (masterItemId: string, opts?: { quantity?: string; notes?: string }) => void
  /** Add every ★ frequent master item that isn’t already on this week’s list. */
  addUsualShop: () => number
  removeFromWeek: (shoppingItemId: string) => void
  toggleChecked: (shoppingItemId: string) => void
  clearChecked: () => void
  clearCurrentList: () => void
  updateShoppingItem: (id: string, patch: Partial<Pick<ShoppingItem, 'quantity' | 'notes'>>) => void
  queueNotify: (title: string, body: string) => void

  scanBarcode: (barcode: string) => Promise<{
    masterItemId?: string
    prefill?: {
      name: string
      brand?: string
      barcode: string
      sizeLabel?: string
      imageUrl?: string
      category: CategoryId
    }
    error?: string
  }>

  startRealtime: () => () => void
  pullRemote: () => Promise<void>
}

function snapshotFrom(state: ShopState): AppSnapshot {
  return {
    version: 1,
    family: state.family,
    member: state.member,
    masterItems: state.masterItems,
    shoppingItems: state.shoppingItems,
    barcodeCache: state.barcodeCache,
    theme: state.theme,
    weeklyReminder: state.weeklyReminder,
    lastSyncedAt: state.lastSyncedAt,
  }
}

let persistTimer: ReturnType<typeof setTimeout> | null = null
/** Bumped on every local list edit so we re-push after concurrent saves. */
let localMutationGen = 0
let persistInFlight = false

function markLocalMutation() {
  localMutationGen++
}

function schedulePersist(get: () => ShopState) {
  markLocalMutation()
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void get().persist()
  }, 200)
}

/**
 * Apply a remote family snapshot without deleting items only this device has.
 * Re-uploads when the merge is richer than the cloud (recovery / race heal).
 */
function applyRemoteFamilyLists(
  data: {
    family: Family
    masterItems?: MasterItem[]
    shoppingItems?: ShoppingItem[]
    members?: FamilyMember[]
  },
  set: (
    partial:
      | Partial<ShopState>
      | ((state: ShopState) => Partial<ShopState>),
  ) => void,
  get: () => ShopState,
  opts?: { recoverToast?: boolean },
) {
  const remoteMaster = data.masterItems ?? []
  const remoteShop = data.shoppingItems ?? []
  const local = get()

  const mergedMaster = mergeMasterItems(local.masterItems, remoteMaster)
  const mergedShop = mergeShoppingItems(local.shoppingItems, remoteShop)
  const hadExclusive = localHasExclusiveItems(
    local.masterItems,
    remoteMaster,
    local.shoppingItems,
    remoteShop,
  )

  // Ignore pure remote replace while we're mid-edit / mid-push — still merge
  // so we never drop the item the user just added.
  set({
    family: data.family,
    masterItems: mergedMaster,
    shoppingItems: mergedShop,
    lastSyncedAt: Date.now(),
    syncStatus: 'live',
    ...(data.members ? { familyMembers: data.members } : {}),
  })
  void saveSnapshot(snapshotFrom(get()))

  if (hadExclusive || (remoteMaster.length === 0 && mergedMaster.length > 0)) {
    if (opts?.recoverToast && remoteMaster.length === 0 && mergedMaster.length > 0) {
      get().showToast('Restored products from this device to the cloud')
    }
    // Push the union so the cloud catches up
    schedulePersist(get)
  }
}

function applyBundleMembers(
  set: (partial: Partial<ShopState>) => void,
  bundle: {
    members?: FamilyMember[]
  },
) {
  if (bundle.members) {
    set({ familyMembers: bundle.members })
  }
}

export const useShopStore = create<ShopState>((set, get) => ({
  hydrated: false,
  family: null,
  member: null,
  familyMembers: [],
  masterItems: [],
  shoppingItems: [],
  barcodeCache: {},
  theme: 'system',
  weeklyReminder: false,
  tab: 'week',
  search: '',
  categoryFilter: 'all',
  syncStatus: 'local',
  toast: null,
  pendingNotify: null,

  hydrate: async () => {
    const snap = await loadSnapshot()
    if (snap) {
      set({
        family: snap.family,
        member: snap.member,
        masterItems: snap.masterItems ?? [],
        shoppingItems: snap.shoppingItems ?? [],
        barcodeCache: snap.barcodeCache ?? {},
        theme: snap.theme ?? 'system',
        weeklyReminder: snap.weeklyReminder ?? false,
        lastSyncedAt: snap.lastSyncedAt,
        hydrated: true,
        syncStatus: hasRemoteApi() ? 'syncing' : 'local',
      })
      if (hasRemoteApi() && snap.family) {
        void get().pullRemote()
        void get().refreshMembers()
      }
    } else {
      set({
        hydrated: true,
        member: { id: uid('m'), displayName: 'Me' },
        syncStatus: hasRemoteApi() ? 'offline' : 'local',
      })
      schedulePersist(get)
    }
  },

  queueNotify: (title, body) => {
    set({ pendingNotify: { title, body } })
  },

  persist: async () => {
    if (persistInFlight) {
      // Coalesce: another save is running; schedule a follow-up with latest state
      if (persistTimer) clearTimeout(persistTimer)
      persistTimer = setTimeout(() => {
        void get().persist()
      }, 250)
      return
    }
    persistInFlight = true
    const genAtStart = localMutationGen
    try {
      // Always snapshot the latest state (not a stale closure)
      const state = get()
      const snap = snapshotFrom(state)
      await saveSnapshot(snap)
      if (state.family) {
        broadcastLocalChange(state.family.id)
        if (hasRemoteApi()) {
          set({ syncStatus: 'syncing' })
          const notify = state.pendingNotify
          const ok = await remotePushSnapshot(snap, {
            notify: notify
              ? {
                  title: notify.title,
                  body: notify.body,
                  excludeMemberId: state.member?.id,
                }
              : undefined,
          })

          set({
            syncStatus: ok ? 'live' : 'error',
            lastSyncedAt: ok ? Date.now() : state.lastSyncedAt,
            pendingNotify: ok ? null : state.pendingNotify,
          })
          if (ok) void get().refreshMembers()
          // User added more items while this request was in flight — push again
          if (ok && localMutationGen !== genAtStart) {
            persistInFlight = false
            await get().persist()
            return
          }
        }
      }
    } finally {
      persistInFlight = false
    }
  },

  setTab: (tab) => set({ tab }),
  setSearch: (search) => set({ search }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setTheme: (theme) => {
    set({ theme })
    schedulePersist(get)
  },
  setWeeklyReminder: (weeklyReminder) => {
    set({ weeklyReminder })
    schedulePersist(get)
  },
  setMemberName: (name) => {
    // Allow empty/partial while typing — don't force "Me" on every keystroke
    // (that made it impossible to clear "Me" and type a new name).
    const member = get().member ?? { id: uid('m'), displayName: 'Me' }
    const displayName = name // keep as typed; save path normalises empty → Me
    set({ member: { ...member, displayName } })
    schedulePersist(get)
  },

  /** Commit display name (trim + default) and push to family roster. */
  saveMemberName: (name?: string) => {
    const member = get().member ?? { id: uid('m'), displayName: 'Me' }
    const displayName = (name ?? member.displayName).trim() || 'Me'
    set({ member: { ...member, displayName } })
    schedulePersist(get)
    void get().refreshMembers()
    get().showToast(`Name set to ${displayName}`)
  },
  showToast: (toast) => {
    set({ toast })
    setTimeout(() => {
      if (get().toast === toast) set({ toast: null })
    }, 2800)
  },
  clearToast: () => set({ toast: null }),

  refreshMembers: async () => {
    const family = get().family
    const member = get().member
    if (!family || !member || !hasRemoteApi()) return
    const bundle = await remoteRegisterMember(family.id, member)
    if (bundle) applyBundleMembers(set, bundle)
  },

  removeFamilyMember: async (memberId) => {
    const family = get().family
    const me = get().member
    if (!family) {
      get().showToast('No family loaded')
      return false
    }
    if (me && memberId === me.id) {
      get().showToast('Use “Leave family” to remove yourself')
      return false
    }

    // Always update local roster so the UI cleans up even offline
    const previous = get().familyMembers
    const nextLocal = previous.filter((m) => m.id !== memberId)
    set({ familyMembers: nextLocal })

    if (!hasRemoteApi()) {
      get().showToast('Removed from this device')
      return true
    }

    const bundle = await remoteRemoveMember(family.id, memberId)
    if (!bundle) {
      set({ familyMembers: previous })
      get().showToast('Could not remove account — try again')
      return false
    }
    applyBundleMembers(set, bundle)
    get().showToast('Account removed from family list')
    return true
  },

  createFamily: async (name) => {
    const trimmed = name.trim() || 'Our Family'
    const member = get().member ?? { id: uid('m'), displayName: 'Me' }
    let family: Family | null = null
    if (hasRemoteApi()) {
      family = await remoteCreateFamily(trimmed, member)
    }
    if (!family) {
      family = {
        id: uid('fam'),
        code: familyCode(),
        name: trimmed,
        createdAt: Date.now(),
      }
    }
    set({
      family,
      member,
      familyMembers: [
        {
          id: member.id,
          familyId: family.id,
          displayName: member.displayName,
          lastSeenAt: Date.now(),
          joinedAt: Date.now(),
          active: true,
        },
      ],
      masterItems: [],
      shoppingItems: [],
      syncStatus: hasRemoteApi() ? 'live' : 'local',
    })
    await get().persist()
    void get().refreshMembers()
    get().showToast(`Family “${family.name}” created — share the code with family`)
  },

  joinFamily: async (code) => {
    const cleaned = code.trim().toUpperCase()
    if (!cleaned) return false
    const member = get().member ?? { id: uid('m'), displayName: 'Me' }

    if (hasRemoteApi()) {
      const remote = await remoteJoinFamily(cleaned, member)
      if (remote) {
        set({
          family: remote.family,
          member,
          masterItems: remote.masterItems,
          shoppingItems: remote.shoppingItems,
          familyMembers: remote.members ?? [],
          syncStatus: 'live',
          lastSyncedAt: Date.now(),
        })
        await get().persist()
        const n = remote.memberCount ?? remote.members?.length ?? 1
        get().showToast(
          n > 1
            ? `Joined ${remote.family.name} — sharing with ${n} people`
            : `Joined ${remote.family.name}`,
        )
        return true
      }
    }

    const existing = get().family
    if (existing && existing.code === cleaned) {
      get().showToast('Already in this family')
      return true
    }

    if (!hasRemoteApi()) {
      const family: Family = {
        id: uid('fam'),
        code: cleaned,
        name: `Family ${cleaned}`,
        createdAt: Date.now(),
      }
      set({
        family,
        member,
        familyMembers: [],
        masterItems: [],
        shoppingItems: [],
        syncStatus: 'local',
      })
      await get().persist()
      get().showToast(
        'Joined locally. Connect Cloudflare API for multi-device sync.',
      )
      return true
    }

    get().showToast('Family code not found')
    return false
  },

  leaveFamily: async () => {
    set({
      family: null,
      familyMembers: [],
      masterItems: [],
      shoppingItems: [],
      syncStatus: hasRemoteApi() ? 'offline' : 'local',
    })
    await get().persist()
  },

  addMasterItem: (input) => {
    const family = get().family
    if (!family) {
      get().showToast('Create or join a family first')
      return ''
    }
    const name = input.name.trim()
    if (!name) return ''

    // Reuse existing master item by name or barcode
    const existing = get().masterItems.find(
      (m) =>
        (input.barcode && m.barcode === input.barcode) ||
        m.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      if (input.addToWeek !== false) {
        get().addToWeek(existing.id, {
          quantity: input.quantity,
          notes: input.notes ?? existing.defaultNotes,
        })
      }
      return existing.id
    }

    const now = Date.now()
    const item: MasterItem = {
      id: uid('item'),
      familyId: family.id,
      name,
      brand: input.brand,
      barcode: input.barcode,
      sizeLabel: input.sizeLabel,
      imageUrl: input.imageUrl,
      category: input.category ?? 'other',
      frequent: input.frequent ?? false,
      weekAddCount: 0,
      defaultNotes: input.defaultNotes,
      createdAt: now,
      updatedAt: now,
    }
    set({ masterItems: [item, ...get().masterItems] })
    if (input.addToWeek !== false) {
      get().addToWeek(item.id, {
        quantity: input.quantity,
        notes: input.notes ?? input.defaultNotes,
      })
    } else {
      schedulePersist(get)
    }
    return item.id
  },

  updateMasterItem: (id, patch) => {
    set({
      masterItems: get().masterItems.map((m) =>
        m.id === id ? { ...m, ...patch, updatedAt: Date.now() } : m,
      ),
    })
    schedulePersist(get)
  },

  deleteMasterItem: (id) => {
    set({
      masterItems: get().masterItems.filter((m) => m.id !== id),
      shoppingItems: get().shoppingItems.filter((s) => s.masterItemId !== id),
    })
    schedulePersist(get)
  },

  toggleFrequent: (id) => {
    set({
      masterItems: get().masterItems.map((m) =>
        m.id === id
          ? { ...m, frequent: !m.frequent, updatedAt: Date.now() }
          : m,
      ),
    })
    schedulePersist(get)
  },

  addToWeek: (masterItemId, opts) => {
    const family = get().family
    if (!family) return
    const master = get().masterItems.find((m) => m.id === masterItemId)
    if (!master) return

    const existing = get().shoppingItems.find(
      (s) => s.masterItemId === masterItemId && !s.checked,
    )
    if (existing) {
      get().showToast(`Already on this week’s list`)
      return
    }

    const now = Date.now()
    const learned = applyWeekAddLearning(master, now)
    const becameFrequent = !master.frequent && learned.frequent

    const item: ShoppingItem = {
      id: uid('shop'),
      familyId: family.id,
      masterItemId,
      quantity: opts?.quantity ?? '',
      notes: opts?.notes ?? master.defaultNotes ?? '',
      checked: false,
      addedAt: now,
      addedBy: get().member?.displayName,
    }
    const who = get().member?.displayName || 'Someone'
    set({
      masterItems: get().masterItems.map((m) =>
        m.id === masterItemId ? learned : m,
      ),
      shoppingItems: [item, ...get().shoppingItems],
      pendingNotify: {
        title: get().family?.name || 'Family Shop',
        body: `${who} added ${master.name}`,
      },
    })
    schedulePersist(get)
    get().showToast(
      becameFrequent
        ? `Added ${master.name} · learned as a usual item ★`
        : `Added ${master.name}`,
    )
  },

  addUsualShop: () => {
    const family = get().family
    if (!family) {
      get().showToast('Create or join a family first')
      return 0
    }
    const onList = new Set(
      get()
        .shoppingItems.filter((s) => !s.checked)
        .map((s) => s.masterItemId),
    )
    // Starred + items the family adds most often (learned)
    const candidates = usualShopCandidates(get().masterItems)
    if (candidates.length === 0) {
      get().showToast(
        'Add items a few times — the app will learn your usual shop',
      )
      return 0
    }

    const who = get().member?.displayName || 'Someone'
    const toAdd = candidates.filter((m) => !onList.has(m.id))
    if (toAdd.length === 0) {
      get().showToast('All usual items are already on this week’s list')
      return 0
    }

    const now = Date.now()
    const learnedIds = new Set(toAdd.map((m) => m.id))
    const newItems: ShoppingItem[] = toAdd.map((m, i) => ({
      id: uid('shop'),
      familyId: family.id,
      masterItemId: m.id,
      quantity: '',
      notes: m.defaultNotes ?? '',
      checked: false,
      addedAt: now + i,
      addedBy: who,
    }))

    set({
      // Still count bulk “usual shop” toward learning
      masterItems: get().masterItems.map((m) =>
        learnedIds.has(m.id) ? applyWeekAddLearning(m, now) : m,
      ),
      shoppingItems: [...newItems, ...get().shoppingItems],
      pendingNotify: {
        title: family.name,
        body: `${who} started the usual shop (+${toAdd.length})`,
      },
    })
    schedulePersist(get)
    get().showToast(
      toAdd.length === 1
        ? `Added ${toAdd[0]!.name}`
        : `Usual shop: added ${toAdd.length} items`,
    )
    return toAdd.length
  },

  removeFromWeek: (shoppingItemId) => {
    set({
      shoppingItems: get().shoppingItems.filter((s) => s.id !== shoppingItemId),
    })
    schedulePersist(get)
  },

  toggleChecked: (shoppingItemId) => {
    const before = get().shoppingItems.find((s) => s.id === shoppingItemId)
    const master = before
      ? get().masterItems.find((m) => m.id === before.masterItemId)
      : undefined
    const who = get().member?.displayName || 'Someone'
    const checkingOff = Boolean(before && !before.checked && master)
    set({
      shoppingItems: get().shoppingItems.map((s) => {
        if (s.id !== shoppingItemId) return s
        const checked = !s.checked
        return {
          ...s,
          checked,
          checkedAt: checked ? Date.now() : undefined,
        }
      }),
      ...(checkingOff && master
        ? {
            pendingNotify: {
              title: get().family?.name || 'Family Shop',
              body: `${who} got ${master.name}`,
            },
          }
        : {}),
    })
    schedulePersist(get)
  },

  clearChecked: () => {
    set({
      shoppingItems: get().shoppingItems.filter((s) => !s.checked),
    })
    schedulePersist(get)
    get().showToast('Cleared bought items')
  },

  clearCurrentList: () => {
    const who = get().member?.displayName || 'Someone'
    set({
      shoppingItems: [],
      pendingNotify: {
        title: get().family?.name || 'Family Shop',
        body: `${who} cleared this week’s list`,
      },
    })
    schedulePersist(get)
    get().showToast('This week’s list cleared — master list kept')
  },

  updateShoppingItem: (id, patch) => {
    set({
      shoppingItems: get().shoppingItems.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    })
    schedulePersist(get)
  },

  scanBarcode: async (barcode) => {
    const cleaned = barcode.replace(/\D/g, '')
    const existingByCode = get().masterItems.find((m) => m.barcode === cleaned)
    if (existingByCode) {
      get().addToWeek(existingByCode.id)
      return { masterItemId: existingByCode.id }
    }

    const result = await lookupBarcode(cleaned, get().barcodeCache)
    if (result.found && result.entry) {
      const entry = result.entry
      // Cache under all variants so re-scans match
      const nextCache = { ...get().barcodeCache }
      for (const v of [entry.barcode, cleaned, ...barcodeVariants(cleaned)]) {
        if (v) nextCache[v] = entry
      }
      set({ barcodeCache: nextCache })
      schedulePersist(get)
      return {
        prefill: {
          name: entry.productName,
          brand: entry.brands,
          barcode: entry.barcode || cleaned,
          sizeLabel: entry.quantity,
          imageUrl: entry.imageUrl,
          category: mapOffCategories(entry.categoriesTags),
        },
      }
    }

    return {
      prefill: {
        name: '',
        barcode: cleaned,
        category: 'other',
      },
      error:
        result.message ??
        'Not in the product database. Type a name once — next scan will remember it.',
    }
  },

  startRealtime: () => {
    const family = get().family
    if (!family) return () => {}

    // Same-browser / multi-tab sync — merge, never replace-blindly
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(`family-shop-${family.id}`)
      bc.onmessage = () => {
        void loadSnapshot().then((snap) => {
          if (!snap || snap.family?.id !== family.id) return
          set({
            masterItems: mergeMasterItems(get().masterItems, snap.masterItems ?? []),
            shoppingItems: mergeShoppingItems(
              get().shoppingItems,
              snap.shoppingItems ?? [],
            ),
          })
        })
      }
    } catch {
      bc = null
    }

    const stopWs = connectRealtime(family.id, {
      onSnapshot: (data) => {
        applyRemoteFamilyLists(data, set, get)
      },
      onStatus: (status) => {
        if (status === 'open') {
          set({ syncStatus: 'live' })
          void get().refreshMembers()
        } else if (status === 'connecting') set({ syncStatus: 'syncing' })
        else if (status === 'error')
          set({ syncStatus: hasRemoteApi() ? 'error' : 'local' })
        else if (status === 'closed' && hasRemoteApi()) set({ syncStatus: 'offline' })
      },
    })

    // Keep last_seen fresh so others see you as active
    const heartbeat = window.setInterval(() => {
      void get().refreshMembers()
    }, 60_000)

    return () => {
      bc?.close()
      stopWs()
      window.clearInterval(heartbeat)
    }
  },

  pullRemote: async () => {
    const family = get().family
    if (!family || !hasRemoteApi()) return
    set({ syncStatus: 'syncing' })
    const data = await remotePullSnapshot(family.id)
    if (data) {
      applyRemoteFamilyLists(data, set, get, { recoverToast: true })
      void get().refreshMembers()
    } else {
      set({ syncStatus: 'error' })
    }
  },
}))
