import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

/*
 * HU-STUDIO-048 and HU-STUDIO-050 against what crosses them: the person starting a
 * session, Space planting her week, and the relationship ending.
 *
 * A cancellation or a detachment decides which sessions stop by asking whether one
 * started. Under READ COMMITTED, an update that waits for a row re-checks only that
 * row, so an attempt committed meanwhile would go unseen; both lock the sessions in a
 * statement of their own first. Every command holds the relationship `for share`, so a
 * termination waits for it or it finds the relationship over. Fixtures are committed
 * so independent sessions see them; every command commits too.
 */
const id = (n: number) => `019f4102-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f4102-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const person = postgres(options)
const coach = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const FINITE = id(332)
const OPEN_ENDED = id(342)
const ASSIGNMENT = id(901)
const TODAY_SESSION = id(911)
const NEXT_SESSION = id(912)
const ZONE = 'America/Bogota'
const START = key(1)
const CANCEL = key(2)
const TERMINATE = key(3)
const RESCHEDULE = key(4)
const REVISE = key(5)
const COMMANDS = [START, CANCEL, TERMINATE, RESCHEDULE, REVISE]
const STEP = id(313)

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id in (select id from planning.program_assignments where person_id = ${CLIENT}::uuid)
      or aggregate_id in (select id from planning.planned_sessions where person_id = ${CLIENT}::uuid)`
    await tx`delete from execution.session_exercises where executed_session_id in (
      select id from execution.executed_sessions where person_id = ${CLIENT}::uuid)`
    await tx`delete from execution.planned_session_executions where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.executed_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.planned_session_reschedules where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.prescription_revisions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.planned_sessions where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.assignment_management_periods where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_assignments where person_id = ${CLIENT}::uuid`
    await tx`delete from planning.program_version_sessions
      where program_version_id in (${FINITE}::uuid, ${OPEN_ENDED}::uuid)`
    await tx`delete from planning.program_versions where id in (${FINITE}::uuid, ${OPEN_ENDED}::uuid)`
    await tx`delete from planning.programs where id in (${id(331)}::uuid, ${id(341)}::uuid)`
    await tx`delete from planning.strength_targets where planned_step_id = ${STEP}::uuid`
    await tx`delete from planning.planned_steps where id = ${STEP}::uuid`
    await tx`delete from planning.session_template_versions where id = ${id(312)}::uuid`
    await tx`delete from planning.session_templates where id = ${id(311)}::uuid`
    await tx`delete from privacy.data_grants where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.consent_events where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.invitation_scope_options where id = ${id(601)}::uuid`
    await tx`delete from identity.invitation_intents where id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(401)}::uuid`
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
      (${CLIENT}::uuid, 'Managed', 'Client', null),
      (${OWNER}::uuid, 'Managed', 'Owner', null),
      (${COACH}::uuid, 'Managed', 'Coach', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Managed race',
      '{"party_kind":"legal_entity","party_name":"Managed race","purpose":"studio_operations"}')`
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
      values (${id(301)}::uuid, 'relationship_training', 9141, 'published', clock_timestamp())`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'managed-client@example.test', extensions.digest('managed-token', 'sha256'), 1,
        extensions.digest('managed-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Managed race","purpose":"studio_operations"}',
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
      values (${id(801)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${id(802)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'relationship_training', ${id(801)}::uuid, 'contribute',
        'Plan the training')`
    await tx`insert into planning.session_templates
        (id, content_scope, owner_organization_id, author_person_id, discipline_code, status)
      values (${id(311)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid,
        'test_strength', 'published')`
    await tx`insert into planning.programs
        (id, content_scope, owner_organization_id, author_person_id, status)
      values (${id(331)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid, 'published'),
        (${id(341)}::uuid, 'organization', ${ORGANIZATION}::uuid, ${COACH}::uuid, 'published')`
    await tx`select set_config('app.planning_publication', 'true', true)`
    await tx`insert into planning.session_template_versions
        (id, template_id, version_number, discipline_code, activity_type_id, title, content_hash)
      values (${id(312)}::uuid, ${id(311)}::uuid, 1, 'test_strength',
        '019c0000-0000-7000-8000-000000000011', 'Managed', decode(repeat('b1', 32), 'hex'))`
    await tx`insert into planning.planned_steps (id, template_version_id, position)
      values (${STEP}::uuid, ${id(312)}::uuid, 1)`
    // IX-22 resolves the family under FORCE RLS: only a coach of the gym sees its content.
    await tx`select set_config('app.actor_kind', 'person', true),
      set_config('app.actor_person_id', ${COACH}, true),
      set_config('app.actor_org_id', ${ORGANIZATION}, true),
      set_config('app.actor_membership_id', ${id(212)}, true)`
    await tx`insert into planning.strength_targets (planned_step_id, target_sets, target_reps)
      values (${STEP}::uuid, 3, 8)`
    await tx`insert into planning.program_versions
        (id, program_id, version_number, title, content_hash, repeats_forever)
      values (${FINITE}::uuid, ${id(331)}::uuid, 1, 'Managed block', decode(repeat('b2', 32), 'hex'), false),
        (${OPEN_ENDED}::uuid, ${id(341)}::uuid, 1, 'Managed forever', decode(repeat('b3', 32), 'hex'), true)`
    await tx`insert into planning.program_version_sessions
        (program_version_id, template_version_id, position, week, day)
      values (${FINITE}::uuid, ${id(312)}::uuid, 1, 1, 1), (${FINITE}::uuid, ${id(312)}::uuid, 2, 2, 1),
        (${OPEN_ENDED}::uuid, ${id(312)}::uuid, 1, 1, 1), (${OPEN_ENDED}::uuid, ${id(312)}::uuid, 2, 1, 4)`
    await tx`select set_config('app.planning_publication', '', true)`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      person.end({ timeout: 1 }),
      coach.end({ timeout: 1 }),
      owner.end({ timeout: 1 }),
    ])
  }
})

// The finite program, managed since yesterday: one session today, one next week.
async function managed() {
  await admin.begin(async (tx) => {
    await tx`insert into planning.program_assignments
        (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on,
         timezone, assigned_at, display_order)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${FINITE}::uuid, ${RELATIONSHIP}::uuid,
        'active', (clock_timestamp() at time zone ${ZONE})::date, ${ZONE},
        clock_timestamp() - interval '1 day', 1)`
    await tx`insert into planning.assignment_management_periods
        (assignment_id, person_id, relationship_id, started_at)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid,
        clock_timestamp() - interval '1 day')`
    await tx`insert into planning.planned_sessions
        (id, assignment_id, person_id, template_version_id, program_day, week_starts_on,
         scheduled_at, timezone)
      select planted.id, ${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${id(312)}::uuid, planted.day,
             planted.week, (planted.week + planted.day - 1)::timestamp at time zone ${ZONE}, ${ZONE}
      from (select (clock_timestamp() at time zone ${ZONE})::date as today) as now
      cross join lateral (values
        (${TODAY_SESSION}::uuid, date_trunc('week', now.today)::date,
         extract(isodow from now.today)::integer),
        (${NEXT_SESSION}::uuid, date_trunc('week', now.today)::date + 7, 1)
      ) as planted (id, week, day)`
  })
}

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function start(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from execution.start_planned_session_attempt(
    ${CLIENT}::uuid, ${TODAY_SESSION}::uuid, clock_timestamp(), ${ZONE}, 'detailed', 'manual',
    ${START}::uuid, ${START}::uuid, extensions.digest('start', 'sha256'))`
}

async function cancel(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from planning.cancel_managed_assignment(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${ASSIGNMENT}::uuid,
    ${CANCEL}::uuid, ${CANCEL}::uuid, extensions.digest('cancel', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${TERMINATE}::uuid, ${TERMINATE}::uuid, extensions.digest('terminate', 'sha256'))`
}

// Next week's Monday to its Wednesday: the same week, as a move must stay.
async function reschedule(tx: Transaction) {
  await actAs(tx, COACH)
  return tx`select * from planning.reschedule_planned_session(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${NEXT_SESSION}::uuid,
    date_trunc('week', (clock_timestamp() at time zone ${ZONE})::date)::date + 9, 0,
    ${RESCHEDULE}::uuid, ${RESCHEDULE}::uuid, extensions.digest('reschedule', 'sha256'))`
}

async function revise(tx: Transaction) {
  await actAs(tx, COACH)
  return tx`select * from planning.revise_prescription(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${ASSIGNMENT}::uuid, ${STEP}::uuid, 'notes',
    '"Slow on the way down"'::jsonb, null,
    ${REVISE}::uuid, ${REVISE}::uuid, extensions.digest('revise', 'sha256'))`
}

async function period() {
  const [row] = await admin<{ end_reason: string | null }[]>`
    select end_reason from planning.assignment_management_periods
    where assignment_id = ${ASSIGNMENT}::uuid`
  return row?.end_reason
}

async function sessions() {
  return admin<{ id: string; status: string; started: boolean }[]>`
    select session.id::text, session.status,
           exists (select 1 from execution.planned_session_executions as attempt
                   where attempt.planned_session_id = session.id) as started
    from planning.planned_sessions as session
    where session.assignment_id = ${ASSIGNMENT}::uuid
    order by session.scheduled_at, session.id`
}

async function lifecycle(assignmentId: string) {
  const [row] = await admin<{ lifecycle: string }[]>`
    select lifecycle::text from planning.program_assignments where id = ${assignmentId}::uuid`
  return row?.lifecycle
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('a session she starts while the gym cancels stays hers; only the rest stop', async () => {
  await managed()
  let cancelling: Promise<unknown> | undefined
  await person.begin(async (tx) => {
    await start(tx)
    cancelling = owner.begin(cancel)
    await pause()
  })
  await cancelling

  expect(await lifecycle(ASSIGNMENT)).toBe('ended')
  expect(await sessions()).toEqual([
    { id: TODAY_SESSION, status: 'scheduled', started: true },
    { id: NEXT_SESSION, status: 'cancelled', started: false },
  ])
})

test('a cancellation that commits first leaves nothing to start', async () => {
  await managed()
  let starting: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await cancel(tx)
    starting = person.begin(start)
    await pause()
  })

  await expect(starting).rejects.toMatchObject({ code: '23514' })
  expect(await sessions()).toEqual([
    { id: TODAY_SESSION, status: 'cancelled', started: false },
    { id: NEXT_SESSION, status: 'cancelled', started: false },
  ])
})

test('a week Space plants while the gym cancels is not planted for an ended program', async () => {
  // Open-ended and two weeks in, so this week has not been planted yet.
  await admin.begin(async (tx) => {
    await tx`insert into planning.program_assignments
        (id, person_id, program_version_id, origin_relationship_id, lifecycle, starts_on,
         timezone, assigned_at, display_order)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${OPEN_ENDED}::uuid, ${RELATIONSHIP}::uuid,
        'active', (clock_timestamp() at time zone ${ZONE})::date - 14, ${ZONE},
        clock_timestamp() - interval '14 days', 1)`
    await tx`insert into planning.assignment_management_periods
        (assignment_id, person_id, relationship_id, started_at)
      values (${ASSIGNMENT}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid,
        clock_timestamp() - interval '14 days')`
  })

  let planting: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await cancel(tx)
    planting = person.begin(async (space) => {
      await actAs(space, CLIENT)
      return space`select * from planning.read_week_plan(${CLIENT}::uuid, ${ZONE})`
    })
    await pause()
  })
  await planting

  expect(await lifecycle(ASSIGNMENT)).toBe('ended')
  expect(await sessions()).toEqual([])
})

test('a session she starts while the relationship ends is not paused', async () => {
  await managed()
  let terminating: Promise<unknown> | undefined
  await person.begin(async (tx) => {
    await start(tx)
    terminating = owner.begin(terminate)
    await pause()
  })
  await terminating

  expect(await lifecycle(ASSIGNMENT)).toBe('detached_pending_choice')
  expect(await sessions()).toEqual([
    { id: TODAY_SESSION, status: 'scheduled', started: true },
    { id: NEXT_SESSION, status: 'paused', started: false },
  ])
})

test('a termination arriving while a move commits waits for it, then pauses the moved session', async () => {
  await managed()
  let terminating: Promise<unknown> | undefined
  await coach.begin(async (tx) => {
    await reschedule(tx)
    terminating = owner.begin(terminate)
    await pause()
  })
  await terminating

  expect(await lifecycle(ASSIGNMENT)).toBe('detached_pending_choice')
  const [moved] = await admin<{ moves: number; status: string }[]>`
    select (select count(*)::int from planning.planned_session_reschedules
             where planned_session_id = ${NEXT_SESSION}::uuid) as moves,
           (select status from planning.planned_sessions where id = ${NEXT_SESSION}::uuid) as status`
  expect(moved).toEqual({ moves: 1, status: 'paused' })
})

test('a move arriving while the termination commits finds the relationship over', async () => {
  await managed()
  let moving: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    moving = coach.begin(reschedule)
    await pause()
  })

  await expect(moving).rejects.toMatchObject({ code: '55000' })
  const [moves] = await admin<{ count: number }[]>`
    select count(*)::int from planning.planned_session_reschedules
    where planned_session_id = ${NEXT_SESSION}::uuid`
  expect(moves?.count).toBe(0)
})

test('a cancellation arriving while the termination commits finds the relationship over', async () => {
  await managed()
  let cancelling: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    cancelling = coach.begin(cancel)
    await pause()
  })

  await expect(cancelling).rejects.toMatchObject({ code: '55000' })
  expect(await lifecycle(ASSIGNMENT)).toBe('detached_pending_choice')
  expect(await period()).toBe('relationship_ended')
  expect(await sessions()).toEqual([
    { id: TODAY_SESSION, status: 'paused', started: false },
    { id: NEXT_SESSION, status: 'paused', started: false },
  ])
})

test('a termination arriving while the cancellation commits waits, and finds nothing to detach', async () => {
  await managed()
  let terminating: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await cancel(tx)
    terminating = coach.begin(terminate)
    await pause()
  })
  await terminating

  expect(await lifecycle(ASSIGNMENT)).toBe('ended')
  expect(await period()).toBe('cancelled')
  expect(await sessions()).toEqual([
    { id: TODAY_SESSION, status: 'cancelled', started: false },
    { id: NEXT_SESSION, status: 'cancelled', started: false },
  ])
})

test('an adjustment arriving while the termination commits finds the relationship over', async () => {
  await managed()
  let revising: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await terminate(tx)
    revising = coach.begin(revise)
    await pause()
  })

  await expect(revising).rejects.toMatchObject({ code: '55000' })
  const [revisions] = await admin<{ count: number }[]>`
    select count(*)::int from planning.prescription_revisions
    where assignment_id = ${ASSIGNMENT}::uuid`
  expect(revisions?.count).toBe(0)
})
