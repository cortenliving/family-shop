import { useEffect, useState } from 'react'
import { SharingStatusCard } from '../components/SharingStatus'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermission,
  isPushSubscribed,
  pushSupported,
  vapidConfigured,
} from '../lib/push'
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
  const [pushBusy, setPushBusy] = useState(false)
  const [pushOn, setPushOn] = useState(false)
  const [pushHint, setPushHint] = useState('')

  useEffect(() => {
    if (!nameDirty && member?.displayName != null) {
      setNameDraft(member.displayName)
    }
  }, [member?.displayName, nameDirty])

  useEffect(() => {
    void (async () => {
      if (!pushSupported() || !vapidConfigured()) {
        setPushOn(false)
        return
      }
      const perm = await getPushPermission()
      if (perm !== 'granted') {
        setPushOn(false)
        return
      }
      setPushOn(await isPushSubscribed())
    })()
  }, [family?.id])

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

  const enablePush = async () => {
    if (!family) {
      showToast('Join a family first')
      return
    }
    setPushBusy(true)
    setPushHint('')
    const result = await enablePushNotifications(family.id, member?.id)
    setPushBusy(false)
    setPushHint(result.message)
    showToast(result.message)
    if (result.ok) setPushOn(true)
  }

  const disablePush = async () => {
    if (!family) return
    setPushBusy(true)
    await disablePushNotifications(family.id)
    setPushBusy(false)
    setPushOn(false)
    setPushHint('Push turned off on this device')
    showToast('Push turned off on this device')
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
          Get a ping when someone adds items, checks things off, or starts the
          usual shop. <strong>Every person</strong> needs to turn this on on
          their own phone. On iPhone you must use the{' '}
          <strong>Add to Home Screen</strong> app (not plain Safari tabs).
        </p>

        {!family ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            Join a family first to enable shared push.
          </p>
        ) : !pushSupported() ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            This browser doesn’t support Web Push. On iPhone: Share → Add to Home
            Screen, then open Family Shop from the icon.
          </p>
        ) : !vapidConfigured() || !hasRemoteApi() ? (
          <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
            Cloud push isn’t configured for this build.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Family list alerts
                </p>
                <p className="text-xs text-slate-500">
                  {pushOn ? 'On for this device' : 'Off on this device'}
                </p>
              </div>
              {pushOn ? (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void disablePush()}
                  className="min-h-11 rounded-xl bg-slate-200 px-4 text-sm font-bold dark:bg-slate-700"
                >
                  Turn off
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void enablePush()}
                  className="min-h-11 rounded-xl bg-teal-600 px-4 text-sm font-bold text-white"
                >
                  {pushBusy ? '…' : 'Turn on'}
                </button>
              )}
            </div>
            {pushHint ? (
              <p className="text-xs text-slate-500">{pushHint}</p>
            ) : null}
          </div>
        )}

        <label className="mt-4 flex min-h-12 items-center justify-between gap-3">
          <span className="text-sm font-medium">Weekly “make the list” reminder</span>
          <input
            type="checkbox"
            className="size-5 accent-teal-600"
            checked={weeklyReminder}
            onChange={(e) => setWeeklyReminder(e.target.checked)}
          />
        </label>
        <p className="text-xs text-slate-400">
          Preference saved on this device (local). Full scheduled push coming later.
        </p>
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
