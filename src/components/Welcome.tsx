import { useState } from 'react'
import { useShopStore } from '../store/useShopStore'
/** First screen when this phone is not in a family yet. */
export function Welcome() {
  const createFamily = useShopStore((s) => s.createFamily)
  const joinFamily = useShopStore((s) => s.joinFamily)
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home')
  const [familyName, setFamilyName] = useState('Our Family')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="market-wash relative mx-auto flex min-h-dvh max-w-lg flex-col justify-end px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="relative">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-citrus">Sunday market</p>
        <h1 className="mt-2 text-[3.4rem] leading-[0.9] font-semibold tracking-tight text-ink">
          Family
          <br />
          Shop
        </h1>
        <p className="mt-4 max-w-sm text-lg text-ink/80">
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
              className="press min-h-14 w-full rounded-[16px] bg-citrus text-base font-semibold text-olive"
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
              className="press min-h-14 w-full rounded-[16px] bg-citrus text-base font-semibold text-olive"
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
              className="press min-h-14 w-full rounded-[16px] bg-citrus text-base font-semibold text-olive"
            >
              Create family
            </button>
            <button
              type="button"
              onClick={() => setMode('join')}
              className="press min-h-14 w-full rounded-[16px] bg-[#FFF8EF]/80 text-base font-semibold text-olive"
            >
              I have a code
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
