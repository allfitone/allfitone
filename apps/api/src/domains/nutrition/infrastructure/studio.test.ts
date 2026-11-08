/**
 * How the coach's side of a client's nutrition reaches PostgreSQL (`OP-NUT-009..013`).
 *
 * The handler tests mock the service and the pgTAP tests call the functions directly, so
 * neither would notice a binding in the wrong position: the coach and the client swapped,
 * the request id left out of the context the access record needs, or a page whose cursor
 * is built from a row it did not show. These assert the bindings and what the rows become.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import type {
  ClientNutritionGoalVersion,
  ClientNutritionMeal,
  ProfessionalGoalCreate,
} from '../domain/studio.js'
import { createStudioNutritionDatabase } from './studio.js'

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
      if (text.includes('set_config')) return Promise.resolve([{}])
      const row = answer(text)
      return Promise.resolve(text.includes('select * from') ? [row] : [{ document: row }])
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      json: (value: unknown) => ({ json: value }),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019f6100-0000-7000-8000-000000000012'
const ORGANIZATION = '019f6100-0000-7000-8000-000000000101'
const CLIENT = '019f6100-0000-7000-8000-000000000001'
const REQUEST = '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f'
const QUERY = {
  personId: COACH,
  organizationId: ORGANIZATION,
  subjectPersonId: CLIENT,
  requestId: REQUEST,
}

const meal = (id: string, occurredAt: string): ClientNutritionMeal => ({
  id,
  occurred_at: occurredAt,
  local_date: occurredAt.slice(0, 10),
  timezone: 'America/Bogota',
  meal_type: 'lunch',
  note: null,
  has_photo: null,
  items: [],
})

const proposal = (id: string, createdAt: string): ClientNutritionGoalVersion => ({
  id,
  status: 'proposed',
  rationale: 'Para tu fase de definición',
  author: { kind: 'professional', person_id: COACH },
  targets: [
    {
      nutrient_code: 'protein',
      mode: 'minimum',
      minimum: 140,
      maximum: null,
      exact: null,
      unit: 'g',
    },
  ],
  created_at: createdAt,
  activated_at: null,
  cancelled_at: null,
  decision: null,
})

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the read bindings', () => {
  test('T-NUT-STUDIO-INT-01 meals: the coach acts with the request id; one more row is asked for', async () => {
    const captured: CapturedQuery[] = []
    const first = meal('019f6100-0000-7000-8000-000000000a02', '2026-11-07T19:00:00.123456+00:00')
    const second = meal('019f6100-0000-7000-8000-000000000a01', '2026-11-07T12:00:00+00:00')
    await setDatabase(
      recordingDatabase(captured, () => ({
        outcome: 'found',
        scope_version: 3,
        photo_scope_version: 2,
        items: [first, second],
      })),
    )
    const read = await createStudioNutritionDatabase().listMeals({
      ...QUERY,
      from: '2026-11-01',
      to: '2026-11-07',
      limit: 1,
      cursor: { at: '2026-11-08T08:00:00+00:00', id: '019f6100-0000-7000-8000-000000000a03' },
    })

    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.text).toContain('nutrition.list_client_meals(')
    expect(captured[1]?.values).toEqual([
      COACH,
      ORGANIZATION,
      CLIENT,
      '2026-11-01',
      '2026-11-07',
      2,
      '2026-11-08T08:00:00+00:00',
      '019f6100-0000-7000-8000-000000000a03',
    ])
    // The cursor carries the instant as PostgreSQL gave it, so no row between pages is skipped.
    expect(read).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'nutrition_intake', version: 3 },
        photoScope: { code: 'nutrition_media', version: 2 },
        items: [first],
        hasMore: true,
        nextCursor: { at: first.occurred_at, id: first.id },
      },
    })
  })

  test('T-NUT-STUDIO-INT-02 meals: without media the page names no photo scope; nothing shared is refused', async () => {
    await setDatabase(
      recordingDatabase([], () => ({
        outcome: 'found',
        scope_version: 3,
        photo_scope_version: null,
        items: [],
      })),
    )
    expect(
      await createStudioNutritionDatabase().listMeals({
        ...QUERY,
        from: '2026-11-01',
        to: '2026-11-07',
        limit: 20,
      }),
    ).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'nutrition_intake', version: 3 },
        photoScope: null,
        items: [],
        hasMore: false,
      },
    })

    await setDatabase(
      recordingDatabase([], () => ({ outcome: 'scope_required', scope: 'nutrition_intake' })),
    )
    expect(
      await createStudioNutritionDatabase().listMeals({
        ...QUERY,
        from: '2026-11-01',
        to: '2026-11-07',
        limit: 20,
      }),
    ).toEqual({
      outcome: 'scope_required',
      requiredScope: { code: 'nutrition_intake', level: 'read' },
    })
  })

  test('T-NUT-STUDIO-INT-03 daily summaries carry the range and the intake version', async () => {
    const captured: CapturedQuery[] = []
    const days = [{ local_date: '2026-11-07', meal_count: 2, nutrient_totals: [] }]
    await setDatabase(
      recordingDatabase(captured, () => ({ outcome: 'found', scope_version: 3, days })),
    )
    const read = await createStudioNutritionDatabase().readDailySummaries({
      ...QUERY,
      from: '2026-11-07',
      to: '2026-11-07',
    })

    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.text).toContain('nutrition.read_client_daily_summaries(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, '2026-11-07', '2026-11-07'])
    expect(read).toEqual({
      outcome: 'found',
      value: { appliedScope: { code: 'nutrition_intake', version: 3 }, days },
    })
  })

  test('T-NUT-STUDIO-INT-04 a photo opens to its key, and anything else to null', async () => {
    const captured: CapturedQuery[] = []
    const MEAL = '019f6100-0000-7000-8000-000000000a01'
    await setDatabase(
      recordingDatabase(captured, () => ({ outcome: 'found', media_ref: 'nutrition/key.jpg' })),
    )
    expect(await createStudioNutritionDatabase().openMealPhoto({ ...QUERY, mealId: MEAL })).toBe(
      'nutrition/key.jpg',
    )
    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.text).toContain('nutrition.open_client_meal_photo(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, MEAL])

    await setDatabase(recordingDatabase([], () => ({ outcome: 'not_found' })))
    expect(
      await createStudioNutritionDatabase().openMealPhoto({ ...QUERY, mealId: MEAL }),
    ).toBeNull()
  })

  test('T-NUT-STUDIO-INT-05 goals: a page of proposals keyed on creation, with her active goal', async () => {
    const captured: CapturedQuery[] = []
    const newer = proposal(
      '019f6100-0000-7000-8000-000000000c02',
      '2026-11-07T10:00:00.654321+00:00',
    )
    const older = proposal('019f6100-0000-7000-8000-000000000c01', '2026-11-01T10:00:00+00:00')
    const active = {
      goal_version_id: null,
      from_this_relationship: false,
      activated_at: '2026-10-01T10:00:00+00:00',
      targets: [],
    }
    await setDatabase(
      recordingDatabase(captured, () => ({
        outcome: 'found',
        scope_version: 2,
        items: [newer, older],
        active,
      })),
    )
    const read = await createStudioNutritionDatabase().listGoalVersions({ ...QUERY, limit: 1 })

    expect(captured[0]?.values).toEqual([COACH, REQUEST])
    expect(captured[1]?.text).toContain('nutrition.list_client_goal_versions(')
    expect(captured[1]?.values).toEqual([COACH, ORGANIZATION, CLIENT, 2, null, null])
    expect(read).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'nutrition_guidance', version: 2 },
        items: [newer],
        active,
        hasMore: true,
        nextCursor: { at: newer.created_at, id: newer.id },
      },
    })
  })
})

describe('the proposal binding', () => {
  test('T-NUT-STUDIO-INT-06 propose: the coach, the client, the targets as JSON and the receipt', async () => {
    const captured: CapturedQuery[] = []
    const created = proposal('019f6100-0000-7000-8000-000000000c03', '2026-11-08T10:00:00+00:00')
    await setDatabase(recordingDatabase(captured, () => ({ result: created, replayed: true })))
    const targets: ProfessionalGoalCreate['targets'] = [
      {
        nutrient_code: 'protein',
        mode: 'minimum',
        minimum: 140,
        maximum: null,
        exact: null,
        unit: 'g',
      },
    ]
    const hash = Buffer.from('hash')
    const result = await createStudioNutritionDatabase().proposeGoalVersion({
      personId: COACH,
      organizationId: ORGANIZATION,
      subjectPersonId: CLIENT,
      rationale: 'Para tu fase de definición',
      targets,
      idempotencyKey: '5d1a1c4e-2b3d-4c5e-9f60-7a8b9c0d1e2f',
      commandId: created.id,
      requestHash: hash,
    })

    expect(captured[0]?.values[0]).toBe(COACH)
    expect(captured[1]?.text).toContain('select * from nutrition.propose_goal_version(')
    expect(captured[1]?.values).toEqual([
      COACH,
      ORGANIZATION,
      CLIENT,
      'Para tu fase de definición',
      JSON.stringify(targets),
      '5d1a1c4e-2b3d-4c5e-9f60-7a8b9c0d1e2f',
      created.id,
      hash,
    ])
    expect(result).toEqual({ resource: created, replayed: true })
  })
})
