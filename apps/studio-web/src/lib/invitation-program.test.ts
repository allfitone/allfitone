import { describe, expect, test } from 'bun:test'

import {
  canProposeProgram,
  isProposing,
  noProgram,
  proposableVersions,
  todayIn,
  trainingScopeOffered,
  validateProgramDraft,
} from './invitation-program'
import type { OfferableScope, OrganizationRole, Program } from './studio-api'

function role(code: string, capabilities: string[]): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'not_granted_by_role',
  } as OrganizationRole
}

/*
 * The real catalogue, as `20260812130000_studio_team_directory_and_role_catalog.sql`
 * publishes it: `('coach', 'assign_programs')` and nothing else. An owner can
 * invite and cannot propose, which is the whole reason this gate is separate
 * from `canInviteClients`.
 */
const COACH = role('coach', ['invite_clients', 'assign_programs'])
const OWNER = role('owner', ['invite_clients', 'manage_roles'])

function version(overrides: Partial<Program['versions'][number]> = {}) {
  return {
    id: '018f6f8d-2b00-7a00-8000-000000000201',
    program_id: '018f6f8d-2b00-7a00-8000-000000000200',
    version_number: 1,
    status: 'published',
    title: 'Bloque de fuerza',
    repeats_forever: false,
    sessions: [],
    published_at: '2026-07-27T09:12:00-05:00',
    session_count: 12,
    deprecated_template_version_ids: [],
    ...overrides,
  } as Program['versions'][number]
}

function program(overrides: Partial<Program> = {}): Program {
  return {
    id: '018f6f8d-2b00-7a00-8000-000000000200',
    organization_id: '018f6f8d-1000-7000-8000-000000000001',
    status: 'published',
    author_person_id: '018f6f8d-7000-7000-8000-000000000002',
    draft: null,
    versions: [version()],
    ...overrides,
  } as Program
}

describe('who may propose a program', () => {
  test('a coach, who is the only role holding assign_programs', () => {
    expect(canProposeProgram(['coach'], [COACH, OWNER])).toBe(true)
  })

  // The one that matters: inviting and proposing are different capabilities,
  // so an owner reaches this screen and gets no program block.
  test('not an owner, who may invite but not assign programs', () => {
    expect(canProposeProgram(['owner'], [COACH, OWNER])).toBe(false)
  })

  test('nobody while the catalogue is still unknown', () => {
    expect(canProposeProgram(['coach'], undefined)).toBe(false)
  })
})

describe('whether a program can be offered at all', () => {
  const scope = (code: string) => ({ scope_code: code }) as OfferableScope

  test('not when the gym cannot even ask for training', () => {
    expect(trainingScopeOffered([scope('body_progress')])).toBe(false)
  })

  test('yes when the training scope is published', () => {
    expect(trainingScopeOffered([scope('relationship_training')])).toBe(true)
  })
})

/*
 * The picker has to offer exactly the set `create_client_invitation` accepts:
 * published, ours, and the program not archived. Offering anything else buys a
 * `22023` whose field the API drops, so the reader would get a refusal with
 * nothing to act on.
 */
describe('which versions the picker offers', () => {
  test('a published version of a live program', () => {
    expect(proposableVersions([program()])).toHaveLength(1)
  })

  test('never a deprecated version, which is a retired one', () => {
    expect(
      proposableVersions([program({ versions: [version({ status: 'deprecated' })] })]),
    ).toEqual([])
  })

  test('never anything from an archived program', () => {
    expect(proposableVersions([program({ status: 'archived' })])).toEqual([])
  })

  test('a program with only a draft offers nothing', () => {
    expect(proposableVersions([program({ versions: [] })])).toEqual([])
  })

  test('it carries what the picker has to show', () => {
    expect(proposableVersions([program()])[0]).toMatchObject({
      version_id: '018f6f8d-2b00-7a00-8000-000000000201',
      title: 'Bloque de fuerza',
      version_number: 1,
      session_count: 12,
    })
  })

  // Two versions of the same program are both offerable, and the newer one is
  // listed first: that is the one a coach almost always means.
  test('the newest version of a title comes first', () => {
    const offered = proposableVersions([
      program({
        versions: [
          version({ version_number: 1, id: 'v1' }),
          version({ version_number: 3, id: 'v3' }),
        ],
      }),
    ])
    expect(offered.map((entry) => entry.version_id)).toEqual(['v3', 'v1'])
  })
})

describe('what the form refuses to propose', () => {
  test('nothing at all when no program is being proposed', () => {
    expect(validateProgramDraft(noProgram, '2026-11-06')).toEqual({})
  })

  // Criterion: a version, a start and a zone, or no proposal. The zone is the
  // browser's, so the only one a person can leave out is the date.
  test('a version with no start date', () => {
    expect(
      validateProgramDraft({ versionId: 'v1', startsOn: '' }, '2026-11-06').startsOn,
    ).toBeTruthy()
  })

  test('a start that already passed', () => {
    const errors = validateProgramDraft({ versionId: 'v1', startsOn: '2026-11-05' }, '2026-11-06')
    expect(errors.startsOn).toContain('ya pasó')
  })

  test('today is allowed, which is the edge the server also allows', () => {
    expect(validateProgramDraft({ versionId: 'v1', startsOn: '2026-11-06' }, '2026-11-06')).toEqual(
      {},
    )
  })

  // A date left behind in the field after un-choosing the program is not an
  // error: nothing is proposed, so there is nothing to refuse.
  test('a leftover date with no version chosen', () => {
    expect(validateProgramDraft({ versionId: '', startsOn: '2020-01-01' }, '2026-11-06')).toEqual(
      {},
    )
  })
})

/*
 * The server compares the start against `clock_timestamp() at time zone` the
 * proposal's own zone. Comparing against the device's local date instead would
 * refuse a valid start, or send one the server rejects, for most of a day
 * whenever the two disagree.
 */
describe('what today means', () => {
  const instant = new Date('2026-11-06T04:00:00.000Z')

  test('the same instant is a different date in two zones', () => {
    expect(todayIn('America/Bogota', instant)).toBe('2026-11-05')
    expect(todayIn('Asia/Tokyo', instant)).toBe('2026-11-06')
  })

  test('and it is formatted the way a date input reads it', () => {
    expect(todayIn('UTC', instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('isProposing', () => {
  test('a chosen version means yes', () => {
    expect(isProposing({ versionId: 'v1', startsOn: '' })).toBe(true)
  })

  test('and an empty one means no', () => {
    expect(isProposing(noProgram)).toBe(false)
  })
})
