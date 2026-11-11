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
    relationshipState: structuredClone(relationshipState),
    relationshipHistory: structuredClone(relationshipHistory),
    assignmentOutcome: 'created',
    reassignmentOutcome: 'reassigned',
    substitutionOutcome: 'proposed',
    substitutionEndOutcome: 'ended',
    terminationOutcome: 'terminated',
    organizationSubscriptions: [structuredClone(activeSubscription)],
    subscriptionOutcome: 'applied',
    roleGrantOutcome: 'granted',
    roleRevokeOutcome: 'revoked',
    membershipTerminationOutcome: 'terminated',
    membershipResignationOutcome: 'resigned',
    // Copies: drafts are editable now, and a save must not reach the next test.
    organizationPrograms: structuredClone([publishedProgram, archivedProgram, draftedProgram]),
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
    body: hasBody ? JSON.stringify(response.body) : '',
    headers: {
      'Access-Control-Allow-Origin': STUDIO_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
      // Mirrors the API's own policy for the studio surface. A method or
      // header missing here is refused at preflight, so the failure looks like
      // broken client code rather than a stale fixture.
      'Access-Control-Allow-Headers':
        'Content-Type, Idempotency-Key, Command-Id, If-Match, If-None-Match',
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
