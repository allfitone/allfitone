/**
 * PostgreSQL access for what a client shares with the coach who attends her.
 *
 * Each read is one closed function that checks the coach, finds the grant, records the
 * access and shapes the answer to the grant's version, inside the transaction that
 * carries the coach and the request id. A page asks for one row more than it shows, so
 * whether another exists is known without a second query, and its cursor is built from
 * values the page already shows: a version that hides a row's key does not list it.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type {
  AppliedScope,
  ClientBodyPhoto,
  ClientBodyProgressRecord,
  ClientHealthContextClaim,
  ClientPage,
  ClientRead,
  ClientTrainingProfile,
  StudioClientDataDatabase,
} from '../domain/studio-client-data.js'

type Refused = { outcome: 'scope_required'; scope: string }
type Listed<T> = { outcome: 'found'; scope_version: number; items: T[] } | Refused
type Opened = { outcome: 'found'; media_ref: string } | { outcome: 'not_found' }
type Profiled =
  | ({ outcome: 'found'; scope_version: number } & Omit<ClientTrainingProfile, 'applied_scope'>)
  | Refused

export function createStudioClientDataDatabase(
  sql: ReturnType<typeof database> = database(),
): StudioClientDataDatabase {
  return {
    readProfile: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<Array<{ document: Profiled | null }>>`
            select identity.read_client_training_profile(
              ${input.personId}::uuid, ${input.organizationId}::uuid, ${input.subjectPersonId}::uuid
            ) as document
          `,
        )
        if (document.outcome === 'scope_required') return refused(document)
        return {
          outcome: 'found',
          value: {
            applied_scope: { code: 'relationship_training', version: document.scope_version },
            biological_sex: document.biological_sex,
            attributes: document.attributes,
          },
        }
      }),

    listBodyProgress: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) =>
        page(
          present(
            await transaction<Array<{ document: Listed<ClientBodyProgressRecord> | null }>>`
              select identity.list_client_body_progress(
                ${input.personId}::uuid, ${input.organizationId}::uuid,
                ${input.subjectPersonId}::uuid, ${input.limit + 1}::integer,
                ${input.cursor?.key ?? null}::date, ${input.cursor?.id ?? null}::uuid
              ) as document
            `,
          ),
          'body_progress',
          input.limit,
          (item) => item.measured_on,
        ),
      ),

    listBodyPhotos: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) =>
        page(
          present(
            await transaction<Array<{ document: Listed<ClientBodyPhoto> | null }>>`
              select identity.list_client_shared_body_photos(
                ${input.personId}::uuid, ${input.organizationId}::uuid,
                ${input.subjectPersonId}::uuid, ${input.limit + 1}::integer,
                ${input.cursor?.key ?? null}::date, ${input.cursor?.id ?? null}::uuid
              ) as document
            `,
          ),
          'body_progress',
          input.limit,
          (item) => item.taken_on,
        ),
      ),

    openBodyPhoto: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const document = present(
          await transaction<Array<{ document: Opened | null }>>`
            select identity.open_client_shared_body_photo(
              ${input.personId}::uuid, ${input.organizationId}::uuid,
              ${input.subjectPersonId}::uuid, ${input.photoId}::uuid
            ) as document
          `,
        )
        return document.outcome === 'found' ? document.media_ref : null
      }),

    listHealthContext: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) =>
        page(
          present(
            await transaction<Array<{ document: Listed<ClientHealthContextClaim> | null }>>`
              select identity.list_client_health_context(
                ${input.personId}::uuid, ${input.organizationId}::uuid,
                ${input.subjectPersonId}::uuid, ${input.limit + 1}::integer,
                ${input.cursor?.key ?? null}::timestamptz, ${input.cursor?.id ?? null}::uuid
              ) as document
            `,
          ),
          'health_context',
          input.limit,
          (item) => item.valid_from,
        ),
      ),
  }
}

function present<T>(rows: ReadonlyArray<{ document: T | null }>): T {
  const document = rows[0]?.document
  if (!document) throw new Error('PostgreSQL did not answer the client read')
  return document
}

function refused(document: Refused): ClientRead<never> {
  return { outcome: 'scope_required', requiredScope: { code: document.scope, level: 'read' } }
}

function page<T extends { id: string }>(
  document: Listed<T>,
  scope: AppliedScope['code'],
  limit: number,
  keyOf: (item: T) => string,
): ClientRead<ClientPage<T>> {
  if (document.outcome === 'scope_required') return refused(document)
  const hasMore = document.items.length > limit
  const items = document.items.slice(0, limit)
  const last = items.at(-1)
  return {
    outcome: 'found',
    value: {
      appliedScope: { code: scope, version: document.scope_version },
      items,
      hasMore,
      ...(hasMore && last ? { nextCursor: { key: keyOf(last), id: last.id } } : {}),
    },
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
