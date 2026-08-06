export type CategoryId =
  | 'fruit-veg'
  | 'dairy'
  | 'meat'
  | 'bakery'
  | 'pantry'
  | 'freezer'
  | 'drinks'
  | 'household'
  | 'other'

export interface Category {
  id: CategoryId
  label: string
  emoji: string
}

export const CATEGORIES: Category[] = [
  { id: 'fruit-veg', label: 'Fruit & Veg', emoji: '🥬' },
  { id: 'dairy', label: 'Dairy', emoji: '🧀' },
  { id: 'meat', label: 'Meat', emoji: '🥩' },
  { id: 'bakery', label: 'Bakery', emoji: '🍞' },
  { id: 'pantry', label: 'Pantry', emoji: '🫙' },
  { id: 'freezer', label: 'Freezer', emoji: '🧊' },
  { id: 'drinks', label: 'Drinks', emoji: '🧃' },
  { id: 'household', label: 'Household', emoji: '🧹' },
  { id: 'other', label: 'Other', emoji: '📦' },
]

export interface Family {
  id: string
  code: string
  name: string
  createdAt: number
}

export interface MasterItem {
  id: string
  familyId: string
  name: string
  brand?: string
  barcode?: string
  sizeLabel?: string
  imageUrl?: string
  category: CategoryId
  frequent: boolean
  defaultNotes?: string
  createdAt: number
  updatedAt: number
}

export interface ShoppingItem {
  id: string
  familyId: string
  masterItemId: string
  quantity: string
  notes: string
  checked: boolean
  checkedAt?: number
  addedAt: number
  addedBy?: string
}

export interface BarcodeCacheEntry {
  barcode: string
  productName: string
  brands?: string
  quantity?: string
  imageUrl?: string
  categoriesTags?: string[]
  cachedAt: number
}

export interface MemberProfile {
  id: string
  displayName: string
}

/** Roster entry from the shared family (Cloudflare). */
export interface FamilyMember {
  id: string
  familyId: string
  displayName: string
  lastSeenAt: number
  joinedAt: number
  active: boolean
}

export interface AppSnapshot {
  version: 1
  family: Family | null
  member: MemberProfile | null
  masterItems: MasterItem[]
  shoppingItems: ShoppingItem[]
  barcodeCache: Record<string, BarcodeCacheEntry>
  theme: 'light' | 'dark' | 'system'
  weeklyReminder: boolean
  lastSyncedAt?: number
}

export type TabId = 'week' | 'master' | 'shop' | 'settings'

export interface SyncEnvelope {
  type: 'snapshot' | 'event'
  familyId: string
  payload: unknown
  at: number
}
