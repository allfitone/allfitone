/**
 * How her access log reaches PostgreSQL (`OP-PRV-015`).
 *
 * The route tests mock the service and the pgTAP tests call the function directly, so
 * neither would notice the cursor bound out of order, or a page asked without the row
 * that says whether there is another.
 */
import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createMyAccessLogDatabase } from './index.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

const PERSON = '019c8000-0000-7000-8000-000000000002'
const ROW = {
  id: '019c8000-0000-7000-8000-000000000e01',
  cursor_at: '2026-11-08T14:00:00.123456Z',
  occurred_at: '2026-11-08T14:00:00.123456+00:00',
  actor_kind: 'allfit_team',
  actor_display_name: 'Sofia Support',
  organization_id: null,
  organization_display_name: null,
  attendance: null,
  access_mode: 'break_glass',
  scope_code: null,
  scope_version: null,
  resource: 'identity.people',
  result: 'allowed',
}

function recordingDatabase(captured: CapturedQuery[], rows: unknown[]) {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : rows)
    },
    { begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client) },
  )
  return client as unknown as ReturnType<typeof postgres>
}

describe('her access log binding', () => {
  test('acts as her, asks one row more than the page, and resumes after the cursor', async () => {
    const captured: CapturedQuery[] = []
    const page = await createMyAccessLogDatabase(recordingDatabase(captured, [ROW, ROW])).listMine({
      personId: PERSON,
      limit: 1,
      scopeCode: 'body_progress',
      cursor: { at: '2026-11-08T15:00:00.000001Z', id: '019c8000-0000-7000-8000-000000000e02' },
    })
    expect(captured[0]?.values).toEqual([PERSON])
    const call = captured.find((query) => query.text.includes('list_my_access_events'))
    expect(call?.values).toEqual([
      PERSON,
      'body_progress',
      2,
      '2026-11-08T15:00:00.000001Z',
      '019c8000-0000-7000-8000-000000000e02',
    ])
    expect(page).toEqual({
      items: [
        {
          occurred_at: ROW.occurred_at,
          actor: { kind: 'allfit_team', display_name: 'Sofia Support' },
          organization: null,
          attendance: null,
          access_mode: 'break_glass',
          scope_code: null,
          scope_version: null,
          resource: 'identity.people',
          result: 'allowed',
        },
      ],
      hasMore: true,
      last: { at: ROW.cursor_at, id: ROW.id },
    })
  })
})
