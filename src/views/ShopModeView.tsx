import { useMemo } from 'react'
import { ShopRow } from '../components/ItemRow'
import { useShopStore } from '../store/useShopStore'

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
    const todo = shoppingItems.filter((s) => !s.checked)
    const bought = shoppingItems.filter((s) => s.checked)

    // Group todo by category for aisle-friendly flow
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

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-teal-700 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <p className="text-xs font-semibold uppercase tracking-wide text-teal-100">
          Shopping mode
        </p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">In the store</h1>
            <p className="text-sm text-teal-100">
              {grouped.todoCount} left · big taps, one hand
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTab('week')}
            className="rounded-2xl bg-white/15 px-3 py-2 text-sm font-semibold"
          >
            Exit
          </button>
        </div>
      </header>

      {grouped.todoCount === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-5xl">🎉</p>
          <p className="mt-3 text-xl font-bold">All done!</p>
          <p className="mt-1 text-slate-500">
            Master list is safe. Clear bought items when you’re ready.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {grouped.bought.length > 0 ? (
              <button
                type="button"
                onClick={clearChecked}
                className="min-h-14 rounded-2xl bg-teal-600 text-base font-bold text-white"
              >
                Clear bought items
              </button>
            ) : null}
            <button
              type="button"
              onClick={clearCurrentList}
              className="min-h-12 rounded-2xl bg-slate-100 font-semibold dark:bg-slate-800"
            >
              Clear entire list
            </button>
          </div>
        </div>
      ) : (
        [...grouped.map.entries()].map(([cat, items]) => (
          <section key={cat} className="mt-2">
            <h2 className="sticky top-[6.5rem] z-10 bg-slate-50/95 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 backdrop-blur dark:bg-slate-900/95">
              {cat.replace('-', ' ')}
            </h2>
            {items.map((s) => (
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
        <section className="mt-6 opacity-80">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Bought ({grouped.bought.length})
            </h2>
            <button
              type="button"
              onClick={clearChecked}
              className="text-sm font-semibold text-teal-700 dark:text-teal-300"
            >
              Clear
            </button>
          </div>
          {grouped.bought.map((s) => (
            <ShopRow
              key={s.id}
              shopping={s}
              master={masterById.get(s.masterItemId)}
              large
              onToggle={() => toggleChecked(s.id)}
            />
          ))}
        </section>
      ) : null}
    </div>
  )
}
