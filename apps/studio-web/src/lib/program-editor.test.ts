import { describe, expect, test } from 'bun:test'

import {
  addSession,
  buildProgramContent,
  composableTemplates,
  moveSession,
  nextSlot,
  programEditorFromContent,
  programIssueMessages,
  removeSession,
  retiredSessions,
  sessionsByWeek,
  templateVersionIndex,
  weekOptions,
  type ProgramEditorDraft,
} from './program-editor'
import type { SessionTemplate } from './studio-api'

const V2 = '01991600-a000-7000-8000-000000000021'
const V1 = '01991600-a000-7000-8000-000000000022'
const OTHER = '01991600-a000-7000-8000-000000000031'

function template(
  overrides: Partial<SessionTemplate> & Pick<SessionTemplate, 'id'>,
): SessionTemplate {
  return {
    organization_id: '01991600-1000-7000-8000-000000000002',
    discipline_code: 'strength',
    status: 'published',
    author_person_id: '01991600-7000-7000-8000-000000000002',
    draft: {
      id: `${overrides.id}-draft`,
      template_id: overrides.id,
      content_schema_version: 1,
      content: { title: 'Fuerza tren superior', activity_type_id: null, steps: [] },
      derived_from_version_id: null,
      etag: '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      updated_at: '2026-10-03T10:00:00.000Z',
    },
    versions: [],
    ...overrides,
  }
}

const strength = template({
  id: '01991600-a000-7000-8000-000000000001',
  versions: [
    {
      id: V2,
      template_id: '01991600-a000-7000-8000-000000000001',
      version_number: 2,
      status: 'published',
      published_at: '2026-10-02T14:00:00.000Z',
    },
    {
      id: V1,
      template_id: '01991600-a000-7000-8000-000000000001',
      version_number: 1,
      status: 'deprecated',
      published_at: '2026-08-02T14:00:00.000Z',
    },
  ],
})

const draftOnly = template({
  id: '01991600-a000-7000-8000-000000000002',
  status: 'draft',
  draft: {
    id: 'draft-2',
    template_id: '01991600-a000-7000-8000-000000000002',
    content_schema_version: 1,
    content: { title: 'Movilidad matutina', activity_type_id: null, steps: [] },
    derived_from_version_id: null,
    etag: '"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
    updated_at: '2026-10-04T10:00:00.000Z',
  },
})

const retiredOnly = template({
  id: '01991600-a000-7000-8000-000000000003',
  draft: {
    id: 'draft-3',
    template_id: '01991600-a000-7000-8000-000000000003',
    content_schema_version: 1,
    content: { title: 'Circuito de verano', activity_type_id: null, steps: [] },
    derived_from_version_id: null,
    etag: '"sha256:ccccccccccccccccccccccccccccccccccccccccccc"',
    updated_at: '2026-10-04T10:00:00.000Z',
  },
  versions: [
    {
      id: OTHER,
      template_id: '01991600-a000-7000-8000-000000000003',
      version_number: 1,
      status: 'deprecated',
      published_at: '2026-07-02T14:00:00.000Z',
    },
  ],
})

let counter = 0
function key(): string {
  counter += 1
  return `session-${counter}`
}

function draft(sessions: Array<[number, number, string]>): ProgramEditorDraft {
  return {
    title: 'Hipertrofia',
    notes: '',
    repeatsForever: false,
    sessions: sessions.map(([week, day, templateVersionId]) => ({
      key: key(),
      week,
      day,
      templateVersionId,
    })),
  }
}

describe('the versions a program can name', () => {
  test('indexes every published version by id, with the name of its template', () => {
    const index = templateVersionIndex([strength, draftOnly])
    expect(index.get(V2)).toMatchObject({
      templateTitle: 'Fuerza tren superior',
      versionNumber: 2,
      retired: false,
    })
    expect(index.get(V1)?.retired).toBe(true)
    // A draft is not a version, so a template with only a draft adds nothing.
    expect(index.size).toBe(2)
  })

  /*
   * Criterion 2: no template draft can be composed. A template with nothing but
   * a draft, and one whose every version is retired, have nothing to offer.
   */
  test('offers only templates with a version that can still be added', () => {
    const offered = composableTemplates([retiredOnly, draftOnly, strength])
    expect(offered.map((entry) => entry.title)).toEqual(['Fuerza tren superior'])
  })

  /*
   * Criterion 1: an exact version, never «the latest». Every version is
   * listed by number, newest first, and a retired one is shown but cannot be
   * picked, because the server refuses a new reference to it.
   */
  test('lists each version by number, the retired ones disabled', () => {
    const [offered] = composableTemplates([strength])
    expect(offered?.versions.map((version) => [version.versionNumber, version.retired])).toEqual([
      [2, false],
      [1, true],
    ])
  })

  test('leaves archived templates out of the composition', () => {
    const archived = { ...strength, status: 'archived' as const }
    expect(composableTemplates([archived])).toEqual([])
  })
})

describe('editing the sessions', () => {
  test('reads the draft in position order', () => {
    const editor = programEditorFromContent(
      {
        title: 'Hipertrofia',
        notes: null,
        sessions: [
          { position: 2, week: 1, day: 3, template_version_id: V1 },
          { position: 1, week: 1, day: 1, template_version_id: V2 },
        ],
      },
      key,
    )
    expect(editor.sessions.map((session) => session.day)).toEqual([1, 3])
    expect(editor.notes).toBe('')
    // Absent means false, which is what the server reads it as.
    expect(editor.repeatsForever).toBe(false)
  })

  test('groups sessions by week, in day order', () => {
    const editor = draft([
      [2, 1, V2],
      [1, 5, V2],
      [1, 2, V2],
    ])
    expect(
      sessionsByWeek(editor.sessions).map((week) => [week.week, week.sessions.map((s) => s.day)]),
    ).toEqual([
      [1, [2, 5]],
      [2, [1]],
    ])
  })

  test('keeps two sessions on the same day in the order they were added', () => {
    const editor = addSession(draft([[1, 1, V2]]), { week: 1, day: 1, templateVersionId: V1 }, key)
    const [week] = sessionsByWeek(editor.sessions)
    expect(week?.sessions.map((session) => session.templateVersionId)).toEqual([V2, V1])
  })

  test('moves a session to another week or day, and removes one', () => {
    const editor = draft([
      [1, 1, V2],
      [1, 3, V2],
    ])
    const target = editor.sessions[1]
    if (!target) throw new Error('fixture')
    const moved = moveSession(editor, target.key, { week: 3 })
    expect(moved.sessions.find((session) => session.key === target.key)).toMatchObject({
      week: 3,
      day: 3,
    })
    expect(removeSession(moved, target.key).sessions).toHaveLength(1)
  })

  test('suggests the day after the last session, wrapping into the next week', () => {
    expect(nextSlot(draft([]))).toEqual({ week: 1, day: 1 })
    expect(nextSlot(draft([[1, 3, V2]]))).toEqual({ week: 1, day: 4 })
    expect(nextSlot(draft([[2, 7, V2]]))).toEqual({ week: 3, day: 1 })
    expect(nextSlot(draft([[104, 7, V2]]))).toEqual({ week: 104, day: 7 })
  })

  test('offers the weeks in use and one more, up to the limit of 104', () => {
    expect(weekOptions(draft([]).sessions)).toEqual([1])
    expect(weekOptions(draft([[3, 1, V2]]).sessions)).toEqual([1, 2, 3, 4])
    expect(weekOptions(draft([[104, 1, V2]]).sessions).at(-1)).toBe(104)
  })

  test('names the sessions whose version is retired', () => {
    const index = templateVersionIndex([strength])
    const editor = draft([
      [1, 1, V2],
      [2, 1, V1],
    ])
    expect(retiredSessions(editor.sessions, index).map((session) => session.week)).toEqual([2])
  })
})

describe('building what is saved', () => {
  /*
   * Position is continuous across the whole program and follows week and
   * day, which is the order the calendar is drawn in.
   */
  test('numbers positions by week and day', () => {
    const built = buildProgramContent(
      draft([
        [2, 1, V1],
        [1, 4, V2],
        [1, 1, V2],
      ]),
    )
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content.sessions).toEqual([
      { position: 1, week: 1, day: 1, template_version_id: V2 },
      { position: 2, week: 1, day: 4, template_version_id: V2 },
      { position: 3, week: 2, day: 1, template_version_id: V1 },
    ])
  })

  test('trims the name, sends empty notes as null and states repeating', () => {
    const built = buildProgramContent({
      ...draft([[1, 1, V2]]),
      title: '  Hipertrofia  ',
      notes: '   ',
      repeatsForever: true,
    })
    if (!('content' in built)) throw new Error('expected content')
    expect(built.content).toMatchObject({
      title: 'Hipertrofia',
      notes: null,
      repeats_forever: true,
    })
  })

  test('refuses an empty or long name and long notes before sending', () => {
    const built = buildProgramContent({ ...draft([]), title: ' ', notes: 'x'.repeat(2001) })
    expect(built).toEqual({
      problems: {
        title: 'Escribe el nombre del programa.',
        notes: 'Las notas admiten hasta 2000 caracteres.',
      },
    })
    const long = buildProgramContent({ ...draft([]), title: 'x'.repeat(161) })
    expect('problems' in long && long.problems.title).toBe('El nombre admite hasta 160 caracteres.')
  })

  test('saves a draft with no sessions, which only publishing refuses', () => {
    const built = buildProgramContent(draft([]))
    expect('content' in built && built.content.sessions).toEqual([])
  })

  test('refuses more sessions than a program holds', () => {
    const many = draft(Array.from({ length: 731 }, () => [1, 1, V2] as [number, number, string]))
    expect(buildProgramContent(many)).toEqual({
      problems: { sessions: 'Un programa admite hasta 730 sesiones.' },
    })
  })
})

describe('answering the server', () => {
  test('says what each refusal means, once each', () => {
    expect(
      programIssueMessages(['template-version-deprecated', 'template-version-deprecated'], 'save'),
    ).toEqual([
      'Agregaste una versión retirada. Las que el programa ya tenía se conservan, pero no se pueden sumar nuevas.',
    ])
    expect(programIssueMessages(['template-version'], 'save')).toEqual([
      'Una sesión usa una versión de plantilla que no es de esta organización o ya no existe.',
    ])
  })

  // `sessions` is the same code for two different refusals.
  test('reads `sessions` as too many when saving and as none when publishing', () => {
    expect(programIssueMessages(['sessions'], 'save')).toEqual([
      'Un programa admite hasta 730 sesiones.',
    ])
    expect(programIssueMessages(['sessions'], 'publish')).toEqual([
      'El programa necesita al menos una sesión para publicarse.',
    ])
  })

  test('names a code it does not know instead of hiding it', () => {
    expect(programIssueMessages(['something-new'], 'save')).toEqual([
      'El servidor rechazó un valor del borrador (something-new).',
    ])
  })
})
