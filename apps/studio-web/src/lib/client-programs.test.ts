import { describe, expect, test } from 'bun:test'

import {
  adjustmentsLine,
  assignmentIsRunning,
  assignmentStatusLabel,
  growsForever,
  managedLine,
  progressLine,
  sessionStatusLabel,
  sessionsDone,
  spanLine,
  versionLine,
} from './client-programs'
import type { RelationshipAssignment, RelationshipAssignmentSession } from './studio-api'

function session(partial: Partial<RelationshipAssignmentSession>): RelationshipAssignmentSession {
  return {
    id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    template_version_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5c',
    title: 'Tren inferior',
    week_starts_on: '2026-07-27',
    program_day: 1,
    scheduled_on: '2026-07-27',
    status: 'scheduled',
    started: false,
    revision_number: 0,
    ...partial,
  } as RelationshipAssignmentSession
}

function assignment(partial: Partial<RelationshipAssignment>): RelationshipAssignment {
  return {
    id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a01',
    status: 'active',
    program_version: {
      id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a02',
      program_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a03',
      version_number: 3,
      title: 'Fuerza general',
      repeats_forever: false,
    },
    starts_on: '2026-07-27',
    timezone: 'America/Bogota',
    assigned_at: '2026-07-26T15:00:00-05:00',
    management: {
      relationship_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a04',
      since: '2026-07-26T15:00:00-05:00',
    },
    sessions: [],
    adjustments: [],
    ...partial,
  } as RelationshipAssignment
}

/*
 * The same formatter the module uses, because what these tests check is the
 * selection and the sentence — which revision is the latest, which day bounds
 * the calendar — and not `Intl`. Asserting the rendered text literally would
 * also pin this suite to bun's ICU data, which is not the browser's.
 */
const day = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

describe('what state an assignment is in', () => {
  test('each of the four says what it is', () => {
    expect(assignmentStatusLabel('active')).toBe('En curso')
    expect(assignmentStatusLabel('detached_pending_choice')).toBe('Ella decide si sigue')
    expect(assignmentStatusLabel('ended')).toBe('Terminado')
    expect(assignmentStatusLabel('cancelled')).toBe('Cancelado')
  })

  test('only an active one is a program she trains today', () => {
    expect(assignmentIsRunning('active')).toBe(true)
    expect(assignmentIsRunning('ended')).toBe(false)
    expect(assignmentIsRunning('cancelled')).toBe(false)
    expect(assignmentIsRunning('detached_pending_choice')).toBe(false)
  })
})

describe('what state one planted session is in', () => {
  test('each of the four says what it is', () => {
    expect(sessionStatusLabel('scheduled')).toBe('Programada')
    expect(sessionStatusLabel('paused')).toBe('En pausa')
    expect(sessionStatusLabel('cancelled')).toBe('Cancelada')
    expect(sessionStatusLabel('completed')).toBe('Hecha')
  })
})

describe('how far along she is', () => {
  const planted = [
    session({ id: 'a', status: 'completed' }),
    session({ id: 'b', status: 'completed' }),
    session({ id: 'c', status: 'scheduled' }),
    session({ id: 'd', status: 'cancelled' }),
  ]

  test('a finite program counts against everything planted for it', () => {
    expect(sessionsDone(assignment({ sessions: planted }))).toEqual({ done: 2, total: 4 })
    expect(progressLine(assignment({ sessions: planted }))).toBe('2 de 4 sesiones hechas')
  })

  /*
   * The point of the whole module: an open-ended program's calendar is only as
   * long as she has reached, so a denominator taken from it would measure her
   * against a total that grows every week.
   */
  test('an open-ended program is counted without a total', () => {
    const forever = assignment({
      sessions: planted,
      program_version: { ...assignment({}).program_version, repeats_forever: true },
    })
    expect(sessionsDone(forever)).toEqual({ done: 2, total: null })
    expect(progressLine(forever)).toBe('2 sesiones hechas')
    expect(growsForever(forever)).toBe(true)
  })

  test('one session reads as one, not as «1 sesiones»', () => {
    const forever = assignment({
      sessions: [session({ id: 'a', status: 'completed' })],
      program_version: { ...assignment({}).program_version, repeats_forever: true },
    })
    expect(progressLine(forever)).toBe('1 sesión hecha')
  })

  test('nothing planted yet is zero of zero, never a crash', () => {
    expect(progressLine(assignment({ sessions: [] }))).toBe('0 de 0 sesiones hechas')
  })
})

describe('the days the calendar covers', () => {
  test('from the first planted day to the last', () => {
    const line = spanLine(
      assignment({
        sessions: [
          session({ id: 'a', scheduled_on: '2026-07-27' }),
          session({ id: 'b', scheduled_on: '2026-09-14' }),
        ],
      }),
    )
    expect(line).toBe(`${day.format(new Date(2026, 6, 27))} — ${day.format(new Date(2026, 8, 14))}`)
  })

  test('a single day is said once, not as a range to itself', () => {
    const line = spanLine(assignment({ sessions: [session({ scheduled_on: '2026-07-27' })] }))
    expect(line).toBe(day.format(new Date(2026, 6, 27)))
  })

  test('nothing planted has no span, which is not a span of one day', () => {
    expect(spanLine(assignment({ sessions: [] }))).toBeNull()
  })
})

describe('who runs the program', () => {
  test('said with the day we took it on', () => {
    const line = managedLine(assignment({}))
    expect(line).toBe(
      `Lo administramos desde el ${day.format(new Date('2026-07-26T15:00:00-05:00'))}`,
    )
  })

  test('once management is gone the plan is hers, and that is not «terminado»', () => {
    expect(managedLine(assignment({ management: null }))).toBe(
      'Ya no lo administramos: el plan quedó en sus manos',
    )
  })
})

describe('the adjustments made for her', () => {
  const revision = (id: string, revised_at: string) => ({
    id,
    assignment_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a01',
    planned_step_id: `0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4b${id}`,
    kind: 'target_load' as const,
    value: 80,
    unit_code: 'kg',
    revised_at,
  })

  test('none is no line at all, not «sin ajustes»', () => {
    expect(adjustmentsLine(assignment({ adjustments: [] }))).toBeNull()
  })

  test('one is said once, in the singular', () => {
    const line = adjustmentsLine(
      assignment({ adjustments: [revision('01', '2026-08-03T10:00:00-05:00')] }),
    )
    expect(line).toBe(
      `Ajustado para ella una vez, la última el ${day.format(new Date('2026-08-03T10:00:00-05:00'))}`,
    )
  })

  /* The latest by when it was made, not by where it sits in the array. */
  test('several name the most recent one, whatever order they arrive in', () => {
    const line = adjustmentsLine(
      assignment({
        adjustments: [
          revision('01', '2026-08-03T10:00:00-05:00'),
          revision('02', '2026-09-20T10:00:00-05:00'),
          revision('03', '2026-08-11T10:00:00-05:00'),
        ],
      }),
    )
    expect(line).toBe(
      `Ajustado para ella 3 veces, la última el ${day.format(new Date('2026-09-20T10:00:00-05:00'))}`,
    )
  })

  /*
   * No test asserts what a revision changed, because the screen must never say
   * it: `planned_step_id` is the only thing tying a revision to the program and
   * this answer carries no steps to resolve it against.
   */
})

describe('which version she was given', () => {
  test('named by its number, because the gym may already be on a later one', () => {
    expect(versionLine(assignment({}))).toBe('Versión 3')
  })
})
