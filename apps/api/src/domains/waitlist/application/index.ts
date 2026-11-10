/**
 * Use cases of the Allfit Space waitlist: join, confirm the email, ask for the email
 * again (`OP-WL-001` to `OP-WL-003`).
 *
 * The rules that decide anything live in PostgreSQL: one sign-up per mailbox, what does
 * not count, the limits per connection, which token is still good. What happens here is
 * what the database cannot do for itself:
 *
 * - **Fingerprints.** The visitor's address and device are hashed with a key the
 *   database never sees, so a copy of its tables cannot be turned back into either
 *   (ADR-050, invariant 3). An IPv6 address is cut to its `/64`, the block a home or a
 *   phone gets, so one visitor is one connection.
 * - **Tokens.** Each email carries tokens derived from fresh identifiers with the
 *   versioned invitation key. Only their hashes travel to the database; the worker
 *   derives them again when it writes the email.
 * - **Disposable addresses** are refused before anything is written.
 */

import { createHmac, randomUUID } from 'node:crypto'
import { isIP } from 'node:net'

import {
  activeInvitationTokenKeyVersion,
  createWaitlistToken,
  hashInvitationToken,
  invitationTokenKey,
} from '@allfitone/notifications'

import { isDisposableEmail } from '../domain/disposable-email-domains.js'
import {
  WaitlistError,
  type WaitlistConfirmationResult,
  type WaitlistDatabase,
  type WaitlistEmailRequestResult,
  type WaitlistEmailTokens,
  type WaitlistFingerprints,
  type WaitlistJoinInput,
  type WaitlistJoinResult,
  type WaitlistVisitor,
} from '../domain/index.js'

export interface WaitlistService {
  join(input: WaitlistJoinInput, visitor: WaitlistVisitor): Promise<WaitlistJoinResult>
  confirm(token: string, visitor: WaitlistVisitor): Promise<WaitlistConfirmationResult>
  requestEmail(email: string, visitor: WaitlistVisitor): Promise<WaitlistEmailRequestResult>
}

export function createWaitlistService(
  database: WaitlistDatabase,
  environment: NodeJS.ProcessEnv = process.env,
): WaitlistService {
  function emailTokens(): WaitlistEmailTokens {
    const keyVersion = activeInvitationTokenKeyVersion(environment)
    const key = invitationTokenKey(keyVersion, environment)
    const record = () => {
      const id = randomUUID()
      return { id, hash: hashInvitationToken(createWaitlistToken(id, key)) }
    }
    return { confirmation: record(), privateLink: record(), keyVersion }
  }

  return {
    async join(input, visitor) {
      if (isDisposableEmail(input.email)) throw new WaitlistError('disposable-email')
      return database.join(input, fingerprints(visitor, environment), emailTokens())
    },

    async confirm(token, visitor) {
      return database.confirm(
        hashInvitationToken(token),
        fingerprints(visitor, environment).connection,
      )
    },

    async requestEmail(email, visitor) {
      return database.requestEmail(
        email,
        fingerprints(visitor, environment).connection,
        emailTokens(),
      )
    },
  }
}

function fingerprints(
  visitor: WaitlistVisitor,
  environment: NodeJS.ProcessEnv,
): WaitlistFingerprints {
  const connection = connectionOf(visitor.address)
  if (!connection) throw new WaitlistError('invalid-visitor')
  const key = fingerprintKey(environment)
  const keyed = (label: string, value: string) =>
    createHmac('sha256', key).update(`${label}\u0000${value}`, 'utf8').digest()
  return {
    connection: keyed('connection', connection),
    ...(visitor.device ? { device: keyed('device', visitor.device) } : {}),
  }
}

function fingerprintKey(environment: NodeJS.ProcessEnv): Buffer {
  const key = Buffer.from(environment.WAITLIST_FINGERPRINT_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('WAITLIST_FINGERPRINT_KEY must decode to 32 bytes')
  return key
}

/**
 * The connection an address belongs to: an IPv4 address itself, or the `/64` of an IPv6
 * one. Undefined when it is not an address.
 */
export function connectionOf(address: string): string | undefined {
  const value = address.trim().toLowerCase()
  if (isIP(value) === 4) return value
  if (isIP(value) !== 6) return undefined

  // An IPv4 address written inside IPv6 is still that IPv4 connection.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
  if (mapped?.[1]) return mapped[1]

  const [head = '', tail] = value.split('::')
  const leading = head === '' ? [] : head.split(':')
  const trailing = tail === undefined || tail === '' ? [] : tail.split(':')
  const groups =
    tail === undefined
      ? leading
      : [...leading, ...Array<string>(8 - leading.length - trailing.length).fill('0'), ...trailing]
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16))
  return `${prefix.join(':')}::/64`
}
