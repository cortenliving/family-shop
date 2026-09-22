import { useMemo, useState } from 'react'
import { AddItemSheet } from '../components/AddItemSheet'
import { IconCart, IconPlus } from '../components/icons'
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
  const syncStatus = useShopStore((s) => s.syncStatus)
  const [addOpen, setAddOpen] = useState(false)
  const [boughtOpen, setBoughtOpen] = useState(false)

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

  if (!family) return null

  const groups = CATEGORIES.map((cat) => ({
    cat,
    items: todo.filter(
      (s) => (masterById.get(s.masterItemId)?.category ?? 'other') === cat.id,
    ),
  })).filter((g) => g.items.length > 0)

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-20 bg-paper/90 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-[1.65rem] leading-tight text-ink">{family.name}</h1>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-mute">
              <span
                className={`inline-block size-2 rounded-full ${
                  syncStatus === 'live' ? 'bg-accent' : 'bg-mute/50'
                }`}
                aria-hidden
              />
              {todo.length} to get
            </p>
          </div>
        </div>

        <SharingBanner compact />

        {usualMissing > 0 ? (
          <button
            type="button"
            onClick={() => addUsualShop()}
            className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-card text-sm font-semibold text-ink shadow-card"
          >
            <span className="text-amber-500" aria-hidden>
              ★
            </span>
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
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-mute">
            Quick add
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {suggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => addToWeek(m.id)}
                className="press shrink-0 rounded-full bg-card px-3 py-2 text-sm font-medium text-ink shadow-card"
              >
                {categoryMeta(m.category).emoji} {m.name}
                {m.frequent ? <span className="ml-1 text-amber-500">★</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-3 space-y-4 px-4">
        {todo.length === 0 ? (
          <div className="px-2 py-12 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-[20px] bg-accent text-white">
              <IconCart className="size-9" />
            </div>
            <p className="mt-4 text-lg font-semibold text-ink">List is empty</p>
            <p className="mt-1 text-sm text-mute">
              Add items or pick from your Master List — nothing is lost when you check things off.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="press min-h-12 rounded-[16px] bg-accent text-sm font-semibold text-white"
              >
                Add item
              </button>
              <button
                type="button"
                onClick={() => setTab('master')}
                className="press min-h-12 rounded-[16px] bg-card text-sm font-semibold text-ink shadow-card"
              >
                Master List
              </button>
            </div>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.cat.id}>
              <h2 className="sticky top-[4.5rem] z-10 bg-paper/95 px-1 py-1.5 text-xs font-medium text-mute backdrop-blur">
                {g.cat.emoji} {g.cat.label}
              </h2>
              <div className="overflow-hidden rounded-[20px] bg-card shadow-card [&>div:last-child]:border-b-0">
                {g.items.map((s) => (
                  <ShopRow
                    key={s.id}
                    shopping={s}
                    master={masterById.get(s.masterItemId)}
                    onToggle={() => toggleChecked(s.id)}
                    onRemove={() => removeFromWeek(s.id)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </section>

      {bought.length > 0 ? (
        <section className="mx-4 mt-4 overflow-hidden rounded-[20px] bg-card shadow-card">
          <button
            type="button"
            onClick={() => setBoughtOpen((open) => !open)}
            className="flex min-h-12 w-full items-center justify-between px-4 text-sm font-medium text-mute"
          >
            <span>Bought · {bought.length}</span>
            <span>{boughtOpen ? 'Hide' : 'Show'}</span>
          </button>
          {boughtOpen ? (
            <div className="border-t border-ink/8">
              <div className="flex justify-end px-3 pt-1">
                <button
                  type="button"
                  onClick={clearChecked}
                  className="press min-h-11 px-2 text-sm font-semibold text-accent"
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
            </div>
          ) : null}
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
            className="press min-h-12 w-full rounded-[16px] text-sm font-medium text-mute"
          >
            Clear this week’s list
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="press fixed right-[max(1.25rem,calc((100vw-32rem)/2+1.25rem))] bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-30 flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-card"
        aria-label="Add item"
      >
        <IconPlus className="size-6" />
      </button>

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
      className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? 'bg-accent text-white' : 'bg-card text-mute shadow-card'
      }`}
    >
      {label}
    </button>
  )
}



