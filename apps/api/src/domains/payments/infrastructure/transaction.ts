/**
 * How every payments call reaches PostgreSQL: as the acting person, inside one
 * transaction, with the actor set transaction-locally so it survives the pooler.
 *
 * Shared by the subscription and plan adapters so neither can drift from the other in how
 * an actor is declared. A page is read with `limit + 1` rows and trimmed here.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type { Page } from '../domain/subscriptions.js'

export function page<Row, Item>(
  rows: Row[],
  limit: number,
  present: (row: Row) => Item,
): Page<Item> {
  const hasMore = rows.length > limit
  return { items: rows.slice(0, limit).map(present), hasMore }
}

export function asPerson<T>(
  sql: ReturnType<typeof database>,
  personId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureRequestPhase('business-db', async () => {
    const outcome = await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.actor_kind', 'person', true),
               set_config('app.actor_person_id', ${personId}, true),
               set_config('app.request_id', ${requestId}, true)
      `
      return { value: await operation(transaction) }
    })
    return outcome.value
  })
}
