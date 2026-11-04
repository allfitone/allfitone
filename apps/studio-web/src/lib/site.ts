/**
 * Where the public landing lives and how it introduces itself to search
 * engines and to the apps a link is shared in.
 *
 * Only the landing under `/es` and `/en` is meant to be found. The workspace
 * keeps its own `noindex` in its layout, so nothing here reaches it.
 *
 * The shape mirrors `apps/space-web/src/lib/site.ts` deliberately rather than
 * through a package: each site owns its address, languages and image, and the
 * two already differ in which pages they localize.
 */

import type { Metadata } from 'next'

import { dictionaryFor } from '@/content'

import { LOCALES, type Locale } from './locale'

export const SITE_URL = 'https://studio.allfit.one'
export const SITE_NAME = 'Allfit Studio'

/** Allfit One's own site, which declares the organization every product belongs to. */
export const PARENT_SITE_URL = 'https://www.allfit.one'
export const ORGANIZATION_ID = `${PARENT_SITE_URL}/#organization`

const OG_LOCALES = { es: 'es_CO', en: 'en_US' } as const satisfies Record<Locale, string>

/** The landing's hero, captured in each language, that a shared link is previewed with. */
export function shareImage(locale: Locale) {
  return {
    url: `${SITE_URL}/images/og-${locale}.png`,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: dictionaryFor(locale).meta.shareImageAlt,
  }
}

/** The landing in every language. The fallback is `/`, which `proxy.ts` sends to one. */
export function alternates(locale: Locale): {
  canonical: string
  languages: Record<Locale | 'x-default', string>
} {
  return {
    canonical: `${SITE_URL}/${locale}`,
    languages: { es: `${SITE_URL}/es`, en: `${SITE_URL}/en`, 'x-default': SITE_URL },
  }
}

/** Everything the landing says about itself, in one language. */
export function landingMetadata(locale: Locale) {
  const { title, description } = dictionaryFor(locale).meta
  const image = shareImage(locale)
  const { canonical, languages } = alternates(locale)
  return {
    metadataBase: new URL(SITE_URL),
    applicationName: SITE_NAME,
    title,
    description,
    alternates: { canonical, languages },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    openGraph: {
      type: 'website',
      url: canonical,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALES[locale],
      alternateLocale: LOCALES.filter((option) => option !== locale).map(
        (option) => OG_LOCALES[option],
      ),
      images: [image],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  } satisfies Metadata
}
