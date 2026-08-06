import { useShopStore } from '../store/useShopStore'

export function Toast() {
  const toast = useShopStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      role="status"
    >
      <div className="rounded-2xl bg-slate-900/95 px-4 py-2.5 text-sm font-medium text-white shadow-lg dark:bg-white/95 dark:text-slate-900">
        {toast}
      </div>
    </div>
  )
}
