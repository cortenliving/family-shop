import { useMemo, useState } from 'react'
import { AddItemSheet } from '../components/AddItemSheet'
import { IconPlus } from '../components/icons'
import { MasterRow } from '../components/ItemRow'
import { useShopStore } from '../store/useShopStore'
import { CATEGORIES } from '../types'

export function MasterView() {
  const family = useShopStore((s) => s.family)
  const masterItems = useShopStore((s) => s.masterItems)
  const shoppingItems = useShopStore((s) => s.shoppingItems)
  const search = useShopStore((s) => s.search)
  const setSearch = useShopStore((s) => s.setSearch)
  const categoryFilter = useShopStore((s) => s.categoryFilter)
  const setCategoryFilter = useShopStore((s) => s.setCategoryFilter)
  const addToWeek = useShopStore((s) => s.addToWeek)
  const toggleFrequent = useShopStore((s) => s.toggleFrequent)
  const setTab = useShopStore((s) => s.setTab)
  const [addOpen, setAddOpen] = useState(false)

  const onWeek = useMemo(() => {
    const set = new Set(
      shoppingItems.filter((s) => !s.checked).map((s) => s.masterItemId),
    )
    return set
  }, [shoppingItems])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return masterItems
      .filter((m) => {
        if (categoryFilter !== 'all' && m.category !== categoryFilter) return false
        if (!q) return true
        return (
          m.name.toLowerCase().includes(q) ||
          m.brand?.toLowerCase().includes(q) ||
          m.barcode?.includes(q)
        )
      })
      .sort((a, b) => {
        if (a.frequent !== b.frequent) return a.frequent ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }, [masterItems, search, categoryFilter])

  if (!family) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-mute">Create or join a family first.</p>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className="mt-4 font-semibold text-accent"
        >
          Open settings
        </button>
      </div>
    )
  }

  return (
    <div>
      <header className="sticky top-0 z-20 bg-paper/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.65rem] leading-tight text-ink">Master</h1>
            <p className="text-sm text-mute">
              {masterItems.length} saved · never deleted when shopping
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="press flex size-11 items-center justify-center rounded-full bg-accent text-white"
            aria-label="New master item"
          >
            <IconPlus className="size-6" />
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search master list…"
          className="mt-3 w-full rounded-full bg-card px-4 py-3 text-base text-ink shadow-card outline-none ring-accent focus:ring-2"
        />

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none]">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
              categoryFilter === 'all' ? 'bg-accent text-white' : 'bg-card text-mute shadow-card'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                categoryFilter === c.id ? 'bg-accent text-white' : 'bg-card text-mute shadow-card'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-lg font-semibold text-ink">No master items yet</p>
          <p className="mt-1 text-sm text-mute">
            Add items once — re-add them to any week’s list in one tap.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="press mt-4 min-h-12 rounded-[16px] bg-accent px-4 text-sm font-semibold text-white"
          >
            Add first item
          </button>
        </div>
      ) : (
        <div className="mx-4 mt-3 overflow-hidden rounded-[20px] bg-card shadow-card [&>div:last-child]:border-b-0">
          {filtered.map((m) => (
            <MasterRow
              key={m.id}
              item={m}
              inWeek={onWeek.has(m.id)}
              onAddToWeek={() => addToWeek(m.id)}
              onToggleFrequent={() => toggleFrequent(m.id)}
            />
          ))}
        </div>
      )}

      <AddItemSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultAddToWeek={false}
      />
    </div>
  )
}
