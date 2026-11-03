import type { ReactNode } from 'react'

import { AnalyticsControls } from './analytics-controls'
import { SessionGuard } from './session-guard'
import { StudioEntryContextProvider } from './studio-entry-context'
import { StudioQueryProvider } from './studio-query-provider'
import type { Locale } from '@/lib/locale'

/**
 * Everything both root layouts mount inside `<body>`.
 *
 * The landing keeps the session guard although it shows no data. A stale or
 * half-closed session must be settled before anyone signs in again, and doing
 * it here means "Entrar" already knows the answer when it is pressed.
 *
 * The guard's own screens — the recovery lock, the closing notice — belong to
 * the workspace and stay in Spanish on the English landing.
 */
export function StudioShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <>
      <StudioQueryProvider>
        <StudioEntryContextProvider>
          <SessionGuard>{children}</SessionGuard>
        </StudioEntryContextProvider>
      </StudioQueryProvider>
      <AnalyticsControls locale={locale} />
    </>
  )
}
