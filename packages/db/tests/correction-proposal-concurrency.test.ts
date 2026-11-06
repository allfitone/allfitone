import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-059 and HU-SP-063 against what else can happen to the same set at the same
// moment: her own correction, a colleague proposing the same thing, the sweep, and the end of
// the relationship. Whichever goes second sees the first. Fixtures are committed so
// independent sessions see them.
const id = (n: number) => `019f5201-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f5201-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const first = postgres(options)
const second = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const COACH = id(12)
const COVER = id(13)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const HOLDER = id(801)
const SUBSTITUTE = id(802)
const SESSION = id(901)
const SET = id(902)
const PROPOSAL = id(951)
const OTHER = id(952)
const COMMANDS = [PROPOSAL, OTHER, key(901), key(902), key(903), key(904)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Revisions are append-only; only this fixture is removed past that.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id in
      (${RELATIONSHIP}::uuid, ${HOLDER}::uuid, ${SUBSTITUTE}::uuid, ${PROPOSAL}::uuid, ${OTHER}::uuid)`
    await tx`delete from execution.execution_revisions where person_id = ${CLIENT}::uuid`
    await tx`delete from execution.correction_proposals where person_id = ${CLIENT}::uuid`
    // Replica mode skips the cascade too, so the sets go by hand.
    await tx`delete from execution.strength_sets where executed_session_id = ${SESSION}::uuid`
    await tx`delete from execution.executed_sessions where person_id = ${CLIENT}::uuid`
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
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid, ${id(213)}::uuid)`
    await tx`delete from organizations.membership_roles
      where membership_id in (${id(211)}::uuid, ${id(212)}::uuid, ${id(213)}::uuid)`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people
      where id in (${CLIENT}::uuid, ${OWNER}::uuid, ${COACH}::uuid, ${COVER}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${CLIENT}::uuid, 'Race', 'Client', 'proposal-race@example.test'),
      (${OWNER}::uuid, 'Race', 'Owner', null),
      (${COACH}::uuid, 'Race', 'Coach', null),
      (${COVER}::uuid, 'Race', 'Cover', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Proposal race',
      '{"party_kind":"legal_entity","party_name":"Proposal race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(211)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(212)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid),
      (${id(213)}::uuid, ${ORGANIZATION}::uuid, ${COVER}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(211)}::uuid, 'owner'), (${id(212)}::uuid, 'coach'), (${id(213)}::uuid, 'coach')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '40 days')`
    await tx`insert into relationships.relationship_professional_assignments
        (id, relationship_id, person_id, organization_id, membership_id, covers_membership_id,
         kind, status, valid_from, ends_on, accepted_by_person_at)
      values
        (${HOLDER}::uuid, ${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid,
         ${id(212)}::uuid, null, 'holder', 'active', clock_timestamp() - interval '39 days', null, null),
        (${SUBSTITUTE}::uuid, ${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid,
         ${id(213)}::uuid, ${id(212)}::uuid, 'substitute', 'active', clock_timestamp() - interval '1 day',
         (clock_timestamp() + interval '10 days')::date, clock_timestamp())`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'relationship_training', 9152, 'draft', null)`
    // IX-06: contributing is offered only where the published version admits it.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      values (${id(301)}::uuid, 'execution.correction_proposals', '*', 'training', 'contribute')`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp() where id = ${id(301)}::uuid`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'proposal-race@example.test', extensions.digest('proposal-race-token', 'sha256'), 1,
        extensions.digest('proposal-race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Proposal race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${id(301)}::uuid, 'relationship_training',
        'contribute', 'Read and correct the training', '{"title":"Training"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(611)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${id(612)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'relationship_training', ${id(611)}::uuid, 'contribute',
        'Read and correct the training')`
    await tx`insert into execution.executed_sessions (id, person_id, activity_type_id,
        result_contract_id, contract_version, is_autonomous, context_relationship_id,
        context_organization_id, started_at, ended_at, timezone, execution_status,
        validation_status, requested_level, achieved_level, capture_source)
      values (${SESSION}::uuid, ${CLIENT}::uuid, '019c0000-0000-7000-8000-000000000011',
        '019c0000-0000-7000-8000-000000000031', 1, false, ${RELATIONSHIP}::uuid,
        ${ORGANIZATION}::uuid, clock_timestamp() - interval '1 day',
        clock_timestamp() - interval '23 hours', 'America/Bogota', 'completed', 'valid',
        'detailed', 'detailed', 'manual')`
    await tx`insert into execution.strength_sets (
        id, executed_session_id, set_order, achieved_reps, load_value, load_unit_code, kind)
      values (${SET}::uuid, ${SESSION}::uuid, 1, 8, 60, 'kg', 'normal')`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      first.end({ timeout: 1 }),
      second.end({ timeout: 1 }),
    ])
  }
})

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function propose(tx: Transaction, coach: string, command: string, load: number) {
  await actAs(tx, coach)
  return tx`select * from execution.propose_correction(
    ${coach}::uuid, ${ORGANIZATION}::uuid, ${CLIENT}::uuid, ${SESSION}::uuid, 1, 'load',
    ${load}::numeric, 'kg', 'La barra pesaba más.', ${command}::uuid, ${command}::uuid,
    extensions.digest(${command} || ${load}::text, 'sha256'))`
}

async function correct(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from execution.revise_execution(
    ${CLIENT}::uuid, ${SESSION}::uuid, 0,
    '[{"family": "strength", "set_order": 1, "achieved_reps": 8, "load_value": 61, "load_unit_code": "kg"}]'::jsonb,
    null, clock_timestamp() - interval '1 day', clock_timestamp() - interval '23 hours',
    ${key(901)}::uuid, ${key(901)}::uuid, extensions.digest('she-corrects', 'sha256'))`
}

async function accept(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from execution.decide_correction_proposal(
    ${CLIENT}::uuid, ${PROPOSAL}::uuid, 'accept', ${key(902)}::uuid, ${key(902)}::uuid,
    extensions.digest('she-accepts', 'sha256'))`
}

async function sweep(tx: Transaction) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'worker', true)`
  const [row] = await tx<{ expired: number }[]>`
    select execution.expire_correction_proposals(100) as expired`
  return row?.expired
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(903)}::uuid, ${key(903)}::uuid, extensions.digest('terminate', 'sha256'))`
}

// Written by the fixture, already pending: its thirty days end a few seconds from now.
async function pendingProposal(secondsLeft: number) {
  await admin`insert into execution.correction_proposals (
      id, person_id, relationship_id, organization_id, proposer_assignment_id,
      proposer_membership_id, executed_session_id, target_strength_set_id, set_order, target_field,
      current_value, current_unit_code, proposed_value, proposed_unit_code, reason, created_at, expires_at)
    select ${PROPOSAL}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
      ${HOLDER}::uuid, ${id(212)}::uuid, ${SESSION}::uuid, ${SET}::uuid, 1, 'load', 60, 'kg',
      62.5, 'kg', 'La barra pesaba más.', at - interval '30 days', at
    from (select clock_timestamp() + make_interval(secs => ${secondsLeft}) as at) as due`
}

const pause = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))
const failure = (error: unknown) => error

async function proposals() {
  return admin<{ id: string; status: string; cancel_reason: string | null; current: string }[]>`
    select id::text, status::text, cancel_reason, current_value::text as current
    from execution.correction_proposals where person_id = ${CLIENT}::uuid order by created_at`
}

test('a proposal arriving while she corrects the session lands on what she corrected', async () => {
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await correct(tx)
    proposing = second.begin((tx2) => propose(tx2, COACH, PROPOSAL, 62.5)).catch(failure)
    await pause()
  })
  await proposing

  const [set] = await admin<{ id: string }[]>`
    select id::text from execution.strength_sets where executed_session_id = ${SESSION}::uuid`
  const [target] = await admin<{ target: string }[]>`
    select target_strength_set_id::text as target from execution.correction_proposals
    where id = ${PROPOSAL}::uuid`
  expect(await proposals()).toEqual([
    { id: PROPOSAL, status: 'pending', cancel_reason: null, current: '61' },
  ])
  expect(target?.target).toBe(set?.id)
  expect(set?.id).not.toBe(SET)
})

test('her correction committing after a proposal cancels it, rather than leaving it on a set that is gone', async () => {
  let correcting: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, PROPOSAL, 62.5)
    correcting = second.begin(correct).catch(failure)
    await pause()
  })
  await correcting

  expect(await proposals()).toEqual([
    { id: PROPOSAL, status: 'cancelled', cancel_reason: 'target_changed', current: '60' },
  ])
})

test('two professionals proposing on the same field leave one proposal, and the other is told', async () => {
  let other: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, PROPOSAL, 62.5)
    other = second.begin((tx2) => propose(tx2, COVER, OTHER, 65)).catch(failure)
    await pause()
  })

  expect(await other).toMatchObject({ code: '23505' })
  expect(await proposals()).toEqual([
    { id: PROPOSAL, status: 'pending', cancel_reason: null, current: '60' },
  ])
})

test('her decision made before the thirty days end wins over the sweep that runs after', async () => {
  await pendingProposal(1)
  let swept: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await accept(tx)
    await pause(1500)
    swept = second.begin(sweep).catch(failure)
    await pause()
  })

  expect(await swept).toBe(0)
  expect(await proposals()).toEqual([
    { id: PROPOSAL, status: 'accepted', cancel_reason: null, current: '60' },
  ])
  const [set] = await admin<{ load: string }[]>`
    select load_value::text as load from execution.strength_sets where id = ${SET}::uuid`
  expect(set?.load).toBe('62.5')
})

test('a decision arriving while the termination commits finds the proposal cancelled', async () => {
  await pendingProposal(3600)
  let accepting: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await terminate(tx)
    accepting = second.begin(accept).catch(failure)
    await pause()
  })

  expect(await accepting).toMatchObject({ code: '55000', detail: 'cancelled' })
  expect(await proposals()).toEqual([
    { id: PROPOSAL, status: 'cancelled', cancel_reason: 'relationship_terminated', current: '60' },
  ])
  const [set] = await admin<{ load: string }[]>`
    select load_value::text as load from execution.strength_sets where id = ${SET}::uuid`
  expect(set?.load).toBe('60')
})

test('a proposal arriving while the termination commits is refused as after it', async () => {
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await terminate(tx)
    proposing = second.begin((tx2) => propose(tx2, COACH, PROPOSAL, 62.5)).catch(failure)
    await pause()
  })

  expect(await proposing).toMatchObject({ code: 'P0002', message: 'client not found' })
  expect(await proposals()).toEqual([])
})
