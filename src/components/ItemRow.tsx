import { CATEGORIES, type MasterItem, type ShoppingItem } from '../types'

export function categoryMeta(id: MasterItem['category']) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]!
}

interface MasterRowProps {
  item: MasterItem
  onAddToWeek: () => void
  onToggleFrequent: () => void
  inWeek: boolean
}

export function MasterRow({
  item,
  onAddToWeek,
  onToggleFrequent,
  inWeek,
}: MasterRowProps) {
  const cat = categoryMeta(item.category)
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-3 py-3 dark:border-slate-800">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="size-11 shrink-0 rounded-xl object-cover bg-slate-100"
        />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800">
          {cat.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-semibold text-slate-900 dark:text-white">
            {item.name}
          </p>
          {item.frequent ? <span className="text-amber-500">★</span> : null}
        </div>
        <p className="truncate text-xs text-slate-500">
          {[item.brand, item.sizeLabel, cat.label].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleFrequent}
        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-lg text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
        aria-label={item.frequent ? 'Unmark frequent' : 'Mark frequent'}
      >
        {item.frequent ? '★' : '☆'}
      </button>
      <button
        type="button"
        disabled={inWeek}
        onClick={onAddToWeek}
        className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-bold active:scale-[0.98] ${
          inWeek
            ? 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            : 'bg-teal-600 text-white'
        }`}
      >
        {inWeek ? 'On list' : '+ Week'}
      </button>
    </div>
  )
}

interface ShopRowProps {
  shopping: ShoppingItem
  master?: MasterItem
  large?: boolean
  onToggle: () => void
  onRemove?: () => void
}

export function ShopRow({
  shopping,
  master,
  large,
  onToggle,
  onRemove,
}: ShopRowProps) {
  const cat = categoryMeta(master?.category ?? 'other')
  const name = master?.name ?? 'Unknown item'
  return (
    <div
      className={`flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 ${
        large ? 'px-3 py-4' : 'px-3 py-3'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`flex shrink-0 items-center justify-center rounded-2xl border-2 transition ${
          large ? 'size-14' : 'size-11'
        } ${
          shopping.checked
            ? 'border-teal-600 bg-teal-600 text-white'
            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
        }`}
        aria-label={shopping.checked ? 'Uncheck' : 'Check off'}
      >
        {shopping.checked ? (
          <span className={large ? 'text-2xl' : 'text-lg'}>✓</span>
        ) : null}
      </button>
      <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
        <p
          className={`font-semibold ${
            large ? 'text-lg' : 'text-base'
          } ${
            shopping.checked
              ? 'text-slate-400 line-through'
              : 'text-slate-900 dark:text-white'
          }`}
        >
          {name}
          {shopping.quantity ? (
            <span className="ml-2 font-bold text-teal-700 dark:text-teal-300">
              {shopping.quantity}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-slate-500">
          {[shopping.notes, master?.brand, cat.label].filter(Boolean).join(' · ')}
        </p>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
          aria-label="Remove"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}
