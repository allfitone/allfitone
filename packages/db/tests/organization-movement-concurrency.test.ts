import { afterAll, beforeEach, expect, test } from 'bun:test'
import postgres from 'postgres'

// HU-STUDIO-064 and HU-STUDIO-065 against what can happen to the same movement at the
// same moment: a version published with it, a colleague creating the same name, a
// colleague editing the same revision. Whichever goes second sees the first. Fixtures are
// committed so independent sessions see them.
const id = (n: number) => `019f5706-0000-7000-8000-${String(n).padStart(12, '0')}`
const command = (n: number) => `019f5706-0000-7000-8000-${String(900 + n).padStart(12, '0')}`
const key = (n: number) => `019f5706-0000-4000-8000-${String(900 + n).padStart(12, '0')}`
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

const OWNER = id(1)
const COACH = id(2)
const ORGANIZATION = id(101)
const MOVEMENT = command(1)
const STRENGTH = '019c0000-0000-7000-8000-000000000011'

async function cleanup() {
  await admin.begin(async (tx) => {
    // Published versions and revisions are append-only; only this fixture goes past that.
    await tx`set local session_replication_role = replica`
    await tx`create temporary table doomed on commit drop as
      select template.id as template_id, version.id as version_id
      from planning.session_templates as template
      left join planning.session_template_versions as version on version.template_id = template.id
      where template.owner_organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from system.outbox_events where aggregate_id in (
        select template_id from doomed union select version_id from doomed
        union select id from catalog.movements where owner_organization_id = ${ORGANIZATION}::uuid)`
    // Replica mode skips the cascades too, so the steps go by hand.
    await tx`delete from planning.strength_targets where planned_step_id in (
        select step.id from planning.planned_steps as step
        where step.template_version_id in (select version_id from doomed))`
    await tx`delete from planning.planned_sets where planned_step_id in (
        select step.id from planning.planned_steps as step
        where step.template_version_id in (select version_id from doomed))`
    await tx`delete from planning.planned_steps
      where template_version_id in (select version_id from doomed)`
    await tx`delete from planning.session_template_versions
      where id in (select version_id from doomed)`
    await tx`delete from catalog.movement_revisions where organization_id = ${ORGANIZATION}::uuid`
  })
  await admin.begin(async (tx) => {
    await tx`delete from system.idempotency_keys where command_id between ${command(1)}::uuid
      and ${command(99)}::uuid`
    await tx`delete from planning.session_template_drafts where template_id in (
        select id from planning.session_templates where owner_organization_id = ${ORGANIZATION}::uuid)`
    await tx`delete from planning.session_templates where owner_organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from catalog.movements where owner_organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.membership_events
      where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.membership_roles
      where membership_id in (${id(201)}::uuid, ${id(202)}::uuid)`
    await tx`delete from organizations.organization_memberships
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organization_events
      where organization_id = ${ORGANIZATION}::uuid`
    await tx`delete from organizations.organizations where id = ${ORGANIZATION}::uuid`
    await tx`delete from identity.people where id in (${OWNER}::uuid, ${COACH}::uuid)`
  })
}

async function actAs(tx: Transaction, personId: string) {
  await tx`set local role allfit_api`
  await tx`select set_config('app.actor_kind', 'person', true),
    set_config('app.actor_person_id', ${personId}, true),
    set_config('app.request_id', gen_random_uuid()::text, true)`
}

async function create(tx: Transaction, person: string, name: string, n: number) {
  await actAs(tx, person)
  return tx`select * from catalog.create_organization_movement(
    ${person}::uuid, ${ORGANIZATION}::uuid, 'test_strength', ${name}, null, null, null,
    ${key(n)}::uuid, ${command(n)}::uuid, extensions.digest(${name} || ${n}::text, 'sha256'))`
}

async function rename(tx: Transaction, person: string, revision: number, name: string, n: number) {
  await actAs(tx, person)
  return tx`select * from catalog.update_organization_movement(
    ${person}::uuid, ${ORGANIZATION}::uuid, ${MOVEMENT}::uuid, ${revision},
    ${JSON.stringify({ name })}::text::jsonb, ${key(n)}::uuid, ${command(n)}::uuid,
    extensions.digest(${name} || ${n}::text, 'sha256'))`
}

// A committed draft whose only step is the movement, ready to publish.
async function draftWithMovement() {
  const routine = {
    title: 'Con propio',
    activity_type_id: STRENGTH,
    steps: [{ position: 1, movement_id: MOVEMENT, target: { family: 'strength', target_sets: 3 } }],
  }
  const template = await admin.begin(async (tx) => {
    await actAs(tx, COACH)
    const [created] = await tx<{ result: { id: string; draft: { etag: string } } }[]>`
      select result from planning.create_session_template(
        ${COACH}::uuid, ${ORGANIZATION}::uuid, 'test_strength', 'Con propio', ${key(11)}::uuid,
        ${command(11)}::uuid, extensions.digest('template', 'sha256'))`
    if (!created) throw new Error('the template was not created')
    const [replaced] = await tx<{ result: { etag: string } }[]>`
      select result from planning.replace_session_template_draft(
        ${COACH}::uuid, ${ORGANIZATION}::uuid, ${created.result.id}::uuid,
        ${created.result.draft.etag}, ${JSON.stringify(routine)}::text::jsonb, ${key(12)}::uuid,
        ${command(12)}::uuid, extensions.digest('draft', 'sha256'))`
    if (!replaced) throw new Error('the draft was not written')
    return { id: created.result.id, etag: replaced.result.etag }
  })
  return template
}

async function publish(tx: Transaction, template: { id: string; etag: string }) {
  await actAs(tx, COACH)
  return tx`select * from planning.publish_session_template_version(
    ${COACH}::uuid, ${ORGANIZATION}::uuid, ${template.id}::uuid, ${template.etag},
    ${key(13)}::uuid, ${command(13)}::uuid, extensions.digest('publish', 'sha256'))`
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const failure = (error: unknown) => error
let secondPid = 0

// Whether the second session is waiting on a lock, rather than merely slow to get there.
async function waiting() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const [row] = await admin<{ waiting: boolean }[]>`
      select exists (select 1 from pg_stat_activity
        where pid = ${secondPid} and wait_event_type = 'Lock') as waiting`
    if (row?.waiting) return true
    await pause(100)
  }
  return false
}

async function movement() {
  const [row] = await admin<{ name: string; revision: number; revisions: number }[]>`
    select movement.name, movement.revision_number as revision,
      (select count(*)::int from catalog.movement_revisions as revision
       where revision.movement_id = movement.id) as revisions
    from catalog.movements as movement where movement.id = ${MOVEMENT}::uuid`
  return row
}

async function publishedSteps() {
  const [row] = await admin<{ steps: number }[]>`
    select count(*)::int as steps from planning.planned_steps where movement_id = ${MOVEMENT}::uuid`
  return row?.steps
}

beforeEach(async () => {
  await cleanup()
  await admin.begin(async (tx) => {
    await tx`insert into identity.people (id, given_name, family_name) values
      (${OWNER}::uuid, 'Race', 'Owner'), (${COACH}::uuid, 'Race', 'Coach')`
    await tx`insert into organizations.organizations (id, type_code, display_name, responsible_party)
      values (${ORGANIZATION}::uuid, 'studio', 'Movement race',
      '{"party_kind":"legal_entity","party_name":"Movement race","purpose":"studio_operations"}')`
    await tx`insert into organizations.organization_memberships (id, organization_id, person_id) values
      (${id(201)}::uuid, ${ORGANIZATION}::uuid, ${OWNER}::uuid),
      (${id(202)}::uuid, ${ORGANIZATION}::uuid, ${COACH}::uuid)`
    await tx`insert into organizations.membership_roles (membership_id, role_code) values
      (${id(201)}::uuid, 'owner'), (${id(202)}::uuid, 'coach')`
  })
  await admin.begin((tx) => create(tx, COACH, 'Sentadilla de carrera', 1))
  const [backend] = await second<{ pid: number }[]>`select pg_backend_pid() as pid`
  secondPid = backend?.pid ?? 0
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

test('a rename waiting on a version being published with the movement finds it in use', async () => {
  const template = await draftWithMovement()
  let renaming: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await publish(tx, template)
    renaming = second.begin((tx2) => rename(tx2, OWNER, 1, 'Otra sentadilla', 21)).catch(failure)
    expect(await waiting()).toBe(true)
  })

  expect(await renaming).toMatchObject({ code: '55000', message: 'movement-in-use' })
  expect(await movement()).toEqual({ name: 'Sentadilla de carrera', revision: 1, revisions: 0 })
  expect(await publishedSteps()).toBe(1)
})

test('a version published while the movement is being renamed waits and holds the new name', async () => {
  const template = await draftWithMovement()
  let publishing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await rename(tx, OWNER, 1, 'Otra sentadilla', 21)
    publishing = second.begin((tx2) => publish(tx2, template)).catch(failure)
    expect(await waiting()).toBe(true)
  })

  expect(await publishing).toHaveLength(1)
  expect(await movement()).toEqual({ name: 'Otra sentadilla', revision: 2, revisions: 1 })
  expect(await publishedSteps()).toBe(1)
})

test('two colleagues creating the same name at once leave one movement', async () => {
  let creating: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await create(tx, OWNER, 'Press de carrera', 31)
    creating = second.begin((tx2) => create(tx2, COACH, '  press   DE carrera ', 32)).catch(failure)
    expect(await waiting()).toBe(true)
  })

  expect(await creating).toMatchObject({ code: '23505' })
  const [row] = await admin<{ count: number }[]>`
    select count(*)::int as count from catalog.movements
    where owner_organization_id = ${ORGANIZATION}::uuid and normalized_name = 'press de carrera'`
  expect(row?.count).toBe(1)
})

test('two edits of the same revision at once keep the first and refuse the second as stale', async () => {
  let editing: Promise<unknown> | undefined
  await first.begin(async (tx) => {
    await rename(tx, OWNER, 1, 'Sentadilla del dueño', 41)
    editing = second
      .begin((tx2) => rename(tx2, COACH, 1, 'Sentadilla del coach', 42))
      .catch(failure)
    expect(await waiting()).toBe(true)
  })

  expect(await editing).toMatchObject({ code: '40001', message: 'stale-movement' })
  expect(await movement()).toEqual({ name: 'Sentadilla del dueño', revision: 2, revisions: 1 })
})
