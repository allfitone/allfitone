/**
 * PostgreSQL access for the waitlist review.
 *
 * Unlike a visitor of the waitlist, the reviewer is a person: every call runs in a
 * transaction that names them, and the closed function checks the commercial duty and
 * the Backoffice session against that same transaction.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type {
  BackofficeWaitlistSignup,
  BackofficeWaitlistTotals,
  WaitlistReviewDatabase,
} from '../domain/review.js'

type ListRow = { signup: BackofficeWaitlistSignup }
type TotalsRow = { totals: BackofficeWaitlistTotals }
type CommandRow = { result: BackofficeWaitlistSignup; replayed: boolean }

export function createWaitlistReviewDatabase(): WaitlistReviewDatabase {
  const sql = database()

  return {
    list: (input) =>
      asSupport(sql, input.actorPersonId, input.requestId, async (transaction) => {
        const rows = await transaction<ListRow[]>`
          select signup from waitlist.list_backoffice_signups(
            ${input.actorPersonId}::uuid, ${input.actorSessionId}::uuid,
            ${input.query ?? null}::text, ${input.filter ?? null}::text,
            ${input.limit}::integer, ${input.beforeId ?? null}::uuid
          )
        `
        return rows.map((row) => row.signup)
      }),

    totals: (input) =>
      asSupport(sql, input.actorPersonId, input.requestId, async (transaction) => {
        const [row] = await transaction<TotalsRow[]>`
          select waitlist.read_backoffice_totals(
            ${input.actorPersonId}::uuid, ${input.actorSessionId}::uuid
          ) as totals
        `
        if (!row) throw new Error('PostgreSQL did not answer the waitlist totals')
        return row.totals
      }),

    markAsFraud: (input) =>
      asSupport(sql, input.actorPersonId, input.requestId, async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select * from waitlist.mark_signup_as_fraud(
            ${input.actorPersonId}::uuid, ${input.actorSessionId}::uuid,
            ${input.signupId}::uuid, ${input.mark.reason}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not mark the waitlist sign-up')
        return { resource: row.result, replayed: row.replayed }
      }),

    withdrawFraudMark: (input) =>
      asSupport(sql, input.actorPersonId, input.requestId, async (transaction) => {
        const [row] = await transaction<CommandRow[]>`
          select * from waitlist.withdraw_fraud_mark(
            ${input.actorPersonId}::uuid, ${input.actorSessionId}::uuid,
            ${input.signupId}::uuid, ${input.withdrawal.reason}::text,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not take the fraud mark back')
        return { resource: row.result, replayed: row.replayed }
      }),
  }
}

// The actor is transaction-local, which is also what survives the pooler. Each domain
// keeps its own copy of this: a domain does not reach into another's infrastructure.
function asSupport<T>(
  sql: ReturnType<typeof database>,
  actorPersonId: string,
  requestId: string,
  operation: (transaction: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return measureRequestPhase('business-db', async () => {
    const outcome = await sql.begin(async (transaction) => {
      await transaction`
        select set_config('app.actor_kind', 'support', true),
               set_config('app.actor_person_id', ${actorPersonId}, true),
               set_config('app.request_id', ${requestId}, true)
      `
      return { value: await operation(transaction) }
    })
    return outcome.value
  })
}
