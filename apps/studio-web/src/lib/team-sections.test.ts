import { describe, expect, test } from 'bun:test'

import { teamInvitationFormPath, teamPath, teamTabFromQuery } from './team-sections'

const ORGANIZATION = '11111111-1111-4111-8111-111111111111'

describe('teamTabFromQuery', () => {
  test('reads each of the three sections', () => {
    expect(teamTabFromQuery('members')).toBe('members')
    expect(teamTabFromQuery('invitations')).toBe('invitations')
    expect(teamTabFromQuery('roles')).toBe('roles')
  })

  /*
   * Unlike the account, nothing here depends on who is reading, so an address
   * that names no section opens the first one instead of answering nothing.
   */
  test('opens the members when the address names no tab', () => {
    expect(teamTabFromQuery(undefined)).toBe('members')
    expect(teamTabFromQuery('')).toBe('members')
  })

  test('opens the members for a tab that is not ours, rather than failing', () => {
    expect(teamTabFromQuery('permissions')).toBe('members')
    expect(teamTabFromQuery('ROLES')).toBe('members')
  })

  // `?tab=roles&tab=members` reaches Next as an array.
  test('takes the first when the address repeats the parameter', () => {
    expect(teamTabFromQuery(['roles', 'members'])).toBe('roles')
  })
})

describe('teamPath', () => {
  /*
   * The first tab is left out of the address, as the library leaves out its
   * own: the sidebar entry and the tab it opens on must be one address, or the
   * entry would stop looking current the moment somebody pressed it.
   */
  test('leaves the first tab unnamed and names the other two', () => {
    expect(teamPath(ORGANIZATION)).toBe(`/organizations/${ORGANIZATION}/team`)
    expect(teamPath(ORGANIZATION, 'members')).toBe(`/organizations/${ORGANIZATION}/team`)
    expect(teamPath(ORGANIZATION, 'invitations')).toBe(
      `/organizations/${ORGANIZATION}/team?tab=invitations`,
    )
    expect(teamPath(ORGANIZATION, 'roles')).toBe(`/organizations/${ORGANIZATION}/team?tab=roles`)
  })

  test('round-trips through the reader', () => {
    for (const tab of ['members', 'invitations', 'roles'] as const) {
      const named = new URL(teamPath(ORGANIZATION, tab), 'https://studio.test').searchParams.get(
        'tab',
      )
      expect(teamTabFromQuery(named ?? undefined)).toBe(tab)
    }
  })
})

describe('teamInvitationFormPath', () => {
  test('leads to the form of the organization it was asked about', () => {
    expect(teamInvitationFormPath(ORGANIZATION)).toBe(
      `/organizations/${ORGANIZATION}/team/invitations/new`,
    )
  })
})
