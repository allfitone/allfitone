import { describe, expect, test } from 'bun:test'

import { dictionaryFor } from '@/content'

import { SITE_URL } from './site'
import { serializeStructuredData, structuredData } from './structured-data'

const ORGANIZATION = 'https://www.allfit.one/#organization'

function node(type: string) {
  return structuredData('en')['@graph'].find((entry) => entry['@type'] === type)
}

describe('structuredData', () => {
  test('describes the app in the language of the page, published by Allfit One', () => {
    expect(node('MobileApplication')).toMatchObject({
      '@id': `${SITE_URL}/#app`,
      name: 'Allfit Space',
      url: `${SITE_URL}/en`,
      description: dictionaryFor('en').meta.description,
      inLanguage: 'en',
      publisher: { '@id': ORGANIZATION },
    })
  })

  test('names the organization by the identifier allfit.one declares it with', () => {
    expect(node('Organization')).toMatchObject({
      '@id': ORGANIZATION,
      name: 'Allfit One',
      url: 'https://www.allfit.one',
    })
    expect(node('WebSite')).toMatchObject({ url: SITE_URL, publisher: { '@id': ORGANIZATION } })
  })
})

describe('serializeStructuredData', () => {
  test('cannot close the script element it is written into', () => {
    expect(serializeStructuredData({ text: '</script><script>' })).not.toContain('<')
  })
})
