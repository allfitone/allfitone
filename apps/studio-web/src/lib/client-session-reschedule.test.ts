import { describe, expect, test } from 'bun:test'

import {
  canRescheduleSession,
  rescheduleBoundsNote,
  rescheduleIsOffered,
  rescheduleTitle,
  rescheduleWeek,
  rescheduleWriteFailure,
} from './client-session-reschedule.js'
import type { RelationshipAssignment, RelationshipAssignmentSession } from './studio-api.js'

/* A Monday, so the week runs 2026-11-09 … 2026-11-15. */
const WEEK = '2026-11-09'

function session(
  overrides: Partial<RelationshipAssignmentSession> = {},
): RelationshipAssignmentSession {
  return {
    id: '01991600-7000-7000-8000-0000000000a1',
    template_version_id: '01991600-7000-7000-8000-0000000000d1',
    title: 'Tren inferior',
    week_starts_on: WEEK,
    program_day: 3,
    scheduled_on: '2026-11-11',
    status: 'scheduled',
    started: false,
    revision_number: 2,
    ...overrides,
  }
}

function assignment(overrides: Partial<RelationshipAssignment> = {}): RelationshipAssignment {
  return {
    id: '01991600-7000-7000-8000-0000000000e1',
    status: 'active',
    program_version: {
      id: '01991600-7000-7000-8000-0000000000f1',
      program_id: '01991600-7000-7000-8000-0000000000f0',
      version_number: 3,
      title: 'Fuerza base',
      repeats_forever: false,
    },
    starts_on: '2026-11-09',
    timezone: 'America/Bogota',
    assigned_at: '2026-11-08T12:00:00.000Z',
    management: {
      relationship_id: '01991600-7000-7000-8000-000000000101',
      since: '2026-11-08T12:00:00.000Z',
    },
    sessions: [],
    adjustments: [],
    ...overrides,
  }
}

/*
 * Every date here is pinned. The suite must not change answer with the day it
 * runs on, and the zone matters: the server compares the new day against today
 * in HER zone, not in the machine's.
 */
const WEDNESDAY = new Date('2026-11-11T15:00:00.000Z')

describe('which days of its own week a session can move to', () => {
  test('offers the seven days of the week it belongs to, and no more', () => {
    const week = rescheduleWeek(session(), assignment(), WEDNESDAY)

    expect(week.map((day) => day.day)).toEqual([
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ])
  })

  test('closes the days already past in her zone, and opens today', () => {
    const week = rescheduleWeek(session(), assignment(), WEDNESDAY)
    const state = Object.fromEntries(week.map((day) => [day.day, day.state]))

    expect(state['2026-11-09']).toBe('closed')
    expect(state['2026-11-10']).toBe('closed')
    // Wednesday is both today and the day it is on; being its own day wins.
    expect(state['2026-11-11']).toBe('current')
    expect(state['2026-11-12']).toBe('open')
    expect(state['2026-11-15']).toBe('open')
  })

  /*
   * Her zone, not the reader's. At 02:00 UTC on Thursday it is still Wednesday
   * in Bogotá, so Wednesday is not past for her — and the server, which
   * compares in her zone, would accept it.
   */
  test('reads today in her zone and not in the machine', () => {
    const justAfterMidnightUtc = new Date('2026-11-12T02:00:00.000Z')
    const week = rescheduleWeek(
      session({ scheduled_on: '2026-11-14' }),
      assignment(),
      justAfterMidnightUtc,
    )
    const state = Object.fromEntries(week.map((day) => [day.day, day.state]))

    expect(state['2026-11-11']).toBe('open')
    expect(state['2026-11-12']).toBe('open')
  })

  test('closes the days before the program starts, even when they are not past', () => {
    const week = rescheduleWeek(
      session({ scheduled_on: '2026-11-14' }),
      assignment({ starts_on: '2026-11-13' }),
      new Date('2026-11-09T15:00:00.000Z'),
    )
    const state = Object.fromEntries(week.map((day) => [day.day, day.state]))

    expect(state['2026-11-12']).toBe('closed')
    expect(state['2026-11-13']).toBe('open')
    expect(state['2026-11-14']).toBe('current')
  })

  test('closes the whole week once it is behind her', () => {
    const week = rescheduleWeek(session(), assignment(), new Date('2026-11-20T15:00:00.000Z'))

    expect(week.filter((day) => day.state === 'open')).toHaveLength(0)
    expect(week.filter((day) => day.state === 'current')).toHaveLength(1)
  })
})

describe('whether a session can be moved at all', () => {
  test('yes while it is scheduled, unstarted, managed and she shared at the writing level', () => {
    expect(canRescheduleSession(session(), assignment(), 'granted')).toBe(true)
  })

  /* The contract says it in the session itself: a started session no longer moves. */
  test('no once she started it', () => {
    expect(canRescheduleSession(session({ started: true }), assignment(), 'granted')).toBe(false)
  })

  test('no for a session that is not scheduled', () => {
    for (const status of ['completed', 'cancelled', 'paused'] as const) {
      expect(canRescheduleSession(session({ status }), assignment(), 'granted')).toBe(false)
    }
  })

  test('no once the organization stopped managing the program', () => {
    expect(canRescheduleSession(session(), assignment({ management: null }), 'granted')).toBe(false)
  })

  test('no without the writing level, which the server would refuse anyway', () => {
    expect(canRescheduleSession(session(), assignment(), 'read-only')).toBe(false)
    expect(canRescheduleSession(session(), assignment(), 'absent')).toBe(false)
  })
})

describe('whether the control is drawn at all', () => {
  test('yes when the server would take it and its week still has a day', () => {
    expect(rescheduleIsOffered(session(), assignment(), 'granted', WEDNESDAY)).toBe(true)
  })

  /*
   * The defect this function exists for: a week entirely behind her passes every
   * condition the server checks, and has nowhere to put the session. A control
   * that can only answer "no" is worse than the plain day it replaces.
   */
  test('no once its own week is behind her, with nowhere left to move it', () => {
    const afterTheWeek = new Date('2026-11-20T15:00:00.000Z')

    expect(canRescheduleSession(session(), assignment(), 'granted')).toBe(true)
    expect(rescheduleIsOffered(session(), assignment(), 'granted', afterTheWeek)).toBe(false)
  })

  test('no for the reasons the server would refuse, without consulting the week', () => {
    expect(
      rescheduleIsOffered(session({ started: true }), assignment(), 'granted', WEDNESDAY),
    ).toBe(false)
    expect(rescheduleIsOffered(session(), assignment(), 'read-only', WEDNESDAY)).toBe(false)
  })
})

describe('what the dialog says', () => {
  test('names the session being moved', () => {
    expect(rescheduleTitle(session())).toBe('¿Mover «Tren inferior» a otro día?')
  })

  /*
   * One line for the three bounds, because seven days each explaining
   * themselves is noise. The reason a day is closed never changes within a
   * week, so saying it once is saying it.
   */
  test('says the three bounds once, not per day', () => {
    expect(rescheduleBoundsNote()).toBe(
      'Solo dentro de su propia semana, desde hoy en adelante y nunca antes de que empiece el programa. Lo que cambia es el día: la rutina, sus objetivos y la semana a la que pertenece se quedan igual.',
    )
  })
})

describe('what each refusal means', () => {
  /*
   * The one that is not an error: somebody moved it while the dialog was open,
   * and the answer hands back the session as it stands. Losing either version
   * would be the wrong move.
   */
  test('a session that moved meanwhile says so and points at the day it is on now', () => {
    expect(rescheduleWriteFailure(409, 'stale-draft')).toBe(
      'Esta sesión se movió mientras la mirabas. Abajo está el día en el que quedó; vuelve a elegir desde ahí.',
    )
  })

  test('a paused service says where it is resolved, which is not here', () => {
    expect(rescheduleWriteFailure(409, 'service-paused')).toBe(
      'No se movió: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no sesión por sesión.',
    )
  })

  test('the other conflict covers a session already started and a program we dropped', () => {
    expect(rescheduleWriteFailure(409, 'conflict')).toBe(
      'No se movió: o ella ya empezó esta sesión, o este programa ya no lo administramos. Vuelve a cargar la agenda para verla como está.',
    )
  })

  test('403 is the permission or the role, and offers no retry', () => {
    expect(rescheduleWriteFailure(403)).toBe(
      'No se movió: el permiso de entrenamiento no alcanza para cambiarle la agenda.',
    )
  })

  test('422 is a day the server refused, and names the rule rather than the field', () => {
    expect(rescheduleWriteFailure(422)).toBe(
      'Ese día no vale: tiene que ser de esta misma semana, de hoy en adelante y no antes de que empiece el programa.',
    )
  })

  test('404 is a session this organization cannot reach', () => {
    expect(rescheduleWriteFailure(404)).toBe(
      'Esta sesión ya no está disponible para tu organización.',
    )
  })

  test('anything else says the session stayed where it was', () => {
    expect(rescheduleWriteFailure(503)).toBe(
      'No pudimos mover la sesión ahora mismo. Sigue en su día; vuelve a intentarlo en un momento.',
    )
    expect(rescheduleWriteFailure(0)).toBe(
      'No pudimos mover la sesión. Sigue en su día; vuelve a intentarlo.',
    )
  })
})
