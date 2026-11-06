import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createCorrectionProposalExpiryProcessor } from './correction-proposal-expiry.js'

// What the sweep does is `T-EXE-PROPOSAL-DECIDE-01` SYS; this holds who runs it and how.
function recordingSql(answer: (text: string) => unknown[]) {
  const statements: string[] = []
  const values: unknown[][] = []
  const transaction = (strings: TemplateStringsArray, ...bound: unknown[]) => {
    const text = strings.join('$')
    statements.push(text)
    values.push(bound)
    return Promise.resolve(answer(text))
  }
  const sql = {
    begin: (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
  } as unknown as postgres.Sql
  return { sql, statements, values }
}

describe('the thirty days of a proposal run out (OP-SYS-004)', () => {
  test('runs as the worker, before the sweep, inside one transaction', async () => {
    const { sql, statements, values } = recordingSql((text) =>
      text.includes('expire_correction_proposals') ? [{ expired: 3 }] : [{}],
    )

    const result = await createCorrectionProposalExpiryProcessor(sql)()

    expect(statements[0]).toContain("set_config('app.actor_kind', 'worker', true)")
    expect(statements[1]).toContain('execution.expire_correction_proposals(')
    expect(values[1]).toEqual([200])
    expect(result).toEqual({ claimed: 3, deadOrDelayed: 0, expired: 3 })
  })

  test('no answer at all is a failure, never zero expired', async () => {
    const { sql } = recordingSql(() => [])

    await expect(createCorrectionProposalExpiryProcessor(sql)()).rejects.toThrow()
  })
})
