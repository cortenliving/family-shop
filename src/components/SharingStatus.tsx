import { hasRemoteApi } from '../lib/sync'
import { useShopStore } from '../store/useShopStore'

function formatAgo(ts?: number): string {
  if (!ts) return 'not yet'
  const sec = Math.round((Date.now() - ts) / 1000)
  if (sec < 15) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  return `${hr}h ago`
}

/** Compact badge for list headers */
export function SharingBanner({ compact }: { compact?: boolean }) {
  const family = useShopStore((s) => s.family)
  const members = useShopStore((s) => s.familyMembers)
  const syncStatus = useShopStore((s) => s.syncStatus)
  const setTab = useShopStore((s) => s.setTab)
  const member = useShopStore((s) => s.member)

  if (!family) return null

  const count = members.length || 1
  const others = members.filter((m) => m.id !== member?.id)
  const activeOthers = others.filter((m) => m.active).length
  const live = syncStatus === 'live' && hasRemoteApi()

  const summary =
    count <= 1
      ? 'Only you on this list so far — invite family'
      : live
        ? `Sharing with ${count} people${activeOthers > 0 ? ` · ${activeOthers} active now` : ''}`
        : `Shared with ${count} people · reconnecting…`

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setTab('settings')}
        className={`mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold ${
          live
            ? 'bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200'
            : 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
        }`}
      >
        <span
          className={`inline-block size-2 shrink-0 rounded-full ${
            live ? 'bg-emerald-500' : 'bg-amber-500'
          }`}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        <span className="shrink-0 opacity-70">Details →</span>
      </button>
    )
  }

  return null
}

/** Full sharing card for Settings */
export function SharingStatusCard() {
  const family = useShopStore((s) => s.family)
  const members = useShopStore((s) => s.familyMembers)
  const syncStatus = useShopStore((s) => s.syncStatus)
  const lastSyncedAt = useShopStore((s) => s.lastSyncedAt)
  const member = useShopStore((s) => s.member)
  const refreshMembers = useShopStore((s) => s.refreshMembers)
  const removeFamilyMember = useShopStore((s) => s.removeFamilyMember)
  const pullRemote = useShopStore((s) => s.pullRemote)

  if (!family) return null

  const live = syncStatus === 'live' && hasRemoteApi()
  const count = Math.max(members.length, 1)
  const others = members.filter((m) => m.id !== member?.id)
  const sorted = [...members].sort((a, b) => {
    if (a.id === member?.id) return -1
    if (b.id === member?.id) return 1
    if (a.active !== b.active) return a.active ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50/80 p-3 dark:border-teal-900 dark:bg-teal-950/40">
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 inline-block size-3 shrink-0 rounded-full ${
            live ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]' : 'bg-amber-500'
          }`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-teal-950 dark:text-teal-50">
            {count <= 1
              ? 'Shared list · waiting for family'
              : `You’re sharing with ${count} people`}
          </p>
          <p className="mt-0.5 text-xs text-teal-800/80 dark:text-teal-200/80">
            {live
              ? 'Live sync is on — when anyone adds or checks items, everyone sees it.'
              : hasRemoteApi()
                ? syncStatus === 'syncing'
                  ? 'Connecting to the shared list…'
                  : 'Not live right now — changes will sync when back online.'
                : 'This device is local-only (no cloud API).'}
          </p>
          {count <= 1 ? (
            <p className="mt-2 text-xs font-medium text-teal-900 dark:text-teal-100">
              Share the join code below so others use the same list.
            </p>
          ) : (
            <p className="mt-2 text-xs text-teal-800/80 dark:text-teal-200/70">
              {others.filter((m) => m.active).length > 0
                ? `${others.filter((m) => m.active).length} other${others.filter((m) => m.active).length === 1 ? '' : 's'} active recently`
                : 'Others are on this list (may be offline)'}
              {' · '}
              Last sync {formatAgo(lastSyncedAt)}
            </p>
          )}
        </div>
      </div>

      {sorted.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-teal-200/70 pt-3 dark:border-teal-800/60">
          {sorted.map((m) => {
            const isYou = m.id === member?.id
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${
                      m.active || isYou ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                  <span className="truncate font-medium text-slate-900 dark:text-white">
                    {m.displayName}
                    {isYou ? (
                      <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>
                    ) : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-slate-500">
                    {isYou || m.active ? 'Active' : formatAgo(m.lastSeenAt)}
                  </span>
                  {!isYou ? (
                    <button
                      type="button"
                      onClick={() => {
                        const label = m.displayName || 'this account'
                        if (
                          confirm(
                            `Remove “${label}” from the family list?\n\nUse this for duplicate or unwanted accounts. They can rejoin with the code if needed.`,
                          )
                        ) {
                          void removeFamilyMember(m.id)
                        }
                      }}
                      className="rounded-lg px-2 py-1 text-[11px] font-bold text-red-600 active:bg-red-50 dark:text-red-400 dark:active:bg-red-950/40"
                      aria-label={`Remove ${m.displayName}`}
                    >
                      Remove
                    </button>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 border-t border-teal-200/70 pt-3 text-xs text-teal-900/70 dark:border-teal-800/60 dark:text-teal-200/70">
          You appear here after the first cloud sync.
        </p>
      )}

      {sorted.length > 1 ? (
        <p className="mt-2 text-[11px] leading-snug text-teal-900/70 dark:text-teal-200/70">
          Two accounts for the same person? Remove the extra one here. Each phone
          keeps its own name under Settings → You.
        </p>
      ) : null}

      {hasRemoteApi() ? (
        <button
          type="button"
          onClick={() => {
            void pullRemote()
            void refreshMembers()
          }}
          className="mt-3 w-full rounded-xl bg-white/80 py-2 text-xs font-bold text-teal-800 dark:bg-teal-900/50 dark:text-teal-100"
        >
          Refresh who is on this list
        </button>
      ) : null}
    </div>
  )
}
