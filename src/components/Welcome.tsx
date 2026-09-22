import { useState } from 'react'
import { useShopStore } from '../store/useShopStore'
import { MarkCart } from './icons'

/** First screen when this phone is not in a family yet. */
export function Welcome() {
  const createFamily = useShopStore((s) => s.createFamily)
  const joinFamily = useShopStore((s) => s.joinFamily)
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [familyName, setFamilyName] = useState('Our Family')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col justify-end px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 60%), var(--paper)',
        }}
      />
      <div className="relative">
        <MarkCart />
        <h1 className="mt-6 text-[2rem] leading-tight text-ink">Family Shop</h1>
        <p className="mt-2 max-w-sm text-base text-mute">
          A shared list for this week. Checking something off never removes it from your Master library.
        </p>

        {mode === 'create' ? (
          <form
            className="mt-8 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              await createFamily(familyName)
              setBusy(false)
            }}
          >
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="min-h-14 w-full rounded-[16px] bg-card px-4 text-ink shadow-card outline-none ring-accent focus:ring-2"
              placeholder="Family name"
              aria-label="Family name"
            />
            <button
              type="submit"
              disabled={busy}
              className="press min-h-14 w-full rounded-[16px] bg-accent text-base font-semibold text-white"
            >
              Create family
            </button>
            <button
              type="button"
              onClick={() => setMode('home')}
              className="press min-h-12 w-full text-sm font-medium text-mute"
            >
              Back
            </button>
          </form>
        ) : mode === 'join' ? (
          <form
            className="mt-8 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              await joinFamily(code)
              setBusy(false)
            }}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="min-h-14 w-full rounded-[16px] bg-card px-4 font-mono text-lg tracking-[0.3em] text-ink shadow-card outline-none ring-accent focus:ring-2"
              placeholder="ABC123"
              aria-label="Join code"
              maxLength={8}
              autoCapitalize="characters"
            />
            <button
              type="submit"
              disabled={busy}
              className="press min-h-14 w-full rounded-[16px] bg-accent text-base font-semibold text-white"
            >
              Join family
            </button>
            <button
              type="button"
              onClick={() => setMode('home')}
              className="press min-h-12 w-full text-sm font-medium text-mute"
            >
              Back
            </button>
          </form>
        ) : (
          <div className="mt-10 space-y-3">
            <button
              type="button"
              onClick={() => setMode('create')}
              className="press min-h-14 w-full rounded-[16px] bg-accent text-base font-semibold text-white"
            >
              Create family
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className="press min-h-14 w-full rounded-[16px] bg-card text-base font-semibold text-ink shadow-card"
            >
              I have a code
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
