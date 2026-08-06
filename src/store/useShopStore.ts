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
} from '../lib/sync'
import {
  barcodeVariants,
  lookupBarcode,
  mapOffCategories,
} from '../lib/openFoodFacts'
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

function schedulePersist(get: () => ShopState) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void get().persist()
  }, 200)
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
      }
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

    const item: ShoppingItem = {
      id: uid('shop'),
      familyId: family.id,
      masterItemId,
      quantity: opts?.quantity ?? '',
      notes: opts?.notes ?? master.defaultNotes ?? '',
      checked: false,
      addedAt: Date.now(),
      addedBy: get().member?.displayName,
    }
    const who = get().member?.displayName || 'Someone'
    set({
      shoppingItems: [item, ...get().shoppingItems],
      pendingNotify: {
        title: get().family?.name || 'Family Shop',
        body: `${who} added ${master.name}`,
      },
    })
    schedulePersist(get)
    get().showToast(`Added ${master.name}`)
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
    const frequent = get().masterItems.filter((m) => m.frequent)
    if (frequent.length === 0) {
      get().showToast('Star items on the Master list first (★)')
      return 0
    }

    const who = get().member?.displayName || 'Someone'
    const toAdd = frequent.filter((m) => !onList.has(m.id))
    if (toAdd.length === 0) {
      get().showToast('All usual items are already on this week’s list')
      return 0
    }

    const now = Date.now()
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

    // Same-browser / multi-tab sync
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(`family-shop-${family.id}`)
      bc.onmessage = () => {
        void loadSnapshot().then((snap) => {
          if (!snap || snap.family?.id !== family.id) return
          // Don't clobber if we're mid-edit with newer local state — simple last-write
          set({
            masterItems: snap.masterItems,
            shoppingItems: snap.shoppingItems,
          })
        })
      }
    } catch {
      bc = null
    }

    const stopWs = connectRealtime(family.id, {
      onSnapshot: (data) => {
        set({
          family: data.family,
          masterItems: data.masterItems,
          shoppingItems: data.shoppingItems,
          lastSyncedAt: Date.now(),
          syncStatus: 'live',
          ...(data.members ? { familyMembers: data.members } : {}),
        })
        void saveSnapshot(snapshotFrom(get()))
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
      set({
        family: data.family,
        masterItems: data.masterItems,
        shoppingItems: data.shoppingItems,
        lastSyncedAt: Date.now(),
        syncStatus: 'live',
        ...(data.members ? { familyMembers: data.members } : {}),
      })
      await saveSnapshot(snapshotFrom(get()))
      void get().refreshMembers()
    } else {
      set({ syncStatus: 'error' })
    }
  },
}))
