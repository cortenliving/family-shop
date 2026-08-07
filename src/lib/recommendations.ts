import type { MasterItem, ShoppingItem } from '../types'

/** After this many week-list adds, auto-star as frequent (★). */
export const AUTO_FREQUENT_THRESHOLD = 3

/** Minimum adds before an item appears in “suggested” (unless already starred). */
export const SUGGEST_MIN_ADDS = 1

function weekCount(m: MasterItem): number {
  return m.weekAddCount ?? 0
}

/** Higher = more likely a weekly staple. */
export function recommendationScore(m: MasterItem, now = Date.now()): number {
  const count = weekCount(m)
  const daysSince =
    m.lastAddedToWeekAt != null
      ? (now - m.lastAddedToWeekAt) / (1000 * 60 * 60 * 24)
      : 365
  // Soft recency: used in the last ~2 weeks scores higher
  const recency = Math.max(0, 30 - daysSince)
  return count * 10 + (m.frequent ? 40 : 0) + recency
}

function sortByRecommendation(a: MasterItem, b: MasterItem): number {
  const diff = recommendationScore(b) - recommendationScore(a)
  if (diff !== 0) return diff
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

/** Items already on this week’s open (unchecked) list. */
export function onWeekListIds(shoppingItems: ShoppingItem[]): Set<string> {
  return new Set(
    shoppingItems.filter((s) => !s.checked).map((s) => s.masterItemId),
  )
}

/**
 * Products the family uses most that aren’t on this week yet.
 * Mix of ★ frequent and learned high-usage items.
 */
export function recommendedForWeek(
  masterItems: MasterItem[],
  shoppingItems: ShoppingItem[],
  limit = 12,
): MasterItem[] {
  const onList = onWeekListIds(shoppingItems)
  return masterItems
    .filter((m) => {
      if (onList.has(m.id)) return false
      if (m.frequent) return true
      return weekCount(m) >= SUGGEST_MIN_ADDS
    })
    .sort(sortByRecommendation)
    .slice(0, limit)
}

/**
 * Candidates for “Usual shop” one-tap: starred or learned staples.
 */
export function usualShopCandidates(masterItems: MasterItem[]): MasterItem[] {
  return masterItems
    .filter((m) => m.frequent || weekCount(m) >= AUTO_FREQUENT_THRESHOLD)
    .sort(sortByRecommendation)
}

/**
 * Apply a week-list add: bump usage and auto-star after threshold.
 */
export function applyWeekAddLearning(
  item: MasterItem,
  now = Date.now(),
): MasterItem {
  const weekAddCount = weekCount(item) + 1
  const frequent =
    item.frequent || weekAddCount >= AUTO_FREQUENT_THRESHOLD
  return {
    ...item,
    weekAddCount,
    lastAddedToWeekAt: now,
    frequent,
    updatedAt: now,
  }
}
