import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { StudioShell } from '@/components/studio-shell'
import { isLocale, LOCALES } from '@/lib/locale'
import { landingMetadata } from '@/lib/site'
import { serializeStructuredData, structuredData } from '@/lib/structured-data'

import { studioFontVariables, studioIcons } from '../document'

import '@allfitone/react/tokens.css'
import '@allfitone/react/app.css'
import '@allfitone/react/styles.css'
import '../studio.composition.css'

/**
 * The landing's root layout, once per language: `/es` and `/en`. `/` itself is
 * answered by `proxy.ts`, which picks one from the browser's languages.
 *
 * Unlike the workspace's, it carries no invitation capture script: that script
 * only acts on `/invitations`. And the language switch re-renders this layout
 * on the client, where React refuses to render a `<script>` element.
 *
 * It is the only part of Studio meant to be found: indexable, previewable when
 * shared and described as structured data. The workspace keeps its `noindex`.
 * The JSON-LD survives the client re-render, which React allows for data blocks.
 */

interface LandingParams {
  params: Promise<{ lang: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }))
}

export async function generateMetadata({ params }: LandingParams): Promise<Metadata> {
  const { lang } = await params
  if (!isLocale(lang)) return {}
  return { ...landingMetadata(lang), icons: studioIcons }
}

export default async function LandingLayout({
  children,
  params,
}: LandingParams & { children: ReactNode }) {
  const { lang } = await params
  if (!isLocale(lang)) notFound()
  return (
    <html lang={lang} data-afo-theme="light" className={studioFontVariables}>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(structuredData(lang)) }}
        />
        <StudioShell locale={lang} privacyEntry="footer">
          {children}
        </StudioShell>
      </body>
    </html>
  )
}
