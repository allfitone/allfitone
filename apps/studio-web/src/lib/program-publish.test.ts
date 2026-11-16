import { describe, expect, test } from 'bun:test'

import type { TemplateVersionChoice } from './program-editor'
import { programPublishOutcome, retiredVersionsInDraft } from './program-publish'

const V1 = '01991600-a000-7000-8000-000000000022'
const V9 = '01991600-a000-7000-8000-000000000099'

const index = new Map<string, TemplateVersionChoice>([
  [
    V1,
    {
      id: V1,
      templateId: '01991600-a000-7000-8000-000000000001',
      templateTitle: 'Fuerza tren superior',
      versionNumber: 1,
      retired: true,
      publishedAt: '2026-08-02T14:00:00.000Z',
    },
  ],
])

describe('publishing a program', () => {
  test('a new number is a new version, ready to be assigned', () => {
    expect(programPublishOutcome(undefined, { version_number: 1 })).toEqual({
      kind: 'published',
      message: 'Publicada la versión 1. Ya se puede asignar a una persona.',
    })
    expect(programPublishOutcome(1, { version_number: 2 }).kind).toBe('published')
  })

  /*
   * Criterion 4: equivalent publications converge. As built, the server
   * compares with the newest version only and returns that one when nothing
   * changed, so the number is what tells the two answers apart.
   */
  test('the newest number again means nothing changed, and says so', () => {
    expect(programPublishOutcome(2, { version_number: 2 })).toEqual({
      kind: 'unchanged',
      message: 'El borrador es igual a la versión 2, así que no se creó una versión nueva.',
    })
  })
})

describe('the retired versions a publication carries', () => {
  // HU-041 criterion 3: what is warned about before publishing, once per version.
  test('names each retired version the draft uses, once', () => {
    expect(retiredVersionsInDraft([V1, V1], index)).toEqual(['Fuerza tren superior · versión 1'])
  })

  test('still counts a retired version this screen cannot name', () => {
    expect(retiredVersionsInDraft([V9], index)).toEqual([
      'Una versión de plantilla que ya no está disponible',
    ])
  })

  test('says nothing when none is retired', () => {
    expect(retiredVersionsInDraft([], index)).toEqual([])
  })
})
