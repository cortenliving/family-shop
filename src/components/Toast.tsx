import { useShopStore } from '../store/useShopStore'

export function Toast() {
  const toast = useShopStore((s) => s.toast)
  if (!toast) return null
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(8.25rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4"
      role="status"
    >
      <div className="rounded-[16px] bg-olive px-4 py-2 text-[14px] font-medium text-[#FFF8EF] shadow-card">
        {toast}
      </div>
    </div>
  )
}
