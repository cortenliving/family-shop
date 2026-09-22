import { CATEGORIES, type MasterItem, type ShoppingItem } from '../types'
import { IconCheck, IconClose, IconPlus, IconStar } from './icons'

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
    <div className="flex min-h-[52px] items-center gap-3 border-b border-ink/8 px-3 py-1.5">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="size-11 shrink-0 rounded-[14px] bg-paper object-cover"
        />
      ) : (
        <div className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-paper text-lg">
          {cat.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">{item.name}</p>
        <p className="truncate text-xs text-mute">
          {[item.brand, item.sizeLabel, cat.label].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleFrequent}
        className={`press flex size-11 shrink-0 items-center justify-center rounded-full ${
          item.frequent ? 'text-amber-500' : 'text-mute'
        }`}
        aria-label={item.frequent ? 'Unmark frequent' : 'Mark frequent'}
      >
        <IconStar className="size-5" filled={item.frequent} />
      </button>
      <button
        type="button"
        disabled={inWeek}
        onClick={onAddToWeek}
        className={`press flex size-11 shrink-0 items-center justify-center rounded-full ${
          inWeek ? 'bg-accent-soft text-accent' : 'bg-accent text-white'
        }`}
        aria-label={inWeek ? 'On list' : 'Add to this week'}
      >
        {inWeek ? <IconCheck className="size-5" /> : <IconPlus className="size-5" />}
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
  const thumbClass = large ? 'size-14' : 'size-11'
  return (
    <div
      className={`flex items-center gap-3 border-b border-ink/8 ${
        large ? 'min-h-16 px-4 py-2' : 'min-h-[52px] px-3 py-1'
      } ${shopping.checked ? 'opacity-55' : ''}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`press relative ${thumbClass} shrink-0 overflow-hidden rounded-[14px] bg-paper`}
        aria-label={shopping.checked ? 'Uncheck' : 'Check off'}
      >
        {master?.imageUrl ? (
          <img
            src={master.imageUrl}
            alt=""
            className={`size-full object-cover ${shopping.checked ? 'opacity-40' : ''}`}
          />
        ) : (
          <span
            className={`flex size-full items-center justify-center text-lg ${
              shopping.checked ? 'opacity-40' : ''
            }`}
          >
            {cat.emoji}
          </span>
        )}
        {shopping.checked ? (
          <span className="absolute inset-0 flex items-center justify-center bg-accent/85 text-white">
            <IconCheck className={large ? 'size-7' : 'size-5'} />
          </span>
        ) : null}
      </button>

      <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
        <p
          className={`flex items-center gap-2 font-medium ${
            large ? 'text-lg' : 'text-base'
          } ${shopping.checked ? 'text-mute line-through' : 'text-ink'}`}
        >
          <span className="truncate">{name}</span>
          {shopping.quantity ? (
            <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
              {shopping.quantity}
            </span>
          ) : null}
        </p>
        <p className="truncate text-xs text-mute">
          {[shopping.notes, master?.brand, cat.label].filter(Boolean).join(' · ')}
        </p>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="press flex size-11 shrink-0 items-center justify-center rounded-full text-mute"
          aria-label="Remove"
        >
          <IconClose />
        </button>
      ) : null}
    </div>
  )
}
