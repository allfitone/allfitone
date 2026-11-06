/**
 * `OP-SYS-004`: a correction proposal nobody answered expires after thirty days.
 *
 * Nothing else notices the deadline pass: no command happens at `expires_at`. The rule is
 * the database's (`execution.expire_correction_proposals`), which marks the proposal
 * expired and applies nothing; this only runs it on the minute job, as the worker, so the
 * expiry is a fact of the clock attributed to nobody. Until it runs, her decision and the
 * Studio list already read the proposal as expired, so a late sweep changes no answer.
 */

import type postgres from 'postgres'

export interface CorrectionProposalExpiryResult {
  claimed: number
  deadOrDelayed: number
  expired: number
}

// A backlog drains over a few minutes rather than in one long transaction.
const BATCH = 200

export function createCorrectionProposalExpiryProcessor(
  sql: postgres.Sql,
): () => Promise<CorrectionProposalExpiryResult> {
  return async () => {
    const expired = await sql.begin(async (transaction) => {
      await transaction`select set_config('app.actor_kind', 'worker', true)`
      const [row] = await transaction<
        { expired: number }[]
      >`select execution.expire_correction_proposals(${BATCH}::integer) as expired`
      if (!row) throw new Error('PostgreSQL did not answer the correction proposal sweep')
      return row.expired
    })
    return { claimed: expired, deadOrDelayed: 0, expired }
  }
}
