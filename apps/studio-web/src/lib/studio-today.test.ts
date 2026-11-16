import { describe, expect, test } from 'bun:test'

import {
  hiddenCount,
  invitationExpiryPhrase,
  invitationStateLabel,
  noticeHref,
  noticeRowHref,
  noticesInReadingOrder,
  teamRoleSummary,
  trainingRowSentence,
} from './studio-today.js'
import type { StudioToday, TodayLink, TodayTraining } from './studio-api.js'

const ORGANIZATION = '01991600-1000-7000-8000-00000000aaaa'
const PERSON = '01991600-1000-7000-8000-00000000bbbb'
const RELATIONSHIP = '01991600-1000-7000-8000-00000000cccc'

function link(operation_id: TodayLink['operation_id'], query: Record<string, string> = {}) {
  return { operation_id, query } satisfies TodayLink
}

function relationships(count: number) {
  return {
    count,
    items: [
      {
        relationship_id: RELATIONSHIP,
        person_id: PERSON,
        display_name: 'Ada Lovelace',
        started_at: '2026-11-10T00:00:00.000Z',
      },
    ],
    link: link('assignRelationshipHolder'),
  }
}

function trainingItem(
  overrides: Partial<TodayTraining['items'][number]> = {},
): TodayTraining['items'][number] {
  return {
    person_id: PERSON,
    display_name: 'Ada Lovelace',
    relationship_id: RELATIONSHIP,
    closed_week: { week_starts_on: '2026-11-02', planned: 5, not_logged: 3 },
    recent_results: { count: 0, last_ended_at: null },
    ...overrides,
  }
}

describe('the order the panel reads its notices in', () => {
  test('puts a client nobody attends before the caller’s own unlogged sessions', () => {
    const notices: StudioToday['notices'] = {
      team: { count: 4, by_role: [], link: link('listStudioOrganizationMemberships') },
      training: { count: 1, items: [trainingItem()], link: link('getStudioClientCard') },
      unassigned_relationships: relationships(1),
    }

    expect(noticesInReadingOrder(notices)).toEqual(['unassigned_relationships', 'training', 'team'])
  })

  test('is empty when the caller’s roles let her resolve nothing at all', () => {
    expect(noticesInReadingOrder({})).toEqual([])
  })
})

describe('where a notice leads', () => {
  test('carries the narrowing the notice itself asked for into the URL', () => {
    expect(noticeHref(link('listStudioOrganizationClients', { status: 'invited' }), ORGANIZATION)) //
      .toBe(`/organizations/${ORGANIZATION}/clients?status=invited`)
  })

  test('opens a list with no query when the notice sends none', () => {
    expect(noticeHref(link('listStudioOrganizationMemberships'), ORGANIZATION)).toBe(
      `/organizations/${ORGANIZATION}/team`,
    )
    expect(noticeHref(link('listStudioTeamInvitations'), ORGANIZATION)).toBe(
      `/organizations/${ORGANIZATION}/team/invitations`,
    )
  })

  test('has no destination of its own when the operation acts on one thing', () => {
    expect(noticeHref(link('assignRelationshipHolder'), ORGANIZATION)).toBeNull()
    expect(noticeHref(link('terminateRelationship'), ORGANIZATION)).toBeNull()
    expect(noticeHref(link('getStudioClientCard'), ORGANIZATION)).toBeNull()
  })
})

describe('where one row of a notice leads', () => {
  const row = { relationship_id: RELATIONSHIP, person_id: PERSON }

  test('sends an unassigned link and a termination request to the relationship', () => {
    const expected = `/organizations/${ORGANIZATION}/clients/${RELATIONSHIP}`

    expect(noticeRowHref(link('assignRelationshipHolder'), ORGANIZATION, row)).toBe(expected)
    expect(noticeRowHref(link('terminateRelationship'), ORGANIZATION, row)).toBe(expected)
  })

  test('sends a client of the training notice to her card, keyed by the person', () => {
    expect(noticeRowHref(link('getStudioClientCard'), ORGANIZATION, row)).toBe(
      `/organizations/${ORGANIZATION}/clients/people/${PERSON}`,
    )
  })

  test('has no row destination when the operation opens a list', () => {
    expect(noticeRowHref(link('listStudioOrganizationClients'), ORGANIZATION, row)).toBeNull()
  })
})

describe('what a notice covers beyond the rows it lists', () => {
  test('counts the rest when the notice covers more than five', () => {
    expect(hiddenCount({ count: 12, items: [1, 2, 3, 4, 5] })).toBe(7)
  })

  test('is nothing when every row is on screen', () => {
    expect(hiddenCount({ count: 3, items: [1, 2, 3] })).toBe(0)
  })

  test('never reports a negative remainder, whatever the server sends', () => {
    expect(hiddenCount({ count: 1, items: [1, 2] })).toBe(0)
  })
})

describe('what a row of the training notice says', () => {
  test('names the sessions left unlogged against the week that was planned', () => {
    expect(trainingRowSentence(trainingItem())).toBe('3 de 5 sesiones sin registrar')
  })

  test('says one session in the singular', () => {
    const item = trainingItem({
      closed_week: { week_starts_on: '2026-11-02', planned: 1, not_logged: 1 },
    })

    expect(trainingRowSentence(item)).toBe('1 de 1 sesión sin registrar')
  })

  test('names fresh results on their own when nothing was due that week', () => {
    const item = trainingItem({
      closed_week: null,
      recent_results: { count: 2, last_ended_at: '2026-11-12T18:00:00.000Z' },
    })

    expect(trainingRowSentence(item)).toBe('2 resultados nuevos')
  })

  test('says both when both wait, in one line', () => {
    const item = trainingItem({ recent_results: { count: 1, last_ended_at: '2026-11-12T18:00Z' } })

    expect(trainingRowSentence(item)).toBe('3 de 5 sesiones sin registrar · 1 resultado nuevo')
  })

  test('leaves out a closed week that is already complete', () => {
    const item = trainingItem({
      closed_week: { week_starts_on: '2026-11-02', planned: 4, not_logged: 0 },
      recent_results: { count: 3, last_ended_at: '2026-11-12T18:00:00.000Z' },
    })

    expect(trainingRowSentence(item)).toBe('3 resultados nuevos')
  })

  /*
   * The contract puts a client here for one of two reasons, so a row with
   * neither is a server defect. It still has to read as something.
   */
  test('says the week is clear rather than nothing at all', () => {
    const item = trainingItem({ closed_week: null })

    expect(trainingRowSentence(item)).toBe('Sin nada pendiente esta semana')
  })
})

describe('the words beside a count', () => {
  test('tells an unanswered invitation from a lapsed one', () => {
    expect(invitationStateLabel('awaiting')).toBe('Sin responder')
    expect(invitationStateLabel('lapsed')).toBe('Vencida')
  })

  test('puts the deadline in the tense its state asks for', () => {
    expect(invitationExpiryPhrase('awaiting')).toBe('Vence el')
    expect(invitationExpiryPhrase('lapsed')).toBe('Venció el')
  })

  test('summarises the team by role, in the order the server sent', () => {
    const summary = teamRoleSummary([
      { role_code: 'coach', count: 8 },
      { role_code: 'admin', count: 2 },
    ])

    expect(summary).toBe('8 Coach · 2 Administrador')
  })

  /*
   * The role catalogue is the server's, so a code this app has no word for is a
   * catalogue that grew, not a bug to hide. Showing the code is how the client
   * card names a category it cannot translate either.
   */
  test('falls back to the code itself for a role this app has no word for', () => {
    expect(teamRoleSummary([{ role_code: 'physiotherapist', count: 1 }])).toBe('1 physiotherapist')
  })

  test('is empty when the server sent no roles, so the caller sees only the total', () => {
    expect(teamRoleSummary([])).toBe('')
  })
})
