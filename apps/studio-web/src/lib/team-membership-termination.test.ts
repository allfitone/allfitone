import { describe, expect, test } from 'bun:test'

import {
  canManageMemberships,
  canTerminateMembership,
  terminationRefusalDescription,
  terminationRefusalFor,
  terminationRefusalTitle,
  whatTerminationLeavesSentence,
  whyTerminationUnavailable,
} from './team-membership-termination'
import { canManageRoles } from './team-roles'
import type { OrganizationMembership, OrganizationRole } from './studio-api'

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

const MINE = '01991600-7000-7000-8000-000000000001'
const SOMEBODY = '01991600-7000-7000-8000-000000000002'

function member(overrides: Partial<OrganizationMembership> = {}): OrganizationMembership {
  return {
    membership_id: SOMEBODY,
    display_name: 'Camilo Restrepo',
    status: 'active',
    joined_at: '2025-02-01T10:00:00.000Z',
    ended_at: null,
    roles: ['coach'],
    ...overrides,
  }
}

/*
 * The two capabilities are separate entries in the catalogue, and the screen
 * gates each action on its own. These tests exist because a refactor that
 * collapsed them into one gate would be invisible: the common case —an owner
 * who holds both— passes either way, and only a role with one and not the
 * other shows the difference.
 */
describe('managing roles and managing memberships are different powers', () => {
  test('a role with only manage_memberships may end a membership and not touch roles', () => {
    const only = catalog([{ code: 'admin', capabilities: ['manage_memberships'] }])

    expect(canManageMemberships(['admin'], only)).toBe(true)
    expect(canManageRoles(['admin'], only)).toBe(false)
  })

  test('a role with only manage_roles may touch roles and not end a membership', () => {
    const only = catalog([{ code: 'admin', capabilities: ['manage_roles'] }])

    expect(canManageRoles(['admin'], only)).toBe(true)
    expect(canManageMemberships(['admin'], only)).toBe(false)
  })

  test('a coach holds neither', () => {
    const coach = catalog([{ code: 'coach', capabilities: ['view_assigned_directory'] }])

    expect(canManageMemberships(['coach'], coach)).toBe(false)
  })

  // The mapping lives in PostgreSQL. Guessing from the role code before the
  // catalogue arrives would be a second source of truth.
  test('nothing is assumed before the catalogue arrives', () => {
    expect(canManageMemberships(['owner'], undefined)).toBe(false)
  })
})

describe('who can be given de baja', () => {
  test('an active member who is somebody else and not the owner', () => {
    expect(canTerminateMembership(member(), MINE)).toBe(true)
  })

  /*
   * Criterion 4. Ownership leaves only through a transfer; the command raises
   * 22023, which arrives as a 422 the reader cannot interpret, so the screen
   * has to refuse first.
   */
  test('never the owner', () => {
    expect(canTerminateMembership(member({ roles: ['owner', 'admin'] }), MINE)).toBe(false)
  })

  /*
   * Not in the story's criteria, and in the function: terminating your own
   * membership raises `own membership is left by resignation`. Leaving is
   * OP-ORG-010, a different command — HU-STUDIO-022.
   */
  test('never yourself, because leaving is a resignation', () => {
    expect(canTerminateMembership(member({ membership_id: MINE }), MINE)).toBe(false)
  })

  test('not a membership that already ended, which would change nothing', () => {
    expect(
      canTerminateMembership(
        member({ status: 'terminated', ended_at: '2026-07-30T11:56:08.245Z' }),
        MINE,
      ),
    ).toBe(false)
  })

  // The owner looking at their own row: both reasons apply and neither wins by
  // accident. Whichever is reported, the action stays absent.
  test('an owner looking at their own row is refused once, not twice', () => {
    const own = member({ membership_id: MINE, roles: ['owner'] })

    expect(canTerminateMembership(own, MINE)).toBe(false)
    expect(whyTerminationUnavailable(own, MINE)).toBe('own-membership')
  })
})

describe('why the action is absent', () => {
  test('nothing to say when it is available', () => {
    expect(whyTerminationUnavailable(member(), MINE)).toBe(null)
  })

  test('names the owner case', () => {
    expect(whyTerminationUnavailable(member({ roles: ['owner'] }), MINE)).toBe('owner')
  })

  test('names an ended membership', () => {
    expect(whyTerminationUnavailable(member({ status: 'terminated' }), MINE)).toBe('already-ended')
  })
})

/*
 * The sentence the dialog exists for, and the one a reader gets backwards in
 * both directions. Only a coach holds professional assignments, so only a coach
 * leaves clients without anybody attending them.
 */
describe('what ending a membership leaves behind', () => {
  test('a coach leaves clients without a responsible professional', () => {
    const sentence = whatTerminationLeavesSentence(member({ roles: ['coach'] }))

    expect(sentence).toContain('siguen siendo clientes del gimnasio')
    expect(sentence).toContain('sin profesional responsable')
    expect(sentence).toContain('reasignarlas')
  })

  // The half that stops an administrator from fearing the wrong thing: the
  // relationships do not end and no permission is revoked.
  test('and says what does not happen', () => {
    expect(whatTerminationLeavesSentence(member({ roles: ['coach'] }))).toContain(
      'No se termina ninguna relación ni se revoca ningún permiso',
    )
  })

  test('a staff member leaves nothing behind, and is told so', () => {
    const sentence = whatTerminationLeavesSentence(member({ roles: ['staff'] }))

    expect(sentence).toContain('No atiende a nadie')
    expect(sentence).not.toContain('reasignarlas')
  })

  test('an admin who is also a coach is treated as a coach', () => {
    expect(whatTerminationLeavesSentence(member({ roles: ['admin', 'coach'] }))).toContain(
      'sin profesional responsable',
    )
  })
})

describe('what the screen says when the command refuses', () => {
  test('403 is a reader without the capability, and offers no retry', () => {
    expect(terminationRefusalFor(403)).toBe('not-allowed')
    expect(terminationRefusalDescription('not-allowed')).not.toContain('intentarlo otra vez')
  })

  test('404 asks for a re-read rather than a retry', () => {
    expect(terminationRefusalFor(404)).toBe('gone')
    expect(terminationRefusalTitle('gone')).toBe('Esta membresía ya no está')
    expect(terminationRefusalDescription('gone')).toContain('Actualiza la lista')
  })

  /*
   * The screen hides the action for all three refusals, so landing here means
   * the list was stale. The copy says that rather than repeating a rule the
   * reader did not break.
   */
  test('422 explains the two commands that are not this one', () => {
    expect(terminationRefusalFor(422)).toBe('rejected')
    expect(terminationRefusalDescription('rejected')).toContain('transferirle la propiedad')
    expect(terminationRefusalDescription('rejected')).toContain('renunciando')
  })

  test('a failed connection says nobody left the team', () => {
    expect(terminationRefusalFor(undefined)).toBe('unavailable')
    expect(terminationRefusalDescription('unavailable')).toContain('Nadie salió del equipo')
  })
})
