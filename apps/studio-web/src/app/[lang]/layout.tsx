import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'

import { StudioShell } from '@/components/studio-shell'
import { dictionaryFor } from '@/content'
import { isLocale, LOCALES } from '@/lib/locale'

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
 * Still `noindex`, as the whole of Studio was before the landing had languages.
 * The alternates are declared so that opening it to search engines is that one
 * flag and nothing else.
 */

const SITE_URL = 'https://studio.allfit.one'

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
  const copy = dictionaryFor(lang)
  return {
    title: copy.meta.title,
    description: copy.meta.description,
    alternates: {
      canonical: `${SITE_URL}/${lang}`,
      languages: Object.fromEntries(LOCALES.map((option) => [option, `${SITE_URL}/${option}`])),
    },
    icons: studioIcons,
    robots: {
      index: false,
      follow: false,
    },
  }
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
        <StudioShell locale={lang} privacyEntry="footer">
          {children}
        </StudioShell>
      </body>
    </html>
  )
}
