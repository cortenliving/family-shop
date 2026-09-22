import { useEffect } from 'react'
import { BottomNav } from './components/BottomNav'
import { Toast } from './components/Toast'
import { Welcome } from './components/Welcome'
import { useTheme } from './hooks/useTheme'
import { useShopStore } from './store/useShopStore'
import { MasterView } from './views/MasterView'
import { SettingsView } from './views/SettingsView'
import { ShopModeView } from './views/ShopModeView'
import { WeekView } from './views/WeekView'

function WeekSkeleton() {
  return (
    <div className="mx-auto max-w-lg px-5 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="h-7 w-40 animate-pulse rounded-full bg-ink/10" />
      <div className="mt-3 h-4 w-24 animate-pulse rounded-full bg-ink/10" />
      <div className="mt-3 h-8 w-full animate-pulse rounded-full bg-ink/8" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-[52px] items-center gap-3">
            <div className="size-11 animate-pulse rounded-[14px] bg-ink/10" />
            <div className="h-4 flex-1 animate-pulse rounded-full bg-ink/10" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  const hydrated = useShopStore((s) => s.hydrated)
  const tab = useShopStore((s) => s.tab)
  const hydrate = useShopStore((s) => s.hydrate)
  const startRealtime = useShopStore((s) => s.startRealtime)
  const joinFamily = useShopStore((s) => s.joinFamily)
  const family = useShopStore((s) => s.family)
  const syncStatus = useShopStore((s) => s.syncStatus)
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
      <div className="min-h-dvh bg-paper text-ink">
        <WeekSkeleton />
      </div>
    )
  }

  if (!family) {
    return (
      <div className="min-h-dvh bg-paper text-ink">
        <Welcome />
        <Toast />
      </div>
    )
  }

  const shopMode = tab === 'shop'

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {syncStatus === 'error' ? (
        <div className="fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-30 mx-auto w-[min(100%-1.5rem,32rem)] rounded-[16px] bg-card px-4 py-3 text-sm font-medium text-ink shadow-card">
          Not synced — changes saved on this phone
        </div>
      ) : null}
      <main
        className={`mx-auto min-h-dvh max-w-lg ${
          shopMode ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]'
        }`}
      >
        {tab === 'week' && <WeekView />}
        {tab === 'master' && <MasterView />}
        {tab === 'shop' && <ShopModeView />}
        {tab === 'settings' && <SettingsView />}
      </main>
      {shopMode ? null : <BottomNav />}
      <Toast />
    </div>
  )
}
