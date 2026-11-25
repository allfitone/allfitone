/**
 * The native half of the corrections proposed to her (`OP-EXE-020`, `OP-EXE-013`): the
 * stored session, the bearer header and `expo-crypto`. Split from `corrections.ts` so
 * that file stays loadable by the test runner.
 *
 * There is no read of one proposal, so «Corrección propuesta» finds hers in the list.
 * A decision is a command: the screen keeps the headers of an unanswered press and sends
 * the same ones again, so a retry after a lost answer replays instead of colliding.
 */

import { newCommand, type CommandHeaders } from '@allfitone/contracts/commands'
import * as Crypto from 'expo-crypto'

import type { CorrectionDecision, CorrectionPage, CorrectionProposal } from './corrections'
import type { FinishedExecution } from './execution'
import { authorizedGet, authorizedPost } from './index'
import { authenticated } from './session'

const LIST = '/space/v1/correction-proposals'
const PAGE_SIZE = 100
// A bound on a runaway cursor, far above what thirty-day proposals can accumulate.
const MAX_PAGES = 10

export const corrections = {
  command: (): CommandHeaders =>
    newCommand(
      { randomBytes: (length) => Crypto.getRandomValues(new Uint8Array(length)) },
      Date.now(),
    ),

  /** Every proposal made to her, following the cursor. */
  async list(status?: 'pending'): Promise<CorrectionProposal[]> {
    const all: CorrectionProposal[] = []
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (status) query.set('status', status)
      if (cursor) query.set('cursor', cursor)
      const read: CorrectionPage = await authenticated((token) =>
        authorizedGet<CorrectionPage>(`${LIST}?${query.toString()}`, token),
      )
      all.push(...read.data)
      cursor = read.page.has_more ? read.page.next_cursor : null
      if (!cursor) break
    }
    return all
  },

  decide: (proposalId: string, decision: CorrectionDecision, command: CommandHeaders) =>
    authenticated((token) =>
      authorizedPost<CorrectionProposal>(
        `${LIST}/${proposalId}/decision`,
        command,
        { decision },
        token,
      ),
    ),

  /** The sessions the proposals point at; one that cannot be read is left out. */
  async sessions(
    executionIds: readonly string[],
    timezone: string,
  ): Promise<ReadonlyMap<string, FinishedExecution>> {
    const unique = [...new Set(executionIds)]
    const read = await Promise.all(
      unique.map((id) =>
        authenticated((token) =>
          authorizedGet<FinishedExecution>(
            `/space/v1/executions/${id}/detail?timezone=${encodeURIComponent(timezone)}`,
            token,
          ),
        ).catch(() => undefined),
      ),
    )
    return new Map(
      read.flatMap((detail) => (detail ? [[detail.executed_session_id, detail] as const] : [])),
    )
  },
}
