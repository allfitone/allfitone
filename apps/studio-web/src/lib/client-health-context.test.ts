import { describe, expect, test } from 'bun:test'

import {
  bodyAreaLabel,
  claimHeading,
  claimOriginLine,
  claimPeriodLine,
  contextTypeLabel,
  hasEnded,
  healthSections,
  healthVersionLine,
} from './client-health-context'
import type { ClientHealthContextClaim } from './studio-api'

// Midday in UTC, so the day is the same in Bogotá and on a CI runner.
const NOW = new Date('2026-11-13T15:00:00.000Z')

function claim(overrides: Partial<ClientHealthContextClaim> = {}): ClientHealthContextClaim {
  return {
    id: 'claim-1',
    context_type: 'pain',
    description: 'Me duele al bajar escaleras',
    body_area: 'knee',
    provenance: 'person_declared',
    valid_from: '2026-02-10T15:00:00.000Z',
    valid_to: null,
    ...overrides,
  }
}

describe('the words of a claim', () => {
  test('each of the three types reads as a word, never as its code', () => {
    expect(contextTypeLabel('pain')).toBe('Dolor')
    expect(contextTypeLabel('limitation')).toBe('Limitación')
    expect(contextTypeLabel('recovery')).toBe('Recuperación')
  })

  test('each of the fourteen areas has a name', () => {
    expect(bodyAreaLabel('knee')).toBe('Rodilla')
    expect(bodyAreaLabel('lower_back')).toBe('Espalda baja')
    expect(bodyAreaLabel('wrist_hand')).toBe('Muñeca y mano')
    expect(bodyAreaLabel('ankle_foot')).toBe('Tobillo y pie')
  })

  test('a claim is headed by its type and, when she named one, its area', () => {
    expect(claimHeading(claim())).toBe('Dolor · Rodilla')
    expect(claimHeading(claim({ context_type: 'limitation', body_area: null }))).toBe('Limitación')
  })

  /*
   * The version can withhold the origin. Saying «sin origen» would claim the
   * datum has none, which is the deduction the screen must not make.
   */
  test('an origin the version withholds is left out, not described', () => {
    expect(claimOriginLine(claim())).toBe('Lo declaró ella')
    expect(claimOriginLine(claim({ provenance: 'professional_observation' }))).toBe(
      'Lo observó un profesional',
    )
    expect(claimOriginLine(claim({ provenance: null }))).toBeNull()
  })

  test('the version is said as a sentence', () => {
    expect(healthVersionLine(3)).toBe('Versión 3 del permiso de contexto de salud')
  })
})

describe('when a claim held', () => {
  test('a claim with no end holds now', () => {
    expect(hasEnded(claim(), NOW)).toBe(false)
  })

  test('an end in the past means it no longer holds', () => {
    expect(hasEnded(claim({ valid_to: '2026-03-01T15:00:00.000Z' }), NOW)).toBe(true)
  })

  test('an end still ahead, as a recovery can have, holds until then', () => {
    expect(hasEnded(claim({ valid_to: '2027-01-31T15:00:00.000Z' }), NOW)).toBe(false)
  })

  test('a claim in force reads from when', () => {
    expect(claimPeriodLine(claim(), NOW)).toBe('Desde el 10 de febrero de 2026')
  })

  test('one that ended reads from when until when', () => {
    expect(claimPeriodLine(claim({ valid_to: '2026-03-01T15:00:00.000Z' }), NOW)).toBe(
      'Del 10 de febrero de 2026 al 1 de marzo de 2026',
    )
  })

  test('a recovery with its end ahead says until when', () => {
    expect(
      claimPeriodLine(
        claim({ context_type: 'recovery', valid_to: '2027-01-31T15:00:00.000Z' }),
        NOW,
      ),
    ).toBe('Desde el 10 de febrero de 2026, hasta el 31 de enero de 2027')
  })
})

/*
 * The list includes what no longer holds, and it must: a coach needs to know
 * there was an injury last month. So nothing is filtered — it is sorted into
 * what affects her today, what is healing and what ended.
 */
describe('the sections of the screen', () => {
  const current = claim({ id: 'current' })
  const limitation = claim({ id: 'limitation', context_type: 'limitation', body_area: null })
  const healing = claim({
    id: 'healing',
    context_type: 'recovery',
    valid_to: '2027-01-31T15:00:00.000Z',
  })
  const ended = claim({ id: 'ended', valid_to: '2026-03-01T15:00:00.000Z' })
  const endedRecovery = claim({
    id: 'ended-recovery',
    context_type: 'recovery',
    valid_to: '2026-05-01T15:00:00.000Z',
  })

  test('pains and limitations in force, then recoveries, then whatever ended', () => {
    const sections = healthSections([ended, healing, current, endedRecovery, limitation], NOW)
    expect(sections.map((section) => section.title)).toEqual([
      'Lo que la afecta hoy',
      'En recuperación',
      'Lo que ya terminó',
    ])
    expect(sections.map((section) => section.claims.map((item) => item.id))).toEqual([
      ['current', 'limitation'],
      ['healing'],
      ['ended', 'ended-recovery'],
    ])
  })

  test('nothing is dropped, whichever section it lands in', () => {
    const all = [ended, healing, current, endedRecovery, limitation]
    const drawn = healthSections(all, NOW).flatMap((section) => section.claims)
    expect(drawn).toHaveLength(all.length)
  })

  test('a section with nothing in it is not drawn', () => {
    expect(healthSections([current], NOW).map((section) => section.key)).toEqual(['current'])
    expect(healthSections([], NOW)).toEqual([])
  })
})
