import { describe, expect, test } from 'bun:test'

import {
  appliedVersionLine,
  attributeName,
  biologicalSexLine,
  claimValueLine,
  groupClaims,
  provenanceLine,
  readableClaims,
} from './client-training-profile'
import type { ClientProfileClaim } from './studio-api'

function claim(
  partial: Partial<ClientProfileClaim> & { attribute_code: string },
): ClientProfileClaim {
  return {
    id: `019f4900-0000-7000-8000-00000000${Math.random().toString(16).slice(2, 6)}`,
    value_text: null,
    value_numeric: null,
    unit_code: null,
    provenance: 'person_declared',
    valid_from: '2026-10-31T10:00:00.000Z',
    ...partial,
  } as ClientProfileClaim
}

describe('what an attribute is called', () => {
  /*
   * The catalogue's own wording, which is already written for a reader who is
   * not the person. If these ever drift from `identity.profile_attributes`, the
   * catalogue wins.
   */
  test('the database catalogue names it, in a voice that is not hers', () => {
    expect(attributeName('training_place')).toBe('Dónde entrena')
    expect(attributeName('available_equipment')).toBe('Equipo con el que cuenta')
    expect(attributeName('primary_training_goal')).toBe('Objetivo principal de entrenamiento')
  })

  test('a code this copy does not know is handed back, never hidden', () => {
    expect(attributeName('resting_heart_rate')).toBe('resting_heart_rate')
  })
})

describe('what a claim reads as', () => {
  test('a goal is said about her, not in her own voice', () => {
    expect(
      claimValueLine(claim({ attribute_code: 'primary_training_goal', value_text: 'get_fit' })),
    ).toBe('Ponerse en forma')
    expect(
      claimValueLine(claim({ attribute_code: 'primary_training_goal', value_text: 'maintain' })),
    ).toBe('Mantenerse')
  })

  test('an experience level too', () => {
    expect(
      claimValueLine(claim({ attribute_code: 'training_experience', value_text: 'some_practice' })),
    ).toBe('Tiene algo de práctica')
  })

  test('one emphasis zone per claim, because that is how they arrive', () => {
    expect(claimValueLine(claim({ attribute_code: 'focus_areas', value_text: 'glutes' }))).toBe(
      'Glúteos',
    )
    expect(claimValueLine(claim({ attribute_code: 'focus_areas', value_text: 'whole_body' }))).toBe(
      'Todo el cuerpo',
    )
  })

  test('days are counted in words, and one day is not «1 días»', () => {
    expect(
      claimValueLine(claim({ attribute_code: 'training_days_per_week', value_numeric: 1 })),
    ).toBe('1 día')
    expect(
      claimValueLine(claim({ attribute_code: 'training_days_per_week', value_numeric: 4 })),
    ).toBe('4 días')
  })

  test('another number carries its unit when one arrived', () => {
    expect(
      claimValueLine(
        claim({ attribute_code: 'sessions_logged', value_numeric: 12, unit_code: 'x' }),
      ),
    ).toBe('12 x')
    expect(claimValueLine(claim({ attribute_code: 'sessions_logged', value_numeric: 12 }))).toBe(
      '12',
    )
  })

  /*
   * The whole point. `value_text` is gated on its own column in the database, so
   * a claim can name its attribute and carry nothing readable — and showing
   * `some_practice` to a coach would be the defect this returns null to avoid.
   */
  test('nothing readable is null, never the code', () => {
    expect(claimValueLine(claim({ attribute_code: 'training_experience' }))).toBeNull()
  })

  test('a value this copy does not know is shown as it arrived, not dropped', () => {
    expect(
      claimValueLine(claim({ attribute_code: 'primary_training_goal', value_text: 'swim_a_mile' })),
    ).toBe('swim_a_mile')
  })
})

describe('where a claim came from', () => {
  test('said to the coach about her, which is not Space’s wording', () => {
    expect(provenanceLine('person_declared')).toBe('Lo declaró ella')
    expect(provenanceLine('professional_observation')).toBe('Lo observó un profesional')
  })

  test('the fifth one the story does not name is still said', () => {
    expect(provenanceLine('authority_verified')).toBe('Lo verificó una autoridad')
  })

  /*
   * The version gates `provenance` on its own column too. Criterion 2 asks for
   * the origin; when it did not travel, saying so beats defaulting to «declared
   * by her», which would be a claim about her.
   */
  test('an origin that did not travel is said as missing, never guessed', () => {
    expect(provenanceLine(null)).toBe('Sin origen disponible')
  })
})

describe('how the attributes are grouped and ordered', () => {
  const attributes = [
    claim({ attribute_code: 'focus_areas', value_text: 'chest' }),
    claim({ attribute_code: 'focus_areas', value_text: 'back' }),
    claim({ attribute_code: 'training_experience', value_text: 'experienced' }),
    claim({ attribute_code: 'training_discipline', value_text: 'strength' }),
  ]

  test('read in a useful order, not the alphabetical one the server answers in', () => {
    expect(groupClaims(attributes).map((group) => group.code)).toEqual([
      'training_discipline',
      'training_experience',
      'focus_areas',
    ])
  })

  test('coexisting claims stay together, in the order they arrived', () => {
    const zones = groupClaims(attributes).find((group) => group.code === 'focus_areas')
    expect(zones?.claims.map((entry) => entry.value_text)).toEqual(['chest', 'back'])
  })

  test('an attribute this copy does not know goes last rather than disappearing', () => {
    const codes = groupClaims([
      claim({ attribute_code: 'resting_heart_rate', value_numeric: 54 }),
      claim({ attribute_code: 'primary_training_goal', value_text: 'maintain' }),
    ]).map((group) => group.code)
    expect(codes).toEqual(['primary_training_goal', 'resting_heart_rate'])
  })

  test('nothing shared is no groups, which is not the same as no permission', () => {
    expect(groupClaims([])).toEqual([])
  })
})

/*
 * Criterion 4 is about this difference: the group is still shown, because she
 * does share an attribute of that kind and another gym on another version can
 * read it.
 */
describe('which claims of a group have something to show', () => {
  test('none, when the version withheld every value', () => {
    const [group] = groupClaims([claim({ attribute_code: 'training_experience' })])
    expect(group && readableClaims(group)).toEqual([])
  })

  /*
   * The count on screen is the count of these, not of the claims that arrived:
   * a badge counting both put "2 vigentes" above a single line.
   */
  test('only the readable ones, each with the line it shows', () => {
    const [group] = groupClaims([
      claim({ attribute_code: 'focus_areas' }),
      claim({ attribute_code: 'focus_areas', value_text: 'legs' }),
    ])
    const readable = group ? readableClaims(group) : []
    expect(readable.map((entry) => entry.value)).toEqual(['Piernas'])
  })

  test('both, when both travelled', () => {
    const [group] = groupClaims([
      claim({ attribute_code: 'training_experience', value_text: 'experienced' }),
      claim({ attribute_code: 'training_experience', value_text: 'some_practice' }),
    ])
    const readable = group ? readableClaims(group) : []
    expect(readable.map((entry) => entry.value)).toEqual([
      'Tiene experiencia',
      'Tiene algo de práctica',
    ])
  })
})

describe('the rest of the answer', () => {
  test('biological sex is a word, not a code', () => {
    expect(biologicalSexLine('female')).toBe('Mujer')
    expect(biologicalSexLine('male')).toBe('Hombre')
  })

  test('the applied version is a sentence, because a bare number asks a question', () => {
    expect(appliedVersionLine(4)).toBe('Versión 4 del permiso de entrenamiento')
  })
})
