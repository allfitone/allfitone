import { describe, expect, test } from 'bun:test'

import {
  cardAccessLabel,
  categoryName,
  categorySummary,
  clientCardPath,
  clientExecutionsPath,
  clientTrainingProfilePath,
  doorsBySection,
  lossReasonSentence,
  sectionsState,
  withdrawalsNewestFirst,
} from './client-card'
import type { ClientCardSection, ClientCardWithdrawal, InformationCategory } from './studio-api'

function category(
  code: string,
  displayName: string,
  summary: string | null = null,
): InformationCategory {
  return {
    scope_code: code,
    display_name: displayName,
    summary,
    description: `Qué abarca ${displayName} y dónde para.`,
    default_purpose: 'Acompañar su entrenamiento.',
  } as InformationCategory
}

const CATALOG = [
  category('relationship_training', 'Entrenamiento', 'Las sesiones que le asignas.'),
  category('body_progress', 'Progreso corporal'),
] as const

function withdrawal(code: string, at: string): ClientCardWithdrawal {
  return { scope_code: code, withdrawn_at: at } as ClientCardWithdrawal
}

describe('what a category is called', () => {
  test('the catalogue names it, because that wording carries no version', () => {
    expect(categoryName('relationship_training', CATALOG)).toBe('Entrenamiento')
  })

  /*
   * The code is a last resort nobody should meet: reaching it means the
   * catalogue answered without one of its own seven codes. Showing it is how
   * that becomes visible instead of being hidden behind a second vocabulary
   * written into the client.
   */
  test('without the catalogue, the code stands in rather than a guess', () => {
    expect(categoryName('relationship_training', undefined)).toBe('relationship_training')
    expect(categoryName('health_context', CATALOG)).toBe('health_context')
  })

  test('the one-line summary is optional, and absent is not empty text', () => {
    expect(categorySummary('relationship_training', CATALOG)).toBe('Las sesiones que le asignas.')
    expect(categorySummary('body_progress', CATALOG)).toBeNull()
    expect(categorySummary('relationship_training', undefined)).toBeNull()
  })
})

describe('what the access level says to the coach', () => {
  test('contribute is more than looking, and says so', () => {
    expect(cardAccessLabel('contribute')).toBe('Puedes leer y registrar')
  })

  test('read is only looking', () => {
    expect(cardAccessLabel('read')).toBe('Solo puedes leer')
  })

  /*
   * The relationship screen says the same thing to an administrator about the
   * organization. If these ever read the same, one of the two screens is
   * speaking to the wrong person.
   */
  test('it is said in the second person, not about the organization', () => {
    expect(cardAccessLabel('read')).toContain('Solo puedes')
  })
})

describe('the categories she withdrew', () => {
  test('newest first: the last thing to disappear is what needs explaining', () => {
    const ordered = withdrawalsNewestFirst([
      withdrawal('body_progress', '2026-03-01T10:00:00.000Z'),
      withdrawal('relationship_training', '2026-05-20T08:30:00.000Z'),
      withdrawal('health_context', '2026-04-11T19:00:00.000Z'),
    ])
    expect(ordered.map((entry) => entry.scope_code)).toEqual([
      'relationship_training',
      'health_context',
      'body_progress',
    ])
  })

  test('the answer from the server is left as it arrived', () => {
    const original = [
      withdrawal('body_progress', '2026-03-01T10:00:00.000Z'),
      withdrawal('relationship_training', '2026-05-20T08:30:00.000Z'),
    ]
    withdrawalsNewestFirst(original)
    expect(original[0]?.scope_code).toBe('body_progress')
  })

  test('nothing withdrawn is an empty list, not a missing one', () => {
    expect(withdrawalsNewestFirst([])).toEqual([])
  })
})

/*
 * `HU-STUDIO-084` asks for these three to be told apart: being taken off a
 * client is not the same as the client leaving the gym.
 */
describe('why the caller stopped attending her', () => {
  test('the three reasons read differently', () => {
    const sentences = new Set([
      lossReasonSentence('relationship_ended'),
      lossReasonSentence('assignment_ended'),
      lossReasonSentence('substitution_ended'),
    ])
    expect(sentences.size).toBe(3)
  })

  test('losing the assignment says the link with the gym goes on', () => {
    expect(lossReasonSentence('assignment_ended')).toContain('sigue')
  })

  test('a cover running out names the cover, not the person', () => {
    expect(lossReasonSentence('substitution_ended')).toContain('suplencia')
  })
})

describe('what the panel of categories is showing', () => {
  const section = {
    scope_code: 'relationship_training',
    scope_version: 1,
    access_level: 'read',
    granted_at: '2026-01-01T00:00:00.000Z',
    reads: ['getAuthorizedClientTrainingProfile'],
  } as ClientCardSection

  /*
   * The order matters: nothing shared is answered before anything about the
   * catalogue, so a person who authorized nothing is told at once instead of
   * sitting under a skeleton waiting for names nobody will use.
   */
  test('nothing shared is said at once, even while the names are still coming', () => {
    expect(sectionsState([], undefined, true)).toEqual({ kind: 'none' })
  })

  test('with the names in hand it is ready, and carries them', () => {
    expect(sectionsState([section], CATALOG, false)).toEqual({
      kind: 'ready',
      catalog: CATALOG,
    })
  })

  test('categories without their names yet is waiting, not empty', () => {
    expect(sectionsState([section], undefined, true)).toEqual({ kind: 'naming' })
  })

  test('names that failed to arrive is its own state, because it can be retried', () => {
    expect(sectionsState([section], undefined, false)).toEqual({ kind: 'unnamed' })
  })
})

/*
 * The doors are driven by the card's own `reads`, so a category that gains or
 * loses an operation in the contract changes the screen without anybody editing
 * it.
 */
describe('the doors on each category', () => {
  const reader = { organizationId: '019a0000-org', personId: '019a0000-person' }

  function sectionFor(scope: string, reads: string[]): ClientCardSection {
    return {
      scope_code: scope,
      scope_version: 1,
      access_level: 'read',
      granted_at: '2026-01-01T00:00:00.000Z',
      reads,
    } as ClientCardSection
  }

  test('a category gets one door per read this app can serve', () => {
    const doors = doorsBySection(
      [
        sectionFor('relationship_training', [
          'getAuthorizedClientTrainingProfile',
          'listAuthorizedClientExecutions',
          'getAuthorizedClientProgress',
        ]),
      ],
      reader,
    )
    expect(doors.get('relationship_training')?.map((door) => door.label)).toEqual([
      'Ver el perfil',
      'Ver las sesiones',
      'Ver el progreso',
    ])
  })

  test('a read with no screen yet is no door, rather than one that leads nowhere', () => {
    const doors = doorsBySection(
      [sectionFor('health_context', ['listAuthorizedClientHealthContext'])],
      reader,
    )
    expect(doors.has('health_context')).toBe(false)
  })

  /*
   * The sessions screen mixes what she trained with us and what she trained
   * alone, so both categories name its operation. Two buttons to one screen
   * would make a reader look for the difference between them.
   */
  test('a destination two categories share is offered once, on the first of them', () => {
    const doors = doorsBySection(
      [
        sectionFor('relationship_training', [
          'getAuthorizedClientTrainingProfile',
          'listAuthorizedClientExecutions',
        ]),
        sectionFor('prior_training_history', ['listAuthorizedClientExecutions']),
      ],
      reader,
    )
    expect(doors.get('relationship_training')?.map((door) => door.label)).toEqual([
      'Ver el perfil',
      'Ver las sesiones',
    ])
    expect(doors.has('prior_training_history')).toBe(false)
  })

  test('each door points at a child of the card path', () => {
    expect(clientTrainingProfilePath('019a0000-org', '019a0000-person')).toBe(
      '/organizations/019a0000-org/clients/people/019a0000-person/profile',
    )
    expect(clientExecutionsPath('019a0000-org', '019a0000-person')).toBe(
      '/organizations/019a0000-org/clients/people/019a0000-person/executions',
    )
  })
})

describe('where a card lives', () => {
  test('keyed by the person, because that is what the operation reads', () => {
    expect(clientCardPath('019a0000-org', '019a0000-person')).toBe(
      '/organizations/019a0000-org/clients/people/019a0000-person',
    )
  })
})
