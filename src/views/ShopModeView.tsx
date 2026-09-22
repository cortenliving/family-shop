import { useMemo } from 'react'
import { ShopRow, categoryMeta } from '../components/ItemRow'
import { useShopStore } from '../store/useShopStore'
import { CATEGORIES } from '../types'

export function ShopModeView() {
  const family = useShopStore((s) => s.family)
  const masterItems = useShopStore((s) => s.masterItems)
  const shoppingItems = useShopStore((s) => s.shoppingItems)
  const toggleChecked = useShopStore((s) => s.toggleChecked)
  const clearChecked = useShopStore((s) => s.clearChecked)
  const clearCurrentList = useShopStore((s) => s.clearCurrentList)
  const setTab = useShopStore((s) => s.setTab)

  const masterById = useMemo(
    () => new Map(masterItems.map((m) => [m.id, m])),
    [masterItems],
  )

  const grouped = useMemo(() => {
    const byName = (a: (typeof shoppingItems)[number], b: (typeof shoppingItems)[number]) => {
      const nameA = masterById.get(a.masterItemId)?.name ?? ''
      const nameB = masterById.get(b.masterItemId)?.name ?? ''
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' })
    }

    const todo = shoppingItems.filter((s) => !s.checked).sort(byName)
    const bought = shoppingItems.filter((s) => s.checked).sort(byName)

    // Group todo by category for aisle-friendly flow; A–Z within each category
    const map = new Map<string, typeof todo>()
    for (const s of todo) {
      const cat = masterById.get(s.masterItemId)?.category ?? 'other'
      const list = map.get(cat) ?? []
      list.push(s)
      map.set(cat, list)
    }
    return { map, bought, todoCount: todo.length }
  }, [shoppingItems, masterById])

  if (!family) {
    return (
      <div className="px-6 py-20 text-center text-slate-500">
        Join a family to start shopping mode.
      </div>
    )
  }

  const sections = CATEGORIES.filter((c) => grouped.map.has(c.id))

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 bg-paper/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-[1.65rem] leading-tight text-ink">In the store</h1>
            <p className="text-sm text-mute">{grouped.todoCount} left</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              One-hand shop
            </span>
            <button
              type="button"
              onClick={() => setTab('week')}
              className="press min-h-11 rounded-[16px] bg-card px-3 text-sm font-semibold text-ink shadow-card"
            >
              Exit
            </button>
          </div>
        </div>
      </header>

      {grouped.todoCount === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-xl font-semibold text-ink">All done</p>
          <p className="mt-1 text-mute">
            Master list is safe. Clear bought items when you’re ready.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {grouped.bought.length > 0 ? (
              <button
                type="button"
                onClick={clearChecked}
                className="press min-h-14 rounded-[16px] bg-accent text-base font-semibold text-white"
              >
                Clear bought items
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearCurrentList}
              className="press min-h-12 rounded-[16px] bg-card font-semibold text-ink shadow-card"
            >
              Clear entire list
            </button>
          </div>
        </div>
      ) : (
        sections.map((c) => (
          <section key={c.id} className="mt-2">
            <h2 className="sticky top-[4.6rem] z-10 bg-paper/95 px-4 py-2 text-lg font-semibold text-ink backdrop-blur">
              {categoryMeta(c.id).emoji} {categoryMeta(c.id).label}
            </h2>
            {(grouped.map.get(c.id) ?? []).map((s) => (
              <ShopRow
                key={s.id}
                shopping={s}
                master={masterById.get(s.masterItemId)}
                large
                onToggle={() => toggleChecked(s.id)}
              />
            ))}
          </section>
        ))
      )}

      {grouped.bought.length > 0 && grouped.todoCount > 0 ? (
        <section className="mx-4 mt-8 overflow-hidden rounded-[20px] bg-card shadow-card">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-medium text-mute">
              Bought · {grouped.bought.length}
            </h2>
            <button
              type="button"
              onClick={clearChecked}
              className="press min-h-11 text-sm font-semibold text-accent"
            >
              Clear
            </button>
          </div>
          <div className="border-t border-ink/8 [&>div:last-child]:border-b-0">
            {grouped.bought.map((s) => (
              <ShopRow
                key={s.id}
                shopping={s}
                master={masterById.get(s.masterItemId)}
                large
                onToggle={() => toggleChecked(s.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
