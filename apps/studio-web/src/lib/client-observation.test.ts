import { describe, expect, test } from 'bun:test'

import {
  observationCategories,
  observationCategoryNote,
  observationContentProblem,
  observationOutcome,
  observationProvenanceNote,
  observationWriteFailure,
  type ObservationCategoryOffer,
} from './client-observation.js'
import type {
  AuthorizedExecution,
  ClientCardSection,
  ProfessionalObservation,
} from './studio-api.js'

function section(scope_code: string, access_level: 'read' | 'contribute'): ClientCardSection {
  return {
    scope_code: scope_code as ClientCardSection['scope_code'],
    access_level,
    scope_version: 1,
    granted_at: '2026-11-01T10:00:00.000Z',
    reads: [],
  }
}

function execution(overrides: Partial<AuthorizedExecution> = {}): AuthorizedExecution {
  return {
    id: '01991600-7000-7000-8000-0000000000c1',
    started_at: '2026-11-14T13:00:00.000Z',
    ended_at: '2026-11-14T14:05:00.000Z',
    timezone: 'America/Bogota',
    activity_type_code: 'strength',
    activity_type_name: 'Fuerza',
    discipline_code: 'gym',
    achieved_level: 'complete',
    origin: 'relationship',
    planned_session_id: null,
    applied_scope: { code: 'relationship_training', version: 1 },
    observations: [],
    segments: [],
    strength_sets: [],
    endurance_laps: [],
    interval_results: [],
    round_results: [],
    mobility_results: [],
    ...overrides,
  } as AuthorizedExecution
}

/** What the picker offers, as pairs, so a case reads at a glance. */
function offered(offers: readonly ObservationCategoryOffer[]) {
  return offers.map((offer) => [offer.category, offer.state] as const)
}

describe('which categories a coach may write on a session', () => {
  test('both, when she shared training and health at the writing level', () => {
    const offers = observationCategories(execution(), [
      section('relationship_training', 'contribute'),
      section('health_context', 'contribute'),
    ])

    expect(offered(offers)).toEqual([
      ['training', 'open'],
      ['health', 'open'],
    ])
  })

  /*
   * Two categories, two different grants. Writing a reading of her training
   * says nothing about whether pain may be written down, and the contract keeps
   * them apart on purpose: pain is health context.
   */
  test('training only, when health was shared to read and not to write', () => {
    const offers = observationCategories(execution(), [
      section('relationship_training', 'contribute'),
      section('health_context', 'read'),
    ])

    expect(offered(offers)).toEqual([
      ['training', 'open'],
      ['health', 'read-only'],
    ])
  })

  /*
   * A category she never shared is absent, not read-only: saying «solo lectura»
   * would claim she shared it, which is a different fact about her.
   */
  test('health is absent when she never shared it at all', () => {
    const offers = observationCategories(execution(), [
      section('relationship_training', 'contribute'),
    ])

    expect(offered(offers)).toEqual([['training', 'open']])
  })

  test('nothing at all when she shared her training only to read', () => {
    const offers = observationCategories(execution(), [section('relationship_training', 'read')])

    expect(offered(offers)).toEqual([['training', 'read-only']])
    expect(offers.some((offer) => offer.state === 'open')).toBe(false)
  })

  /*
   * The contract answers 422 `execution` for a session this relationship did
   * not produce — `prior`, what she trained before it — so nothing is offered
   * there: the form would only be refused.
   */
  test('nothing on a session she trained before this relationship', () => {
    const offers = observationCategories(execution({ origin: 'prior' }), [
      section('relationship_training', 'contribute'),
      section('health_context', 'contribute'),
    ])

    expect(offers).toEqual([])
  })

  /** «One finished session», says the operation. An unfinished one is not one. */
  test('nothing on a session that has not finished', () => {
    const offers = observationCategories(execution({ ended_at: null }), [
      section('relationship_training', 'contribute'),
    ])

    expect(offers).toEqual([])
  })
})

describe('what the form says about each choice', () => {
  test('tells apart a reading of her training from one of her health', () => {
    expect(observationCategoryNote('training')).toBe(
      'Tu lectura de cómo entrenó. Queda junto a lo que ella registró, sin cambiarlo.',
    )
    expect(observationCategoryNote('health')).toBe(
      'Dolor o una limitación que observaste. Se guarda como contexto de salud y se protege con ese permiso, no con el de la sesión.',
    )
  })

  /*
   * Criterion 3, said where it is chosen. A transcription stays hers, and the
   * coach is recorded only as who captured it — a reader who does not know that
   * would think he is signing it.
   */
  test('says what a transcription does, at the point of choosing it', () => {
    expect(observationProvenanceNote('professional_observation')).toBe(
      'Queda firmada por ti, como tu lectura profesional.',
    )
    expect(observationProvenanceNote('person_declared')).toBe(
      'Lo dijo ella y tú solo lo transcribes: el dato sigue siendo suyo y tú quedas como quien lo capturó.',
    )
  })
})

describe('what the form refuses before asking', () => {
  test('nothing written is nothing to send', () => {
    expect(observationContentProblem('')).toBe('empty')
    expect(observationContentProblem('   \n  ')).toBe('empty')
  })

  test('accepts what somebody actually typed', () => {
    expect(observationContentProblem('La técnica bajó en las dos últimas series.')).toBeNull()
  })

  test('refuses more than the column holds, rather than letting the server do it', () => {
    expect(observationContentProblem('a'.repeat(2000))).toBeNull()
    expect(observationContentProblem('a'.repeat(2001))).toBe('too-long')
  })
})

describe('what is said once it is written', () => {
  function written(overrides: Partial<ProfessionalObservation> = {}): ProfessionalObservation {
    return {
      id: '01991600-7000-7000-8000-0000000000b1',
      execution_id: '01991600-7000-7000-8000-0000000000c1',
      category: 'training',
      provenance: 'professional_observation',
      content: 'La técnica bajó en las dos últimas series.',
      revision_number: 0,
      created_at: '2026-11-16T15:00:00.000Z',
      revised_at: null,
      author_name: 'Kevin Clavijo',
      authored_by_me: true,
      ...overrides,
    }
  }

  test('says it was added, and under which category', () => {
    expect(observationOutcome(written())).toBe('Quedó tu observación sobre cómo entrenó.')
    expect(observationOutcome(written({ category: 'health' }))).toBe(
      'Quedó tu observación de contexto de salud.',
    )
  })

  test('a transcription says whose the content stays', () => {
    expect(observationOutcome(written({ provenance: 'person_declared' }))).toBe(
      'Quedó transcrito lo que ella dijo. El dato sigue siendo suyo.',
    )
  })
})

describe('what each refusal means', () => {
  /*
   * She can withdraw the level between the read that drew the form and the
   * click, so the refusal is handled even though the form decided first — and
   * it names the category, because that is what she would have to raise.
   */
  test('403 names the category whose level is missing', () => {
    expect(observationWriteFailure(403, 'scope-required', 'training')).toBe(
      'No se guardó: ya no tienes su entrenamiento en nivel de registro. Ella decide ese permiso.',
    )
    expect(observationWriteFailure(403, 'scope-required', 'health')).toBe(
      'No se guardó: ya no tienes su contexto de salud en nivel de registro. Ella decide ese permiso.',
    )
  })

  test('a paused service says where it is resolved, which is not here', () => {
    expect(observationWriteFailure(409, 'service-paused', 'training')).toBe(
      'No se guardó: su servicio con la organización está pausado. Eso se resuelve reactivándolo o terminando el vínculo, no observación por observación.',
    )
  })

  test('422 is a session that cannot be written on, and says so plainly', () => {
    expect(observationWriteFailure(422, 'validation-failed', 'training')).toBe(
      'No se guardó: sobre esta sesión no se puede escribir. Vuelve a cargarla para verla como está.',
    )
  })

  test('404 is a session this organization cannot reach', () => {
    expect(observationWriteFailure(404, 'not-found', 'training')).toBe(
      'Esta sesión ya no está disponible para ti.',
    )
  })

  test('anything else says nothing was written', () => {
    expect(observationWriteFailure(503, 'upstream-unavailable', 'training')).toBe(
      'No pudimos guardar la observación ahora mismo. No quedó nada escrito; vuelve a intentarlo.',
    )
    expect(observationWriteFailure(0, undefined, 'training')).toBe(
      'No pudimos guardar la observación. No quedó nada escrito; vuelve a intentarlo.',
    )
  })
})
