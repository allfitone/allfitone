/**
 * How a person's notices are asked of PostgreSQL (`OP-IDN-074`, `OP-IDN-075`).
 *
 * The cursor's instant and id must land where the function takes them, and no cursor must
 * travel as two nulls rather than as anything invented.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { createSpaceNoticesDatabase } from './space-notices.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: () => unknown,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : answer())
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const HOLDER = { issuer: 'https://issuer.test', subject: 'user_1', requestId: 'request-1' }
const NOTICE = '019b8000-0000-7000-8000-000000000001'
const PAGE = { items: [], has_more: false, awaiting_count: 0, unread_count: 0 }

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the Space notices bindings', () => {
  test('T-IDN-UNIT-08 a first page sends no cursor, a later one the instant and id it continues after', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(recordingDatabase(captured, () => [{ page: PAGE }]))

    await createSpaceNoticesDatabase().list({ ...HOLDER, filter: 'all', limit: 30 })
    await createSpaceNoticesDatabase().list({
      ...HOLDER,
      filter: 'awaiting',
      limit: 30,
      after: { occurredAt: '2026-11-25T10:00:00+00:00', noticeId: NOTICE },
    })

    expect(captured[1]?.text).toContain('identity.list_my_notices(')
    expect(captured[1]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      'all',
      30,
      null,
      null,
    ])
    expect(captured[3]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      'awaiting',
      30,
      '2026-11-25T10:00:00+00:00',
      NOTICE,
    ])
  })

  test('T-IDN-UNIT-09 marking read names the notice, and an answer without it is a failure', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(recordingDatabase(captured, () => [{ notice: { id: NOTICE } }]))
    await createSpaceNoticesDatabase().markRead({ ...HOLDER, noticeId: NOTICE })
    expect(captured[1]?.text).toContain('identity.mark_my_notice_read(')
    expect(captured[1]?.values).toEqual(['workos', 'https://issuer.test', 'user_1', NOTICE])

    await setDatabase(recordingDatabase([], () => [{ notice: null }]))
    await expect(
      createSpaceNoticesDatabase().markRead({ ...HOLDER, noticeId: NOTICE }),
    ).rejects.toThrow('PostgreSQL did not mark the notice read')
  })
})
