import { describe, expect, test } from 'bun:test'

import {
  ConsentTextNotInForce,
  type ConsentRow,
  type IntelligenceDatabase,
} from '../domain/index.js'
import { createSpaceIntelligenceService } from './index.js'

const PERSON = '019f1400-0000-7000-8000-000000000001'
const command = {
  idempotencyKey: 'f7111111-1111-4111-8111-111111111401',
  commandId: '019f1400-0000-7000-8000-000000000401',
  requestHash: new Uint8Array(32),
}
const nothing: ConsentRow = { accepted_version: null, accepted_at: null, withdrawn_at: null }

function harness(current: string | null, held: ConsentRow | null = nothing) {
  const given: string[] = []
  let withdrawals = 0
  const database: IntelligenceDatabase = {
    readConsent: async () => held,
    giveConsent: async ({ version }) => {
      given.push(version)
      return { accepted_version: version, accepted_at: '2026-12-01T12:00:00Z', withdrawn_at: null }
    },
    withdrawConsent: async () => {
      withdrawals += 1
      return { ...nothing, withdrawn_at: '2026-12-02T12:00:00Z' }
    },
  }
  return {
    service: createSpaceIntelligenceService(database, current),
    given,
    withdrawals: () => withdrawals,
  }
}

describe('the AI consent, as the person reads and decides it (ADR-053)', () => {
  test('T-ITL-API-UNIT-01 the text in force is the API’s to say, and what she holds is the database’s', async () => {
    const held = {
      accepted_version: '2026-12-01',
      accepted_at: '2026-12-01T12:00:00Z',
      withdrawn_at: null,
    }
    expect(
      await harness('2026-12-15', held).service.readConsent({ personId: PERSON, requestId: '' }),
    ).toEqual({ current_version: '2026-12-15', ...held })
  })

  test('T-ITL-API-UNIT-02 a person the database does not answer for holds nothing', async () => {
    expect(
      await harness('2026-12-01', null).service.readConsent({ personId: PERSON, requestId: '' }),
    ).toEqual({ current_version: '2026-12-01', ...nothing })
  })

  test('T-ITL-API-UNIT-03 only the text in force can be given', async () => {
    const { service, given } = harness('2026-12-15')
    expect(
      service.giveConsent({ personId: PERSON, version: '2026-12-01', ...command }),
    ).rejects.toBeInstanceOf(ConsentTextNotInForce)
    await Promise.resolve()
    expect(given).toEqual([])

    expect(
      await service.giveConsent({ personId: PERSON, version: '2026-12-15', ...command }),
    ).toMatchObject({ current_version: '2026-12-15', accepted_version: '2026-12-15' })
    expect(given).toEqual(['2026-12-15'])
  })

  test('T-ITL-API-UNIT-04 with no text in force nothing can be given, whatever is published', async () => {
    const { service, given } = harness(null)
    expect(
      service.giveConsent({ personId: PERSON, version: '2026-12-01', ...command }),
    ).rejects.toBeInstanceOf(ConsentTextNotInForce)
    await Promise.resolve()
    expect(given).toEqual([])
    expect(await service.readConsent({ personId: PERSON, requestId: '' })).toEqual({
      current_version: null,
      ...nothing,
    })
  })

  test('T-ITL-API-UNIT-05 withdrawing needs no text in force, and answers what is left', async () => {
    const { service, withdrawals } = harness(null)
    expect(await service.withdrawConsent({ personId: PERSON, ...command })).toEqual({
      current_version: null,
      accepted_version: null,
      accepted_at: null,
      withdrawn_at: '2026-12-02T12:00:00Z',
    })
    expect(withdrawals()).toBe(1)
  })
})
