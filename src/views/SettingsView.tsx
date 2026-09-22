import { useEffect, useState } from 'react'
import { toDataURL } from 'qrcode'
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
  const resetDeviceList = useShopStore((s) => s.resetDeviceList)
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

  const copyCode = async () => {
    if (!family) return
    try {
      await navigator.clipboard.writeText(family.code)
      showToast('Code copied')
    } catch {
      showToast(family.code)
    }
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
    <div className="pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <h1 className="px-5 text-[1.65rem] text-ink">Settings</h1>
      <p className="mt-1 px-5 text-sm text-mute">Family, appearance, and this phone</p>

      <p className="mt-6 px-5 text-[13px] font-medium text-mute">Family</p>
      <section className="mx-4 mt-2 overflow-hidden rounded-[20px] bg-card shadow-card">
        {family ? (
          <div>
            <div className="px-4 pt-4">
              <p className="text-lg font-semibold text-ink">{family.name}</p>
              <p className="mt-1 text-xs text-mute">
                Status:{' '}
                {syncStatus === 'live'
                  ? 'live (synced)'
                  : syncStatus === 'error'
                    ? 'error (cloud save failed — try Pull latest, or re-open app)'
                    : syncStatus === 'syncing'
                      ? 'syncing…'
                      : syncStatus === 'offline'
                        ? 'offline (will retry)'
                        : syncStatus}
                {hasRemoteApi() ? ' · cloud API on' : ' · this device only'}
              </p>
            </div>
            <FamilyCodeCard code={family.code} onCopy={() => void copyCode()} onShare={() => void shareInvite()} />
            <SharingStatusCard />
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
                  className="min-h-12 flex-1 rounded-[16px] bg-paper px-3 text-ink"
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
                  className="press min-h-12 rounded-[16px] bg-citrus px-4 font-semibold text-olive"
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
                  className="min-h-12 flex-1 rounded-[16px] bg-paper px-3 font-mono tracking-widest text-ink"
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
                  className="press min-h-12 rounded-[16px] bg-ink px-4 font-semibold text-card"
                >
                  Join
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      <p className="mt-6 px-5 text-[13px] font-medium text-mute">You</p>
      <section className="mx-4 mt-2 overflow-hidden rounded-[20px] bg-card p-4 shadow-card">
        <label className="block text-xs font-medium text-mute">
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
            className="min-h-12 flex-1 rounded-[16px] bg-paper px-3 text-ink"
            placeholder="e.g. Kane, Mum, Dad"
            autoComplete="name"
            enterKeyHint="done"
          />
          <button
            type="button"
            onClick={commitName}
            className="press min-h-12 shrink-0 rounded-[16px] bg-citrus px-4 text-sm font-semibold text-olive"
          >
            Save
          </button>
        </div>
        <p className="mt-1.5 text-xs text-mute">
          This is how you show up on the shared family list
          {familyMembers.length > 1
            ? ` (${familyMembers.length} people on this list).`
            : '.'}{' '}
          Tap Save (or leave the field) after typing.
        </p>
      </section>

      <p className="mt-6 px-5 text-[13px] font-medium text-mute">Appearance</p>
      <section className="mx-4 mt-2 rounded-[20px] bg-card p-2 shadow-card">
        <div className="grid grid-cols-3 rounded-full bg-paper p-1">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`press min-h-11 rounded-full text-sm font-semibold capitalize ${
                theme === t ? 'bg-card text-ink shadow-card' : 'text-mute'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </section>

      <p className="mt-6 px-5 text-[13px] font-medium text-mute">Device</p>
      <section className="mx-4 mt-2 overflow-hidden rounded-[20px] bg-card p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Notifications</h2>
        <p className="mt-2 text-sm text-mute">
          Get a ping when someone adds items, checks things off, or starts the
          usual shop. <strong>Every person</strong> needs to turn this on on
          their own phone. On iPhone you must use the{' '}
          <strong>Add to Home Screen</strong> app (not plain Safari tabs).
        </p>

        {!family ? (
          <p className="mt-3 text-sm text-danger">
            Join a family first to enable shared push.
          </p>
        ) : !pushSupported() ? (
          <p className="mt-3 text-sm text-danger">
            This browser doesn’t support Web Push. On iPhone: Share → Add to Home
            Screen, then open Family Shop from the icon.
          </p>
        ) : !vapidConfigured() || !hasRemoteApi() ? (
          <p className="mt-3 text-sm text-danger">
            Cloud push isn’t configured for this build.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-[16px] bg-paper px-3 py-3">
              <div>
                <p className="text-sm font-semibold text-ink">
                  Family list alerts
                </p>
                <p className="text-xs text-mute">
                  {pushOn ? 'On for this device' : 'Off on this device'}
                </p>
              </div>
              {pushOn ? (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void disablePush()}
                  className="press min-h-11 rounded-[16px] bg-card px-4 text-sm font-semibold text-ink shadow-card"
                >
                  Turn off
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={() => void enablePush()}
                  className="press min-h-11 rounded-[16px] bg-citrus px-4 text-sm font-semibold text-olive"
                >
                  {pushBusy ? '…' : 'Turn on'}
                </button>
              )}
            </div>
            {pushHint ? (
              <p className="text-xs text-mute">{pushHint}</p>
            ) : null}
          </div>
        )}

        <label className="mt-4 flex min-h-12 items-center justify-between gap-3">
          <span className="text-sm font-medium">Weekly “make the list” reminder</span>
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={weeklyReminder}
            onChange={(e) => setWeeklyReminder(e.target.checked)}
          />
        </label>
        <p className="text-xs text-mute">
          Preference saved on this device (local). Full scheduled push coming later.
        </p>
        {hasRemoteApi() && family ? (
          <button
            type="button"
            onClick={() => void pullRemote()}
            className="press mt-4 min-h-12 w-full rounded-[16px] bg-paper text-sm font-semibold text-ink"
          >
            Pull latest list from cloud
          </button>
        ) : null}
        {family ? (
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  'Reset this phone’s copy and load the family list from the server?',
                )
              ) {
                void resetDeviceList()
              }
            }}
            className="press mt-2 min-h-12 w-full rounded-[16px] bg-paper text-sm font-semibold text-ink"
          >
            Reset this device list
          </button>
        ) : null}
        <div className="mt-4 border-t border-ink/8 pt-4 text-sm text-mute">
        <h2 className="text-sm font-semibold text-ink">About</h2>
        <p className="mt-2">
          Family Shop keeps a permanent Master List. Checking items off only
          clears them from this week’s list so next shop is one tap away.
        </p>
        <p className="mt-2">
          Barcode lookup uses{' '}
          <a
            className="font-semibold text-accent"
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
        </div>
      </section>

      {family ? (
        <>
          <p className="mt-6 px-5 text-[13px] font-medium text-danger">Danger</p>
          <section className="mx-4 mt-2 overflow-hidden rounded-[20px] bg-card shadow-card">
            <button
              type="button"
              onClick={() => {
                if (confirm('Leave this family on this device?')) void leaveFamily()
              }}
              className="press min-h-12 w-full px-4 text-left text-sm font-semibold text-danger"
            >
              Leave family
            </button>
          </section>
        </>
      ) : null}
    </div>
  )
}

function FamilyCodeCard({
  code,
  onCopy,
  onShare,
}: {
  code: string
  onCopy: () => void
  onShare: () => void
}) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('join', code)
    let cancelled = false
    void toDataURL(url.toString(), { margin: 1, width: 280, errorCorrectionLevel: 'M' })
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl)
      })
      .catch(() => {
        if (!cancelled) setSrc('')
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return (
    <div className="mx-4 mt-3 rounded-[24px] bg-olive px-4 py-6 text-center text-[#FFF8EF]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-citrus">Family code</p>
      <p className="mt-2 font-mono text-[28px] font-semibold tracking-[0.28em]">{code}</p>
      {src ? (
        <img
          src={src}
          alt={`QR code to join with ${code}`}
          className="mx-auto mt-4 size-40 rounded-[16px] bg-white p-2"
        />
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="press min-h-12 rounded-[16px] bg-card text-sm font-semibold text-ink shadow-card"
        >
          Copy
        </button>
        <button
          type="button"
          onClick={onShare}
          className="press min-h-12 rounded-[16px] bg-citrus text-sm font-semibold text-olive"
        >
          Share
        </button>
      </div>
    </div>
  )
}
