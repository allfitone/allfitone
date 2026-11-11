import { describe, expect, test } from 'bun:test'

import {
  executionLength,
  executionWhen,
  fulfilledOurPlan,
  levelLabel,
  originLabel,
} from './client-executions'
import type { AuthorizedExecutionSummary } from './studio-api'

function session(partial: Partial<AuthorizedExecutionSummary>): AuthorizedExecutionSummary {
  return {
    id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a5b',
    started_at: '2026-07-27T06:04:00-05:00',
    ended_at: '2026-07-27T07:01:00-05:00',
    timezone: 'America/Bogota',
    activity_type_code: 'strength_training',
    activity_type_name: 'Entrenamiento de fuerza',
    discipline_code: 'strength',
    achieved_level: 'detailed',
    origin: 'relationship',
    planned_session_id: '0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f4a60',
    applied_scope: { code: 'relationship_training', version: 1 },
    ...partial,
  } as AuthorizedExecutionSummary
}

describe('where a session came from', () => {
  test('ours or hers, said about both', () => {
    expect(originLabel('relationship')).toBe('Con nosotros')
    expect(originLabel('prior')).toBe('Por su cuenta')
  })

  test('an origin this copy does not know is handed back, never hidden', () => {
    expect(originLabel('imported')).toBe('imported')
  })
})

describe('how complete a session record is', () => {
  test('each of the four levels reads as what it is', () => {
    expect(levelLabel('partial')).toBe('Registro parcial')
    expect(levelLabel('summary')).toBe('Solo el resumen')
    expect(levelLabel('detailed')).toBe('Registro detallado')
    expect(levelLabel('sensor_enriched')).toBe('Con datos de dispositivo')
  })

  /*
   * Defaulting a missing level to «partial» would be a claim about what she
   * recorded, built out of the absence of a value.
   */
  test('no level is nothing said, not the bottom of the scale', () => {
    expect(levelLabel(null)).toBeNull()
  })
})

describe('when she trained', () => {
  /*
   * The hour she lived, not the hour the reader would have read it at. Six in
   * the morning in Bogotá is one in the afternoon in Madrid, and a coach acts on
   * «entrenó de madrugada».
   */
  test('is read in the session own zone, whoever is looking', () => {
    const fromBogota = executionWhen(session({}), 'America/Bogota')
    const fromMadrid = executionWhen(session({}), 'Europe/Madrid')
    expect(fromBogota.line).toBe(fromMadrid.line)
    expect(fromBogota.line).toContain('6:04')
  })

  test('the zone is named only when it is not the reader own', () => {
    expect(executionWhen(session({}), 'America/Bogota').zone).toBeNull()
    expect(executionWhen(session({}), 'Europe/Madrid').zone).toBe('America/Bogota')
  })

  test('a session in another zone keeps its own hour', () => {
    const madrid = session({ started_at: '2026-07-27T06:04:00+02:00', timezone: 'Europe/Madrid' })
    const when = executionWhen(madrid, 'America/Bogota')
    expect(when.line).toContain('6:04')
    expect(when.zone).toBe('Europe/Madrid')
  })

  /*
   * IANA retires names, and `Intl` throws on one it does not know. One old
   * session must not take the whole list down, so it falls back to the reader's
   * zone and claims no zone of its own.
   */
  test('a zone the browser does not know falls back instead of throwing', () => {
    const when = executionWhen(session({ timezone: 'Mars/Olympus_Mons' }), 'America/Bogota')
    expect(when.line.length).toBeGreaterThan(0)
    expect(when.zone).toBeNull()
  })

  test('and so does a zone that did not arrive as text', () => {
    const when = executionWhen(session({ timezone: null as unknown as string }), 'America/Bogota')
    expect(when.line.length).toBeGreaterThan(0)
    expect(when.zone).toBeNull()
  })

  test('without the reader zone, every session names its own', () => {
    expect(executionWhen(session({}), null).zone).toBe('America/Bogota')
  })
})

describe('how long it lasted', () => {
  test('under an hour, in minutes', () => {
    expect(executionLength(session({}))).toBe('57 min')
  })

  test('over an hour, in hours and minutes', () => {
    expect(
      executionLength(
        session({ started_at: '2026-07-27T06:00:00-05:00', ended_at: '2026-07-27T07:30:00-05:00' }),
      ),
    ).toBe('1 h 30 min')
  })

  test('a round hour says no minutes', () => {
    expect(
      executionLength(
        session({ started_at: '2026-07-27T06:00:00-05:00', ended_at: '2026-07-27T08:00:00-05:00' }),
      ),
    ).toBe('2 h')
  })

  /*
   * A session nobody closed is not a session of no duration, so it says
   * nothing rather than «0 min».
   */
  test('no end recorded is nothing said', () => {
    expect(executionLength(session({ ended_at: null }))).toBeNull()
  })

  test('an end before its start is nothing said either', () => {
    expect(
      executionLength(
        session({ started_at: '2026-07-27T08:00:00-05:00', ended_at: '2026-07-27T06:00:00-05:00' }),
      ),
    ).toBeNull()
  })
})

describe('whether it was one of ours', () => {
  test('a session that fulfilled a planned one says so', () => {
    expect(fulfilledOurPlan(session({}))).toBe(true)
  })

  /*
   * The contract fills `planned_session_id` only for a session of this
   * relationship, so this is never true for one she did on her own.
   */
  test('and one she did on her own carries no plan', () => {
    expect(fulfilledOurPlan(session({ origin: 'prior', planned_session_id: null }))).toBe(false)
  })
})
