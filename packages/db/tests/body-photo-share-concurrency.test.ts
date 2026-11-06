import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-SP-025 criterion 4 against itself, OP-REL-008 and OP-IDN-057. Two shows of the same
// photo to the same gym leave one share, announced once; a show arriving while the gym
// lets her go finds it gone; a show arriving while she deletes the photo finds no photo.
// Fixtures are committed so independent sessions see them; every command commits too.
const id = (n: number) => `019f4a01-0000-7000-8000-${String(n).padStart(12, '0')}`
const key = (n: number) => `019f4a01-0000-4000-8000-${String(n).padStart(12, '0')}`
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
const other = postgres(options)
type Transaction = postgres.TransactionSql

const CLIENT = id(1)
const OWNER = id(11)
const ORGANIZATION = id(101)
const RELATIONSHIP = id(701)
const PHOTO = id(901)
const COMMANDS = [key(902), key(903), key(904), key(905), key(906)]

async function cleanup() {
  await admin.begin(async (tx) => {
    // Commands leave append-only history behind; only this fixture is removed past it.
    await tx`set local session_replication_role = replica`
    await tx`delete from system.idempotency_keys where command_id = any(${COMMANDS}::uuid[])`
    await tx`delete from system.outbox_events where aggregate_id = ${RELATIONSHIP}::uuid
      or aggregate_id in (select id from identity.body_photo_shares where person_id = ${CLIENT}::uuid)
      or payload ->> 'body_photo_id' = ${PHOTO}`
    await tx`delete from identity.body_photo_shares where person_id = ${CLIENT}::uuid`
    await tx`delete from identity.body_photo_disposals where person_id = ${CLIENT}::uuid`
    await tx`delete from identity.body_photos where person_id = ${CLIENT}::uuid`
    await tx`delete from identity.body_photo_days where person_id = ${CLIENT}::uuid`
    await tx`delete from relationships.relationship_termination_requests
      where relationship_id = ${RELATIONSHIP}::uuid`
    await tx`delete from relationships.service_relationships where id = ${RELATIONSHIP}::uuid`
    await tx`delete from organizations.membership_events where membership_id = ${id(211)}::uuid`
    await tx`delete from organizations.membership_roles where membership_id = ${id(211)}::uuid`
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
    await tx`insert into identity.people (id, given_name, family_name, contact_email) values
      (${CLIENT}::uuid, 'Race', 'Client', null),
      (${OWNER}::uuid, 'Race', 'Owner', null)`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'gym', 'Photo race',
      '{"party_kind":"legal_entity","party_name":"Photo race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id)
      values (${id(211)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code)
      values (${id(211)}::uuid, 'owner')`
    await tx`insert into relationships.service_relationships
        (id, person_id, organization_id, status, started_at)
      values (${RELATIONSHIP}::uuid, ${CLIENT}::uuid, ${ORGANIZATION}::uuid, 'active',
        clock_timestamp() - interval '30 days')`
    await tx`insert into identity.body_photos (id, person_id, taken_on, media_ref)
      values (${PHOTO}::uuid, ${CLIENT}::uuid, current_date, ${`body/${CLIENT}/race.jpg`})`
  })
})

afterAll(async () => {
  try {
    await cleanup()
  } finally {
    await Promise.all([
      admin.end({ timeout: 1 }),
      client.end({ timeout: 1 }),
      other.end({ timeout: 1 }),
    ])
  }
})

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function share(tx: Transaction, n: number) {
  await actAs(tx, CLIENT)
  return tx`select * from identity.share_body_photo(
    ${CLIENT}::uuid, ${PHOTO}::uuid, ${RELATIONSHIP}::uuid,
    ${key(n)}::uuid, ${key(n)}::uuid, extensions.digest(${`share-${n}`}, 'sha256'))`
}

async function terminate(tx: Transaction) {
  await actAs(tx, OWNER)
  return tx`select * from relationships.terminate_relationship(
    ${OWNER}::uuid, ${ORGANIZATION}::uuid, ${RELATIONSHIP}::uuid, null,
    ${key(904)}::uuid, ${key(904)}::uuid, extensions.digest('terminate', 'sha256'))`
}

async function deletePhoto(tx: Transaction) {
  await actAs(tx, CLIENT)
  return tx`select identity.delete_my_body_photo(
    ${CLIENT}::uuid, ${PHOTO}::uuid,
    ${key(905)}::uuid, ${key(905)}::uuid, extensions.digest('delete', 'sha256'))`
}

async function sqlState(work: Promise<unknown> | undefined) {
  try {
    await work
    return 'no error'
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error ? error.code : 'unknown'
  }
}

async function shares() {
  const [state] = await admin<{ shares: number; events: number }[]>`
    select (select count(*)::int from identity.body_photo_shares
             where body_photo_id = ${PHOTO}::uuid) as shares,
           (select count(*)::int from system.outbox_events
             where event_type = 'identity.body_photo_shared.v1'
               and payload ->> 'body_photo_id' = ${PHOTO}) as events`
  return state
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 200))

test('two shows of the same photo to the same gym leave one share, announced once', async () => {
  let second: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await share(tx, 902)
    second = other.begin((tx2) => share(tx2, 903))
    await pause()
  })

  expect(await sqlState(second)).toBe('no error')
  expect(await shares()).toEqual({ shares: 1, events: 1 })
})

test('a show arriving while the gym lets her go finds the relationship ended', async () => {
  let showing: Promise<unknown> | undefined
  await other.begin(async (tx) => {
    await terminate(tx)
    showing = client.begin((tx2) => share(tx2, 902))
    await pause()
  })

  expect(await sqlState(showing)).toBe('55000')
  expect(await shares()).toEqual({ shares: 0, events: 0 })
})

test('a show arriving while she deletes the photo finds no photo, and leaves no share behind', async () => {
  let showing: Promise<unknown> | undefined
  await other.begin(async (tx) => {
    await deletePhoto(tx)
    showing = client.begin((tx2) => share(tx2, 902))
    await pause()
  })

  expect(await sqlState(showing)).toBe('P0002')
  expect(await shares()).toEqual({ shares: 0, events: 0 })
})

test('a deletion arriving while the show commits waits for it, and takes the share with it', async () => {
  let deleting: Promise<unknown> | undefined
  await client.begin(async (tx) => {
    await share(tx, 902)
    deleting = other.begin(deletePhoto)
    await pause()
  })

  expect(await sqlState(deleting)).toBe('no error')
  expect((await shares())?.shares).toBe(0)
})
