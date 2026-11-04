import { describe, expect, test } from 'bun:test'

import { dictionaryFor } from '@/content'

import { alternates, pageMetadata, shareImage, SITE_URL } from './site'

describe('alternates', () => {
  test('a page names itself, its translation and the address that picks a language', () => {
    expect(alternates('en', '/privacy')).toEqual({
      canonical: `${SITE_URL}/en/privacy`,
      languages: {
        es: `${SITE_URL}/es/privacy`,
        en: `${SITE_URL}/en/privacy`,
        'x-default': `${SITE_URL}/privacy`,
      },
    })
  })

  test("the home page's fallback is the root, which the proxy sends to a language", () => {
    expect(alternates('es', '').languages['x-default']).toBe(SITE_URL)
  })
})

describe('pageMetadata', () => {
  test('a page shares its own address, words and image, not the home page’s', () => {
    const copy = dictionaryFor('en')
    const metadata = pageMetadata('en', '/terms', {
      title: copy.meta.termsTitle,
      description: copy.meta.termsDescription,
    })

    expect(metadata.title).toBe(copy.meta.termsTitle)
    expect(metadata.description).toBe(copy.meta.termsDescription)
    expect(metadata.openGraph).toMatchObject({
      url: `${SITE_URL}/en/terms`,
      title: copy.meta.termsTitle,
      description: copy.meta.termsDescription,
      locale: 'en_US',
      alternateLocale: ['es_CO'],
      images: [shareImage('en')],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: copy.meta.termsTitle,
      images: [shareImage('en')],
    })
  })

  test('the shared image is described in the language of the page', () => {
    expect(shareImage('es').alt).toBe(dictionaryFor('es').meta.shareImageAlt)
    expect(shareImage('en').alt).toBe(dictionaryFor('en').meta.shareImageAlt)
  })
})
