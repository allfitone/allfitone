import { describe, expect, test } from 'bun:test'

import {
  canArchiveMovements,
  emptyMovementForm,
  movementChanges,
  movementCreateRequest,
  movementFormErrors,
  movementFormFrom,
  movementIssueMessages,
  normalizeMovementName,
  parseAliases,
  type MovementFormDraft,
} from './movement-form'
import type { OrganizationMovement, OrganizationRole } from './studio-api'

const GLOBAL_ID = '01991600-c000-7000-8000-000000000001'

function draft(overrides: Partial<MovementFormDraft> = {}): MovementFormDraft {
  return {
    ...emptyMovementForm(),
    disciplineCode: 'strength',
    name: 'Remo invertido',
    ...overrides,
  }
}

const own: OrganizationMovement = {
  id: '01991600-c000-7000-8000-000000000003',
  discipline_code: 'strength',
  name: 'Remo con mancuerna',
  scope: 'organization',
  archived: false,
  revision: 3,
  aliases: ['Remo unilateral'],
  equipment: ['dumbbell'],
  muscles: [],
  variant_of: {
    id: GLOBAL_ID,
    name: 'Remo con barra',
    relation: 'regression',
    note: 'Para quien aún no carga la barra.',
  },
  name_locked: false,
  demo_url: null,
}

describe('a movement’s name', () => {
  // The same rule as `catalog.normalize_movement_name`: case and spacing only, no accents.
  test('is compared the way the server compares it', () => {
    expect(normalizeMovementName('  Remo   CON mancuerna ')).toBe('remo con mancuerna')
    expect(normalizeMovementName('Presión')).not.toBe(normalizeMovementName('Presion'))
  })
})

describe('other names', () => {
  test('are one per line, trimmed, the empty lines dropped', () => {
    expect(parseAliases('  Remo unilateral \n\n Dumbbell  row \n')).toEqual([
      'Remo unilateral',
      'Dumbbell row',
    ])
  })
})

describe('checking before sending', () => {
  test('asks for a discipline and a name', () => {
    expect(movementFormErrors(draft({ disciplineCode: '', name: '  ' }))).toEqual({
      discipline: 'Elige la disciplina del movimiento.',
      name: 'Escribe el nombre del movimiento.',
    })
  })

  test('refuses an other name that repeats the name or another one', () => {
    expect(movementFormErrors(draft({ aliasesText: 'remo  INVERTIDO' })).aliases).toBe(
      'Un nombre alternativo no puede repetir el nombre ni otro nombre alternativo.',
    )
    expect(movementFormErrors(draft({ aliasesText: 'Australiano\naustraliano' })).aliases).toBe(
      'Un nombre alternativo no puede repetir el nombre ni otro nombre alternativo.',
    )
  })

  test('takes at most ten other names', () => {
    const many = Array.from({ length: 11 }, (_, index) => `Nombre ${index}`).join('\n')
    expect(movementFormErrors(draft({ aliasesText: many })).aliases).toBe(
      'Admite hasta 10 nombres alternativos.',
    )
  })

  test('keeps the variant note short', () => {
    const variant = { movementId: GLOBAL_ID, movementName: 'Remo', relation: 'variant' as const }
    expect(
      movementFormErrors(draft({ variant: { ...variant, note: 'x'.repeat(201) } })).variant,
    ).toBe('La nota de la variante admite hasta 200 caracteres.')
  })

  /*
   * HU-065 criterion 1: once a published version uses it, the name only
   * accepts changes of case and spacing, because the version keeps meaning
   * what it meant when it was written.
   */
  test('a locked name accepts case and spacing, nothing else', () => {
    const locked = { lockedName: 'Remo con mancuerna' }
    expect(movementFormErrors(draft({ name: 'REMO  con Mancuerna' }), locked).name).toBeUndefined()
    expect(movementFormErrors(draft({ name: 'Remo con kettlebell' }), locked).name).toBe(
      'Una versión publicada ya lo usa: el nombre solo admite cambios de mayúsculas o espacios.',
    )
  })
})

describe('creating', () => {
  test('sends the trimmed name, the other names and the variant, and no equipment', () => {
    expect(
      movementCreateRequest(
        draft({
          name: '  Remo   invertido ',
          aliasesText: 'Remo australiano',
          variant: {
            movementId: GLOBAL_ID,
            movementName: 'Remo con barra',
            relation: 'regression',
            note: '  ',
          },
        }),
      ),
    ).toEqual({
      discipline_code: 'strength',
      name: 'Remo invertido',
      aliases: ['Remo australiano'],
      variant: { movement_id: GLOBAL_ID, relation: 'regression', note: null },
    })
  })

  test('sends no variant when there is none', () => {
    expect(movementCreateRequest(draft()).variant).toBeNull()
  })
})

describe('editing', () => {
  test('reads a movement into the form', () => {
    expect(movementFormFrom(own)).toEqual({
      disciplineCode: 'strength',
      name: 'Remo con mancuerna',
      aliasesText: 'Remo unilateral',
      variant: {
        movementId: GLOBAL_ID,
        movementName: 'Remo con barra',
        relation: 'regression',
        note: 'Para quien aún no carga la barra.',
      },
    })
  })

  // A partial edit: what is left out stays as it was, equipment included.
  test('sends only what changed', () => {
    const form = movementFormFrom(own)
    expect(movementChanges(own, form)).toEqual({})
    expect(movementChanges(own, { ...form, aliasesText: 'Remo unilateral\nDumbbell row' })).toEqual(
      {
        aliases: ['Remo unilateral', 'Dumbbell row'],
      },
    )
    expect(movementChanges(own, { ...form, name: ' Remo con mancuerna ' })).toEqual({})
    expect(movementChanges(own, { ...form, variant: null })).toEqual({ variant: null })
  })

  test('sends a changed variant whole', () => {
    const form = movementFormFrom(own)
    expect(
      movementChanges(own, {
        ...form,
        variant: {
          movementId: GLOBAL_ID,
          movementName: 'Remo con barra',
          relation: 'variant',
          note: '',
        },
      }),
    ).toEqual({ variant: { movement_id: GLOBAL_ID, relation: 'variant', note: null } })
  })
})

describe('answering the server', () => {
  test('says what each refusal means', () => {
    expect(movementIssueMessages(['name-taken'])).toEqual([
      'Ya hay un movimiento de tu organización con ese nombre.',
    ])
    expect(movementIssueMessages(['movement-in-use'])).toEqual([
      'Una versión publicada ya lo usa: el nombre solo admite cambios de mayúsculas o espacios, y la disciplina no cambia.',
    ])
    expect(movementIssueMessages(['something-new'])).toEqual([
      'El servidor rechazó un dato del movimiento (something-new).',
    ])
  })
})

describe('who archives', () => {
  const catalog: OrganizationRole[] = [
    {
      code: 'admin',
      name: 'Administrador',
      capabilities: [{ code: 'archive_movements', name: 'Archivar' }],
      fitness_data_access_policy: 'not_granted_by_role',
    },
    {
      code: 'coach',
      name: 'Coach',
      capabilities: [{ code: 'manage_content', name: 'Contenido' }],
      fitness_data_access_policy: 'requires_relationship_assignment_and_grant',
    },
  ]

  // HU-066 is the owner's and the admin's: a coach creates and edits, but does not archive.
  test('is whoever holds archive_movements, which a coach does not', () => {
    expect(canArchiveMovements(['admin'], catalog)).toBe(true)
    expect(canArchiveMovements(['coach'], catalog)).toBe(false)
    expect(canArchiveMovements(['admin'], undefined)).toBe(false)
  })
})
