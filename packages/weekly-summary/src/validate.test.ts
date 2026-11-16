import { describe, expect, test } from 'bun:test'

import { documentOf } from './document.js'
import { SummaryError, type WeekDocument, type WeeksLogged } from './port.js'
import { checkSummary, problemsIn } from './validate.js'

const weeks: WeeksLogged = {
  weekStartsOn: '2026-11-09',
  inProgress: false,
  sessions: [
    {
      trainedOn: '2026-11-03',
      durationSeconds: 3000,
      exercises: [
        {
          movementId: 'squat',
          name: 'Sentadilla',
          workSets: 4,
          bestSet: { loadKg: 80, reps: 5 },
          volumeKg: 1600,
          record: false,
        },
      ],
    },
    {
      trainedOn: '2026-11-10',
      durationSeconds: 3300,
      exercises: [
        {
          movementId: 'squat',
          name: 'Sentadilla',
          workSets: 4,
          bestSet: { loadKg: 82.5, reps: 5 },
          volumeKg: 1650,
          record: true,
        },
      ],
    },
  ],
  nutritionDays: [
    {
      date: '2026-11-10',
      meals: 3,
      energyKcal: 2150,
      proteinG: 128,
      carbohydratesG: 240,
      fatG: 70,
    },
  ],
  goal: [{ nutrient: 'protein', minimum: 140, maximum: null, exact: null }],
}

function document(over: Partial<WeeksLogged> = {}): WeekDocument {
  const built = documentOf({ ...weeks, ...over }, 'es')
  if (!built) throw new Error('the fixture has a week')
  return built
}

const answer = {
  overview: 'Entrenaste una vez y registraste tus comidas un día.',
  training: 'El martes hiciste Sentadilla y llegaste a 82,5 kg por 5 repeticiones, una marca tuya.',
  nutrition: 'Promediaste 2150 kcal y 128 g de proteína; tu meta es de al menos 140 g.',
  changes: 'En Sentadilla subiste 2,5 kg frente a la semana anterior.',
}

const reasons = (raw: unknown, doc: WeekDocument = document()): string[] =>
  problemsIn(raw, doc).map((problem) => problem.reason)

describe('what a summary must hold to be shown', () => {
  test('T-WSM-UNIT-28: a summary of what the week has is shown as written', () => {
    expect(checkSummary(answer, document())).toEqual(answer)
  })

  test('T-WSM-UNIT-29: a number the week does not have refuses the summary', () => {
    const invented = { ...answer, training: 'Hiciste Sentadilla con 90 kg.' }
    expect(reasons(invented)).toEqual(['unknown-number'])
    expect(() => checkSummary(invented, document())).toThrow(SummaryError)
  })

  test('T-WSM-UNIT-30: a refusal is closed and says which rule, never the text', () => {
    try {
      checkSummary({ ...answer, overview: 'Entrenaste 37 veces.' }, document())
      throw new Error('it was not refused')
    } catch (cause) {
      expect(cause).toBeInstanceOf(SummaryError)
      expect((cause as SummaryError).failure).toBe('refused')
      expect((cause as SummaryError).reason).toBe('unknown-number')
      expect((cause as SummaryError).message).not.toContain('37 veces')
    }
  })

  test('T-WSM-UNIT-31: nutrition she did not log may not be spoken of', () => {
    const untracked = document({ nutritionDays: [], goal: [] })
    expect(reasons({ ...answer, nutrition: 'Comiste bien.' }, untracked)).toEqual([
      'part-not-logged',
    ])
    expect(reasons({ ...answer, nutrition: null }, untracked)).toEqual([])
  })

  test('T-WSM-UNIT-32: training she did not log may not be spoken of', () => {
    const resting = document({ sessions: [] })
    const said = { ...answer, training: 'Entrenaste con constancia.', changes: null }
    expect(reasons(said, resting)).toEqual(['part-not-logged'])
    expect(reasons({ ...said, training: null }, resting)).toEqual([])
  })

  test('T-WSM-UNIT-33: a part she did log may not be left out', () => {
    expect(reasons({ ...answer, training: null })).toEqual(['part-missing'])
    expect(reasons({ ...answer, nutrition: null })).toEqual(['part-missing'])
  })

  test('T-WSM-UNIT-34: changes need a week before to compare with', () => {
    const first = document({ sessions: weeks.sessions.slice(1) })
    const said = { ...answer, changes: 'Entrenaste más que antes.' }
    expect(reasons(said, first)).toEqual(['part-not-logged'])
    expect(reasons({ ...said, changes: null }, first)).toEqual([])
    expect(reasons({ ...answer, changes: null })).toEqual(['part-missing'])
  })

  test('T-WSM-UNIT-35: an empty or endless part is not a summary', () => {
    expect(reasons({ ...answer, overview: '   ' })).toEqual(['empty'])
    expect(reasons({ ...answer, overview: 'a'.repeat(401) })).toEqual(['too-long'])
    expect(reasons({ ...answer, training: 'a'.repeat(901) })).toEqual(['too-long'])
  })

  test('T-WSM-UNIT-36: another shape is refused before anything is read', () => {
    expect(reasons({ overview: 'Solo esto.' })).toEqual(['shape'])
    expect(reasons({ ...answer, training: 7 })).toEqual(['shape'])
    expect(reasons(null)).toEqual(['shape'])
  })

  test('T-WSM-UNIT-37: a link or markup is not plain text', () => {
    expect(reasons({ ...answer, overview: 'Mira https://example.com para más.' })).toEqual(['link'])
    expect(reasons({ ...answer, overview: 'Entrenaste **una** vez.' })).toEqual(['markup'])
    expect(reasons({ ...answer, overview: '# Tu semana' })).toEqual(['markup'])
  })

  test('T-WSM-UNIT-38: a summary that speaks of health is refused', () => {
    const cases = [
      'Tu ingesta sugiere un trastorno alimentario.',
      'Deberías tomar un suplemento de proteína.',
      'Podrías tener una lesión en la rodilla.',
      'Your intake suggests an eating disorder.',
      'Consulta a tu médico.',
    ]
    for (const overview of cases) {
      expect(reasons({ ...answer, overview })).toEqual(['medical'])
    }
  })

  test('T-WSM-UNIT-39: an exercise is named as she named it, whatever its name says', () => {
    const named = document({
      sessions: [
        {
          trainedOn: '2026-11-10',
          durationSeconds: 1800,
          exercises: [
            {
              movementId: null,
              name: 'Movilidad post-lesión de hombro',
              workSets: 3,
              bestSet: null,
              volumeKg: null,
              record: false,
            },
          ],
        },
      ],
    })
    const said = {
      ...answer,
      training: 'El martes hiciste Movilidad post-lesión de hombro, 3 series.',
      changes: null,
    }
    expect(reasons(said, named)).toEqual([])
  })

  test('T-WSM-UNIT-40: spacing is tidied, and nothing else is touched', () => {
    const spaced = { ...answer, overview: '  Entrenaste una vez.\n\nRegistraste un día.  ' }
    expect(checkSummary(spaced, document()).overview).toBe(
      'Entrenaste una vez. Registraste un día.',
    )
  })

  test('T-WSM-UNIT-41: every broken rule is reported, in the order they are checked', () => {
    const broken = { ...answer, overview: 'Entrenaste 37 veces, mira www.example.com.' }
    expect(reasons(broken)).toEqual(['link', 'unknown-number'])
  })
})
