/**
 * Support resending a client invitation while the person accepts it (OP-IDN-051, OP-IDN-009).
 *
 * Accepting locks the invitation and then the gym, as issuing does. The Backoffice resend
 * locked the gym first and then the invitation, so the two could each hold what the other
 * waits for and PostgreSQL would abort one of them as a deadlock.
 *
 * The probe stands in for an acceptance that already holds the invitation: while the real
 * resend waits for that invitation, the probe asks for the gym. A resend that took the gym
 * first holds it there, which is exactly the half of the deadlock this file refuses.
 *
 * The resend is rolled back, so it leaves nothing behind. The fixture is history that
 * refuses deletion in places; the cleanup lifts those guards as their owner, only to
 * remove its own rows, and runs inside the test as well as after it.
 */

import { afterAll, beforeAll, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

// Dedicated namespace, fixed so that a run killed half way is cleaned by the next one.
const id = (n: number) => `019d1800-0000-7000-8000-${String(n).padStart(12, '0')}`
const run = 'lockorder'
const OWNER = id(1)
const SUPPORT = id(2)
const GRANTOR = id(3)
const ACCOUNT = id(21)
const SESSION = id(41)
const GYM = id(101)
const MEMBERSHIP = id(201)
const SCOPE = id(401)
const PEOPLE = [OWNER, SUPPORT, GRANTOR]
const CONTACT = `resend.${run}@example.test`

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
const probe = postgres(options)
const support = postgres(options)

const GUARDED = [
  'support.platform_role_assignments',
  'support.platform_duty_assignments',
  'privacy.scope_definitions',
  'privacy.scope_resource_rules',
] as const

let invitationId = ''

async function cleanup() {
  await admin.begin(async (tx) => {
    // Only the owner lifts the guards; the rows are removed as postgres, past row security.
    await tx`set local role allfit_owner`
    for (const table of GUARDED) await tx.unsafe(`alter table ${table} disable trigger user`)
    await tx`reset role`
    await tx`set constraints all deferred`
    await tx`delete from system.outbox_events where aggregate_id in (
      select id from identity.invitations where organization_id = ${GYM}::uuid)`
    await tx`delete from privacy.invitation_scope_options where invitation_intent_id in (
      select intent.id from identity.invitation_intents as intent
      join identity.invitations as invitation on invitation.id = intent.invitation_id
      where invitation.organization_id = ${GYM}::uuid)`
    await tx`delete from identity.invitation_intents where invitation_id in (
      select id from identity.invitations where organization_id = ${GYM}::uuid)`
    await tx`delete from identity.invitations where organization_id = ${GYM}::uuid`
    await tx`delete from privacy.scope_resource_rules where scope_definition_id = ${SCOPE}::uuid`
    await tx`delete from privacy.scope_definitions where id = ${SCOPE}::uuid`
    // The role brings every duty as a row of its own (ADR-046); those go with it.
    await tx`delete from system.outbox_events where aggregate_type = 'platform_duty_assignment'
      and aggregate_id in (select id from support.platform_duty_assignments
        where person_id = ${SUPPORT}::uuid)`
    await tx`delete from support.platform_duty_assignments where person_id = ${SUPPORT}::uuid`
    await tx`delete from support.platform_role_assignments where person_id = ${SUPPORT}::uuid`
    await tx`set local role allfit_owner`
    for (const table of GUARDED) await tx.unsafe(`alter table ${table} enable trigger user`)
    await tx`reset role`
    await tx`delete from identity.access_sessions where id = ${SESSION}::uuid`
    await tx`delete from identity.access_accounts where id = ${ACCOUNT}::uuid`
    await tx`delete from organizations.membership_events where membership_id = ${MEMBERSHIP}::uuid`
    await tx`delete from organizations.membership_roles where membership_id = ${MEMBERSHIP}::uuid`
    await tx`delete from organizations.organization_memberships where id = ${MEMBERSHIP}::uuid`
    await tx`delete from organizations.organizations where id = ${GYM}::uuid`
    await tx`delete from system.idempotency_keys where principal_fingerprint in (
      select extensions.digest(convert_to(person::text, 'UTF8'), 'sha256')
      from unnest(${PEOPLE}::uuid[]) as person)`
    await tx`delete from identity.people where id in ${admin(PEOPLE)}`
  })
}

beforeAll(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`set local role allfit_owner`
    await tx`set constraints all deferred`
    await tx`insert into identity.people (id, given_name, family_name, status) values
      (${OWNER}::uuid, 'Resend', 'Owner', 'active'),
      (${SUPPORT}::uuid, 'Resend', 'Support', 'active'),
      (${GRANTOR}::uuid, 'Resend', 'Grantor', 'active')`
    await tx`insert into identity.access_accounts (id, provider, issuer, subject, person_id)
      values (${ACCOUNT}::uuid, 'workos', 'https://issuer.test', ${`resend_${run}`}, ${SUPPORT}::uuid)`
    await tx`insert into identity.access_sessions (
        id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
        access_token_expires_at, assurance_level, authentication_method,
        assurance_verified_at, last_activity_at, absolute_expires_at
      ) values (
        ${SESSION}::uuid, ${ACCOUNT}::uuid, ${`sid_${run}`}, 'backoffice',
        extensions.digest(${`session_${run}`}, 'sha256'), ${`v1.${run}`},
        clock_timestamp() + interval '5 minutes', 2, 'password_totp',
        clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '8 hours')`
    // The role brings `diagnose_support_metadata` with every other duty (ADR-046).
    await tx`insert into support.platform_role_assignments (person_id, platform_role, granted_by_person_id)
      values (${SUPPORT}::uuid, 'allfit_admin', ${GRANTOR}::uuid)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${GYM}::uuid, 'gym', 'Resend race',
      '{"party_kind":"legal_entity","party_name":"Resend race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
      values (${MEMBERSHIP}::uuid, ${GYM}::uuid, ${OWNER}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code)
      values (${MEMBERSHIP}::uuid, 'owner')`
    await tx`reset role`
    // A version no database test uses, so a row left behind could not collide with one.
    await tx`insert into privacy.scope_definitions (id, scope_code, version_number, status, published_at)
      values (${SCOPE}::uuid, 'relationship_training', 9001, 'draft', null)`
    // IX-06: contributing is offered only where the published version admits it.
    await tx`insert into privacy.scope_resource_rules
        (scope_definition_id, resource, field, data_classification_code, max_action)
      values (${SCOPE}::uuid, 'planning.program_assignments', '*', 'training', 'contribute')`
    await tx`update privacy.scope_definitions
      set status = 'published', published_at = clock_timestamp() where id = ${SCOPE}::uuid`
  })
  const [issued] = await admin.begin(async (tx) => {
    await tx`set local role allfit_api`
    await tx`select set_config('app.actor_kind', 'person', true),
      set_config('app.actor_person_id', ${OWNER}, true),
      set_config('app.request_id', ${randomUUID()}, true)`
    return tx`select invitation_id from identity.issue_client_invitation(
      ${OWNER}::uuid, ${GYM}::uuid, 'email', ${CONTACT},
      '[{"scope_code":"relationship_training","access_level":"contribute","purpose":"Entrenar",
         "presented_snapshot":{"title":"Entrenamiento"}}]'::jsonb,
      extensions.digest(${CONTACT}, 'sha256'), 1::smallint,
      ${randomUUID()}::uuid, extensions.uuid_generate_v7(),
      extensions.digest(${`issue_${run}`}, 'sha256'))`
  })
  invitationId = String(issued?.invitation_id)
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      probe.end({ timeout: 1 }),
      support.end({ timeout: 1 }),
    ])
  }
})

class Rollback extends Error {}

/** Resolves once another session waits on a lock, or after two seconds if none ever does. */
async function untilSomebodyWaits(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const [row] = await admin`select count(*)::int as waiting from pg_locks where not granted`
    if ((row?.waiting ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('a resend waiting on an invitation being accepted does not hold the gym', async () => {
  try {
    let resend: Promise<string> = Promise.resolve('not started')
    const reached = await probe
      .begin(async (accepting) => {
        await accepting`select id from identity.invitations where id = ${invitationId}::uuid for update`
        resend = support
          .begin(async (tx) => {
            await tx`set local role allfit_api`
            await tx`select set_config('app.actor_kind', 'support', true),
              set_config('app.actor_person_id', ${SUPPORT}, true),
              set_config('app.actor_session_id', ${SESSION}, true),
              set_config('app.request_id', ${randomUUID()}, true)`
            await tx`select * from identity.resend_client_invitation(
              ${SUPPORT}::uuid, ${SESSION}::uuid, ${GYM}::uuid, ${invitationId}::uuid,
              extensions.digest(${`reissue_${run}`}, 'sha256'), 1::smallint,
              ${randomUUID()}::uuid, extensions.uuid_generate_v7(),
              extensions.digest(${`resend_${run}`}, 'sha256'))`
            throw new Rollback()
          })
          .then(
            () => 'committed',
            (error: unknown) =>
              error instanceof Rollback ? 'resent' : String((error as { code?: unknown }).code),
          )
        await untilSomebodyWaits()
        // What an acceptance asks for next, once it holds the invitation.
        await accepting`set local lock_timeout = '500ms'`
        await accepting`select id from organizations.organizations where id = ${GYM}::uuid for no key update`
        return 'gym taken'
      })
      .catch((error: unknown) => String((error as { code?: unknown }).code))

    expect(reached).toBe('gym taken')
    expect(await resend).toBe('resent')
  } finally {
    await cleanup()
  }
})
