import type { MetadataRoute } from 'next'

import { LOCALES } from '@/lib/locale'
import { alternates, shareImage } from '@/lib/site'
import { WAITLIST_PATH } from '@/lib/waitlist'

/**
 * The site's two pages, the landing and the waitlist, once per language. The
 * legal documents live on www.allfit.one, whose own sitemap lists them.
 */
const PAGES = [
  { path: '', updated: new Date('2026-11-09'), priority: 1 },
  { path: WAITLIST_PATH, updated: new Date('2026-11-09'), priority: 0.8 },
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.flatMap(({ path, updated, priority }) =>
    LOCALES.map((locale) => {
      const { canonical, languages } = alternates(locale, path)
      return {
        url: canonical,
        lastModified: updated,
        changeFrequency: 'monthly' as const,
        priority,
        alternates: { languages },
        images: [shareImage(locale).url],
      }
    }),
  )
}
