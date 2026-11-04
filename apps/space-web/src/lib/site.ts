/**
 * Where the site lives and how each page introduces itself to search engines
 * and to the apps a link is shared in.
 *
 * Every page builds its metadata here rather than inheriting the layout's: a
 * page that sets its own `openGraph` replaces the inherited object whole, so a
 * legal page that only changed its title used to be shared with the home
 * page's title, address and description.
 */

import type { Metadata } from 'next'

import { dictionaryFor } from '@/content'

import { LOCALES, type Locale } from './locale'

export const SITE_URL = 'https://space.allfit.one'
export const SITE_NAME = 'Allfit Space'

/** Allfit One's own site, which declares the organization every product belongs to. */
export const PARENT_SITE_URL = 'https://www.allfit.one'
export const ORGANIZATION_ID = `${PARENT_SITE_URL}/#organization`

/**
 * The privacy policy and the terms are drafts under legal review that still
 * carry placeholders. They can be opened and shared, but stay out of search.
 */
export const LEGAL_ROBOTS = { index: false, follow: true } as const

const OG_LOCALES = { es: 'es_CO', en: 'en_US' } as const satisfies Record<Locale, string>

/**
 * Canonical and alternate URLs of one page in every language. The fallback is
 * the unprefixed address, which `proxy.ts` sends to the visitor's language.
 */
export function alternates(
  locale: Locale,
  path: string,
): { canonical: string; languages: Record<Locale | 'x-default', string> } {
  const localized = (option: Locale) => `${SITE_URL}/${option}${path}`
  return {
    canonical: localized(locale),
    languages: { es: localized('es'), en: localized('en'), 'x-default': `${SITE_URL}${path}` },
  }
}

/** The photograph a shared link is previewed with, described in the page's language. */
export function shareImage(locale: Locale) {
  return {
    url: `${SITE_URL}/images/og.jpg`,
    width: 1200,
    height: 630,
    type: 'image/jpeg',
    alt: dictionaryFor(locale).meta.shareImageAlt,
  }
}

interface PageWords {
  title: string
  description: string
}

/** Everything a page says about itself, in one language. */
export function pageMetadata(locale: Locale, path: string, { title, description }: PageWords) {
  const { canonical, languages } = alternates(locale, path)
  const image = shareImage(locale)
  return {
    title,
    description,
    alternates: { canonical, languages },
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
