/**
 * PostgreSQL access for the AI consent.
 *
 * Every call is a closed function: the runtime role has no privilege on the tables of
 * `intelligence`. Each runs in a transaction that names the person as the actor, and the
 * functions answer only to her.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureStudioRequestPhase } from '../../../platform/observability/index.js'
import type { ConsentRow, IntelligenceDatabase } from '../domain/index.js'

export function createIntelligenceDatabase(): IntelligenceDatabase {
  const sql = database()

  return {
    readConsent: (input) =>
      transact(sql, input.personId, input.requestId, async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.read_consent(${input.personId}::uuid) as consent
        `
        return row?.consent ?? null
      }),

    giveConsent: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.give_consent(
            ${input.personId}::uuid, ${input.version},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as consent
        `
        if (!row?.consent) throw new Error('PostgreSQL did not record the consent')
        return row.consent
      }),

    withdrawConsent: (input) =>
      transact(sql, input.personId, '', async (transaction) => {
        const [row] = await transaction<{ consent: ConsentRow | null }[]>`
          select intelligence.withdraw_consent(
            ${input.personId}::uuid,
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          ) as consent
        `
        if (!row?.consent) throw new Error('PostgreSQL did not record the withdrawal')
        return row.consent
      }),
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
      // Transaction-local: session-scoped config does not survive the pooler.
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
