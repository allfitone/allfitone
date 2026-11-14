/**
 * space-web's server half of the waitlist: the one place that talks to the API's
 * waitlist routes (`/space/v1/waitlist/*`, OP-WL-001 to OP-WL-005; ADR-050).
 *
 * The browser never reaches the API for this. It posts to this app
 * (`/api/waitlist/<operation>`), and this module forwards the request from the server
 * with what only the server has:
 *
 * - **The shared secret** (`WAITLIST_SPACE_WEB_SECRET`). Without it the API answers 404
 *   to every waitlist route, and so does this module before asking: a deployment that
 *   lost the setting closes the waitlist instead of opening it.
 * - **The visitor's address.** The API limits attempts per connection and trusts this
 *   header only because the secret comes with it. It is read from `X-Forwarded-For`,
 *   where each hop appends the address it saw: CloudFront appends the visitor's, then
 *   the load balancer appends CloudFront's. Anything to the left of the visitor's entry
 *   is whatever the visitor chose to send, and is never read.
 * - **The device**: a random identifier kept in a first-party cookie, which the API
 *   turns into a keyed hash before storing. The privacy policy names it.
 *
 * The browser hears less than the API says: the status and, on a failure, one word it
 * can act on. Nothing about the secret, the API or its request ids reaches it.
 */

import { randomBytes } from 'node:crypto'
import { isIP } from 'node:net'

/** What the pages ask for, named as the API names its routes. */
export const WAITLIST_OPERATIONS = [
  'signups',
  'email-requests',
  'confirmations',
  'link-reads',
  'departures',
] as const
export type WaitlistOperation = (typeof WAITLIST_OPERATIONS)[number]

/**
 * The privacy policy a person authorizes by joining: the text on www.allfit.one that
 * describes the waitlist, as of 10 November 2026. Change it whenever that text changes.
 */
export const PRIVACY_POLICY_VERSION = '2026-11-10'

export const DEVICE_COOKIE = 'allfit_space_device'
/** Long enough to outlast the waitlist, which closes when Allfit Space opens. */
const DEVICE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60
const DEVICE = /^[A-Za-z0-9_-]{16,128}$/

/** The API rejects a shorter secret as if none were set; this module does the same. */
const MIN_SECRET_LENGTH = 32

/** Only CloudFront sends it, and the load balancer drops any request without it. */
const CDN_HEADER = 'x-origin-verify'

/** The fields each operation forwards. Anything else the browser sends is dropped. */
const FIELDS: Record<WaitlistOperation, readonly string[]> = {
  signups: [
    'name',
    'email',
    'language',
    'consent',
    'referral_code',
    'utm_source',
    'utm_medium',
    'utm_campaign',
  ],
  'email-requests': ['email'],
  confirmations: ['token'],
  'link-reads': ['token'],
  departures: ['token'],
}

/** What a page is told when something fails, beyond the status. */
export type WaitlistProblem =
  'invalid-request' | 'not-found' | 'disposable-email' | 'rate-limited' | 'unavailable'

export interface RelaySettings {
  apiUrl: string | undefined
  secret: string | undefined
  // Only what the relay calls, so a test can answer without the whole fetch API.
  fetch: (url: URL, init: RequestInit) => Promise<Response>
}

export function isWaitlistOperation(value: string): value is WaitlistOperation {
  return (WAITLIST_OPERATIONS as readonly string[]).includes(value)
}

/**
 * The visitor's address, or `null` when the request does not say it. Behind CloudFront
 * it is the second entry from the right; reached directly, as in development, the last.
 */
export function visitorAddress(headers: Headers): string | null {
  const entries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const address = entries.at(headers.has(CDN_HEADER) ? -2 : -1)
  return address && isIP(address) !== 0 ? address : null
}

/** The device identifier the cookie holds, or `null` when there is none worth trusting. */
export function deviceFromCookies(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === DEVICE_COOKIE) {
      const device = value.join('=')
      return DEVICE.test(device) ? device : null
    }
  }
  return null
}

export function newDevice(): string {
  return randomBytes(24).toString('base64url')
}

function deviceCookie(device: string): string {
  return `${DEVICE_COOKIE}=${device}; Path=/; Max-Age=${String(DEVICE_COOKIE_MAX_AGE)}; HttpOnly; Secure; SameSite=Lax`
}

/** A device issued by this answer goes out as its cookie. */
interface AnswerOptions {
  headers?: Record<string, string>
  device?: string | undefined
}

function answer(
  status: number,
  body: unknown,
  { headers = {}, device }: AnswerOptions = {},
): Response {
  const response = body === null ? new Response(null, { status }) : Response.json(body, { status })
  response.headers.set('cache-control', 'no-store')
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value)
  if (device) response.headers.append('set-cookie', deviceCookie(device))
  return response
}

function problem(status: number, error: WaitlistProblem, options: AnswerOptions = {}) {
  return answer(status, { error }, options)
}

/** `undefined` when the text is not JSON: the API always answers JSON or nothing. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json()
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function forwardedBody(operation: WaitlistOperation, body: Record<string, unknown>) {
  const picked = Object.fromEntries(
    FIELDS[operation].filter((field) => field in body).map((field) => [field, body[field]]),
  )
  return operation === 'signups' ? { ...picked, policy_version: PRIVACY_POLICY_VERSION } : picked
}

/** The API's problem detail, when it names one; `disposable-email` is the only one used. */
async function problemDetail(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return undefined
    const { detail } = body as Record<string, unknown>
    return typeof detail === 'string' ? detail : undefined
  } catch {
    return undefined
  }
}

/** Forwards one waitlist request to the API and translates its answer for the page. */
export async function relayWaitlist(
  operation: string,
  request: Request,
  settings: RelaySettings,
): Promise<Response> {
  if (!isWaitlistOperation(operation)) return problem(404, 'not-found')

  const { apiUrl, secret } = settings
  const address = visitorAddress(request.headers)
  if (!apiUrl || !secret || secret.length < MIN_SECRET_LENGTH || !address) {
    console.error('waitlist: relay is not configured or the visitor address is missing', {
      operation,
      apiUrl: Boolean(apiUrl),
      secret: Boolean(secret && secret.length >= MIN_SECRET_LENGTH),
      address: Boolean(address),
    })
    return problem(503, 'unavailable')
  }

  const body = await readBody(request)
  if (!body) return problem(400, 'invalid-request')

  const known = deviceFromCookies(request.headers.get('cookie'))
  const device = known ?? newDevice()

  let response: Response
  try {
    response = await settings.fetch(new URL(`space/v1/waitlist/${operation}`, withSlash(apiUrl)), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-allfit-waitlist-secret': secret,
        'x-allfit-visitor-address': address,
        'x-allfit-visitor-device': device,
      },
      body: JSON.stringify(forwardedBody(operation, body)),
      cache: 'no-store',
    })
  } catch (cause) {
    console.error('waitlist: the API could not be reached', { operation, cause })
    return problem(502, 'unavailable')
  }

  // The cookie goes out with any answer the API gave, so the next attempt is the same device.
  const issued = known ? undefined : device
  if (response.ok) {
    const text = await response.text()
    const parsed = text ? parseJson(text) : null
    if (parsed === undefined) {
      console.error('waitlist: the API answered something that is not JSON', { operation })
      return problem(502, 'unavailable')
    }
    return answer(response.status, parsed, { device: issued })
  }

  switch (response.status) {
    case 400:
      return problem(400, 'invalid-request', { device: issued })
    case 404:
      return problem(404, 'not-found', { device: issued })
    case 422:
      return (await problemDetail(response)) === 'disposable-email'
        ? problem(422, 'disposable-email', { device: issued })
        : problem(400, 'invalid-request', { device: issued })
    case 429:
      return problem(429, 'rate-limited', {
        headers: { 'retry-after': response.headers.get('retry-after') ?? '3600' },
        device: issued,
      })
    default:
      console.error('waitlist: the API failed', { operation, status: response.status })
      return problem(502, 'unavailable')
  }
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
