import { describe, expect, test } from 'bun:test'

import {
  NO_CONTENT_FILTERS,
  contentHref,
  contentStatus,
  contentStatusLabel,
  editedAt,
  filterContent,
  filtersNarrow,
  libraryCreateFromQuery,
  libraryCreatePath,
  libraryPath,
  libraryTabFromQuery,
  programShape,
} from './content-library'
import type { ContentItem, ContentVersion } from './organization-content'

function version(number: number, retired = false): ContentVersion {
  return {
    id: `v-${number}`,
    version_number: number,
    title: null,
    retired,
    published_at: `2026-10-0${number}T10:00:00Z`,
    derived_from_version_id: null,
  }
}

function item(patch: Partial<ContentItem> & { title: string }): ContentItem {
  return {
    id: patch.title,
    draft: {
      title: patch.title,
      updated_at: '2026-11-03T10:00:00Z',
      derived_from_version_id: null,
    },
    versions: [],
    archived: false,
    disciplineCode: 'strength',
    sessions: null,
    ...patch,
  }
}

describe('the tab an address opens', () => {
  test('the one it names', () => {
    expect(libraryTabFromQuery('programs')).toBe('programs')
    expect(libraryTabFromQuery('movements')).toBe('movements')
  })

  test('the first when it names none, or one that does not exist', () => {
    expect(libraryTabFromQuery(undefined)).toBe('templates')
    expect(libraryTabFromQuery('plans')).toBe('templates')
  })

  test('the first value when the parameter is repeated', () => {
    expect(libraryTabFromQuery(['movements', 'programs'])).toBe('movements')
  })

  test('the address of a tab names it, and the first tab needs no name', () => {
    expect(libraryPath('org')).toBe('/organizations/org/content')
    expect(libraryPath('org', 'programs')).toBe('/organizations/org/content?tab=programs')
  })

  test('a creation address opens the dialog of its tab, and only when asked', () => {
    expect(libraryCreatePath('org', 'movements')).toBe(
      '/organizations/org/content?tab=movements&new=1',
    )
    expect(libraryCreateFromQuery('1', 'movements')).toBe('movements')
    expect(libraryCreateFromQuery(undefined, 'movements')).toBeNull()
    expect(libraryCreateFromQuery('yes', 'movements')).toBeNull()
  })
})

describe('the one state an item shows', () => {
  test('a draft with nothing published is a draft', () => {
    expect(contentStatus(item({ title: 'a' }))).toEqual({ kind: 'draft' })
  })

  test('published names the newest version that can still be assigned', () => {
    const published = item({ title: 'a', versions: [version(3, true), version(2), version(1)] })
    expect(contentStatus(published)).toEqual({ kind: 'published', version: 2 })
  })

  test('only retired versions is not published any more', () => {
    expect(contentStatus(item({ title: 'a', versions: [version(1, true)] }))).toEqual({
      kind: 'retired',
    })
  })

  test('archived wins over everything else', () => {
    expect(contentStatus(item({ title: 'a', archived: true, versions: [version(1)] }))).toEqual({
      kind: 'archived',
    })
  })

  test('the word follows the gender of the kind', () => {
    expect(contentStatusLabel({ kind: 'published', version: 2 }, 'templates')).toBe('Publicada v2')
    expect(contentStatusLabel({ kind: 'published', version: 2 }, 'programs')).toBe('Publicado v2')
    expect(contentStatusLabel({ kind: 'archived' }, 'templates')).toBe('Archivada')
    expect(contentStatusLabel({ kind: 'retired' }, 'programs')).toBe('Retirado')
    expect(contentStatusLabel({ kind: 'draft' }, 'programs')).toBe('Borrador')
  })
})

describe('what the filters keep', () => {
  const strength = item({ title: 'Fuerza tren superior', versions: [version(1)] })
  const mobility = item({ title: 'Movilidad matutina', disciplineCode: 'mobility' })
  const old = item({ title: 'Circuito viejo', archived: true })
  const all = [strength, mobility, old]

  test('with no filter, everything that is not archived', () => {
    expect(filterContent(all, NO_CONTENT_FILTERS).map((entry) => entry.title)).toEqual([
      'Fuerza tren superior',
      'Movilidad matutina',
    ])
    expect(filtersNarrow(NO_CONTENT_FILTERS)).toBe(false)
  })

  test('a name is found whatever its capitals and accents', () => {
    const found = filterContent(all, { ...NO_CONTENT_FILTERS, term: '  MOVIL ' })
    expect(found.map((entry) => entry.title)).toEqual(['Movilidad matutina'])
    expect(
      filterContent([item({ title: 'Natación' })], { ...NO_CONTENT_FILTERS, term: 'natacion' }),
    ).toHaveLength(1)
  })

  test('a discipline keeps only its own', () => {
    const found = filterContent(all, { ...NO_CONTENT_FILTERS, disciplineCode: 'mobility' })
    expect(found.map((entry) => entry.title)).toEqual(['Movilidad matutina'])
  })

  test('drafts and published are told apart', () => {
    expect(
      filterContent(all, { ...NO_CONTENT_FILTERS, state: 'draft' }).map((entry) => entry.title),
    ).toEqual(['Movilidad matutina'])
    expect(
      filterContent(all, { ...NO_CONTENT_FILTERS, state: 'published' }).map((entry) => entry.title),
    ).toEqual(['Fuerza tren superior'])
  })

  test('archived content is shown only when asked for, and then alone', () => {
    const found = filterContent(all, { ...NO_CONTENT_FILTERS, state: 'archived' })
    expect(found.map((entry) => entry.title)).toEqual(['Circuito viejo'])
    expect(filtersNarrow({ ...NO_CONTENT_FILTERS, state: 'archived' })).toBe(true)
  })

  test('a blank search does not count as a filter', () => {
    expect(filtersNarrow({ ...NO_CONTENT_FILTERS, term: '   ' })).toBe(false)
  })
})

describe('where pressing an item leads', () => {
  test('to its draft while it can be edited', () => {
    expect(contentHref('/content/templates', item({ title: 'a', versions: [version(1)] }))).toBe(
      '/content/templates/a',
    )
  })

  test('to its newest version when there is no draft to open', () => {
    const published = item({ title: 'a', draft: null, versions: [version(2), version(1)] })
    expect(contentHref('/content/programs', published)).toBe('/content/programs/a/versions/2')
  })

  test('an archived item is read, never edited', () => {
    const archived = item({ title: 'a', archived: true, versions: [version(1)] })
    expect(contentHref('/content/templates', archived)).toBe('/content/templates/a/versions/1')
  })

  test('nowhere when there is nothing to open', () => {
    expect(contentHref('/content/templates', item({ title: 'a', archived: true }))).toBeUndefined()
  })
})

describe('when it last changed', () => {
  test('the last save of its draft', () => {
    expect(editedAt(item({ title: 'a', versions: [version(1)] }))).toBe('2026-11-03T10:00:00Z')
  })

  test('the newest publication when there is no draft', () => {
    expect(editedAt(item({ title: 'a', draft: null, versions: [version(2), version(1)] }))).toBe(
      '2026-10-02T10:00:00Z',
    )
  })
})

describe('the shape of a program', () => {
  test('counts sessions and weeks, in the singular when there is one', () => {
    expect(programShape({ count: 3, weeks: 2 })).toBe('3 sesiones en 2 semanas')
    expect(programShape({ count: 1, weeks: 1 })).toBe('1 sesión en 1 semana')
  })

  test('says so when there are none', () => {
    expect(programShape({ count: 0, weeks: 0 })).toBe('Sin sesiones')
    expect(programShape(null)).toBe('Sin sesiones')
  })
})
