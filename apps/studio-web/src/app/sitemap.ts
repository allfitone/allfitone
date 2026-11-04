import type { MetadataRoute } from 'next'

import { LOCALES } from '@/lib/locale'
import { alternates, shareImage } from '@/lib/site'

/** Only the landing: the workspace is private and serves `noindex`. */
const LANDING_UPDATED = new Date('2026-11-04')

export default function sitemap(): MetadataRoute.Sitemap {
  return LOCALES.map((locale) => {
    const { canonical, languages } = alternates(locale)
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
