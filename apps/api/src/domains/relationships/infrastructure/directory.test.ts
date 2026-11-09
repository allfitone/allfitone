/**
 * How the directory reaches PostgreSQL (`OP-REL-010`, HU-STUDIO-082).
 *
 * The handler tests mock the service and the pgTAP tests call the function directly, so
 * neither would notice the search bound in the wrong position, or an unsearched page sent
 * to the new signature that does not exist until the migration is applied.
 */
import { describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { createClientDirectoryDatabase } from './index.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

const QUOTA = { seats: null, occupied: 0, places_left: null, over_quota: false }

function recordingDatabase(captured: CapturedQuery[]): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      if (text.includes('studio_guest_quota')) return Promise.resolve([QUOTA])
      return Promise.resolve(text.includes('set_config') ? [{}] : [])
    },
    { begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client) },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019ae100-0000-7000-8000-000000000012'
const ORGANIZATION = '019ae100-0000-7000-8000-000000000101'

function directoryCall(captured: CapturedQuery[]): CapturedQuery {
  const call = captured.find((query) => query.text.includes('list_organization_clients'))
  if (!call) throw new Error('the directory was not read')
  return call
}

describe('the directory binding', () => {
  test('an unsearched page calls the signature that exists before the migration', async () => {
    const captured: CapturedQuery[] = []
    await createClientDirectoryDatabase(recordingDatabase(captured)).listClients(COACH, {
      organizationId: ORGANIZATION,
      limit: 50,
    })
    const call = directoryCall(captured)
    expect(call.values).toEqual([COACH, ORGANIZATION, null, 51, null, null, null])
  })

  test('a search is bound last, after the cursor', async () => {
    const captured: CapturedQuery[] = []
    await createClientDirectoryDatabase(recordingDatabase(captured)).listClients(COACH, {
      organizationId: ORGANIZATION,
      status: 'active',
      limit: 10,
      cursorGroup: 'active',
      cursorName: 'ana alvarez',
      cursorId: '019ae100-0000-7000-8000-000000000301',
      query: 'José',
    })
    const call = directoryCall(captured)
    expect(call.values).toEqual([
      COACH,
      ORGANIZATION,
      'active',
      11,
      'active',
      'ana alvarez',
      '019ae100-0000-7000-8000-000000000301',
      'José',
    ])
  })
})
