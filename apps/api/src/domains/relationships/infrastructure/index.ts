import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type postgres from 'postgres'
import type {
  ClientCard,
  ClientCardDatabase,
  ClientDirectoryDatabase,
  HolderAssignmentDatabase,
  HolderReassignmentDatabase,
  DirectoryEntry,
  DirectoryGroup,
  InvitationStatus,
  RelationshipStatus,
  RelationshipGrant,
  RelationshipHistory,
  RelationshipHistoryDatabase,
  RelationshipHistoryEvent,
  RelationshipProfessional,
  RelationshipState,
  RelationshipStateDatabase,
  RelationshipSubstitution,
  SubstitutionProposalDatabase,
  SubstitutionListDatabase,
  RelationshipTerminationDatabase,
  SubstitutionTerminationDatabase,
  TerminationRequest,
  TerminationRequestDatabase,
  TerminationRequestStatus,
  MyRelationship,
  MyRelationshipCommandDatabase,
  MyRelationshipDatabase,
  SubstitutionDecision,
  StudioToday,
  StudioTodayDatabase,
} from '../domain/index.js'

type DirectoryRow = {
  entry_kind: 'relationship' | 'invitation'
  relationship_id: string | null
  invitation_id: string | null
  person_id: string | null
  display_name: string | null
  contact_hint: string | null
  relationship_status: RelationshipStatus | null
  invitation_status: InvitationStatus
  started_at: string
  ended_at: string | null
  sort_group: DirectoryGroup
  sort_name: string
  sort_id: string
}

type GuestQuotaRow = {
  seats: number | null
  occupied: number
  places_left: number | null
  over_quota: boolean
}

export function createClientDirectoryDatabase(
  sql: postgres.Sql = database(),
): ClientDirectoryDatabase {
  return {
    async listClients(personId, query) {
      return measureStudioRequestPhase('business-db', () =>
        sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          // One row over the page, so "is there more" is answered by the read
          // itself rather than by a second count that could disagree with it.
          // Without a search the older signature is called, so the directory keeps
          // working while the API is ahead of the migration that adds the search.
          const rows =
            query.query === undefined
              ? await transaction<DirectoryRow[]>`
                  select * from relationships.list_organization_clients(
                    ${personId}::uuid,
                    ${query.organizationId}::uuid,
                    ${query.status ?? null}::text,
                    ${query.limit + 1}::integer,
                    ${query.cursorGroup ?? null}::text,
                    ${query.cursorName ?? null}::text,
                    ${query.cursorId ?? null}::uuid
                  )
                `
              : await transaction<DirectoryRow[]>`
                  select * from relationships.list_organization_clients(
                    ${personId}::uuid,
                    ${query.organizationId}::uuid,
                    ${query.status ?? null}::text,
                    ${query.limit + 1}::integer,
                    ${query.cursorGroup ?? null}::text,
                    ${query.cursorName ?? null}::text,
                    ${query.cursorId ?? null}::uuid,
                    ${query.query}::text
                  )
                `
          // Same transaction, so the figure and the page describe one instant.
          const [quota] = await transaction<GuestQuotaRow[]>`
            select * from organizations.studio_guest_quota(${query.organizationId}::uuid)
          `
          if (!quota) throw new Error('studio_guest_quota returned no row')
          const hasMore = rows.length > query.limit
          return {
            hasMore,
            items: rows.slice(0, query.limit).map(toEntry),
            guestQuota: {
              seats: quota.seats,
              occupied: quota.occupied,
              placesLeft: quota.places_left,
              overQuota: quota.over_quota,
            },
          }
        }),
      )
    },
  }
}

/**
 * The two kinds stay separate all the way out. Collapsing them into one shape
 * with everything optional would let a caller read a name off an invitation
 * that has none, and the type would not stop them.
 */
function toEntry(row: DirectoryRow): DirectoryEntry {
  if (row.entry_kind === 'invitation') {
    return {
      kind: 'invitation',
      invitationId: row.invitation_id ?? '',
      contactHint: row.contact_hint ?? '',
      invitationStatus: row.invitation_status,
      invitedAt: new Date(row.started_at),
      sortGroup: row.sort_group,
      sortName: row.sort_name,
      sortId: row.sort_id,
    }
  }
  return {
    kind: 'relationship',
    relationshipId: row.relationship_id ?? '',
    personId: row.person_id ?? '',
    displayName: row.display_name ?? '',
    relationshipStatus: row.relationship_status ?? 'active',
    invitationStatus: row.invitation_status,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    sortGroup: row.sort_group,
    sortName: row.sort_name,
    sortId: row.sort_id,
  }
}

async function setPersonActor(
  transaction: postgres.TransactionSql,
  personId: string,
): Promise<void> {
  await transaction`
    select set_config('app.actor_kind', 'person', true),
           set_config('app.actor_person_id', ${personId}, true)
  `
}

/**
 * PostgreSQL access for reading how one relationship stands.
 *
 * The function returns one jsonb document rather than three result sets, because
 * the holder, the substitutions and the grants have to describe the same instant
 * — three round trips could each see a different one.
 */
export function createRelationshipStateDatabase(
  sql: postgres.Sql = database(),
): RelationshipStateDatabase {
  return {
    readState: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const [row] = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          return transaction<{ state: StateDocument }[]>`
            select relationships.read_relationship_state(
              ${personId}::uuid,
              ${query.organizationId}::uuid,
              ${query.relationshipId}::uuid
            ) as state
          `
        })

        if (!row) throw new Error('read_relationship_state returned no row')
        return presentState(row.state)
      }),
  }
}

/*
 * The document is parsed field by field rather than cast. A shape that drifts
 * should fail here, where the contract is, instead of reaching a screen as
 * `undefined`.
 */
function presentState(document: StateDocument): RelationshipState {
  return {
    relationshipId: document.relationship_id,
    personId: document.person_id,
    displayName: document.display_name,
    status: document.status,
    startedAt: new Date(document.started_at),
    endedAt: document.ended_at ? new Date(document.ended_at) : null,
    holder: document.holder ? presentProfessional(document.holder) : null,
    substitutions: document.substitutions.map((entry) => ({
      ...presentProfessional(entry),
      status: entry.status,
      endsOn: entry.ends_on,
      acceptedByPersonAt: entry.accepted_by_person_at
        ? new Date(entry.accepted_by_person_at)
        : null,
    })),
    grants: document.grants.map(presentGrant),
    terminationRequest: document.termination_request
      ? presentTerminationRequest(document.termination_request)
      : null,
  }
}

/**
 * PostgreSQL access for the client card (OP-REL-019). The document is the contract's
 * minus the operations each section points to; a kind it does not know is a drift.
 */
export function createClientCardDatabase(sql: postgres.Sql = database()): ClientCardDatabase {
  return {
    readCard: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const [row] = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          return transaction<{ card: ClientCard }[]>`
            select relationships.read_client_card(
              ${personId}::uuid,
              ${query.organizationId}::uuid,
              ${query.personId}::uuid
            ) as card
          `
        })
        if (row?.card.kind !== 'attending' && row?.card.kind !== 'former') {
          throw new Error('read_client_card returned no card')
        }
        return row.card
      }),
  }
}

/**
 * PostgreSQL access for what needs attention today (OP-REL-020). The training part logs
 * one access event per client it looks at, so the request travels with the actor.
 */
export function createStudioTodayDatabase(sql: postgres.Sql = database()): StudioTodayDatabase {
  return {
    readToday: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const [row] = await sql.begin(async (transaction) => {
          await transaction`
            select set_config('app.actor_kind', 'person', true),
                   set_config('app.actor_person_id', ${personId}, true),
                   set_config('app.request_id', ${query.requestId}, true)
          `
          return transaction<{ today: StudioToday }[]>`
            select relationships.read_studio_today(
              ${personId}::uuid,
              ${query.organizationId}::uuid
            ) as today
          `
        })
        if (!row?.today.notices) throw new Error('read_studio_today returned nothing')
        return row.today
      }),
  }
}

/**
 * PostgreSQL access for reading what a relationship has been through.
 *
 * The limit goes down as the caller asked for it and the function clamps it.
 * Clamping twice would mean two opinions about the maximum, and the one that
 * matters is the one next to the query.
 */
export function createRelationshipHistoryDatabase(
  sql: postgres.Sql = database(),
): RelationshipHistoryDatabase {
  return {
    readHistory: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const [row] = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          return transaction<{ history: HistoryDocument }[]>`
            select relationships.read_relationship_history(
              ${personId}::uuid,
              ${query.organizationId ?? null}::uuid,
              ${query.relationshipId}::uuid,
              ${query.limit}::integer,
              ${query.cursor}::text
            ) as history
          `
        })

        if (!row) throw new Error('read_relationship_history returned no row')
        return presentHistory(row.history)
      }),
  }
}

function presentHistory(document: HistoryDocument): RelationshipHistory {
  return {
    relationshipId: document.relationship_id,
    personId: document.person_id,
    events: document.data.map(presentHistoryEvent),
    nextCursor: document.page.next_cursor,
    hasMore: document.page.has_more,
  }
}

function presentHistoryEvent(row: HistoryEventRow): RelationshipHistoryEvent {
  return {
    type: row.type,
    occurredAt: new Date(row.occurred_at),
    sourceId: row.source_id,
    // Passed through as it came. Every key in it is metadata about the moment,
    // never content a permission covers, and the function is where that is
    // enforced — re-listing the keys here would be a second place to forget.
    detail: row.detail,
  }
}

function presentProfessional(row: ProfessionalRow): RelationshipProfessional {
  return {
    assignmentId: row.assignment_id,
    membershipId: row.membership_id,
    professionalPersonId: row.professional_person_id,
    displayName: row.display_name,
    validFrom: new Date(row.valid_from),
  }
}

function presentGrant(row: GrantRow): RelationshipGrant {
  return {
    grantId: row.grant_id,
    scopeCode: row.scope_code,
    displayName: row.display_name,
    versionNumber: row.version_number,
    accessLevel: row.access_level,
    status: row.status,
    purpose: row.purpose,
    grantedAt: new Date(row.granted_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  }
}

type ProfessionalRow = {
  assignment_id: string
  membership_id: string
  professional_person_id: string
  display_name: string
  valid_from: string
}

type SubstitutionRow = ProfessionalRow & {
  status: RelationshipSubstitution['status']
  ends_on: string | null
  accepted_by_person_at: string | null
}

type GrantRow = {
  grant_id: string
  scope_code: string
  display_name: string | null
  version_number: number
  access_level: RelationshipGrant['accessLevel']
  status: RelationshipGrant['status']
  purpose: string
  granted_at: string
  revoked_at: string | null
}

type StateDocument = {
  relationship_id: string
  person_id: string
  display_name: string
  status: RelationshipStatus
  started_at: string
  ended_at: string | null
  holder: ProfessionalRow | null
  substitutions: SubstitutionRow[]
  grants: GrantRow[]
  termination_request: TerminationRequestDocument | null
}

type HistoryEventRow = {
  type: RelationshipHistoryEvent['type']
  occurred_at: string
  source_id: string
  detail: Record<string, unknown>
}

type HistoryDocument = {
  relationship_id: string
  person_id: string
  data: HistoryEventRow[]
  page: { next_cursor: string | null; has_more: boolean }
}

/**
 * PostgreSQL access for changing who attends a client.
 *
 * The organization context is set by the function itself, for the same reason
 * as assigning: it checks the capability against that organization before
 * anything is written, and a caller that set it from outside would be declaring
 * the answer to the question being asked.
 */
export function createHolderReassignmentDatabase(
  sql: postgres.Sql = database(),
): HolderReassignmentDatabase {
  return {
    reassignHolder: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.actorPersonId)
          const [moved] = await transaction<ReassignmentRow[]>`
            select * from relationships.reassign_relationship_holder(
              ${input.actorPersonId}::uuid,
              ${input.organizationId}::uuid,
              ${input.relationshipId}::uuid,
              ${input.membershipId}::uuid,
              ${input.idempotencyKey}::uuid,
              ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return moved
        })

        if (!row) throw new Error('reassign_relationship_holder returned no row')
        return {
          resource: {
            assignmentId: row.assignment_id,
            relationshipId: row.relationship_id,
            membershipId: row.membership_id,
            professionalPersonId: row.professional_person_id,
            validFrom: new Date(row.valid_from),
            replacedAssignmentId: row.replaced_assignment_id,
          },
          reassigned: row.reassigned,
          replayed: row.replayed,
        }
      }),
  }
}

type ReassignmentRow = {
  assignment_id: string
  relationship_id: string
  membership_id: string
  professional_person_id: string
  valid_from: string
  replaced_assignment_id: string | null
  reassigned: boolean
  replayed: boolean
}

/**
 * PostgreSQL access for putting a coach in charge.
 *
 * The organization context is set by the function itself, not here: it checks
 * the capability against it before anything is written, and a caller that set
 * it from outside would be declaring the answer to the question being asked.
 */
export function createHolderAssignmentDatabase(
  sql: postgres.Sql = database(),
): HolderAssignmentDatabase {
  return {
    assignHolder: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.actorPersonId)
          const [assigned] = await transaction<HolderRow[]>`
            select * from relationships.assign_relationship_holder(
              ${input.actorPersonId}::uuid,
              ${input.organizationId}::uuid,
              ${input.relationshipId}::uuid,
              ${input.membershipId}::uuid,
              ${input.idempotencyKey}::uuid,
              ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return assigned
        })

        if (!row) throw new Error('assign_relationship_holder returned no row')
        return {
          resource: {
            assignmentId: row.assignment_id,
            relationshipId: row.relationship_id,
            membershipId: row.membership_id,
            personId: row.person_id,
            validFrom: new Date(row.valid_from),
          },
          created: row.created,
          replayed: row.replayed,
        }
      }),
  }
}

type HolderRow = {
  assignment_id: string
  relationship_id: string
  membership_id: string
  person_id: string
  valid_from: string
  created: boolean
  replayed: boolean
}

/**
 * PostgreSQL access for asking somebody to accept a cover.
 *
 * The organization context is set by the function itself, for the same reason
 * as assigning and reassigning.
 *
 * The dates stay strings on the way in and on the way out. `date` has no time
 * and no zone, and routing it through a `Date` would attach both — a cover
 * starting on the 12th becoming the 11th at 22:00 for a caller an hour west is
 * the whole of that bug.
 */
export function createSubstitutionProposalDatabase(
  sql: postgres.Sql = database(),
): SubstitutionProposalDatabase {
  return {
    proposeSubstitution: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.actorPersonId)
          const [proposal] = await transaction<SubstitutionProposalRow[]>`
            select
              assignment_id,
              relationship_id,
              membership_id,
              professional_person_id,
              starts_on::text as starts_on,
              ends_on::text as ends_on,
              proposed,
              replayed
            from relationships.propose_substitution(
              ${input.actorPersonId}::uuid,
              ${input.organizationId}::uuid,
              ${input.relationshipId}::uuid,
              ${input.membershipId}::uuid,
              ${input.startsOn}::date,
              ${input.endsOn}::date,
              ${input.idempotencyKey}::uuid,
              ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return proposal
        })

        if (!row) throw new Error('propose_substitution returned no row')
        return {
          resource: {
            assignmentId: row.assignment_id,
            relationshipId: row.relationship_id,
            membershipId: row.membership_id,
            professionalPersonId: row.professional_person_id,
            startsOn: row.starts_on,
            endsOn: row.ends_on,
          },
          proposed: row.proposed,
          replayed: row.replayed,
        }
      }),
  }
}

type SubstitutionProposalRow = {
  assignment_id: string
  relationship_id: string
  membership_id: string
  professional_person_id: string
  starts_on: string
  ends_on: string
  proposed: boolean
  replayed: boolean
}

/**
 * `OP-REL-006`. The organization is `null` on the Space surface, and the command
 * reads that as «the caller is not claiming to act inside one» rather than as a
 * missing argument: it resolves the organization from the relationship either
 * way, and only a Studio caller has one to be checked against.
 *
 * `ended_at` is cast to text for the same reason the proposal's dates are. The
 * driver would hand back a `Date`, and a `Date` serialised by the route is the
 * server's timezone leaking into a contract that says instant.
 */
export function createSubstitutionTerminationDatabase(
  sql: postgres.Sql = database(),
): SubstitutionTerminationDatabase {
  return {
    endSubstitution: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.actorPersonId)
          const [termination] = await transaction<SubstitutionTerminationRow[]>`
            select
              assignment_id,
              relationship_id,
              membership_id,
              professional_person_id,
              ended_at::text as ended_at,
              replayed
            from relationships.end_substitution(
              ${input.actorPersonId}::uuid,
              ${input.organizationId ?? null}::uuid,
              ${input.relationshipId}::uuid,
              ${input.assignmentId}::uuid,
              ${input.idempotencyKey}::uuid,
              ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return termination
        })

        if (!row) throw new Error('end_substitution returned no row')
        return {
          resource: {
            assignmentId: row.assignment_id,
            relationshipId: row.relationship_id,
            membershipId: row.membership_id,
            professionalPersonId: row.professional_person_id,
            endedAt: row.ended_at,
          },
          replayed: row.replayed,
        }
      }),
  }
}

type SubstitutionTerminationRow = {
  assignment_id: string
  relationship_id: string
  membership_id: string
  professional_person_id: string
  ended_at: string
  replayed: boolean
}

/**
 * `OP-REL-012`. The function answers with the contract's own field names, so the rows go
 * out as they came in apart from the timestamps, which PostgreSQL hands over as `Date`.
 *
 * Reads `limit + 1` and trims, so `has_more` is a fact rather than a guess.
 */
export function createMyRelationshipDatabase(
  sql: postgres.Sql = database(),
): MyRelationshipDatabase {
  return {
    listMine: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const outcome = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          const rows = await transaction<MyRelationshipRow[]>`
            select * from relationships.list_my_relationships(
              ${personId}::uuid,
              ${query.limit + 1}::integer,
              ${query.cursorStartedAt ?? null}::timestamptz,
              ${query.cursorRelationshipId ?? null}::uuid
            )
          `
          const hasMore = rows.length > query.limit
          return {
            value: {
              items: rows.slice(0, query.limit).map(presentMyRelationship),
              hasMore,
            },
          }
        })
        return outcome.value
      }),
  }
}

type MyRelationshipRow = {
  relationship_id: string
  organization_id: string
  organization_name: string
  organization_type_code: string
  status: MyRelationship['status']
  started_at: string
  ended_at: string | null
  previous_relationship_id: string | null
  holder_name: string | null
}

function presentMyRelationship(row: MyRelationshipRow): MyRelationship {
  return {
    relationship_id: row.relationship_id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_type_code: row.organization_type_code,
    status: row.status,
    started_at: new Date(row.started_at).toISOString(),
    ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    previous_relationship_id: row.previous_relationship_id,
    holder_name: row.holder_name,
  }
}

/**
 * `OP-REL-005` and `OP-REL-007`, the person's own. Timestamps go out as text, cast in
 * the query, so the server's timezone never leaks into an instant.
 */
export function createMyRelationshipCommandDatabase(
  sql: postgres.Sql = database(),
): MyRelationshipCommandDatabase {
  return {
    decideSubstitution: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.personId)
          const [decided] = await transaction<
            {
              assignment_id: string
              status: SubstitutionDecision['status']
              accepted_by_person_at: string | null
              replayed: boolean
            }[]
          >`
            select assignment_id, status, accepted_by_person_at::text as accepted_by_person_at, replayed
            from relationships.decide_substitution(
              ${input.personId}::uuid, ${input.relationshipId}::uuid, ${input.assignmentId}::uuid,
              ${input.decision}, ${input.idempotencyKey}::uuid, ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return decided
        })
        if (!row) throw new Error('decide_substitution returned no row')
        return {
          resource: {
            assignmentId: row.assignment_id,
            status: row.status,
            acceptedByPersonAt: row.accepted_by_person_at
              ? new Date(row.accepted_by_person_at).toISOString()
              : null,
          },
          replayed: row.replayed,
        }
      }),

    endRelationship: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.personId)
          const [ended] = await transaction<
            {
              relationship_id: string
              ended_at: string
              frozen_grants: number
              closed_assignments: number
              replayed: boolean
            }[]
          >`
            select relationship_id, ended_at::text as ended_at, frozen_grants,
                   closed_assignments, replayed
            from relationships.end_my_relationship(
              ${input.personId}::uuid, ${input.relationshipId}::uuid, ${input.reason},
              ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
            )
          `
          return ended
        })
        if (!row) throw new Error('end_my_relationship returned no row')
        return {
          resource: {
            relationshipId: row.relationship_id,
            endedAt: new Date(row.ended_at).toISOString(),
            frozenGrants: row.frozen_grants,
            closedAssignments: row.closed_assignments,
          },
          replayed: row.replayed,
        }
      }),
  }
}

/**
 * `OP-REL-013`. One more than asked for, and its presence is what says another
 * page exists — the same trick `listMine` uses, and cheaper than counting the
 * whole set to answer a yes-or-no question.
 *
 * The organization goes down as `null` on the Space surface. The command reads
 * that as «the caller is not claiming to act inside one» and resolves it from
 * the relationship, so there is no second place where a tenant could be
 * decided.
 */
export function createSubstitutionListDatabase(
  sql: postgres.Sql = database(),
): SubstitutionListDatabase {
  return {
    listSubstitutions: (personId, query) =>
      measureStudioRequestPhase('business-db', async () => {
        const outcome = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, personId)
          // A date as text: the driver turns a bare date into a midnight instant.
          const rows = await transaction<ListedSubstitutionRow[]>`
            select assignment_id, membership_id, professional_person_id, display_name,
                   status, valid_from, valid_to, ends_on::text as ends_on, accepted_by_person_at
            from relationships.list_relationship_substitutions(
              ${personId}::uuid,
              ${query.organizationId ?? null}::uuid,
              ${query.relationshipId}::uuid,
              ${query.limit + 1}::integer,
              ${query.cursorValidFrom ?? null}::timestamptz,
              ${query.cursorAssignmentId ?? null}::uuid
            )
          `
          const hasMore = rows.length > query.limit
          return {
            value: {
              items: rows.slice(0, query.limit).map((row) => ({
                assignmentId: row.assignment_id,
                membershipId: row.membership_id,
                professionalPersonId: row.professional_person_id,
                displayName: row.display_name,
                status: row.status,
                validFrom: row.valid_from,
                validTo: row.valid_to,
                endsOn: row.ends_on,
                acceptedByPersonAt: row.accepted_by_person_at,
              })),
              hasMore,
            },
          }
        })
        return outcome.value
      }),
  }
}

type ListedSubstitutionRow = {
  assignment_id: string
  membership_id: string
  professional_person_id: string
  display_name: string
  status: 'proposed' | 'active' | 'ended'
  valid_from: Date
  valid_to: Date | null
  ends_on: string | null
  accepted_by_person_at: Date | null
}

/**
 * `OP-REL-008`. The counts come back as numbers rather than being recomputed
 * here: the command is the only place that knows how many grants were still
 * active when `T` happened, and asking again afterwards would answer a
 * different question.
 */
export function createRelationshipTerminationDatabase(
  sql: postgres.Sql = database(),
): RelationshipTerminationDatabase {
  return {
    terminate: (input) =>
      measureStudioRequestPhase('business-db', async () => {
        const row = await sql.begin(async (transaction) => {
          await setPersonActor(transaction, input.actorPersonId)
          const [termination] = await transaction<RelationshipTerminationRow[]>`
            select
              relationship_id,
              person_id,
              ended_at,
              frozen_grants,
              closed_assignments,
              replayed
            from relationships.terminate_relationship(
              ${input.actorPersonId}::uuid,
              ${input.organizationId}::uuid,
              ${input.relationshipId}::uuid,
              ${input.reason ?? null}::text,
              ${input.idempotencyKey}::uuid,
              ${input.commandId}::uuid,
              ${input.requestHash}
            )
          `
          return termination
        })

        if (!row) throw new Error('terminate_relationship returned no row')
        return {
          resource: {
            relationshipId: row.relationship_id,
            personId: row.person_id,
            endedAt: row.ended_at,
            frozenGrants: row.frozen_grants,
            closedAssignments: row.closed_assignments,
          },
          replayed: row.replayed,
        }
      }),
  }
}

type RelationshipTerminationRow = {
  relationship_id: string
  person_id: string
  ended_at: Date
  frozen_grants: number
  closed_assignments: number
  replayed: boolean
}

type TerminationRequestParty = { membership_id: string; display_name: string }

/** `relationships.termination_request_document`, the one shape a request is read in. */
type TerminationRequestDocument = {
  request_id: string
  relationship_id: string
  status: TerminationRequestStatus
  reason: string | null
  resolution: string | null
  requested_by: TerminationRequestParty
  resolved_by: TerminationRequestParty | null
  created_at: string
  resolved_at: string | null
}

function presentTerminationRequest(document: TerminationRequestDocument): TerminationRequest {
  return {
    requestId: document.request_id,
    relationshipId: document.relationship_id,
    status: document.status,
    reason: document.reason,
    resolution: document.resolution,
    requestedBy: {
      membershipId: document.requested_by.membership_id,
      displayName: document.requested_by.display_name,
    },
    resolvedBy: document.resolved_by
      ? {
          membershipId: document.resolved_by.membership_id,
          displayName: document.resolved_by.display_name,
        }
      : null,
    createdAt: new Date(document.created_at),
    resolvedAt: document.resolved_at ? new Date(document.resolved_at) : null,
  }
}

type TerminationRequestRow = { result: TerminationRequestDocument | null; replayed: boolean }

/**
 * `OP-REL-009`, `OP-REL-017`, `OP-REL-018`. Each command answers with the request as
 * the actor may read it; a null document means the policy hid it, which no command
 * that just succeeded should produce, so it is an error rather than an empty answer.
 */
export function createTerminationRequestDatabase(
  sql: postgres.Sql = database(),
): TerminationRequestDatabase {
  const run = (
    actorPersonId: string,
    name: string,
    query: (transaction: postgres.TransactionSql) => Promise<TerminationRequestRow[]>,
  ) =>
    measureStudioRequestPhase('business-db', async () => {
      const [row] = await sql.begin(async (transaction) => {
        await setPersonActor(transaction, actorPersonId)
        return query(transaction)
      })
      if (!row?.result) throw new Error(`${name} returned no request`)
      return { resource: presentTerminationRequest(row.result), replayed: row.replayed }
    })

  return {
    request: (input) =>
      run(
        input.actorPersonId,
        'request_relationship_termination',
        (transaction) => transaction<TerminationRequestRow[]>`
          select result, replayed
          from relationships.request_relationship_termination(
            ${input.actorPersonId}::uuid,
            ${input.organizationId}::uuid,
            ${input.relationshipId}::uuid,
            ${input.reason ?? null}::text,
            ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid,
            ${input.requestHash}
          )
        `,
      ),
    withdraw: (input) =>
      run(
        input.actorPersonId,
        'withdraw_termination_request',
        (transaction) => transaction<TerminationRequestRow[]>`
          select result, replayed
          from relationships.withdraw_termination_request(
            ${input.actorPersonId}::uuid,
            ${input.organizationId}::uuid,
            ${input.relationshipId}::uuid,
            ${input.requestId}::uuid,
            ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid,
            ${input.requestHash}
          )
        `,
      ),
    reject: (input) =>
      run(
        input.actorPersonId,
        'reject_termination_request',
        (transaction) => transaction<TerminationRequestRow[]>`
          select result, replayed
          from relationships.reject_termination_request(
            ${input.actorPersonId}::uuid,
            ${input.organizationId}::uuid,
            ${input.relationshipId}::uuid,
            ${input.requestId}::uuid,
            ${input.resolution}::text,
            ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid,
            ${input.requestHash}
          )
        `,
      ),
  }
}
