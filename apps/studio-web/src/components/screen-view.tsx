'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useSyncExternalStore } from 'react'

import { studioScreen } from '@/lib/studio-screen'
import {
  captureStudioTelemetry,
  studioTelemetryCommon,
  studioTelemetryServerSnapshot,
  studioTelemetrySnapshot,
  subscribeStudioTelemetry,
} from '@/lib/telemetry'

/**
 * Reports which screen is open.
 *
 * It sits apart from the privacy panel because only this depends on the
 * address: reading `?tab=` means waiting for the client, and a panel wrapped
 * in that wait would hand the privacy control over later than it has to.
 *
 * **The screen name is the dependency, not the address.** Several screens
 * write a tab into the address without navigating, and every one of them but
 * the team resolves to the same name — so depending on the tab itself would
 * report a second view of the screen already open each time somebody pressed
 * a tab in the library, in billing or in the account.
 */
export function ScreenView() {
  const active = useSyncExternalStore(
    subscribeStudioTelemetry,
    () => studioTelemetrySnapshot().active,
    () => studioTelemetryServerSnapshot().active,
  )
  const screen = studioScreen(usePathname(), useSearchParams().get('tab'))

  useEffect(() => {
    if (!active) return
    captureStudioTelemetry({
      event: 'client.screen.viewed.v1',
      properties: { ...studioTelemetryCommon(), screen },
    })
  }, [screen, active])

  return null
}
