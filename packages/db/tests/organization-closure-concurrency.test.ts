import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-013 criteria 4 and 6 under concurrency. Dedicated namespace; fixtures are
// committed so independent sessions see them, and the closure itself commits.
const id = (n: number) => `019d1101-0000-7000-8000-${String(n).padStart(12, '0')}`
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
const owner = postgres(options)
const invitee = postgres(options)
type Transaction = postgres.TransactionSql
const INVITED = 'racing-client@example.test'

async function cleanup() {
  await admin.begin(async (tx) => {
    // The closure leaves append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id in (${id(901)}::uuid, ${id(902)}::uuid)`
    await tx`delete from system.outbox_events where aggregate_id in (
      select id from relationships.service_relationships where organization_id = ${id(101)}::uuid)`
    await tx`delete from privacy.data_grants where organization_id = ${id(101)}::uuid`
    await tx`delete from privacy.consent_events where organization_id = ${id(101)}::uuid`
    await tx`delete from relationships.service_relationships where organization_id = ${id(101)}::uuid`
    await tx`delete from identity.invitation_intents where invitation_id = ${id(501)}::uuid`
    await tx`delete from identity.invitations where id = ${id(501)}::uuid`
    await tx`delete from organizations.membership_events where membership_id = ${id(201)}::uuid`
    await tx`delete from organizations.membership_roles where membership_id = ${id(201)}::uuid`
    await tx`delete from organizations.organization_memberships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organization_events where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organizations where id = ${id(101)}::uuid`
    await tx`delete from identity.people where id in (${id(1)}::uuid, ${id(2)}::uuid)`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    await tx`insert into identity.people (id, given_name, family_name, contact_email)
      values (${id(1)}::uuid, 'Race', 'Owner', null), (${id(2)}::uuid, 'Race', 'Client', ${INVITED})`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${id(101)}::uuid, 'gym', 'Closing race',
      '{"party_kind":"legal_entity","party_name":"Closing race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
      values (${id(201)}::uuid, ${id(101)}::uuid, ${id(1)}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code)
      values (${id(201)}::uuid, 'owner')`
    await tx`insert into identity.invitations
        (id, organization_id, issued_by_membership_id, channel, contact, token_hash,
         token_key_version, proposal_hash, responsible_party, status, expires_at)
      values (${id(501)}::uuid, ${id(101)}::uuid, ${id(201)}::uuid, 'email', ${INVITED},
        extensions.digest('closing-race', 'sha256'), 1, extensions.digest('closing-race-p', 'sha256'),
        '{"party_kind":"legal_entity","party_name":"Closing race","purpose":"studio_operations"}',
        'pending', clock_timestamp() + interval '7 days')`
    await tx`insert into identity.invitation_intents (id, invitation_id, kind, status)
      values (${id(502)}::uuid, ${id(501)}::uuid, 'service_relationship', 'pending')`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      owner.end({ timeout: 1 }),
      invitee.end({ timeout: 1 }),
    ])
  }
})

async function close(tx: Transaction) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${id(1)}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
  return tx`select * from organizations.close_organization(
    ${id(1)}::uuid, ${id(101)}::uuid, ${'019d1101-0000-4000-8000-000000000901'}::uuid,
    ${id(901)}::uuid, extensions.digest('close', 'sha256'))`
}

function accept() {
  return invitee.begin(async (tx) => {
    await tx`set local role allfit_api`
    await tx`select set_config('app.actor_kind', 'person', true),
      set_config('app.actor_person_id', ${id(2)}, true),
      set_config('app.actor_verified_email', ${INVITED}, true),
      set_config('app.request_id', gen_random_uuid()::text, true)`
    return tx`select * from identity.decide_client_invitation(
      ${id(2)}::uuid, extensions.digest('closing-race', 'sha256'), ${id(502)}::uuid,
      'accepted', '{}'::jsonb, ${'019d1101-0000-4000-8000-000000000902'}::uuid,
      ${id(902)}::uuid, extensions.digest('accept', 'sha256'))`
  })
}

test('an acceptance racing the closure never leaves a relationship behind it', async () => {
  let acceptance: Promise<unknown> | undefined
  await owner.begin(async (tx) => {
    await close(tx)
    // The acceptance arrives while the closure holds its locks, then waits for it.
    acceptance = accept()
    await new Promise((resolve) => setTimeout(resolve, 200))
  })
  await expect(acceptance).rejects.toMatchObject({ code: '23514' })

  const [state] = await admin`select
      (select status::text from organizations.organizations where id = ${id(101)}::uuid) as organization,
      (select status::text from identity.invitations where id = ${id(501)}::uuid) as invitation,
      (select count(*)::int from relationships.service_relationships
        where organization_id = ${id(101)}::uuid and status = 'active') as live`
  expect(state).toEqual({ organization: 'closed', invitation: 'revoked', live: 0 })
})

test('an acceptance that commits first is ended by the closure behind it', async () => {
  await accept()
  const [row] = await owner.begin(close)
  expect(row?.result.relationships_terminated).toBe(1)

  const [state] = await admin`select
      (select count(*)::int from relationships.service_relationships
        where organization_id = ${id(101)}::uuid and status = 'active') as live,
      (select count(*)::int from organizations.organization_memberships
        where organization_id = ${id(101)}::uuid and status = 'active') as members`
  expect(state).toEqual({ live: 0, members: 0 })
})
