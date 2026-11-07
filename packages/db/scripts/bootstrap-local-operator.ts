/**
 * Local-only Backoffice bootstrap.
 *
 * Signing in to Backoffice needs three things the database cannot invent: a person, an
 * access account carrying the provider subject, and an `allfit_admin` role granted by
 * somebody. The grant is a two-person ceremony by design, so a single operator cannot
 * appoint themselves — which is exactly what blocks a fresh local database.
 *
 * This script performs that ceremony against a local database and nothing else. The
 * ceremony grants `allfit_admin` to the operator and to a second administrator, the local
 * witness, who exists only so there is somebody else. The role brings every duty with it
 * for as long as it lasts (ADR-046), so nothing is granted one by one and nothing
 * expires: running the script again leaves an existing operator alone.
 *
 * It refuses any database that is not on this machine. The ceremony is audited in
 * production and belongs to a real approval, never to a script.
 *
 *   bun --env-file=.env.local packages/db/scripts/bootstrap-local-operator.ts \
 *     --subject user_01ABC --given-name Jimmy --family-name Rozo
 *
 * `--subject` is the WorkOS user id of the Backoffice Application user you sign in with.
 */

import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

interface Options {
  subject: string
  givenName: string
  familyName: string
  issuer: string
  databaseUrl: string
}

const options = readOptions(process.argv.slice(2))
await bootstrap(options)

async function bootstrap(input: Options): Promise<void> {
  const sql = postgres(input.databaseUrl, { prepare: false, max: 1 })
  try {
    const operator = await ensureOperator(sql, input)
    const approvers = await armWitnessToApprove(sql, operator, input.issuer)

    const effective = await sql<Array<{ duty_code: string; basis: string; valid_to: Date }>>`
      select duty_code, basis, valid_to
      from support.platform_duty_assignments
      where person_id = ${operator}::uuid
        and status = 'active'
        and valid_from <= clock_timestamp()
        and valid_to > clock_timestamp()
      order by duty_code, basis
    `
    console.log(`Operator ${operator}`)
    for (const duty of effective) {
      const until =
        duty.basis === 'admin_role'
          ? 'through the role'
          : `until ${duty.valid_to.toISOString().slice(0, 10)}`
      console.log(`  ${duty.duty_code} ${until}`)
    }
    // The catalogue the role grants from, so this list cannot drift from the database.
    const missing = await sql<Array<{ duty_code: string }>>`
      select standing.duty_code from support.standing_platform_duties() as standing
      where not exists (
        select 1 from support.platform_duty_assignments as held
        where held.person_id = ${operator}::uuid
          and held.duty_code = standing.duty_code
          and held.status = 'active'
          and held.valid_from <= clock_timestamp()
          and held.valid_to > clock_timestamp()
      )
      order by standing.duty_code
    `
    if (missing.length) {
      console.log(`Still not in force: ${missing.map((row) => row.duty_code).join(', ')}`)
      process.exitCode = 1
    }
    if (approvers >= 2) {
      console.log(`${approvers} local approvers, which is enough for a restricted window:`)
      console.log('  bun packages/db/scripts/approve-local-break-glass.ts')
    }
    console.log('Sign in at http://localhost:3001 and enrol TOTP if you have not yet.')
  } finally {
    await sql.end()
  }
}

async function ensureOperator(sql: postgres.Sql, input: Options): Promise<string> {
  const [existing] = await sql<Array<{ person_id: string | null }>>`
    select person_id from identity.access_accounts
    where provider = 'workos' and issuer = ${input.issuer} and subject = ${input.subject}
  `
  if (existing?.person_id) return existing.person_id

  return sql.begin(async (transaction) => {
    const [person] = await transaction<Array<{ id: string }>>`
      insert into identity.people (given_name, family_name, status)
      values (${input.givenName}, ${input.familyName}, 'active')
      returning id
    `
    // The ceremony needs two distinct administrators. The second one exists so the
    // first can be granted a role nobody grants themselves; nobody signs in as it.
    const [witness] = await transaction<Array<{ id: string }>>`
      insert into identity.people (given_name, family_name, status)
      values ('Local', 'Witness', 'active')
      returning id
    `
    if (!person || !witness) throw new Error('PostgreSQL did not create the local people')

    const witnessSubject = `local_witness_${person.id.slice(0, 8)}`
    await transaction`
      insert into identity.access_accounts (provider, issuer, subject)
      values ('workos', ${input.issuer}, ${input.subject}),
             ('workos', ${input.issuer}, ${witnessSubject})
      on conflict (provider, issuer, subject) do nothing
    `
    // The window argument no longer bounds anything (ADR-046); the ceremony keeps its call.
    await transaction`
      select support.bootstrap_backoffice_administrators(
        ${person.id}::uuid, ${input.subject},
        ${witness.id}::uuid, ${witnessSubject},
        ${input.issuer}, clock_timestamp() + interval '30 days',
        ${`LOCAL-BOOTSTRAP-${new Date().toISOString().slice(0, 10)}`}
      )
    `
    return person.id
  })
}

/**
 * A break-glass window needs somebody who is not the requester, and a restricted one —
 * body measurements, health notes, meals — needs two of them. Locally there is one
 * witness, so without this the operator can ask for a window and nothing can ever open
 * it: `HU-BO-008` and `HU-BO-009` cannot be looked at at all.
 *
 * Two local approvers are ensured here. The operator grants a second witness the role,
 * the way the Team screen does, and the role brings `approve_break_glass` with it. The
 * operator's session lives only for this transaction. Nobody signs in as either witness.
 */
async function armWitnessToApprove(
  sql: postgres.Sql,
  operator: string,
  issuer: string,
): Promise<number> {
  return sql.begin(async (transaction) => {
    const [operatorAccount] = await transaction<Array<{ id: string }>>`
      select id from identity.access_accounts
      where person_id = ${operator}::uuid
      order by created_at desc
      limit 1
    `
    if (!operatorAccount) return 0

    const sessionId = randomUUID()
    await transaction`
      insert into identity.access_sessions (
        id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
        access_token_expires_at, assurance_level, authentication_method,
        assurance_verified_at, last_activity_at, absolute_expires_at
      ) values (
        ${sessionId}::uuid, ${operatorAccount.id}::uuid, ${`local_operator_${sessionId}`},
        'backoffice', ${randomBytes(32)}, 'v1.local-operator',
        clock_timestamp() + interval '5 minutes', 2, 'password_totp',
        clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '5 minutes'
      )
    `

    // The second approver does not come from the bootstrap ceremony, which makes exactly
    // two administrators. Now that two exist, the operator can appoint a third the way
    // the Team screen does.
    const [second] = await transaction<Array<{ person_id: string }>>`
      select person_id from identity.access_accounts
      where subject like 'local_witness_2_%' and person_id is not null
      limit 1
    `
    if (!second) {
      const [person] = await transaction<Array<{ id: string }>>`
        insert into identity.people (given_name, family_name, status)
        values ('Local', 'Witness Two', 'active')
        returning id
      `
      if (!person) throw new Error('PostgreSQL did not create the second local witness')
      await transaction`
        insert into identity.access_accounts (provider, issuer, subject, person_id)
        values ('workos', ${issuer}, ${`local_witness_2_${person.id.slice(0, 8)}`},
          ${person.id}::uuid)
      `
      await transaction`
        select result from support.assign_platform_role(
          ${operator}::uuid, ${sessionId}::uuid, ${person.id}::uuid, 'allfit_admin',
          ${randomUUID()}::uuid, ${uuidV7()}::uuid, ${randomBytes(32)}
        )
      `
    }

    await transaction`
      update identity.access_sessions set revoked_at = clock_timestamp()
      where id = ${sessionId}::uuid
    `

    // People, not rows: a witness may hold the duty both through the role and granted.
    const [held] = await transaction<Array<{ count: number }>>`
      select count(distinct account.person_id)::integer as count
      from identity.access_accounts as account
      join support.platform_duty_assignments as duty
        on duty.person_id = account.person_id
       and duty.duty_code = 'approve_break_glass'
       and duty.status = 'active'
       and duty.valid_to > clock_timestamp()
      where account.subject like 'local_witness_%'
        and account.person_id <> ${operator}::uuid
    `
    return held?.count ?? 0
  })
}

function readOptions(argv: string[]): Options {
  const values = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (flag?.startsWith('--') && value !== undefined) values.set(flag.slice(2), value)
  }

  const subject = values.get('subject')
  if (!subject || !subject.trim()) {
    throw new Error('--subject is required: the WorkOS user id you sign in with')
  }
  const issuer = values.get('issuer') ?? process.env.WORKOS_ISSUER
  if (!issuer) throw new Error('WORKOS_ISSUER is not set and --issuer was not given')

  const databaseUrl = values.get('database-url') ?? process.env.LOCAL_DATABASE_URL ?? DEFAULT_URL
  const host = new URL(databaseUrl.replace(/^postgres(ql)?:/, 'http:')).hostname
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`refusing to bootstrap ${host}: this ceremony is audited outside local`)
  }

  return {
    subject: subject.trim(),
    givenName: values.get('given-name') ?? 'Local',
    familyName: values.get('family-name') ?? 'Operator',
    issuer,
    databaseUrl,
  }
}

/** The command takes a UUIDv7 command id. */
function uuidV7(): string {
  const bytes = Buffer.from(randomUUID().replaceAll('-', ''), 'hex')
  let timestamp = Date.now()
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff
    timestamp = Math.floor(timestamp / 256)
  }
  bytes[6] = ((bytes.at(6) ?? 0) & 0x0f) | 0x70
  bytes[8] = ((bytes.at(8) ?? 0) & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
