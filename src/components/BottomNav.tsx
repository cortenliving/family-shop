import { IconCart, IconCheckCircle, IconLibrary, IconSettings } from './icons'
import { useShopStore } from '../store/useShopStore'
import type { TabId } from '../types'

const tabs: { id: TabId; label: string; Icon: typeof IconCart }[] = [
  { id: 'week', label: 'This Week', Icon: IconCart },
  { id: 'master', label: 'Master', Icon: IconLibrary },
  { id: 'shop', label: 'Shop', Icon: IconCheckCircle },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
]

export function BottomNav() {
  const tab = useShopStore((s) => s.tab)
  const setTab = useShopStore((s) => s.setTab)
  const weekCount = useShopStore(
    (s) => s.shoppingItems.filter((i) => !i.checked).length,
  )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 px-2"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around rounded-[20px] bg-card/90 px-1 pt-1 shadow-card backdrop-blur-xl">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`press relative flex min-h-11 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-1.5 text-[11px] font-medium ${
                active ? 'text-accent' : 'text-mute'
              }`}
            >
              <span className="relative">
                <t.Icon className="size-6" filled={active} />
                {t.id === 'week' && weekCount > 0 ? (
                  <span className="absolute -right-2 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-semibold leading-none text-white">
                    {weekCount > 9 ? '9+' : weekCount}
                  </span>
                ) : null}
              </span>
              <span>{t.label}</span>
              {active ? (
                <span className="absolute bottom-1 h-0.5 w-3 rounded-full bg-accent" />
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
