import { describe, expect, test } from 'bun:test'

import { dictionaryFor } from '@/content'

import { SITE_URL } from './site'
import { serializeStructuredData, structuredData } from './structured-data'

const ORGANIZATION = 'https://www.allfit.one/#organization'

function node(type: string) {
  return structuredData('es')['@graph'].find((entry) => entry['@type'] === type)
}

describe('structuredData', () => {
  test('describes Studio as a web application published by Allfit One', () => {
    expect(node('WebApplication')).toMatchObject({
      '@id': `${SITE_URL}/#app`,
      name: 'Allfit Studio',
      url: `${SITE_URL}/es`,
      description: dictionaryFor('es').meta.description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'es',
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
