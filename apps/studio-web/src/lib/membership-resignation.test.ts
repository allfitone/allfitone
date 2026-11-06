import { describe, expect, test } from 'bun:test'

import {
  canResign,
  resignationRefusalDescription,
  resignationRefusalFor,
  resignationRefusalTitle,
  whatResigningLeavesSentence,
  whyResignationUnavailable,
} from './membership-resignation'
import type { Membership } from './studio-api'

// Annotated rather than cast: a cast would let a renamed contract field through.
function mine(overrides: Partial<Membership> = {}): Membership {
  const base: Membership = {
    membership_id: '01991600-7000-7000-8000-000000000002',
    organization_id: '01991600-1000-7000-8000-000000000001',
    display_name: 'Gimnasio Chapinero',
    type_code: 'gym',
    status: 'active',
    joined_at: '2025-02-01T10:00:00.000Z',
    ended_at: null,
    roles: ['coach'],
  }
  return { ...base, ...overrides }
}

describe('who may resign', () => {
  test('an active membership that is not the owner', () => {
    expect(canResign(mine())).toBe(true)
  })

  // Criterion 1. Ownership leaves only through a transfer; resigning it would
  // orphan the gym, and the command raises 22023.
  test('never an owner', () => {
    expect(canResign(mine({ roles: ['owner', 'admin'] }))).toBe(false)
  })

  /*
   * Criterion 2, and the one a role-shaped gate would get wrong. The command
   * asks only that the membership be active and hold no live owner role — not
   * that it keep any role at all. Somebody stripped of every role can still
   * walk away.
   */
  test('somebody with no roles left can still resign', () => {
    expect(canResign(mine({ roles: [] }))).toBe(true)
  })

  test('not a membership that already ended', () => {
    expect(canResign(mine({ status: 'terminated', ended_at: '2026-07-30T11:56:08.245Z' }))).toBe(
      false,
    )
  })
})

describe('why the control is absent', () => {
  test('nothing to say when it is available', () => {
    expect(whyResignationUnavailable(mine())).toBe(null)
  })

  test('names the owner case, which is the only one worth explaining', () => {
    expect(whyResignationUnavailable(mine({ roles: ['owner'] }))).toBe('owner')
  })

  test('names an ended membership', () => {
    expect(whyResignationUnavailable(mine({ status: 'terminated' }))).toBe('already-ended')
  })
})

/*
 * The sentence is written to the person leaving, not about them, and it turns
 * on the same condition the database does: only a coach holds professional
 * assignments, so only a coach leaves clients unattended.
 */
describe('what resigning leaves behind', () => {
  test('a coach is told the clients stay and need reassigning', () => {
    const sentence = whatResigningLeavesSentence(mine({ roles: ['coach'] }))

    expect(sentence).toContain('siguen siendo clientes del gimnasio')
    expect(sentence).toContain('sin profesional responsable')
    expect(sentence).toContain('reasignarlas')
  })

  // The reassuring half: nothing of the client's is revoked or ended.
  test('and what does not happen', () => {
    expect(whatResigningLeavesSentence(mine({ roles: ['coach'] }))).toContain(
      'No se termina ninguna relación ni se revoca ningún permiso',
    )
  })

  test('somebody who attends nobody is not given a worry to carry', () => {
    const sentence = whatResigningLeavesSentence(mine({ roles: ['staff'] }))

    expect(sentence).toContain('No atiendes a nadie')
    expect(sentence).not.toContain('reasignarlas')
  })

  test('an admin who is also a coach is treated as a coach', () => {
    expect(whatResigningLeavesSentence(mine({ roles: ['admin', 'coach'] }))).toContain(
      'sin profesional responsable',
    )
  })

  // Written in second person: it is the reader's own membership, not a row
  // about somebody else, and the administrator's version says "atiende".
  test('it speaks to the reader, not about them', () => {
    expect(whatResigningLeavesSentence(mine({ roles: ['coach'] }))).toContain('atiendes')
  })
})

describe('what the screen says when the command refuses', () => {
  /*
   * There is no 403 here, and that is the point: the command authorises by
   * being you. Anything unmapped is a connection problem, not a permission
   * one, so the copy may safely offer a retry.
   */
  test('an unmapped status is temporary and says you are still a member', () => {
    expect(resignationRefusalFor(403)).toBe('unavailable')
    expect(resignationRefusalFor(undefined)).toBe('unavailable')
    expect(resignationRefusalDescription('unavailable')).toContain('Sigues vinculado')
  })

  test('404 asks for a re-read, because somebody else closed it', () => {
    expect(resignationRefusalFor(404)).toBe('not-found')
    expect(resignationRefusalTitle('not-found')).toBe('Ya no tienes esta vinculación')
    expect(resignationRefusalDescription('not-found')).toContain('Actualiza')
  })

  test('422 explains the transfer, which is the only way out for an owner', () => {
    expect(resignationRefusalFor(422)).toBe('rejected')
    expect(resignationRefusalFor(409)).toBe('rejected')
    expect(resignationRefusalDescription('rejected')).toContain('transferir la propiedad')
  })
})
