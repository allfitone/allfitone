import { describe, expect, test } from 'bun:test'

import { studioScreen } from './studio-screen'

const TEAM = '/organizations/11111111-1111-4111-8111-111111111111/team'

describe('studioScreen', () => {
  /*
   * The reason this function takes the tab at all: the three sections share
   * one address, so a name read from the path alone would report the directory
   * for all three and two of the four contract names would stop firing.
   */
  test('tells the three team sections apart by the tab the address names', () => {
    expect(studioScreen(TEAM, 'members')).toBe('studio.team_directory')
    expect(studioScreen(TEAM, 'invitations')).toBe('studio.team_invitations')
    expect(studioScreen(TEAM, 'roles')).toBe('studio.team_roles')
  })

  test('reports the directory for the team with no tab named', () => {
    expect(studioScreen(TEAM)).toBe('studio.team_directory')
    expect(studioScreen(TEAM, null)).toBe('studio.team_directory')
    expect(studioScreen(TEAM, 'nonsense')).toBe('studio.team_directory')
  })

  /*
   * Inviting is a dialog over the invitations, not a screen, and the button
   * that opens it never touches the address. The old form address redirects
   * into the invitations, so that is what it reports.
   */
  test('reports the invitations for the address the form used to have', () => {
    expect(studioScreen(`${TEAM}/invitations/new`, 'invitations')).toBe('studio.team_invitations')
  })

  test('names the account, an invitation decision and the entry', () => {
    expect(studioScreen('/account', 'preferences')).toBe('studio.account')
    expect(studioScreen('/invitations/abc')).toBe('studio.invitation_decision')
    expect(studioScreen('/')).toBe('studio.entry')
  })

  /* Every other workspace screen shares one name; only the team is resolved. */
  test('reports the overview for a workspace screen that is not the team', () => {
    const base = '/organizations/11111111-1111-4111-8111-111111111111'
    expect(studioScreen(`${base}/content`, 'programs')).toBe('studio.organization_overview')
    expect(studioScreen(`${base}/clients`)).toBe('studio.organization_overview')
  })
})
