import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-046 against OP-REL-008: an assignment and a termination that cross never leave
// a managed program behind a relationship that is over. Fixtures are committed so
// independent sessions see them; every command commits too.
const id = (n: number) => `019f3901-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f3901-0000-4000-8000-${String(n).padStart(12, '0')}`
const options = {
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 1,
  connect_timeout: 2,
} as const
const admin = postgres(options)
const coach = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const VERSION = id(332)
const COMMANDS = [key(901), key(902)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id in (select id from planning.program_assignments where person_id = ${CLIENT}::uuid)`
    await tx`delete from planning.planned_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.assignment_management_periods where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_assignments where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_version_sessions where program_version_id = ${VERSION}::uuid`
    await tx`delete from planning.program_versions where id = ${VERSION}::uuid`
    await tx`delete from planning.programs where id = ${id(331)}::uuid`
    await tx`delete from planning.session_template_versions where id = ${id(312)}::uuid`
    await tx`delete from planning.session_templates where id = ${id(311)}::uuid`
    await tx`delete from privacy.data_grants where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.consent_events where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.invitation_scope_options where id = ${id(601)}::uuid`
    await tx`delete from identity.invitation_intents where id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(401)}::uuid`
    await tx`delete from privacy.scope_resource_rules where scope_definition_id = ${id(301)}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${id(301)}::uuid`
    await tx`delete from relationships.relationship_termination_requests
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.relationship_professional_assignments
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.service_relationships where id = ${RELATIONSHIP}::uuid`
    await tx`delete from organizations.membership_events
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid)`
    await tx`delete from organizations.membership_roles
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid)`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people
      where id in (${CLIENT}::uuid, ${OWNER}::uuid, ${COACH}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${CLIENT}::uuid, 'Race', 'Client', null),
      (${OWNER}::uuid, 'Race', 'Owner', null),
      (${COACH}::uuid, 'Race', 'Coach', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Assignment race',
      '{"party_kind":"legal_entity","party_name":"Assignment race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(211)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(212)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(211)}::uuid, 'owner'), (${id(212)}::uuid, 'coach')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '30 days')`
    await tx`insert into relationships.relationship_professional_assignments
        (relationship_id, person_id, organization_id, membership_id, kind, status, valid_from)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, ${id(212)}::uuid,
        'holder', 'active', clock_timestamp() - interval '29 days')`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'relationship_training', 9139, 'draft', null)`
    // IX-06: contributing is offered only where the published version admits it.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      values (${id(301)}::uuid, 'planning.program_assignments', '*', 'training', 'contribute')`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp() where id = ${id(301)}::uuid`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'race-client@example.test', extensions.digest('race-token', 'sha256'), 1,
        extensions.digest('race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Assignment race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${id(301)}::uuid, 'relationship_training',
        'contribute', 'Plan the training', '{"title":"Training"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(901)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${id(902)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'relationship_training', ${id(901)}::uuid, 'contribute',
        'Plan the training')`
    await tx`insert into planning.session_templates
        (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
      values (${id(311)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid,
        'test_strength', 'published')`
    await tx`insert into planning.programs
        (id, content_scope, owner_organization_id, author_person_id, status)
      values (${id(331)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid, 'published')`
    await tx`select set_config('app.planning_publication', 'true', true)`
    await tx`insert into planning.session_template_versions
        (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
      values (${id(312)}::uuid, ${id(311)}::uuid, 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Race', decode(repeat('a1', 32), 'hex'))`
    await tx`insert into planning.program_versions (id, program_id, version_number, title, content_hash)
      values (${VERSION}::uuid, ${id(331)}::uuid, 1, 'Race block', decode(repeat('a2', 32), 'hex'))`
    await tx`insert into planning.program_version_sessions
        (program_version_id, template_version_id, position, week, day)
      values (${VERSION}::uuid, ${id(312)}::uuid, 1, 1, 1), (${VERSION}::uuid, ${id(312)}::uuid, 2, 2, 1)`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      coach.end({ timeout: 1 }),
      owner.end({ timeout: 1 }),
    ])
  }
})

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function assign(tx: Transaction) {
  await actAs(tx, COACH)
  return tx`select * from planning.assign_program_from_relationship(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, ${VERSION}::uuid,
    (clock_timestamp() at time zone 'America/Bogota')::date, 'America/Bogota',
    ${key(901)}::uuid, ${key(901)}::uuid, extensions.digest('assign', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(902)}::uuid, ${key(902)}::uuid, extensions.digest('terminate', 'sha256'))`
}

async function assignments() {
  return admin<{ lifecycle: string; open_periods: number; waiting: number }[]>`
    select assignment.lifecycle::text,
           (select count(*)::int from planning.assignment_management_periods as period
             where period.assignment_id = assignment.id and period.ended_at is null) as open_periods,
           (select count(*)::int from planning.planned_sessions as session
             where session.assignment_id = assignment.id and session.status = 'scheduled') as waiting
    from planning.program_assignments as assignment
    where assignment.person_id = ${CLIENT}::uuid`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('a termination arriving while the assignment commits waits for it, then detaches it', async () => {
  let termination: Promise<unknown> | undefined
  await coach.begin(async (tx) => {
    await assign(tx)
    termination = owner.begin(terminate)
    await pause()
  })
  await termination

  expect(await assignments()).toEqual([
    { lifecycle: 'detached_pending_choice', open_periods: 0, waiting: 0 },
  ])
})

test('an assignment arriving while the termination commits finds the relationship over', async () => {
  let assigning: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    assigning = coach.begin(assign)
    await pause()
  })

  await expect(assigning).rejects.toMatchObject({ code: '55000' })
  expect(await assignments()).toEqual([])
})
