import { useMemo, useState } from 'react'
import { AddItemSheet } from '../components/AddItemSheet'
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
        <p className="text-slate-500">Create or join a family first.</p>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className="mt-4 font-semibold text-teal-700"
        >
          Open settings
        </button>
      </div>
    )
  }

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-300">
              Master library
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              All items
            </h1>
            <p className="text-sm text-slate-500">
              {masterItems.length} saved · never deleted when shopping
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="min-h-12 rounded-2xl bg-violet-600 px-4 text-sm font-bold text-white active:scale-[0.98]"
          >
            + New
          </button>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search master list…"
          className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base outline-none ring-violet-500 focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
        />

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              categoryFilter === 'all'
                ? 'bg-violet-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryFilter(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                categoryFilter === c.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-4xl">📚</p>
          <p className="mt-3 font-semibold">No master items yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add items once — re-add them to any week’s list in one tap.
          </p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="mt-4 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white"
          >
            Add first item
          </button>
        </div>
      ) : (
        filtered.map((m) => (
          <MasterRow
            key={m.id}
            item={m}
            inWeek={onWeek.has(m.id)}
            onAddToWeek={() => addToWeek(m.id)}
            onToggleFrequent={() => toggleFrequent(m.id)}
          />
        ))
      )}

      <AddItemSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        defaultAddToWeek={false}
      />
    </div>
  )
}
