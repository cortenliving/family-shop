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
      <div className="mx-auto flex max-w-lg items-stretch justify-around rounded-full bg-olive px-2 py-1 shadow-card">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="press relative flex min-h-11 min-w-16 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-[11px] font-medium text-[#FFF8EF]"
            >
              <span className="relative">
                <t.Icon className="size-6" filled={active} />
                {t.id === 'week' && weekCount > 0 ? (
                  <span className="absolute -right-2 -top-1 flex size-4 items-center justify-center rounded-full bg-citrus text-[9px] font-semibold leading-none text-olive">
                    {weekCount > 9 ? '9+' : weekCount}
                  </span>
                ) : null}
              </span>
              <span className={active ? 'text-citrus' : 'text-[#FFF8EF]/80'}>{t.label}</span>
              {active ? (
                <span className="absolute bottom-1 size-1.5 rounded-full bg-citrus" />
              ) : null}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
