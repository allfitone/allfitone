import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { ApiError } from './api-error'
import {
  addDays,
  canSaveDraft,
  claimCaption,
  claimInput,
  claimTitle,
  daysBetween,
  deletionNote,
  draftOf,
  EMPTY_DRAFT,
  healthSections,
  relativeDayLine,
  saveFailure,
  sinceDate,
  wheelOffsets,
  type HealthClaim,
  type HealthDraft,
} from './health-context'

const es = textFor('es')
const en = textFor('en')

// A Wednesday in the afternoon, where the person is.
const NOW = new Date(2026, 10, 11, 15, 30)

function claim(overrides: Partial<HealthClaim>): HealthClaim {
  return {
    id: '019f7000-0000-7000-8000-000000000501',
    context_type: 'pain',
    description: 'La derecha. Me duele al bajar en sentadilla.',
    body_area: 'knee',
    provenance: 'person_declared',
    valid_from: new Date(2026, 8, 29).toISOString(),
    valid_to: null,
    recorded_at: new Date(2026, 8, 29).toISOString(),
    ...overrides,
  }
}

describe('the list of «Dolor y limitaciones» (PF-7, PF-7b)', () => {
  test('T-SPC-UNIT-HEALTH-01 pains and limitations, then what heals, then what ended', () => {
    const pain = claim({ id: 'a' })
    const limit = claim({ id: 'b', context_type: 'limitation', body_area: 'shoulder' })
    const healing = claim({
      id: 'c',
      context_type: 'recovery',
      valid_to: new Date(2026, 11, 15).toISOString(),
    })
    const healed = claim({
      id: 'd',
      context_type: 'recovery',
      valid_to: new Date(2026, 9, 30).toISOString(),
    })

    const sections = healthSections([pain, limit, healing, healed], NOW)

    expect(sections.active.map((one) => one.id)).toEqual(['a', 'b'])
    expect(sections.healing.map((one) => one.id)).toEqual(['c'])
    expect(sections.ended.map((one) => one.id)).toEqual(['d'])
  })

  test('T-SPC-UNIT-HEALTH-02 a row is named by its area, or by its type without one', () => {
    expect(claimTitle(claim({}), es.health)).toBe('Rodilla')
    expect(claimTitle(claim({ body_area: 'wrist_hand' }), es.health)).toBe('Muñeca y mano')
    expect(claimTitle(claim({ body_area: null, context_type: 'limitation' }), es.health)).toBe(
      'Limitación',
    )
  })

  test('T-SPC-UNIT-HEALTH-03 under it, since when and her words; or when it ended', () => {
    expect(claimCaption(claim({}), NOW, es)).toBe(
      'Desde el 29 sep · La derecha. Me duele al bajar en sentadilla.',
    )
    expect(
      claimCaption(
        claim({ context_type: 'recovery', valid_to: new Date(2026, 9, 30).toISOString() }),
        NOW,
        es,
      ),
    ).toBe('Recuperación · terminó el 30 oct')
    expect(
      claimCaption(claim({ valid_from: new Date(2025, 2, 3).toISOString() }), NOW, es),
    ).toMatch(/^Desde el 3 mar 2025 · /)
  })
})

describe('since when, as local days (PF-E19b, PF-E19e)', () => {
  test('T-SPC-UNIT-HEALTH-04 today, this week from Monday, this month from the first', () => {
    expect(sinceDate('today', NOW)).toEqual(new Date(2026, 10, 11))
    expect(sinceDate('week', NOW)).toEqual(new Date(2026, 10, 9))
    expect(sinceDate('month', NOW)).toEqual(new Date(2026, 10, 1))
    expect(sinceDate('week', new Date(2026, 10, 15, 9))).toEqual(new Date(2026, 10, 9))
  })

  test('T-SPC-UNIT-HEALTH-05 the wheel runs two years back for a start, a year ahead for an end', () => {
    const since = wheelOffsets('since')
    const until = wheelOffsets('until')

    expect([since[0], since.at(-1), since.length]).toEqual([-730, 0, 731])
    expect([until[0], until.at(-1)]).toEqual([1, 365])
    expect(daysBetween(addDays(NOW, -33), NOW)).toBe(33)
    expect(relativeDayLine(-33, es.health)).toBe('Hace 33 días')
    expect(relativeDayLine(0, es.health)).toBe('Hoy')
    expect(relativeDayLine(12, es.health)).toBe('En 12 días')
  })
})

describe('the draft (PF-E19b, PF-E19d, PF-E21)', () => {
  const pain: HealthDraft = { ...EMPTY_DRAFT, type: 'pain', description: '  Me duele.  ' }

  test('T-SPC-UNIT-HEALTH-06 it needs a type and her words, trimmed, at most 500', () => {
    expect(canSaveDraft(EMPTY_DRAFT, NOW)).toBe(false)
    expect(canSaveDraft({ ...pain, type: undefined }, NOW)).toBe(false)
    expect(canSaveDraft({ ...pain, description: '   ' }, NOW)).toBe(false)
    expect(canSaveDraft({ ...pain, description: 'x'.repeat(501) }, NOW)).toBe(false)
    expect(canSaveDraft(pain, NOW)).toBe(true)
  })

  test('T-SPC-UNIT-HEALTH-07 only a recovery sends an end, and it comes after the start', () => {
    const until = new Date(2026, 11, 15)

    expect(claimInput({ ...pain, until }, NOW)).toEqual({
      context_type: 'pain',
      description: 'Me duele.',
      body_area: null,
      valid_from: new Date(2026, 10, 11).toISOString(),
      valid_to: null,
    })
    expect(claimInput({ ...pain, type: 'recovery', until }, NOW)?.valid_to).toBe(
      until.toISOString(),
    )
    expect(
      canSaveDraft(
        { ...pain, type: 'recovery', since: 'today', until: new Date(2026, 10, 1) },
        NOW,
      ),
    ).toBe(false)
  })

  test('T-SPC-UNIT-HEALTH-08 another day is the one chosen on the wheel', () => {
    const chosen = new Date(2026, 9, 9)

    expect(canSaveDraft({ ...pain, since: 'other', sinceDay: null }, NOW)).toBe(false)
    expect(claimInput({ ...pain, since: 'other', sinceDay: chosen }, NOW)?.valid_from).toBe(
      chosen.toISOString(),
    )
  })

  test('T-SPC-UNIT-HEALTH-09 correcting starts from the claim as it stands', () => {
    const healing = claim({
      context_type: 'recovery',
      valid_from: new Date(2026, 7, 20, 10).toISOString(),
      valid_to: new Date(2026, 11, 15).toISOString(),
    })

    expect(draftOf(healing)).toEqual({
      type: 'recovery',
      area: 'knee',
      description: 'La derecha. Me duele al bajar en sentadilla.',
      since: 'other',
      sinceDay: new Date(2026, 7, 20),
      until: new Date(2026, 11, 15),
    })
    expect(draftOf(claim({ valid_to: new Date(2026, 11, 1).toISOString() })).until).toBeNull()
  })
})

describe('what a refusal says (PF-E20b, PF-E21)', () => {
  test('T-SPC-UNIT-HEALTH-10 a hold, a claim that is gone, no connection, anything else', () => {
    expect(saveFailure(new ApiError('conflict'), es)).toMatch(/retención legal/)
    expect(saveFailure(new ApiError('not-found'), es)).toBe(
      'Ese registro ya no está. Vuelve a tu lista.',
    )
    expect(saveFailure(new ApiError('unavailable'), es)).toMatch(/No pudimos conectar/)
    expect(saveFailure(new Error('boom'), es)).toBe('No pudimos guardarlo. Inténtalo otra vez.')
  })

  test('T-SPC-UNIT-HEALTH-11 a deletion a hold keeps says until when; a deleted one says nothing', () => {
    const base = {
      health_context_claim_id: '019f7000-0000-7000-8000-000000000501',
      disposition_case_id: '019f7000-0000-7000-8000-000000000901',
    }

    expect(deletionNote({ ...base, status: 'deleted', hold: null }, NOW, es)).toBeUndefined()
    expect(
      deletionNote(
        {
          ...base,
          status: 'suspended',
          hold: { reason_code: 'judicial_order', valid_to: new Date(2027, 0, 31).toISOString() },
        },
        NOW,
        es,
      ),
    ).toBe(
      'Una retención legal mantiene tus datos de salud hasta el 31 ene 2027. Lo eliminamos en cuanto termine.',
    )
    expect(deletionNote({ ...base, status: 'pending', hold: null }, NOW, es)).toBe(
      'Lo eliminamos en unos minutos.',
    )
  })
})

describe('«Dolor y limitaciones» in English (TECH-44)', () => {
  test('T-SPC-UNIT-400 a row reads its area, its type and its dates in English', () => {
    expect(claimTitle(claim({ body_area: 'wrist_hand' }), en.health)).toBe('Wrist and hand')
    expect(claimTitle(claim({ body_area: null, context_type: 'recovery' }), en.health)).toBe(
      'Recovery',
    )
    expect(claimCaption(claim({}), NOW, en)).toBe(
      'Since Sep 29 · La derecha. Me duele al bajar en sentadilla.',
    )
    expect(
      claimCaption(
        claim({ context_type: 'recovery', valid_to: new Date(2025, 9, 30).toISOString() }),
        NOW,
        en,
      ),
    ).toBe('Recovery · ended Oct 30, 2025')
  })

  test('T-SPC-UNIT-401 relative days, refusals and a held deletion in English', () => {
    expect(relativeDayLine(-1, en.health)).toBe('Yesterday')
    expect(relativeDayLine(-33, en.health)).toBe('33 days ago')
    expect(relativeDayLine(12, en.health)).toBe('In 12 days')
    expect(saveFailure(new Error('boom'), en)).toBe("We couldn't save it. Please try again.")
    expect(
      deletionNote(
        {
          health_context_claim_id: '019f7000-0000-7000-8000-000000000501',
          disposition_case_id: '019f7000-0000-7000-8000-000000000901',
          status: 'suspended',
          hold: { reason_code: 'judicial_order', valid_to: new Date(2027, 0, 31).toISOString() },
        },
        NOW,
        en,
      ),
    ).toBe(
      "A legal hold keeps your health data until Jan 31, 2027. We'll delete it as soon as it ends.",
    )
  })
})
