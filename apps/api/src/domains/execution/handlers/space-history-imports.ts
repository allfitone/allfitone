/**
 * `/space/v1/history-imports`: a person brings their history from another app (ADR-044).
 *
 * Read, review, commit, undo (`OP-EXE-027..030`). The file's text arrives in the JSON
 * body and is read in the request; nothing here keeps it. A file that cannot be read is
 * a `422` whose one `errors` entry names why and, when it can, the row — that is what
 * lets the app tell somebody «row 37 has a date we cannot read» instead of «it failed».
 *
 * An import that is not the person's answers like one that does not exist: a
 * distinguishable «forbidden» would let somebody learn which import ids exist.
 */

import { MAX_HISTORY_CHARACTERS } from '@allfitone/history-import'
import { Hono, type Context } from 'hono'

import { problem } from '../../../platform/http/index.js'
import {
  UUID_V7,
  exactObject,
  isJsonRequest,
  readJson,
  spaceCommand,
  spaceFailure,
  spaceTokenVerifier,
  verifiedSpaceToken,
  type TokenVerifier,
} from '../../../platform/http/space-requests.js'
import {
  SpaceActorError,
  spaceActorResolver,
  type SpaceActorResolver,
} from '../../identity/index.js'
import type { SpaceHistoryImportService } from '../application/history-imports.js'
import { spaceHistoryImportService } from '../dependencies.js'
import type { HistoryImportChoice } from '../domain/history-imports.js'

const OPERATION = 'space-history-imports'
const MAX_TIMEZONE = 64
const MAX_CHOICES = 1000
const MAX_NAME = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const REFUSAL_MESSAGE = {
  empty: 'The file has nothing in it.',
  too_large: `The file is longer than ${MAX_HISTORY_CHARACTERS} characters.`,
  unknown_format: 'The file is not an export this reader knows.',
  malformed_csv: 'The file is not well-formed CSV.',
  unreadable_date: 'A date in the file cannot be read.',
} as const

export function spaceHistoryImportRoutes(
  injectedService?: SpaceHistoryImportService,
  injectedVerifier?: TokenVerifier,
  injectedActors?: SpaceActorResolver,
): Hono {
  const imports = () => injectedService ?? spaceHistoryImportService()
  const actors = () => injectedActors ?? spaceActorResolver()
  const verify = injectedVerifier ?? spaceTokenVerifier()
  const routes = new Hono()

  routes.use('/history-imports/*', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })
  routes.use('/history-imports', async (c, next) => {
    await next()
    c.header('Cache-Control', 'no-store')
  })

  routes.post('/history-imports', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const body = await readJson(c)
    const upload = readUpload(body)
    const command = spaceCommand(c, body)
    if (!upload || !command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(String(token.subject))
      const outcome = await imports().stage({ personId, ...upload, ...command })
      if (outcome.kind === 'refused') {
        return problem(c, 'validation-failed', undefined, {
          errors: [
            {
              code: outcome.refusal,
              path: outcome.row === null ? '/content' : `/content/${outcome.row}`,
              message: REFUSAL_MESSAGE[outcome.refusal],
            },
          ],
        })
      }
      if (outcome.created) c.header('Location', `/space/v1/history-imports/${outcome.document.id}`)
      return c.json(outcome.document, outcome.created ? 201 : 200)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  routes.get('/history-imports', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')

    try {
      const personId = await actors().personFor(String(token.subject))
      const data = await imports().list({ personId, requestId: c.req.header('x-request-id') ?? '' })
      return c.json({ data }, 200)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  routes.get('/history-imports/:importId', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    const importId = c.req.param('importId')
    if (!UUID_V7.test(importId)) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(String(token.subject))
      const document = await imports().read({
        personId,
        importId,
        requestId: c.req.header('x-request-id') ?? '',
      })
      return c.json(document, 200)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  routes.post('/history-imports/:importId/commit', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    if (!isJsonRequest(c)) return problem(c, 'unsupported-media-type')
    const importId = c.req.param('importId')
    const body = await readJson(c)
    const commit = readCommit(body)
    const command = spaceCommand(c, body)
    if (!UUID_V7.test(importId) || !commit || !command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(String(token.subject))
      return c.json(await imports().commit({ personId, importId, ...commit, ...command }), 200)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  routes.post('/history-imports/:importId/undo', async (c) => {
    const token = await verifiedSpaceToken(c, verify)
    if (!token) return problem(c, 'unauthenticated')
    const importId = c.req.param('importId')
    const command = spaceCommand(c, { importId })
    if (!UUID_V7.test(importId) || !command) return problem(c, 'invalid-request')

    try {
      const personId = await actors().personFor(String(token.subject))
      return c.json(await imports().undo({ personId, importId, ...command }), 200)
    } catch (cause) {
      return failure(c, cause)
    }
  })

  return routes
}

function readTimezone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const zone = value.trim()
  return zone === '' || zone.length > MAX_TIMEZONE ? undefined : zone
}

/** Length is the reader's to refuse, so an oversized file gets its reason, not a 400. */
function readUpload(body: unknown): { timezone: string; content: string } | undefined {
  const fields = exactObject(body, ['timezone', 'content'])
  const timezone = readTimezone(fields?.timezone)
  if (!fields || !timezone || typeof fields.content !== 'string') return undefined
  return { timezone, content: fields.content }
}

function readCommit(
  body: unknown,
): { timezone: string; choices: HistoryImportChoice[] } | undefined {
  const fields = exactObject(body, ['timezone', 'choices'])
  const timezone = readTimezone(fields?.timezone)
  if (!fields || !timezone || !Array.isArray(fields.choices)) return undefined
  if (fields.choices.length > MAX_CHOICES) return undefined
  const choices: HistoryImportChoice[] = []
  for (const raw of fields.choices) {
    const choice = exactObject(raw, ['external_name', 'movement_id'])
    const name = choice?.external_name
    const given = choice?.movement_id
    if (typeof name !== 'string' || name.trim() === '' || name.length > MAX_NAME) return undefined
    // Explicit, because not every compiler narrows `unknown` through the negated test.
    const movement =
      given === null ? null : typeof given === 'string' && UUID.test(given) ? given : undefined
    if (movement === undefined) return undefined
    choices.push({ external_name: name, movement_id: movement })
  }
  return { timezone, choices }
}

function failure(c: Context, cause: unknown): Response {
  if (cause instanceof SpaceActorError) return problem(c, 'registration-incomplete')
  const code =
    typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined
  // Not this person's import: answered as absent, never as forbidden.
  if (code === '42501') return problem(c, 'not-found')
  // A chosen movement outside the published catalogue is the request's fault.
  if (code === '23514') return problem(c, 'validation-failed')
  return spaceFailure(c, cause, OPERATION)
}
