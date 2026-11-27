import { describe, expect, test } from 'bun:test'

import {
  accessLevelLabel,
  grantStatusLabel,
  grantStatusTone,
  orderGrants,
  readerAttendsHer,
  substitutionStatusLabel,
} from './relationship-state'
import type { RelationshipGrant, RelationshipState, RelationshipSubstitution } from './studio-api'

function grant(overrides: Partial<RelationshipGrant> = {}): RelationshipGrant {
  return {
    grant_id: '01991600-7000-7000-8000-000000000401',
    scope_code: 'body_progress',
    display_name: 'Progreso corporal',
    version_number: 1,
    access_level: 'read',
    status: 'active',
    purpose: 'Seguir su progreso',
    granted_at: '2026-03-04T15:14:02.000Z',
    revoked_at: null,
    ...overrides,
  }
}

describe('how permissions are ordered', () => {
  test('the ones in force come first', () => {
    const ordered = orderGrants([
      grant({ grant_id: 'a', scope_code: 'health_context', status: 'revoked' }),
      grant({ grant_id: 'b', scope_code: 'relationship_training', status: 'active' }),
    ])
    expect(ordered.map((entry) => entry.grant_id)).toEqual(['b', 'a'])
  })

  /*
   * Most the organization can still do, first. Sorting the two stopped states
   * alphabetically instead put "Retirado" — where the gym has nothing — above
   * "Sin nuevos datos", where it keeps what it already had.
   */
  test('what the organization still holds outranks what it lost', () => {
    const ordered = orderGrants([
      grant({ grant_id: 'a', scope_code: 'body_progress', status: 'revoked' }),
      grant({ grant_id: 'b', scope_code: 'health_context', status: 'frozen' }),
    ])
    expect(ordered.map((entry) => entry.grant_id)).toEqual(['b', 'a'])
  })

  // A permission that stopped is the record that somebody said no. Dropping it
  // would hide the decision rather than report it.
  test('the ones that stopped are kept, not dropped', () => {
    const ordered = orderGrants([
      grant({ grant_id: 'a', status: 'revoked' }),
      grant({ grant_id: 'b', status: 'frozen' }),
    ])
    expect(ordered).toHaveLength(2)
  })

  test('within the same state they read in a stable order', () => {
    const ordered = orderGrants([
      grant({ grant_id: 'b', scope_code: 'nutrition_intake' }),
      grant({ grant_id: 'a', scope_code: 'body_progress' }),
    ])
    expect(ordered.map((entry) => entry.grant_id)).toEqual(['a', 'b'])
  })

  test('ordering leaves the given list alone', () => {
    const grants = [grant({ grant_id: 'a', status: 'revoked' }), grant({ grant_id: 'b' })]
    orderGrants(grants)
    expect(grants.map((entry) => entry.grant_id)).toEqual(['a', 'b'])
  })
})

describe('the words on a permission', () => {
  test('a frozen permission is named by what it means, not by the mechanism', () => {
    expect(grantStatusLabel('frozen')).toBe('Sin nuevos datos')
    expect(grantStatusLabel('frozen')).not.toContain('ongel')
  })

  test('only a live permission reads as a success', () => {
    expect(grantStatusTone('active')).toBe('success')
    expect(grantStatusTone('frozen')).toBe('secondary')
    expect(grantStatusTone('revoked')).toBe('secondary')
  })

  /*
   * `contribute` is more than reading: the organization may write into the
   * person's record. Saying only "lectura" for both would understate what the
   * person agreed to.
   */
  test('being able to write is said, not implied', () => {
    expect(accessLevelLabel('contribute')).toBe('Puede leer y registrar')
    expect(accessLevelLabel('read')).toBe('Solo lectura')
  })
})

describe('the words on a substitution', () => {
  test('one nobody has answered says it is waiting', () => {
    expect(substitutionStatusLabel('proposed')).toBe('Esperando respuesta')
  })
})

const COACH = '01991600-7000-7000-8000-000000000002'
const COVER = '01991600-7000-7000-8000-000000000003'
const STRANGER = '01991600-7000-7000-8000-000000000009'

function cover(overrides: Partial<RelationshipSubstitution> = {}): RelationshipSubstitution {
  return {
    assignment_id: '01991600-7000-7000-8000-000000000302',
    membership_id: COVER,
    professional_person_id: '01991600-7000-7000-8000-000000000203',
    display_name: 'Daniela Hoyos',
    status: 'active',
    valid_from: '2026-10-10T00:00:00.000Z',
    ends_on: '2026-10-24',
    accepted_by_person_at: '2026-10-09T18:00:00.000Z',
    ...overrides,
  }
}

function link(
  overrides: Partial<Pick<RelationshipState, 'status' | 'holder' | 'substitutions'>> = {},
): Pick<RelationshipState, 'status' | 'holder' | 'substitutions'> {
  return {
    status: 'active',
    holder: {
      assignment_id: '01991600-7000-7000-8000-000000000301',
      membership_id: COACH,
      professional_person_id: '01991600-7000-7000-8000-000000000202',
      display_name: 'Camilo Restrepo',
      valid_from: '2025-03-05T09:00:00.000Z',
    },
    substitutions: [],
    ...overrides,
  }
}

/*
 * The predicate behind the way through to her card. Each case is one the card
 * read answers differently, so getting it wrong either hides a screen somebody
 * owns or offers a link that answers `404`.
 */
describe('whether the reader attends her', () => {
  test('the professional in charge does', () => {
    expect(readerAttendsHer(link(), COACH)).toBe(true)
  })

  test('somebody covering for them does, once she has accepted it', () => {
    expect(readerAttendsHer(link({ substitutions: [cover()] }), COVER)).toBe(true)
  })

  test('a cover nobody has answered grants nothing yet', () => {
    const waiting = cover({ status: 'proposed', accepted_by_person_at: null })
    expect(readerAttendsHer(link({ substitutions: [waiting] }), COVER)).toBe(false)
  })

  test('a cover that is over stops counting', () => {
    expect(readerAttendsHer(link({ substitutions: [cover({ status: 'ended' })] }), COVER)).toBe(
      false,
    )
  })

  /*
   * The card still answers a former coach for thirty days and then stops, so a
   * link offered here would work for a month and die without anything changing
   * on screen.
   */
  test('a terminated link offers nothing, not even to the coach who held it', () => {
    expect(readerAttendsHer(link({ status: 'terminated' }), COACH)).toBe(false)
  })

  test('an administrator who attends nobody does not', () => {
    expect(readerAttendsHer(link({ substitutions: [cover()] }), STRANGER)).toBe(false)
  })

  test('nobody attends her yet, so nobody reads her card', () => {
    expect(readerAttendsHer(link({ holder: null }), COACH)).toBe(false)
  })
})
