import { describe, expect, test } from 'bun:test'

import {
  assignPermission,
  assignPermissionNote,
  assignmentConsequences,
  assignmentDraftError,
  assignmentOutcome,
  assignmentRequest,
  assignmentWriteFailure,
  initialAssignmentDraft,
  plantedZone,
  retiredTemplatesNote,
  versionChoiceLabel,
} from './client-program-assignment'
import type { ProposableVersion } from './program-versions'
import { StudioApiError, type ProgramAssignment, type RelationshipAssignment } from './studio-api'

function version(partial: Partial<ProposableVersion> = {}): ProposableVersion {
  return {
    version_id: '019f4900-0000-7000-8000-00000000f001',
    program_id: '019f4900-0000-7000-8000-00000000f000',
    title: 'Fuerza general',
    version_number: 1,
    session_count: 6,
    repeats_forever: false,
    deprecated_template_version_ids: [],
    ...partial,
  }
}

function assignment(partial: Partial<RelationshipAssignment>): RelationshipAssignment {
  return {
    id: '019f4900-0000-7000-8000-00000000e001',
    status: 'active',
    program_version: {
      id: 'v',
      program_id: 'p',
      version_number: 1,
      title: 'Programa',
      repeats_forever: false,
    },
    starts_on: '2026-10-05',
    timezone: 'America/Bogota',
    assigned_at: '2026-10-02T14:20:00.000Z',
    management: null,
    sessions: [],
    adjustments: [],
    ...partial,
  } as RelationshipAssignment
}

function created(partial: Partial<ProgramAssignment>): ProgramAssignment {
  return {
    id: '019f4900-0000-7000-8000-00000000e009',
    status: 'active',
    origin_relationship_id: '019f4900-0000-7000-8000-000000000101',
    program_version_id: '019f4900-0000-7000-8000-00000000f001',
    starts_on: '2026-11-17',
    timezone: 'America/Bogota',
    management: {
      relationship_id: '019f4900-0000-7000-8000-000000000101',
      since: '2026-11-13T10:00:00.000Z',
    },
    planned_sessions_created: 24,
    schedule_overlaps: false,
    ...partial,
  } as ProgramAssignment
}

describe('whether this coach may assign at all', () => {
  const section = (scope_code: string, access_level: string) => ({ scope_code, access_level })

  test('training at contribute is the only yes', () => {
    expect(assignPermission([section('relationship_training', 'contribute')])).toBe('granted')
    expect(assignPermissionNote('granted')).toBeNull()
  })

  /*
   * The two noes are kept apart because the coach can act on one of them: he
   * can ask her to raise the level, which he cannot do about a category she
   * never shared.
   */
  test('training at read is a different no from no training at all', () => {
    expect(assignPermission([section('relationship_training', 'read')])).toBe('read-only')
    expect(assignPermission([section('body_progress', 'contribute')])).toBe('absent')
    expect(assignPermissionNote('read-only')).toContain('solo para leerlo')
    expect(assignPermissionNote('absent')).toContain('No te autorizó su entrenamiento')
  })

  /* Criterion 1: whichever no it is, the missing permission is named. */
  test('both noes name the permission and its level', () => {
    for (const permission of ['read-only', 'absent'] as const) {
      const note = assignPermissionNote(permission)
      expect(note).toContain('entrenamiento')
      expect(note).toContain('registro')
    }
  })
})

describe('how a version reads in the picker', () => {
  test('a finite one says how many sessions it has', () => {
    expect(versionChoiceLabel(version({ version_number: 3, session_count: 24 }))).toBe(
      'Fuerza general · versión 3 · 24 sesiones',
    )
  })

  test('one session reads as one', () => {
    expect(versionChoiceLabel(version({ session_count: 1 }))).toContain('1 sesión')
  })

  /*
   * The point of the whole distinction: an open-ended version's session count
   * is its week, not its total, so saying it would be read as the program's
   * length.
   */
  test('an open-ended one says it has no end, and never a count', () => {
    const label = versionChoiceLabel(version({ repeats_forever: true, session_count: 4 }))
    expect(label).toBe('Fuerza general · versión 1 · sin fecha de final')
    expect(label).not.toContain('4')
  })
})

describe('a version that keeps retired templates', () => {
  test('none is no note at all', () => {
    expect(retiredTemplatesNote(version({}))).toBeNull()
  })

  test('one and several are said in their own number', () => {
    expect(retiredTemplatesNote(version({ deprecated_template_version_ids: ['a'] }))).toBe(
      'Incluye una plantilla que ya fue retirada.',
    )
    expect(retiredTemplatesNote(version({ deprecated_template_version_ids: ['a', 'b'] }))).toBe(
      'Incluye 2 plantillas que ya fueron retiradas.',
    )
  })
})

describe('the zone her day is read in', () => {
  test('the newest assignment wins, because it is her zone most recently', () => {
    const resolved = plantedZone(
      [
        assignment({ timezone: 'America/Bogota', assigned_at: '2026-09-01T00:00:00.000Z' }),
        assignment({ timezone: 'Europe/Madrid', assigned_at: '2026-11-01T00:00:00.000Z' }),
      ],
      'America/Bogota',
    )
    expect(resolved).toEqual({ zone: 'Europe/Madrid', fromHer: true })
  })

  test('with no assignment it falls back to the reader, and says so', () => {
    expect(plantedZone([], 'America/Bogota')).toEqual({ zone: 'America/Bogota', fromHer: false })
  })

  test('neither hers nor the reader leaves no zone at all', () => {
    expect(plantedZone([], null)).toEqual({ zone: null, fromHer: false })
  })
})

describe('the day the draft starts on', () => {
  /*
   * The instant is fixed and the zones straddle it, so this asserts the zone
   * arithmetic and not the machine's clock: 02:00 UTC on the 13th is still the
   * 12th in Bogotá.
   */
  const instant = new Date('2026-11-13T02:00:00.000Z')

  test('it is her today, in her zone', () => {
    expect(initialAssignmentDraft('America/Bogota', instant)).toEqual({
      programVersionId: '',
      startsOn: '2026-11-12',
    })
  })

  /* A day that looks chosen is a day nobody checked. */
  test('with no zone for her, it is left empty instead of filled with ours', () => {
    expect(initialAssignmentDraft(null, instant).startsOn).toBe('')
  })
})

describe('why a draft cannot be sent', () => {
  test('a version has to be chosen', () => {
    expect(
      assignmentDraftError({ programVersionId: '', startsOn: '2026-11-13' }, '2026-11-13'),
    ).toBe('Elige la versión del programa que le vas a asignar.')
  })

  test('a day has to be chosen', () => {
    expect(assignmentDraftError({ programVersionId: 'v', startsOn: '' }, '2026-11-13')).toBe(
      'Elige el día en que empieza.',
    )
  })

  test('a day already past in her zone is refused before asking the server', () => {
    expect(
      assignmentDraftError({ programVersionId: 'v', startsOn: '2026-11-12' }, '2026-11-13'),
    ).toBe('El programa empieza hoy o después, en el día de ella.')
  })

  test('with no day known for her, there is nothing to compare and the server decides', () => {
    expect(assignmentDraftError({ programVersionId: 'v', startsOn: '2020-01-01' }, '')).toBeNull()
  })

  test('today itself is allowed, and so is later', () => {
    expect(
      assignmentDraftError({ programVersionId: 'v', startsOn: '2026-11-13' }, '2026-11-13'),
    ).toBeNull()
    expect(
      assignmentDraftError({ programVersionId: 'v', startsOn: '2027-01-02' }, '2026-11-13'),
    ).toBeNull()
  })
})

describe('the body the command takes', () => {
  /*
   * The zone travels on purpose. Without it the function refuses with
   * `timezone` for a person who never opened Space, and that refusal is
   * unexplainable to a coach who cannot know whether she installed the app.
   */
  test('it carries our zone as the fallback', () => {
    expect(
      assignmentRequest({ programVersionId: 'v1', startsOn: '2026-11-17' }, 'America/Bogota'),
    ).toEqual({
      program_version_id: 'v1',
      starts_on: '2026-11-17',
      timezone: 'America/Bogota',
    })
  })

  test('with no zone to send, the field is absent rather than empty', () => {
    const body = assignmentRequest({ programVersionId: 'v1', startsOn: '2026-11-17' }, null)
    expect(body).toEqual({ program_version_id: 'v1', starts_on: '2026-11-17' })
    expect('timezone' in body).toBe(false)
  })
})

describe('what is said once it is done', () => {
  test('the planted sessions are counted, in their own number', () => {
    expect(assignmentOutcome(created({ planned_sessions_created: 24 })).description).toContain(
      'Le quedaron sembradas 24 sesiones',
    )
    expect(assignmentOutcome(created({ planned_sessions_created: 1 })).description).toContain(
      'Le quedó sembrada 1 sesión',
    )
  })

  /* Criterion 5: an overlap warns, never blocks — and never says with what. */
  test('an overlap is reported as allowed, and names no other program', () => {
    const outcome = assignmentOutcome(created({ schedule_overlaps: true }))
    expect(outcome.overlaps).toBe(true)
    expect(outcome.description).toContain('no impide nada')
    expect(outcome.description).toContain('otro programa')
    expect(outcome.description).not.toMatch(/«|»/)
  })

  test('without an overlap nothing is said about other programs', () => {
    const outcome = assignmentOutcome(created({ schedule_overlaps: false }))
    expect(outcome.overlaps).toBe(false)
    expect(outcome.description).not.toContain('otro programa')
  })
})

describe('what to say when the command refuses', () => {
  const failure = (status: number, code: string, issues: { code: string; path: string }[] = []) =>
    new StudioApiError(status, code, undefined, { issues })

  /*
   * The three validation refusals arrive as the same `validation-failed`, so
   * only the issue code tells them apart — and each asks the coach for
   * something different.
   */
  test('a version retired while the form was open asks for another version', () => {
    expect(
      assignmentWriteFailure(
        failure(422, 'validation-failed', [
          { code: 'program-version', path: '/program_version_id' },
        ]),
      ),
    ).toContain('Vuelve a elegir una publicada')
  })

  test('a day past in her zone asks for another day', () => {
    expect(
      assignmentWriteFailure(
        failure(422, 'validation-failed', [{ code: 'starts-on', path: '/starts_on' }]),
      ),
    ).toContain('Ese día ya pasó en la zona horaria de ella')
  })

  test('no zone known for her says what she has to do, because the coach cannot', () => {
    expect(
      assignmentWriteFailure(
        failure(422, 'validation-failed', [{ code: 'timezone', path: '/timezone' }]),
      ),
    ).toContain('abra Space al menos una vez')
  })

  /* Criterion 1: the refusal names the permission and its level. */
  test('the missing permission is named, with its level', () => {
    const message = assignmentWriteFailure(failure(403, 'scope-required'))
    expect(message).toContain('permiso de entrenamiento')
    expect(message).toContain('registro')
  })

  test('a plain forbidden is about the membership, not about her', () => {
    expect(assignmentWriteFailure(failure(403, 'forbidden'))).toContain('Tu membresía')
  })

  test('a paused service says to wait for the reactivation', () => {
    expect(assignmentWriteFailure(failure(409, 'service-paused'))).toContain('pausado')
  })

  test('a person the caller does not attend', () => {
    expect(assignmentWriteFailure(failure(404, 'not-found'))).toContain('entre las que atiendes')
  })

  test('a failure that is not the API says nothing was assigned', () => {
    expect(assignmentWriteFailure(new Error('offline'))).toContain('no se asignó nada')
  })
})

describe('what the dialog says before the click', () => {
  test('a finite program is planted whole, now', () => {
    expect(assignmentConsequences(version({ repeats_forever: false }))[0]).toContain(
      'Toda su agenda queda sembrada ahora mismo',
    )
  })

  test('an open-ended one starts with its first week', () => {
    expect(assignmentConsequences(version({ repeats_forever: true }))[0]).toContain(
      'empieza con la primera semana',
    )
  })

  test('it always says whose zone decides, and that the origin never changes', () => {
    const said = assignmentConsequences(version({})).join(' ')
    expect(said).toContain('zona horaria de ella')
    expect(said).toContain('no cambia nunca')
  })
})
