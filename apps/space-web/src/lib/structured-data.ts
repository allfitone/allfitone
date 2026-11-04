/**
 * What the landing tells search engines about Allfit Space, as schema.org
 * JSON-LD.
 *
 * The organization is named by the `@id` that www.allfit.one declares it with,
 * so the three sites describe one Allfit One rather than three namesakes. Only
 * what the page itself says is claimed: no price, rating or store link while
 * the app is still coming to the stores.
 */

import { dictionaryFor } from '@/content'

import type { Locale } from './locale'
import { ORGANIZATION_ID, PARENT_SITE_URL, SITE_NAME, SITE_URL } from './site'

export function structuredData(locale: Locale) {
  const { meta } = dictionaryFor(locale)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': ORGANIZATION_ID,
        name: 'Allfit One',
        url: PARENT_SITE_URL,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: ['es', 'en'],
        publisher: { '@id': ORGANIZATION_ID },
      },
      {
        '@type': 'MobileApplication',
        '@id': `${SITE_URL}/#app`,
        name: SITE_NAME,
        url: `${SITE_URL}/${locale}`,
        description: meta.description,
        image: `${SITE_URL}/images/og.jpg`,
        applicationCategory: 'HealthApplication',
        operatingSystem: 'iOS, Android',
        inLanguage: locale,
        publisher: { '@id': ORGANIZATION_ID },
      },
    ],
  }
}

/** JSON for a `<script>` element: `<` is escaped so no value can close it early. */
export function serializeStructuredData(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
