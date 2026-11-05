/**
 * The seven V1 permissions say what they reach, and the database agrees — `HU-BO-024`.
 *
 * Access is decided by the policies, by scope code; the published rules only describe it.
 * A published version is immutable and every grant points at the one the person accepted,
 * so a rule that says more or less than the policies do is fixed only by a new version and
 * a new consent. These tests hold the rules in `scripts/v1-scope-rules.ts`, the ones
 * published from `/permissions`, to the database:
 *
 *   · every resource and field a rule names exists;
 *   · nothing the data dictionary keeps out of every V1 scope is included;
 *   · whatever a policy lets a professional read or write under a scope, the scope declares;
 *   · a scope declares `contribute` only where a policy lets a professional write.
 *
 * A read served only through a definer function (a session's sets and laps, through
 * `execution.session_projection`) is not seen here: the policy that admits the session is.
 */

import { afterAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'

import { V1_SCOPES, type Rule } from '../scripts/v1-scope-rules'

const sql = postgres({
  host: process.env.SUPABASE_DB_HOST ?? '127.0.0.1',
  port: Number(process.env.SUPABASE_DB_PORT ?? 54322),
  database: process.env.SUPABASE_DB_NAME ?? 'postgres',
  username: process.env.SUPABASE_DB_USER ?? 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD ?? 'postgres',
  prepare: false,
  max: 1,
})

afterAll(async () => {
  await sql.end({ timeout: 1 })
})

/** `V1_DATA_DICTIONARY.md` §execution.endurance_laps: outside the seven V1 scopes. */
const OUT_OF_EVERY_SCOPE = [{ resource: 'execution.endurance_laps', field: 'avg_heart_rate_bpm' }]

const CODES = V1_SCOPES.map((scope) => scope.code)

interface Reach {
  resource: string
  command: string
  scope_code: string
  level: 'read' | 'contribute'
}

/** Every policy that admits a professional through `can_access(…, scope, level)`. */
async function policyReach(): Promise<Reach[]> {
  const pattern = `'(${CODES.join('|')})'::text,\\s*'(read|contribute)'`
  return sql<Reach[]>`
    select distinct policy.schemaname || '.' || policy.tablename as resource,
           policy.cmd as command, found[1] as scope_code, found[2] as level
    from pg_policies as policy,
         regexp_matches(coalesce(policy.qual, '') || ' ' || coalesce(policy.with_check, ''),
                        ${pattern}, 'g') as found
    order by 1, 2, 3, 4
  `
}

const included = (rules: Rule[]) => rules.filter((rule) => rule.is_excluded !== true)

describe('the seven V1 permissions', () => {
  test('are the seven the catalogue presents to a person', async () => {
    const rows = await sql<Array<{ scope_code: string }>>`
      select scope_code from privacy.scope_presentations order by scope_code
    `
    expect(rows.map((row) => row.scope_code)).toEqual([...CODES].sort())
  })

  test('name only resources and fields that exist', async () => {
    const rows = await sql<Array<{ resource: string; column_name: string }>>`
      select table_schema || '.' || table_name as resource, column_name
      from information_schema.columns
      where table_schema in ('identity', 'planning', 'execution', 'nutrition')
    `
    const columns = new Map<string, Set<string>>()
    for (const row of rows) {
      const known = columns.get(row.resource) ?? new Set<string>()
      known.add(row.column_name)
      columns.set(row.resource, known)
    }

    const missing = V1_SCOPES.flatMap(({ code, rules }) =>
      rules
        .filter((rule) => {
          const known = columns.get(rule.resource)
          return known === undefined || (rule.field !== '*' && !known.has(rule.field))
        })
        .map((rule) => `${code}: ${rule.resource}.${rule.field}`),
    )
    expect(missing).toEqual([])
  })

  test('include nothing the data dictionary keeps out of every V1 scope', () => {
    const leaked = V1_SCOPES.flatMap(({ code, rules }) =>
      OUT_OF_EVERY_SCOPE.filter((kept) =>
        included(rules).some(
          (rule) =>
            rule.resource === kept.resource && (rule.field === '*' || rule.field === kept.field),
        ),
      ).map((kept) => `${code}: ${kept.resource}.${kept.field}`),
    )
    expect(leaked).toEqual([])
  })

  test('declare whatever a policy lets a professional read or write under them', async () => {
    const reach = await policyReach()
    expect(reach.length).toBeGreaterThan(0)

    const undeclared = reach
      .filter(({ resource, scope_code, level }) => {
        const scope = V1_SCOPES.find((candidate) => candidate.code === scope_code)
        const covering = included(scope?.rules ?? []).filter((rule) => rule.resource === resource)
        return level === 'contribute'
          ? !covering.some((rule) => rule.max_action === 'contribute')
          : covering.length === 0
      })
      .map(
        ({ resource, command, scope_code, level }) =>
          `${scope_code}: ${resource} (${command} at ${level})`,
      )
    expect(undeclared).toEqual([])
  })

  test('declare contribute only where a policy lets a professional write', async () => {
    const writes = new Set(
      (await policyReach())
        .filter((reach) => reach.level === 'contribute' && reach.command !== 'SELECT')
        .map((reach) => `${reach.scope_code}: ${reach.resource}`),
    )

    const overstated = V1_SCOPES.flatMap(({ code, rules }) =>
      included(rules)
        .filter((rule) => rule.max_action === 'contribute')
        .map((rule) => `${code}: ${rule.resource}`)
        .filter((declared) => !writes.has(declared)),
    )
    expect(overstated).toEqual([])
  })
})
