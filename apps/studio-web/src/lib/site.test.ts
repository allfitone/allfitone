import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { dictionaryFor } from '@/content'

import { LOCALES } from './locale'
import { landingMetadata, shareImage, SITE_URL } from './site'

const PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public', import.meta.url))

describe('landingMetadata', () => {
  test('the landing can be indexed, unlike the workspace behind it', () => {
    expect(landingMetadata('es').robots).toMatchObject({ index: true, follow: true })
  })

  test('names itself, its translation and the address that picks a language', () => {
    expect(landingMetadata('en').alternates).toEqual({
      canonical: `${SITE_URL}/en`,
      languages: { es: `${SITE_URL}/es`, en: `${SITE_URL}/en`, 'x-default': SITE_URL },
    })
  })

  test('is shared with its own address, words and image', () => {
    const { meta } = dictionaryFor('en')
    const metadata = landingMetadata('en')

    expect(metadata.title).toBe(meta.title)
    expect(metadata.description).toBe(meta.description)
    expect(metadata.openGraph).toMatchObject({
      url: `${SITE_URL}/en`,
      siteName: 'Allfit Studio',
      title: meta.title,
      locale: 'en_US',
      alternateLocale: ['es_CO'],
      images: [shareImage('en')],
    })
    expect(metadata.twitter).toMatchObject({
      card: 'summary_large_image',
      images: [shareImage('en')],
    })
  })

  test('each language is previewed with its own image, described in that language', () => {
    expect(shareImage('es').url).not.toBe(shareImage('en').url)
    expect(shareImage('es').alt).toBe(dictionaryFor('es').meta.shareImageAlt)
    expect(shareImage('en').alt).toBe(dictionaryFor('en').meta.shareImageAlt)
  })

  // Apps keep a preview by its image's address: a changed picture must take a new name.
  test('every image holds the content its name promises, at the size it declares', () => {
    for (const locale of LOCALES) {
      const image = shareImage(locale)
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
  })
})
