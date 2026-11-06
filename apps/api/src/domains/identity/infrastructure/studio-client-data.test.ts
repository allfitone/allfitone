/**
 * How the coach's reading of a client reaches PostgreSQL (`OP-IDN-018..020`, `059`, `060`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly, so
 * neither would notice a binding in the wrong position: the coach and the client swapped,
 * the request id left out of the context the access record needs, or a page whose cursor
 * is built from a row it did not show. These assert the bindings and what the rows become.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import type { ClientBodyProgressRecord } from '../domain/studio-client-data.js'
import { createStudioClientDataDatabase } from './studio-client-data.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: (text: string) => unknown,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : [{ document: answer(text) }])
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      json: (value: unknown) => ({ json: value }),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019f4900-0000-7000-8000-000000000012'
const ORGANIZATION = '019f4900-0000-7000-8000-000000000101'
const CLIENT = '019f4900-0000-7000-8000-000000000001'
const REQUEST = '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'
const QUERY = {
  personId: COACH,
  organizationId: ORGANIZATION,
  subjectPersonId: CLIENT,
  requestId: REQUEST,
}

const measurement = (id: string, day: string): ClientBodyProgressRecord => ({
  id,
  metric_code: 'body_weight',
  value: 70,
  unit_code: 'kg',
  original_value: null,
  original_unit_code: null,
  measured_on: day,
})

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the read bindings', () => {
  test('T-IDN-AUTHORIZED-INT-01 the coach acts with the request id, and the client is the subject', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, () => ({
        outcome: 'found',
        scope_version: 4,
        biological_sex: null,
        attributes: [],
      })),
    )
    const read = await createStudioClientDataDatabase().readProfile(QUERY)

    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.text).toContain('identity.read_client_training_profile(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT])
    expect(read).toEqual({
      outcome: 'found',
      value: {
        applied_scope: { code: 'relationship_training', version: 4 },
        biological_sex: null,
        attributes: [],
      },
    })
  })

  test('T-IDN-AUTHORIZED-INT-02 nothing shared becomes the category it would take', async () => {
    await setDatabase(
      recordingDatabase([], () => ({ outcome: 'scope_required', scope: 'health_context' })),
    )
    expect(
      await createStudioClientDataDatabase().listHealthContext({ ...QUERY, limit: 25 }),
    ).toEqual({
      outcome: 'scope_required',
      requiredScope: { code: 'health_context', level: 'read' },
    })
  })

  test('T-IDN-AUTHORIZED-INT-03 a page asks for one more than it shows, and its cursor is its last row', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, () => ({
        outcome: 'found',
        scope_version: 2,
        items: [
          measurement('019f4900-0000-7000-8000-000000000b02', '2026-11-04'),
          measurement('019f4900-0000-7000-8000-000000000b01', '2026-11-04'),
          measurement('019f4900-0000-7000-8000-000000000b03', '2026-10-06'),
        ],
      })),
    )
    const read = await createStudioClientDataDatabase().listBodyProgress({ ...QUERY, limit: 2 })

    expect(captured[1]?.text).toContain('identity.list_client_body_progress(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, 3, null, null])
    expect(read).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'body_progress', version: 2 },
        items: [
          measurement('019f4900-0000-7000-8000-000000000b02', '2026-11-04'),
          measurement('019f4900-0000-7000-8000-000000000b01', '2026-11-04'),
        ],
        hasMore: true,
        nextCursor: { key: '2026-11-04', id: '019f4900-0000-7000-8000-000000000b01' },
      },
    })
  })

  test('T-IDN-AUTHORIZED-INT-04 the last page has no cursor, and a cursor is bound where the function takes it', async () => {
    const captured: CapturedQuery[] = []
    const shown = {
      id: '019f4900-0000-7000-8000-000000000e01',
      taken_on: '2026-11-02',
      shared_at: '2026-11-03T09:00:00+00:00',
    }
    await setDatabase(
      recordingDatabase(captured, () => ({ outcome: 'found', scope_version: 3, items: [shown] })),
    )
    const cursor = { key: '2026-11-05', id: '019f4900-0000-7000-8000-000000000e09' }
    const read = await createStudioClientDataDatabase().listBodyPhotos({
      ...QUERY,
      limit: 5,
      cursor,
    })

    expect(captured[1]?.text).toContain('identity.list_client_shared_body_photos(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, 6, cursor.key, cursor.id])
    expect(read).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'body_progress', version: 3 },
        items: [shown],
        hasMore: false,
      },
    })
  })

  test('T-IDN-AUTHORIZED-INT-05 health pages on since when', async () => {
    const captured: CapturedQuery[] = []
    const claim = (id: string, at: string) => ({
      id,
      context_type: 'pain',
      description: null,
      body_area: null,
      provenance: null,
      valid_from: at,
      valid_to: null,
    })
    await setDatabase(
      recordingDatabase(captured, () => ({
        outcome: 'found',
        scope_version: 1,
        items: [
          claim('019f4900-0000-7000-8000-000000000d01', '2026-10-31T10:00:00.123+00:00'),
          claim('019f4900-0000-7000-8000-000000000d02', '2026-10-16T10:00:00.456+00:00'),
        ],
      })),
    )
    const read = await createStudioClientDataDatabase().listHealthContext({ ...QUERY, limit: 1 })

    expect(captured[1]?.text).toContain('identity.list_client_health_context(')
    expect(captured[1]?.text).toContain('::timestamptz')
    expect(read.outcome === 'found' && read.value.nextCursor).toEqual({
      key: '2026-10-31T10:00:00.123+00:00',
      id: '019f4900-0000-7000-8000-000000000d01',
    })
  })

  test('T-IDN-AUTHORIZED-INT-06 opening a photo yields its key only when PostgreSQL found one she shows', async () => {
    const captured: CapturedQuery[] = []
    const photoId = '019f4900-0000-7000-8000-000000000e01'
    await setDatabase(
      recordingDatabase(captured, () => ({ outcome: 'found', media_ref: 'body/a/e01.jpg' })),
    )
    expect(await createStudioClientDataDatabase().openBodyPhoto({ ...QUERY, photoId })).toBe(
      'body/a/e01.jpg',
    )
    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, photoId])

    await setDatabase(recordingDatabase([], () => ({ outcome: 'not_found' })))
    expect(await createStudioClientDataDatabase().openBodyPhoto({ ...QUERY, photoId })).toBeNull()
  })
})
