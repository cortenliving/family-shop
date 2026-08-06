import { useEffect, useState } from 'react'
import { SharingStatusCard } from '../components/SharingStatus'
import { hasRemoteApi } from '../lib/sync'
import { useShopStore } from '../store/useShopStore'

export function SettingsView() {
  const family = useShopStore((s) => s.family)
  const member = useShopStore((s) => s.member)
  const theme = useShopStore((s) => s.theme)
  const weeklyReminder = useShopStore((s) => s.weeklyReminder)
  const syncStatus = useShopStore((s) => s.syncStatus)
  const familyMembers = useShopStore((s) => s.familyMembers)
  const createFamily = useShopStore((s) => s.createFamily)
  const joinFamily = useShopStore((s) => s.joinFamily)
  const leaveFamily = useShopStore((s) => s.leaveFamily)
  const setTheme = useShopStore((s) => s.setTheme)
  const setWeeklyReminder = useShopStore((s) => s.setWeeklyReminder)
  const setMemberName = useShopStore((s) => s.setMemberName)
  const saveMemberName = useShopStore((s) => s.saveMemberName)
  const showToast = useShopStore((s) => s.showToast)
  const pullRemote = useShopStore((s) => s.pullRemote)

  const [familyName, setFamilyName] = useState('Our Family')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  // Local draft so clearing "Me" to type "Kane" is not fought by the store
  const [nameDraft, setNameDraft] = useState(member?.displayName ?? 'Me')
  const [nameDirty, setNameDirty] = useState(false)

  useEffect(() => {
    if (!nameDirty && member?.displayName != null) {
      setNameDraft(member.displayName)
    }
  }, [member?.displayName, nameDirty])

  const commitName = () => {
    const next = nameDraft.trim() || 'Me'
    setNameDraft(next)
    setNameDirty(false)
    saveMemberName(next)
  }

  const shareInvite = async () => {
    if (!family) return
    const url = new URL(window.location.href)
    url.searchParams.set('join', family.code)
    const text = `Join our Family Shop list with code ${family.code}\n${url.toString()}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Family Shop invite',
          text,
          url: url.toString(),
        })
      } else {
        await navigator.clipboard.writeText(text)
        showToast('Invite link copied')
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text)
        showToast('Invite link copied')
      } catch {
        showToast(`Code: ${family.code}`)
      }
    }
  }

  const requestNotify = async () => {
    if (!('Notification' in window)) {
      showToast('Notifications not supported on this device')
      return
    }
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      showToast('Notifications enabled')
      if (weeklyReminder) {
        // Lightweight local reminder registration note
        showToast('Weekly reminder preference saved (local)')
      }
    } else {
      showToast('Notification permission denied')
    }
  }

  return (
    <div className="px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Family sharing, theme, and notifications
      </p>

      <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Family
        </h2>

        {family ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">
                {family.name}
              </p>
              <p className="text-sm text-slate-500">
                Join code{' '}
                <span className="font-mono text-base font-bold tracking-widest text-teal-700 dark:text-teal-300">
                  {family.code}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Status: {syncStatus}
                {hasRemoteApi() ? ' · cloud connected' : ' · this device only'}
              </p>
            </div>

            <SharingStatusCard />

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void shareInvite()}
                className="min-h-12 rounded-2xl bg-teal-600 font-bold text-white"
              >
                Invite family (share link / code)
              </button>
              {hasRemoteApi() ? (
                <button
                  type="button"
                  onClick={() => void pullRemote()}
                  className="min-h-12 rounded-2xl bg-slate-100 font-semibold dark:bg-slate-800"
                >
                  Pull latest list from cloud
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  if (confirm('Leave this family on this device?')) void leaveFamily()
                }}
                className="min-h-12 rounded-2xl text-sm font-semibold text-red-600"
              >
                Leave family
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Create family
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800"
                  placeholder="Family name"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await createFamily(familyName)
                    setBusy(false)
                  }}
                  className="min-h-12 rounded-2xl bg-teal-600 px-4 font-bold text-white"
                >
                  Create
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-slate-500">
                Join with code
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 font-mono tracking-widest dark:border-slate-700 dark:bg-slate-800"
                  placeholder="ABC123"
                  maxLength={8}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    await joinFamily(joinCode)
                    setBusy(false)
                  }}
                  className="min-h-12 rounded-2xl bg-slate-900 px-4 font-bold text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          You
        </h2>
        <label className="mt-3 block text-xs font-semibold text-slate-500">
          Display name
        </label>
        <div className="mt-1 flex gap-2">
          <input
            value={nameDraft}
            onChange={(e) => {
              setNameDirty(true)
              setNameDraft(e.target.value)
              setMemberName(e.target.value)
            }}
            onBlur={() => {
              if (nameDirty) commitName()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur()
              }
            }}
            className="min-h-12 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 dark:border-slate-700 dark:bg-slate-800"
            placeholder="e.g. Kane, Mum, Dad"
            autoComplete="name"
            enterKeyHint="done"
          />
          <button
            type="button"
            onClick={commitName}
            className="min-h-12 shrink-0 rounded-2xl bg-teal-600 px-4 text-sm font-bold text-white"
          >
            Save
          </button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          This is how you show up on the shared family list
          {familyMembers.length > 1
            ? ` (${familyMembers.length} people on this list).`
            : '.'}{' '}
          Tap Save (or leave the field) after typing.
        </p>
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Appearance
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`min-h-12 rounded-2xl text-sm font-semibold capitalize ${
                theme === t
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          Notifications
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Push when family members change the list works best with the Cloudflare
          worker + web push keys. You can enable browser notifications and a local weekly reminder preference here.
        </p>
        <label className="mt-3 flex min-h-12 items-center justify-between gap-3">
          <span className="text-sm font-medium">Weekly “make the list” reminder</span>
          <input
            type="checkbox"
            className="size-5 accent-teal-600"
            checked={weeklyReminder}
            onChange={(e) => setWeeklyReminder(e.target.checked)}
          />
        </label>
        <button
          type="button"
          onClick={() => void requestNotify()}
          className="mt-2 min-h-12 w-full rounded-2xl bg-slate-100 font-semibold dark:bg-slate-800"
        >
          Enable browser notifications
        </button>
      </section>

      <section className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          About
        </h2>
        <p className="mt-2">
          Family Shop keeps a permanent Master List. Checking items off only
          clears them from this week’s list so next shop is one tap away.
        </p>
        <p className="mt-2">
          Barcode lookup uses{' '}
          <a
            className="font-semibold text-teal-700 dark:text-teal-300"
            href="https://world.openfoodfacts.org"
            target="_blank"
            rel="noreferrer"
          >
            Open Food Facts
          </a>
          .
        </p>
        <p className="mt-2 text-xs">
          Install on iPhone: Share → Add to Home Screen.
        </p>
      </section>
    </div>
  )
}
