import { CATEGORIES, type MasterItem, type ShoppingItem } from '../types'
import { IconCheck, IconClose, IconPlus, IconStar } from './icons'

export function categoryMeta(id: MasterItem['category']) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]!
}

export function categoryWash(id: string) {
  return `wash-${id}`
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
    <div className="flex min-h-[68px] items-center gap-3 border-b border-ink/10 px-3 py-2">
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="thumb shrink-0 bg-white object-cover"
        />
      ) : (
        <div className={`thumb flex shrink-0 items-center justify-center text-[1.65rem] ${categoryWash(item.category)}`}>
          {cat.emoji}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[17px] font-medium leading-tight text-ink">{item.name}</p>
        <p className="truncate text-xs text-mute">
          {[item.brand, item.sizeLabel, cat.label].filter(Boolean).join(' · ')}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggleFrequent}
        className={`press flex size-11 shrink-0 items-center justify-center rounded-full ${
          item.frequent ? 'text-citrus' : 'text-mute'
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
          inWeek ? 'bg-olive text-citrus' : 'bg-citrus text-olive'
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
  return (
    <div
      className={`flex items-center gap-3 border-b border-ink/10 ${
        large ? 'min-h-[76px] px-4 py-2' : 'min-h-[68px] px-3 py-2'
      } ${shopping.checked ? 'opacity-55' : ''}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="press thumb relative shrink-0 overflow-hidden bg-white"
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
            className={`flex size-full items-center justify-center text-[1.65rem] ${categoryWash(cat.id)} ${
              shopping.checked ? 'opacity-40' : ''
            }`}
          >
            {cat.emoji}
          </span>
        )}
        {shopping.checked ? (
          <span className="absolute inset-0 flex items-center justify-center bg-olive/80 text-citrus">
            <IconCheck className={large ? 'size-7' : 'size-5'} />
          </span>
        ) : null}
      </button>

      <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
        <p
          className={`flex items-center gap-2 text-[17px] font-medium leading-tight ${
            large ? 'text-[19px]' : ''
          } ${shopping.checked ? 'text-mute line-through' : 'text-ink'}`}
        >
          <span className="truncate">{name}</span>
          {shopping.quantity ? (
            <span className="shrink-0 rounded-full bg-citrus px-2 py-0.5 text-xs font-semibold text-olive">
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
