import { describe, expect, test } from 'bun:test'

import {
  archivedItems,
  canReadContent,
  isAdaptation,
  livingItems,
  programItems,
  stateOf,
  templateItems,
  type ContentItem,
} from './organization-content'
import type { OrganizationRole, Program, SessionTemplate } from './studio-api'

/**
 * The one item a fixture produces, asserted rather than assumed: a list that
 * came back empty is a bug in the test, and saying so beats an assertion that
 * silently compares against undefined.
 */
function only(items: readonly ContentItem[]): ContentItem {
  const [item] = items
  if (!item) throw new Error('the fixture produced no content item')
  return item
}

function role(code: string, capabilities: string[]): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'not_granted_by_role',
  } as OrganizationRole
}

/*
 * All three roles the story names hold it: the base catalogue gives
 * `manage_content` to `coach`, and `20260817192832_studio_content_programs.sql`
 * adds `owner` and `admin`.
 */
const OWNER = role('owner', ['manage_roles', 'manage_content'])
const COACH = role('coach', ['assign_programs', 'manage_content'])
const STAFF = role('staff', ['view_directory'])

const DRAFT_ETAG = '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'

function templateVersion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tv-2',
    template_id: 't-1',
    version_number: 2,
    status: 'published',
    published_at: '2026-10-02T14:00:00.000Z',
    ...overrides,
  } as SessionTemplate['versions'][number]
}

function templateDraft(title: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'td-1',
    template_id: 't-1',
    content_schema_version: 1,
    content: { title, activity_type_id: 'a-1', steps: [] },
    derived_from_version_id: null,
    etag: DRAFT_ETAG,
    updated_at: '2026-10-03T10:00:00.000Z',
    ...overrides,
  } as SessionTemplate['draft']
}

function template(overrides: Partial<SessionTemplate> = {}): SessionTemplate {
  return {
    id: 't-1',
    organization_id: 'org-1',
    discipline_code: 'strength',
    status: 'published',
    author_person_id: 'p-1',
    draft: templateDraft('Fuerza tren superior'),
    versions: [templateVersion()],
    ...overrides,
  } as SessionTemplate
}

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: 'p-1',
    organization_id: 'org-1',
    status: 'published',
    author_person_id: 'p-1',
    draft: null,
    versions: [
      {
        id: 'pv-3',
        program_id: 'p-1',
        version_number: 3,
        status: 'published',
        title: 'Bloque de fuerza',
        repeats_forever: false,
        sessions: [],
        published_at: '2026-10-05T14:00:00.000Z',
        session_count: 12,
        deprecated_template_version_ids: [],
      },
    ],
    ...overrides,
  } as Program
}

describe('who may read the content', () => {
  test('a coach, who makes it', () => {
    expect(canReadContent(['coach'], [OWNER, COACH, STAFF])).toBe(true)
  })

  /*
   * The one the simulator got wrong until this screen was built: its catalogue
   * gave `manage_content` to `coach` alone, so an owner would have been refused
   * in a test and allowed in production.
   */
  test('and an owner, who the story names too', () => {
    expect(canReadContent(['owner'], [OWNER, COACH, STAFF])).toBe(true)
  })

  test('not a role without the capability', () => {
    expect(canReadContent(['staff'], [OWNER, COACH, STAFF])).toBe(false)
  })

  test('nobody while the catalogue is unknown', () => {
    expect(canReadContent(['owner'], undefined)).toBe(false)
  })
})

/*
 * Criterion 1: the draft and the published versions are told apart explicitly,
 * and never added together. «3 versiones» would hide that one of them is
 * retired and cannot be assigned any more.
 */
describe('what the state line says', () => {
  test('a draft over published versions says both, separately', () => {
    const item = only(
      templateItems([
        template({
          versions: [templateVersion(), templateVersion({ id: 'tv-1', version_number: 1 })],
        }),
      ]),
    )
    expect(stateOf(item)).toBe('Borrador sin publicar · 2 versiones publicadas')
  })

  test('a retired version is counted apart, never folded in', () => {
    const item = only(
      templateItems([
        template({
          versions: [
            templateVersion(),
            templateVersion({ id: 'tv-1', version_number: 1, status: 'deprecated' }),
          ],
        }),
      ]),
    )
    expect(stateOf(item)).toBe('Borrador sin publicar · 1 versión publicada · 1 retirada')
  })

  test('nothing published yet says only that there is a draft', () => {
    const item = only(templateItems([template({ status: 'draft', versions: [] })]))
    expect(stateOf(item)).toBe('Borrador sin publicar')
  })

  test('a program whose draft was discarded says only what is published', () => {
    expect(stateOf(only(programItems([program()])))).toBe('1 versión publicada')
  })
})

describe('the name a row shows', () => {
  /*
   * The draft's, because the listing gives a template version no title at all
   * (`SessionTemplateVersionSummary`), and because the draft survives
   * publishing — `publish_session_template_version` clears its
   * `derived_from_version_id` and never deletes it.
   */
  test('comes from the draft for a template', () => {
    expect(only(templateItems([template()])).title).toBe('Fuerza tren superior')
  })

  test('and from the newest version for a program with no draft', () => {
    expect(only(programItems([program()])).title).toBe('Bloque de fuerza')
  })

  test('a program draft wins over its versions, as the rename somebody just made', () => {
    const renamed = program({
      draft: {
        id: 'pd-1',
        program_id: 'p-1',
        content_schema_version: 1,
        content: { title: 'Bloque de fuerza II', sessions: [] },
        etag: DRAFT_ETAG,
        updated_at: '2026-10-06T10:00:00.000Z',
      },
    } as Partial<Program>)
    expect(only(programItems([renamed])).title).toBe('Bloque de fuerza II')
  })
})

/*
 * ADR-009: an adaptation keeps its source. The field lives on a template's
 * draft and on its versions and nowhere else — a program is composed of
 * template versions, never adapted from another program.
 */
describe('lineage', () => {
  test('a draft started from a published version is an adaptation', () => {
    const derived = template({
      draft: templateDraft('Fuerza tren superior', { derived_from_version_id: 'tv-1' }),
    })
    expect(isAdaptation(only(templateItems([derived])))).toBe(true)
  })

  test('and so is one whose published version recorded a source', () => {
    const derived = template({ versions: [templateVersion({ derived_from_version_id: 'tv-0' })] })
    expect(isAdaptation(only(templateItems([derived])))).toBe(true)
  })

  test('an ordinary template is not', () => {
    expect(isAdaptation(only(templateItems([template()])))).toBe(false)
  })

  test('and a program never is, because the contract gives it no source', () => {
    expect(isAdaptation(only(programItems([program()])))).toBe(false)
  })
})

describe('what the main list holds', () => {
  const live = template({ id: 't-live' })
  const archived = template({
    id: 't-old',
    status: 'archived',
    draft: templateDraft('Aguantar'),
  })

  test('archived content is kept out of it', () => {
    expect(livingItems(templateItems([live, archived])).map((item) => item.id)).toEqual(['t-live'])
  })

  test('and counted on its own, for a disclosure', () => {
    expect(archivedItems(templateItems([live, archived])).map((item) => item.id)).toEqual(['t-old'])
  })

  test('the list is in Spanish alphabetical order, not the order the server sent', () => {
    const items = templateItems([
      template({ id: 'b', draft: templateDraft('Ñandú') }),
      template({ id: 'a', draft: templateDraft('Natación') }),
    ])
    expect(livingItems(items).map((item) => item.title)).toEqual(['Natación', 'Ñandú'])
  })
})

describe('the order versions come back in', () => {
  test('newest first, whatever the server sent', () => {
    const item = only(
      templateItems([
        template({
          versions: [
            templateVersion({ id: 'tv-1', version_number: 1 }),
            templateVersion({ id: 'tv-3', version_number: 3 }),
            templateVersion({ id: 'tv-2', version_number: 2 }),
          ],
        }),
      ]),
    )
    expect(item.versions.map((version) => version.version_number)).toEqual([3, 2, 1])
  })
})
