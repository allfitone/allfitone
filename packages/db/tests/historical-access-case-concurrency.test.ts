import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-061 against HU-SP-071. A case opening while the person takes back the last
// permission that froze never outlives it: either the revocation waits and closes the
// case it finds, or the case waits and finds nothing left to open. Fixtures are committed
// so independent sessions see them; every command commits too.
const id = (n: number) => `019f5800-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f5800-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const client = postgres(options)
const owner = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const ORGANIZATION = id(101)
const OWNER_MEMBERSHIP = id(211)
const RELATIONSHIP = id(701)
const SCOPE = id(301)
const GRANT = id(802)
const ACCOUNT = id(901)
const SESSION = id(902)
const COMMANDS = [key(911), key(912)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Cases, receipts and the access record are append-only; only this fixture goes.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = ${GRANT}::uuid
      or aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id in (select id from privacy.historical_access_cases
                          where relationship_id = ${RELATIONSHIP}::uuid)`
    await tx`delete from privacy.access_events where subject_person_id = ${CLIENT}::uuid`
    await tx`delete from privacy.historical_access_cases where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from identity.access_sessions where id = ${SESSION}::uuid`
    await tx`delete from identity.access_accounts where id = ${ACCOUNT}::uuid`
    await tx`delete from privacy.data_grants where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.consent_events where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from privacy.invitation_scope_options where id = ${id(601)}::uuid`
    await tx`delete from identity.invitation_intents where id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(401)}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${SCOPE}::uuid`
    await tx`delete from relationships.service_relationships where id = ${RELATIONSHIP}::uuid`
    await tx`delete from organizations.membership_events where membership_id = ${OWNER_MEMBERSHIP}::uuid`
    await tx`delete from organizations.membership_roles where membership_id = ${OWNER_MEMBERSHIP}::uuid`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people where id in (${CLIENT}::uuid, ${OWNER}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name, status) values
      (${CLIENT}::uuid, 'Race', 'Client', 'active'),
      (${OWNER}::uuid, 'Race', 'Owner', 'active')`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Case race',
      '{"party_kind":"legal_entity","party_name":"Case race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
      values (${OWNER_MEMBERSHIP}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code)
      values (${OWNER_MEMBERSHIP}::uuid, 'owner')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '30 days')`
    // A version number no other fixture uses: scope versions are unique per code.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${SCOPE}::uuid, 'relationship_training', 9581, 'published', clock_timestamp())`
    await tx`insert into identity.invitations (
        id, organization_id, issued_by_membership_id, channel, contact, token_hash,
        token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(401)}::uuid, ${ORGANIZATION}::uuid, ${OWNER_MEMBERSHIP}::uuid, 'email',
        'case-race@example.test', extensions.digest('case-race-token', 'sha256'), 1,
        extensions.digest('case-race-proposal', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Case race","purpose":"studio_operations"}',
        'completed', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(501)}::uuid, ${id(401)}::uuid, 'service_relationship', 'pending')`
    await tx`insert into privacy.invitation_scope_options (
        id, invitation_intent_id, scope_definition_id, scope_code, offered_access_level,
        purpose, presented_snapshot, decision, decided_at)
      values (${id(601)}::uuid, ${id(501)}::uuid, ${SCOPE}::uuid, 'relationship_training',
        'read', 'Follow the training', '{"title":"Training"}'::jsonb, 'accepted',
        clock_timestamp())`
    await tx`insert into privacy.consent_events (
        id, person_id, relationship_id, organization_id, invitation_scope_option_id,
        scope_definition_id, scope_code, decision, presented_snapshot)
      values (${id(801)}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${id(601)}::uuid, ${SCOPE}::uuid, 'relationship_training', 'accepted',
        '{"title":"Training"}'::jsonb)`
    await tx`insert into privacy.data_grants (
        id, person_id, relationship_id, organization_id, scope_definition_id, scope_code,
        consent_event_id, access_level, purpose)
      values (${GRANT}::uuid, ${CLIENT}::uuid, ${RELATIONSHIP}::uuid, ${ORGANIZATION}::uuid,
        ${SCOPE}::uuid, 'relationship_training', ${id(801)}::uuid, 'read', 'Follow the training')`
    // The gym ended it two days ago, and the one permission froze at that instant.
    await tx`select relationships.close_relationship(${RELATIONSHIP}::uuid,
      clock_timestamp() - interval '2 days', 'professional', 'left')`
    await tx`insert into identity.access_accounts (id, provider, issuer, subject, person_id)
      values (${ACCOUNT}::uuid, 'workos', 'https://case-race.test', 'case-race-owner', ${OWNER}::uuid)`
    await tx`insert into identity.access_sessions (
        id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
        access_token_expires_at, authenticated_at)
      values (${SESSION}::uuid, ${ACCOUNT}::uuid, 'case-race-session', 'studio',
        extensions.digest('case-race-session', 'sha256'), 'v1.case-race',
        clock_timestamp() + interval '1 hour', clock_timestamp() - interval '1 minute')`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      client.end({ timeout: 1 }),
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

async function open(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from privacy.open_historical_access_case(
    ${OWNER}::uuid, ${SESSION}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid,
    ${OWNER_MEMBERSHIP}::uuid, 'service_dispute', 'RACE-1', 'She disputes October.', 2,
    ${key(911)}::uuid, ${key(911)}::uuid, extensions.digest('open', 'sha256'))`
}

async function revoke(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select * from privacy.revoke_my_grant(
    ${CLIENT}::uuid, ${GRANT}::uuid, ${key(912)}::uuid, ${key(912)}::uuid,
    extensions.digest('revoke', 'sha256'))`
}

async function cases() {
  return admin<{ status: string; closed_reason: string | null }[]>`
    select status::text, closed_reason from privacy.historical_access_cases
    where relationship_id = ${RELATIONSHIP}::uuid`
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('a revocation arriving while the case opens waits for it, then closes it', async () => {
  let revoking: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await open(tx)
    revoking = client.begin(revoke)
    await pause()
  })
  await revoking

  expect(await cases()).toEqual([{ status: 'closed', closed_reason: 'grant_revoked' }])
})

test('a case arriving while the revocation commits finds nothing frozen, and opens nothing', async () => {
  let opening: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await revoke(tx)
    opening = owner.begin(open)
    await pause()
  })

  const refusal = await opening?.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(refusal).toMatchObject({ code: 'P0004' })
  expect(await cases()).toEqual([])
})
