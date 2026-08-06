import { useShopStore } from '../store/useShopStore'
import type { TabId } from '../types'

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: 'week', label: 'This Week', icon: '🛒' },
  { id: 'master', label: 'Master', icon: '📚' },
  { id: 'shop', label: 'Shop', icon: '✓' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export function BottomNav() {
  const tab = useShopStore((s) => s.tab)
  const setTab = useShopStore((s) => s.setTab)
  const weekCount = useShopStore(
    (s) => s.shoppingItems.filter((i) => !i.checked).length,
  )

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative flex min-h-[52px] min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-semibold transition ${
                active
                  ? 'text-teal-700 dark:text-teal-300'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span>{t.label}</span>
              {t.id === 'week' && weekCount > 0 && (
                <span className="absolute right-2 top-1 rounded-full bg-teal-600 px-1.5 text-[10px] font-bold text-white">
                  {weekCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
