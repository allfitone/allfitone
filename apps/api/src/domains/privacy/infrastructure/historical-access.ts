/**
 * PostgreSQL access for the historical access case (OP-PRV-018/019/020/025).
 *
 * Every call runs as the person actor with a request id, so the access record a frozen
 * read writes carries the request that caused it. The functions decide everything:
 * the capability, the recent sign-in (AF401), the eligibility, the cut and the record.
 * This file only spells the calls and reads their answers.
 *
 * A page is keyed on what the cursor can carry back exactly: the millisecond for
 * instants, the day for measurements.
 */

import { randomUUID } from 'node:crypto'

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type {
  CaseCommandResult,
  FrozenBodyProgressRecord,
  FrozenExecution,
  FrozenExecutionSummary,
  FrozenNutritionGoalVersion,
  FrozenRead,
  HistoricalAccessCase,
  HistoricalAccessDatabase,
  HistoricalRelationship,
  RequiredFrozenScope,
} from '../domain/historical-access.js'

interface CommandRow {
  document: HistoricalAccessCase | null
  replayed: boolean
}

interface ListedRow {
  id: string
  opened_at: Date
  document: HistoricalAccessCase
}

type Answer<T> =
  | ({ outcome: 'found' } & T)
  | { outcome: 'not_found' }
  | { outcome: 'scope_required'; required_scope: RequiredFrozenScope }

type FrozenExecutionItem = Omit<FrozenExecutionSummary, 'applied_scope'> & {
  scope_code: FrozenExecutionSummary['applied_scope']['code']
  scope_version: number
}

export function createHistoricalAccessDatabase(
  sql: ReturnType<typeof database> = database(),
): HistoricalAccessDatabase {
  return {
    open: (actor, input) =>
      transact(sql, actor.personId, randomUUID(), async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select document, replayed from privacy.open_historical_access_case(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${input.organizationId}::uuid,
            ${input.relationshipId}::uuid, ${input.authorizedMembershipId}::uuid,
            ${input.purpose}::text, ${input.caseReference}::text, ${input.justification}::text,
            ${input.durationHours}::integer, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return commandResult(row, 'open the historical access case')
      }),

    close: (actor, input) =>
      transact(sql, actor.personId, randomUUID(), async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select document, replayed from privacy.close_historical_access_case(
            ${actor.personId}::uuid, ${input.organizationId}::uuid, ${input.caseId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        return commandResult(row, 'close the historical access case')
      }),

    list: (actor, query) =>
      transact(sql, actor.personId, randomUUID(), async (transaction) => {
        const rows = await transaction<ListedRow[]>`
          select id, opened_at, document from privacy.list_historical_access_cases(
            ${actor.personId}::uuid, ${query.organizationId}::uuid,
            ${query.relationshipId ?? null}::uuid, ${query.limit + 1}::integer,
            ${query.cursor?.openedAt ?? null}::timestamptz, ${query.cursor?.id ?? null}::uuid
          )
        `
        const hasMore = rows.length > query.limit
        const visible = rows.slice(0, query.limit)
        const last = visible.at(-1)
        return {
          items: visible.map((row) => row.document),
          hasMore,
          ...(hasMore && last
            ? { nextCursor: { openedAt: last.opened_at.toISOString(), id: last.id } }
            : {}),
        }
      }),

    readRelationship: (actor, target) =>
      transact(sql, actor.personId, target.requestId, async (transaction) => {
        const [row] = await transaction<{ document: Answer<HistoricalRelationship> | null }[]>`
          select privacy.read_historical_relationship(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${target.organizationId}::uuid,
            ${target.relationshipId}::uuid, ${target.caseId}::uuid
          ) as document
        `
        return frozen(row?.document, ({ relationship, case: hcase, scopes }) => ({
          relationship,
          case: hcase,
          scopes,
        }))
      }),

    listExecutions: (actor, target, page) =>
      transact(sql, actor.personId, target.requestId, async (transaction) => {
        const [row] = await transaction<
          { document: Answer<{ items: FrozenExecutionItem[] }> | null }[]
        >`
          select execution.list_frozen_executions(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${target.organizationId}::uuid,
            ${target.relationshipId}::uuid, ${target.caseId}::uuid, ${page.limit + 1}::integer,
            ${page.cursor?.startedAt ?? null}::timestamptz, ${page.cursor?.id ?? null}::uuid
          ) as document
        `
        return frozen(row?.document, ({ items }) => {
          const hasMore = items.length > page.limit
          const visible = items.slice(0, page.limit)
          const last = visible.at(-1)
          return {
            items: visible.map(({ scope_code, scope_version, ...item }) => ({
              ...item,
              applied_scope: { code: scope_code, version: scope_version },
            })),
            hasMore,
            ...(hasMore && last
              ? { nextCursor: { startedAt: millisecond(last.started_at), id: last.id } }
              : {}),
          }
        })
      }),

    readExecution: (actor, target, executionId) =>
      transact(sql, actor.personId, target.requestId, async (transaction) => {
        const [row] = await transaction<
          { document: Answer<{ execution: FrozenExecution }> | null }[]
        >`
          select execution.read_frozen_execution(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${target.organizationId}::uuid,
            ${target.relationshipId}::uuid, ${target.caseId}::uuid, ${executionId}::uuid
          ) as document
        `
        return frozen(row?.document, ({ execution }) => execution)
      }),

    listBodyProgress: (actor, target, page) =>
      transact(sql, actor.personId, target.requestId, async (transaction) => {
        const [row] = await transaction<
          {
            document: Answer<{ scope_version: number; items: FrozenBodyProgressRecord[] }> | null
          }[]
        >`
          select identity.list_frozen_body_progress(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${target.organizationId}::uuid,
            ${target.relationshipId}::uuid, ${target.caseId}::uuid, ${page.limit + 1}::integer,
            ${page.cursor?.measuredOn ?? null}::date, ${page.cursor?.id ?? null}::uuid
          ) as document
        `
        return frozen(row?.document, ({ scope_version, items }) => {
          const hasMore = items.length > page.limit
          const visible = items.slice(0, page.limit)
          const last = visible.at(-1)
          return {
            appliedScope: { code: 'body_progress', version: scope_version },
            items: visible,
            hasMore,
            ...(hasMore && last
              ? { nextCursor: { measuredOn: last.measured_on, id: last.id } }
              : {}),
          }
        })
      }),

    // The instant comes inside jsonb at full precision, so the cursor keeps it untouched.
    listGoalVersions: (actor, target, page) =>
      transact(sql, actor.personId, target.requestId, async (transaction) => {
        const [row] = await transaction<
          {
            document: Answer<{ scope_version: number; items: FrozenNutritionGoalVersion[] }> | null
          }[]
        >`
          select nutrition.list_frozen_goal_versions(
            ${actor.personId}::uuid, ${actor.sessionId}::uuid, ${target.organizationId}::uuid,
            ${target.relationshipId}::uuid, ${target.caseId}::uuid, ${page.limit + 1}::integer,
            ${page.cursor?.createdAt ?? null}::timestamptz, ${page.cursor?.id ?? null}::uuid
          ) as document
        `
        return frozen(row?.document, ({ scope_version, items }) => {
          const hasMore = items.length > page.limit
          const visible = items.slice(0, page.limit)
          const last = visible.at(-1)
          return {
            appliedScope: { code: 'nutrition_guidance', version: scope_version },
            items: visible,
            hasMore,
            ...(hasMore && last ? { nextCursor: { createdAt: last.created_at, id: last.id } } : {}),
          }
        })
      }),
  }
}

function commandResult(row: CommandRow | undefined, operation: string): CaseCommandResult {
  if (!row?.document) throw new Error(`PostgreSQL did not ${operation}`)
  return { resource: row.document, replayed: row.replayed }
}

function frozen<T, R>(
  document: Answer<T> | null | undefined,
  found: (answer: T) => R,
): FrozenRead<R> {
  if (!document) throw new Error('PostgreSQL did not answer the frozen read')
  if (document.outcome === 'not_found') return { outcome: 'not_found' }
  if (document.outcome === 'scope_required') {
    return { outcome: 'scope_required', requiredScope: document.required_scope }
  }
  return { outcome: 'found', value: found(document) }
}

// The page is keyed on the millisecond; a finer instant would skip rows between pages.
function millisecond(instant: string): string {
  return new Date(instant).toISOString()
}

function transact<T>(
  sql: ReturnType<typeof database>,
  personId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureStudioRequestPhase('business-db', async () => {
    const result = await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.actor_kind', 'person', true),
               set_config('app.actor_person_id', ${personId}, true),
               set_config('app.request_id', ${requestId}, true)
      `
      return { value: await operation(transaction) }
    })
    return result.value
  })
}
