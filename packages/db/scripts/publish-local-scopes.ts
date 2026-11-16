/**
 * Local-only: publish the seven V1 scope definitions.
 *
 * Studio's client-invitation screen offers whatever `privacy.scope_definitions` holds, so
 * on a database where nothing has been published it says there are no permissions yet and
 * nobody can be invited. This fills that gap on **this machine only**, through the real
 * command, so the whole chain — publish, offer, invite, accept — can be looked at.
 *
 * The rules live in `v1-scope-rules.ts`, where a test holds them to the database. **A
 * published definition is immutable**, so in production they are published by hand from
 * `/permissions`, from those same rules. This script is for the local chain.
 *
 * It refuses any database that is not on this machine, and it is idempotent: a scope whose
 * newest version already has these rules is left alone; one whose rules changed here gets
 * a new version, as a curator would publish it, and the grants on the old one keep it.
 *
 *   bun --env-file=.env.local packages/db/scripts/publish-local-scopes.ts
 */

import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'

import { V1_SCOPES as SCOPES, type Rule } from './v1-scope-rules'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const DEFAULT_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const argv = process.argv.slice(2)
const databaseUrl = value('--database-url') ?? process.env.LOCAL_DATABASE_URL ?? DEFAULT_URL
const host = new URL(databaseUrl.replace(/^postgres(ql)?:/, 'http:')).hostname
if (!LOCAL_HOSTS.has(host)) {
  throw new Error(`refusing to publish on ${host}: this script is local only`)
}

const sql = postgres(databaseUrl, { prepare: false, max: 1 })
try {
  await publish()
} finally {
  await sql.end()
}

async function publish(): Promise<void> {
  const [curator] = await sql<Array<{ person_id: string; account_id: string }>>`
    select account.person_id, account.id as account_id
    from identity.access_accounts as account
    join support.platform_duty_assignments as duty
      on duty.person_id = account.person_id
     and duty.duty_code = 'curate_global_catalog'
     and duty.status = 'active'
     and duty.valid_from <= clock_timestamp()
     and duty.valid_to > clock_timestamp()
    where account.person_id is not null
    order by account.created_at
    limit 1
  `
  if (!curator) {
    console.log('Nobody holds curate_global_catalog on this database.')
    console.log('Run bootstrap-local-operator.ts first.')
    process.exitCode = 1
    return
  }

  for (const { code, rules } of SCOPES) {
    const published = await latestRules(code)
    if (published !== null && published === fingerprint(rules)) {
      console.log(`${code.padEnd(24)} already published, left alone`)
      continue
    }
    await publishOne(curator, code, rules)
    const included = rules.filter((rule) => !rule.is_excluded).length
    console.log(
      `${code.padEnd(24)} published · ${included} included, ${rules.length - included} excluded`,
    )
  }

  // Inside a transaction with a person's context: `list_offerable_scopes` is a definer
  // function owned by `allfit_owner`, which does not bypass RLS, and its policy wants
  // both `actor_kind` and a person. Asked without them it answers zero, which reads
  // exactly like "nothing was published" and is not that at all.
  const [offerable] = await sql.begin(async (transaction) => {
    await transaction`
      select set_config('app.actor_kind', 'person', true),
             set_config('app.actor_person_id', ${curator.person_id}, true)
    `
    return transaction<Array<{ count: number }>>`
      select count(*)::integer as count from privacy.list_offerable_scopes()
    `
  })
  console.log(`\nStudio can now offer ${offerable?.count ?? 0} permission(s) on an invitation.`)
  console.log('These are the rules in v1-scope-rules.ts; production publishes them by hand.')
}

async function publishOne(
  curator: { person_id: string; account_id: string },
  code: string,
  rules: Rule[],
): Promise<void> {
  await sql.begin(async (transaction) => {
    const sessionId = randomUUID()
    await transaction`
      insert into identity.access_sessions (
        id, access_account_id, provider_session_id, surface, token_hash, token_ciphertext,
        access_token_expires_at, assurance_level, authentication_method,
        assurance_verified_at, last_activity_at, absolute_expires_at
      ) values (
        ${sessionId}::uuid, ${curator.account_id}::uuid, ${`local_curator_${sessionId}`},
        'backoffice', ${randomBytes(32)}, 'v1.local-curator',
        clock_timestamp() + interval '5 minutes', 2, 'password_totp',
        clock_timestamp(), clock_timestamp(), clock_timestamp() + interval '5 minutes'
      )
    `
    await transaction`
      select set_config('app.actor_kind', 'support', true),
             set_config('app.actor_person_id', ${curator.person_id}, true)
    `
    // Cast through text: the driver serializes an interpolated value as a JSON string.
    await transaction`
      select result from privacy.publish_scope_definition(
        ${curator.person_id}::uuid, ${sessionId}::uuid, ${code},
        ${JSON.stringify(rules)}::text::jsonb,
        ${randomUUID()}::uuid, ${uuidV7()}::uuid, ${randomBytes(32)}
      )
    `
    await transaction`
      update identity.access_sessions set revoked_at = clock_timestamp()
      where id = ${sessionId}::uuid
    `
  })
}

/** The rules of the newest published version of a scope, as `fingerprint` writes them. */
async function latestRules(code: string): Promise<string | null> {
  const rows = await sql<Rule[]>`
    select rule.resource, rule.field, rule.data_classification_code, rule.max_action,
           rule.is_excluded, rule.historical_readable
    from privacy.scope_resource_rules as rule
    where rule.scope_definition_id = (
      select definition.id from privacy.scope_definitions as definition
      where definition.scope_code = ${code} and definition.status = 'published'
      order by definition.version_number desc
      limit 1
    )
  `
  return rows.length === 0 ? null : fingerprint(rows)
}

/** Order and defaults do not make two sets of rules different. */
function fingerprint(rules: Rule[]): string {
  return rules
    .map((rule) =>
      [
        rule.resource,
        rule.field,
        rule.data_classification_code,
        rule.max_action,
        rule.is_excluded === true,
        rule.historical_readable === true,
      ].join('|'),
    )
    .sort()
    .join('\n')
}

function value(flag: string): string | undefined {
  const index = argv.indexOf(flag)
  return index >= 0 ? argv[index + 1] : undefined
}

/** The commands take a UUIDv7 command id. */
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
