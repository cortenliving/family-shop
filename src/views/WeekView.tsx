import { useMemo, useState } from 'react'
import { AddItemSheet } from '../components/AddItemSheet'
import { ShopRow, categoryMeta } from '../components/ItemRow'
import { SharingBanner } from '../components/SharingStatus'
import {
  recommendedForWeek,
  usualShopCandidates,
} from '../lib/recommendations'
import { useShopStore } from '../store/useShopStore'
import { CATEGORIES } from '../types'

export function WeekView() {
  const family = useShopStore((s) => s.family)
  const masterItems = useShopStore((s) => s.masterItems)
  const shoppingItems = useShopStore((s) => s.shoppingItems)
  const categoryFilter = useShopStore((s) => s.categoryFilter)
  const setCategoryFilter = useShopStore((s) => s.setCategoryFilter)
  const toggleChecked = useShopStore((s) => s.toggleChecked)
  const removeFromWeek = useShopStore((s) => s.removeFromWeek)
  const clearChecked = useShopStore((s) => s.clearChecked)
  const clearCurrentList = useShopStore((s) => s.clearCurrentList)
  const addToWeek = useShopStore((s) => s.addToWeek)
  const addUsualShop = useShopStore((s) => s.addUsualShop)
  const setTab = useShopStore((s) => s.setTab)
  const [addOpen, setAddOpen] = useState(false)

  const masterById = useMemo(() => {
    const map = new Map(masterItems.map((m) => [m.id, m]))
    return map
  }, [masterItems])

  // Learned + starred items not already on this week
  const suggestions = useMemo(
    () => recommendedForWeek(masterItems, shoppingItems, 14),
    [masterItems, shoppingItems],
  )

  const usualMissing = useMemo(() => {
    const onList = new Set(
      shoppingItems.filter((s) => !s.checked).map((s) => s.masterItemId),
    )
    return usualShopCandidates(masterItems).filter((m) => !onList.has(m.id))
      .length
  }, [masterItems, shoppingItems])

  const { todo, bought } = useMemo(() => {
    const byName = (a: (typeof shoppingItems)[number], b: (typeof shoppingItems)[number]) => {
      const nameA = masterById.get(a.masterItemId)?.name ?? ''
      const nameB = masterById.get(b.masterItemId)?.name ?? ''
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    }
    const filtered = shoppingItems.filter((s) => {
      if (categoryFilter === 'all') return true
      return masterById.get(s.masterItemId)?.category === categoryFilter
    })
    return {
      todo: filtered.filter((s) => !s.checked).sort(byName),
      bought: filtered.filter((s) => s.checked).sort(byName),
    }
  }, [shoppingItems, categoryFilter, masterById])

  if (!family) {
    return (
      <EmptyFamily onGoSettings={() => setTab('settings')} />
    )
  }

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
              This week’s list
            </p>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {family.name}
            </h1>
            <p className="text-sm text-slate-500">
              {todo.length} to get · {bought.length} bought
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="min-h-12 rounded-2xl bg-teal-600 px-4 text-sm font-bold text-white shadow-sm active:scale-[0.98]"
          >
            + Add
          </button>
        </div>

        <SharingBanner compact />

        {usualMissing > 0 ? (
          <button
            type="button"
            onClick={() => addUsualShop()}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-amber-100 text-sm font-bold text-amber-950 ring-1 ring-amber-300 active:scale-[0.99] dark:bg-amber-950/50 dark:text-amber-50 dark:ring-amber-800"
          >
            <span aria-hidden>★</span>
            {`Usual shop · add ${usualMissing} regular item${usualMissing === 1 ? '' : 's'}`}
          </button>
        ) : null}

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <FilterChip
            active={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
            label="All"
          />
          {CATEGORIES.map((c) => (
            <FilterChip
              key={c.id}
              active={categoryFilter === c.id}
              onClick={() => setCategoryFilter(c.id)}
              label={`${c.emoji} ${c.label}`}
            />
          ))}
        </div>
      </header>

      {suggestions.length > 0 ? (
        <section className="px-4 pt-4">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            Quick add
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addToWeek(m.id)}
                className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800"
              >
                {categoryMeta(m.category).emoji} {m.name}
                {m.frequent ? <span className="ml-1 text-amber-500">★</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-2">
        {todo.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-4xl">🛒</p>
            <p className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">
              List is empty
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Add items or pick from your Master List — nothing is lost when you check things off.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="rounded-2xl bg-teal-600 px-4 py-3 text-sm font-bold text-white"
              >
                Add item
              </button>
              <button
                type="button"
                onClick={() => setTab('master')}
                className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold dark:bg-slate-800"
              >
                Master List
              </button>
            </div>
          </div>
        ) : (
          todo.map((s) => (
            <ShopRow
              key={s.id}
              shopping={s}
              master={masterById.get(s.masterItemId)}
              onToggle={() => toggleChecked(s.id)}
              onRemove={() => removeFromWeek(s.id)}
            />
          ))
        )}
      </section>

      {bought.length > 0 ? (
        <section className="mt-4">
          <div className="flex items-center justify-between px-4 pb-1">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Bought
            </h2>
            <button
              type="button"
              onClick={clearChecked}
              className="text-sm font-semibold text-teal-700 dark:text-teal-300"
            >
              Clear bought
            </button>
          </div>
          {bought.map((s) => (
            <ShopRow
              key={s.id}
              shopping={s}
              master={masterById.get(s.masterItemId)}
              onToggle={() => toggleChecked(s.id)}
            />
          ))}
        </section>
      ) : null}

      {shoppingItems.length > 0 ? (
        <div className="mt-6 px-4">
          <button
            type="button"
            onClick={() => {
              if (confirm('Clear this week’s entire list? Master items stay safe.')) {
                clearCurrentList()
              }
            }}
            className="min-h-12 w-full rounded-2xl border border-slate-200 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300"
          >
            Clear this week’s list
          </button>
        </div>
      ) : null}

      <AddItemSheet open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
        active
          ? 'bg-teal-600 text-white'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {label}
    </button>
  )
}

function EmptyFamily({ onGoSettings }: { onGoSettings: () => void }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">👨‍👩‍👧‍👦</p>
      <h1 className="mt-4 text-2xl font-bold text-slate-900 dark:text-white">
        Family Shop
      </h1>
      <p className="mt-2 max-w-sm text-slate-500">
        Create a family or join with a code to start a shared list. Master items never disappear when you check them off.
      </p>
      <button
        type="button"
        onClick={onGoSettings}
        className="mt-6 min-h-14 rounded-2xl bg-teal-600 px-6 text-base font-bold text-white"
      >
        Get started
      </button>
    </div>
  )
}

