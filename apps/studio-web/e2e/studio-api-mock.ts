import type { Page, Request, Route } from '@playwright/test'

const API_ORIGIN = 'http://127.0.0.1:8080'
const STUDIO_ORIGIN = 'http://127.0.0.1:3101'
export const TEST_ANALYTICS_ID = `a1_${'A'.repeat(43)}`

export interface MockRequest {
  method: string
  path: string
  search: string
  headers: Record<string, string>
  body: unknown
}

export interface MockResponse {
  status: number
  body?: unknown
  headers?: Record<string, string>
  /** A binary answer, such as an image the API streams; sent as is, never as JSON. */
  bytes?: Buffer
}

export interface StudioGuestQuotaBody {
  seats: number | null
  occupied: number
  places_left: number | null
  over_quota: boolean
}

export interface StudioApiFixture {
  session: unknown
  memberships: unknown[]
  organizationMemberships: unknown[]
  organizationClients: unknown[]
  /**
   * `null` derives it from the list, which is a gym nobody capped. Set it to
   * hold the gym at its quota: the figure counts the whole gym, so it is not the
   * length of what this caller may read.
   */
  guestQuota: StudioGuestQuotaBody | null
  authorizedScopes: unknown[]
  /**
   * The card of the person `activeClient` names. `null` is the `404`
   * `OP-REL-019` answers for a person who does not exist and for one the
   * caller does not attend — the same answer for both, on purpose.
   */
  clientCard: unknown
  /**
   * The training profile `OP-IDN-018` answers. `null` is its `403`
   * `scope-required` — she shares nothing of the category, which the route
   * records as a refused read, not an empty answer.
   */
  clientTrainingProfile: unknown
  /**
   * Her executed sessions, newest first. An empty array is what `OP-EXE-017`
   * answers both for a person who trained nothing and for one who shares
   * neither category — the refusal is recorded, never returned, so the two are
   * the same answer here as in production.
   */
  clientExecutions: unknown[]
  /** `stale` answers `422` to any request carrying a cursor, as a moved list does. */
  executionsCursor: 'ok' | 'stale'
  /** One of her sessions in full, as `OP-EXE-018` answers it. */
  clientExecutionDetail: unknown
  /**
   * Which answer the detail gives. `not-found` is the one `404` that stands for
   * six different reasons — hidden, unfinished, annulled, another
   * relationship's, another person's or none at all — and `scope-required` the
   * `403` she gets only while she shares neither training category.
   */
  executionDetailOutcome: 'ok' | 'not-found' | 'scope-required'
  /**
   * How her training is going. `null` is the `403` `scope-required` the route
   * answers when she shares neither category — with nothing to compute from, it
   * refuses rather than answering zeros.
   */
  clientProgress: unknown
  /**
   * The programs this relationship gave her, newest first. An empty array is
   * the page `OP-PLN-018` answers when nothing was assigned; `null` is its
   * `403` `scope-required`, which is a refusal recorded and not an empty page.
   */
  relationshipAssignments: unknown[] | null
  /** `stale` answers `422` to any request carrying a cursor, as a moved list does. */
  assignmentsCursor: 'ok' | 'stale'
  /**
   * Which answer `OP-PLN-010` gives. `created` and `overlaps` are the two
   * successes — an overlap warns and never blocks — and the rest are the
   * refusals the function can raise, including its three distinct `422` codes.
   */
  assignOutcome:
    | 'created'
    | 'overlaps'
    | 'scope-required'
    | 'forbidden'
    | 'service-paused'
    | 'program-version'
    | 'starts-on'
    | 'timezone'
  relationshipState: unknown
  relationshipHistory: unknown[]
  assignmentOutcome: 'created' | 'taken' | 'forbidden'
  reassignmentOutcome: 'reassigned' | 'no-holder' | 'forbidden'
  /**
   * `proposed` adds the pending cover to the fixture, the way the command does.
   * `already-proposed` is the `409` a partial unique index raises when the same
   * professional is already waiting on an answer for the same days — a double
   * click lands there, which is why the screen offers no retry.
   */
  substitutionOutcome: 'proposed' | 'already-proposed' | 'forbidden'
  /**
   * `ended` closes the cover in the fixture, the way the command does — the
   * screen refetches rather than trusting the answer, so the list has to agree.
   * `already-ended` is the `409` for a cover that is no longer running.
   */
  substitutionEndOutcome: 'ended' | 'already-ended' | 'forbidden'
  /**
   * `terminated` closes the relationship in the fixture, the way the command
   * does: the screen refetches rather than trusting the answer, so the page has
   * to agree with it.
   */
  terminationOutcome: 'terminated' | 'already-ended' | 'forbidden'
  organizationSubscriptions: unknown[]
  /** What `GET /plans` answers: published plans first, then drafts, each by name. */
  organizationPlans: unknown[]
  /**
   * `applied` moves the row in the fixture, the way the real command does; the other two
   * are the refusals the screen has wording for. `no-cause` is `409` on a reactivation
   * whose block the database cannot find — a state these operations cannot produce, which
   * is why the screen says it is not a retry.
   */
  subscriptionOutcome: 'applied' | 'no-cause' | 'forbidden'
  roleGrantOutcome: 'granted' | 'rejected' | 'forbidden'
  roleRevokeOutcome: 'revoked' | 'gone' | 'forbidden'
  membershipTerminationOutcome: 'terminated' | 'rejected' | 'forbidden'
  /**
   * No `forbidden` here, and that is the contract rather than an omission: the
   * command resolves the membership from the person in the session, so there is
   * no permission dimension to refuse on. `rejected` is the owner (`422`) and
   * `gone` is a membership somebody else closed first (`404`).
   */
  membershipResignationOutcome: 'resigned' | 'rejected' | 'gone'
  /** What `GET /programs` answers; the picker offers only published versions. */
  organizationPrograms: unknown[]
  /** What `GET /session-templates` answers. */
  organizationSessionTemplates: unknown[]
  /** What `GET /catalog/disciplines` answers: what Backoffice has published. */
  disciplines: Array<{ code: string; name: string }>
  /**
   * `created` adds the template and its empty first draft to the list, the way
   * the command does. `not-found` is how `planning.assert_manage_content`
   * answers a missing capability or an organization that is no longer active.
   */
  templateCreateOutcome: 'created' | 'not-found'
  /**
   * What `catalog.search_organization_movements` searches. The other names are
   * matched but never answered — `StudioMovement` does not carry them — so they
   * sit beside the movement here and the mock strips them, as the route does.
   */
  movements: Array<{
    movement: Record<string, unknown>
    aliases: string[]
    /** What an edit names in `expected_revision`; 1 when absent. */
    revision?: number
    variantOf?: Record<string, unknown> | null
    /** True once a published version uses one of the organization's own. */
    nameLocked?: boolean
  }>
  /**
   * `saved` applies an edit the way `catalog.update_organization_movement`
   * does. `stale` makes the next edit meet a teammate's first, once.
   */
  movementEditOutcome: 'saved' | 'stale'
  /** What `GET /catalog/activity-types` answers, each with the family of its targets. */
  activityTypes: Array<{
    id: string
    discipline_code: string
    code: string
    name: string
    activity_family: 'strength' | 'endurance' | 'interval' | 'mobility' | null
  }>
  /**
   * `saved` replaces the draft the way `planning.replace_session_template_draft`
   * does, and answers a stale ETag with `409` and the current draft. `stale`
   * makes the next save meet somebody else's, once: the draft changes under it
   * first, as it would if a teammate had saved.
   */
  draftSaveOutcome: 'saved' | 'stale'
  /**
   * The content each template's newest version was published with, by
   * template. A version summary does not carry it, and the server compares a
   * publication against it to decide whether anything changed.
   */
  publishedContents: Record<string, string>
  /**
   * `saved` replaces a program draft the way `planning.replace_program_draft`
   * does. `stale` makes the next save meet a teammate's, once.
   */
  programDraftSaveOutcome: 'saved' | 'stale'
  /** The content each program's newest version was published with, as for templates. */
  publishedProgramContents: Record<string, string>
  /** Every template version's content, by version id: what reading one answers. */
  templateVersionContents: Record<string, Record<string, unknown>>
  /**
   * `closed` ends the organization and reports how many relationships it took
   * with it, the way the response does. `rejected` is the `422` the screen
   * tries to prevent — a subscription that was still live when the transaction
   * ran — and `not-allowed` is somebody who stopped being the owner.
   */
  organizationClosureOutcome: 'closed' | 'rejected' | 'not-allowed'
  /** How many relationships the closure reports having ended. */
  closedRelationships: number
  /**
   * `proposed` accepts the program. `stale` is the only refusal the form cannot
   * prevent: a `422` for a version somebody retired while the form was open,
   * which is what the copy tells the reader to re-read.
   */
  programProposalOutcome: 'proposed' | 'stale'
  offerableScopes: unknown[]
  informationCategories: unknown[]
  organization: unknown
  organizationRoles: unknown[]
  organizationTypes: unknown[]
  me: { profile: Record<string, unknown> | null; memberships: unknown[] }
  specialties: Array<{ code: string; name: string; description: string | null }>
  credentialTypes: Array<{ code: string; name: string; description: string | null }>
  signedOut: boolean
  requests: MockRequest[]
  /** The organization's historical access cases, newest first, as `OP-PRV-025` lists them. */
  historicalCases: unknown[]
  /**
   * What `OP-PRV-018` answers. `reauthenticate` is a sign-in older than ten
   * minutes; `conflict` is either cause of the 409, which the API does not tell
   * apart; `ineligible` is the member the case names no longer qualifying.
   */
  historicalOpenOutcome: 'opened' | 'reauthenticate' | 'conflict' | 'ineligible'
  /**
   * What `OP-PRV-020` answers for the relationship. Its `case` is replaced by the
   * case the request names, which must be open and name the member signed in;
   * anything else is the 404 the API answers for every reason.
   */
  historicalRelationship: Record<string, unknown>
  frozenExecutions: unknown[]
  frozenBodyProgress: unknown[]
  frozenGoalVersions: unknown[]
  /** `reauthenticate` is every read through a case finding the sign-in too old. */
  historicalReadOutcome: 'ok' | 'reauthenticate'
  /** Reads that answer 403 `scope-required`, by the last segment of their path. */
  frozenRefused: Array<'executions' | 'body-progress' | 'goal-versions'>
  /** What `OP-PRV-019` answers: the case closed, a role that cannot, or no such case. */
  historicalCloseOutcome: 'closed' | 'forbidden' | 'gone'
  /** `OP-IDN-020`. Her claims, newest first; null is the 403 of nothing shared. */
  clientHealthContext: unknown[] | null
  /** `OP-IDN-019`. Her measurements, newest day first; null is the 403 of nothing shared. */
  clientBodyProgress: unknown[] | null
  /** `OP-IDN-059`. The photos she shows this gym, newest first. */
  clientBodyPhotos: unknown[]
  /** What `OP-IDN-060` answers for any photo: its bytes, the one 404, or a dropped connection. */
  bodyPhotoOutcome: 'shown' | 'unavailable' | 'failure'
  intercept?: (
    request: MockRequest,
    fixture: StudioApiFixture,
  ) => MockResponse | undefined | Promise<MockResponse | undefined>
}

/*
 * Timestamps carry a real time of day on purpose. `joined_at` and `ended_at`
 * are `format: date-time` and the database fills them with `clock_timestamp()`,
 * so no real row is ever midnight UTC. Fixtures that were made the screens read
 * a day early west of Greenwich — "31/12/2024" for a membership that started on
 * 1 January — which is correct for that instant and looks exactly like a bug.
 */
export const activeMembership = {
  membership_id: '01991600-1000-7000-8000-000000000001',
  organization_id: '01991600-1000-7000-8000-000000000002',
  display_name: 'Allfit Gym',
  type_code: 'gym',
  status: 'active',
  joined_at: '2025-01-01T14:32:07.418Z',
  ended_at: null,
  roles: ['owner'],
}

export const secondActiveMembership = {
  membership_id: '01991600-1000-7000-8000-000000000003',
  organization_id: '01991600-1000-7000-8000-000000000004',
  display_name: 'Movimiento Studio',
  type_code: 'studio',
  status: 'active',
  joined_at: '2025-02-01T09:11:53.204Z',
  ended_at: null,
  roles: ['coach'],
}

/**
 * The holder, signed in. `membership_id` matches `relationshipState.holder`
 * on purpose: in production both are `organization_memberships.id`, so a
 * persona whose id differs could never be recognised as the holder — and the
 * holder is the one actor `OP-REL-004` adds over its sibling operations.
 */
export const holderMembership = {
  membership_id: '01991600-7000-7000-8000-000000000002',
  organization_id: '01991600-1000-7000-8000-000000000002',
  display_name: 'Allfit Gym',
  type_code: 'gym',
  status: 'active',
  joined_at: '2025-02-01T09:11:53.204Z',
  ended_at: null,
  roles: ['coach'],
}

export const terminatedMembership = {
  membership_id: '01991600-1000-7000-8000-000000000005',
  organization_id: '01991600-1000-7000-8000-000000000006',
  display_name: 'Legacy Studio',
  type_code: 'studio',
  status: 'terminated',
  joined_at: '2023-01-01T16:45:22.870Z',
  ended_at: '2025-06-01T21:08:44.319Z',
  roles: ['staff'],
}

/*
 * The movement library a gym searches: the global catalogue and the gym's own
 * in one list, one of each kind the screen tells apart, plus an archived one
 * that appears only when asked for.
 */
export const STRENGTH_GLOBAL_MOVEMENT_ID = '01991600-c000-7000-8000-000000000001'
export const STRENGTH_OWN_MOVEMENT_ID = '01991600-c000-7000-8000-000000000003'

function libraryMovement(
  id: string,
  name: string,
  discipline: string,
  scope: 'global' | 'organization',
  archived = false,
): Record<string, unknown> {
  return {
    id,
    discipline_code: discipline,
    name,
    scope,
    archived,
    // The organization's own carry no muscles: only the catalogue curates them.
    muscles: scope === 'global' ? ['quadriceps'] : [],
    equipment: [],
    demo_url: null,
  }
}

export const movementLibrary: StudioApiFixture['movements'] = [
  {
    movement: libraryMovement(
      STRENGTH_GLOBAL_MOVEMENT_ID,
      'Sentadilla trasera',
      'strength',
      'global',
    ),
    aliases: ['Back squat'],
  },
  {
    movement: libraryMovement(
      '01991600-c000-7000-8000-000000000002',
      'Press de banca',
      'strength',
      'global',
    ),
    aliases: ['Bench press'],
  },
  {
    movement: libraryMovement(
      STRENGTH_OWN_MOVEMENT_ID,
      'Remo con mancuerna a una mano',
      'strength',
      'organization',
    ),
    aliases: [],
  },
  {
    movement: libraryMovement(
      '01991600-c000-7000-8000-000000000004',
      'Zancada lateral con banda',
      'strength',
      'organization',
      true,
    ),
    aliases: [],
  },
  {
    movement: libraryMovement(
      '01991600-c000-7000-8000-000000000005',
      'Rotación torácica',
      'mobility',
      'global',
    ),
    aliases: ['Thoracic rotation'],
  },
]

/*
 * The global activity types, each with the family its steps take, as
 * `catalog.list_activity_types()` answers them. One has no default result
 * contract in force, so it names no family and can hold no step.
 */
export const STRENGTH_ACTIVITY_TYPE_ID = '01991600-b000-7000-8000-000000000001'
export const INTERVAL_ACTIVITY_TYPE_ID = '01991600-b000-7000-8000-000000000002'

export const activityTypeCatalog: StudioApiFixture['activityTypes'] = [
  {
    id: STRENGTH_ACTIVITY_TYPE_ID,
    discipline_code: 'strength',
    code: 'gym_strength',
    name: 'Fuerza en gimnasio',
    activity_family: 'strength',
  },
  {
    id: INTERVAL_ACTIVITY_TYPE_ID,
    discipline_code: 'strength',
    code: 'circuit',
    name: 'Circuito por intervalos',
    activity_family: 'interval',
  },
  {
    id: '01991600-b000-7000-8000-000000000003',
    discipline_code: 'strength',
    code: 'plyometrics',
    name: 'Pliometría',
    activity_family: null,
  },
  {
    id: '01991600-b000-7000-8000-000000000004',
    discipline_code: 'mobility',
    code: 'guided_mobility',
    name: 'Movilidad guiada',
    activity_family: 'mobility',
  },
]

/*
 * The four template states the content screen tells apart, one fixture each.
 *
 * The listing gives a template's versions as `SessionTemplateVersionSummary`,
 * which carries no title — that is the contract, not an omission here — so a
 * row's name comes from its draft. The draft survives publishing, which is why
 * every one of these has one.
 */

/** Published twice, with the older version retired. */
export const publishedTemplate = {
  id: '01991600-a000-7000-8000-000000000001',
  organization_id: '01991600-1000-7000-8000-000000000002',
  discipline_code: 'strength',
  status: 'published',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: {
    id: '01991600-a000-7000-8000-000000000011',
    template_id: '01991600-a000-7000-8000-000000000001',
    content_schema_version: 1,
    content: {
      title: 'Fuerza tren superior',
      activity_type_id: STRENGTH_ACTIVITY_TYPE_ID,
      // One step, in the shape the current editor writes: sets one by one.
      steps: [
        {
          position: 1,
          movement_id: STRENGTH_GLOBAL_MOVEMENT_ID,
          activity_type_id: null,
          notes: null,
          superset_group: null,
          target: {
            family: 'strength',
            sets: [1, 2, 3].map((order) => ({
              set_order: order,
              kind: 'normal',
              target_reps: 8,
              target_load_value: 40,
              target_load_unit_code: 'kg',
              target_rpe: null,
            })),
            target_rest_seconds: 90,
          },
        },
      ],
    },
    derived_from_version_id: null,
    etag: '"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
    updated_at: '2026-10-03T10:00:00.000Z',
  },
  versions: [
    {
      id: '01991600-a000-7000-8000-000000000021',
      template_id: '01991600-a000-7000-8000-000000000001',
      version_number: 2,
      status: 'published',
      published_at: '2026-10-02T14:00:00.000Z',
    },
    {
      id: '01991600-a000-7000-8000-000000000022',
      template_id: '01991600-a000-7000-8000-000000000001',
      version_number: 1,
      status: 'deprecated',
      published_at: '2026-08-02T14:00:00.000Z',
    },
  ],
}

/** A draft and nothing published: it cannot be assigned, and the screen says so. */
export const unpublishedTemplate = {
  id: '01991600-a000-7000-8000-000000000002',
  organization_id: '01991600-1000-7000-8000-000000000002',
  discipline_code: 'mobility',
  status: 'draft',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: {
    id: '01991600-a000-7000-8000-000000000012',
    template_id: '01991600-a000-7000-8000-000000000002',
    content_schema_version: 1,
    content: {
      title: 'Movilidad matutina',
      // A mobility template declares a mobility type; the editor opens it now.
      activity_type_id: '01991600-b000-7000-8000-000000000004',
      steps: [],
    },
    derived_from_version_id: null,
    etag: '"sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
    updated_at: '2026-10-04T10:00:00.000Z',
  },
  versions: [],
}

/** Started from another version (ADR-009), which the screen marks. */
export const adaptedTemplate = {
  id: '01991600-a000-7000-8000-000000000003',
  organization_id: '01991600-1000-7000-8000-000000000002',
  discipline_code: 'strength',
  status: 'draft',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: {
    id: '01991600-a000-7000-8000-000000000013',
    template_id: '01991600-a000-7000-8000-000000000003',
    content_schema_version: 1,
    content: {
      title: 'Fuerza adaptada a lesión de hombro',
      activity_type_id: '01991600-b000-7000-8000-000000000001',
      steps: [],
    },
    derived_from_version_id: '01991600-a000-7000-8000-000000000021',
    etag: '"sha256:ccccccccccccccccccccccccccccccccccccccccccc"',
    updated_at: '2026-10-05T10:00:00.000Z',
  },
  versions: [],
}

/** Archived: out of the main list and counted in the disclosure. */
export const archivedTemplate = {
  id: '01991600-a000-7000-8000-000000000004',
  organization_id: '01991600-1000-7000-8000-000000000002',
  discipline_code: 'strength',
  status: 'archived',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: {
    id: '01991600-a000-7000-8000-000000000014',
    template_id: '01991600-a000-7000-8000-000000000004',
    content_schema_version: 1,
    content: {
      title: 'Circuito antiguo',
      activity_type_id: '01991600-b000-7000-8000-000000000001',
      steps: [],
    },
    derived_from_version_id: null,
    etag: '"sha256:ddddddddddddddddddddddddddddddddddddddddddd"',
    updated_at: '2026-06-05T10:00:00.000Z',
  },
  versions: [],
}

/** The one version a coach may propose. Named so a test never indexes for it. */
export const proposableVersion = {
  id: '01991600-9000-7000-8000-000000000011',
  program_id: '01991600-9000-7000-8000-000000000001',
  version_number: 2,
  status: 'published',
  title: 'Bloque de fuerza',
  repeats_forever: false,
  sessions: [],
  published_at: '2026-10-02T14:00:00.000Z',
  session_count: 12,
  deprecated_template_version_ids: [],
}

/**
 * A program with one published version and one retired, which is the set the
 * picker has to filter: `create_client_invitation` accepts a published version
 * of a program that is not archived, and nothing else.
 */
export const publishedProgram = {
  id: '01991600-9000-7000-8000-000000000001',
  organization_id: '01991600-1000-7000-8000-000000000002',
  status: 'published',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: null,
  versions: [
    proposableVersion,
    {
      id: '01991600-9000-7000-8000-000000000012',
      program_id: '01991600-9000-7000-8000-000000000001',
      version_number: 1,
      status: 'deprecated',
      title: 'Bloque de fuerza',
      repeats_forever: false,
      sessions: [],
      published_at: '2026-08-02T14:00:00.000Z',
      session_count: 10,
      deprecated_template_version_ids: [],
    },
  ],
}

/**
 * The other assignable one: no end, and it keeps a template that was retired
 * after publication. Both facts are said under the picker, and neither blocks.
 */
export const openEndedProgram = {
  id: '01991600-9000-7000-8000-000000000004',
  organization_id: '01991600-1000-7000-8000-000000000002',
  status: 'published',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: null,
  versions: [
    {
      id: '01991600-9000-7000-8000-000000000041',
      program_id: '01991600-9000-7000-8000-000000000004',
      version_number: 1,
      status: 'published',
      title: 'Movilidad diaria',
      repeats_forever: true,
      sessions: [],
      published_at: '2026-09-14T10:00:00.000Z',
      session_count: 3,
      deprecated_template_version_ids: ['01991600-9000-7000-8000-0000000000f1'],
    },
  ],
}

/** Archived: none of its versions may be proposed, published or not. */
export const archivedProgram = {
  id: '01991600-9000-7000-8000-000000000002',
  organization_id: '01991600-1000-7000-8000-000000000002',
  status: 'archived',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: null,
  versions: [
    {
      id: '01991600-9000-7000-8000-000000000021',
      program_id: '01991600-9000-7000-8000-000000000002',
      version_number: 1,
      status: 'published',
      title: 'Movilidad para principiantes',
      repeats_forever: false,
      sessions: [],
      published_at: '2026-05-02T14:00:00.000Z',
      session_count: 8,
      deprecated_template_version_ids: [],
    },
  ],
}

/** `publishedTemplate`'s two versions, which a program names by id. */
export const STRENGTH_TEMPLATE_V2_ID = '01991600-a000-7000-8000-000000000021'
export const STRENGTH_TEMPLATE_V1_ID = '01991600-a000-7000-8000-000000000022'

/**
 * A program being composed and never published. Two sessions on the current
 * version of the strength template and one on its retired first version, which
 * the draft keeps — `replace_program_draft` refuses only a new reference to a
 * retired version — and lists in `deprecated_template_version_ids`.
 */
export const draftedProgram = {
  id: '01991600-9000-7000-8000-000000000003',
  organization_id: '01991600-1000-7000-8000-000000000002',
  status: 'draft',
  author_person_id: '01991600-7000-7000-8000-000000000002',
  draft: {
    id: '01991600-9000-7000-8000-000000000033',
    program_id: '01991600-9000-7000-8000-000000000003',
    content_schema_version: 1,
    content: {
      title: 'Hipertrofia de cuatro semanas',
      notes: null,
      repeats_forever: false,
      sessions: [
        { position: 1, week: 1, day: 1, template_version_id: STRENGTH_TEMPLATE_V2_ID },
        { position: 2, week: 1, day: 4, template_version_id: STRENGTH_TEMPLATE_V2_ID },
        { position: 3, week: 2, day: 1, template_version_id: STRENGTH_TEMPLATE_V1_ID },
      ],
    },
    etag: '"sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"',
    updated_at: '2026-10-06T10:00:00.000Z',
    deprecated_template_version_ids: [STRENGTH_TEMPLATE_V1_ID],
  },
  versions: [],
}

/**
 * What `publishedTemplate`'s two versions were published with. The listing
 * carries only summaries, so the read of one version needs its content: the
 * second is the draft as it stands, the first an older prescription.
 */
export const templateVersionContentCatalog: Record<string, Record<string, unknown>> = {
  [STRENGTH_TEMPLATE_V2_ID]: structuredClone(publishedTemplate.draft.content),
  [STRENGTH_TEMPLATE_V1_ID]: {
    title: 'Fuerza tren superior',
    activity_type_id: STRENGTH_ACTIVITY_TYPE_ID,
    steps: [
      {
        position: 1,
        movement_id: STRENGTH_GLOBAL_MOVEMENT_ID,
        activity_type_id: null,
        notes: 'Bajar la barra controlando.',
        superset_group: null,
        target: {
          family: 'strength',
          sets: [1, 2, 3].map((order) => ({
            set_order: order,
            kind: 'normal',
            target_reps: 10,
            target_load_value: 35,
            target_load_unit_code: 'kg',
            target_rpe: null,
          })),
          target_rest_seconds: 120,
        },
      },
    ],
  },
}

/** `draftedProgram` as it was first published, to read one program version whole. */
export const programVersionOne = {
  id: '01991600-9000-7000-8000-000000000301',
  program_id: draftedProgram.id,
  version_number: 1,
  status: 'published',
  title: 'Hipertrofia de cuatro semanas',
  notes: 'Subir la carga cuando las ocho repeticiones salgan limpias.',
  repeats_forever: false,
  sessions: draftedProgram.draft.content.sessions,
  published_at: '2026-10-07T14:00:00.000Z',
  session_count: 3,
  deprecated_template_version_ids: [STRENGTH_TEMPLATE_V1_ID],
}

/*
 * The permission vocabulary, as Backoffice publishes it. Three of the seven, so
 * the picker has enough to show a list without the screen becoming a wall.
 */
/*
 * `OP-PRV-022`. Copied from what `privacy.list_information_categories()`
 * answers against a real database — the seven rows, their exact wording, the
 * five keys the contract declares and the order the function returns them in.
 * Not derived from `offerableScopeCatalog`: that one carries a definition id
 * and a version this operation deliberately does not have, and a fixture that
 * is merely plausible hides the defect it was written to catch.
 */
export const informationCategoryCatalog = [
  {
    scope_code: 'relationship_training',
    display_name: 'Entrenamiento con nosotros',
    summary: 'Sesiones que le asignes y sus resultados, nada de lo que entrene por su cuenta.',
    description:
      'Las sesiones que te asignemos y sus resultados, solo las que ocurran dentro de esta relación. No incluye lo que entrenes por tu cuenta, ni tu cuerpo, ni tu salud.',
    default_purpose:
      'Prescribir tu entrenamiento y revisar cómo te va en las sesiones que te asignamos.',
  },
  {
    scope_code: 'prior_training_history',
    display_name: 'Tu historial de entrenamiento',
    summary: 'Entrenamientos anteriores y por su cuenta, sin cuerpo ni salud.',
    description:
      'Entrenamientos anteriores y por tu cuenta, y sus resultados. No incluye lo que hayas compartido con otras organizaciones, ni tu cuerpo, ni tu salud.',
    default_purpose:
      'Conocer tu punto de partida para no proponerte algo por encima o por debajo de lo que ya haces.',
  },
  {
    scope_code: 'body_progress',
    display_name: 'Progreso corporal',
    summary: 'Medidas y composición corporal, sin fotos y sin datos de salud.',
    description:
      'Medidas, composición corporal y tendencias. No incluye tus fotos, ni datos de salud.',
    default_purpose:
      'Seguir cómo cambia tu cuerpo y ajustar el plan a lo que muestren las medidas.',
  },
  {
    scope_code: 'health_context',
    display_name: 'Contexto de salud',
    summary: 'Dolores y lesiones que declare, sin historia clínica.',
    description:
      'Dolores, lesiones o limitaciones que tú declares, y tu recuperación. No incluye historia clínica, exámenes, medicamentos ni diagnósticos.',
    default_purpose: 'Adaptar los ejercicios a tus lesiones o limitaciones para no hacerte daño.',
  },
  {
    scope_code: 'nutrition_intake',
    display_name: 'Lo que comes',
    summary: 'Las comidas que registre. Nunca podrás editarlas.',
    description:
      'Las comidas que registres y lo que contienen. Solo las creas tú: un profesional nunca registra ni corrige una comida tuya.',
    default_purpose: 'Entender tu alimentación para acompañarte con objetivos realistas.',
  },
  {
    scope_code: 'nutrition_media',
    display_name: 'Fotos de tus comidas',
    summary: 'Las fotos de sus comidas. Requiere también ver lo que come.',
    description:
      'Las fotos que adjuntes a una comida. Requiere además que nos permitas ver lo que comes; por sí sola no muestra nada.',
    default_purpose:
      'Ver las fotos de tus comidas cuando el registro escrito no alcanza para entenderlas.',
  },
  {
    scope_code: 'nutrition_guidance',
    display_name: 'Objetivos nutricionales',
    summary: 'Objetivos de nutrición y sus decisiones, sin ver sus comidas.',
    description:
      'Los objetivos de nutrición que te propongamos y las decisiones que tomes sobre ellos. No incluye tus comidas ni sus fotos, y nunca es prescripción médica.',
    default_purpose: 'Proponerte objetivos de nutrición y revisar contigo si te sirven.',
  },
] as const

export const offerableScopeCatalog = [
  {
    scope_definition_id: '01991600-7000-7000-8000-000000000301',
    scope_code: 'relationship_training',
    version_number: 1,
    display_name: 'Entrenamiento con nosotros',
    summary: 'Sesiones que le asignes y sus resultados, nada de lo que entrene por su cuenta.',
    description:
      'Las sesiones que te asignemos y sus resultados, solo las que ocurran dentro de esta relación. No incluye lo que entrenes por tu cuenta, ni tu cuerpo, ni tu salud.',
    default_purpose:
      'Prescribir tu entrenamiento y revisar cómo te va en las sesiones que te asignamos.',
  },
  {
    scope_definition_id: '01991600-7000-7000-8000-000000000302',
    scope_code: 'body_progress',
    version_number: 1,
    display_name: 'Progreso corporal',
    summary: 'Medidas y composición corporal, sin fotos y sin datos de salud.',
    description:
      'Medidas, composición corporal y tendencias. No incluye tus fotos, ni datos de salud.',
    default_purpose:
      'Seguir cómo cambia tu cuerpo y ajustar el plan a lo que muestren las medidas.',
  },
  {
    scope_definition_id: '01991600-7000-7000-8000-000000000303',
    scope_code: 'health_context',
    version_number: 1,
    display_name: 'Contexto de salud',
    summary: 'Dolores y lesiones que declare, sin historia clínica.',
    description:
      'Dolores, lesiones o limitaciones que tú declares, y tu recuperación. No incluye historia clínica, exámenes, medicamentos ni diagnósticos.',
    default_purpose: 'Adaptar los ejercicios a tus lesiones o limitaciones para no hacerte daño.',
  },
]

/*
 * A directory entry is one of two kinds. The invitation one deliberately has no
 * `display_name` and no `person_id`: until somebody accepts, no person exists,
 * and a fixture that invented a name here would let the screen render something
 * the API can never send.
 */
/**
 * Somebody paying the organization.
 *
 * `amount_minor` is the minor unit, so this is $120.000 and not $12.000.000 — which is
 * exactly the confusion the screen's formatter is tested against. `current_period_end` is
 * null because nothing has reported a charge yet, which is the state a subscription sits
 * in between being created and the gateway's first webhook.
 */
export const activeSubscription = {
  subscription_id: '01991600-7000-7000-8000-000000000601',
  person_id: '01991600-7000-7000-8000-000000000201',
  person_name: 'Ana Álvarez',
  plan_name: 'Mensual',
  plan_version_id: '01991600-7000-7000-8000-000000000501',
  amount_minor: 12000000,
  currency_code: 'COP',
  billing_period: 'month',
  status: 'active',
  current_period_end: null,
  started_at: '2026-10-01T15:12:44.118Z',
  suspended_at: null,
  ended_at: null,
}

/*
 * The three states a plan can be in, one each, as `payments.organization_plan_projection`
 * builds them: on sale with an older price retired beneath it, published once and off
 * sale since, and a draft with a name and no price. Published come first, then drafts,
 * each by name, which is the order `OP-PAY-006` answers in.
 */
function planVersion(
  id: string,
  number: number,
  amountMinor: number,
  status: 'published' | 'deprecated',
  deliveryMode: 'in_person' | 'remote' = 'in_person',
) {
  return {
    plan_version_id: id,
    version_number: number,
    amount_minor: amountMinor,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: deliveryMode,
    status,
    published_at: `2026-${String(8 + number).padStart(2, '0')}-01T14:00:00.000Z`,
    deprecated_at:
      status === 'deprecated'
        ? `2026-${String(9 + number).padStart(2, '0')}-01T14:00:00.000Z`
        : null,
  }
}

export const MONTHLY_PLAN_ID = '01991600-e000-7000-8000-000000000001'

export const planOnSale = (() => {
  const current = planVersion('01991600-e000-7000-8000-000000000012', 2, 12000000, 'published')
  return {
    plan_id: MONTHLY_PLAN_ID,
    name: 'Mensual ilimitado',
    status: 'published',
    on_sale: true,
    created_at: '2026-08-01T14:00:00.000Z',
    current_version: current,
    versions: [
      current,
      planVersion('01991600-e000-7000-8000-000000000011', 1, 10000000, 'deprecated'),
    ],
  }
})()

export const planOffSale = {
  plan_id: '01991600-e000-7000-8000-000000000002',
  name: 'Remoto de verano',
  status: 'published',
  on_sale: false,
  created_at: '2026-07-01T14:00:00.000Z',
  current_version: null,
  versions: [
    planVersion('01991600-e000-7000-8000-000000000021', 1, 8000000, 'deprecated', 'remote'),
  ],
}

export const draftPlan = {
  plan_id: '01991600-e000-7000-8000-000000000003',
  name: 'Anual con nutrición',
  status: 'draft',
  on_sale: false,
  created_at: '2026-11-01T14:00:00.000Z',
  current_version: null,
  versions: [],
}

/*
 * One standing and one withdrawn, which is the pair HU-STUDIO-035 turns on:
 * criterion 4 says a withdrawn authorization stays visible, because it is what
 * explains no longer seeing that part. Values copied from what
 * `privacy.list_authorized_scopes` really returns.
 */
export const grantedHealthContext = {
  relationship_id: '01991600-7000-7000-8000-000000000101',
  person_id: '01991600-7000-7000-8000-000000000201',
  display_name: 'Ana Álvarez',
  grant_id: '01991600-7000-7000-8000-000000000c01',
  scope_code: 'health_context',
  scope_display_name: 'Contexto de salud',
  version_number: 1,
  access_level: 'read',
  status: 'active',
  purpose: 'Adaptar el entrenamiento a lo que la persona reporte.',
  granted_at: '2025-03-04T15:12:44.118Z',
  revoked_at: null,
}

export const withdrawnBodyProgress = {
  ...grantedHealthContext,
  grant_id: '01991600-7000-7000-8000-000000000c02',
  scope_code: 'body_progress',
  scope_display_name: 'Progreso corporal',
  status: 'revoked',
  purpose: 'Seguir cómo cambia el cuerpo y ajustar el plan.',
  granted_at: '2025-03-04T15:12:44.118Z',
  revoked_at: '2025-07-19T10:00:00.000Z',
}

export const activeClient = {
  kind: 'relationship',
  relationship_id: '01991600-7000-7000-8000-000000000101',
  person_id: '01991600-7000-7000-8000-000000000201',
  display_name: 'Ana Álvarez',
  relationship_status: 'active',
  invitation_status: 'accepted',
  started_at: '2025-03-04T15:12:44.118Z',
  ended_at: null,
}

/**
 * `OP-REL-019`: an index of what she lets this caller read, and nothing of
 * hers. The fullest useful case — two categories at two different levels, and
 * one she took back — so the screen has to say three different things.
 *
 * `reads` carries what the real projection carries: the operations that read
 * each category. The screen shows none of them, and that is the point of having
 * them here — a fixture that dropped them would let a prefetch be added without
 * anything noticing.
 */
export const clientCard = {
  kind: 'attending',
  person_id: '01991600-7000-7000-8000-000000000201',
  display_name: 'Ana Álvarez',
  relationship: {
    id: '01991600-7000-7000-8000-000000000101',
    started_at: '2025-03-04T15:12:44.118Z',
  },
  attendance: { role: 'holder', ends_on: null },
  sections: [
    {
      scope_code: 'relationship_training',
      scope_version: 2,
      access_level: 'contribute',
      granted_at: '2025-03-05T10:00:00.000Z',
      reads: [
        'getAuthorizedClientTrainingProfile',
        'listAuthorizedClientExecutions',
        'getAuthorizedClientProgress',
        'listRelationshipAssignments',
      ],
    },
    {
      scope_code: 'health_context',
      scope_version: 1,
      access_level: 'read',
      granted_at: '2025-06-11T18:30:00.000Z',
      reads: ['listAuthorizedClientHealthContext'],
    },
  ],
  withdrawn: [{ scope_code: 'body_progress', withdrawn_at: '2026-01-20T14:05:00.000Z' }],
}

/**
 * The same person, read by somebody covering for her coach. The cover ends on a
 * day of the gym's calendar and not an instant, which is the half that renders
 * one day early anywhere west of Greenwich if it is read as one.
 */
export const coveredClientCard = {
  ...clientCard,
  attendance: { role: 'substitute', ends_on: '2026-03-12' },
}

/**
 * `HU-STUDIO-084`. A coach who lost her: why, when, and nothing else — no name,
 * no categories, and never who decided it.
 */
export const formerClientCard = {
  kind: 'former',
  person_id: '01991600-7000-7000-8000-000000000201',
  reason: 'assignment_ended',
  lost_at: '2026-02-02T11:00:00.000Z',
}

/**
 * `OP-IDN-018`, written from `identity.read_client_training_profile`.
 *
 * The fullest useful case, and every part of it is something the screen has to
 * say differently: a discipline and a goal she declared, **two experience
 * claims in force at once** (hers and a professional's), two emphasis zones as
 * two separate claims — which is how they arrive — and one claim whose value
 * the version withheld, with `value_text` null while its attribute code
 * travelled.
 */
export const clientTrainingProfile = {
  applied_scope: { code: 'relationship_training', version: 4 },
  biological_sex: { value: 'female', provenance: 'person_declared' },
  attributes: [
    {
      id: '019f4900-0000-7000-8000-000000000c01',
      attribute_code: 'training_discipline',
      value_text: 'strength',
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:12:44.118Z',
    },
    {
      id: '019f4900-0000-7000-8000-000000000c02',
      attribute_code: 'primary_training_goal',
      value_text: 'get_fit',
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:14:02.000Z',
    },
    {
      id: '019f4900-0000-7000-8000-000000000c03',
      attribute_code: 'training_experience',
      value_text: 'experienced',
      value_numeric: null,
      unit_code: null,
      provenance: 'professional_observation',
      valid_from: '2026-10-31T10:00:00.000Z',
    },
    {
      id: '019f4900-0000-7000-8000-000000000c04',
      attribute_code: 'training_experience',
      value_text: 'some_practice',
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:15:30.000Z',
    },
    {
      id: '019f4900-0000-7000-8000-000000000c05',
      attribute_code: 'focus_areas',
      value_text: 'glutes',
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:16:10.000Z',
    },
    {
      id: '019f4900-0000-7000-8000-000000000c06',
      attribute_code: 'focus_areas',
      value_text: 'legs',
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:16:10.000Z',
    },
    /*
     * A third zone whose value the version withheld, beside two that travelled.
     * The group must then count two rows and not three: a badge counting the
     * claims that arrived said "3 vigentes" above two lines.
     */
    {
      id: '019f4900-0000-7000-8000-000000000c08',
      attribute_code: 'focus_areas',
      value_text: null,
      value_numeric: null,
      unit_code: null,
      provenance: 'person_declared',
      valid_from: '2026-03-04T15:16:10.000Z',
    },
    /*
     * The column the version withheld. `attribute_code` travelled and
     * `value_text` did not, which is the one gap the screen may name: she
     * shares a datum of this kind and its value is not in this version.
     */
    {
      id: '019f4900-0000-7000-8000-000000000c07',
      attribute_code: 'training_days_per_week',
      value_text: null,
      value_numeric: null,
      unit_code: null,
      provenance: null,
      valid_from: null,
    },
  ],
}

/*
 * Thirty sessions so the pager is pressed for real, newest first, and the first
 * five are every shape the row has to draw: ours and hers, one nobody closed,
 * one with no completeness level, and one she trained in another time zone.
 */
function executedSession(index: number, ours: boolean, partial: Record<string, unknown> = {}) {
  const day = String(28 - (index % 28)).padStart(2, '0')
  return {
    id: `0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f${String(4000 + index).padStart(4, '0')}`,
    started_at: `2026-07-${day}T06:04:00-05:00`,
    ended_at: `2026-07-${day}T07:01:00-05:00`,
    timezone: 'America/Bogota',
    activity_type_code: ours ? 'strength_training' : 'running',
    activity_type_name: ours ? 'Entrenamiento de fuerza' : 'Carrera',
    discipline_code: ours ? 'strength' : 'endurance',
    achieved_level: 'detailed',
    origin: ours ? 'relationship' : 'prior',
    planned_session_id: ours
      ? `0190a0b1-2c3d-7e4f-8a9b-0c1d2e3f${String(9000 + index).padStart(4, '0')}`
      : null,
    applied_scope: {
      code: ours ? 'relationship_training' : 'prior_training_history',
      version: ours ? 4 : 2,
    },
    ...partial,
  }
}

export const clientExecutions = [
  // Ours, and it fulfilled a session we planned.
  executedSession(0, true, {
    started_at: '2026-07-28T06:04:00-05:00',
    ended_at: '2026-07-28T07:01:00-05:00',
  }),
  // Hers: no plan of ours, and the other category.
  executedSession(3, false, {
    started_at: '2026-07-27T18:30:00-05:00',
    ended_at: '2026-07-27T19:15:00-05:00',
  }),
  // Nobody closed it. A session with no end is not a session of no duration.
  executedSession(1, true, {
    started_at: '2026-07-26T06:00:00-05:00',
    ended_at: null,
  }),
  // No completeness level recorded, which must not read as «partial».
  executedSession(2, true, {
    started_at: '2026-07-25T07:00:00-05:00',
    ended_at: '2026-07-25T08:30:00-05:00',
    achieved_level: null,
  }),
  /*
   * Trained in Madrid: a quarter past six there is a quarter past eleven the
   * night before in Bogotá, and the row has to show the hour she lived.
   */
  executedSession(4, true, {
    started_at: '2026-07-24T06:15:00+02:00',
    ended_at: '2026-07-24T07:05:00+02:00',
    timezone: 'Europe/Madrid',
  }),
  // The tail, so the pager is pressed for real. Two in three are ours.
  ...Array.from({ length: 25 }, (_, offset) => executedSession(offset + 5, (offset + 5) % 3 !== 0)),
]

/*
 * One session in full, as `OP-EXE-018` answers it: two blocks, two families of
 * results and the notes on it. It carries no heart rate, pain, body weight or
 * capture device, because the operation never does — their absence here is the
 * contract and not a gap the screen has to fill.
 */
export const clientExecutionDetail = {
  ...clientExecutions[0],
  segments: [
    { position: 1, activity_type_code: 'strength_training' },
    { position: 2, activity_type_code: 'mobility' },
  ],
  strength_sets: [
    {
      segment_position: 1,
      order: 1,
      movement_id: '019f4900-0000-7000-8000-00000000c601',
      movement_name: 'Sentadilla trasera',
      achieved_reps: 8,
      load: { value: 80, unit: 'kg' },
      rpe: 8,
    },
    {
      segment_position: 1,
      order: 2,
      movement_id: '019f4900-0000-7000-8000-00000000c601',
      movement_name: 'Sentadilla trasera',
      achieved_reps: 6,
      load: { value: 85, unit: 'kg' },
      rpe: 9,
    },
    /* Reps and nothing else: the two absent parts are skipped, never filled. */
    {
      segment_position: 1,
      order: 3,
      movement_id: '019f4900-0000-7000-8000-00000000c602',
      movement_name: 'Plancha con lastre',
      achieved_reps: 1,
      load: null,
      rpe: null,
    },
  ],
  endurance_laps: [],
  interval_results: [],
  round_results: [],
  mobility_results: [
    {
      segment_position: 2,
      sequence_position: 1,
      movement_id: '019f4900-0000-7000-8000-00000000c701',
      movement_name: 'Apertura de cadera',
      side: 'right',
      hold_duration_seconds: 45,
      completed_repetitions: 3,
    },
    {
      segment_position: 2,
      sequence_position: 2,
      movement_id: '019f4900-0000-7000-8000-00000000c702',
      movement_name: 'Movilidad torácica',
      side: 'both',
      hold_duration_seconds: 30,
      completed_repetitions: null,
    },
  ],
  observations: [
    {
      id: '019f4900-0000-7000-8000-00000000d801',
      execution_id: clientExecutions[0]?.id,
      category: 'relationship_training',
      provenance: 'professional',
      content: 'Mantuvo la profundidad en las dos primeras series y la perdió en la tercera.',
      revision_number: 0,
      created_at: '2026-07-28T13:00:00.000Z',
      revised_at: '2026-07-28T13:00:00.000Z',
      author_name: 'Diana Entrante',
      authored_by_me: false,
    },
    {
      id: '019f4900-0000-7000-8000-00000000d802',
      execution_id: clientExecutions[0]?.id,
      category: 'relationship_training',
      provenance: 'professional',
      content: 'Le subí la carga para la próxima semana.',
      revision_number: 2,
      created_at: '2026-07-28T14:30:00.000Z',
      revised_at: '2026-07-29T09:00:00.000Z',
      author_name: 'Camila Titular',
      authored_by_me: true,
    },
  ],
}

/**
 * A run: laps and nothing else. The four families it recorded nothing in are
 * drawn nowhere, which is the rule this fixture exists to prove.
 */
export const enduranceExecutionDetail = {
  ...clientExecutionDetail,
  activity_type_code: 'running',
  activity_type_name: 'Carrera',
  discipline_code: 'endurance',
  origin: 'prior',
  planned_session_id: null,
  applied_scope: { code: 'prior_training_history', version: 2 },
  segments: [],
  strength_sets: [],
  mobility_results: [],
  endurance_laps: [
    {
      segment_position: null,
      lap_number: 1,
      distance: { value: 1, unit: 'km' },
      duration_seconds: 258,
    },
    {
      segment_position: null,
      lap_number: 2,
      distance: { value: 1, unit: 'km' },
      duration_seconds: 246,
    },
    /* A lap nothing timed stays untimed rather than reading as zero seconds. */
    {
      segment_position: null,
      lap_number: 3,
      distance: { value: 1, unit: 'km' },
      duration_seconds: null,
    },
  ],
  observations: [],
}

/** Finished, and with nothing saved in any family. Said once, not five times. */
export const emptyExecutionDetail = {
  ...clientExecutionDetail,
  segments: [],
  strength_sets: [],
  mobility_results: [],
  observations: [],
}

/*
 * `OP-EXE-019`, written from `execution.read_client_progress`. Every null in
 * here is a figure the server could not compute, and each one is a different
 * rendering rule the screen has to get right.
 */
export const clientProgress = {
  period: 'week',
  sources: [
    { code: 'relationship_training', version: 4 },
    { code: 'prior_training_history', version: 2 },
  ],
  algorithm: { e1rm: 'epley', version: 1 },
  periods: [
    // Oldest first, as the operation answers them.
    {
      starts_on: '2026-09-07',
      ends_before: '2026-09-14',
      sessions: 2,
      trained_seconds: 5400,
      work_sets: 24,
      volume_kg: 3120,
      muscles: [
        { code: 'legs', name: 'Piernas', sets: 10 },
        { code: 'back', name: 'Espalda', sets: 8 },
        { code: 'chest', name: 'Pecho', sets: 6 },
      ],
    },
    /*
     * A week of bodyweight work: nothing in it was weighed, so it has **no**
     * volume. Drawing a zero here would say she lifted nothing in a week she
     * trained three times.
     */
    {
      starts_on: '2026-09-14',
      ends_before: '2026-09-21',
      sessions: 3,
      trained_seconds: 7200,
      work_sets: 31,
      volume_kg: null,
      muscles: [
        { code: 'abs', name: 'Abdomen', sets: 16 },
        { code: 'glutes', name: 'Glúteos', sets: 15 },
      ],
    },
    // Five muscles, so the line counts the ones it does not name.
    {
      starts_on: '2026-09-21',
      ends_before: '2026-09-28',
      sessions: 4,
      trained_seconds: 11_700,
      work_sets: 48,
      volume_kg: 7430.5,
      muscles: [
        { code: 'chest', name: 'Pecho', sets: 14 },
        { code: 'back', name: 'Espalda', sets: 12 },
        { code: 'legs', name: 'Piernas', sets: 11 },
        { code: 'shoulders', name: 'Hombros', sets: 7 },
        { code: 'arms', name: 'Brazos', sets: 4 },
      ],
    },
    // A week she did not train. Zeros here are real: the server counted them.
    {
      starts_on: '2026-09-28',
      ends_before: '2026-10-05',
      sessions: 0,
      trained_seconds: 0,
      work_sets: 0,
      volume_kg: null,
      muscles: [],
    },
  ],
  movements: [
    /*
     * Heaviest first, then by name with the unnamed one last — the order
     * `order by ranked.best_kg desc, ranked.name nulls last` answers them in.
     * The screen must not re-sort, so this is the order it has to draw.
     */
    {
      movement_id: '018f6f8d-2b00-7a00-8000-000000000601',
      name: 'Sentadilla trasera',
      best_kg: 120,
      previous_best_kg: 112.5,
      change_kg: 7.5,
      best_e1rm_kg: 142,
      bests: [100, null, 112.5, 120],
    },
    /*
     * A movement she named herself, at the length a person actually types.
     * `ck_movements_name` caps nothing, so the name column has no width that
     * always holds one — this is the row that proves it takes a second line
     * instead of the column beside it.
     */
    {
      movement_id: '018f6f8d-2b00-7a00-8000-000000000605',
      name: 'Sentadilla búlgara con mancuernas y pausa de tres segundos abajo',
      best_kg: 95,
      previous_best_kg: 90,
      change_kg: 5,
      best_e1rm_kg: 108.2,
      bests: [85, 90, 90, 95],
    },
    // It went down, which the screen has to show as plainly as going up.
    {
      movement_id: '018f6f8d-2b00-7a00-8000-000000000604',
      name: 'Press de banca',
      best_kg: 75,
      previous_best_kg: 80,
      change_kg: -5,
      best_e1rm_kg: 86.3,
      bests: [77.5, 80, 80, 75],
    },
    /*
     * A movement only she can name: counted, so the row stays, and named as what
     * it is rather than invented.
     */
    {
      movement_id: '018f6f8d-2b00-7a00-8000-000000000602',
      name: null,
      best_kg: 60,
      previous_best_kg: 60,
      change_kg: 0,
      best_e1rm_kg: 68,
      bests: [null, 60, 60, 60],
    },
    // First period it appears in: nothing to compare against, and no estimate
    // because no set was between one and twelve repetitions.
    {
      movement_id: '018f6f8d-2b00-7a00-8000-000000000603',
      name: 'Plancha con lastre',
      best_kg: 20,
      previous_best_kg: null,
      change_kg: null,
      best_e1rm_kg: null,
      bests: [null, null, null, 20],
    },
  ],
}

/** The same window with nothing trained in it: four periods of honest zeros. */
export const emptyClientProgress = {
  ...clientProgress,
  periods: clientProgress.periods.map((entry) => ({
    ...entry,
    sessions: 0,
    trained_seconds: 0,
    work_sets: 0,
    volume_kg: null,
    muscles: [],
  })),
  movements: [],
}

/*
 * The programs this relationship gave her, in the order
 * `planning.list_relationship_assignments` answers them:
 * `order by assigned_at desc, id desc`. The screen must not re-sort, so this is
 * the order it has to draw.
 *
 * Three programs, chosen so every branch of the screen has a case: a finite one
 * still running and adjusted for her, an open-ended one whose calendar has only
 * grown a week, and one that ended and that the gym no longer manages.
 */
const plannedSession = (
  id: string,
  title: string,
  week: string,
  day: number,
  on: string,
  status: string,
  started = false,
) => ({
  id,
  template_version_id: '019f4900-0000-7000-8000-00000000d001',
  title,
  week_starts_on: week,
  program_day: day,
  scheduled_on: on,
  status,
  started,
  revision_number: 0,
})

export const relationshipAssignments = [
  {
    id: '019f4900-0000-7000-8000-00000000e001',
    status: 'active',
    program_version: {
      id: '019f4900-0000-7000-8000-00000000f001',
      program_id: '019f4900-0000-7000-8000-00000000f000',
      version_number: 3,
      title: 'Fuerza general · bloque de otoño',
      repeats_forever: false,
    },
    starts_on: '2026-10-05',
    timezone: 'America/Bogota',
    assigned_at: '2026-10-02T14:20:00.000Z',
    management: {
      relationship_id: '01991600-7000-7000-8000-000000000101',
      since: '2026-10-02T14:20:00.000Z',
    },
    sessions: [
      plannedSession(
        '019f4900-0000-7000-8000-00000000a001',
        'Tren inferior',
        '2026-10-05',
        1,
        '2026-10-05',
        'completed',
      ),
      plannedSession(
        '019f4900-0000-7000-8000-00000000a002',
        'Tren superior',
        '2026-10-05',
        3,
        '2026-10-07',
        'completed',
      ),
      plannedSession(
        '019f4900-0000-7000-8000-00000000a003',
        'Full body',
        '2026-10-05',
        5,
        '2026-10-09',
        'cancelled',
      ),
      /* Started and not finished: the one session nobody can move any more. */
      plannedSession(
        '019f4900-0000-7000-8000-00000000a004',
        'Tren inferior',
        '2026-10-12',
        1,
        '2026-10-12',
        'scheduled',
        true,
      ),
      plannedSession(
        '019f4900-0000-7000-8000-00000000a005',
        'Tren superior',
        '2026-10-12',
        3,
        '2026-10-14',
        'scheduled',
      ),
      /*
       * 156 characters, where `ck_session_template_versions_title` caps the
       * column at 160: a coach can type this, so the register has to draw it.
       * A comfortable title would let the column shares ship untested.
       */
      plannedSession(
        '019f4900-0000-7000-8000-00000000a006',
        'Movilidad de cadera y columna torácica con bandas, más core antiextensión y respiración diafragmática, para cerrar la semana sin cargar nada la espalda baja',
        '2026-10-12',
        5,
        '2026-10-16',
        'paused',
      ),
    ],
    /*
     * Ordered `planned_step_id, override_kind`, which is what the function
     * writes — never by date. The most recent one is deliberately in the
     * middle, so a screen that took the last element would name the wrong day.
     */
    adjustments: [
      {
        id: '019f4900-0000-7000-8000-00000000b001',
        assignment_id: '019f4900-0000-7000-8000-00000000e001',
        planned_step_id: '019f4900-0000-7000-8000-00000000c001',
        kind: 'target_load',
        value: 42.5,
        unit_code: 'kg',
        revised_at: '2026-10-08T16:00:00.000Z',
      },
      {
        id: '019f4900-0000-7000-8000-00000000b002',
        assignment_id: '019f4900-0000-7000-8000-00000000e001',
        planned_step_id: '019f4900-0000-7000-8000-00000000c002',
        kind: 'target_reps',
        value: 8,
        unit_code: null,
        revised_at: '2026-10-19T11:30:00.000Z',
      },
      {
        id: '019f4900-0000-7000-8000-00000000b003',
        assignment_id: '019f4900-0000-7000-8000-00000000e001',
        planned_step_id: '019f4900-0000-7000-8000-00000000c003',
        kind: 'target_rpe',
        value: 7,
        unit_code: null,
        revised_at: '2026-10-11T09:15:00.000Z',
      },
    ],
  },
  {
    id: '019f4900-0000-7000-8000-00000000e002',
    status: 'active',
    program_version: {
      id: '019f4900-0000-7000-8000-00000000f002',
      program_id: '019f4900-0000-7000-8000-00000000f003',
      version_number: 1,
      title: 'Movilidad diaria',
      repeats_forever: true,
    },
    starts_on: '2026-09-14',
    timezone: 'America/Bogota',
    assigned_at: '2026-09-13T10:00:00.000Z',
    management: {
      relationship_id: '01991600-7000-7000-8000-000000000101',
      since: '2026-09-13T10:00:00.000Z',
    },
    /* One week planted, because that is all an open-ended version plants. */
    sessions: [
      plannedSession(
        '019f4900-0000-7000-8000-00000000a011',
        'Cadera y tobillo',
        '2026-09-14',
        1,
        '2026-09-14',
        'completed',
      ),
      plannedSession(
        '019f4900-0000-7000-8000-00000000a012',
        'Columna torácica',
        '2026-09-14',
        4,
        '2026-09-17',
        'scheduled',
      ),
    ],
    adjustments: [],
  },
  {
    id: '019f4900-0000-7000-8000-00000000e003',
    status: 'ended',
    program_version: {
      id: '019f4900-0000-7000-8000-00000000f004',
      program_id: '019f4900-0000-7000-8000-00000000f005',
      version_number: 2,
      title: 'Iniciación en sala',
      repeats_forever: false,
    },
    starts_on: '2026-06-01',
    timezone: 'America/Bogota',
    assigned_at: '2026-05-28T13:45:00.000Z',
    /* Nobody manages it any more: the plan is hers, and that is not the same
       thing as the program having ended. */
    management: null,
    sessions: [
      plannedSession(
        '019f4900-0000-7000-8000-00000000a021',
        'Máquinas guiadas',
        '2026-06-01',
        2,
        '2026-06-02',
        'completed',
      ),
      plannedSession(
        '019f4900-0000-7000-8000-00000000a022',
        'Peso libre',
        '2026-06-01',
        4,
        '2026-06-04',
        'completed',
      ),
    ],
    adjustments: [],
  },
]

/** Nothing assigned yet: an empty page, which is not a refusal. */
export const noRelationshipAssignments: unknown[] = []

/** An older version of the same permission: fewer fields, same person. */
export const narrowTrainingProfile = {
  applied_scope: { code: 'relationship_training', version: 1 },
  biological_sex: null,
  attributes: [
    {
      id: '019f4900-0000-7000-8000-000000000c02',
      attribute_code: 'primary_training_goal',
      value_text: 'get_fit',
      value_numeric: null,
      unit_code: null,
      provenance: null,
      valid_from: null,
    },
  ],
}

/** Shares the category and nothing inside it: not a refusal, and not a failure. */
export const emptyTrainingProfile = {
  applied_scope: { code: 'relationship_training', version: 4 },
  biological_sex: null,
  attributes: [],
}

/** Attended, and she has shared nothing: being assigned asks her for nothing. */
export const clientCardWithoutSections = {
  ...clientCard,
  sections: [],
  withdrawn: [],
}

/**
 * How a relationship stands. Deliberately the fullest case: a holder, a
 * substitution still waiting for an answer, and three permissions in three
 * different states — one granted, one frozen by the link ending, one the person
 * took back. The screen has to say all three differently.
 */
export const relationshipState = {
  relationship_id: '01991600-7000-7000-8000-000000000101',
  person_id: '01991600-7000-7000-8000-000000000201',
  display_name: 'Ana Álvarez',
  status: 'active',
  started_at: '2025-03-04T15:12:44.118Z',
  ended_at: null,
  holder: {
    assignment_id: '01991600-7000-7000-8000-000000000301',
    membership_id: '01991600-7000-7000-8000-000000000002',
    professional_person_id: '01991600-7000-7000-8000-000000000202',
    display_name: 'Camilo Restrepo',
    valid_from: '2025-03-05T09:00:00.000Z',
  },
  substitutions: [
    {
      assignment_id: '01991600-7000-7000-8000-000000000302',
      membership_id: '01991600-7000-7000-8000-000000000003',
      professional_person_id: '01991600-7000-7000-8000-000000000203',
      display_name: 'Daniela Hoyos',
      status: 'proposed',
      /*
       * Midnight UTC, because that is what `OP-REL-004` writes: the start is a
       * calendar day cast to a timestamp, not an instant somebody picked. At
       * 09:00 the screen rendered the right day in every timezone by accident,
       * which is how a cover could read as starting a day early in production
       * with every sweep green.
       */
      valid_from: '2026-10-10T00:00:00.000Z',
      ends_on: '2026-10-24',
      accepted_by_person_at: null,
    },
  ],
  grants: [
    {
      grant_id: '01991600-7000-7000-8000-000000000401',
      scope_code: 'relationship_training',
      display_name: 'Entrenamiento con nosotros',
      version_number: 1,
      access_level: 'contribute',
      status: 'active',
      purpose: 'Planear y ajustar su entrenamiento',
      granted_at: '2025-03-04T15:14:02.000Z',
      revoked_at: null,
    },
    {
      grant_id: '01991600-7000-7000-8000-000000000402',
      scope_code: 'health_context',
      display_name: 'Dolores y lesiones',
      version_number: 2,
      access_level: 'read',
      status: 'active',
      purpose: 'Adaptar el entrenamiento a sus lesiones',
      granted_at: '2025-03-04T15:14:02.000Z',
      revoked_at: null,
    },
    {
      grant_id: '01991600-7000-7000-8000-000000000403',
      scope_code: 'body_progress',
      display_name: 'Progreso corporal',
      version_number: 1,
      access_level: 'read',
      status: 'revoked',
      purpose: 'Seguir su progreso',
      granted_at: '2025-03-04T15:14:02.000Z',
      revoked_at: '2026-09-18T11:30:00.000Z',
    },
  ],
}

/**
 * The same relationship after it ended. `frozen` only makes sense here: ending
 * the link freezes what the organization already had and stops anything after
 * the cut, so a frozen permission on an *active* relationship is a state the
 * product does not produce — and a screen designed against it would be designed
 * against nothing.
 */
export const endedRelationshipState = {
  ...relationshipState,
  status: 'terminated',
  ended_at: '2026-09-28T16:00:00.000Z',
  substitutions: [],
  grants: relationshipState.grants.map((entry) =>
    entry.status === 'active' ? { ...entry, status: 'frozen' } : entry,
  ),
}

/**
 * What that relationship has been through, newest first, as the server orders
 * it.
 *
 * Deliberately longer than one page of 25 would be awkward to write, so the
 * spec asks for a smaller page instead — what matters is that it holds a
 * handover whose two halves **share an instant**, which is what a reassignment
 * really produces, and a closure declared by the person, where the reason is
 * withheld and the screen has to say why rather than look empty.
 */
export const relationshipHistory = [
  {
    type: 'relationship_ended',
    occurred_at: '2026-09-28T16:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000101',
    detail: { ended_by_kind: 'person', declared_by_us: false, reason: null },
  },
  {
    type: 'holder_assigned',
    occurred_at: '2026-09-20T09:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000302',
    detail: { display_name: 'Diana Entrante' },
  },
  {
    type: 'holder_ended',
    occurred_at: '2026-09-20T09:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000301',
    detail: { display_name: 'Camilo Saliente' },
  },
  {
    type: 'consent_decided',
    occurred_at: '2026-09-02T10:30:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000401',
    detail: { scope_code: 'health_context', decision: 'accepted' },
  },
  {
    type: 'relationship_started',
    occurred_at: '2026-09-01T08:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000101',
    detail: { continues_relationship_id: null },
  },
]

/** The same history, closed by the organization, which does share its reason. */
export const relationshipHistoryClosedByUs = [
  {
    type: 'relationship_ended',
    occurred_at: '2026-09-28T16:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000101',
    detail: {
      ended_by_kind: 'professional',
      declared_by_us: true,
      reason: 'Dejó de asistir sin avisar',
    },
  },
  ...relationshipHistory.slice(1),
]

export const terminatedClient = {
  kind: 'relationship',
  relationship_id: '01991600-7000-7000-8000-000000000102',
  person_id: '01991600-7000-7000-8000-000000000202',
  display_name: 'Bruno Bello',
  relationship_status: 'terminated',
  invitation_status: 'accepted',
  started_at: '2024-11-20T17:05:03.771Z',
  ended_at: '2025-06-30T22:41:19.204Z',
}

/**
 * Bruno's relationship as its history tells it, for the historical access case.
 * Ending a relationship closes the holder at the same instant, so his coach's
 * `holder_ended` shares the cut — the event a case reads to offer that coach. The
 * coach before her ended earlier, and must never be offered.
 */
export const formerHolderMembershipId = '01991600-1000-7000-8000-0000000000d1'

export const endedRelationshipHistory = [
  {
    type: 'relationship_ended',
    occurred_at: terminatedClient.ended_at,
    source_id: terminatedClient.relationship_id,
    detail: { ended_by_kind: 'person', declared_by_us: false, reason: null },
  },
  {
    type: 'holder_ended',
    occurred_at: terminatedClient.ended_at,
    source_id: '01991600-7000-7000-8000-000000000311',
    detail: {
      assignment_id: '01991600-7000-7000-8000-000000000311',
      membership_id: formerHolderMembershipId,
      professional_person_id: '01991600-7000-7000-8000-000000000211',
      display_name: 'Diana Entrante',
    },
  },
  {
    type: 'holder_assigned',
    occurred_at: '2025-02-01T09:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000311',
    detail: {
      assignment_id: '01991600-7000-7000-8000-000000000311',
      membership_id: formerHolderMembershipId,
      professional_person_id: '01991600-7000-7000-8000-000000000211',
      display_name: 'Diana Entrante',
    },
  },
  {
    type: 'holder_ended',
    occurred_at: '2025-02-01T09:00:00.000Z',
    source_id: '01991600-7000-7000-8000-000000000310',
    detail: {
      assignment_id: '01991600-7000-7000-8000-000000000310',
      membership_id: '01991600-1000-7000-8000-0000000000d0',
      professional_person_id: '01991600-7000-7000-8000-000000000210',
      display_name: 'Camilo Saliente',
    },
  },
]

/** A case over Bruno's ended relationship that authorizes the owner signed in. */
export const openHistoricalCase = {
  id: '01991600-7000-7000-8000-0000000000c1',
  organization_id: '01991600-1000-7000-8000-000000000002',
  relationship_id: terminatedClient.relationship_id,
  person: { id: terminatedClient.person_id, given_name: 'Bruno', family_name: 'Bello' },
  cut_at: terminatedClient.ended_at,
  authorized: {
    membership_id: '01991600-1000-7000-8000-000000000001',
    given_name: 'Ada',
    family_name: 'Lovelace',
  },
  opened_by: {
    membership_id: '01991600-1000-7000-8000-000000000001',
    given_name: 'Ada',
    family_name: 'Lovelace',
  },
  purpose: 'service_dispute',
  case_reference: 'RAD-2026-114',
  justification: 'Reclamo formal por el cobro de octubre.',
  status: 'open',
  opened_at: '2026-11-12T14:00:00.000Z',
  expires_at: '2099-11-12T18:00:00.000Z',
  closed_at: null,
  closed_reason: null,
  closed_by: null,
}

/** Its time ran out and nobody closed it: the deadline doing its job. */
export const expiredHistoricalCase = {
  ...openHistoricalCase,
  id: '01991600-7000-7000-8000-0000000000c2',
  purpose: 'legal_or_regulatory_obligation',
  case_reference: 'OF-2026-0042',
  status: 'expired',
  opened_at: '2026-11-01T08:00:00.000Z',
  expires_at: '2026-11-01T10:00:00.000Z',
}

/** Closed by hand, and authorizing the coach who held Bruno when it ended. */
export const closedHistoricalCase = {
  ...openHistoricalCase,
  id: '01991600-7000-7000-8000-0000000000c3',
  purpose: 'customer_support_request',
  case_reference: 'SOP-7781',
  authorized: {
    membership_id: formerHolderMembershipId,
    given_name: 'Diana',
    family_name: 'Entrante',
  },
  status: 'closed',
  opened_at: '2026-10-20T08:00:00.000Z',
  expires_at: '2026-10-20T12:00:00.000Z',
  closed_at: '2026-10-20T09:30:00.000Z',
  closed_reason: 'closed_by_manager',
  closed_by: openHistoricalCase.opened_by,
}

/**
 * Bruno's relationship as a case reads it. Five categories stayed frozen, and two
 * of them have no historical read: health context must never become a section.
 */
export const frozenRelationship = {
  relationship: {
    id: terminatedClient.relationship_id,
    person: openHistoricalCase.person,
    ended_at: terminatedClient.ended_at,
  },
  case: openHistoricalCase,
  scopes: [
    'relationship_training',
    'prior_training_history',
    'body_progress',
    'health_context',
    'nutrition_guidance',
  ].map((code) => ({ code, version: 1, frozen_at: terminatedClient.ended_at })),
}

export const frozenExecutions = [
  {
    id: '01991600-7000-7000-8000-0000000000e1',
    started_at: '2025-06-27T11:00:00.000Z',
    ended_at: '2025-06-27T12:05:00.000Z',
    timezone: 'America/Bogota',
    activity_type_code: 'strength_training',
    activity_type_name: 'Fuerza',
    discipline_code: 'strength',
    achieved_level: 'detailed',
    origin: 'relationship',
    applied_scope: { code: 'relationship_training', version: 1 },
  },
  {
    id: '01991600-7000-7000-8000-0000000000e2',
    started_at: '2025-06-20T23:30:00.000Z',
    ended_at: null,
    timezone: 'America/Bogota',
    activity_type_code: 'running',
    activity_type_name: 'Carrera',
    discipline_code: 'endurance',
    achieved_level: null,
    origin: 'prior',
    applied_scope: { code: 'prior_training_history', version: 1 },
  },
]

export const frozenBodyProgress = [
  {
    id: '01991600-7000-7000-8000-0000000000f1',
    metric_code: 'body_weight',
    value: 72.5,
    unit_code: 'kg',
    original_value: 159.8,
    original_unit_code: 'lb',
    measured_on: '2025-06-02',
  },
  {
    id: '01991600-7000-7000-8000-0000000000f2',
    metric_code: 'waist',
    value: null,
    unit_code: null,
    original_value: null,
    original_unit_code: null,
    measured_on: '2025-05-15',
  },
]

export const frozenGoalVersions = [
  {
    id: '01991600-7000-7000-8000-0000000000a1',
    status_at_cut: 'accepted',
    rationale: 'Subir la proteína para sostener el bloque de fuerza.',
    author: { kind: 'professional', person_id: null },
    targets: [
      {
        nutrient_code: 'protein',
        mode: 'minimum',
        minimum: 120,
        maximum: null,
        exact: null,
        unit: 'g',
      },
      {
        nutrient_code: 'energy',
        mode: 'exact',
        minimum: null,
        maximum: null,
        exact: 2100,
        unit: 'kcal',
      },
    ],
    created_at: '2025-05-02T15:00:00.000Z',
    activated_at: '2025-05-03T09:00:00.000Z',
    decision: { decision: 'accepted', decided_at: '2025-05-03T09:00:00.000Z' },
  },
]

/* A long masked contact, because that is the value with nowhere to break. */
export const pendingClientInvitation = {
  kind: 'invitation',
  invitation_id: '01991600-7000-7000-8000-000000000103',
  contact_hint: 'c***@correo-institucional-muy-largo.example.test',
  invitation_status: 'pending',
  invited_at: '2025-07-02T19:33:58.640Z',
}

export const activeTeamMember = {
  membership_id: '01991600-7000-7000-8000-000000000001',
  display_name: 'Ada Lovelace',
  status: 'active',
  joined_at: '2025-01-15T13:27:36.052Z',
  ended_at: null,
  roles: ['owner'],
}

export const activeCoach = {
  membership_id: '01991600-7000-7000-8000-000000000002',
  display_name: 'Camilo Restrepo',
  status: 'active',
  joined_at: '2025-02-01T10:00:00.000Z',
  ended_at: null,
  roles: ['coach'],
}

export const secondActiveCoach = {
  membership_id: '01991600-7000-7000-8000-000000000003',
  display_name: 'Daniela Hoyos',
  status: 'active',
  joined_at: '2025-04-12T10:00:00.000Z',
  ended_at: null,
  roles: ['coach'],
}

/**
 * Active, of this organization, and **not** a coach. The command refuses this
 * membership, so the list must never offer it — which is what the fixture is
 * here to prove.
 */
export const activeStaffMember = {
  membership_id: '01991600-7000-7000-8000-000000000004',
  display_name: 'Sara Posada',
  status: 'active',
  joined_at: '2025-05-20T10:00:00.000Z',
  ended_at: null,
  roles: ['staff'],
}

/**
 * The roster a gym needs to assign somebody: two coaches to choose between, an
 * active staff member and a coach who left — both of which the command refuses,
 * so the list must not offer them.
 *
 * Declared here and passed by the cases that need it, never folded into the
 * default fixture: a routing test asserts that a brand-new organization reads
 * "Integrante activo" in the singular, and adding members to the shared default
 * broke it.
 */
export const coachedTeam = () => [
  activeTeamMember,
  activeCoach,
  secondActiveCoach,
  activeStaffMember,
  terminatedTeamMember,
]

export const terminatedTeamMember = {
  membership_id: '01991600-7000-7000-8000-000000000002',
  display_name: 'Camila Torres',
  status: 'terminated',
  joined_at: '2024-02-10T18:03:19.661Z',
  ended_at: '2026-07-30T11:56:08.245Z',
  roles: ['staff'],
}

const capabilityNames = {
  invite: 'Invitar al equipo',
  manage_organization: 'Mantener los datos de la organización',
  manage_sites: 'Administrar sedes',
  manage_memberships: 'Administrar membresías del equipo',
  manage_roles: 'Administrar roles',
  invite_clients: 'Invitar clientes',
  view_directory: 'Consultar directorios organizacionales sin datos fitness',
  manage_relationships: 'Administrar relaciones de servicio',
  assign_professionals: 'Asignar profesionales responsables',
  terminate_relationships: 'Terminar relaciones de servicio',
  manage_plans: 'Administrar planes comerciales',
  manage_billing: 'Administrar cobros y suscripciones',
  manage_historical_access: 'Administrar casos históricos sin conceder lectura',
  connect_billing_account: 'Conectar la cuenta de cobro',
  close_organization: 'Cerrar la organización',
  view_assigned_directory: 'Únicamente personas asignadas',
  manage_content: 'Crear y publicar contenido de entrenamiento',
  archive_movements: 'Archivar movimientos propios',
  assign_programs: 'Asignar programas',
  exercise_grants: 'Ejercer grants solo con relación, asignación y grant vigentes',
  observe_training: 'Observar ejecuciones autorizadas',
  propose_corrections: 'Proponer correcciones de entrenamiento',
  guide_nutrition: 'Orientar nutrición únicamente con credencial verificada',
} as const

const adminCapabilities = [
  'invite',
  'manage_organization',
  'manage_sites',
  'manage_memberships',
  'manage_roles',
  'invite_clients',
  'view_directory',
  'manage_relationships',
  'assign_professionals',
  'terminate_relationships',
  'manage_plans',
  'manage_billing',
  'manage_historical_access',
  /*
   * The content block's own migration adds it to both administrators:
   * `20260817192832_studio_content_programs.sql:15` inserts
   * ('owner','manage_content') and ('admin','manage_content'). The base
   * catalogue only gave it to `coach`, and this list had stayed there — so an
   * owner could not have read the content screen in a test while production
   * let them.
   */
  'manage_content',
  // `organizations.role_capabilities` gives it to owner and admin, never to coach.
  'archive_movements',
] as const

const coachCapabilities = [
  'invite_clients',
  'view_assigned_directory',
  'manage_content',
  'assign_programs',
  'exercise_grants',
  'observe_training',
  'propose_corrections',
  'guide_nutrition',
] as const

function capabilities(codes: readonly (keyof typeof capabilityNames)[]) {
  return codes.map((code) => ({ code, name: capabilityNames[code] }))
}

export const organizationRoleCatalog = [
  {
    code: 'owner',
    name: 'Propietario',
    capabilities: capabilities([
      ...adminCapabilities,
      'connect_billing_account',
      'close_organization',
    ]),
    fitness_data_access_policy: 'not_granted_by_role',
  },
  {
    code: 'admin',
    name: 'Administrador',
    capabilities: capabilities(adminCapabilities),
    fitness_data_access_policy: 'not_granted_by_role',
  },
  {
    code: 'coach',
    name: 'Coach',
    capabilities: capabilities(coachCapabilities),
    fitness_data_access_policy: 'requires_relationship_assignment_and_grant',
  },
  {
    code: 'staff',
    name: 'Staff',
    capabilities: capabilities(['invite', 'invite_clients', 'view_directory']),
    fitness_data_access_policy: 'not_granted_by_role',
  },
]

export const professionalProfile = {
  id: '01991600-2000-7000-8000-000000000001',
  headline: 'Entrenadora de fuerza',
  bio: 'Acompaño procesos sostenibles de fuerza y movilidad.',
  practice_started_year: 2018,
  experience_years: 8,
  specialties: [
    {
      code: 'strength_conditioning',
      name: 'Fuerza y acondicionamiento',
      description: null,
    },
  ],
  credentials: [],
  created_at: '2026-08-09T12:00:00.000Z',
  updated_at: '2026-08-09T12:00:00.000Z',
}

export const professionalCredential = {
  id: '01991600-3000-7000-8000-000000000001',
  credential_type_code: 'professional_certification',
  credential_type_name: 'Certificación profesional',
  issuer: 'NSCA',
  name: 'Fuerza aplicada',
  identifier: 'CERT-001',
  issued_on: '2024-01-01',
  expires_on: '2028-01-01',
  verification_url: 'https://example.test/cert-001',
  status: 'active',
  supersedes_credential_id: null,
  created_at: '2026-08-09T12:00:00.000Z',
  retired_at: null,
  verification: {
    state: 'unverified',
    valid_from: null,
    valid_to: null,
    effective: false,
  },
}

interface SiteRow {
  id: string
  name: string
  address: string | null
  status: string
  revision_number: number
}

interface OrganizationRow {
  id: string
  display_name: string
  legal_name: string | null
  type_code: string
  status: string
  revision_number: number
  sites: SiteRow[]
}

/*
 * `organizations.organization_type_transitions` as the migration seeds it
 * (20260817154245_studio_organization_team_core.sql). This is the server's side
 * of the rule; the client keeps its own in `lib/organization-profile.ts`, and
 * the point of the pair is that a test fails when they disagree.
 */
const MOCK_TYPE_TRANSITIONS: Record<string, readonly string[]> = {
  professional_practice: ['gym', 'studio'],
  gym: [],
  studio: [],
}

let siteSequence = 900

// Named rather than positional: the specs reach for a particular site, and
// `sites[0]!` costs a forbidden non-null assertion to say the same thing less
// clearly.
export const chapineroSite = {
  id: '01991600-2000-7000-8000-000000000001',
  name: 'Sede Chapinero',
  address: 'Calle 63 #11-40, Bogotá',
  status: 'active',
  revision_number: 2,
}

export const usaquenSite = {
  id: '01991600-2000-7000-8000-000000000002',
  name: 'Sede Usaquén',
  address: null,
  status: 'active',
  revision_number: 1,
}

export const chicoSite = {
  id: '01991600-2000-7000-8000-000000000003',
  name: 'Sede Chicó',
  address: 'Carrera 11 #93-45, Bogotá',
  status: 'inactive',
  revision_number: 3,
}

/*
 * The longest a person can actually type: the form caps the name at 120
 * characters and the address at 240. Every other fixture is comfortably short,
 * so without this one the sweep only ever measures rows that were never going
 * to break. The name is one unbroken word on purpose — a string with spaces
 * wraps, and the hard case is the one that cannot.
 */
export const longestSite = {
  id: '01991600-2000-7000-8000-000000000004',
  name: `Sede ${'Villavicencio'.repeat(8)}`.slice(0, 120),
  address: `Autopista Norte kilómetro 21 costado occidental ${'bodega 14 '.repeat(20)}`
    .trim()
    .slice(0, 240),
  status: 'active',
  revision_number: 1,
}

export const organizationWithSites = {
  id: '01991600-1000-7000-8000-000000000002',
  display_name: 'Allfit Gym',
  legal_name: 'Allfit Gym SAS',
  type_code: 'gym',
  status: 'active',
  revision_number: 4,
  sites: [chapineroSite, usaquenSite, chicoSite],
}

export const organizationWithLongSite = {
  ...organizationWithSites,
  sites: [longestSite],
}

/*
 * The only type that can still become another one. Every organization in these
 * fixtures is a gym or a studio, and both of those have nowhere to move to, so
 * without this one the type field is never exercised as a field.
 */
export const professionalPracticeOrganization = {
  ...organizationWithSites,
  display_name: 'Camila Restrepo',
  legal_name: null,
  type_code: 'professional_practice',
  sites: [chapineroSite],
}

// No legal name and no site registered. Both absences are legitimate, and the
// screen has to say so rather than drop the rows and leave the reader
// wondering whether it even asked.
export const organizationWithoutSites = {
  ...organizationWithSites,
  legal_name: null,
  sites: [],
}

/**
 * `OP-IDN-020`, written from `identity.read_client_health_context`: one claim of
 * each kind the screen sorts. A pain and a limitation in force — the limitation
 * with no area, as she may declare it — a recovery whose end is still ahead, and
 * a pain that ended, which still arrives because a past injury matters.
 *
 * Midday in UTC, so no zone a browser runs in moves any of them to another day.
 */
export const clientHealthContext = [
  {
    id: '01991600-7000-7000-8000-000000000301',
    context_type: 'pain',
    description: 'Me duele al bajar escaleras',
    body_area: 'knee',
    provenance: 'person_declared',
    valid_from: '2026-09-14T15:00:00.000Z',
    valid_to: null,
  },
  {
    id: '01991600-7000-7000-8000-000000000302',
    context_type: 'limitation',
    description: 'No puede cargar peso por encima de la cabeza',
    body_area: null,
    provenance: 'professional_observation',
    valid_from: '2026-08-02T15:00:00.000Z',
    valid_to: null,
  },
  {
    id: '01991600-7000-7000-8000-000000000303',
    context_type: 'recovery',
    description: 'Cirugía de manguito rotador',
    body_area: 'shoulder',
    provenance: 'person_declared',
    valid_from: '2026-06-20T15:00:00.000Z',
    valid_to: '2027-03-31T15:00:00.000Z',
  },
  {
    id: '01991600-7000-7000-8000-000000000304',
    context_type: 'pain',
    description: 'Lumbalgia después de una carrera',
    body_area: 'lower_back',
    provenance: 'person_declared',
    valid_from: '2026-04-03T15:00:00.000Z',
    valid_to: '2026-05-10T15:00:00.000Z',
  },
]

/**
 * The same claims under a version that carries only the type and the dates: no
 * description, no area, no origin. Nothing of that may be described as missing.
 */
export const narrowHealthContext = clientHealthContext.map((claim) => ({
  ...claim,
  description: null,
  body_area: null,
  provenance: null,
}))

/**
 * The same person, sharing her body progress as well. A card of its own rather
 * than a change to `clientCard`, whose withdrawal of that category other suites
 * read: here she shares it again, so it is not withdrawn.
 */
export const bodySharingClientCard = {
  ...clientCard,
  sections: [
    ...clientCard.sections,
    {
      scope_code: 'body_progress',
      scope_version: 3,
      access_level: 'read',
      granted_at: '2026-02-01T10:00:00.000Z',
      reads: ['listAuthorizedClientBodyProgress', 'listAuthorizedClientBodyPhotos'],
    },
  ],
  withdrawn: [],
}

/**
 * `OP-IDN-019`, written from `identity.read_client_body_progress`: three days, the
 * newest with two measurements, one typed in pounds and kept in kilograms.
 */
export const clientBodyProgress = [
  {
    id: '01991600-7000-7000-8000-000000000401',
    metric_code: 'body_weight',
    value: 72.5,
    unit_code: 'kg',
    original_value: 159.8,
    original_unit_code: 'lb',
    measured_on: '2026-09-14',
  },
  {
    id: '01991600-7000-7000-8000-000000000402',
    metric_code: 'waist',
    value: 81,
    unit_code: 'cm',
    original_value: null,
    original_unit_code: null,
    measured_on: '2026-09-14',
  },
  {
    id: '01991600-7000-7000-8000-000000000403',
    metric_code: 'body_weight',
    value: 74,
    unit_code: 'kg',
    original_value: null,
    original_unit_code: null,
    measured_on: '2026-08-01',
  },
  {
    id: '01991600-7000-7000-8000-000000000404',
    metric_code: 'body_fat',
    value: 24,
    unit_code: 'percent',
    original_value: null,
    original_unit_code: null,
    measured_on: '2026-08-01',
  },
  {
    id: '01991600-7000-7000-8000-000000000405',
    metric_code: 'body_height',
    value: 1.68,
    unit_code: 'm',
    original_value: null,
    original_unit_code: null,
    measured_on: '2026-06-20',
  },
]

/** `OP-IDN-059`: a day each, and when she chose to show it — another day. */
export const clientBodyPhotos = [
  {
    id: '01991600-7000-7000-8000-000000000501',
    taken_on: '2026-09-14',
    shared_at: '2026-09-20T15:00:00.000Z',
  },
  {
    id: '01991600-7000-7000-8000-000000000502',
    taken_on: '2026-06-20',
    shared_at: '2026-06-21T15:00:00.000Z',
  },
]

/**
 * A real JPEG, 120 by 160, so a test sees an image decode rather than a broken
 * icon. A plain gradient: nothing in it is anybody's body.
 */
export const bodyPhotoJpeg = Buffer.from(
  [
    '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdC',
    'IFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAA',
    'AADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlk',
    'ZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAA',
    'ABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAA',
    'AAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAA',
    'AABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEA',
    'AAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAA',
    'ACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERAT',
    'GCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARES',
    'EhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2Nj',
    'Y2NjY2P/wAARCACgAHgDASIAAhEBAxEB/8QAGAABAQEBAQAAAAAAAAAAAAAAAQACBAX/xAAVEAEB',
    'AAAAAAAAAAAAAAAAAAAAEf/EABcBAQEBAQAAAAAAAAAAAAAAAAABAgT/xAAUEQEAAAAAAAAAAAAA',
    'AAAAAAAA/9oADAMBAAIRAxEAPwD26qzVW3MaKKKBqrNVA0UUUGqKKKBqrNVA0UUUDUzUI6KqzVRT',
    'RRRQaooooGiiqgaKKKIaqzVQNFFFBqpmoHRRRRRTRRRRGqKKKBqrNVA0UUUGqKKKBoooqjVTNQOi',
    'iiioGqs1UDRRRQNVFFA0UUVRqiiigaqzVQNTNQOiiiioGqs1VQ0UUUGqKKKBqrNVA0UUUDVWaqBq',
    'ZqB0UUUUGqKKKBooooNUUUUDVWaqBooooGqiigamagdFFFFBqiiigaKKqBooooGqiigaKKKDVFFF',
    'UNTNQOiiiqoGiiigaqzVQNFFFUaooooGiiig1RRRQNTNQOiqs1VA0UUVQ1VmqgaKKKDVFFFA1Vmq',
    'gaKKKI1UxUDoqrNVFNFFFBqiiigaqzVRDRRRQNVZqoGiiigamagf/9k=',
  ].join(''),
  'base64',
)

export function createStudioApiFixture(
  overrides: Partial<StudioApiFixture> = {},
): StudioApiFixture {
  return {
    session: {
      authenticated: true,
      registration_status: 'complete',
      identity: { given_name: 'Ada', family_name: 'Lovelace' },
      analytics: { distinct_id: TEST_ANALYTICS_ID },
    },
    memberships: [],
    organizationMemberships: [activeTeamMember, terminatedTeamMember],
    organizationClients: [activeClient, pendingClientInvitation, terminatedClient],
    guestQuota: null,
    authorizedScopes: [grantedHealthContext, withdrawnBodyProgress],
    clientCard: structuredClone(clientCard),
    clientTrainingProfile: structuredClone(clientTrainingProfile),
    clientExecutions: structuredClone(clientExecutions),
    executionsCursor: 'ok',
    clientExecutionDetail: structuredClone(clientExecutionDetail),
    executionDetailOutcome: 'ok',
    clientProgress: structuredClone(clientProgress),
    relationshipAssignments: structuredClone(relationshipAssignments),
    assignmentsCursor: 'ok',
    assignOutcome: 'created',
    relationshipState: structuredClone(relationshipState),
    relationshipHistory: structuredClone(relationshipHistory),
    assignmentOutcome: 'created',
    reassignmentOutcome: 'reassigned',
    substitutionOutcome: 'proposed',
    substitutionEndOutcome: 'ended',
    terminationOutcome: 'terminated',
    organizationSubscriptions: [structuredClone(activeSubscription)],
    // Copies: plans are written now, and a write must not reach the next test.
    organizationPlans: structuredClone([planOnSale, planOffSale, draftPlan]),
    subscriptionOutcome: 'applied',
    roleGrantOutcome: 'granted',
    roleRevokeOutcome: 'revoked',
    membershipTerminationOutcome: 'terminated',
    membershipResignationOutcome: 'resigned',
    // Copies: drafts are editable now, and a save must not reach the next test.
    organizationPrograms: structuredClone([
      publishedProgram,
      openEndedProgram,
      archivedProgram,
      draftedProgram,
    ]),
    organizationSessionTemplates: structuredClone([
      publishedTemplate,
      unpublishedTemplate,
      adaptedTemplate,
      archivedTemplate,
    ]),
    disciplines: [
      { code: 'strength', name: 'Fuerza' },
      { code: 'mobility', name: 'Movilidad' },
    ],
    templateCreateOutcome: 'created',
    movements: structuredClone(movementLibrary),
    movementEditOutcome: 'saved',
    activityTypes: structuredClone(activityTypeCatalog),
    draftSaveOutcome: 'saved',
    publishedContents: {},
    programDraftSaveOutcome: 'saved',
    publishedProgramContents: {},
    templateVersionContents: structuredClone(templateVersionContentCatalog),
    organizationClosureOutcome: 'closed',
    closedRelationships: 3,
    programProposalOutcome: 'proposed',
    offerableScopes: [...offerableScopeCatalog],
    informationCategories: [...informationCategoryCatalog],
    /*
     * A copy, not the shared object. Sites are now editable, and the mock
     * writes the change into this fixture so the screen the form returns to
     * shows it. Handing out the module-level object let one test's rename or
     * withdrawal reach every test that ran after it, which makes a suite whose
     * result depends on its order.
     */
    organization: structuredClone(organizationWithSites),
    organizationRoles: organizationRoleCatalog,
    organizationTypes: [
      { code: 'professional_practice', name: 'Profesional independiente', description: null },
      { code: 'gym', name: 'Gimnasio', description: null },
      { code: 'studio', name: 'Estudio', description: null },
    ],
    me: { profile: null, memberships: [] },
    specialties: [
      { code: 'personal_training', name: 'Entrenamiento personal', description: null },
      {
        code: 'strength_conditioning',
        name: 'Fuerza y acondicionamiento',
        description: null,
      },
    ],
    credentialTypes: [
      { code: 'academic_degree', name: 'Título académico', description: null },
      {
        code: 'professional_certification',
        name: 'Certificación profesional',
        description: null,
      },
    ],
    signedOut: false,
    requests: [],
    historicalCases: [],
    historicalOpenOutcome: 'opened',
    historicalRelationship: structuredClone(frozenRelationship),
    frozenExecutions: structuredClone(frozenExecutions),
    frozenBodyProgress: structuredClone(frozenBodyProgress),
    frozenGoalVersions: structuredClone(frozenGoalVersions),
    historicalReadOutcome: 'ok',
    frozenRefused: [],
    historicalCloseOutcome: 'closed',
    clientHealthContext: structuredClone(clientHealthContext),
    clientBodyProgress: structuredClone(clientBodyProgress),
    clientBodyPhotos: structuredClone(clientBodyPhotos),
    bodyPhotoOutcome: 'shown',
    ...overrides,
  }
}

export async function installStudioApiMock(
  page: Page,
  fixture: StudioApiFixture,
  options: { consent?: 'denied' | 'undecided' } = {},
): Promise<void> {
  if (options.consent !== 'undecided') {
    await page.addInitScript(() => {
      localStorage.setItem(
        'allfit.analytics-v1',
        JSON.stringify({ decision: 'denied', notice_version: 'analytics-v1' }),
      )
    })
  }
  // Studio reads one surface: even the global catalogue is read under /studio/v1,
  // the only path its session cookie travels to.
  const handle = async (route: Route) => {
    const request = toMockRequest(route.request())
    if (request.method === 'OPTIONS') {
      await fulfill(route, { status: 204 })
      return
    }

    fixture.requests.push(request)
    const intercepted = await fixture.intercept?.(request, fixture)
    if (intercepted) {
      await fulfill(route, intercepted)
      return
    }

    const response = defaultResponse(request, fixture)
    await fulfill(route, response ?? { status: 500, body: { error: { code: 'unmocked-route' } } })
  }

  await page.route(`${API_ORIGIN}/studio/v1/**`, handle)
}

function defaultResponse(
  request: MockRequest,
  fixture: StudioApiFixture,
): MockResponse | undefined {
  if (request.method === 'GET' && request.path === '/studio/v1/telemetry-config') {
    return {
      status: 200,
      body: { enabled: true, notice_version: 'analytics-v1' },
      headers: { 'Cache-Control': 'public, max-age=300' },
    }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/entry-context') {
    if (fixture.signedOut) return { status: 401, body: error('unauthenticated') }
    const session = objectValue(fixture.session)
    const identity = objectValue(session.identity)
    const givenName = typeof identity.given_name === 'string' ? identity.given_name : null
    const familyName = typeof identity.family_name === 'string' ? identity.family_name : null
    return {
      status: 200,
      body: {
        authenticated: true,
        registration_status:
          session.registration_status === 'registration_incomplete' ? 'incomplete' : 'complete',
        identity: {
          name: givenName && familyName ? `${givenName} ${familyName}` : null,
          email: null,
        },
        memberships: fixture.memberships,
        analytics: objectValue(session.analytics),
      },
    }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/session') {
    if (fixture.signedOut) return { status: 401, body: error('unauthenticated') }
    return { status: 200, body: fixture.session }
  }
  if (request.method === 'POST' && request.path === '/studio/v1/auth/logout') {
    fixture.signedOut = true
    return { status: 303, headers: { Location: `${STUDIO_ORIGIN}/` } }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/me/memberships') {
    return { status: 200, body: { items: fixture.memberships } }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/memberships$/.test(request.path)
  ) {
    const status = new URLSearchParams(request.search).get('status')
    const data = status
      ? fixture.organizationMemberships.filter(
          (membership) =>
            typeof membership === 'object' &&
            membership !== null &&
            'status' in membership &&
            membership.status === status,
        )
      : fixture.organizationMemberships
    return { status: 200, body: { data, page: { has_more: false, next_cursor: null } } }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates$/.test(request.path)
  ) {
    return {
      status: 200,
      body: {
        data: fixture.organizationSessionTemplates,
        page: { has_more: false, next_cursor: null },
      },
    }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/catalog/disciplines') {
    return { status: 200, body: { items: fixture.disciplines } }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/movements$/.test(request.path)
  ) {
    /*
     * The route's rules, written where the simulator can apply them: names and
     * other names matched anywhere ignoring case but not accents, the archived
     * left out unless asked for, name order, and an opaque cursor per page.
     */
    const params = new URLSearchParams(request.search)
    const term = (params.get('q') ?? '').trim().toLocaleLowerCase('es-CO')
    const discipline = params.get('discipline')
    const includeArchived = params.get('include_archived') === 'true'
    const limit = Number(params.get('limit') ?? '25')
    const offset = Number((params.get('cursor') ?? 'movement-offset-0').split('-').at(-1))
    const matches = fixture.movements
      .filter(({ movement, aliases }) => {
        if (!includeArchived && movement.archived === true) return false
        if (discipline && movement.discipline_code !== discipline) return false
        if (!term) return true
        return [String(movement.name), ...aliases].some((name) =>
          name.toLocaleLowerCase('es-CO').includes(term),
        )
      })
      .map(({ movement }) => movement)
      .toSorted((left, right) => String(left.name).localeCompare(String(right.name), 'es'))
    const data = matches.slice(offset, offset + limit)
    const hasMore = offset + limit < matches.length
    return {
      status: 200,
      body: {
        data,
        page: {
          has_more: hasMore,
          next_cursor: hasMore ? `movement-offset-${offset + limit}` : null,
        },
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates$/.test(request.path)
  ) {
    if (fixture.templateCreateOutcome === 'not-found') {
      return { status: 404, body: problem('not-found', 404) }
    }
    // What `planning.create_session_template` writes: an organization-owned
    // template in `draft`, and a first draft holding the trimmed name and nothing else.
    const organizationId = request.path.split('/')[4] ?? ''
    const body = objectValue(request.body)
    const sequence = String(fixture.organizationSessionTemplates.length + 1).padStart(3, '0')
    const templateId = `01991600-a000-7000-8000-000000000${sequence}`
    const etag = `"sha256:${'c'.repeat(40)}${sequence}"`
    const template = {
      id: templateId,
      organization_id: organizationId,
      discipline_code: String(body.discipline_code),
      status: 'draft',
      author_person_id: '01991600-7000-7000-8000-000000000002',
      draft: {
        id: `01991600-a000-7000-8000-000000001${sequence}`,
        template_id: templateId,
        content_schema_version: 1,
        content: { title: String(body.title).trim(), activity_type_id: null, steps: [] },
        derived_from_version_id: null,
        etag,
        updated_at: '2026-11-10T15:04:11.000Z',
      },
      versions: [],
    }
    fixture.organizationSessionTemplates = [template, ...fixture.organizationSessionTemplates]
    return {
      status: 201,
      body: template,
      headers: {
        ETag: etag,
        Location: `/studio/v1/organizations/${organizationId}/session-templates/${templateId}/draft`,
      },
    }
  }
  const draftPath = /^\/studio\/v1\/organizations\/[^/]+\/session-templates\/([^/]+)\/draft$/.exec(
    request.path,
  )
  if (draftPath && (request.method === 'GET' || request.method === 'PUT')) {
    const templateId = draftPath[1] ?? ''
    const template = fixture.organizationSessionTemplates
      .map(objectValue)
      .find((candidate) => candidate.id === templateId)
    if (!template) return { status: 404, body: problem('not-found', 404) }
    const draft = objectValue(template.draft)
    if (request.method === 'GET') {
      return { status: 200, body: draft, headers: { ETag: String(draft.etag) } }
    }
    // The route answers 428 before anything else when the condition is missing.
    const expected = request.headers['if-match']
    if (!expected) return { status: 428, body: problem('precondition-required', 428) }
    let current = draft
    if (fixture.draftSaveOutcome === 'stale') {
      // Somebody else saves first; the next save from this screen is then current.
      fixture.draftSaveOutcome = 'saved'
      current = replaceDraft(fixture, templateId, {
        ...objectValue(draft.content),
        title: 'Fuerza tren superior (versión del equipo)',
      })
    }
    if (expected !== current.etag) {
      return { status: 409, body: problem('stale-draft', 409, { current_state: current }) }
    }
    const saved = replaceDraft(fixture, templateId, objectValue(request.body))
    return { status: 200, body: saved, headers: { ETag: String(saved.etag) } }
  }
  const versionsPath =
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates\/([^/]+)\/versions$/.exec(request.path)
  if (request.method === 'POST' && versionsPath) {
    /*
     * What `planning.publish_session_template_version` does: 428 without the
     * condition, the current draft with a stale one, the list of what a complete
     * draft still lacks, and — against the newest version only — the same
     * version again when nothing changed.
     */
    const templateId = versionsPath[1] ?? ''
    const template = fixture.organizationSessionTemplates
      .map(objectValue)
      .find((candidate) => candidate.id === templateId)
    if (!template) return { status: 404, body: problem('not-found', 404) }
    const expected = request.headers['if-match']
    if (!expected) return { status: 428, body: problem('precondition-required', 428) }
    const draft = objectValue(template.draft)
    if (expected !== draft.etag) {
      return { status: 409, body: problem('stale-draft', 409, { current_state: draft }) }
    }
    const content = objectValue(draft.content)
    const steps = Array.isArray(content.steps) ? content.steps : []
    const missing = [
      ...(content.activity_type_id ? [] : ['activity-type']),
      ...(steps.length > 0 ? [] : ['steps']),
    ]
    if (missing.length > 0) {
      return {
        status: 422,
        body: problem('validation-failed', 422, {
          errors: missing.map((code) => ({ code, path: `/${code}`, message: code })),
        }),
      }
    }
    const versions = (Array.isArray(template.versions) ? template.versions : []).map(objectValue)
    const latest = Math.max(0, ...versions.map((version) => Number(version.version_number)))
    const unchanged = fixture.publishedContents[templateId] === JSON.stringify(content)
    const number = unchanged && latest > 0 ? latest : latest + 1
    const version = {
      id: `01991600-a000-7000-8000-0000000002${String(number).padStart(2, '0')}`,
      template_id: templateId,
      version_number: number,
      discipline_code: template.discipline_code,
      activity_type_id: content.activity_type_id,
      derived_from_version_id: null,
      title: content.title,
      status: 'published',
      published_at: '2026-11-10T16:00:00.000Z',
      steps,
    }
    if (!unchanged || latest === 0) {
      fixture.publishedContents[templateId] = JSON.stringify(content)
      fixture.templateVersionContents[version.id] = structuredClone(content)
      const summary = {
        id: version.id,
        template_id: templateId,
        version_number: number,
        status: 'published',
        published_at: version.published_at,
      }
      fixture.organizationSessionTemplates = fixture.organizationSessionTemplates.map(
        (candidate) =>
          objectValue(candidate).id === templateId
            ? { ...objectValue(candidate), status: 'published', versions: [summary, ...versions] }
            : candidate,
      )
    }
    return { status: 201, body: version }
  }
  const derivationPath =
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates\/([^/]+)\/versions\/(\d+)\/derivation$/.exec(
      request.path,
    )
  if (request.method === 'POST' && derivationPath) {
    /*
     * What `planning.derive_session_template_version` does: 428 without the
     * condition (the route checks it first), a 404 for a version that is not a
     * published one of this template, the current draft with a stale ETag, and
     * then the draft replaced by the version's content with its source recorded.
     */
    const expected = request.headers['if-match']
    if (!expected) return { status: 428, body: problem('precondition-required', 428) }
    const templateId = derivationPath[1] ?? ''
    const template = fixture.organizationSessionTemplates
      .map(objectValue)
      .find((candidate) => candidate.id === templateId)
    const source = (Array.isArray(template?.versions) ? template.versions : [])
      .map(objectValue)
      .find(
        (version) =>
          version.version_number === Number(derivationPath[2]) && version.status === 'published',
      )
    const content = source ? fixture.templateVersionContents[String(source.id)] : undefined
    if (!template || !source || !content) return { status: 404, body: problem('not-found', 404) }
    const previous = objectValue(template.draft)
    if (expected !== previous.etag) {
      return { status: 409, body: problem('stale-draft', 409, { current_state: previous }) }
    }
    const unchanged = JSON.stringify(previous.content) === JSON.stringify(content)
    const draft = {
      ...previous,
      content: structuredClone(content),
      derived_from_version_id: source.id,
      etag: unchanged
        ? previous.etag
        : `"sha256:${'7'.repeat(42)}${String(source.version_number)}"`,
      updated_at: '2026-11-11T09:00:00.000Z',
    }
    fixture.organizationSessionTemplates = fixture.organizationSessionTemplates.map((candidate) =>
      objectValue(candidate).id === templateId ? { ...objectValue(candidate), draft } : candidate,
    )
    return { status: 200, body: draft, headers: { ETag: String(draft.etag) } }
  }
  const programRetirementPath =
    /^\/studio\/v1\/organizations\/[^/]+\/programs\/([^/]+)\/versions\/(\d+)\/deprecation$/.exec(
      request.path,
    )
  if (request.method === 'POST' && programRetirementPath) {
    // `planning.deprecate_program_version`: converging, and cancelling nothing.
    const programId = programRetirementPath[1] ?? ''
    const number = Number(programRetirementPath[2])
    const program = fixture.organizationPrograms
      .map(objectValue)
      .find((candidate) => candidate.id === programId)
    const versions = (Array.isArray(program?.versions) ? program.versions : []).map(objectValue)
    const target = versions.find((version) => version.version_number === number)
    if (!program || !target) return { status: 404, body: problem('not-found', 404) }
    const retired = { ...target, status: 'deprecated' }
    fixture.organizationPrograms = fixture.organizationPrograms.map((candidate) =>
      objectValue(candidate).id === programId
        ? {
            ...objectValue(candidate),
            versions: versions.map((version) =>
              version.version_number === number ? retired : version,
            ),
          }
        : candidate,
    )
    return { status: 200, body: retired }
  }
  const templateRetirementPath =
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates\/([^/]+)\/versions\/(\d+)\/deprecation$/.exec(
      request.path,
    )
  if (request.method === 'POST' && templateRetirementPath) {
    // `planning.deprecate_session_template_version`: converging, and touching nothing else.
    const templateId = templateRetirementPath[1] ?? ''
    const number = Number(templateRetirementPath[2])
    const template = fixture.organizationSessionTemplates
      .map(objectValue)
      .find((candidate) => candidate.id === templateId)
    const versions = (Array.isArray(template?.versions) ? template.versions : []).map(objectValue)
    const summary = versions.find((version) => version.version_number === number)
    const content = summary ? fixture.templateVersionContents[String(summary.id)] : undefined
    if (!template || !summary || !content) return { status: 404, body: problem('not-found', 404) }
    fixture.organizationSessionTemplates = fixture.organizationSessionTemplates.map((candidate) =>
      objectValue(candidate).id === templateId
        ? {
            ...objectValue(candidate),
            versions: versions.map((version) =>
              version.version_number === number ? { ...version, status: 'deprecated' } : version,
            ),
          }
        : candidate,
    )
    return {
      status: 200,
      body: {
        id: summary.id,
        template_id: templateId,
        version_number: number,
        discipline_code: template.discipline_code,
        activity_type_id: content.activity_type_id,
        derived_from_version_id: null,
        title: content.title,
        status: 'deprecated',
        published_at: summary.published_at,
        steps: content.steps,
      },
    }
  }
  /*
   * `OP-PLN-021`, both reads: the organization in the path or a 404, and the
   * version whole with its current status. Nothing here can change a version.
   */
  const templateVersionPath =
    /^\/studio\/v1\/organizations\/[^/]+\/session-templates\/([^/]+)\/versions\/(\d+)$/.exec(
      request.path,
    )
  if (request.method === 'GET' && templateVersionPath) {
    const template = fixture.organizationSessionTemplates
      .map(objectValue)
      .find((candidate) => candidate.id === templateVersionPath[1])
    const summary = (Array.isArray(template?.versions) ? template.versions : [])
      .map(objectValue)
      .find((version) => version.version_number === Number(templateVersionPath[2]))
    const content = summary ? fixture.templateVersionContents[String(summary.id)] : undefined
    if (!template || !summary || !content) {
      return { status: 404, body: problem('not-found', 404) }
    }
    return {
      status: 200,
      body: {
        id: summary.id,
        template_id: template.id,
        version_number: summary.version_number,
        discipline_code: template.discipline_code,
        activity_type_id: content.activity_type_id,
        derived_from_version_id: null,
        title: content.title,
        status: summary.status,
        published_at: summary.published_at,
        steps: content.steps,
      },
    }
  }
  const programVersionPath =
    /^\/studio\/v1\/organizations\/[^/]+\/programs\/([^/]+)\/versions\/(\d+)$/.exec(request.path)
  if (request.method === 'GET' && programVersionPath) {
    const program = fixture.organizationPrograms
      .map(objectValue)
      .find((candidate) => candidate.id === programVersionPath[1])
    const version = (Array.isArray(program?.versions) ? program.versions : [])
      .map(objectValue)
      .find((candidate) => candidate.version_number === Number(programVersionPath[2]))
    if (!version) return { status: 404, body: problem('not-found', 404) }
    return { status: 200, body: version }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/catalog/activity-types') {
    return { status: 200, body: { items: fixture.activityTypes } }
  }
  const movementPath = /^\/studio\/v1\/organizations\/[^/]+\/movements\/([^/]+)$/.exec(request.path)
  if (request.method === 'GET' && movementPath) {
    const entry = fixture.movements.find(({ movement }) => movement.id === movementPath[1])
    if (!entry) return { status: 404, body: problem('not-found', 404) }
    return { status: 200, body: movementDocument(entry) }
  }
  const archivalPath = /^\/studio\/v1\/organizations\/[^/]+\/movements\/([^/]+)\/archival$/.exec(
    request.path,
  )
  if (request.method === 'POST' && archivalPath) {
    // `catalog.archive_organization_movement`: the organization's own only, and
    // converging — archiving an archived one answers it and changes nothing.
    const entry = fixture.movements.find(
      ({ movement }) => movement.id === archivalPath[1] && movement.scope === 'organization',
    )
    if (!entry) return { status: 404, body: problem('not-found', 404) }
    if (entry.movement.archived === true) {
      return { status: 200, body: movementDocument(entry) }
    }
    const archived = replaceMovement(fixture, {
      ...entry,
      movement: { ...entry.movement, archived: true },
      revision: (entry.revision ?? 1) + 1,
    })
    return { status: 200, body: movementDocument(archived) }
  }
  if (request.method === 'PATCH' && movementPath) {
    /*
     * What `catalog.update_organization_movement` and the trigger that keeps a
     * movement's meaning do, in their order: the fields checked, then only the
     * organization's own (a global one is 404), archived refused, the revision
     * compared, a rename or a new discipline refused once a published version
     * uses it, and a name another of ours has refused by the unique index.
     */
    const body = objectValue(request.body)
    const { expected_revision: expected, ...changes } = body
    const problems = movementProblems(fixture, {
      ...(typeof changes.discipline_code === 'string'
        ? { disciplineCode: changes.discipline_code }
        : {}),
      ...(typeof changes.name === 'string' ? { name: changes.name } : {}),
      ...(Array.isArray(changes.aliases) ? { aliases: changes.aliases.map(String) } : {}),
      ...('variant' in changes ? { variant: changes.variant } : {}),
    })
    if (Object.keys(changes).length === 0) problems.push('changes')
    if (problems.length > 0) {
      return {
        status: 422,
        body: problem('validation-failed', 422, {
          errors: problems.map((code) => ({ code, path: `/${code}`, message: code })),
        }),
      }
    }
    let entry = fixture.movements.find(
      ({ movement }) => movement.id === movementPath[1] && movement.scope === 'organization',
    )
    if (!entry) return { status: 404, body: problem('not-found', 404) }
    if (entry.movement.archived === true) {
      return {
        status: 409,
        body: problem('conflict', 409, {
          errors: [{ code: 'movement-archived', path: '', message: 'movement-archived' }],
        }),
      }
    }
    if (fixture.movementEditOutcome === 'stale') {
      // A teammate's edit lands first: one more other name, and a new revision.
      fixture.movementEditOutcome = 'saved'
      entry = replaceMovement(fixture, {
        ...entry,
        aliases: [...entry.aliases, 'Remo a una mano'],
        revision: (entry.revision ?? 1) + 1,
      })
    }
    if (Number(expected) !== (entry.revision ?? 1)) {
      return { status: 409, body: problem('stale-draft', 409) }
    }
    const renamed =
      typeof changes.name === 'string' &&
      normalizeMovementName(changes.name) !== normalizeMovementName(String(entry.movement.name))
    const moved =
      typeof changes.discipline_code === 'string' &&
      changes.discipline_code !== entry.movement.discipline_code
    if (entry.nameLocked === true && (renamed || moved)) {
      return {
        status: 409,
        body: problem('conflict', 409, {
          errors: [{ code: 'movement-in-use', path: '', message: 'movement-in-use' }],
        }),
      }
    }
    if (
      typeof changes.name === 'string' &&
      movementNameTaken(fixture, changes.name, String(entry.movement.id))
    ) {
      return {
        status: 409,
        body: problem('conflict', 409, {
          errors: [{ code: 'name-taken', path: '/name', message: 'name-taken' }],
        }),
      }
    }
    const updated = replaceMovement(fixture, {
      ...entry,
      movement: {
        ...entry.movement,
        ...(typeof changes.name === 'string' ? { name: tidyMovementName(changes.name) } : {}),
        ...(typeof changes.discipline_code === 'string'
          ? { discipline_code: changes.discipline_code }
          : {}),
      },
      aliases: Array.isArray(changes.aliases)
        ? changes.aliases.map((alias) => tidyMovementName(String(alias)))
        : entry.aliases,
      variantOf:
        'variant' in changes
          ? variantOfDocument(fixture, changes.variant)
          : (entry.variantOf ?? null),
      revision: (entry.revision ?? 1) + 1,
    })
    return { status: 200, body: movementDocument(updated) }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/movements$/.test(request.path)
  ) {
    /*
     * What `catalog.create_organization_movement` does: every field checked
     * first and refused together, then a name already used in the organization
     * refused by its unique index, and the command id kept as the movement's id.
     */
    const body = objectValue(request.body)
    const name = String(body.name ?? '')
    const aliases = Array.isArray(body.aliases) ? body.aliases.map(String) : []
    const problems = movementProblems(fixture, {
      disciplineCode: String(body.discipline_code ?? ''),
      name,
      aliases,
      variant: body.variant,
    })
    if (problems.length > 0) {
      return {
        status: 422,
        body: problem('validation-failed', 422, {
          errors: problems.map((code) => ({ code, path: `/${code}`, message: code })),
        }),
      }
    }
    if (movementNameTaken(fixture, name)) {
      return {
        status: 409,
        body: problem('conflict', 409, {
          errors: [{ code: 'name-taken', path: '/name', message: 'name-taken' }],
        }),
      }
    }
    const entry = {
      movement: {
        id: request.headers['command-id'] ?? '01991600-c000-7000-8000-000000000099',
        discipline_code: String(body.discipline_code),
        name: tidyMovementName(name),
        scope: 'organization',
        archived: false,
        muscles: [],
        equipment: [],
        demo_url: null,
      },
      aliases: aliases.map(tidyMovementName),
      revision: 1,
      variantOf: variantOfDocument(fixture, body.variant),
      nameLocked: false,
    }
    fixture.movements = [...fixture.movements, entry]
    return { status: 201, body: movementDocument(entry) }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/programs$/.test(request.path)
  ) {
    return {
      status: 200,
      body: {
        data: fixture.organizationPrograms,
        page: { has_more: false, next_cursor: null },
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/programs$/.test(request.path)
  ) {
    // What `planning.create_program` writes: an organization-owned program in
    // `draft`, and a first draft with the trimmed name, no notes and no sessions.
    const organizationId = request.path.split('/')[4] ?? ''
    const body = objectValue(request.body)
    const sequence = String(fixture.organizationPrograms.length + 1).padStart(3, '0')
    const programId = `01991600-9000-7000-8000-000000000${sequence}`
    const etag = `"sha256:${'9'.repeat(40)}${sequence}"`
    const program = {
      id: programId,
      organization_id: organizationId,
      status: 'draft',
      author_person_id: '01991600-7000-7000-8000-000000000002',
      draft: {
        id: `01991600-9000-7000-8000-000000001${sequence}`,
        program_id: programId,
        content_schema_version: 1,
        content: { title: String(body.title).trim(), notes: null, sessions: [] },
        etag,
        updated_at: '2026-11-10T15:04:11.000Z',
        deprecated_template_version_ids: [],
      },
      versions: [],
    }
    fixture.organizationPrograms = [program, ...fixture.organizationPrograms]
    return {
      status: 201,
      body: program,
      headers: {
        ETag: etag,
        Location: `/studio/v1/organizations/${organizationId}/programs/${programId}/draft`,
      },
    }
  }
  const programDraftPath = /^\/studio\/v1\/organizations\/[^/]+\/programs\/([^/]+)\/draft$/.exec(
    request.path,
  )
  if (request.method === 'PUT' && programDraftPath) {
    /*
     * What `planning.replace_program_draft` does, in its order: 428 without the
     * condition, the current draft with a stale one, then every session's
     * version checked, and a retired version refused only where it is new.
     */
    const programId = programDraftPath[1] ?? ''
    const program = fixture.organizationPrograms
      .map(objectValue)
      .find((candidate) => candidate.id === programId)
    if (!program) return { status: 404, body: problem('not-found', 404) }
    const expected = request.headers['if-match']
    if (!expected) return { status: 428, body: problem('precondition-required', 428) }
    let current = objectValue(program.draft)
    if (fixture.programDraftSaveOutcome === 'stale') {
      fixture.programDraftSaveOutcome = 'saved'
      const theirs = objectValue(current.content)
      current = replaceProgramDraft(fixture, programId, {
        ...theirs,
        title: `${String(theirs.title)} (versión del equipo)`,
      })
    }
    if (expected !== current.etag) {
      return { status: 409, body: problem('stale-draft', 409, { current_state: current }) }
    }
    const content = objectValue(request.body)
    const errors = programDraftErrors(fixture, content, objectValue(current.content))
    if (errors.length > 0) {
      return {
        status: 422,
        body: problem('validation-failed', 422, {
          errors: errors.map((code) => ({ code, path: '/sessions', message: code })),
        }),
      }
    }
    const saved = replaceProgramDraft(fixture, programId, content)
    return { status: 200, body: saved, headers: { ETag: String(saved.etag) } }
  }
  const programVersionsPath =
    /^\/studio\/v1\/organizations\/[^/]+\/programs\/([^/]+)\/versions$/.exec(request.path)
  if (request.method === 'POST' && programVersionsPath) {
    /*
     * What `planning.publish_program_version` does: 428 without the condition,
     * the current draft with a stale one, `sessions` for an empty draft, and —
     * against the newest version only — that version again when nothing changed.
     * A retired version the draft kept is published as it is.
     */
    const programId = programVersionsPath[1] ?? ''
    const program = fixture.organizationPrograms
      .map(objectValue)
      .find((candidate) => candidate.id === programId)
    if (!program) return { status: 404, body: problem('not-found', 404) }
    const expected = request.headers['if-match']
    if (!expected) return { status: 428, body: problem('precondition-required', 428) }
    const draft = objectValue(program.draft)
    if (expected !== draft.etag) {
      return { status: 409, body: problem('stale-draft', 409, { current_state: draft }) }
    }
    const content = objectValue(draft.content)
    const sessions = (Array.isArray(content.sessions) ? content.sessions : []).map(objectValue)
    if (sessions.length === 0) {
      return {
        status: 422,
        body: problem('validation-failed', 422, {
          errors: [{ code: 'sessions', path: '/sessions', message: 'sessions' }],
        }),
      }
    }
    const versions = (Array.isArray(program.versions) ? program.versions : []).map(objectValue)
    const latest = Math.max(0, ...versions.map((version) => Number(version.version_number)))
    const unchanged = fixture.publishedProgramContents[programId] === JSON.stringify(content)
    if (unchanged && latest > 0) {
      const newest = versions.find((version) => Number(version.version_number) === latest)
      return { status: 201, body: newest }
    }
    const number = latest + 1
    const version = {
      id: `01991600-9000-7000-8000-0000000003${String(number).padStart(2, '0')}`,
      program_id: programId,
      version_number: number,
      status: 'published',
      title: String(content.title),
      notes: content.notes ?? null,
      repeats_forever: content.repeats_forever === true,
      sessions: sessions.toSorted((left, right) => Number(left.position) - Number(right.position)),
      published_at: '2026-11-10T17:00:00.000Z',
      session_count: sessions.length,
      deprecated_template_version_ids: [
        ...new Set(
          Array.isArray(draft.deprecated_template_version_ids)
            ? draft.deprecated_template_version_ids
            : [],
        ),
      ],
    }
    fixture.publishedProgramContents[programId] = JSON.stringify(content)
    fixture.organizationPrograms = fixture.organizationPrograms.map((candidate) =>
      objectValue(candidate).id === programId
        ? { ...objectValue(candidate), status: 'published', versions: [version, ...versions] }
        : candidate,
    )
    return { status: 201, body: version }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/offerable-scopes') {
    return { status: 200, body: { items: fixture.offerableScopes } }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/catalog/information-categories') {
    return { status: 200, body: { items: fixture.informationCategories } }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/client-invitations$/.test(request.path)
  ) {
    /*
     * Echoes the request rather than answering a fixed shape, which it used to.
     * The form shows the scopes it asked for on the confirmation, so a hardcoded
     * list would have agreed with the screen by accident and hidden a defect in
     * what was actually sent.
     */
    const asked = (request.body ?? {}) as {
      scopes?: Array<{ scope_code?: string; access_level?: string }>
      program?: { program_version_id?: string; starts_on?: string; timezone?: string }
    }
    if (asked.program && fixture.programProposalOutcome === 'stale') {
      return { status: 422, body: { error: { code: 'validation-failed' } } }
    }
    return {
      status: 201,
      body: {
        id: '01991600-7000-7000-8000-000000000401',
        invitation_intent_id: '01991600-7000-7000-8000-000000000402',
        status: 'pending',
        channel: 'email',
        contact_hint: 'a***@example.test',
        expires_at: '2030-01-01T12:00:00.000Z',
        scope_codes: (asked.scopes ?? []).map((scope) => scope.scope_code),
        program_proposal: asked.program
          ? {
              program_version_id: asked.program.program_version_id,
              starts_on: asked.program.starts_on,
              timezone: asked.program.timezone,
            }
          : null,
        reused: false,
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients$/.test(request.path)
  ) {
    const params = new URLSearchParams(request.search)
    const status = params.get('status')
    /*
     * The search mirrors the route rather than being convenient: up to 200
     * characters raw, 2 to 80 once surrounding and repeated spaces are gone,
     * and refused together with `invited` because an unanswered invitation has
     * no name to match. `%` and `_` are characters here as they are there.
     */
    const rawSearch = params.get('q')
    let search: string | undefined
    if (rawSearch !== null) {
      if (rawSearch.length > 200) return { status: 422, body: error('validation-failed') }
      const normalized = rawSearch.trim().replace(/\s+/gu, ' ')
      if (normalized.length < 2 || normalized.length > 80) {
        return { status: 422, body: error('validation-failed') }
      }
      if (status === 'invited') return { status: 422, body: error('validation-failed') }
      search = normalized
    }
    // The filter is one value over two kinds of row: `invited` selects the
    // invitations, the other two select relationships by their own state.
    const filtered = status
      ? fixture.organizationClients.filter((entry) => {
          if (typeof entry !== 'object' || entry === null || !('kind' in entry)) return false
          if (status === 'invited') return entry.kind === 'invitation'
          return (
            entry.kind === 'relationship' &&
            'relationship_status' in entry &&
            entry.relationship_status === status
          )
        })
      : fixture.organizationClients
    // Names only, accents and case ignored — so a search never reaches an
    // invitation, which is what makes the `invited` refusal above consistent.
    const data = search
      ? filtered.filter(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'display_name' in entry &&
            typeof entry.display_name === 'string' &&
            foldForSearch(entry.display_name).includes(foldForSearch(search)),
        )
      : filtered
    return {
      status: 200,
      body: {
        data,
        page: { has_more: false, next_cursor: null },
        guest_quota: fixture.guestQuota ?? {
          seats: null,
          occupied: fixture.organizationClients.length,
          places_left: null,
          over_quota: false,
        },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/authorized-scopes$/.test(request.path)
  ) {
    return {
      status: 200,
      body: {
        data: fixture.authorizedScopes,
        page: { has_more: false, next_cursor: null },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/subscriptions$/.test(request.path)
  ) {
    const status = new URLSearchParams(request.search).get('status')
    const data = status
      ? fixture.organizationSubscriptions.filter(
          (entry) =>
            typeof entry === 'object' &&
            entry !== null &&
            'status' in entry &&
            entry.status === status,
        )
      : fixture.organizationSubscriptions
    return { status: 200, body: { data, page: { has_more: false, next_cursor: null } } }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/plans$/.test(request.path)
  ) {
    // `OP-PAY-006`: every member reads it, coach and staff included.
    fixture.organizationPlans = sortPlans(fixture.organizationPlans)
    return {
      status: 200,
      body: { data: fixture.organizationPlans, page: { has_more: false, next_cursor: null } },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/plans$/.test(request.path)
  ) {
    /*
     * `payments.create_organization_plan`: a trimmed name of one to eighty characters, then
     * the unique index on the name without regard to case, which the API answers as `409`.
     * The legacy `{ error }` envelope, because the payments routes still answer it.
     */
    const name = String(objectValue(request.body).name ?? '').trim()
    if (!name || name.length > 80) return { status: 422, body: error('validation-failed') }
    if (planNameTaken(fixture, name)) return { status: 409, body: error('conflict') }
    const sequence = String(fixture.organizationPlans.length + 1).padStart(3, '0')
    const plan = {
      plan_id: `01991600-e000-7000-8000-000000000${sequence}`,
      name,
      status: 'draft',
      on_sale: false,
      created_at: '2026-11-11T15:00:00.000Z',
      current_version: null,
      versions: [],
    }
    fixture.organizationPlans = sortPlans([...fixture.organizationPlans, plan])
    return { status: 201, body: plan }
  }
  const planPath = /^\/studio\/v1\/organizations\/[^/]+\/plans\/([^/]+)$/.exec(request.path)
  if (request.method === 'PATCH' && planPath) {
    // `payments.rename_organization_plan`: the same rules, a draft and a plan on sale alike.
    const name = String(objectValue(request.body).name ?? '').trim()
    if (!name || name.length > 80) return { status: 422, body: error('validation-failed') }
    const plan = fixture.organizationPlans
      .map(objectValue)
      .find((candidate) => candidate.plan_id === planPath[1])
    if (!plan) return { status: 404, body: error('not-found') }
    if (planNameTaken(fixture, name, String(plan.plan_id))) {
      return { status: 409, body: error('conflict') }
    }
    const renamed = { ...plan, name }
    fixture.organizationPlans = sortPlans(
      fixture.organizationPlans.map((candidate) =>
        objectValue(candidate).plan_id === plan.plan_id ? renamed : candidate,
      ),
    )
    return { status: 200, body: renamed }
  }
  const planVersionsPath = /^\/studio\/v1\/organizations\/[^/]+\/plans\/([^/]+)\/versions$/.exec(
    request.path,
  )
  if (request.method === 'POST' && planVersionsPath) {
    /*
     * `payments.publish_plan_version`: whole pesos in COP, monthly or yearly, in person or
     * remote. The price already on sale answers `200` unchanged; a new one retires it.
     */
    const body = objectValue(request.body)
    const amount = body.amount_minor
    if (
      typeof amount !== 'number' ||
      !Number.isInteger(amount) ||
      amount < 100 ||
      amount > 100_000_000_000 ||
      amount % 100 !== 0 ||
      body.currency_code !== 'COP' ||
      (body.billing_period !== 'month' && body.billing_period !== 'year') ||
      (body.delivery_mode !== 'in_person' && body.delivery_mode !== 'remote')
    ) {
      return { status: 422, body: error('validation-failed') }
    }
    const plan = fixture.organizationPlans
      .map(objectValue)
      .find((candidate) => candidate.plan_id === planVersionsPath[1])
    if (!plan) return { status: 404, body: error('not-found') }
    const current = plan.current_version === null ? null : objectValue(plan.current_version)
    if (
      current &&
      current.amount_minor === amount &&
      current.billing_period === body.billing_period &&
      current.delivery_mode === body.delivery_mode
    ) {
      return { status: 200, body: plan }
    }
    const versions = Array.isArray(plan.versions) ? plan.versions.map(objectValue) : []
    const sequence = fixture.organizationPlans
      .map(objectValue)
      .reduce(
        (total, entry) => total + (Array.isArray(entry.versions) ? entry.versions.length : 0),
        1,
      )
    const published = {
      plan_version_id: `01991600-e100-7000-8000-${String(sequence).padStart(12, '0')}`,
      version_number:
        versions.reduce((top, entry) => Math.max(top, Number(entry.version_number)), 0) + 1,
      amount_minor: amount,
      currency_code: 'COP',
      billing_period: body.billing_period,
      delivery_mode: body.delivery_mode,
      status: 'published',
      published_at: '2026-11-11T15:00:00.000Z',
      deprecated_at: null,
    }
    const next = {
      ...plan,
      status: 'published',
      on_sale: true,
      current_version: published,
      versions: [
        published,
        ...versions.map((entry) =>
          entry.status === 'published'
            ? { ...entry, status: 'deprecated', deprecated_at: '2026-11-11T15:00:00.000Z' }
            : entry,
        ),
      ],
    }
    fixture.organizationPlans = sortPlans(
      fixture.organizationPlans.map((candidate) =>
        objectValue(candidate).plan_id === plan.plan_id ? next : candidate,
      ),
    )
    return { status: 201, body: next }
  }
  const deprecationPath =
    /^\/studio\/v1\/organizations\/[^/]+\/plans\/([^/]+)\/versions\/([^/]+)\/deprecation$/.exec(
      request.path,
    )
  if (request.method === 'POST' && deprecationPath) {
    /*
     * `payments.deprecate_plan_version`: retiring the price on sale takes the plan off sale;
     * retiring one already retired converges, and either way it answers the plan.
     */
    const plan = fixture.organizationPlans
      .map(objectValue)
      .find((candidate) => candidate.plan_id === deprecationPath[1])
    const versions = plan && Array.isArray(plan.versions) ? plan.versions.map(objectValue) : []
    if (!plan || !versions.some((entry) => entry.plan_version_id === deprecationPath[2])) {
      return { status: 404, body: error('not-found') }
    }
    const retired = versions.map((entry) =>
      entry.plan_version_id === deprecationPath[2] && entry.status === 'published'
        ? { ...entry, status: 'deprecated', deprecated_at: '2026-11-11T15:00:00.000Z' }
        : entry,
    )
    const current = plan.current_version === null ? null : objectValue(plan.current_version)
    const stillOnSale = current !== null && current.plan_version_id !== deprecationPath[2]
    const next = {
      ...plan,
      on_sale: stillOnSale,
      current_version: stillOnSale ? current : null,
      versions: retired,
    }
    fixture.organizationPlans = sortPlans(
      fixture.organizationPlans.map((candidate) =>
        objectValue(candidate).plan_id === plan.plan_id ? next : candidate,
      ),
    )
    return { status: 200, body: next }
  }
  /*
   * The three transitions answer the same shape and differ only in the state they leave
   * behind, so one handler reads the verb from the path. Writing the new state into the
   * fixture is what lets a test assert that the list the screen returns to has moved.
   */
  {
    const transition =
      request.method === 'POST'
        ? /^\/studio\/v1\/organizations\/[^/]+\/subscriptions\/([^/]+)\/(suspension|reactivation|termination)$/.exec(
            request.path,
          )
        : null
    if (transition) {
      const subscriptionId = transition[1] ?? ''
      const verb = transition[2]
      if (fixture.subscriptionOutcome !== 'applied') {
        return {
          status: fixture.subscriptionOutcome === 'no-cause' ? 409 : 403,
          body: {
            error: fixture.subscriptionOutcome === 'no-cause' ? 'conflict' : 'forbidden',
          },
        }
      }
      const status =
        verb === 'suspension' ? 'suspended' : verb === 'reactivation' ? 'active' : 'ended'
      fixture.organizationSubscriptions = fixture.organizationSubscriptions.map((entry) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('subscription_id' in entry) ||
          entry.subscription_id !== subscriptionId
        ) {
          return entry
        }
        return {
          ...entry,
          status,
          suspended_at: status === 'suspended' ? '2026-10-20T09:00:00.000Z' : null,
          ended_at: status === 'ended' ? '2026-10-20T09:00:00.000Z' : null,
        }
      })
      return { status: 200, body: { subscription_id: subscriptionId, status } }
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/termination$/.test(request.path)
  ) {
    if (fixture.terminationOutcome !== 'terminated') {
      return {
        status: fixture.terminationOutcome === 'already-ended' ? 409 : 403,
        body: {
          error: fixture.terminationOutcome === 'already-ended' ? 'conflict' : 'forbidden',
        },
      }
    }
    const current = fixture.relationshipState as Record<string, unknown>
    const endedAt = '2026-11-04T15:20:00.000Z'
    const grants = ((current.grants ?? []) as Array<Record<string, unknown>>).map((grant) =>
      grant.status === 'active' ? { ...grant, status: 'frozen' } : grant,
    )
    fixture.relationshipState = {
      ...current,
      status: 'terminated',
      ended_at: endedAt,
      holder: null,
      substitutions: ((current.substitutions ?? []) as Array<Record<string, unknown>>).map(
        (cover) => (cover.status === 'active' ? { ...cover, status: 'ended' } : cover),
      ),
      grants,
    }
    return {
      status: 200,
      body: {
        relationship_id: relationshipState.relationship_id,
        person_id: relationshipState.person_id,
        ended_at: endedAt,
        frozen_grants: grants.filter((grant) => grant.status === 'frozen').length,
        closed_assignments: 1,
      },
    }
  }

  const ending = request.path.match(
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/substitutions\/([^/]+)\/termination$/,
  )
  if (request.method === 'POST' && ending) {
    if (fixture.substitutionEndOutcome !== 'ended') {
      return {
        status: fixture.substitutionEndOutcome === 'already-ended' ? 409 : 403,
        body: {
          error: fixture.substitutionEndOutcome === 'already-ended' ? 'conflict' : 'forbidden',
        },
      }
    }
    const current = fixture.relationshipState as Record<string, unknown>
    const covers = (current.substitutions ?? []) as Array<Record<string, unknown>>
    const endedAt = '2026-11-04T15:20:00.000Z'
    fixture.relationshipState = {
      ...current,
      substitutions: covers.map((cover) =>
        cover.assignment_id === ending[1] ? { ...cover, status: 'ended' } : cover,
      ),
    }
    const closed = covers.find((cover) => cover.assignment_id === ending[1])
    return {
      status: 200,
      body: {
        assignment_id: ending[1],
        relationship_id: relationshipState.relationship_id,
        membership_id: closed?.membership_id ?? '',
        professional_person_id: closed?.professional_person_id ?? '',
        ended_at: endedAt,
      },
    }
  }

  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/substitutions$/.test(request.path)
  ) {
    if (fixture.substitutionOutcome !== 'proposed') {
      return {
        status: fixture.substitutionOutcome === 'already-proposed' ? 409 : 403,
        body: {
          error: fixture.substitutionOutcome === 'already-proposed' ? 'conflict' : 'forbidden',
        },
      }
    }
    const asked = (request.body ?? {}) as {
      membership_id?: string
      starts_on?: string
      ends_on?: string
    }
    const cover = fixture.organizationMemberships.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'membership_id' in entry &&
        entry.membership_id === asked.membership_id,
    ) as { membership_id: string; display_name: string } | undefined
    const assignmentId = '01991600-7000-7000-8000-000000000399'
    /*
     * The screen refetches rather than trusting the answer, so the fixture has
     * to carry the new cover too — and it carries it as `proposed`, because
     * proposing grants nothing until the person answers.
     */
    const current = fixture.relationshipState as Record<string, unknown>
    fixture.relationshipState = {
      ...current,
      substitutions: [
        ...((current.substitutions ?? []) as unknown[]),
        {
          assignment_id: assignmentId,
          membership_id: cover?.membership_id ?? '',
          professional_person_id: '01991600-7000-7000-8000-000000000299',
          display_name: cover?.display_name ?? '',
          valid_from: `${asked.starts_on}T00:00:00.000Z`,
          status: 'proposed',
          ends_on: asked.ends_on ?? null,
          accepted_by_person_at: null,
        },
      ],
    }
    return {
      status: 201,
      body: {
        assignment_id: assignmentId,
        relationship_id: relationshipState.relationship_id,
        membership_id: cover?.membership_id ?? '',
        professional_person_id: '01991600-7000-7000-8000-000000000299',
        starts_on: asked.starts_on ?? '',
        ends_on: asked.ends_on ?? '',
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/professional-assignments\/reassignment$/.test(
      request.path,
    )
  ) {
    if (fixture.reassignmentOutcome !== 'reassigned') {
      return {
        status: fixture.reassignmentOutcome === 'no-holder' ? 409 : 403,
        body: { error: fixture.reassignmentOutcome === 'no-holder' ? 'conflict' : 'forbidden' },
      }
    }
    const moving = (request.body ?? {}) as { membership_id?: string }
    const incoming = fixture.organizationMemberships.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'membership_id' in entry &&
        entry.membership_id === moving.membership_id,
    ) as { membership_id: string; display_name: string } | undefined
    const previous = (fixture.relationshipState as { holder?: { assignment_id?: string } }).holder
    fixture.relationshipState = {
      ...(fixture.relationshipState as Record<string, unknown>),
      holder: {
        assignment_id: '01991600-7000-7000-8000-000000000398',
        membership_id: incoming?.membership_id ?? '',
        professional_person_id: '01991600-7000-7000-8000-000000000298',
        display_name: incoming?.display_name ?? '',
        valid_from: '2026-10-05T12:00:00.000Z',
      },
    }
    return {
      status: 201,
      body: {
        assignment_id: '01991600-7000-7000-8000-000000000398',
        relationship_id: relationshipState.relationship_id,
        membership_id: incoming?.membership_id ?? '',
        professional_person_id: '01991600-7000-7000-8000-000000000298',
        valid_from: '2026-10-05T12:00:00.000Z',
        replaced_assignment_id: previous?.assignment_id ?? null,
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/professional-assignments$/.test(
      request.path,
    )
  ) {
    if (fixture.assignmentOutcome !== 'created') {
      return {
        status: fixture.assignmentOutcome === 'taken' ? 409 : 403,
        body: { error: fixture.assignmentOutcome === 'taken' ? 'conflict' : 'forbidden' },
      }
    }
    // The screen refetches rather than trusting the answer, so the fixture has
    // to change too: without this the panel would reappear with the form.
    const chosen = (request.body ?? {}) as { membership_id?: string }
    const coach = fixture.organizationMemberships.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'membership_id' in entry &&
        entry.membership_id === chosen.membership_id,
    ) as { membership_id: string; display_name: string } | undefined
    fixture.relationshipState = {
      ...(fixture.relationshipState as Record<string, unknown>),
      holder: {
        assignment_id: '01991600-7000-7000-8000-000000000399',
        membership_id: coach?.membership_id ?? '',
        professional_person_id: '01991600-7000-7000-8000-000000000299',
        display_name: coach?.display_name ?? '',
        valid_from: '2026-10-02T12:00:00.000Z',
      },
    }
    return { status: 201, body: fixture.relationshipState }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/progress$/.test(request.path)
  ) {
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    // Nothing shared is the `403` that names the category, not a window of
    // zeros: with nothing to compute from, the route refuses before reading.
    if (fixture.clientProgress === null) {
      return {
        status: 403,
        body: {
          type: 'https://errors.allfit.invalid/scope-required',
          title: 'Required consent is not effective',
          status: 403,
          required_scope: { code: 'relationship_training', level: 'read' },
        },
      }
    }
    /*
     * The three parameters are required, so a request missing one is the
     * contract being broken by the screen rather than by a person — answered
     * `400`, which is what makes that mistake visible instead of silent.
     */
    const params = new URLSearchParams(request.search ?? '')
    const period = params.get('period')
    const count = Number(params.get('count'))
    if (!params.get('timezone') || (period !== 'week' && period !== 'month')) {
      return { status: 400, body: error('bad-request') }
    }
    if (!Number.isInteger(count) || count < 1 || count > 12) {
      return { status: 400, body: error('bad-request') }
    }
    // The period travels back, because the screen reads it from the answer.
    return {
      status: 200,
      body: { ...(fixture.clientProgress as Record<string, unknown>), period },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/executions\/[^/]+$/.test(request.path)
  ) {
    if (fixture.executionDetailOutcome === 'scope-required') {
      // Only while she shares neither training category; everything else is a 404.
      return {
        status: 403,
        body: {
          type: 'https://errors.allfit.invalid/scope-required',
          title: 'Required consent is not effective',
          status: 403,
          required_scope: { code: 'relationship_training', level: 'read' },
        },
      }
    }
    /*
     * One answer for six reasons, exactly as in production: a fixture that told
     * them apart would let a screen be built on a difference the API never
     * reports, and the difference it would leak is about her.
     */
    if (fixture.executionDetailOutcome === 'not-found' || fixture.clientCard === null) {
      return { status: 404, body: error('not-found') }
    }
    return { status: 200, body: fixture.clientExecutionDetail }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/executions$/.test(request.path)
  ) {
    // Not attending her is the same 404 as a person who does not exist, and the
    // card is what says whether he attends her.
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    const search = new URLSearchParams(request.search ?? '')
    const cursor = search.get('cursor')
    if (cursor && fixture.executionsCursor === 'stale') {
      return { status: 422, body: error('invalid-cursor') }
    }
    /*
     * Paged for real rather than handed over whole: «Ver más» is the only way to
     * a second page, and a fixture that answered everything at once would let it
     * ship without ever being pressed. The cursor is opaque, as the route's is.
     */
    const limit = Math.min(Math.max(Number(search.get('limit') ?? '25'), 1), 100)
    const from = cursor ? Number(cursor.split('-').at(-1)) : 0
    const slice = fixture.clientExecutions.slice(from, from + limit)
    const hasMore = from + limit < fixture.clientExecutions.length
    return {
      status: 200,
      body: {
        data: slice,
        page: {
          next_cursor: hasMore ? `execution-offset-${String(from + limit)}` : null,
          has_more: hasMore,
        },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/profile$/.test(request.path)
  ) {
    // Nothing shared is the `403` that names the category it would take, not an
    // empty profile: the route refuses before reading, and records the attempt.
    if (fixture.clientTrainingProfile === null) {
      return {
        status: 403,
        body: {
          type: 'https://errors.allfit.invalid/scope-required',
          title: 'Required consent is not effective',
          status: 403,
          required_scope: { code: 'relationship_training', level: 'read' },
        },
      }
    }
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    return { status: 200, body: fixture.clientTrainingProfile }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+$/.test(request.path)
  ) {
    // Absent and not-attended answer the same 404 here as in PostgreSQL. A
    // fixture that told them apart would let a screen be built on a difference
    // production never reports — and the difference it would leak is whether
    // the gym has that person as a client.
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    return { status: 200, body: fixture.clientCard }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/assignments$/.test(request.path)
  ) {
    // Nothing shared is the `403` that names the category, not an empty page:
    // the route refuses before reading, and records the attempt.
    if (fixture.relationshipAssignments === null) {
      return {
        status: 403,
        body: {
          type: 'https://errors.allfit.invalid/scope-required',
          title: 'Required consent is not effective',
          status: 403,
          required_scope: { code: 'relationship_training', level: 'read' },
        },
      }
    }
    const search = new URLSearchParams(request.search ?? '')
    const cursor = search.get('cursor')
    if (cursor && fixture.assignmentsCursor === 'stale') {
      return { status: 422, body: error('invalid-cursor') }
    }
    /*
     * Paged for real rather than handed over whole, for the same reason as the
     * sessions: «Ver más» is the only way to a second page, and a fixture that
     * answered everything at once would let it ship without ever being pressed.
     */
    const limit = Math.min(Math.max(Number(search.get('limit') ?? '25'), 1), 100)
    const from = cursor ? Number(cursor.split('-').at(-1)) : 0
    const slice = fixture.relationshipAssignments.slice(from, from + limit)
    const hasMore = from + limit < fixture.relationshipAssignments.length
    return {
      status: 200,
      body: {
        data: slice,
        page: {
          next_cursor: hasMore ? `assignment-offset-${String(from + limit)}` : null,
          has_more: hasMore,
        },
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/assignments$/.test(request.path)
  ) {
    const outcome = fixture.assignOutcome
    if (outcome === 'scope-required') {
      // She shares her training only to read, so the command refuses and names
      // the level it would take.
      return {
        status: 403,
        body: {
          type: 'https://errors.allfit.invalid/scope-required',
          title: 'Required consent is not effective',
          status: 403,
          required_scope: { code: 'relationship_training', level: 'contribute' },
        },
      }
    }
    if (outcome === 'forbidden') return { status: 403, body: error('forbidden') }
    if (outcome === 'service-paused') return { status: 409, body: error('service-paused') }
    if (outcome === 'program-version' || outcome === 'starts-on' || outcome === 'timezone') {
      /*
       * The three refusals that all arrive as `validation-failed`: only the
       * issue code tells them apart, which is exactly what the screen has to
       * read. The paths are the ones `validationPath` maps in the API.
       */
      const paths: Record<string, string> = {
        'program-version': '/program_version_id',
        'starts-on': '/starts_on',
        timezone: '/timezone',
      }
      return {
        status: 422,
        body: {
          type: 'https://errors.allfit.invalid/validation-failed',
          title: 'Request violates its closed schema or business validation',
          status: 422,
          request_id: 'studio-e2e-assign-refused',
          errors: [{ code: outcome, path: paths[outcome] }],
        },
      }
    }

    const body = (request.body ?? {}) as Record<string, unknown>
    const versionId = String(body['program_version_id'] ?? '')
    const startsOn = String(body['starts_on'] ?? '')
    const version = (fixture.organizationPrograms as { versions?: unknown[] }[])
      .flatMap((program) => program.versions ?? [])
      .find((candidate) => (candidate as { id?: string }).id === versionId) as
      Record<string, unknown> | undefined
    /*
     * The version's own session count either way, and the two mean different
     * things: for a finite version it is the whole program, planted at once;
     * for an open-ended one it is the week that was planted first. The number
     * happens to be the same field because a version describes one cycle.
     */
    const planted = Number(version?.['session_count'] ?? 1)
    const assignmentId = '01991600-e000-7000-8000-0000000000a1'

    /* The list has to show it afterwards, which is what makes the test real. */
    if (Array.isArray(fixture.relationshipAssignments)) {
      fixture.relationshipAssignments = [
        {
          id: assignmentId,
          status: 'active',
          program_version: {
            id: versionId,
            program_id: String(version?.['program_id'] ?? ''),
            version_number: Number(version?.['version_number'] ?? 1),
            title: String(version?.['title'] ?? 'Programa'),
            repeats_forever: version?.['repeats_forever'] === true,
          },
          starts_on: startsOn,
          timezone: 'America/Bogota',
          assigned_at: '2026-11-13T15:00:00.000Z',
          management: {
            relationship_id: '01991600-7000-7000-8000-000000000101',
            since: '2026-11-13T15:00:00.000Z',
          },
          sessions: [],
          adjustments: [],
        },
        ...fixture.relationshipAssignments,
      ]
    }

    return {
      status: 201,
      body: {
        id: assignmentId,
        status: 'active',
        origin_relationship_id: '01991600-7000-7000-8000-000000000101',
        program_version_id: versionId,
        starts_on: startsOn,
        timezone: 'America/Bogota',
        management: {
          relationship_id: '01991600-7000-7000-8000-000000000101',
          since: '2026-11-13T15:00:00.000Z',
        },
        planned_sessions_created: planted,
        schedule_overlaps: outcome === 'overlaps',
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+$/.test(request.path)
  ) {
    // Absent and not-permitted answer the same 404 here as in PostgreSQL: a
    // fixture that told them apart would let a screen be built on a difference
    // production never reports.
    if (fixture.relationshipState === null) return { status: 404, body: { error: 'not-found' } }
    return { status: 200, body: fixture.relationshipState }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/relationships\/[^/]+\/events$/.test(request.path)
  ) {
    if (fixture.relationshipState === null) return { status: 404, body: { error: 'not-found' } }

    /*
     * Paged for real rather than returned whole. The screen's «cargar más» is
     * the only way to reach a second page, and a fixture that handed everything
     * over at once would let it ship without ever being pressed.
     */
    const search = new URLSearchParams(request.search ?? '')
    const limit = Number(search.get('limit') ?? '25')
    const cursor = search.get('cursor')
    const all = fixture.relationshipHistory
    const from = cursor ? Number(cursor) : 0
    const slice = all.slice(from, from + limit)
    const next = from + limit < all.length ? String(from + limit) : null
    return {
      status: 200,
      body: { data: slice, page: { next_cursor: next, has_more: next !== null } },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/historical-access-cases$/.test(request.path)
  ) {
    const search = new URLSearchParams(request.search ?? '')
    const limit = Number(search.get('limit') ?? '25')
    const from = Number(search.get('cursor') ?? '0')
    const slice = fixture.historicalCases.slice(from, from + limit)
    const next = from + limit < fixture.historicalCases.length ? String(from + limit) : null
    return {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
      body: { data: slice, page: { next_cursor: next, has_more: next !== null } },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/historical-access-cases$/.test(request.path)
  ) {
    // RFC 9457 answers, as `studio-historical-access.ts` sends them.
    if (fixture.historicalOpenOutcome === 'reauthenticate') {
      return { status: 403, body: problem('reauthentication-required', 403) }
    }
    if (fixture.historicalOpenOutcome === 'conflict') {
      return { status: 409, body: problem('conflict', 409) }
    }
    if (fixture.historicalOpenOutcome === 'ineligible') {
      return { status: 422, body: problem('validation-failed', 422) }
    }
    const body = objectValue(request.body)
    const relationship = fixture.organizationClients
      .map(objectValue)
      .find((entry) => entry.relationship_id === body.relationship_id)
    if (!relationship || relationship.relationship_status !== 'terminated') {
      return { status: 404, body: problem('not-found', 404) }
    }
    const [given = '', ...family] = String(relationship.display_name).split(' ')
    const me = objectValue(fixture.memberships[0]).membership_id
    const holder = fixture.relationshipHistory
      .map(objectValue)
      .map((event) => objectValue(event.detail))
      .find((detail) => detail.membership_id === body.authorized_membership_id)
    const [holderGiven = '', ...holderFamily] = String(holder?.display_name ?? '').split(' ')
    const opener = { membership_id: me, given_name: 'Ada', family_name: 'Lovelace' }
    const openedAt = new Date()
    const opened = {
      id: `01991600-7000-7000-8000-${String(900000000000 + fixture.historicalCases.length)}`,
      organization_id: request.path.split('/')[4],
      relationship_id: body.relationship_id,
      person: { id: relationship.person_id, given_name: given, family_name: family.join(' ') },
      cut_at: relationship.ended_at,
      authorized:
        body.authorized_membership_id === me
          ? opener
          : {
              membership_id: body.authorized_membership_id,
              given_name: holderGiven,
              family_name: holderFamily.join(' '),
            },
      opened_by: opener,
      purpose: body.purpose,
      case_reference: body.case_reference,
      justification: body.justification,
      status: 'open',
      opened_at: openedAt.toISOString(),
      expires_at: new Date(
        openedAt.getTime() + Number(body.duration_hours) * 3600 * 1000,
      ).toISOString(),
      closed_at: null,
      closed_reason: null,
      closed_by: null,
    }
    fixture.historicalCases = [opened, ...fixture.historicalCases]
    return { status: 201, headers: { 'Cache-Control': 'no-store' }, body: opened }
  }
  const closure =
    /^\/studio\/v1\/organizations\/[^/]+\/historical-access-cases\/([^/]+)\/closure$/.exec(
      request.path,
    )
  if (request.method === 'POST' && closure) {
    if (fixture.historicalCloseOutcome === 'forbidden') {
      return { status: 403, body: problem('forbidden', 403) }
    }
    const index = fixture.historicalCases.findIndex((entry) => objectValue(entry).id === closure[1])
    const entry = objectValue(fixture.historicalCases[index])
    if (fixture.historicalCloseOutcome === 'gone' || index < 0) {
      return { status: 404, body: problem('not-found', 404) }
    }
    // It converges: a closed case answers as it stands, an expired one closes as expired.
    const closed =
      entry.status === 'closed'
        ? entry
        : {
            ...entry,
            status: 'closed',
            closed_at: entry.status === 'expired' ? entry.expires_at : new Date().toISOString(),
            closed_reason: entry.status === 'expired' ? 'expired' : 'closed_by_manager',
            closed_by:
              entry.status === 'expired'
                ? null
                : {
                    membership_id: objectValue(fixture.memberships[0]).membership_id,
                    given_name: 'Ada',
                    family_name: 'Lovelace',
                  },
          }
    fixture.historicalCases = fixture.historicalCases.map((candidate, at) =>
      at === index ? closed : candidate,
    )
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, body: closed }
  }
  const frozenRead =
    /^\/studio\/v1\/organizations\/[^/]+\/historical-relationships\/([^/]+)(?:\/(executions|body-progress|nutrition\/goal-versions))?$/.exec(
      request.path,
    )
  if (request.method === 'GET' && frozenRead) {
    // Only the open case the request names, over this relationship, for the member
    // it authorizes. Every other reason is the same 404, as the API answers it.
    const me = objectValue(fixture.memberships[0]).membership_id
    const through = fixture.historicalCases
      .map(objectValue)
      .find(
        (entry) =>
          entry.id === request.headers['x-historical-access-case'] &&
          entry.relationship_id === frozenRead[1] &&
          entry.status === 'open' &&
          objectValue(entry.authorized).membership_id === me,
      )
    if (fixture.historicalReadOutcome === 'reauthenticate') {
      return { status: 403, body: problem('reauthentication-required', 403) }
    }
    if (!through) return { status: 404, body: problem('not-found', 404) }
    const read = frozenRead[2]
    if (!read) {
      return {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
        body: { ...fixture.historicalRelationship, case: through },
      }
    }
    const kind =
      read === 'executions'
        ? 'executions'
        : read === 'body-progress'
          ? 'body-progress'
          : 'goal-versions'
    if (kind !== 'executions' && fixture.frozenRefused.includes(kind)) {
      const code = kind === 'body-progress' ? 'body_progress' : 'nutrition_guidance'
      return {
        status: 403,
        body: problem('scope-required', 403, { required_scope: { code } }),
      }
    }
    // With no training category frozen, sessions answer an empty page, not a 403.
    const all =
      kind === 'executions'
        ? fixture.frozenRefused.includes('executions')
          ? []
          : fixture.frozenExecutions
        : kind === 'body-progress'
          ? fixture.frozenBodyProgress
          : fixture.frozenGoalVersions
    const search = new URLSearchParams(request.search ?? '')
    const limit = Number(search.get('limit') ?? '25')
    const from = Number(search.get('cursor') ?? '0')
    const next = from + limit < all.length ? String(from + limit) : null
    return {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
      body: {
        ...(kind === 'executions'
          ? {}
          : {
              applied_scope: {
                code: kind === 'body-progress' ? 'body_progress' : 'nutrition_guidance',
                version: 1,
              },
            }),
        data: all.slice(from, from + limit),
        page: { next_cursor: next, has_more: next !== null },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/health-context$/.test(request.path)
  ) {
    // Not attending her is the same 404 as a person who does not exist.
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    if (fixture.clientHealthContext === null) {
      return {
        status: 403,
        body: problem('scope-required', 403, {
          required_scope: { code: 'health_context', level: 'read' },
        }),
      }
    }
    const search = new URLSearchParams(request.search ?? '')
    const limit = Number(search.get('limit') ?? '25')
    const from = Number(search.get('cursor') ?? '0')
    const all = fixture.clientHealthContext
    const next = from + limit < all.length ? String(from + limit) : null
    return {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
      body: {
        applied_scope: { code: 'health_context', version: 2 },
        data: all.slice(from, from + limit),
        page: { next_cursor: next, has_more: next !== null },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/body-(progress|photos)$/.test(
      request.path,
    )
  ) {
    // Both reads belong to one category: not attending her is 404 for both, and
    // nothing shared is the same 403 for both.
    if (fixture.clientCard === null) return { status: 404, body: error('not-found') }
    if (fixture.clientBodyProgress === null) {
      return {
        status: 403,
        body: problem('scope-required', 403, {
          required_scope: { code: 'body_progress', level: 'read' },
        }),
      }
    }
    const photos = request.path.endsWith('/body-photos')
    const all = photos ? fixture.clientBodyPhotos : fixture.clientBodyProgress
    const search = new URLSearchParams(request.search ?? '')
    const limit = Number(search.get('limit') ?? '25')
    const from = Number(search.get('cursor') ?? '0')
    const next = from + limit < all.length ? String(from + limit) : null
    return {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
      body: {
        applied_scope: { code: 'body_progress', version: 3 },
        data: all.slice(from, from + limit),
        page: { next_cursor: next, has_more: next !== null },
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/clients\/[^/]+\/body-photos\/[^/]+\/content$/.test(
      request.path,
    )
  ) {
    // Anything short of a photo she shows is the one 404, whatever the reason.
    const photoId = request.path.split('/').at(-2)
    const shown = fixture.clientBodyPhotos.some((photo) => objectValue(photo)['id'] === photoId)
    if (fixture.bodyPhotoOutcome === 'failure') {
      return { status: 503, body: problem('upstream-unavailable', 503) }
    }
    if (fixture.clientCard === null || fixture.bodyPhotoOutcome === 'unavailable' || !shown) {
      return { status: 404, body: problem('not-found', 404) }
    }
    return {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
      bytes: bodyPhotoJpeg,
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/memberships\/[^/]+\/roles$/.test(request.path)
  ) {
    if (fixture.roleGrantOutcome !== 'granted') {
      return {
        status: fixture.roleGrantOutcome === 'rejected' ? 422 : 403,
        body: {
          error: fixture.roleGrantOutcome === 'rejected' ? 'validation-failed' : 'forbidden',
        },
      }
    }
    const membershipId = request.path.split('/').slice(-2, -1)[0]
    const granted = (request.body ?? {}) as { role_code?: string }
    // The list is re-read after a grant, so the fixture has to carry the new
    // role or the screen would show the roles it had before.
    fixture.organizationMemberships = fixture.organizationMemberships.map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('membership_id' in entry) ||
        entry.membership_id !== membershipId
      ) {
        return entry
      }
      const member = entry as unknown as { roles: string[] }
      return { ...member, roles: [...member.roles, granted.role_code ?? ''] }
    })
    return {
      status: 200,
      body: {
        membership_id: membershipId,
        role_code: granted.role_code,
        valid_from: '2026-10-06T10:00:00.000Z',
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/memberships\/[^/]+\/termination$/.test(request.path)
  ) {
    if (fixture.membershipTerminationOutcome !== 'terminated') {
      return {
        status: fixture.membershipTerminationOutcome === 'rejected' ? 422 : 403,
        body: {
          error:
            fixture.membershipTerminationOutcome === 'rejected' ? 'validation-failed' : 'forbidden',
        },
      }
    }
    const membershipId = request.path.split('/').slice(-2, -1)[0]
    const endedAt = '2026-11-05T10:00:00.000Z'
    /*
     * Status and `ended_at`, and **the roles stay**. The command does close
     * every open role period, but the list is a projection that shows "current
     * roles for an active membership, or roles effective at termination for a
     * terminated one" — so what the reader sees afterwards is what the person
     * held when they left. Dropping them here would make the mock disagree
     * with the contract.
     *
     * What neither the command nor this touches is any relationship: that is
     * criterion 2, and in the real function it is an absence, not a guard.
     */
    fixture.organizationMemberships = fixture.organizationMemberships.map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('membership_id' in entry) ||
        entry.membership_id !== membershipId
      ) {
        return entry
      }
      return { ...entry, status: 'terminated', ended_at: endedAt }
    })
    return { status: 200, body: { membership_id: membershipId, ended_at: endedAt } }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/closure$/.test(request.path)
  ) {
    if (fixture.organizationClosureOutcome !== 'closed') {
      return {
        status: fixture.organizationClosureOutcome === 'rejected' ? 422 : 403,
        body: {
          error: {
            code:
              fixture.organizationClosureOutcome === 'rejected' ? 'validation-failed' : 'forbidden',
          },
        },
      }
    }
    /*
     * Marks the organization closed in the fixture, the way the command does.
     * The screen navigates away on success, so nothing reads it back — but a
     * fixture that lied here would mislead the next test that does.
     */
    const organizationId = request.path.split('/').slice(-2, -1)[0]
    if (typeof fixture.organization === 'object' && fixture.organization !== null) {
      fixture.organization = { ...fixture.organization, status: 'closed' }
    }
    /*
     * And it closes every membership, including the one that ran it, because
     * the command does: `close_organization` sets them all to `terminated`.
     * Leaving them active made the entry screen bounce the owner back into the
     * gym they had just closed — which looked like a flaky assertion and was
     * really this fixture not writing what the command writes.
     */
    const closeMembership = (entry: unknown) =>
      typeof entry === 'object' &&
      entry !== null &&
      'organization_id' in entry &&
      entry.organization_id === organizationId
        ? { ...entry, status: 'terminated', ended_at: '2026-11-07T10:00:00.000Z' }
        : entry
    fixture.memberships = fixture.memberships.map(closeMembership)
    fixture.me = { ...fixture.me, memberships: fixture.me.memberships.map(closeMembership) }
    return {
      status: 200,
      body: {
        organization_id: organizationId,
        closed_at: '2026-11-07T10:00:00.000Z',
        relationships_terminated: fixture.closedRelationships,
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/me\/membership\/resignation$/.test(request.path)
  ) {
    if (fixture.membershipResignationOutcome !== 'resigned') {
      return {
        status: fixture.membershipResignationOutcome === 'rejected' ? 422 : 404,
        body: {
          error:
            fixture.membershipResignationOutcome === 'rejected' ? 'validation-failed' : 'not-found',
        },
      }
    }
    /*
     * The organization comes from the path and the membership from the session,
     * so the mock closes the row in `me.memberships` whose organization matches
     * — never one picked by membership id, which this route never carries.
     *
     * `ended_at` and the roles follow the sibling handler: the projection shows
     * the roles effective at termination, so the history card keeps them.
     */
    const organizationId = request.path.split('/').slice(-4, -3)[0]
    const endedAt = '2026-11-06T10:00:00.000Z'
    fixture.me = {
      ...fixture.me,
      memberships: fixture.me.memberships.map((entry) => {
        if (
          typeof entry !== 'object' ||
          entry === null ||
          !('organization_id' in entry) ||
          entry.organization_id !== organizationId ||
          !('status' in entry) ||
          entry.status !== 'active'
        ) {
          return entry
        }
        return { ...entry, status: 'terminated', ended_at: endedAt }
      }),
    }
    const resigned = fixture.me.memberships.find(
      (entry) =>
        typeof entry === 'object' &&
        entry !== null &&
        'organization_id' in entry &&
        entry.organization_id === organizationId,
    ) as { membership_id?: string } | undefined
    return {
      status: 200,
      body: { membership_id: resigned?.membership_id ?? organizationId, ended_at: endedAt },
    }
  }
  if (
    request.method === 'DELETE' &&
    /^\/studio\/v1\/organizations\/[^/]+\/memberships\/[^/]+\/roles\/[^/]+$/.test(request.path)
  ) {
    if (fixture.roleRevokeOutcome !== 'revoked') {
      return {
        status: fixture.roleRevokeOutcome === 'gone' ? 404 : 403,
        body: { error: fixture.roleRevokeOutcome === 'gone' ? 'not-found' : 'forbidden' },
      }
    }
    const segments = request.path.split('/')
    const roleCode = segments[segments.length - 1] ?? ''
    const membershipId = segments[segments.length - 3] ?? ''
    /*
     * Drop the role from the fixture, the way the command drops it from the
     * table. A mock that only echoed the revocation back would leave the
     * re-read list still showing the badge, and a test asserting the badge is
     * gone would fail against correct code — or, worse, a test asserting it is
     * still there would pass against broken code.
     */
    fixture.organizationMemberships = fixture.organizationMemberships.map((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        !('membership_id' in entry) ||
        entry.membership_id !== membershipId
      ) {
        return entry
      }
      const member = entry as unknown as { roles: string[] }
      return { ...member, roles: member.roles.filter((role) => role !== roleCode) }
    })
    return {
      status: 200,
      body: {
        membership_id: membershipId,
        role_code: roleCode,
        valid_to: '2026-10-06T10:00:00.000Z',
      },
    }
  }
  if (
    request.method === 'GET' &&
    /^\/studio\/v1\/organizations\/[^/]+\/roles$/.test(request.path)
  ) {
    return {
      status: 200,
      body: { items: fixture.organizationRoles },
      headers: { ETag: '"organization-roles-v1"' },
    }
  }
  if (
    request.method === 'PATCH' &&
    /^\/studio\/v1\/organizations\/[^/]+\/sites\/[^/]+$/.test(request.path)
  ) {
    const siteId = request.path.split('/').pop() ?? ''
    const organization = fixture.organization as { sites: SiteRow[] } | null
    const existing = organization?.sites.find((entry) => entry.id === siteId)
    if (!existing) return { status: 404, body: error('not-found') }

    const patch = request.body as (Partial<SiteRow> & { expected_revision?: number }) | undefined
    if (!patch || Object.keys(patch).length === 0) {
      return { status: 400, body: error('invalid-request') }
    }

    /*
     * The server compares the revision the screen was showing with the row it
     * holds, so the mock has to as well: without it the conflict state has no
     * way to be reached from a test.
     *
     * It arrives in the body now. It used to be `If-Match`, and that header made
     * Vercel's Edge answer the write `412` before the function ran — see
     * `studio-api.ts`. The header is still read when the body omits it, exactly
     * as the server does, so this mock keeps covering a client that has not
     * moved.
     */
    const { expected_revision: expectedRevision, ...fields } = patch
    const ifMatch = request.headers['if-match']
    if (expectedRevision === undefined && !ifMatch) {
      return { status: 428, body: error('precondition-required') }
    }
    const expected =
      expectedRevision ?? Number(/:r([0-9]+)"$/.exec(String(ifMatch))?.[1] ?? Number.NaN)
    if (expected !== existing.revision_number) {
      return { status: 409, body: error('conflict') }
    }

    // `expected_revision` says which revision to write over, not what to write.
    if (Object.keys(fields).length === 0) {
      return { status: 400, body: error('invalid-request') }
    }
    Object.assign(existing, fields, { revision_number: existing.revision_number + 1 })
    return { status: 200, body: existing }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/sites$/.test(request.path)
  ) {
    const body = request.body as { name?: string; address?: string } | undefined
    if (!body?.name?.trim()) return { status: 422, body: error('validation-failed') }
    const site = {
      id: `01991600-2000-7000-8000-${String(siteSequence++).padStart(12, '0')}`,
      name: body.name.trim(),
      address: body.address?.trim() ? body.address.trim() : null,
      status: 'active',
      revision_number: 1,
    }
    // The screen the form returns to reads the organization, so a site that is
    // only echoed back would vanish on arrival.
    const organization = fixture.organization as { sites: unknown[] } | null
    if (organization) organization.sites = [...organization.sites, site]
    return { status: 201, body: site }
  }
  if (request.method === 'PATCH' && /^\/studio\/v1\/organizations\/[^/]+$/.test(request.path)) {
    const existing = fixture.organization as OrganizationRow | null
    if (!existing) return { status: 404, body: error('not-found') }

    const patch = request.body as
      (Partial<OrganizationRow> & { expected_revision?: number }) | undefined
    if (!patch || Object.keys(patch).length === 0) {
      return { status: 400, body: error('invalid-request') }
    }

    // The same comparison the site PATCH above makes, and for the same reason:
    // without it the conflict state has no way to be reached from a test.
    const { expected_revision: expectedRevision, ...fields } = patch
    const ifMatch = request.headers['if-match']
    if (expectedRevision === undefined && !ifMatch) {
      return { status: 428, body: error('precondition-required') }
    }
    const expected =
      expectedRevision ?? Number(/:r([0-9]+)"$/.exec(String(ifMatch))?.[1] ?? Number.NaN)
    if (expected !== existing.revision_number) {
      return { status: 409, body: error('conflict') }
    }
    if (Object.keys(fields).length === 0) {
      return { status: 400, body: error('invalid-request') }
    }

    /*
     * What `trg_organizations_before_update_type_transition` enforces, read off
     * the migration rather than off the client's copy of the same table. Taking
     * it from the client would make every test agree with itself: both halves
     * could be wrong together and nothing would fail.
     */
    if (
      typeof fields.type_code === 'string' &&
      fields.type_code !== existing.type_code &&
      !(MOCK_TYPE_TRANSITIONS[existing.type_code] ?? []).includes(fields.type_code)
    ) {
      return { status: 422, body: error('validation-failed') }
    }

    Object.assign(existing, fields, { revision_number: existing.revision_number + 1 })
    return { status: 200, body: existing }
  }
  if (request.method === 'GET' && /^\/studio\/v1\/organizations\/[^/]+$/.test(request.path)) {
    if (fixture.organization === null) return { status: 404, body: error('not-found') }
    return {
      status: 200,
      body: fixture.organization,
      headers: { ETag: '"organization-v1"' },
    }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/organization-types') {
    return { status: 200, body: { items: fixture.organizationTypes } }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/me') {
    return { status: 200, body: fixture.me }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/professional-specialties') {
    return {
      status: 200,
      body: { items: fixture.specialties },
      headers: { ETag: '"specialties-v1"' },
    }
  }
  if (request.method === 'GET' && request.path === '/studio/v1/professional-credential-types') {
    return {
      status: 200,
      body: { items: fixture.credentialTypes },
      headers: { ETag: '"credential-types-v1"' },
    }
  }
  if (request.method === 'POST' && request.path === '/studio/v1/onboarding-attempts') {
    return {
      status: 201,
      body: {
        id: '01991600-4000-7000-8000-000000000001',
        status: 'open',
        eligibility_status: 'unknown',
        // Relative, never a literal. This was a fixed 2026-08-11, so on that day
        // every screen built on the default attempt silently switched to the
        // expired state — "La activación venció", submit disabled — and the
        // audit swept that instead of the form real people see for over a month.
        // The specs that exercise activation had already overridden it locally.
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        // Both required by `StudioOnboardingAttempt` in the contract, and both
        // were missing from the default.
        terms_version: 'platform_terms_v1',
        privacy_notice_version: 'privacy_notice_v1',
      },
    }
  }
  if (request.method === 'POST' && request.path === '/studio/v1/organizations') {
    return {
      status: 201,
      body: {
        id: '01991600-5000-7000-8000-000000000001',
        display_name: 'Nuevo espacio',
        type_code: 'gym',
        status: 'active',
        membership_id: '01991600-5000-7000-8000-000000000002',
        role: 'owner',
      },
    }
  }
  if (
    request.method === 'POST' &&
    /^\/studio\/v1\/organizations\/[^/]+\/invitations$/.test(request.path)
  ) {
    return {
      status: 201,
      body: {
        id: '01991600-6000-7000-8000-000000000001',
        status: 'pending',
        channel: 'email',
        contact_hint: 'p***@example.test',
        // Seven days from now, as the invitation form promises. A literal here
        // showed a just-created invitation as having expired a month earlier.
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        reused: false,
        intents: [
          {
            id: '01991600-6000-7000-8000-000000000002',
            kind: 'membership',
            status: 'pending',
            proposed_role_code: 'staff',
          },
        ],
      },
    }
  }
  if (request.method === 'PUT' && request.path === '/studio/v1/me/professional-profile') {
    const body = request.body as {
      headline: string
      bio: string
      practice_started_year: number
      specialty_codes: string[]
    }
    const existing = fixture.me.profile
    const profile = {
      ...professionalProfile,
      ...existing,
      headline: body.headline,
      bio: body.bio,
      practice_started_year: body.practice_started_year,
      experience_years: new Date().getUTCFullYear() - body.practice_started_year,
      specialties: fixture.specialties.filter((item) => body.specialty_codes.includes(item.code)),
      credentials: existing?.credentials ?? [],
      updated_at: '2026-08-10T12:00:00.000Z',
    }
    fixture.me.profile = profile
    return { status: 200, body: profile }
  }
  if (request.method === 'POST' && request.path === '/studio/v1/me/professional-credentials') {
    const credential = credentialFromRequest(request, professionalCredential.id)
    appendCredential(fixture, credential)
    return { status: 201, body: credential }
  }
  if (
    request.method === 'POST' &&
    request.path.endsWith('/revisions') &&
    request.path.startsWith('/studio/v1/me/professional-credentials/')
  ) {
    const credentialId = request.path.split('/').at(-2) ?? ''
    const successor = credentialFromRequest(
      request,
      '01991600-3000-7000-8000-000000000002',
      credentialId,
    )
    replaceWithRevision(fixture, credentialId, successor)
    return { status: 201, body: successor }
  }
  if (
    request.method === 'POST' &&
    request.path.endsWith('/retirement') &&
    request.path.startsWith('/studio/v1/me/professional-credentials/')
  ) {
    const credentialId = request.path.split('/').at(-2) ?? ''
    const retired = retireCredential(fixture, credentialId)
    return retired ? { status: 200, body: retired } : { status: 404, body: error('not-found') }
  }
  return undefined
}

function credentialFromRequest(request: MockRequest, id: string, supersedes: string | null = null) {
  const body = request.body as Record<string, unknown>
  const type = body.credential_type_code
  return {
    ...professionalCredential,
    ...body,
    id,
    credential_type_name:
      type === 'academic_degree' ? 'Título académico' : 'Certificación profesional',
    supersedes_credential_id: supersedes,
  }
}

function credentials(fixture: StudioApiFixture): Array<Record<string, unknown>> {
  const value = fixture.me.profile?.credentials
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []
}

/**
 * What `planning.replace_session_template_draft` writes: the content whole, a
 * new ETag and a new time — or nothing new at all when the content is the same,
 * because an unchanged replacement keeps its ETag. The template in the list is
 * replaced rather than mutated, so the library reads the new name.
 */
function replaceDraft(
  fixture: StudioApiFixture,
  templateId: string,
  content: Record<string, unknown>,
): Record<string, unknown> {
  const template = fixture.organizationSessionTemplates
    .map(objectValue)
    .find((candidate) => candidate.id === templateId)
  const previous = objectValue(template?.draft)
  if (JSON.stringify(previous.content) === JSON.stringify(content)) return previous
  const revision = Number(/(\d+)"$/.exec(String(previous.etag))?.[1] ?? '0') + 1
  const draft = {
    ...previous,
    content,
    etag: `"sha256:${'d'.repeat(43 - String(revision).length)}${revision}"`,
    updated_at: `2026-11-10T15:${String(10 + revision).padStart(2, '0')}:00.000Z`,
  }
  fixture.organizationSessionTemplates = fixture.organizationSessionTemplates.map((candidate) =>
    objectValue(candidate).id === templateId ? { ...objectValue(candidate), draft } : candidate,
  )
  return draft
}

type MovementEntry = StudioApiFixture['movements'][number]

/** `catalog.normalize_movement_name`: case and spacing, never accents. */
function normalizeMovementName(name: string): string {
  return tidyMovementName(name).toLocaleLowerCase('es-CO')
}

function tidyMovementName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * `OrganizationMovement` as `catalog.organization_movement_document` builds it:
 * the search's shape, plus what an edit needs. A global movement's name is
 * always locked; an own one's once a published version uses it.
 */
function movementDocument(entry: MovementEntry): Record<string, unknown> {
  return {
    ...entry.movement,
    revision: entry.revision ?? 1,
    aliases: entry.aliases,
    variant_of: entry.variantOf ?? null,
    name_locked: entry.movement.scope === 'global' || entry.nameLocked === true,
  }
}

/** The variant as the document names it, from a published global movement. */
function variantOfDocument(
  fixture: StudioApiFixture,
  variant: unknown,
): Record<string, unknown> | null {
  const input = objectValue(variant)
  const base = fixture.movements.find(({ movement }) => movement.id === input.movement_id)
  if (!base) return null
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  return {
    id: base.movement.id,
    name: base.movement.name,
    relation: input.relation,
    note: note || null,
  }
}

/**
 * The field checks `create_organization_movement` and its edit share: a
 * published discipline, a name, ten distinct other names that do not repeat
 * it, and a variant only of a published global movement.
 */
function movementProblems(
  fixture: StudioApiFixture,
  fields: { disciplineCode?: string; name?: string; aliases?: string[]; variant?: unknown },
): string[] {
  const problems: string[] = []
  if (
    fields.disciplineCode !== undefined &&
    !fixture.disciplines.some((discipline) => discipline.code === fields.disciplineCode)
  ) {
    problems.push('discipline_code')
  }
  const name = fields.name === undefined ? undefined : normalizeMovementName(fields.name)
  if (name !== undefined && (name === '' || name.length > 120)) problems.push('name')
  if (fields.aliases !== undefined) {
    const aliases = fields.aliases.map(normalizeMovementName)
    if (
      aliases.length > 10 ||
      aliases.some((alias) => alias === '' || alias === name) ||
      new Set(aliases).size !== aliases.length
    ) {
      problems.push('aliases')
    }
  }
  if (fields.variant !== undefined && fields.variant !== null) {
    const input = objectValue(fields.variant)
    const base = fixture.movements.find(({ movement }) => movement.id === input.movement_id)
    if (
      !base ||
      base.movement.scope !== 'global' ||
      base.movement.archived === true ||
      !['variant', 'regression', 'progression'].includes(String(input.relation))
    ) {
      problems.push('variant')
    }
  }
  return problems
}

/** `OP-PAY-006`'s order: published plans first, then drafts, each by name. */
function sortPlans(plans: unknown[]): unknown[] {
  return plans
    .map(objectValue)
    .toSorted(
      (left, right) =>
        Number(left.status === 'draft') - Number(right.status === 'draft') ||
        String(left.name).localeCompare(String(right.name), 'es'),
    )
}

/** The unique index on a plan's name, without regard to case, leaving one plan out. */
function planNameTaken(fixture: StudioApiFixture, name: string, exceptId?: string): boolean {
  const wanted = name.toLocaleLowerCase('es-CO')
  return fixture.organizationPlans
    .map(objectValue)
    .some(
      (plan) =>
        plan.plan_id !== exceptId && String(plan.name).toLocaleLowerCase('es-CO') === wanted,
    )
}

/** Replaces one movement in the library, rather than mutating it, and returns it. */
function replaceMovement(fixture: StudioApiFixture, entry: MovementEntry): MovementEntry {
  fixture.movements = fixture.movements.map((candidate) =>
    candidate.movement.id === entry.movement.id ? entry : candidate,
  )
  return entry
}

/** The unique index on a name within the organization, leaving one movement out. */
function movementNameTaken(fixture: StudioApiFixture, name: string, exceptId?: string): boolean {
  const normalized = normalizeMovementName(name)
  return fixture.movements.some(
    ({ movement }) =>
      movement.scope === 'organization' &&
      movement.id !== exceptId &&
      normalizeMovementName(String(movement.name)) === normalized,
  )
}

/** Every published template version the fixture holds, with its status, by id. */
function templateVersionStatuses(fixture: StudioApiFixture): Map<string, string> {
  return new Map(
    fixture.organizationSessionTemplates
      .map(objectValue)
      .flatMap((template) => (Array.isArray(template.versions) ? template.versions : []))
      .map(objectValue)
      .map((version) => [String(version.id), String(version.status)]),
  )
}

function sessionVersionIds(content: Record<string, unknown>): string[] {
  const sessions = Array.isArray(content.sessions) ? content.sessions : []
  return sessions.map(objectValue).map((session) => String(session.template_version_id))
}

/**
 * `program_content_errors` for what a save can get wrong from this screen: a
 * version that is not the organization's, and then — only when nothing else
 * failed — a retired version referenced more times than the draft already did.
 */
function programDraftErrors(
  fixture: StudioApiFixture,
  content: Record<string, unknown>,
  previous: Record<string, unknown>,
): string[] {
  const statuses = templateVersionStatuses(fixture)
  const requested = sessionVersionIds(content)
  if (requested.some((id) => !statuses.has(id))) return ['template-version']
  const before = sessionVersionIds(previous)
  const count = (ids: string[], id: string) => ids.filter((candidate) => candidate === id).length
  const addsRetired = [...new Set(requested)].some(
    (id) => statuses.get(id) === 'deprecated' && count(requested, id) > count(before, id),
  )
  return addsRetired ? ['template-version-deprecated'] : []
}

/**
 * What `planning.replace_program_draft` writes, like `replaceDraft` for a
 * template, plus what `program_draft_projection` derives: the retired versions
 * the content names, once per session that names one.
 */
function replaceProgramDraft(
  fixture: StudioApiFixture,
  programId: string,
  content: Record<string, unknown>,
): Record<string, unknown> {
  const program = fixture.organizationPrograms
    .map(objectValue)
    .find((candidate) => candidate.id === programId)
  const previous = objectValue(program?.draft)
  if (JSON.stringify(previous.content) === JSON.stringify(content)) return previous
  const revision = Number(/(\d+)"$/.exec(String(previous.etag))?.[1] ?? '0') + 1
  const statuses = templateVersionStatuses(fixture)
  const draft = {
    ...previous,
    content,
    etag: `"sha256:${'f'.repeat(43 - String(revision).length)}${revision}"`,
    updated_at: `2026-11-10T16:${String(10 + revision).padStart(2, '0')}:00.000Z`,
    deprecated_template_version_ids: sessionVersionIds(content).filter(
      (id) => statuses.get(id) === 'deprecated',
    ),
  }
  fixture.organizationPrograms = fixture.organizationPrograms.map((candidate) =>
    objectValue(candidate).id === programId ? { ...objectValue(candidate), draft } : candidate,
  )
  return draft
}

function appendCredential(fixture: StudioApiFixture, credential: Record<string, unknown>): void {
  if (fixture.me.profile) fixture.me.profile.credentials = [credential, ...credentials(fixture)]
}

function replaceWithRevision(
  fixture: StudioApiFixture,
  previousId: string,
  successor: Record<string, unknown>,
): void {
  if (!fixture.me.profile) return
  const revised = credentials(fixture).map((credential) =>
    credential.id === previousId
      ? { ...credential, status: 'retired', retired_at: '2026-08-10T12:00:00.000Z' }
      : credential,
  )
  fixture.me.profile.credentials = [successor, ...revised]
}

function retireCredential(
  fixture: StudioApiFixture,
  credentialId: string,
): Record<string, unknown> | undefined {
  let retired: Record<string, unknown> | undefined
  if (!fixture.me.profile) return undefined
  fixture.me.profile.credentials = credentials(fixture).map((credential) => {
    if (credential.id !== credentialId) return credential
    retired = { ...credential, status: 'retired', retired_at: '2026-08-10T12:00:00.000Z' }
    return retired
  })
  return retired
}

function toMockRequest(request: Request): MockRequest {
  const url = new URL(request.url())
  return {
    method: request.method(),
    path: url.pathname,
    search: url.search,
    headers: request.headers(),
    body: parseBody(request),
  }
}

function parseBody(request: Request): unknown {
  const body = request.postData()
  if (!body) return undefined
  try {
    return JSON.parse(body) as unknown
  } catch {
    return body
  }
}

async function fulfill(route: Route, response: MockResponse): Promise<void> {
  const hasBody = response.body !== undefined
  await route.fulfill({
    status: response.status,
    body: response.bytes ?? (hasBody ? JSON.stringify(response.body) : ''),
    headers: {
      'Access-Control-Allow-Origin': STUDIO_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      // Mirrors the API's own policy for the studio surface. A method or
      // header missing here is refused at preflight, so the failure looks like
      // broken client code rather than a stale fixture.
      'Access-Control-Allow-Headers':
        'Content-Type, Idempotency-Key, Command-Id, If-Match, If-None-Match, X-Historical-Access-Case',
      // DELETE was missing while no Studio command used one. `OP-ORG-008`
      // revokes a role with it, and the list the API actually sends
      // (`surfaces.ts`) has always included it.
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...response.headers,
    },
  })
}

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * What the directory search compares: lower case with the accents stripped, so
 * «Belén» is found by «belen» and by «BELEN». The route folds in PostgreSQL;
 * this is the same rule written where the simulator can apply it.
 */
function foldForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-CO')
}

export function error(code: string, detail?: string): { error: { code: string; detail?: string } } {
  return { error: { code, ...(detail ? { detail } : {}) } }
}

/**
 * An RFC 9457 answer, which is what the content block's routes send instead of
 * the `{ error }` envelope. Extensions such as `errors` and `current_state` ride
 * alongside, as the API puts them.
 */
export function problem(
  code: string,
  status: number,
  extensions: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: `https://errors.allfit.invalid/${code}`,
    title: code,
    status,
    request_id: '01991600-ffff-7000-8000-000000000001',
    ...extensions,
  }
}
