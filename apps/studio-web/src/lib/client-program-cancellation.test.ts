import { describe, expect, test } from 'bun:test'

import {
  cancelConsequences,
  cancelOutcome,
  cancelPermissionNote,
  cancelTitle,
  cancelWriteFailure,
  canCancelAssignment,
} from './client-program-cancellation.js'
import type { AssignmentCancellation, RelationshipAssignment } from './studio-api.js'

function assignment(overrides: Partial<RelationshipAssignment> = {}): RelationshipAssignment {
  return {
    id: '01991600-7000-7000-8000-000000000401',
    status: 'active',
    program_version: {
      id: '01991600-7000-7000-8000-000000000501',
      program_id: '01991600-7000-7000-8000-000000000601',
      version_number: 2,
      title: 'Fuerza base',
      repeats_forever: false,
    },
    starts_on: '2026-11-03',
    timezone: 'America/Bogota',
    assigned_at: '2026-11-02T18:00:00.000Z',
    management: {
      relationship_id: '01991600-7000-7000-8000-000000000101',
      since: '2026-11-02T18:00:00.000Z',
    },
    sessions: [],
    adjustments: [],
    ...overrides,
  }
}

function cancellation(sessions_cancelled: number): AssignmentCancellation {
  return {
    id: '01991600-7000-7000-8000-000000000401',
    status: 'cancelled',
    cancelled_at: '2026-11-13T20:00:00.000Z',
    sessions_cancelled,
  }
}

describe('whether this program can be stopped at all', () => {
  test('yes while the organization manages it and she shared at the writing level', () => {
    expect(canCancelAssignment(assignment(), 'granted')).toBe(true)
  })

  /*
   * The contract answers 409 `conflict` for a program the organization no
   * longer manages, so offering the action would be offering a refusal.
   */
  test('no once the organization stopped managing it', () => {
    expect(canCancelAssignment(assignment({ management: null }), 'granted')).toBe(false)
  })

  test('no for a program that already ended or was cancelled', () => {
    expect(canCancelAssignment(assignment({ status: 'cancelled' }), 'granted')).toBe(false)
    expect(canCancelAssignment(assignment({ status: 'ended' }), 'granted')).toBe(false)
  })

  /*
   * A program she must choose about is still running, and the contract does not
   * refuse it: management is what decides, and it is still there.
   */
  test('yes for one waiting on her choice, which is still managed', () => {
    expect(canCancelAssignment(assignment({ status: 'detached_pending_choice' }), 'granted')).toBe(
      true,
    )
  })

  test('no without the writing level, which the server would refuse anyway', () => {
    expect(canCancelAssignment(assignment(), 'read-only')).toBe(false)
    expect(canCancelAssignment(assignment(), 'absent')).toBe(false)
  })
})

describe('what the dialog says before the click', () => {
  test('names the program and the version being stopped', () => {
    expect(cancelTitle(assignment())).toBe('¿Cancelar «Fuerza base», versión 2?')
  })

  /*
   * Criteria 1 and 2, both halves. The second is the one a reader fears is
   * false, so it is said as plainly as the first.
   */
  test('says what stops and what stays', () => {
    const lines = cancelConsequences()

    expect(lines).toEqual([
      'Se detienen las sesiones de hoy en adelante que ella no haya empezado.',
      'Lo que ya entrenó y las sesiones pasadas quedan intactas, y el programa sigue en su historial.',
      'Una sesión que ya empezó no se detiene.',
    ])
  })
})

describe('what is said once it is done', () => {
  test('counts the sessions the answer says stopped, never its own count', () => {
    expect(cancelOutcome(cancellation(7))).toBe('Cancelado. Se detuvieron 7 sesiones futuras.')
  })

  test('says one session in the singular', () => {
    expect(cancelOutcome(cancellation(1))).toBe('Cancelado. Se detuvo 1 sesión futura.')
  })

  /*
   * Nothing to stop is not a failure: a program whose sessions were all past or
   * already started cancels with none, and saying "0 sesiones" invites the
   * reader to wonder what went wrong.
   */
  test('says the program stopped, without a count, when nothing was pending', () => {
    expect(cancelOutcome(cancellation(0))).toBe(
      'Cancelado. No quedaban sesiones futuras por detener.',
    )
  })
})

describe('why the action is not offered', () => {
  test('tells «only to read» from «never shared», because she can fix the first', () => {
    expect(cancelPermissionNote('read-only')).toBe(
      'Te autorizó su entrenamiento solo para leerlo, así que no puedes cancelarle un programa. Hace falta que lo suba a nivel de registro, y eso lo decide ella.',
    )
    expect(cancelPermissionNote('absent')).toBe(
      'No te autorizó su entrenamiento, así que no puedes cancelarle un programa. El permiso que hace falta es el de entrenamiento, en nivel de registro.',
    )
  })

  test('says nothing when the action is offered', () => {
    expect(cancelPermissionNote('granted')).toBeNull()
  })
})

describe('what each refusal means', () => {
  /*
   * The paused service is the one worth its own sentence: the contract says it
   * is resolved by reactivating the service or ending the relationship, never
   * program by program, so «vuelve a intentarlo» would send the reader nowhere.
   */
  test('a paused service says where it is resolved, which is not here', () => {
    expect(cancelWriteFailure(409, 'service-paused')).toBe(
      'No se canceló: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no programa por programa.',
    )
  })

  /*
   * The other 409, whose advice is the opposite: nobody here can stop it. One
   * sentence for both would be sound advice for one case and misdirection for
   * the other.
   */
  test('a program the organization no longer manages says nobody here can stop it', () => {
    expect(cancelWriteFailure(409, 'conflict')).toBe(
      'No se canceló: este programa ya no lo administramos, así que no hay nada que detener desde aquí.',
    )
  })

  test('a 409 whose code did not arrive falls to the one that promises nothing', () => {
    expect(cancelWriteFailure(409)).toBe(
      'No se canceló: este programa ya no lo administramos, así que no hay nada que detener desde aquí.',
    )
  })

  test('403 is the permission or the role, and offers no retry', () => {
    expect(cancelWriteFailure(403)).toBe(
      'No se canceló: tu rol o el permiso de entrenamiento no alcanzan para detener este programa.',
    )
  })

  test('404 is a program this organization cannot reach', () => {
    expect(cancelWriteFailure(404)).toBe(
      'Este programa ya no está disponible para tu organización.',
    )
  })

  test('503 is temporary and says the program kept running', () => {
    expect(cancelWriteFailure(503)).toBe(
      'No pudimos cancelar el programa ahora mismo. Sigue activo; vuelve a intentarlo en un momento.',
    )
  })

  test('anything else says the program kept running rather than guessing', () => {
    expect(cancelWriteFailure(0)).toBe(
      'No pudimos cancelar el programa. Sigue activo; vuelve a intentarlo.',
    )
  })
})
