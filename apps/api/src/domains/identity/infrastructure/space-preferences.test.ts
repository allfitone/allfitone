/**
 * How a person's units, language, channels and phones reach PostgreSQL (`OP-IDN-023`,
 * `OP-IDN-024`, `OP-IDN-070` to `OP-IDN-073`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly, so
 * neither would notice a binding in the wrong position: the idempotency key, the command
 * id and the device id are all UUIDs, and swapped they would still run. These assert the
 * bindings and that an answer without a document is a failure.
 */

import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { createSpacePreferencesDatabase } from './space-preferences.js'

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
      json: (value: unknown) => ({ json: value }),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const HOLDER = { issuer: 'https://issuer.test', subject: 'user_1', requestId: 'request-1' }
const KEY = 'a8111111-1111-4111-8111-111111111111'
const COMMAND = '019f8100-0000-7000-8000-000000000111'
const DEVICE = 'a4000000-0000-4000-8000-000000000001'
const HASH = new Uint8Array(32).fill(0xb1)
const COMMAND_INPUT = { idempotencyKey: KEY, commandId: COMMAND, requestHash: HASH }

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the Space preferences bindings', () => {
  test('T-IDN-UNIT-04 the units command binds each value, then key, command id and hash', async () => {
    const captured: CapturedQuery[] = []
    const units = { mass_unit: 'lb', distance_unit: null, locale: 'en' } as const
    await setDatabase(recordingDatabase(captured, () => [{ result: units, replayed: true }]))

    const kept = await createSpacePreferencesDatabase().putPreferences({
      ...HOLDER,
      ...COMMAND_INPUT,
      preferences: units,
    })

    expect(captured[0]?.values).toEqual(['request-1'])
    expect(captured[1]?.text).toContain('identity.put_my_preferences(')
    expect(captured[1]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      'lb',
      null,
      'en',
      KEY,
      COMMAND,
      HASH,
    ])
    expect(kept).toEqual({ resource: units, replayed: true })
  })

  test('T-IDN-UNIT-05 the channel set travels as one JSON parameter, serialized once by the driver', async () => {
    const captured: CapturedQuery[] = []
    const set = [{ category: 'security', channel: 'email', enabled: true }] as const
    await setDatabase(
      recordingDatabase(captured, () => [{ result: { preferences: [] }, replayed: false }]),
    )

    await createSpacePreferencesDatabase().putNotificationPreferences({
      ...HOLDER,
      ...COMMAND_INPUT,
      preferences: set,
    })

    expect(captured[1]?.text).toContain('identity.put_my_notification_preferences(')
    expect(captured[1]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      { json: set },
      KEY,
      COMMAND,
      HASH,
    ])
  })

  test('T-IDN-UNIT-06 a phone binds its id before its token and platform', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, () => [
        { result: { id: DEVICE, platform: 'ios' }, replayed: false },
      ]),
    )

    await createSpacePreferencesDatabase().registerPushDevice({
      ...HOLDER,
      ...COMMAND_INPUT,
      deviceId: DEVICE,
      device: { token: 'ExponentPushToken[x]', platform: 'ios' },
    })
    await createSpacePreferencesDatabase().retirePushDevice({
      ...HOLDER,
      ...COMMAND_INPUT,
      deviceId: DEVICE,
    })

    expect(captured[1]?.text).toContain('identity.register_my_push_device(')
    expect(captured[1]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      DEVICE,
      'ExponentPushToken[x]',
      'ios',
      KEY,
      COMMAND,
      HASH,
    ])
    expect(captured[3]?.text).toContain('identity.retire_my_push_device(')
    expect(captured[3]?.values).toEqual([
      'workos',
      'https://issuer.test',
      'user_1',
      DEVICE,
      KEY,
      COMMAND,
      HASH,
    ])
  })

  test('T-IDN-UNIT-07 an answer without the document is a failure, never an invented default', async () => {
    await setDatabase(recordingDatabase([], () => [{ result: null }]))
    await expect(createSpacePreferencesDatabase().readPreferences(HOLDER)).rejects.toThrow(
      'PostgreSQL did not read the preferences',
    )
    await expect(
      createSpacePreferencesDatabase().readNotificationPreferences(HOLDER),
    ).rejects.toThrow('PostgreSQL did not read the notification preferences')

    await setDatabase(recordingDatabase([], () => []))
    await expect(
      createSpacePreferencesDatabase().retirePushDevice({
        ...HOLDER,
        ...COMMAND_INPUT,
        deviceId: DEVICE,
      }),
    ).rejects.toThrow('PostgreSQL did not retire the phone')
  })
})
