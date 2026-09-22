import type { ReactNode } from 'react'

type IconProps = { className?: string; filled?: boolean }

function Svg({
  className,
  children,
  filled,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'size-6'}
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 2.25 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function IconCart({ className, filled }: IconProps) {
  return (
    <Svg className={className} filled={filled}>
      <circle cx="9" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.25" fill="currentColor" stroke="none" />
      <path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.45-1.1L20.5 8H7" />
    </Svg>
  )
}

export function IconLibrary({ className, filled }: IconProps) {
  return (
    <Svg className={className} filled={filled}>
      <path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v13H7.5A2.5 2.5 0 0 0 5 17.5z" />
      <path d="M17 7h2.2A1.8 1.8 0 0 1 21 8.8V20h-4" />
      <path d="M8 8h6M8 12h6" />
    </Svg>
  )
}

export function IconCheckCircle({ className, filled }: IconProps) {
  return (
    <Svg className={className} filled={filled}>
      <circle cx="12" cy="12" r="8.25" />
      <path d="m8.5 12.2 2.3 2.3 4.7-5" stroke={filled ? 'var(--card)' : 'currentColor'} strokeWidth="1.75" fill="none" />
    </Svg>
  )
}

export function IconSettings({ className, filled }: IconProps) {
  return (
    <Svg className={className} filled={filled}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3V20.5M4.8 6.8l1.6 1.6M17.6 15.6l1.6 1.6M3.5 12h2.2M18.3 12H20.5M4.8 17.2l1.6-1.6M17.6 8.4l1.6-1.6" />
    </Svg>
  )
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 6.5v11M6.5 12h11" />
    </Svg>
  )
}

export function IconCheck({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m5.5 12.5 4 4 9-9" />
    </Svg>
  )
}

export function IconStar({ className, filled }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? 'size-5'}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path d="m12 3.8 2.2 4.6 5 .7-3.6 3.5.9 5.1L12 15.8 7.5 17.7l.9-5.1L4.8 9.1l5-.7z" />
    </svg>
  )
}

export function IconClose({ className }: IconProps) {
  return (
    <Svg className={className ?? 'size-[18px]'}>
      <path d="M7 7l10 10M17 7 7 17" />
    </Svg>
  )
}

export function MarkCart({ className }: IconProps) {
  return (
    <div
      className={`flex size-16 items-center justify-center rounded-[20px] bg-accent text-white ${className ?? ''}`}
    >
      <IconCart className="size-8" />
    </div>
  )
}
