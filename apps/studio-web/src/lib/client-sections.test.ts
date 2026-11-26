import { describe, expect, test } from 'bun:test'

import { clientTabFromQuery, clientsPath } from './client-sections'

const ORGANIZATION = '11111111-1111-4111-8111-111111111111'

describe('clientTabFromQuery', () => {
  test('reads each of the four sections', () => {
    expect(clientTabFromQuery('directory')).toBe('directory')
    expect(clientTabFromQuery('categories')).toBe('categories')
    expect(clientTabFromQuery('authorizations')).toBe('authorizations')
    expect(clientTabFromQuery('proposals')).toBe('proposals')
  })

  test('opens the directory when the address names no tab', () => {
    expect(clientTabFromQuery(undefined)).toBe('directory')
    expect(clientTabFromQuery('')).toBe('directory')
  })

  test('opens the directory for a tab that is not ours, rather than failing', () => {
    expect(clientTabFromQuery('people')).toBe('directory')
    expect(clientTabFromQuery('PROPOSALS')).toBe('directory')
  })

  // `?tab=proposals&tab=directory` reaches Next as an array.
  test('takes the first when the address repeats the parameter', () => {
    expect(clientTabFromQuery(['proposals', 'directory'])).toBe('proposals')
  })
})

describe('clientsPath', () => {
  /*
   * The first tab is left out, as the library and the team leave out theirs:
   * the sidebar entry and the tab it opens on must be one address, or the
   * entry would stop looking current the moment somebody pressed it.
   */
  test('leaves the first tab unnamed and names the other three', () => {
    expect(clientsPath(ORGANIZATION)).toBe(`/organizations/${ORGANIZATION}/clients`)
    expect(clientsPath(ORGANIZATION, 'directory')).toBe(`/organizations/${ORGANIZATION}/clients`)
    expect(clientsPath(ORGANIZATION, 'categories')).toBe(
      `/organizations/${ORGANIZATION}/clients?tab=categories`,
    )
    expect(clientsPath(ORGANIZATION, 'authorizations')).toBe(
      `/organizations/${ORGANIZATION}/clients?tab=authorizations`,
    )
    expect(clientsPath(ORGANIZATION, 'proposals')).toBe(
      `/organizations/${ORGANIZATION}/clients?tab=proposals`,
    )
  })

  test('round-trips through the reader', () => {
    for (const tab of ['directory', 'categories', 'authorizations', 'proposals'] as const) {
      const named = new URL(clientsPath(ORGANIZATION, tab), 'https://studio.test').searchParams.get(
        'tab',
      )
      expect(clientTabFromQuery(named ?? undefined)).toBe(tab)
    }
  })
})
