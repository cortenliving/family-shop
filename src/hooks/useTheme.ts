import { useEffect } from 'react'
import { useShopStore } from '../store/useShopStore'

export function useTheme() {
  const theme = useShopStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const apply = (dark: boolean) => {
      root.classList.toggle('dark', dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
      const meta = document.querySelector('meta[name="theme-color"]')
      if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#0f766e')
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const handler = (e: MediaQueryListEvent) => apply(e.matches)
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    apply(theme === 'dark')
  }, [theme])
}
