import type { Metadata } from 'next'
import Script from 'next/script'
import type { ReactNode } from 'react'

import { StudioShell } from '@/components/studio-shell'
import { invitationTokenCaptureScript } from '@/lib/invitation-token'

import { studioFontVariables, studioIcons } from '../document'

import '@allfitone/react/tokens.css'
import '@allfitone/react/app.css'
import '@allfitone/react/styles.css'
import '../studio.composition.css'

/**
 * The workspace's root layout: every route a person reaches by signing in.
 * Their addresses carry no language because the workspace speaks only Spanish;
 * the bilingual landing has its own root layout under `[lang]`.
 */
export const metadata: Metadata = {
  title: 'Allfit Studio',
  description: 'Gestión de espacios, equipos y servicios en Allfit Studio.',
  icons: studioIcons,
  robots: {
    index: false,
    follow: false,
  },
}

export default function WorkspaceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="es" data-afo-theme="light" className={studioFontVariables}>
      <body>
        <Script
          id="studio-invitation-token-capture"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: invitationTokenCaptureScript() }}
        />
        <StudioShell locale="es">{children}</StudioShell>
      </body>
    </html>
  )
}
