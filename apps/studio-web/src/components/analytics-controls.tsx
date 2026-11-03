'use client'

import { Button } from '@allfitone/react/components/button'
import { ANALYTICS_PRIVACY_NOTICE_URL, type TelemetryScreen } from '@allfitone/telemetry'
import { usePathname } from 'next/navigation'
import { useReportWebVitals } from 'next/web-vitals'
import { useEffect, useState, useSyncExternalStore } from 'react'

import {
  captureStudioTelemetry,
  initializeStudioTelemetry,
  setStudioAnalyticsConsent,
  studioTelemetryCommon,
  studioTelemetryServerSnapshot,
  studioTelemetrySnapshot,
  subscribeStudioTelemetry,
} from '@/lib/telemetry'
import type { Locale } from '@/lib/locale'

/**
 * The panel opens on a visitor's first page, which may be the English landing,
 * so it speaks the page's language. The workspace always passes Spanish.
 */
const COPY = {
  es: {
    label: 'Preferencias de analítica',
    title: 'Analítica opcional',
    text: 'Ayúdanos a medir rendimiento y uso con un identificador seudónimo. No capturamos contenido, nombres, correos ni datos de salud.',
    notice: 'Leer el aviso completo',
    privacySignal: 'La señal de privacidad de este dispositivo mantiene la analítica desactivada.',
    allow: 'Permitir analítica',
    deny: 'No permitir',
    reopen: 'Privacidad',
  },
  en: {
    label: 'Analytics preferences',
    title: 'Optional analytics',
    text: 'Help us measure performance and usage with a pseudonymous identifier. We do not capture content, names, emails or health data.',
    notice: 'Read the full notice',
    privacySignal: "This device's privacy signal keeps analytics turned off.",
    allow: 'Allow analytics',
    deny: 'Do not allow',
    reopen: 'Privacy',
  },
} satisfies Record<Locale, Record<string, string>>

export function AnalyticsControls({ locale }: { locale: Locale }) {
  const copy = COPY[locale]
  const telemetry = useSyncExternalStore(
    subscribeStudioTelemetry,
    studioTelemetrySnapshot,
    studioTelemetryServerSnapshot,
  )
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()

  useEffect(() => initializeStudioTelemetry(), [])
  useEffect(() => {
    if (!telemetry.active) return
    captureStudioTelemetry({
      event: 'client.screen.viewed.v1',
      properties: { ...studioTelemetryCommon(), screen: studioScreen(pathname) },
    })
  }, [pathname, telemetry.active])

  useReportWebVitals((metric) => {
    if (!['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].includes(metric.name)) return
    captureStudioTelemetry({
      event: 'client.performance.measured.v1',
      properties: {
        ...studioTelemetryCommon(),
        metric: metric.name as 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB',
        value: metric.value,
        rating: metric.rating,
      },
    })
  })

  // Until the stored decision has been read, the collapsed control is the
  // honest thing to show: it is the steady state of almost every load, and
  // opening the panel first would ask again of everyone who already answered.
  const open = telemetry.resolved && (telemetry.decision === 'undecided' || expanded)
  return (
    <aside data-analytics-controls data-expanded={open ? 'true' : 'false'} aria-label={copy.label}>
      {open ? (
        <div data-analytics-panel>
          <strong>{copy.title}</strong>
          <p>{copy.text}</p>
          <a
            data-analytics-notice-link
            href={ANALYTICS_PRIVACY_NOTICE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {copy.notice}
          </a>
          {telemetry.privacySignalDenied ? (
            <p>{copy.privacySignal}</p>
          ) : (
            <div data-analytics-actions>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setStudioAnalyticsConsent('granted')
                  setExpanded(false)
                }}
              >
                {copy.allow}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setStudioAnalyticsConsent('denied')
                  setExpanded(false)
                }}
              >
                {copy.deny}
              </Button>
            </div>
          )}
        </div>
      ) : (
        // This control is fixed to the viewport, so it lands on whatever the
        // page happens to put behind it. An outline variant is transparent and
        // its border resolves to roughly 1.24:1 against the entry background —
        // a boundary that thin delimits nothing and the control reads as loose
        // text. A floating control needs to carry its own surface.
        <Button type="button" size="sm" variant="secondary" onClick={() => setExpanded(true)}>
          {copy.reopen}
        </Button>
      )}
    </aside>
  )
}

function studioScreen(pathname: string): TelemetryScreen {
  if (pathname === '/account') return 'studio.account'
  if (pathname === '/profile') return 'studio.profile'
  if (pathname.includes('/team/invitations/new')) return 'studio.team_invitation_new'
  if (pathname.includes('/team/invitations')) return 'studio.team_invitations'
  if (pathname.includes('/team/roles')) return 'studio.team_roles'
  if (pathname.includes('/team')) return 'studio.team_directory'
  if (pathname.startsWith('/invitations')) return 'studio.invitation_decision'
  if (pathname.startsWith('/organizations/')) return 'studio.organization_overview'
  return 'studio.entry'
}
