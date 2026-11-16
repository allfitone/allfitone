import { describe, expect, test } from 'bun:test'

import { SITE_URL } from '@/lib/site'

import sitemap from './sitemap'

describe('sitemap', () => {
  test('lists the landing and the waitlist once per language, with every alternate and its image', () => {
    const entries = sitemap()

    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE_URL}/es`,
      `${SITE_URL}/en`,
      `${SITE_URL}/es/waitlist`,
      `${SITE_URL}/en/waitlist`,
    ])
    for (const entry of entries) {
      const path = entry.url.endsWith('/waitlist') ? '/waitlist' : ''
      expect(entry.alternates?.languages).toEqual({
        es: `${SITE_URL}/es${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}${path}`,
      })
      expect(entry.images).toEqual([`${SITE_URL}/images/og.jpg`])
      expect(entry.lastModified).toBeInstanceOf(Date)
    }
  })
})
