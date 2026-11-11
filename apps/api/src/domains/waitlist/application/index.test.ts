/**
 * `T-WL-UNIT-01` — what the waitlist does before the database: fingerprints, tokens and
 * disposable addresses (ADR-050, invariant 3 and mandatory scenario 3).
 */

import { describe, expect, test } from 'bun:test'

import { createWaitlistToken, hashInvitationToken } from '@allfitone/notifications'

import { isDisposableEmail } from '../domain/disposable-email-domains.js'
import type {
  WaitlistDatabase,
  WaitlistEmailTokens,
  WaitlistFingerprints,
  WaitlistJoinInput,
} from '../domain/index.js'
import { connectionOf, createWaitlistService } from './index.js'

const TOKEN_KEY = Buffer.alloc(32, 7).toString('base64')
const ENVIRONMENT = {
  INVITATION_TOKEN_ACTIVE_VERSION: '1',
  INVITATION_TOKEN_KEY_V1: TOKEN_KEY,
  WAITLIST_FINGERPRINT_KEY: Buffer.alloc(32, 9).toString('base64'),
}
const INPUT: WaitlistJoinInput = {
  name: 'Ana Ruiz',
  email: 'ana.ruiz@gmail.com',
  language: 'es',
  policyVersion: '2026-11-10',
}

function setup(environment: NodeJS.ProcessEnv = ENVIRONMENT) {
  const seen: {
    fingerprints: WaitlistFingerprints[]
    tokens: WaitlistEmailTokens[]
    confirmed: Array<{ hash: Uint8Array; connection: Uint8Array }>
  } = { fingerprints: [], tokens: [], confirmed: [] }
  const database: WaitlistDatabase = {
    join: async (_input, fingerprints, tokens) => {
      seen.fingerprints.push(fingerprints)
      seen.tokens.push(tokens)
      return { outcome: 'joined', referralCode: 'KEVN7QHX', referrals: 0 }
    },
    confirm: async (hash, connection) => {
      seen.confirmed.push({ hash, connection })
      return 'confirmed'
    },
    requestEmail: async (_email, connection, tokens) => {
      seen.fingerprints.push({ connection })
      seen.tokens.push(tokens)
      return 'accepted'
    },
  }
  return { seen, service: createWaitlistService(database, environment) }
}

const hex = (bytes: Uint8Array | undefined) => Buffer.from(bytes ?? []).toString('hex')

describe('T-WL-UNIT-01 connections', () => {
  test('an IPv4 address is its own connection', () => {
    expect(connectionOf(' 203.0.113.7 ')).toBe('203.0.113.7')
  })

  test('an IPv6 address is its /64, however it is written', () => {
    expect(connectionOf('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3:8d3::/64')
    expect(connectionOf('2001:0DB8:85A3:08D3::1')).toBe('2001:db8:85a3:8d3::/64')
    expect(connectionOf('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(connectionOf('::1')).toBe('0:0:0:0::/64')
  })

  test('an IPv4 address inside IPv6 is that IPv4 connection', () => {
    expect(connectionOf('::ffff:203.0.113.7')).toBe('203.0.113.7')
  })

  test('what is not an address has no connection', () => {
    expect(connectionOf('not-an-address')).toBeUndefined()
    expect(connectionOf('')).toBeUndefined()
  })
})

describe('T-WL-UNIT-01 fingerprints', () => {
  test('neither the address nor the device reaches the database in clear', async () => {
    const { seen, service } = setup()

    await service.join(INPUT, { address: '203.0.113.7', device: 'device-0123456789abcdef' })

    const [fingerprints] = seen.fingerprints
    expect(fingerprints?.connection).toHaveLength(32)
    expect(fingerprints?.device).toHaveLength(32)
    const travelled = hex(fingerprints?.connection) + hex(fingerprints?.device)
    expect(travelled).not.toContain(Buffer.from('203.0.113.7').toString('hex'))
    expect(travelled).not.toContain(Buffer.from('device-0123456789abcdef').toString('hex'))
  })

  test('two visitors in one IPv6 /64 are one connection, and another /64 is another', async () => {
    const { seen, service } = setup()

    await service.join(INPUT, { address: '2001:db8:85a3:8d3::1' })
    await service.join(INPUT, { address: '2001:db8:85a3:8d3:ffff::2' })
    await service.join(INPUT, { address: '2001:db8:85a3:8d4::1' })

    const [first, second, third] = seen.fingerprints.map((entry) => hex(entry.connection))
    expect(second).toBe(first ?? '')
    expect(third).not.toBe(first)
    expect(seen.fingerprints[0]?.device).toBeUndefined()
  })

  test('the hash depends on the key, so the tables alone cannot be reversed', async () => {
    const one = setup()
    const other = setup({
      ...ENVIRONMENT,
      WAITLIST_FINGERPRINT_KEY: Buffer.alloc(32, 3).toString('base64'),
    })

    await one.service.join(INPUT, { address: '203.0.113.7' })
    await other.service.join(INPUT, { address: '203.0.113.7' })

    expect(hex(one.seen.fingerprints[0]?.connection)).not.toBe(
      hex(other.seen.fingerprints[0]?.connection),
    )
  })

  test('without the fingerprint key nothing is sent to the database', async () => {
    const { seen, service } = setup({ ...ENVIRONMENT, WAITLIST_FINGERPRINT_KEY: '' })

    await expect(service.join(INPUT, { address: '203.0.113.7' })).rejects.toThrow(
      'WAITLIST_FINGERPRINT_KEY',
    )
    expect(seen.fingerprints).toEqual([])
  })

  test('a visitor address that is not an address is refused', async () => {
    const { service } = setup()

    await expect(service.join(INPUT, { address: 'nope' })).rejects.toMatchObject({
      code: 'invalid-visitor',
    })
  })
})

describe('T-WL-UNIT-01 tokens', () => {
  test('each email gets two fresh tokens, and only their hashes travel', async () => {
    const { seen, service } = setup()

    await service.join(INPUT, { address: '203.0.113.7' })
    await service.requestEmail('ana.ruiz@gmail.com', { address: '203.0.113.7' })

    const [first, second] = seen.tokens
    const ids = [first, second].flatMap((tokens) => [
      tokens?.confirmation.id,
      tokens?.privateLink.id,
    ])
    expect(new Set(ids).size).toBe(4)
    expect(first?.keyVersion).toBe(1)
    // The worker derives the same token from the identifier and the key.
    expect(hex(first?.confirmation.hash)).toBe(
      hex(hashInvitationToken(createWaitlistToken(first?.confirmation.id ?? '', TOKEN_KEY))),
    )
  })

  test('confirming sends the hash of the token, never the token', async () => {
    const { seen, service } = setup()
    const token = createWaitlistToken('0199b000-0000-7000-8000-000000000031', TOKEN_KEY)

    await service.confirm(token, { address: '203.0.113.7' })

    expect(hex(seen.confirmed[0]?.hash)).toBe(hex(hashInvitationToken(token)))
  })
})

describe('T-WL-UNIT-01 disposable addresses', () => {
  test('a listed provider is refused before the database is asked', async () => {
    const { seen, service } = setup()

    await expect(
      service.join({ ...INPUT, email: 'ana@Mailinator.com' }, { address: '203.0.113.7' }),
    ).rejects.toMatchObject({ code: 'disposable-email' })
    expect(seen.tokens).toEqual([])
  })

  test('a subdomain of a listed provider is refused with it', () => {
    expect(isDisposableEmail('ana@inbox.yopmail.com')).toBe(true)
  })

  test('an ordinary provider is not, even when its name ends like a listed one', () => {
    expect(isDisposableEmail('ana@gmail.com')).toBe(false)
    expect(isDisposableEmail('ana@notmailinator.com')).toBe(false)
    expect(isDisposableEmail('ana@empresa.com.co')).toBe(false)
  })
})
