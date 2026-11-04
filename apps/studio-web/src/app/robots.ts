import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'

/**
 * Blocks nothing. The workspace is kept out of search by the `noindex` its
 * layout serves, and a crawler only reads that on a page it may fetch; a
 * disallowed `/app` could still be listed, bare, from the landing's links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
