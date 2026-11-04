/**
 * `HU-BO-033` criteria 1 and 4: a legal hold ends on its date, and what it let go is
 * deleted as the person asked.
 *
 * No command happens at a hold's `valid_to`, and releasing one only puts what it kept
 * back in the queue. The rules are the database's (`privacy.lapse_legal_holds` and
 * `privacy.execute_due_dispositions`); this runs them on the minute job, as the worker,
 * so both are facts of the clock attributed to nobody.
 *
 * Two transactions on purpose: a hold that lapsed stays lapsed even if an execution
 * after it fails, and the failure surfaces on the next run instead of undoing the lapse.
 */

import type postgres from 'postgres'

export interface PrivacyDispositionResult {
  claimed: number
  deadOrDelayed: number
  lapsed: number
  executed: number
}

const SWEEP_LIMIT = 100

export function createPrivacyDispositionProcessor(
  sql: postgres.Sql,
): () => Promise<PrivacyDispositionResult> {
  return async () => {
    const lapsed = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<
        { lapsed: number }[]
      >`select privacy.lapse_legal_holds() as lapsed`
      if (!row) throw new Error('PostgreSQL did not answer the legal hold sweep')
      return row.lapsed
    })
    const executed = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<{ executed: number }[]>`
        select privacy.execute_due_dispositions(${SWEEP_LIMIT}::integer) as executed
      `
      if (!row) throw new Error('PostgreSQL did not answer the disposition sweep')
      return row.executed
    })
    return { claimed: lapsed + executed, deadOrDelayed: 0, lapsed, executed }
  }
}
