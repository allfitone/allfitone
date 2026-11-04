import { describe, expect, test } from 'bun:test'

import { shareImage, SITE_URL } from '@/lib/site'

import sitemap from './sitemap'

describe('sitemap', () => {
  test('lists the landing once per language and nothing of the workspace', () => {
    expect(sitemap().map((entry) => entry.url)).toEqual([`${SITE_URL}/es`, `${SITE_URL}/en`])
  })

  test('gives every entry its alternates, its image and a date', () => {
    for (const [index, entry] of sitemap().entries()) {
      expect(entry.alternates?.languages).toEqual({
        es: `${SITE_URL}/es`,
        en: `${SITE_URL}/en`,
        'x-default': SITE_URL,
      })
      expect(entry.images).toEqual([shareImage(index === 0 ? 'es' : 'en').url])
      expect(entry.lastModified).toBeInstanceOf(Date)
    }
  })
})
