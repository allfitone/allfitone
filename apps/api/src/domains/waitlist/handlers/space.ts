/**
 * Waitlist routes on /space/v1 (`OP-WL-001` to `OP-WL-003`).
 *
 * These are the only routes of the API a visitor with no account reaches, and they are
 * not reached directly: space-web calls them from its server, with a secret, and says
 * who the visitor is in two headers. Without the secret the routes answer `not-found`,
 * as if they were not there, because those headers decide what the attempt limits
 * count: a caller who could write them could choose the address being limited
 * (ADR-050, decision 4). The same answer covers a deployment where the secret is not
 * configured, so a missing setting closes the routes instead of opening them.
 *
 * Every answer is `no-store`, and none says more than the page shows: a repeated
 * address gets `already_listed` with nothing about the sign-up behind it, and asking
 * for the email again answers the same whether the address is on the list or not.
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import type { WaitlistService } from '../application/index.js'
import { waitlistService } from '../dependencies.js'
import { WaitlistError, type WaitlistJoinInput, type WaitlistVisitor } from '../domain/index.js'

const SECRET_HEADER = 'x-allfit-waitlist-secret'
const ADDRESS_HEADER = 'x-allfit-visitor-address'
const DEVICE_HEADER = 'x-allfit-visitor-device'

/** RFC 5321 caps the whole address here. */
const MAX_EMAIL_LENGTH = 254
const MAX_NAME_LENGTH = 80
const MAX_UTM_LENGTH = 64
const POLICY_VERSION = /^[A-Za-z0-9._-]{1,32}$/
const REFERRAL_CODE = /^[A-Za-z0-9]{4,16}$/
const DEVICE = /^[A-Za-z0-9_-]{16,128}$/
/** A derived token is 43 base64url characters; anything else is not one of ours. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export function spaceWaitlistRoutes(
  injectedService?: WaitlistService,
  environment: NodeJS.ProcessEnv = process.env,
): Hono {
  const waitlist = () => injectedService ?? waitlistService()
  const routes = new Hono()

  routes.use('/waitlist/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    if (!fromSpaceWeb(c.req.header(SECRET_HEADER), environment)) return problem(c, 'not-found')
    await next()
  })

  routes.post('/waitlist/signups', async (c) => {
    const visitor = readVisitor(c)
    const input = readJoin(await readJson(c.req.raw))
    if (!visitor || !input) return problem(c, 'invalid-request')

    try {
      const result = await waitlist().join(input, visitor)
      if (result.outcome === 'rate_limited') return rateLimited(c)
      if (result.outcome === 'already_listed') return c.json({ status: 'already_listed' }, 202)
      return c.json(
        { status: 'joined', referral_code: result.referralCode, referrals: result.referrals },
        201,
      )
    } catch (cause) {
      return failWaitlist(c, cause)
    }
  })

  routes.post('/waitlist/confirmations', async (c) => {
    const visitor = readVisitor(c)
    const token = (await readJson(c.req.raw)).token
    if (!visitor || typeof token !== 'string') return problem(c, 'invalid-request')
    // A string that cannot be a token answers like a token that never existed.
    if (!TOKEN.test(token)) return problem(c, 'not-found')

    try {
      const outcome = await waitlist().confirm(token, visitor)
      if (outcome === 'rate_limited') return rateLimited(c)
      if (outcome === 'invalid') return problem(c, 'not-found')
      return c.json({ status: outcome }, 200)
    } catch (cause) {
      return failWaitlist(c, cause)
    }
  })

  routes.post('/waitlist/email-requests', async (c) => {
    const visitor = readVisitor(c)
    const email = readEmail((await readJson(c.req.raw)).email)
    if (!visitor || !email) return problem(c, 'invalid-request')

    try {
      const outcome = await waitlist().requestEmail(email, visitor)
      if (outcome === 'rate_limited') return rateLimited(c)
      return c.body(null, 202)
    } catch (cause) {
      return failWaitlist(c, cause)
    }
  })

  return routes
}

/** Hashed before comparing, so the comparison takes the same time whatever the lengths. */
function fromSpaceWeb(presented: string | undefined, environment: NodeJS.ProcessEnv): boolean {
  const expected = environment.WAITLIST_SPACE_WEB_SECRET
  if (!expected || expected.length < 32 || !presented) return false
  const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest()
  return timingSafeEqual(digest(presented), digest(expected))
}

/** The longest window any waitlist limit uses is an hour. */
function rateLimited(c: Context) {
  c.header('Retry-After', '3600')
  return problem(c, 'rate-limited')
}

function failWaitlist(c: Context, cause: unknown) {
  if (cause instanceof WaitlistError) {
    return cause.code === 'disposable-email'
      ? problem(c, 'validation-failed', 'disposable-email')
      : problem(c, 'invalid-request')
  }
  // 22023 is the database refusing a shape this file should have refused first.
  if (typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '22023') {
    return problem(c, 'invalid-request')
  }
  throw cause
}

function readVisitor(c: Context): WaitlistVisitor | undefined {
  const address = c.req.header(ADDRESS_HEADER)?.trim()
  if (!address || address.length > 64) return undefined
  const device = c.req.header(DEVICE_HEADER)?.trim()
  if (device && !DEVICE.test(device)) return undefined
  return { address, ...(device ? { device } : {}) }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json()
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function readJoin(body: Record<string, unknown>): WaitlistJoinInput | undefined {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const email = readEmail(body.email)
  const language = body.language
  const policyVersion = body.policy_version
  // No authorization, no data: anything but an explicit `true` stops here.
  if (body.consent !== true) return undefined
  if (name.length === 0 || name.length > MAX_NAME_LENGTH || hasControlCharacter(name)) {
    return undefined
  }
  if (!email || (language !== 'es' && language !== 'en')) return undefined
  if (typeof policyVersion !== 'string' || !POLICY_VERSION.test(policyVersion)) return undefined

  const inviterCode = readOptional(body.referral_code, 16)
  const utmSource = readOptional(body.utm_source, MAX_UTM_LENGTH)
  const utmMedium = readOptional(body.utm_medium, MAX_UTM_LENGTH)
  const utmCampaign = readOptional(body.utm_campaign, MAX_UTM_LENGTH)
  if (
    inviterCode === false ||
    utmSource === false ||
    utmMedium === false ||
    utmCampaign === false ||
    (inviterCode && !REFERRAL_CODE.test(inviterCode))
  ) {
    return undefined
  }

  return {
    name,
    email,
    language,
    policyVersion,
    ...(inviterCode ? { inviterCode } : {}),
    ...(utmSource ? { utmSource } : {}),
    ...(utmMedium ? { utmMedium } : {}),
    ...(utmCampaign ? { utmCampaign } : {}),
  }
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 0x20 || code === 0x7f
  })
}

/** Shape only. Whether the mailbox exists is what the confirmation email is for. */
function readEmail(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length > MAX_EMAIL_LENGTH) return undefined
  return /^[^@\s]+@[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(trimmed)
    ? trimmed
    : undefined
}

/** Absent or blank is `undefined`; present and wrong is `false`. */
function readOptional(value: unknown, maxLength: number): string | undefined | false {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed.length === 0) return undefined
  return trimmed.length <= maxLength && !hasControlCharacter(trimmed) ? trimmed : false
}
