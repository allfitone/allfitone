/**
 * PostgreSQL access for a person changing her password (`OP-IDN-066`, ADR-051).
 *
 * Three short transactions rather than one, because WorkOS answers between them and no
 * transaction may stay open across a call to the provider. None of them sees a password.
 */

import type postgres from 'postgres'

import { database } from '../../../platform/db/index.js'
import { measureRequestPhase } from '../../../platform/observability/index.js'
import type { PasswordChangeDatabase, PasswordChangeState } from '../domain/password-change.js'

const PROVIDER = 'workos'

export function createPasswordChangeDatabase(): PasswordChangeDatabase {
  const sql = database()

  return {
    prepare: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ password_state: string; sign_in_email: string | null }[]>`
          select password_state, sign_in_email from identity.prepare_password_change(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.idempotencyKey}::uuid
          )
        `
        if (!row) throw new Error('PostgreSQL did not prepare the password change')
        return stateOf(row.password_state, row.sign_in_email)
      }),

    reject: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        await transaction`
          select identity.reject_password_change(${PROVIDER}, ${input.issuer}, ${input.subject})
        `
      }),

    record: (input) =>
      withinRequest(sql, input.requestId, async (transaction) => {
        const [row] = await transaction<{ replayed: boolean }[]>`
          select replayed from identity.record_password_change(
            ${PROVIDER}, ${input.issuer}, ${input.subject}, ${input.keepSessionId},
            ${input.idempotencyKey}::uuid, ${input.commandId}::uuid, ${input.requestHash}
          )
        `
        if (!row) throw new Error('PostgreSQL did not record the password change')
        return { replayed: row.replayed }
      }),
  }
}

function stateOf(state: string, signInEmail: string | null): PasswordChangeState {
  if (state === 'replayed') return { state: 'replayed' }
  if (state === 'too_many_attempts') return { state: 'too_many_attempts' }
  if (state === 'ready' && signInEmail) return { state: 'ready', signInEmail }
  throw new Error('PostgreSQL prepared the password change in an unknown state')
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
