import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { dictionaryFor } from '@/content'

import { LOCALES } from './locale'
import { alternates, pageMetadata, shareImage, SITE_URL } from './site'

const PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public', import.meta.url))
const SHARE_PAGES = ['home', 'waitlist'] as const

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

  test('a page of the waitlist is shared with the waitlist’s image', () => {
    const metadata = pageMetadata(
      'es',
      '/waitlist',
      { title: 'Lista de espera | Allfit Space', description: 'Únete a la lista.' },
      'waitlist',
    )

    expect(metadata.openGraph.images).toEqual([shareImage('es', 'waitlist')])
    expect(metadata.twitter.images).toEqual([shareImage('es', 'waitlist')])
  })
})

describe('shareImage', () => {
  test('each page has its own image in each language, described in that language', () => {
    const urls = LOCALES.flatMap((locale) =>
      SHARE_PAGES.map((page) => shareImage(locale, page).url),
    )
    expect(new Set(urls).size).toBe(urls.length)

    for (const locale of LOCALES) {
      const copy = dictionaryFor(locale)
      expect(shareImage(locale).alt).toBe(copy.meta.shareImageAlt)
      expect(shareImage(locale, 'waitlist').alt).toBe(copy.waitlistPage.meta.shareImageAlt)
    }
  })

  // Apps keep a preview by its image's address: a changed picture must take a new name.
  test('every image holds the content its name promises, at the size it declares', () => {
    for (const locale of LOCALES) {
      for (const page of SHARE_PAGES) {
        const image = shareImage(locale, page)
        const path = new URL(image.url).pathname
        const content = readFileSync(`${PUBLIC_DIRECTORY}${path}`)
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 8)

        expect(path).toEndWith(`.${hash}.png`)
        // A PNG gives its width and height as two 32-bit numbers from byte 16.
        expect([content.readUInt32BE(16), content.readUInt32BE(20)]).toEqual([
          image.width,
          image.height,
        ])
      }
    }
  })
})
