/**
 * PostgreSQL access for a person's notices in Space.
 *
 * Both calls are closed functions: the runtime role reads no notice directly. Each
 * resolves the token's subject to the person and names her as the actor itself, so a
 * request cannot list or mark anybody else's.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type {
  SpaceNotice,
  SpaceNoticeDatabasePage,
  SpaceNoticesDatabase,
} from '../domain/space-notices.js'

const PROVIDER = 'workos'

export function createSpaceNoticesDatabase(
  sql: ReturnType<typeof database> = database(),
): SpaceNoticesDatabase {
  return {
    list: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ page: SpaceNoticeDatabasePage | null }[]>`
          select identity.list_my_notices(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.filter}, ${input.limit}::integer,
            ${input.after?.occurredAt ?? null}::timestamptz, ${input.after?.noticeId ?? null}::uuid
          ) as page
        `
        if (!row?.page) throw new Error('PostgreSQL did not list the notices')
        return row.page
      }),

    markRead: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ notice: SpaceNotice | null }[]>`
          select identity.mark_my_notice_read(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.noticeId}::uuid
          ) as notice
        `
        if (!row?.notice) throw new Error('PostgreSQL did not mark the notice read')
        return row.notice
      }),
  }
}

function withinRequest<T>(
  sql: ReturnType<typeof database>,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureRequestPhase('business-db', async () => {
    const outcome = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.request_id', ${requestId}, true)`
      return { value: await operation(transaction) }
    })
    return outcome.value
  })
}
