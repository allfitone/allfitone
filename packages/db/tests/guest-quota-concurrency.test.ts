import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-087 criterion 6. Dedicated namespace; fixtures are committed so independent sessions see them.
const id = (n: number) => `019d1581-0000-7000-8000-${String(n).padStart(12, '0')}`
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

async function cleanup() {
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    await tx`update organizations.organizations set status = 'closed' where id = ${id(101)}::uuid`
    await tx`delete from system.outbox_events where payload->>'organization_id' = ${id(101)}`
    await tx`delete from system.idempotency_keys where command_id in (${id(901)}::uuid, ${id(902)}::uuid)`
    await tx`delete from privacy.invitation_scope_options where invitation_intent_id in (
      select intent.id from identity.invitation_intents intent
      join identity.invitations invitation on invitation.id = intent.invitation_id
      where invitation.organization_id = ${id(101)}::uuid)`
    await tx`delete from identity.invitation_intents where invitation_id in (
      select id from identity.invitations where organization_id = ${id(101)}::uuid)`
    await tx`delete from identity.invitations where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.membership_roles where membership_id = ${id(201)}::uuid`
    await tx`delete from organizations.organization_memberships where organization_id = ${id(101)}::uuid`
    await tx`delete from organizations.organizations where id = ${id(101)}::uuid`
    // Scope definitions are immutable by trigger; this fixture is the only row removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from privacy.scope_resource_rules where scope_definition_id = ${id(401)}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${id(401)}::uuid`
    await tx`delete from identity.people where id = ${id(1)}::uuid`
  })
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set constraints all deferred`
    await tx`insert into identity.people (id, given_name, family_name)
      values (${id(1)}::uuid, 'Race', 'Owner')`
    await tx`insert into organizations.organizations
        (id, type_code, display_name, responsible_party, guest_quota_seats)
      values (${id(101)}::uuid, 'gym', 'Quota race',
      '{"party_kind":"legal_entity","party_name":"Quota race","purpose":"studio_operations"}', 1)`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
      values (${id(201)}::uuid, ${id(101)}::uuid, ${id(1)}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code)
      values (${id(201)}::uuid, 'owner')`
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      select ${id(401)}::uuid, 'relationship_training', 1, 'draft', null
      where not exists (select 1 from privacy.scope_definitions
        where scope_code = 'relationship_training' and status = 'published')`
    // IX-06: contributing is offered only where the published version admits it.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      select id, 'planning.program_assignments', '*', 'training', 'contribute'
      from privacy.scope_definitions where id = ${id(401)}::uuid and status = 'draft'`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp()
      where id = ${id(401)}::uuid and status = 'draft'`
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

function invite(contact: string, command: number) {
  return async (tx: Transaction) => {
    await tx`set local role allfit_api`
    await tx`select set_config('app.actor_kind', 'person', true),
      set_config('app.actor_person_id', ${id(1)}, true),
      set_config('app.request_id', gen_random_uuid()::text, true)`
    return tx`select * from identity.issue_client_invitation(
      ${id(1)}::uuid, ${id(101)}::uuid, 'email', ${contact},
      '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
         "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
      extensions.digest(${contact}, 'sha256'), 1::smallint,
      ${`019d1581-0000-4000-8000-${String(command).padStart(12, '0')}`}::uuid,
      ${id(command)}::uuid, extensions.digest(${contact}, 'sha256'))`
  }
}

test('two invitations racing for the last place: only one is written', async () => {
  await first.begin(async (winner) => {
    await invite('first@example.test', 901)(winner)
    await expect(second.begin(invite('second@example.test', 902))).rejects.toMatchObject({
      code: '55P03',
    })
  })
  await expect(second.begin(invite('second@example.test', 902))).rejects.toMatchObject({
    code: 'AF409',
  })
  const [row] = await admin`select count(*)::int as invitations from identity.invitations
    where organization_id = ${id(101)}::uuid`
  expect(row?.invitations).toBe(1)
})
