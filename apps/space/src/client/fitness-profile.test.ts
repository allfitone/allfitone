/**
 * What has to be true about «Perfil fitness» and «Identidad y acceso» before a pixel is
 * drawn (TECH-43): every datum says where it came from, an unanswered one says so, the
 * discipline stays out while there is only one, and the name a person types is checked
 * the way the server will check it.
 */

import { describe, expect, test } from 'bun:test'

import {
  activeSince,
  contactState,
  daysLine,
  fewEquipmentAtHome,
  fitnessSections,
  identityInitials,
  nameProblem,
  provenanceLine,
  stepDays,
  valueLine,
  versionsLine,
  type FitnessProfile,
  type ProfileEntry,
} from './fitness-profile'

const entry = (over: Partial<ProfileEntry>): ProfileEntry => ({
  attribute_code: 'primary_training_goal',
  values: ['build_muscle'],
  provenance: 'person_declared',
  selected_because: 'declared_by_you',
  valid_from: '2026-08-01T09:00:00.000Z',
  alternatives: [],
  ...over,
})

const profile = (attributes: ProfileEntry[]): FitnessProfile => ({
  biological_sex: 'male',
  attributes,
})

describe('where a datum comes from', () => {
  test('T-SPC-UNIT-FP-01 says who declared it, in words', () => {
    expect(provenanceLine(entry({}))).toBe('Declarado por ti')
    expect(provenanceLine(entry({ provenance: 'professional_observation' }))).toBe(
      'Observado por tu coach',
    )
    expect(provenanceLine(entry({ provenance: 'device_observed' }))).toBe(
      'Medido por un dispositivo',
    )
    expect(provenanceLine(entry({ provenance: 'system_inferred' }))).toBe('Calculado por Allfit')
    expect(provenanceLine(entry({ provenance: 'authority_verified' }))).toBe('Verificado')
  })

  test('T-SPC-UNIT-FP-02 counts the other versions, and says nothing when there are none', () => {
    const other = {
      values: ['experienced'],
      provenance: 'professional_observation' as const,
      valid_from: '2026-09-24T08:00:00.000Z',
    }
    expect(versionsLine(entry({}))).toBeUndefined()
    expect(versionsLine(entry({ alternatives: [other] }))).toBe('+1 versión')
    expect(versionsLine(entry({ alternatives: [other, other] }))).toBe('+2 versiones')
  })
})

describe('what a datum says', () => {
  test('T-SPC-UNIT-FP-03 words every value the way the onboarding named it', () => {
    expect(valueLine('primary_training_goal', ['build_muscle'])).toBe('Construir músculo')
    expect(valueLine('training_experience', ['some_practice'])).toBe('Tengo algo de práctica')
    expect(valueLine('training_days_per_week', ['1'])).toBe('1 día')
    expect(valueLine('training_days_per_week', ['4'])).toBe('4 días')
    expect(valueLine('session_duration', ['45_to_60_min'])).toBe('Entre 45 y 60 min')
    expect(valueLine('session_duration', ['up_to_30_min'])).toBe('Hasta 30 min')
    expect(valueLine('training_place', ['gym'])).toBe('En el gimnasio')
    expect(valueLine('training_place', ['multiple'])).toBe('En varios sitios')
  })

  test('T-SPC-UNIT-FP-04 a set reads as a list, in the order the body is drawn', () => {
    expect(valueLine('focus_areas', ['legs', 'back'])).toBe('Espalda y piernas')
    expect(valueLine('focus_areas', ['whole_body'])).toBe('Todo el cuerpo')
    expect(valueLine('focus_areas', ['legs', 'chest', 'arms'])).toBe('Pecho, brazos y piernas')
    expect(valueLine('available_equipment', ['dumbbell', 'bodyweight', 'bench'])).toBe(
      'Peso corporal, mancuernas y banco',
    )
  })

  test('T-SPC-UNIT-FP-05 a value this app does not know is left out rather than invented', () => {
    expect(valueLine('primary_training_goal', ['fly'])).toBeUndefined()
    expect(valueLine('focus_areas', ['legs', 'wings'])).toBe('Piernas')
  })
})

describe('the sections of «Perfil fitness»', () => {
  test('T-SPC-UNIT-FP-06 lists every question in its section, answered or not', () => {
    const sections = fitnessSections(
      profile([entry({}), entry({ attribute_code: 'training_place', values: ['home'] })]),
    )

    expect(sections.map((section) => section.title)).toEqual([
      'Lo que buscas',
      'Tu punto de partida',
      'Cómo entrenas',
    ])
    expect(sections.flatMap((section) => section.rows.map((row) => row.code))).toEqual([
      'primary_training_goal',
      'focus_areas',
      'training_experience',
      'training_days_per_week',
      'session_duration',
      'training_place',
      'available_equipment',
    ])
    const goal = sections[0]?.rows[0]
    expect(goal).toMatchObject({
      title: 'Objetivo',
      value: 'Construir músculo',
      provenance: 'Declarado por ti',
    })
    const unanswered = sections[0]?.rows[1]
    expect(unanswered).toMatchObject({ title: 'Zonas de foco', value: undefined })
  })

  test('T-SPC-UNIT-FP-07 leaves the discipline out while there is only one (TECH-47)', () => {
    const sections = fitnessSections(
      profile([entry({ attribute_code: 'training_discipline', values: ['strength'] })]),
    )
    const codes = sections.flatMap((section) => section.rows.map((row) => row.code))

    expect(codes).not.toContain('training_discipline')
  })

  test('T-SPC-UNIT-FP-08 a coach observation shown for want of hers keeps its own origin', () => {
    const sections = fitnessSections(
      profile([
        entry({
          attribute_code: 'training_place',
          values: ['gym'],
          provenance: 'professional_observation',
          selected_because: 'most_recent',
        }),
      ]),
    )
    const place = sections[2]?.rows.find((row) => row.code === 'training_place')

    expect(place).toMatchObject({ value: 'En el gimnasio', provenance: 'Observado por tu coach' })
  })
})

describe('how the training week is chosen', () => {
  test('T-SPC-UNIT-FP-09 days stay between one and seven', () => {
    expect(stepDays(undefined, 1)).toBe(3)
    expect(stepDays(4, 1)).toBe(5)
    expect(stepDays(7, 1)).toBe(7)
    expect(stepDays(1, -1)).toBe(1)
    expect(daysLine(1)).toBe('1 día')
    expect(daysLine(6)).toBe('6 días')
  })

  test('T-SPC-UNIT-FP-10 home with little equipment is said, the gym never is', () => {
    expect(fewEquipmentAtHome('home', ['bodyweight', 'dumbbell', 'bench'])).toBe(true)
    expect(fewEquipmentAtHome('home', ['bodyweight', 'dumbbell', 'bench', 'kettlebell'])).toBe(
      false,
    )
    expect(fewEquipmentAtHome('gym', ['bodyweight'])).toBe(false)
    expect(fewEquipmentAtHome(undefined, ['bodyweight'])).toBe(false)
  })
})

describe('«Identidad y acceso»', () => {
  test('T-SPC-UNIT-FP-11 the initials and the date the Fitness ID became active', () => {
    expect(identityInitials('Camila', 'Rojas Díaz')).toBe('CR')
    expect(identityInitials('', '')).toBe('')
    expect(activeSince('2026-07-03T10:05:00.000Z')).toBe('3 jul 2026')
  })

  test('T-SPC-UNIT-FP-12 a name is checked the way the server checks it', () => {
    const ok = { given_name: 'Camila', family_name: 'Rojas', username: 'camila_r' }

    expect(nameProblem(ok)).toBeUndefined()
    expect(nameProblem({ ...ok, given_name: '  ' })).toBe('given_name')
    expect(nameProblem({ ...ok, family_name: 'a'.repeat(81) })).toBe('family_name')
    expect(nameProblem({ ...ok, username: 'ca' })).toBe('username')
    expect(nameProblem({ ...ok, username: '9camila' })).toBe('username')
    expect(nameProblem({ ...ok, username: '@camila_r' })).toBeUndefined()
  })

  test('T-SPC-UNIT-FP-13 each sheet checks only the fields it edits', () => {
    const ok = { given_name: 'Camila', family_name: 'Rojas', username: 'camila_r' }

    expect(nameProblem({ ...ok, username: 'ca' }, ['given_name', 'family_name'])).toBeUndefined()
    expect(nameProblem({ ...ok, family_name: ' ' }, ['given_name', 'family_name'])).toBe(
      'family_name',
    )
    expect(nameProblem({ ...ok, given_name: '' }, ['username'])).toBeUndefined()
    expect(nameProblem({ ...ok, username: '9camila' }, ['username'])).toBe('username')
  })

  test('T-SPC-UNIT-FP-14 a contact is verified, waiting for it, or missing', () => {
    expect(contactState({ value: 'camila@example.test', verified: true })).toBe('verified')
    expect(contactState({ value: '+573105550142', verified: false })).toBe('unverified')
    expect(contactState({ value: null, verified: false })).toBe('missing')
  })
})
