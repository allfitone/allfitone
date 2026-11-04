'use client'

/**
 * The gate every authenticated Backoffice screen sits behind.
 *
 * It confirms the session before rendering the shell and keeps confirming it while
 * the shell is open, under the same rules as the access screen: the view ends at the
 * API deadline, when another tab ends the session, and when a tab that comes back into
 * view finds it gone. Meaningful activity refreshes the deadline at most once a
 * minute, because the API extends inactivity on every request and the page only
 * learns the new deadline by asking.
 *
 * Ending unmounts the screen synchronously, before anything is awaited, and then hands
 * the browser to the access screen, which owns every recovery path: an end that the
 * API never confirmed is left in storage for it to finish.
 *
 * This is presentation, not authorization: the API re-resolves the session and the
 * duty on every request. What it protects is what is already on screen.
 */

import { Spinner } from '@allfitone/react/components/spinner'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

import { BackofficeSessionProvider } from './backoffice-session-context'
import { BackofficeWorkspaceShell } from './backoffice-workspace-shell'

import { BackofficeApiError, backofficeApi, type BackofficeSession } from '@/lib/backoffice-api'
import {
  activeSessionActivity,
  BACKOFFICE_HEARTBEAT_INTERVAL_MS,
  backofficeSessionStorageKey,
  parseBackofficeSessionActivity,
  readBackofficeSessionActivity,
  sessionDeadline,
  writeBackofficeSessionActivity,
} from '@/lib/session-activity'

export function BackofficeSessionGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BackofficeSession | null>(null)
  const endingRef = useRef(false)
  const lastHeartbeatRef = useRef(0)
  const heartbeatInFlightRef = useRef(false)

  const leave = useCallback((): void => {
    endingRef.current = true
    flushSync(() => setSession(null))
    window.location.assign('/')
  }, [])

  // A 401 is the API saying the session is over; every other tab learns it from storage.
  const leaveEnded = useCallback((): void => {
    const now = Date.now()
    writeBackofficeSessionActivity({
      version: 1,
      status: 'ended',
      endedAt: now,
      confirmedAt: now,
      reason: 'unknown',
    })
    leave()
  }, [leave])

  const accept = useCallback(
    (next: BackofficeSession): void => {
      if (endingRef.current) return
      const activity = activeSessionActivity({
        inactivityExpiresAt: next.inactivity_expires_at,
        absoluteExpiresAt: next.absolute_expires_at,
      })
      if (!Number.isFinite(sessionDeadline(activity))) {
        leave()
        return
      }
      lastHeartbeatRef.current = activity.lastVerifiedAt
      writeBackofficeSessionActivity(activity)
      setSession(next)
    },
    [leave],
  )

  const end = useCallback(async (reason: 'manual' | 'inactivity'): Promise<void> => {
    if (endingRef.current) return
    endingRef.current = true
    writeBackofficeSessionActivity({ version: 1, status: 'ended', endedAt: Date.now(), reason })
    flushSync(() => setSession(null))
    try {
      await backofficeApi.logout(reason)
      const now = Date.now()
      writeBackofficeSessionActivity({
        version: 1,
        status: 'ended',
        endedAt: now,
        reason,
        confirmedAt: now,
      })
    } catch {
      // The unconfirmed end stays in storage; the access screen offers to complete it.
    } finally {
      window.location.assign('/')
    }
  }, [])

  const revalidate = useCallback(async (): Promise<void> => {
    try {
      accept(await backofficeApi.session())
    } catch (error) {
      if (endingRef.current) return
      // A tab coming back is a checkpoint: without proof the session lives, it does not show.
      if (isUnauthenticated(error)) leaveEnded()
      else leave()
    }
  }, [accept, leave, leaveEnded])

  useEffect(() => {
    const controller = new AbortController()
    backofficeApi
      .session(controller.signal)
      .then((confirmed) => {
        // Another tab ended it and the API has not confirmed yet; the access screen finishes it.
        if (readBackofficeSessionActivity()?.status === 'ended') leave()
        else accept(confirmed)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        leave()
      })
    return () => {
      controller.abort()
    }
  }, [accept, leave])

  useEffect(() => {
    function synchronize(event: StorageEvent): void {
      if (event.key !== backofficeSessionStorageKey) return
      const stored = parseBackofficeSessionActivity(event.newValue)
      if (stored?.status === 'ended') {
        if (!endingRef.current) leave()
        return
      }
      if (stored?.status !== 'active') return
      setSession((current) =>
        current
          ? {
              ...current,
              inactivity_expires_at: new Date(stored.inactivityExpiresAt).toISOString(),
              absolute_expires_at: new Date(stored.absoluteExpiresAt).toISOString(),
            }
          : current,
      )
    }

    function revalidateVisible(): void {
      if (document.visibilityState === 'visible' && !endingRef.current) void revalidate()
    }

    function revalidateRestored(event: PageTransitionEvent): void {
      if (event.persisted && !endingRef.current) void revalidate()
    }

    window.addEventListener('storage', synchronize)
    window.addEventListener('pageshow', revalidateRestored)
    document.addEventListener('visibilitychange', revalidateVisible)
    return () => {
      window.removeEventListener('storage', synchronize)
      window.removeEventListener('pageshow', revalidateRestored)
      document.removeEventListener('visibilitychange', revalidateVisible)
    }
  }, [leave, revalidate])

  useEffect(() => {
    if (!session) return
    const deadline = sessionDeadline(
      activeSessionActivity({
        inactivityExpiresAt: session.inactivity_expires_at,
        absoluteExpiresAt: session.absolute_expires_at,
      }),
    )
    // Always through a timer, so ending never flushes a render from inside this effect.
    const timeout = window.setTimeout(
      () => void end('inactivity'),
      Math.max(0, deadline - Date.now()),
    )
    return () => window.clearTimeout(timeout)
  }, [end, session])

  const open = session !== null
  useEffect(() => {
    if (!open) return

    async function heartbeat(): Promise<void> {
      const now = Date.now()
      if (
        endingRef.current ||
        heartbeatInFlightRef.current ||
        now - lastHeartbeatRef.current < BACKOFFICE_HEARTBEAT_INTERVAL_MS
      ) {
        return
      }
      heartbeatInFlightRef.current = true
      lastHeartbeatRef.current = now
      try {
        accept(await backofficeApi.session())
      } catch (error) {
        // Any other failure keeps the last confirmed deadline, which still ends the view.
        if (!endingRef.current && isUnauthenticated(error)) leaveEnded()
      } finally {
        heartbeatInFlightRef.current = false
      }
    }

    const onActivity = (): void => void heartbeat()
    window.addEventListener('pointerdown', onActivity)
    window.addEventListener('keydown', onActivity)
    window.addEventListener('touchstart', onActivity, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', onActivity)
      window.removeEventListener('keydown', onActivity)
      window.removeEventListener('touchstart', onActivity)
    }
  }, [accept, leaveEnded, open])

  if (!session) {
    return (
      <div data-backoffice-gate>
        <Spinner />
      </div>
    )
  }

  const operatorName = `${session.operator.given_name} ${session.operator.family_name}`.trim()

  // The provider reads the session the heartbeat keeps current, so home shows the live deadline.
  return (
    <BackofficeSessionProvider session={session}>
      <BackofficeWorkspaceShell operatorName={operatorName} onSignOut={() => void end('manual')}>
        {children}
      </BackofficeWorkspaceShell>
    </BackofficeSessionProvider>
  )
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof BackofficeApiError && error.status === 401
}
