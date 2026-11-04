import type { MetadataRoute } from 'next'

import { LOCALES } from '@/lib/locale'
import { alternates, shareImage } from '@/lib/site'

/**
 * Only the landing is listed. The privacy policy and the terms are drafts under
 * legal review that still carry placeholders, so they stay out of search until
 * they are final; see `LEGAL_ROBOTS`.
 */
const LANDING_UPDATED = new Date('2026-11-04')

export default function sitemap(): MetadataRoute.Sitemap {
  return LOCALES.map((locale) => {
    const { canonical, languages } = alternates(locale, '')
    return {
      url: canonical,
      lastModified: LANDING_UPDATED,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages },
      images: [shareImage(locale).url],
    }
  })
}
