import { describe, expect, test } from 'bun:test'

import { relationshipPath } from './client-directory'
import { relationshipTabFromQuery } from './relationship-sections'

const ORGANIZATION = '11111111-1111-4111-8111-111111111111'
const RELATIONSHIP = '22222222-2222-4222-8222-222222222222'
const LINK = `/organizations/${ORGANIZATION}/clients/${RELATIONSHIP}`

describe('relationshipTabFromQuery', () => {
  test('reads both sections', () => {
    expect(relationshipTabFromQuery('state')).toBe('state')
    expect(relationshipTabFromQuery('history')).toBe('history')
  })

  test('opens the state when the address names no tab', () => {
    expect(relationshipTabFromQuery(undefined)).toBe('state')
    expect(relationshipTabFromQuery('')).toBe('state')
  })

  test('opens the state for a tab that is not ours, rather than failing', () => {
    expect(relationshipTabFromQuery('historia')).toBe('state')
    expect(relationshipTabFromQuery('HISTORY')).toBe('state')
  })

  // `?tab=history&tab=state` reaches Next as an array.
  test('takes the first when the address repeats the parameter', () => {
    expect(relationshipTabFromQuery(['history', 'state'])).toBe('history')
  })
})

describe('relationshipPath', () => {
  /*
   * The two callers that predate the tabs — the directory and the panel of
   * what needs attention today — pass no tab and must keep landing on the
   * bare address, which is also the sidebar's.
   */
  test('leaves the first tab unnamed, as its older callers expect', () => {
    expect(relationshipPath(ORGANIZATION, RELATIONSHIP)).toBe(LINK)
    expect(relationshipPath(ORGANIZATION, RELATIONSHIP, 'state')).toBe(LINK)
  })

  test('names the history, which is where the old address now redirects', () => {
    expect(relationshipPath(ORGANIZATION, RELATIONSHIP, 'history')).toBe(`${LINK}?tab=history`)
  })

  test('round-trips through the reader', () => {
    for (const tab of ['state', 'history'] as const) {
      const named = new URL(
        relationshipPath(ORGANIZATION, RELATIONSHIP, tab),
        'https://studio.test',
      ).searchParams.get('tab')
      expect(relationshipTabFromQuery(named ?? undefined)).toBe(tab)
    }
  })
})
