import { describe, expect, test } from 'bun:test'

import {
  adherenceHasSessions,
  adherenceWeekName,
  adherenceWeekValue,
  adherenceWeeks,
  hiddenCount,
  invitationExpiryPhrase,
  invitationStateLabel,
  noticeHref,
  noticeRowHref,
  noticesInReadingOrder,
  professionalLoadRows,
  relationshipMonthName,
  relationshipMonths,
  relationshipsChanged,
  teamRoles,
  todayFigures,
  trainingRowSentence,
  weekTicks,
} from './studio-today.js'
import type { StudioToday, TodayInvitations, TodayLink, TodayTraining } from './studio-api.js'

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
  })

  // The invitations are a tab of the team, so the destination names it.
  test('opens the section of a screen whose sections share one address', () => {
    expect(noticeHref(link('listStudioTeamInvitations'), ORGANIZATION)).toBe(
      `/organizations/${ORGANIZATION}/team?tab=invitations`,
    )
  })

  /*
   * Both halves of the address come from different places: the tab from the
   * destination, the narrowing from the notice. Joined with a second `?` they
   * would produce an address the router reads as one long tab name.
   */
  test('joins a narrowing onto a destination that already names a tab', () => {
    expect(noticeHref(link('listStudioTeamInvitations', { status: 'pending' }), ORGANIZATION)).toBe(
      `/organizations/${ORGANIZATION}/team?tab=invitations&status=pending`,
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
})

function invitations(awaiting: number, lapsed: number): TodayInvitations {
  return {
    count: awaiting + lapsed,
    awaiting,
    lapsed,
    items: [],
    link: link('listStudioOrganizationClients', { status: 'invited' }),
  }
}

/*
 * The scoreboard is arithmetic over counts the server already sent. It asks no
 * role and adds no figure the answer does not carry: a group nobody may resolve
 * has no notice, so it has no figure either.
 */
describe('the figures at the head of the panel', () => {
  test('groups every notice an owner who coaches receives, in order of debt', () => {
    const figures = todayFigures({
      team: { count: 12, by_role: [], link: link('listStudioOrganizationMemberships') },
      new_relationships: relationships(3),
      team_invitations: invitations(1, 0),
      training: { count: 6, items: [trainingItem()], link: link('getStudioClientCard') },
      client_invitations: invitations(5, 2),
      termination_requests: {
        count: 1,
        items: [],
        link: link('terminateRelationship'),
      },
      unassigned_relationships: relationships(2),
    })

    expect(figures).toEqual([
      {
        key: 'decisions',
        value: 3,
        label: 'Por decidir',
        detail: '2 sin profesional · 1 por terminar',
        urgent: true,
      },
      {
        key: 'training',
        value: 6,
        label: 'Por revisar',
        detail: 'clientes tuyos esta semana',
        urgent: false,
      },
      {
        key: 'invitations',
        value: 8,
        label: 'Invitaciones',
        detail: '6 sin responder · 2 vencidas',
        urgent: false,
      },
      {
        key: 'new_clients',
        value: 3,
        label: 'Clientes nuevos',
        detail: 'en los últimos 7 días',
        urgent: false,
      },
      {
        key: 'team',
        value: 12,
        label: 'Equipo',
        detail: 'integrantes con rol vigente',
        urgent: false,
      },
    ])
  })

  // The fourth criterion of HU-STUDIO-081: an absent notice is absent here too.
  test('gives a coach the one figure her roles let her resolve', () => {
    const figures = todayFigures({
      training: { count: 1, items: [trainingItem()], link: link('getStudioClientCard') },
    })

    expect(figures).toEqual([
      {
        key: 'training',
        value: 1,
        label: 'Por revisar',
        detail: 'cliente tuyo esta semana',
        urgent: false,
      },
    ])
  })

  test('counts a decision from either notice alone, and names only that one', () => {
    expect(todayFigures({ unassigned_relationships: relationships(4) })[0]).toMatchObject({
      value: 4,
      detail: '4 sin profesional',
    })
    expect(
      todayFigures({
        termination_requests: { count: 2, items: [], link: link('terminateRelationship') },
      })[0],
    ).toMatchObject({ value: 2, detail: '2 por terminar' })
  })

  test('says one lapsed invitation in the singular and leaves out a part that is zero', () => {
    expect(todayFigures({ client_invitations: invitations(0, 1) })[0]).toMatchObject({
      value: 1,
      detail: '1 vencida',
    })
    expect(todayFigures({ team_invitations: invitations(3, 0) })[0]).toMatchObject({
      value: 3,
      detail: '3 sin responder',
    })
  })

  // A notice that arrived with nothing in it still names what it would count.
  test('raises nothing when a decision notice arrives empty', () => {
    expect(todayFigures({ unassigned_relationships: { ...relationships(0), items: [] } })).toEqual([
      { key: 'decisions', value: 0, label: 'Por decidir', detail: 'nada pendiente', urgent: false },
    ])
  })

  test('says one team member in the singular', () => {
    const figures = todayFigures({
      team: { count: 1, by_role: [], link: link('listStudioOrganizationMemberships') },
    })

    expect(figures[0]).toMatchObject({ value: 1, detail: 'integrante con rol vigente' })
  })

  test('is empty when no notice arrived at all', () => {
    expect(todayFigures({})).toEqual([])
  })
})

/*
 * One mark per session that was due in her last closed week: the ones she
 * logged first, then the ones she did not. The row's sentence says the same
 * thing in words, so the marks never have to carry the number alone.
 */
describe('the marks of a client’s closed week', () => {
  test('draws the logged sessions before the ones left unlogged', () => {
    expect(weekTicks({ week_starts_on: '2026-11-02', planned: 5, not_logged: 3 })).toEqual([
      'logged',
      'logged',
      'missing',
      'missing',
      'missing',
    ])
  })

  test('draws a complete week as every session logged', () => {
    expect(weekTicks({ week_starts_on: '2026-11-02', planned: 2, not_logged: 0 })).toEqual([
      'logged',
      'logged',
    ])
  })

  test('draws nothing when no week was due', () => {
    expect(weekTicks(null)).toBeNull()
  })

  // More unlogged than planned would be a server defect; it must not draw extra marks.
  test('never draws more marks than sessions were planned', () => {
    expect(weekTicks({ week_starts_on: '2026-11-02', planned: 2, not_logged: 5 })).toEqual([
      'missing',
      'missing',
    ])
  })

  // Past three a day the marks stop being countable, and the sentence already says it.
  test('draws nothing for a week too long to count at a glance', () => {
    expect(weekTicks({ week_starts_on: '2026-11-02', planned: 22, not_logged: 1 })).toBeNull()
    expect(weekTicks({ week_starts_on: '2026-11-02', planned: 21, not_logged: 1 })).toHaveLength(21)
  })
})

describe('the team by role, one mark per member', () => {
  test('names each role and counts its marks, in the order the server sent', () => {
    expect(
      teamRoles([
        { role_code: 'coach', count: 8 },
        { role_code: 'admin', count: 3 },
        { role_code: 'physiotherapist', count: 1 },
      ]),
    ).toEqual([
      { role_code: 'coach', name: 'Coach', count: 8, marks: 8 },
      { role_code: 'admin', name: 'Administrador', count: 3, marks: 3 },
      { role_code: 'physiotherapist', name: 'physiotherapist', count: 1, marks: 1 },
    ])
  })

  // Past what can be counted at a glance the number stands alone, never a capped row.
  test('draws no marks for a role too large to count, and still says how many', () => {
    expect(teamRoles([{ role_code: 'coach', count: 22 }])).toEqual([
      { role_code: 'coach', name: 'Coach', count: 22, marks: 0 },
    ])
    expect(teamRoles([{ role_code: 'coach', count: 21 }])[0]?.marks).toBe(21)
  })

  test('is empty when the server sent no roles', () => {
    expect(teamRoles([])).toEqual([])
  })
})

describe('adherence, one closed week at a time', () => {
  const week = (week_starts_on: string, planned: number, logged: number) => ({
    week_starts_on,
    planned,
    logged,
  })

  test('says what was logged out of what was due, as a whole percentage', () => {
    expect(
      adherenceWeeks({
        clients: 6,
        weeks: [week('2026-09-21', 14, 11), week('2026-11-09', 42, 36)],
      }),
    ).toEqual([
      { starts_on: '2026-09-21', week: '21 sep', rate: 79, planned: 14, logged: 11 },
      { starts_on: '2026-11-09', week: '9 nov', rate: 86, planned: 42, logged: 36 },
    ])
  })

  // Nothing due is not zero percent: nobody failed a week that asked for nothing.
  test('leaves a week with nothing due without a rate', () => {
    expect(adherenceWeeks({ clients: 6, weeks: [week('2026-09-28', 0, 0)] })).toEqual([
      { starts_on: '2026-09-28', week: '28 sep', rate: null, planned: 0, logged: 0 },
    ])
  })

  // Rounding may not claim a full week that was not, nor erase a session that was logged.
  test('keeps 100 for a complete week and 0 for an empty one', () => {
    const rates = (planned: number, logged: number) =>
      adherenceWeeks({ clients: 1, weeks: [week('2026-11-02', planned, logged)] })[0]?.rate

    expect(rates(200, 199)).toBe(99)
    expect(rates(200, 200)).toBe(100)
    expect(rates(300, 1)).toBe(1)
    expect(rates(300, 0)).toBe(0)
  })

  test('knows whether any week has something to plot', () => {
    expect(adherenceHasSessions(adherenceWeeks({ clients: 2, weeks: [] }))).toBe(false)
    expect(
      adherenceHasSessions(adherenceWeeks({ clients: 2, weeks: [week('2026-11-02', 0, 0)] })),
    ).toBe(false)
    expect(
      adherenceHasSessions(
        adherenceWeeks({ clients: 2, weeks: [week('2026-10-26', 0, 0), week('2026-11-02', 3, 0)] }),
      ),
    ).toBe(true)
  })

  test('names a week and its value in full, for the tooltip and the table', () => {
    const [first, single] = adherenceWeeks({
      clients: 6,
      weeks: [week('2026-09-21', 14, 11), week('2026-12-28', 1, 1)],
    })

    expect(first && adherenceWeekName(first)).toBe('Semana del 21 de septiembre')
    expect(first && adherenceWeekValue(first)).toBe('79 % · 11 de 14 sesiones')
    expect(single && adherenceWeekName(single)).toBe('Semana del 28 de diciembre')
    expect(single && adherenceWeekValue(single)).toBe('100 % · 1 de 1 sesión')
  })

  // A date this app cannot read is the server's to fix; the axis still names the week.
  test('falls back to what the server sent for a date it cannot read', () => {
    const [odd] = adherenceWeeks({ clients: 1, weeks: [week('pronto', 2, 1)] })

    expect(odd?.week).toBe('pronto')
    expect(odd && adherenceWeekName(odd)).toBe('Semana del pronto')
  })
})

describe('relationships begun and ended, month by month', () => {
  test('names each month the way an axis has room for', () => {
    expect(
      relationshipMonths({
        months: [
          { month: '2026-12', started: 4, ended: 1 },
          { month: '2027-01', started: 0, ended: 3 },
        ],
      }),
    ).toEqual([
      { key: '2026-12', month: 'dic', started: 4, ended: 1 },
      { key: '2027-01', month: 'ene', started: 0, ended: 3 },
    ])
  })

  test('names a month in full, with its year', () => {
    const [december] = relationshipMonths({ months: [{ month: '2026-12', started: 4, ended: 1 }] })

    expect(december && relationshipMonthName(december)).toBe('Diciembre de 2026')
  })

  test('knows whether anything began or ended at all', () => {
    const quiet = relationshipMonths({ months: [{ month: '2026-06', started: 0, ended: 0 }] })
    const moved = relationshipMonths({
      months: [
        { month: '2026-06', started: 0, ended: 0 },
        { month: '2026-07', started: 0, ended: 1 },
      ],
    })

    expect(relationshipsChanged(quiet)).toBe(false)
    expect(relationshipsChanged(moved)).toBe(true)
  })
})

describe('the clients each professional holds', () => {
  const MEMBERSHIP = '01991600-1000-7000-8000-00000000dddd'
  const OTHER = '01991600-1000-7000-8000-00000000eeee'

  // The order is the server's: most clients first, and the one with none still listed.
  test('keeps the order and the zero the server sent', () => {
    expect(
      professionalLoadRows({
        count: 2,
        unassigned: 1,
        items: [
          { membership_id: MEMBERSHIP, display_name: 'Laura Gómez', clients: 14 },
          { membership_id: OTHER, display_name: 'Sofía Peña', clients: 0 },
        ],
      }),
    ).toEqual([
      { id: MEMBERSHIP, label: 'Laura Gómez', value: 14 },
      { id: OTHER, label: 'Sofía Peña', value: 0 },
    ])
  })

  // The contract lists twelve at most and counts everyone, like a notice does.
  test('counts who it holds beyond the ones it lists', () => {
    expect(
      hiddenCount({
        count: 15,
        items: Array.from({ length: 12 }, () => ({})),
      }),
    ).toBe(3)
  })
})
