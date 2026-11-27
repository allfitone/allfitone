import { telemetryScreens, type TelemetryScreen } from '@allfitone/telemetry'
import { describe, expect, test } from 'bun:test'

import { studioScreen } from './studio-screen'

const ORGANIZATION = '/organizations/11111111-1111-4111-8111-111111111111'
const TEAM = `${ORGANIZATION}/team`

/**
 * One address per name the contract declares for Studio: the name, the path
 * and the tab that produce it. The test below holds the two ends together.
 */
const ADDRESSES: readonly (readonly [TelemetryScreen, string, string | null])[] = [
  ['studio.account', '/account', null],
  ['studio.entry', '/', null],
  ['studio.invitation_decision', '/invitations/abc', null],
  ['studio.organization_overview', `${ORGANIZATION}/clients`, null],
  ['studio.team_directory', TEAM, 'members'],
  ['studio.team_invitations', TEAM, 'invitations'],
  ['studio.team_roles', TEAM, 'roles'],
]

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
    expect(studioScreen(`${ORGANIZATION}/content`, 'programs')).toBe('studio.organization_overview')
    expect(studioScreen(`${ORGANIZATION}/clients`)).toBe('studio.organization_overview')
  })

  /*
   * The guard that makes the contract mean something. A declared name nobody
   * sends reads as zero on a dashboard, which is indistinguishable from a
   * screen nobody opens — two names sat that way until this was written. It
   * fails in both directions: a name added to the contract with no address
   * that produces it, and an address here producing a name the contract does
   * not declare.
   */
  test('every Studio name the contract declares is one this app reports', () => {
    const declared = telemetryScreens.filter((name) => name.startsWith('studio.'))
    expect(ADDRESSES.map(([name]) => name).toSorted()).toEqual([...declared].toSorted())

    for (const [name, pathname, tab] of ADDRESSES) {
      expect(studioScreen(pathname, tab)).toBe(name)
    }
  })

  /* `/profile` is a server redirect to `/account`, so nothing mounts there. */
  test('the old profile address is no screen of its own', () => {
    expect(studioScreen('/profile')).toBe('studio.entry')
  })
})
