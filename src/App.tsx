import { useEffect } from 'react'
import { BottomNav } from './components/BottomNav'
import { Toast } from './components/Toast'
import { useTheme } from './hooks/useTheme'
import { useShopStore } from './store/useShopStore'
import { MasterView } from './views/MasterView'
import { SettingsView } from './views/SettingsView'
import { ShopModeView } from './views/ShopModeView'
import { WeekView } from './views/WeekView'

export default function App() {
  const hydrated = useShopStore((s) => s.hydrated)
  const tab = useShopStore((s) => s.tab)
  const hydrate = useShopStore((s) => s.hydrate)
  const startRealtime = useShopStore((s) => s.startRealtime)
  const joinFamily = useShopStore((s) => s.joinFamily)
  const family = useShopStore((s) => s.family)
  const setTab = useShopStore((s) => s.setTab)

  useTheme()

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // Deep-link: ?join=CODE
  useEffect(() => {
    if (!hydrated) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('join')
    if (code && !family) {
      void joinFamily(code).then((ok) => {
        if (ok) {
          setTab('week')
          const url = new URL(window.location.href)
          url.searchParams.delete('join')
          window.history.replaceState({}, '', url.pathname)
        }
      })
    }
  }, [hydrated, family, joinFamily, setTab])

  useEffect(() => {
    if (!hydrated || !family) return
    return startRealtime()
  }, [hydrated, family?.id, startRealtime])

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-50 text-slate-500 dark:bg-slate-950">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <main className="mx-auto min-h-dvh max-w-lg pb-[calc(4.75rem+env(safe-area-inset-bottom))]">
        {tab === 'week' && <WeekView />}
        {tab === 'master' && <MasterView />}
        {tab === 'shop' && <ShopModeView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      <BottomNav />
      <Toast />
    </div>
  )
}
