import { describe, expect, test } from 'bun:test'

import { dictionaryFor } from '@/content'

import { alternates, pageMetadata, shareImage, SITE_URL } from './site'

describe('alternates', () => {
  test('a page names itself, its translation and the address that picks a language', () => {
    expect(alternates('en', '/programs')).toEqual({
      canonical: `${SITE_URL}/en/programs`,
      languages: {
        es: `${SITE_URL}/es/programs`,
        en: `${SITE_URL}/en/programs`,
        'x-default': `${SITE_URL}/programs`,
      },
    })
  })

  test("the home page's fallback is the root, which the proxy sends to a language", () => {
    expect(alternates('es', '').languages['x-default']).toBe(SITE_URL)
  })
})

describe('pageMetadata', () => {
  test('a page shares its own address, words and image, not the home page’s', () => {
    const metadata = pageMetadata('en', '/programs', {
      title: 'Programs | Allfit Space',
      description: 'Every program in the app.',
    })

    expect(metadata.title).toBe('Programs | Allfit Space')
    expect(metadata.description).toBe('Every program in the app.')
    expect(metadata.openGraph).toMatchObject({
      url: `${SITE_URL}/en/programs`,
      title: 'Programs | Allfit Space',
      description: 'Every program in the app.',
      locale: 'en_US',
      alternateLocale: ['es_CO'],
      images: [shareImage('en')],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      title: 'Programs | Allfit Space',
      images: [shareImage('en')],
    })
  })

  test('the shared image is described in the language of the page', () => {
    expect(shareImage('es').alt).toBe(dictionaryFor('es').meta.shareImageAlt)
    expect(shareImage('en').alt).toBe(dictionaryFor('en').meta.shareImageAlt)
  })
})
