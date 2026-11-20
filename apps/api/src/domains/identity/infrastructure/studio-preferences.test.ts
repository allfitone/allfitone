/**
 * How a person's Studio preferences reach PostgreSQL (`OP-IDN-068`, `OP-IDN-069`).
 *
 * The handler tests mock the service and the pgTAP test calls the functions directly, so
 * neither would notice a binding in the wrong position: the idempotency key and the
 * command id are both UUIDs, and swapped they would still run. These assert the
 * bindings, the actor the transaction names and what the rows become.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { createStudioPreferencesDatabase } from './studio-preferences.js'

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

const PERSON = '019f8100-0000-7000-8000-000000000001'
const REQUEST = '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'
const KEY = 'a8111111-1111-4111-8111-111111111103'
const COMMAND = '019f8100-0000-7000-8000-000000000103'
const HASH = new Uint8Array(32).fill(0xa3)

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the Studio preferences bindings', () => {
  test('T-IDN-UNIT-01 the read names the person as the actor and asks for nobody else', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(recordingDatabase(captured, () => [{ preferences: { theme: null } }]))

    const read = await createStudioPreferencesDatabase().read({
      personId: PERSON,
      requestId: REQUEST,
    })

    expect(captured[0]?.text).toContain("set_config('app.actor_kind', 'person', true)")
    expect(captured[0]?.values).toEqual([PERSON, REQUEST])
    expect(captured[1]?.text).toContain('identity.read_studio_preferences(')
    expect(captured[1]?.values).toEqual([PERSON])
    expect(read).toEqual({ theme: null })
  })

  test('T-IDN-UNIT-02 the command binds theme, key, command id and hash where the function takes them', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, () => [{ preferences: { theme: 'light' }, replayed: true }]),
    )

    const kept = await createStudioPreferencesDatabase().put({
      personId: PERSON,
      theme: 'light',
      idempotencyKey: KEY,
      commandId: COMMAND,
      requestHash: HASH,
    })

    expect(captured[0]?.values).toEqual([PERSON, COMMAND])
    expect(captured[1]?.text).toContain('identity.put_studio_preferences(')
    expect(captured[1]?.values).toEqual([PERSON, 'light', KEY, COMMAND, HASH])
    expect(kept).toEqual({ resource: { theme: 'light' }, replayed: true })
  })

  test('T-IDN-UNIT-03 an answer without the document is a failure, never an invented default', async () => {
    await setDatabase(recordingDatabase([], () => []))
    await expect(
      createStudioPreferencesDatabase().read({ personId: PERSON, requestId: REQUEST }),
    ).rejects.toThrow('PostgreSQL did not return the Studio preferences')

    await setDatabase(recordingDatabase([], () => [{ preferences: null, replayed: false }]))
    await expect(
      createStudioPreferencesDatabase().put({
        personId: PERSON,
        theme: 'dark',
        idempotencyKey: KEY,
        commandId: COMMAND,
        requestHash: HASH,
      }),
    ).rejects.toThrow('PostgreSQL did not keep the Studio preferences')
  })
})
