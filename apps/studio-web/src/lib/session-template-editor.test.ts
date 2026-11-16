import { describe, expect, test } from 'bun:test'

import {
  activityTypeChoices,
  addStep,
  buildDraftContent,
  editorFromContent,
  emptyTarget,
  moveStep,
  removeStep,
  saveIssueMessages,
  type EditorDraft,
  type EditorStep,
} from './session-template-editor.js'
import type { CatalogActivityType, SessionTemplateDraftContent } from './studio-api.js'

const STRENGTH_TYPE = '01991600-b000-7000-8000-000000000001'
const ENDURANCE_TYPE = '01991600-b000-7000-8000-000000000002'
const NO_CONTRACT_TYPE = '01991600-b000-7000-8000-000000000003'
const OTHER_STRENGTH_TYPE = '01991600-b000-7000-8000-000000000004'
const MOVEMENT = '01991600-c000-7000-8000-000000000001'

const activityTypes: CatalogActivityType[] = [
  {
    id: STRENGTH_TYPE,
    discipline_code: 'strength',
    code: 'gym',
    name: 'Gimnasio',
    activity_family: 'strength',
  },
  {
    id: OTHER_STRENGTH_TYPE,
    discipline_code: 'strength',
    code: 'calisthenics',
    name: 'Calistenia',
    activity_family: 'strength',
  },
  {
    id: ENDURANCE_TYPE,
    discipline_code: 'strength',
    code: 'erg',
    name: 'Remo ergómetro',
    activity_family: 'endurance',
  },
  {
    id: NO_CONTRACT_TYPE,
    discipline_code: 'strength',
    code: 'new',
    name: 'Sin contrato',
    activity_family: null,
  },
  {
    id: 'elsewhere',
    discipline_code: 'running',
    code: 'road',
    name: 'Ruta',
    activity_family: 'endurance',
  },
]

let sequence = 0
function key(): string {
  sequence += 1
  return `step-${sequence}`
}

function draft(overrides: Partial<EditorDraft> = {}): EditorDraft {
  return { title: 'Fuerza tren superior', activityTypeId: STRENGTH_TYPE, steps: [], ...overrides }
}

function strengthStep(overrides: Partial<EditorStep> = {}): EditorStep {
  return {
    key: key(),
    movementId: MOVEMENT,
    activityTypeId: null,
    notes: '',
    supersetGroup: null,
    target: emptyTarget('strength'),
    ...overrides,
  }
}

describe('the activity types a template can declare', () => {
  // Criterion 3 starts here: a step's target family comes from the type.
  test('are its discipline’s, and one without a family cannot hold a step', () => {
    const choices = activityTypeChoices(activityTypes, 'strength', [])
    expect(choices.map((choice) => choice.value)).toEqual([
      OTHER_STRENGTH_TYPE,
      STRENGTH_TYPE,
      ENDURANCE_TYPE,
      NO_CONTRACT_TYPE,
    ])
    expect(choices.find((choice) => choice.value === NO_CONTRACT_TYPE)?.disabled).toBe(true)
  })

  test('once steps exist, only a type of the same family is offered', () => {
    const choices = activityTypeChoices(activityTypes, 'strength', [strengthStep()])
    expect(choices.find((choice) => choice.value === OTHER_STRENGTH_TYPE)?.disabled).toBe(false)
    expect(choices.find((choice) => choice.value === ENDURANCE_TYPE)?.disabled).toBe(true)
  })
})

describe('reading a draft into the editor', () => {
  test('keeps steps in position order and what the editor does not change', () => {
    const content: SessionTemplateDraftContent = {
      title: 'Híbrida',
      activity_type_id: STRENGTH_TYPE,
      steps: [
        {
          position: 2,
          movement_id: null,
          activity_type_id: ENDURANCE_TYPE,
          target: {
            family: 'endurance',
            target_duration_seconds: 600,
            target_pace_seconds_per_unit: 300,
            target_pace_unit_code: 'm',
          },
        },
        {
          position: 1,
          movement_id: MOVEMENT,
          superset_group: 1,
          notes: 'Codos pegados',
          target: {
            family: 'strength',
            sets: [
              {
                set_order: 1,
                kind: 'normal',
                target_reps: 8,
                target_load_value: 40,
                target_load_unit_code: 'kg',
              },
            ],
            target_rest_seconds: 90,
          },
        },
      ],
    }

    const editor = editorFromContent(content, key)
    expect(editor.steps.map((step) => step.movementId)).toEqual([MOVEMENT, null])
    expect(editor.steps[0]?.supersetGroup).toBe(1)
    expect(editor.steps[1]?.activityTypeId).toBe(ENDURANCE_TYPE)

    const built = buildDraftContent(editor, activityTypes)
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content.steps[0]).toEqual({
      position: 1,
      movement_id: MOVEMENT,
      activity_type_id: null,
      notes: 'Codos pegados',
      superset_group: 1,
      target: {
        family: 'strength',
        sets: [
          {
            set_order: 1,
            kind: 'normal',
            target_reps: 8,
            target_load_value: 40,
            target_load_unit_code: 'kg',
            target_rpe: null,
          },
        ],
        target_rest_seconds: 90,
      },
    })
    // The pace the editor does not offer survives the round trip untouched.
    expect(built.content.steps[1]?.target).toEqual({
      family: 'endurance',
      target_distance_value: null,
      target_distance_unit_code: null,
      target_duration_seconds: 600,
      target_pace_seconds_per_unit: 300,
      target_pace_unit_code: 'm',
    })
  })

  test('turns an older aggregate strength target into the sets it stands for', () => {
    const editor = editorFromContent(
      {
        title: 'Antigua',
        activity_type_id: STRENGTH_TYPE,
        steps: [
          {
            position: 1,
            target: {
              family: 'strength',
              target_sets: 3,
              target_reps: 10,
              target_load_value: 20,
              target_load_unit_code: 'kg',
            },
          },
        ],
      },
      key,
    )
    const target = editor.steps[0]?.target
    if (target?.family !== 'strength') throw new Error('expected strength')
    expect(target.sets).toHaveLength(3)
    expect(target.sets.every((set) => set.reps === '10' && set.load === '20')).toBe(true)
    expect(target.loadUnit).toBe('kg')
  })
})

describe('what a save sends', () => {
  test('numbers the steps again from one, so a reorder is what is saved', () => {
    const first = strengthStep({ notes: 'primero' })
    const second = strengthStep({ notes: 'segundo' })
    const moved = moveStep([first, second], 1, -1)
    const built = buildDraftContent(draft({ steps: moved }), activityTypes)
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content.steps.map((step) => [step.position, step.notes])).toEqual([
      [1, 'segundo'],
      [2, 'primero'],
    ])
  })

  test('accepts a decimal comma for a load, as it is typed here', () => {
    const step = strengthStep()
    if (step.target.family !== 'strength') throw new Error('expected strength')
    step.target.sets = [{ kind: 'normal', reps: '8', load: '22,5', rpe: '' }]
    const built = buildDraftContent(draft({ steps: [step] }), activityTypes)
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content.steps[0]?.target).toMatchObject({
      sets: [{ target_load_value: 22.5, target_load_unit_code: 'kg', target_rpe: null }],
    })
  })

  test('a set to failure carries no reps, because the contract refuses the contradiction', () => {
    const step = strengthStep()
    if (step.target.family !== 'strength') throw new Error('expected strength')
    step.target.sets = [{ kind: 'to_failure', reps: '12', load: '', rpe: '' }]
    const built = buildDraftContent(draft({ steps: [step] }), activityTypes)
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content.steps[0]?.target).toMatchObject({
      sets: [{ kind: 'to_failure', target_reps: null }],
    })
  })

  test('a draft may be saved half-written: no activity type and no steps', () => {
    const built = buildDraftContent(draft({ activityTypeId: null }), activityTypes)
    expect(built).toEqual({
      content: { title: 'Fuerza tren superior', activity_type_id: null, steps: [] },
    })
  })

  test('is withheld while a value the server would refuse is on the screen', () => {
    const step = strengthStep()
    if (step.target.family !== 'strength') throw new Error('expected strength')
    step.target.sets = [{ kind: 'normal', reps: 'ocho', load: '-2', rpe: '11' }]
    step.target.rest = '4000'
    const built = buildDraftContent(draft({ title: ' ', steps: [step] }), activityTypes)
    if (!('problems' in built)) throw new Error('expected problems')
    expect(built.problems.draft).toEqual(['Escribe el nombre de la plantilla.'])
    expect(built.problems.steps[step.key]).toEqual([
      'Serie 1: las repeticiones son un número entero desde 1.',
      'Serie 1: la carga es un número desde 0.',
      'Serie 1: el esfuerzo percibido va de 0 a 10.',
      'El descanso entre series va de 0 a 3600 segundos.',
    ])
  })

  test('each family asks for what its target cannot be without', () => {
    const endurance = strengthStep({
      activityTypeId: ENDURANCE_TYPE,
      target: emptyTarget('endurance'),
    })
    const interval = strengthStep({ target: emptyTarget('interval') })
    const mobility = strengthStep({ target: emptyTarget('mobility') })
    const built = buildDraftContent(
      draft({ steps: [endurance, interval, mobility] }),
      activityTypes,
    )
    if (!('problems' in built)) throw new Error('expected problems')
    expect(built.problems.steps[endurance.key]).toEqual(['Indica una distancia o una duración.'])
    // The template is strength, so an interval or mobility target is the wrong family.
    expect(built.problems.steps[interval.key]).toContain(
      'Este paso lleva objetivos de fuerza, por su tipo de actividad.',
    )
    expect(built.problems.steps[mobility.key]).toContain(
      'Este paso lleva objetivos de fuerza, por su tipo de actividad.',
    )
  })
})

describe('building the list of steps', () => {
  test('a new step takes the family of the template’s activity type', () => {
    const steps = addStep(draft(), activityTypes, key)
    expect(steps).toHaveLength(1)
    expect(steps[0]?.target.family).toBe('strength')
    if (steps[0]?.target.family !== 'strength') throw new Error('expected strength')
    expect(steps[0].target.sets).toHaveLength(1)
  })

  test('without an activity type there is no step to add', () => {
    expect(addStep(draft({ activityTypeId: null }), activityTypes, key)).toEqual([])
    expect(addStep(draft({ activityTypeId: NO_CONTRACT_TYPE }), activityTypes, key)).toEqual([])
  })

  test('a step leaves the list, and the first cannot move up nor the last down', () => {
    const first = strengthStep()
    const second = strengthStep()
    expect(removeStep([first, second], first.key)).toEqual([second])
    expect(moveStep([first, second], 0, -1)).toEqual([first, second])
    expect(moveStep([first, second], 1, 1)).toEqual([first, second])
  })
})

describe('what a refused save says', () => {
  test('every code the server sends reads as a sentence, once', () => {
    expect(
      saveIssueMessages([
        'title',
        'target-family',
        'target-family',
        'movement',
        'planned-set-order',
      ]),
    ).toEqual([
      'El nombre está vacío o es demasiado largo.',
      'Un objetivo no corresponde al tipo de actividad de su paso.',
      'Un movimiento ya no está disponible o no es de la disciplina de la plantilla.',
      'Las series de un paso tienen que ir numeradas en orden.',
    ])
  })

  test('a code without wording is still said, generically, rather than dropped', () => {
    expect(saveIssueMessages(['something-new'])).toEqual([
      'El servidor rechazó un valor del borrador (something-new).',
    ])
  })
})
