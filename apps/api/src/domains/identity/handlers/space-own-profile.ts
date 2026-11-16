/**
 * A person's own profile and identity on /space/v1: `OP-IDN-012`, `OP-IDN-013`,
 * `OP-IDN-021` and `OP-IDN-022` (the phone, ADR-050; the email change, TECH-44),
 * `OP-IDN-063`, `OP-IDN-064`, `OP-IDN-065`.
 *
 * `HU-SP-009`, `HU-SP-013`, `HU-SP-023`, `HU-SP-096` criterion 4 and `HU-SP-098`
 * criterion 6. Everything here is about the person the token resolves to, so no route
 * takes a person, and a read refuses any query rather than ignoring one a client may
 * believe was honoured.
 *
 * The profile claims a person answers from her profile — goal, experience, days, time
 * and place — still travel through `OP-IDN-004` on the onboarding routes, because that
 * command never belonged to the attempt.
 */

import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import type { OwnProfileService } from '../application/own-profile.js'
import { spaceOwnProfileService } from '../dependencies.js'
import {
  AVAILABLE_EQUIPMENT,
  BIOLOGICAL_SEXES,
  MAX_NAME_LENGTH,
  CODE,
  EMAIL_SHAPE,
  MAX_EMAIL_LENGTH,
  MAX_PHONE_LENGTH,
  USERNAME,
  e164Phone,
  type AvailableEquipmentPiece,
  type SpaceContactPhone,
  type SpaceEmailChange,
  type SpaceOwnBiologicalSex,
  type SpaceOwnName,
} from '../domain/own-profile.js'
import {
  exactObject,
  isJsonRequest,
  onlyQueryKeys,
  readJson,
  spaceCommand,
  spaceFailure,
  spaceTokenVerifier,
  verifiedSpaceToken,
  type TokenVerifier,
} from '../../../platform/http/space-requests.js'

const NO_PARAMETERS: ReadonlySet<string> = new Set()
const OPERATION = 'space-own-profile'

export function spaceOwnProfileRoutes(
  injectedService?: OwnProfileService,
  injectedVerifier?: TokenVerifier,
): Hono {
  const own = () => injectedService ?? spaceOwnProfileService()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.get('/me', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!onlyQueryKeys(c, NO_PARAMETERS)) return problem(c, 'invalid-request')

    try {
      return c.json(await own().readIdentity(token))
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.get('/profile', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!onlyQueryKeys(c, NO_PARAMETERS)) return problem(c, 'invalid-request')

    try {
      return c.json(await own().readProfile(token))
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.post('/me/name', (c) =>
    runCommand(c, verify, ownName, (token, command, name) =>
      own().correctName(token, { ...command, name }),
    ),
  )

  // One route, two different commands: the phone is saved, the email only asked for.
  routes.patch('/me/contact', (c) =>
    runCommand<Contact, SpaceContactPhone | SpaceEmailChange>(
      c,
      verify,
      ownContact,
      (token, command, contact) =>
        'email' in contact
          ? own().requestEmailChange(token, { ...command, email: contact.email })
          : own().correctPhone(token, { ...command, phone: contact.phone }),
      (resource) => c.json(resource, 'status' in resource ? 202 : 200),
    ),
  )

  routes.post('/me/contact/verification', (c) =>
    runCommand(
      c,
      verify,
      ownCode,
      (token, command, { code }) =>
        own().verifyEmailChange(token, { ...command, code, sessionId: token.sessionId }),
      ({ outcome }) =>
        outcome === 'applying'
          ? c.json({ outcome }, 200)
          : problem(c, outcome === 'too_many_attempts' ? 'conflict' : 'validation-failed'),
    ),
  )

  routes.post('/profile/biological-sex', (c) =>
    runCommand(c, verify, ownBiologicalSex, (token, command, sex) =>
      own().correctBiologicalSex(token, { ...command, sex }),
    ),
  )

  routes.post('/profile/equipment', (c) =>
    runCommand(c, verify, ownEquipment, (token, command, equipment) =>
      own().declareEquipment(token, { ...command, equipment }),
    ),
  )

  return routes
}

type Token = NonNullable<Awaited<ReturnType<typeof verifiedSpaceToken>>>
type Command = NonNullable<ReturnType<typeof spaceCommand>>

async function runCommand<T, R>(
  c: Context,
  verify: TokenVerifier,
  read: (body: unknown) => T | undefined,
  execute: (token: Token, command: Command, body: T) => Promise<{ resource: R; replayed: boolean }>,
  answer: (resource: R) => Response = (resource) => c.json(resource, 200),
) {
  const token = await verifiedSpaceToken(c, verify)
  if (!token) return problem(c, 'unauthenticated')
  if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
  const body = read(await readJson(c))
  if (body === undefined) return problem(c, 'validation-failed')
  const command = spaceCommand(c, body)
  if (!command) return problem(c, 'invalid-request')

  try {
    const result = await execute(token, command, body)
    if (result.replayed) c.header('Idempotent-Replay', 'true')
    return answer(result.resource)
  } catch (error) {
    return spaceFailure(c, error, OPERATION)
  }
}

function ownName(body: unknown): SpaceOwnName | undefined {
  const fields = exactObject(body, ['given_name', 'family_name', 'username'])
  if (!fields) return undefined
  const { given_name: given, family_name: family, username } = fields
  if (!isName(given) || !isName(family)) return undefined
  if (typeof username !== 'string' || !USERNAME.test(username.trim())) return undefined
  return { given_name: given, family_name: family, username }
}

function isName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.trim().length <= MAX_NAME_LENGTH
}

type Contact = { phone: string | null } | { email: string }

function ownContact(body: unknown): Contact | undefined {
  const email = exactObject(body, ['email'])
  if (email) {
    const typed = email.email
    if (typeof typed !== 'string' || typed.length > MAX_EMAIL_LENGTH) return undefined
    return EMAIL_SHAPE.test(typed.trim()) ? { email: typed } : undefined
  }
  const fields = exactObject(body, ['phone'])
  if (!fields) return undefined
  if (fields.phone === null) return { phone: null }
  if (typeof fields.phone !== 'string' || fields.phone.length > MAX_PHONE_LENGTH) return undefined
  const phone = e164Phone(fields.phone)
  return phone === undefined ? undefined : { phone }
}

function ownCode(body: unknown): { code: string } | undefined {
  const fields = exactObject(body, ['code'])
  return fields && typeof fields.code === 'string' && CODE.test(fields.code)
    ? { code: fields.code }
    : undefined
}

function ownBiologicalSex(body: unknown): SpaceOwnBiologicalSex | undefined {
  const fields = exactObject(body, ['biological_sex'])
  if (!fields) return undefined
  if (fields.biological_sex === null) return { biological_sex: null }
  const sex = BIOLOGICAL_SEXES.find((known) => known === fields.biological_sex)
  return sex ? { biological_sex: sex } : undefined
}

function ownEquipment(body: unknown): AvailableEquipmentPiece[] | undefined {
  const fields = exactObject(body, ['equipment'])
  if (!fields || !Array.isArray(fields.equipment)) return undefined
  const pieces: unknown[] = fields.equipment
  if (pieces.length === 0 || new Set(pieces).size !== pieces.length) return undefined
  const known = pieces.filter((piece): piece is AvailableEquipmentPiece =>
    AVAILABLE_EQUIPMENT.some((code) => code === piece),
  )
  return known.length === pieces.length ? known : undefined
}
