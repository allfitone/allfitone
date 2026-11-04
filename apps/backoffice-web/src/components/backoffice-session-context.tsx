'use client'

/**
 * The confirmed session, for the screens that show something about it.
 *
 * The gate fetches it once; the shell needs the operator's name and the home
 * screen needs when the session ends. Neither is authorization: every screen
 * still asks the API, which re-resolves the session and the duty on each call.
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { BackofficeSession } from '@/lib/backoffice-api'

const BackofficeSessionContext = createContext<BackofficeSession | null>(null)

export function BackofficeSessionProvider({
  session,
  children,
}: {
  session: BackofficeSession
  children: ReactNode
}) {
  return (
    <BackofficeSessionContext.Provider value={session}>
      {children}
    </BackofficeSessionContext.Provider>
  )
}

export function useBackofficeSession(): BackofficeSession {
  const session = useContext(BackofficeSessionContext)
  if (!session) throw new Error('useBackofficeSession needs a BackofficeSessionProvider above it')
  return session
}
