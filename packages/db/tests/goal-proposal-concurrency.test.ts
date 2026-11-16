import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-071 against what else can happen to her goals at the same moment: a colleague
// proposing too, her decision, her own goal, a revocation and the end of the relationship.
// Whichever goes second sees the first: one proposal waits per relationship, numbers never
// collide, and nothing is proposed after a revocation or an end commits. Fixtures are
// committed so independent sessions see them.
const id = (n: number) => `019f6400-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f6400-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const GRANT = id(612)
const EARLIER = id(951)
const LATER = id(952)
const OWN = id(953)
const OWN_AGAIN = id(954)
const VERSIONS = [EARLIER, LATER, OWN, OWN_AGAIN]
const COMMANDS = [...VERSIONS, key(901), key(902), key(903)]
const PEOPLE = [CLIENT, OWNER, COACH, COVER]
const PROFILES = [id(912), id(913)]
const CREDENTIALS = [id(922), id(923)]
const TARGETS = JSON.stringify([
  {
    nutrient_code: 'protein',
    mode: 'minimum',
    minimum: 140,
    maximum: null,
    exact: null,
    unit: 'g',
  },
])

async function cleanup() {
  await admin.begin(async (tx) => {
    // Goal versions, decisions and verifications are append-only; only this fixture goes.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = any(${[
      ...VERSIONS,
      RELATIONSHIP,
      HOLDER,
      SUBSTITUTE,
      GRANT,
    ]}::uuid[])`
    await tx`delete from nutrition.goal_decisions where person_id = ${CLIENT}::uuid`
    await tx`delete from nutrition.goal_targets where goal_version_id in
      (select id from nutrition.goal_versions where person_id = ${CLIENT}::uuid)`
    await tx`delete from nutrition.goal_versions where person_id = ${CLIENT}::uuid`
    await tx`delete from nutrition.goal_sets where person_id = ${CLIENT}::uuid`
    await tx`delete from identity.professional_credential_verifications
      where professional_credential_id = any(${CREDENTIALS}::uuid[])`
    await tx`delete from identity.credential_verification_requests
      where professional_credential_id = any(${CREDENTIALS}::uuid[])`
    await tx`delete from identity.professional_credentials where id = any(${CREDENTIALS}::uuid[])`
    await tx`delete from identity.professional_profiles where id = any(${PROFILES}::uuid[])`
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
    await tx`delete from identity.people where id = any(${PEOPLE}::uuid[])`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${CLIENT}::uuid, 'Race', 'Client', 'goal-race@example.test'),
      (${OWNER}::uuid, 'Race', 'Owner', null),
      (${COACH}::uuid, 'Race', 'Coach', null),
      (${COVER}::uuid, 'Race', 'Cover', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Goal race',
      '{"party_kind":"legal_entity","party_name":"Goal race","purpose":"studio_operations"}')`
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
    // Both coaches hold a nutrition credential staff verified, in force.
    await tx`insert into identity.professional_profiles
        (id, person_id, headline, bio, practice_started_year)
      values (${id(912)}::uuid, ${COACH}::uuid, 'Nutricionista', 'Acompaña.', 2015),
             (${id(913)}::uuid, ${COVER}::uuid, 'Nutricionista', 'Acompaña.', 2016)`
    await tx`insert into identity.professional_credentials
        (id, professional_profile_id, credential_type_code, issuer, name, expires_on, status)
      values (${id(922)}::uuid, ${id(912)}::uuid, 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'active'),
             (${id(923)}::uuid, ${id(913)}::uuid, 'nutrition_professional', 'Colegio', 'Nutricionista', null, 'active')`
    await tx`insert into identity.professional_credential_verifications (
        id, professional_credential_id, verifier_person_id, policy_code, method, source_authority,
        source_jurisdiction, source_reference, source_status, source_checked_at,
        evidence_fingerprint, result, decided_at, valid_from, valid_to)
      select verification, credential, ${OWNER}::uuid, 'v1', 'official_registry_lookup', 'Colegio',
        'CO', 'REF-' || verification, 'active', clock_timestamp() - interval '1 day',
        extensions.digest(verification::text, 'sha256'), 'verified',
        clock_timestamp() - interval '1 day', clock_timestamp() - interval '1 day',
        clock_timestamp() + interval '180 days'
      from (values (${id(932)}::uuid, ${id(922)}::uuid), (${id(933)}::uuid, ${id(923)}::uuid))
        as pairs (verification, credential)`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${id(301)}::uuid, 'nutrition_guidance', 9164, 'draft', null)`
    // IX-06: proposing is offered only where the published version admits contributing.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      values
        (${id(301)}::uuid, 'nutrition.goal_sets', '*', 'nutrition', 'contribute'),
        (${id(301)}::uuid, 'nutrition.goal_versions', '*', 'nutrition', 'contribute'),
        (${id(301)}::uuid, 'nutrition.goal_targets', '*', 'nutrition', 'contribute'),
        (${id(301)}::uuid, 'nutrition.goal_decisions', '*', 'nutrition', 'read')`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp() where id = ${id(301)}::uuid`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${id(211)}::uuid, 'email',
        'goal-race@example.test', extensions.digest('goal-race-token', 'sha256'), 1,
        extensions.digest('goal-race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Goal race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${id(301)}::uuid, 'nutrition_guidance',
        'contribute', 'Guide her goals', '{"title":"Guidance"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(611)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${id(301)}::uuid, 'nutrition_guidance', 'accepted',
        '{"title":"Guidance"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${GRANT}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(301)}::uuid, 'nutrition_guidance', ${id(611)}::uuid, 'contribute', 'Guide her goals')`
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

async function propose(tx: Transaction, coach: string, command: string) {
  await actAs(tx, coach)
  return tx`select * from nutrition.propose_goal_version(
    ${coach}::uuid, ${ORGANIZATION}::uuid, ${CLIENT}::uuid, 'Para tu fase de definición',
    ${TARGETS}::text::jsonb, ${command}::uuid, ${command}::uuid,
    extensions.digest(${command}, 'sha256'))`
}

async function decide(tx: Transaction, version: string) {
  await actAs(tx, CLIENT)
  return tx`select * from nutrition.decide_goal_version(
    ${CLIENT}::uuid, ${version}::uuid, 'accepted', ${key(901)}::uuid, ${key(901)}::uuid,
    extensions.digest('she-decides', 'sha256'))`
}

async function publishOwn(tx: Transaction, command = OWN) {
  await actAs(tx, CLIENT)
  return tx`select * from nutrition.publish_self_goal_version(
    ${CLIENT}::uuid, null, ${TARGETS}::text::jsonb, ${command}::uuid, ${command}::uuid,
    extensions.digest(${command}, 'sha256'))`
}

async function revoke(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from privacy.revoke_my_grant(
    ${CLIENT}::uuid, ${GRANT}::uuid, ${key(902)}::uuid, ${key(902)}::uuid,
    extensions.digest('she-revokes', 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(903)}::uuid, ${key(903)}::uuid, extensions.digest('terminate', 'sha256'))`
}

const pause = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms))
const failure = (error: unknown) => error

async function versions() {
  return admin<{ id: string; number: number; status: string; cancelled: boolean }[]>`
    select id::text, version_number as number, status::text, cancelled_at is not null as cancelled
    from nutrition.goal_versions where person_id = ${CLIENT}::uuid order by version_number`
}

test('a colleague proposing at the same moment numbers after the first and replaces it', async () => {
  let other: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, EARLIER)
    other = second.begin((tx2) => propose(tx2, COVER, LATER)).catch(failure)
    await pause()
  })

  expect(await other).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: EARLIER, number: 1, status: 'superseded', cancelled: false },
    { id: LATER, number: 2, status: 'proposed', cancelled: false },
  ])
})

// With her own goal kept, nothing new is inserted to make the second wait: the lock does.
test('two colleagues proposing over a goal she already keeps still number apart', async () => {
  await first.begin((tx) => publishOwn(tx))
  let other: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, EARLIER)
    other = second.begin((tx2) => propose(tx2, COVER, LATER)).catch(failure)
    await pause()
  })

  expect(await other).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: OWN, number: 1, status: 'active', cancelled: false },
    { id: EARLIER, number: 2, status: 'superseded', cancelled: false },
    { id: LATER, number: 3, status: 'proposed', cancelled: false },
  ])
})

// Her goal set already exists, so only the lock keeps a proposal from numbering beside it.
test('a proposal arriving while she publishes another goal of her own numbers after it', async () => {
  await first.begin((tx) => publishOwn(tx))
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await publishOwn(tx, OWN_AGAIN)
    proposing = second.begin((tx2) => propose(tx2, COACH, EARLIER)).catch(failure)
    await pause()
  })

  expect(await proposing).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: OWN, number: 1, status: 'superseded', cancelled: false },
    { id: OWN_AGAIN, number: 2, status: 'active', cancelled: false },
    { id: EARLIER, number: 3, status: 'proposed', cancelled: false },
  ])
})

// Deciding and her own goals lock the set first; a proposal numbers only once it holds it.
test('a proposal waits for her goal set before it numbers anything', async () => {
  await first.begin((tx) => publishOwn(tx))
  const [backend] = await second<{ pid: number }[]>`select pg_backend_pid() as pid`
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await tx`select 1 from nutrition.goal_sets where person_id = ${CLIENT}::uuid for update`
    proposing = second.begin((tx2) => propose(tx2, COACH, EARLIER)).catch(failure)
    await pause()
    const [state] = await admin<{ waiting: string | null; numbering: boolean }[]>`
      select activity.wait_event_type as waiting, exists (
          select 1 from pg_locks as held
          where held.pid = activity.pid
            and held.relation = 'nutrition.goal_versions'::regclass
            and held.mode = 'RowExclusiveLock') as numbering
      from pg_stat_activity as activity where activity.pid = ${backend?.pid ?? 0}`
    expect(state).toEqual({ waiting: 'Lock', numbering: false })
  })

  expect(await proposing).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: OWN, number: 1, status: 'active', cancelled: false },
    { id: EARLIER, number: 2, status: 'proposed', cancelled: false },
  ])
})

test('her decision arriving while a new proposal commits finds the earlier one replaced', async () => {
  await first.begin((tx) => propose(tx, COACH, EARLIER))
  let deciding: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, LATER)
    deciding = second.begin((tx2) => decide(tx2, EARLIER)).catch(failure)
    await pause()
  })

  expect(await deciding).toMatchObject({ code: '23514' })
  expect(await versions()).toEqual([
    { id: EARLIER, number: 1, status: 'superseded', cancelled: false },
    { id: LATER, number: 2, status: 'proposed', cancelled: false },
  ])
})

test('a proposal arriving while she accepts the earlier one leaves her choice active', async () => {
  await first.begin((tx) => propose(tx, COACH, EARLIER))
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await decide(tx, EARLIER)
    proposing = second.begin((tx2) => propose(tx2, COACH, LATER)).catch(failure)
    await pause()
  })

  expect(await proposing).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: EARLIER, number: 1, status: 'active', cancelled: false },
    { id: LATER, number: 2, status: 'proposed', cancelled: false },
  ])
})

test('her own goal published while a proposal commits takes the next number', async () => {
  let publishing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, EARLIER)
    publishing = second.begin((tx2) => publishOwn(tx2)).catch(failure)
    await pause()
  })

  expect(await publishing).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: EARLIER, number: 1, status: 'proposed', cancelled: false },
    { id: OWN, number: 2, status: 'active', cancelled: false },
  ])
})

test('a proposal arriving while she revokes the grant is refused as after it', async () => {
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await revoke(tx)
    proposing = second.begin((tx2) => propose(tx2, COACH, EARLIER)).catch(failure)
    await pause()
  })

  expect(await proposing).toMatchObject({ code: 'AF430', detail: 'nutrition_guidance:contribute' })
  expect(await versions()).toEqual([])
})

test('a proposal arriving while the relationship ends is refused as after it', async () => {
  let proposing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await terminate(tx)
    proposing = second.begin((tx2) => propose(tx2, COACH, EARLIER)).catch(failure)
    await pause()
  })

  expect(await proposing).toMatchObject({ code: 'P0002', message: 'client not found' })
  expect(await versions()).toEqual([])
})

test('the end committing after a proposal cancels it, rather than leaving it waiting', async () => {
  let ending: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await propose(tx, COACH, EARLIER)
    ending = second.begin(terminate).catch(failure)
    await pause()
  })

  expect(await ending).not.toBeInstanceOf(Error)
  expect(await versions()).toEqual([
    { id: EARLIER, number: 1, status: 'cancelled', cancelled: true },
  ])
})
