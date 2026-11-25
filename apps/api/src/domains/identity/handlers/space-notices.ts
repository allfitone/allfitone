/**
 * A person's notices on /space/v1: `OP-IDN-074` lists them, `OP-IDN-075` marks one read.
 * ADR-054, `HU-SP-091`.
 *
 * The cursor is opaque to the app: it carries the instant and id of the last notice of a
 * page, and one that cannot be read is 422 rather than a quiet first page. Marking read
 * needs no idempotency key, because reading twice answers the same.
 */

import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import {
  UUID_V7,
  isInstant,
  onlyQueryKeys,
  spaceFailure,
  spaceTokenVerifier,
  verifiedSpaceToken,
  type TokenVerifier,
} from '../../../platform/http/space-requests.js'
import type { SpaceNoticesService } from '../application/space-notices.js'
import { spaceNoticesService } from '../dependencies.js'
import {
  NOTICE_FILTERS,
  type SpaceNoticeCursor,
  type SpaceNoticeFilter,
  type SpaceNoticeListInput,
} from '../domain/space-notices.js'

const OPERATION = 'space-notices'
const LIST_PARAMETERS = new Set(['filter', 'cursor'])
// Unit separator: nothing a cursor carries can contain it.
const SEPARATOR = '\u001f'

export function spaceNoticeRoutes(
  injectedService?: SpaceNoticesService,
  injectedVerifier?: TokenVerifier,
): Hono {
  const notices = () => injectedService ?? spaceNoticesService()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  routes.use('*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.get('/notices', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!onlyQueryKeys(c, LIST_PARAMETERS)) return problem(c, 'invalid-request')
    const input = listInput(c)
    if (!input) return problem(c, 'validation-failed')

    try {
      const page = await notices().list(token, input)
      const last = page.items.at(-1)
      return c.json({
        items: page.items,
        next_cursor: page.has_more && last ? encodeCursor(last.occurred_at, last.id) : null,
        awaiting_count: page.awaiting_count,
        unread_count: page.unread_count,
      })
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  routes.post('/notices/:noticeId/read', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    const noticeId = c.req.param('noticeId')
    if (!UUID_V7.test(noticeId)) return problem(c, 'invalid-request')

    try {
      return c.json(await notices().markRead(token, noticeId), 200)
    } catch (error) {
      return spaceFailure(c, error, OPERATION)
    }
  })

  return routes
}

function listInput(c: Context): SpaceNoticeListInput | undefined {
  const filter = c.req.query('filter') ?? 'all'
  if (!(NOTICE_FILTERS as readonly string[]).includes(filter)) return undefined
  const cursor = c.req.query('cursor')
  if (cursor === undefined) return { filter: filter as SpaceNoticeFilter }
  const after = decodeCursor(cursor)
  return after ? { filter: filter as SpaceNoticeFilter, after } : undefined
}

function encodeCursor(occurredAt: string, noticeId: string): string {
  return Buffer.from(`${occurredAt}${SEPARATOR}${noticeId}`, 'utf8').toString('base64url')
}

function decodeCursor(value: string): SpaceNoticeCursor | undefined {
  if (!/^[A-Za-z0-9_-]{8,1024}$/.test(value)) return undefined
  const parts = Buffer.from(value, 'base64url').toString('utf8').split(SEPARATOR)
  if (parts.length !== 2) return undefined
  const [occurredAt, noticeId] = parts
  if (!occurredAt || !isInstant(occurredAt) || !noticeId || !UUID_V7.test(noticeId)) {
    return undefined
  }
  return { occurredAt, noticeId }
}
