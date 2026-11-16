/**
 * What every `/studio/v1` payments route does the same way: resolve the acting person
 * from the session cookie, read the command headers, bound a page, and turn a database
 * refusal into its status.
 *
 * Shared by the subscription and plan routes so a check cannot be present on one and
 * forgotten on the other.
 */

import { createHash } from 'node:crypto'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

import {
  STUDIO_SESSION_COOKIE,
  StudioSessionError,
  type StudioSessionService,
} from '../../identity/index.js'
import { fail } from '../../../platform/http/index.js'
import { PLAN_PAGE_LIMIT } from '../domain/subscriptions.js'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * An account with no person has not finished registering. It cannot hold a membership, so
 * it cannot hold `manage_billing` either, and saying so is clearer than the 404 the
 * function would answer.
 */
export async function actingPerson(
  c: Context,
  sessions: StudioSessionService,
): Promise<string | Response> {
  const token = getCookie(c, STUDIO_SESSION_COOKIE)
  if (!token) return fail(c, 'unauthenticated')
  try {
    const actor = await sessions.resolveActor(token)
    if (!actor.personId) return fail(c, 'registration-incomplete')
    return actor.personId
  } catch (error) {
    if (error instanceof StudioSessionError) return fail(c, error.code)
    throw error
  }
}

export function commandContext(c: Context, body: unknown) {
  const idempotencyKey = c.req.header('idempotency-key') ?? ''
  const commandId = c.req.header('command-id') ?? ''
  if (!UUID_V4.test(idempotencyKey) || !UUID_V7.test(commandId)) return undefined
  return {
    idempotencyKey,
    commandId,
    requestHash: createHash('sha256').update(canonicalJson(body)).digest(),
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isObject(value)) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return PLAN_PAGE_LIMIT.default
  if (!/^[1-9][0-9]*$/.test(value)) return undefined
  const parsed = Number(value)
  return parsed <= PLAN_PAGE_LIMIT.max ? parsed : undefined
}

export function studioFailure(c: Parameters<typeof fail>[0], error: unknown): Response {
  if (error instanceof StudioSessionError) return fail(c, error.code)
  const sqlState = isObject(error) && typeof error.code === 'string' ? error.code : undefined
  if (sqlState === '42501') return fail(c, 'forbidden')
  if (sqlState === 'P0002') return fail(c, 'not-found')
  if (sqlState === 'P0004' || sqlState === '23505' || sqlState === '40001') {
    return fail(c, 'conflict')
  }
  if (sqlState === '22023' || sqlState === '23514' || sqlState === '22P02') {
    return fail(c, 'validation-failed')
  }
  console.error('[studio-payments] operation failed')
  return fail(c, 'upstream-unavailable')
}
