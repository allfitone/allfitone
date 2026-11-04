import { describe, expect, test } from 'bun:test'

import {
  ASSIGNABLE_ROLES,
  canLoseARole,
  canManageRoles,
  canReceiveARole,
  grantableRoles,
  revocableRoles,
  roleGrantRefusalDescription,
  roleGrantRefusalFor,
  roleRevokeRefusalDescription,
  roleRevokeRefusalFor,
  roleRevokeRefusalTitle,
  whatRevokingStopsSentence,
} from './team-roles'
import type { OrganizationMembership, OrganizationRole } from './studio-api'

function member(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    membership_id: '01991600-7000-7000-8000-000000000002',
    display_name: 'Camilo Restrepo',
    status: 'active',
    joined_at: '2025-02-01T10:00:00.000Z',
    ended_at: null,
    roles: ['staff'],
    ...overrides,
  }
}

function catalog(
  entries: Array<{ code: string; capabilities: string[] }>,
): readonly OrganizationRole[] {
  return entries.map(({ code, capabilities }) => ({
    code,
    name: code,
    description: null,
    capabilities: capabilities.map((capability) => ({
      code: capability,
      name: capability,
      description: null,
    })),
  })) as unknown as readonly OrganizationRole[]
}

describe('who may change roles', () => {
  test('a role the catalogue grants the capability to', () => {
    expect(
      canManageRoles(['owner'], catalog([{ code: 'owner', capabilities: ['manage_roles'] }])),
    ).toBe(true)
  })

  test('not a role without it', () => {
    expect(
      canManageRoles(
        ['coach'],
        catalog([{ code: 'coach', capabilities: ['view_assigned_directory'] }]),
      ),
    ).toBe(false)
  })

  // The mapping lives in PostgreSQL. Guessing from the role code before the
  // catalogue arrives would be a second source of truth.
  test('nothing is assumed before the catalogue arrives', () => {
    expect(canManageRoles(['owner'], undefined)).toBe(false)
  })
})

describe('which roles can be given', () => {
  /*
   * Criterion 1. Owner is not a role this command grants at all: ownership
   * moves through a transfer, which is a different story with different
   * consequences, so it never reaches the list.
   */
  test('owner is never offered', () => {
    expect(ASSIGNABLE_ROLES).toEqual(['admin', 'coach', 'staff'])
    expect(grantableRoles(member({ roles: [] }))).not.toContain('owner')
  })

  // Criterion 4: granting a role somebody has does not duplicate it. The
  // command refuses to, and offering it would spend a click to change nothing.
  test('a role the person already holds is not offered', () => {
    expect(grantableRoles(member({ roles: ['coach'] }))).toEqual(['admin', 'staff'])
  })

  test('somebody who holds all three has nothing left to receive', () => {
    expect(canReceiveARole(member({ roles: ['admin', 'coach', 'staff'] }))).toBe(false)
  })

  // A membership that ended takes no new role, so the action is never offered.
  test('a membership that ended takes nothing', () => {
    expect(
      grantableRoles(member({ status: 'terminated', ended_at: '2026-07-30T11:56:08.245Z' })),
    ).toEqual([])
  })
})

describe('what the screen says when the command refuses', () => {
  test('a refusal is not an outage, and offers no retry', () => {
    expect(roleGrantRefusalFor(403)).toBe('not-allowed')
    expect(roleGrantRefusalDescription('not-allowed')).not.toContain('intentarlo otra vez')
  })

  // The server rejects owner by design; the copy says why rather than leaving
  // the reader to guess what was wrong with their choice.
  test('a rejected role explains that ownership moves another way', () => {
    expect(roleGrantRefusalFor(422)).toBe('rejected')
    expect(roleGrantRefusalFor(409)).toBe('rejected')
    expect(roleGrantRefusalDescription('rejected')).toContain('transferencia')
  })

  test('anything else is temporary, and says nobody changed', () => {
    expect(roleGrantRefusalFor(500)).toBe('unavailable')
    expect(roleGrantRefusalDescription('unavailable')).toContain('Nadie cambió de rol')
  })
})

describe('which roles can be taken back', () => {
  // Criterion 1, the mirror of the grant's: ownership never moves this way
  // either, and the contract's path parameter cannot even spell it.
  test('owner is never offered', () => {
    expect(revocableRoles(member({ roles: ['owner', 'admin'] }))).toEqual(['admin'])
  })

  test('only what the person actually holds', () => {
    expect(revocableRoles(member({ roles: ['coach', 'staff'] }))).toEqual(['coach', 'staff'])
  })

  test('a membership that ended gives nothing back', () => {
    expect(
      revocableRoles(member({ status: 'terminated', ended_at: '2026-07-30T11:56:08.245Z' })),
    ).toEqual([])
  })

  // An owner with no other role is offered no action, so the row shows no menu.
  test('an owner with no other role has nothing to lose here', () => {
    expect(canLoseARole(member({ roles: ['owner'] }))).toBe(false)
  })
})

/*
 * Criteria 2 and 3 are one fact seen from two sides, and the sentence has to
 * turn on the same condition the database does: `revoke_membership_role` calls
 * `relationships.end_assignments_for_membership` only when the role is `coach`.
 * One sentence for every role would be false three times out of four.
 */
describe('what revoking stops, which depends on the role', () => {
  test('revoking coach warns the clients go, and do not come back', () => {
    const sentence = whatRevokingStopsSentence('coach', member({ roles: ['coach'] }), 'Diana')

    expect(sentence).toContain('dejan de estar a su cargo')
    expect(sentence).toContain('no se las devuelve')
  })

  // The other half, and the one a careless sentence would lose: what the
  // clients authorized is not revoked, only who may exercise it.
  test('revoking coach says the authorizations survive', () => {
    expect(whatRevokingStopsSentence('coach', member({ roles: ['coach'] }), 'Diana')).toContain(
      'sigue en pie',
    )
  })

  test('revoking admin promises the clients stay when coach remains', () => {
    const sentence = whatRevokingStopsSentence(
      'admin',
      member({ roles: ['admin', 'coach'] }),
      'Diana',
    )

    expect(sentence).toContain('Sigue siendo coach')
    expect(sentence).not.toContain('dejan de estar a su cargo')
  })

  test('somebody who attends nobody is not told about clients at all', () => {
    const sentence = whatRevokingStopsSentence('staff', member({ roles: ['staff'] }), 'Diana')

    expect(sentence).toContain('No atiende a nadie')
    expect(sentence).not.toContain('a su cargo')
  })
})

/*
 * The revocation reuses the grant's status mapping and none of its words. "Ya
 * no está" about a role somebody stopped holding is a different event from the
 * same phrase about a membership that cannot take one, and a test pins that
 * the copy was not simply shared.
 */
describe('what the screen says when the revocation refuses', () => {
  test('404 is a role that was already gone, and asks for a re-read', () => {
    expect(roleRevokeRefusalFor(404)).toBe('gone')
    expect(roleRevokeRefusalTitle('gone')).toBe('Ese rol ya no estaba')
    expect(roleRevokeRefusalDescription('gone')).toContain('Actualiza la lista')
  })

  test('403 is a reader without the capability, and offers no retry', () => {
    expect(roleRevokeRefusalFor(403)).toBe('not-allowed')
    expect(roleRevokeRefusalDescription('not-allowed')).not.toContain('intentarlo otra vez')
  })

  test('a failed connection says nobody lost a role', () => {
    expect(roleRevokeRefusalFor(undefined)).toBe('unavailable')
    expect(roleRevokeRefusalDescription('unavailable')).toContain('Nadie perdió ningún rol')
  })
})
