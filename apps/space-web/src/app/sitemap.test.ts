import { describe, expect, test } from 'bun:test'

import { SITE_URL } from '@/lib/site'

import sitemap from './sitemap'

describe('sitemap', () => {
  test('lists the landing once per language, with every alternate and its image', () => {
    const entries = sitemap()

    expect(entries.map((entry) => entry.url)).toEqual([`${SITE_URL}/es`, `${SITE_URL}/en`])
    for (const entry of entries) {
      expect(entry.alternates?.languages).toEqual({
        es: `${SITE_URL}/es`,
        en: `${SITE_URL}/en`,
        'x-default': SITE_URL,
      })
      expect(entry.images).toEqual([`${SITE_URL}/images/og.jpg`])
      expect(entry.lastModified).toBeInstanceOf(Date)
    }
  })
})
