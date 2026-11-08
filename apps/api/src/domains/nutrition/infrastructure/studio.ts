/**
 * PostgreSQL access for the coach's side of a client's nutrition (OP-NUT-009..013).
 *
 * Each call is one closed function that checks the coach, finds the grant, records the
 * access and shapes the answer to the grant's version, inside the transaction that
 * carries the coach and the request id. A page asks for one row more than it shows, so
 * whether another exists is known without a second query. Its cursor keeps the instant
 * exactly as PostgreSQL wrote it in the jsonb: a rounded one would skip rows between pages.
 * The targets travel as `::text::jsonb`, as everywhere in nutrition (`T-EXE-IDEM-10`).
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type {
  ClientActiveNutritionGoal,
  ClientNutritionDailySummary,
  ClientNutritionGoalVersion,
  ClientNutritionMeal,
  ClientRead,
  StudioNutritionDatabase,
} from '../domain/studio.js'

type Refused = { outcome: 'scope_required'; scope: string }
type Answer<T> = ({ outcome: 'found'; scope_version: number } & T) | Refused
type Opened = { outcome: 'found'; media_ref: string } | { outcome: 'not_found' }

export function createStudioNutritionDatabase(
  sql: ReturnType<typeof database> = database(),
): StudioNutritionDatabase {
  return {
    listMeals: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<
            Array<{
              document: Answer<{
                photo_scope_version: number | null
                items: ClientNutritionMeal[]
              }> | null
            }>
          >`
            select nutrition.list_client_meals(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.from}::date, ${input.to}::date,
              ${input.limit + 1}::integer, ${input.cursor?.at ?? null}::timestamptz,
              ${input.cursor?.id ?? null}::uuid
            ) as document
          `,
        )
        if (document.outcome === 'scope_required') return refused(document)
        const page = slice(document.items, input.limit, (item) => item.occurred_at)
        return {
          outcome: 'found',
          value: {
            appliedScope: { code: 'nutrition_intake', version: document.scope_version },
            photoScope:
              document.photo_scope_version === null
                ? null
                : { code: 'nutrition_media', version: document.photo_scope_version },
            ...page,
          },
        }
      }),

    readDailySummaries: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<
            Array<{ document: Answer<{ days: ClientNutritionDailySummary[] }> | null }>
          >`
            select nutrition.read_client_daily_summaries(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.from}::date, ${input.to}::date
            ) as document
          `,
        )
        if (document.outcome === 'scope_required') return refused(document)
        return {
          outcome: 'found',
          value: {
            appliedScope: { code: 'nutrition_intake', version: document.scope_version },
            days: document.days,
          },
        }
      }),

    openMealPhoto: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<Array<{ document: Opened | null }>>`
            select nutrition.open_client_meal_photo(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.mealId}::uuid
            ) as document
          `,
        )
        return document.outcome === 'found' ? document.media_ref : null
      }),

    listGoalVersions: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<
            Array<{
              document: Answer<{
                items: ClientNutritionGoalVersion[]
                active: ClientActiveNutritionGoal | null
              }> | null
            }>
          >`
            select nutrition.list_client_goal_versions(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.limit + 1}::integer,
              ${input.cursor?.at ?? null}::timestamptz, ${input.cursor?.id ?? null}::uuid
            ) as document
          `,
        )
        if (document.outcome === 'scope_required') return refused(document)
        return {
          outcome: 'found',
          value: {
            appliedScope: { code: 'nutrition_guidance', version: document.scope_version },
            active: document.active,
            ...slice(document.items, input.limit, (item) => item.created_at),
          },
        }
      }),

    // The command carries no request id: the receipt, not an access record, is its trace.
    proposeGoalVersion: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<
          Array<{ result: ClientNutritionGoalVersion | null; replayed: boolean }>
        >`
          select * from nutrition.propose_goal_version(
            ${input.personId}::uuid, ${input.organizationId}::uuid,
            ${input.subjectPersonId}::uuid, ${input.rationale}::text,
            ${JSON.stringify(input.targets)}::text::jsonb, ${input.idempotencyKey}::uuid,
            ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row?.result) throw new Error('PostgreSQL did not propose the goal version')
        return { resource: row.result, replayed: row.replayed }
      }),
  }
}

function present<T>(rows: ReadonlyArray<{ document: T | null }>): T {
  const document = rows[0]?.document
  if (!document) throw new Error('PostgreSQL did not answer the client nutrition read')
  return document
}

function refused(document: Refused): ClientRead<never> {
  return { outcome: 'scope_required', requiredScope: { code: document.scope, level: 'read' } }
}

function slice<T extends { id: string }>(rows: T[], limit: number, instantOf: (row: T) => string) {
  const hasMore = rows.length > limit
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return {
    items,
    hasMore,
    ...(hasMore && last ? { nextCursor: { at: instantOf(last), id: last.id } } : {}),
  }
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
