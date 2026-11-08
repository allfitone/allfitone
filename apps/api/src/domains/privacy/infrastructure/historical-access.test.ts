/**
 * How a read through a historical access case reaches PostgreSQL (`OP-NUT-011` frozen).
 *
 * The handler tests mock the service and `T-NUT-HIST-01` calls the function directly, so
 * neither would notice the session or the case in the wrong position, or a cursor rounded
 * on its way back. These assert the bindings and what the answer becomes.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import type { FrozenNutritionGoalVersion } from '../domain/historical-access.js'
import { createHistoricalAccessDatabase } from './historical-access.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: unknown,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      return Promise.resolve(text.includes('set_config') ? [{}] : [{ document: answer }])
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const ACTOR = {
  personId: '0199e000-0000-7000-8000-000000000011',
  sessionId: '0199e000-0000-7000-8000-000000000d11',
}
const TARGET = {
  organizationId: '0199e000-0000-7000-8000-000000000101',
  relationshipId: '0199e000-0000-7000-8000-000000000701',
  caseId: '0199e000-0000-7000-8000-000000000c01',
  requestId: '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
}

const goal = (id: string, createdAt: string): FrozenNutritionGoalVersion => ({
  id,
  status_at_cut: 'proposed',
  rationale: null,
  author: { kind: 'professional', person_id: null },
  targets: [],
  created_at: createdAt,
  activated_at: null,
  decision: null,
})

afterEach(async () => {
  await setDatabase(undefined)
})

describe('the frozen goals binding', () => {
  test('T-NUT-HIST-INT-01 the member, the session and the case, one more row, the exact instant', async () => {
    const captured: CapturedQuery[] = []
    const newer = goal('0199e000-0000-7000-8000-000000000a02', '2026-10-02T10:00:00.654321+00:00')
    const older = goal('0199e000-0000-7000-8000-000000000a01', '2026-10-01T10:00:00+00:00')
    await setDatabase(
      recordingDatabase(captured, { outcome: 'found', scope_version: 3, items: [newer, older] }),
    )
    const read = await createHistoricalAccessDatabase().listGoalVersions(ACTOR, TARGET, {
      limit: 1,
      cursor: {
        createdAt: '2026-10-03T10:00:00.1+00:00',
        id: '0199e000-0000-7000-8000-000000000a03',
      },
    })

    expect(captured[0]?.values).toEqual([ACTOR.personId, TARGET.requestId])
    expect(captured[1]?.text).toContain('nutrition.list_frozen_goal_versions(')
    expect(captured[1]?.values).toEqual([
      ACTOR.personId,
      ACTOR.sessionId,
      TARGET.organizationId,
      TARGET.relationshipId,
      TARGET.caseId,
      2,
      '2026-10-03T10:00:00.1+00:00',
      '0199e000-0000-7000-8000-000000000a03',
    ])
    expect(read).toEqual({
      outcome: 'found',
      value: {
        appliedScope: { code: 'nutrition_guidance', version: 3 },
        items: [newer],
        hasMore: true,
        nextCursor: { createdAt: newer.created_at, id: newer.id },
      },
    })
  })

  test('T-NUT-HIST-INT-02 a case not usable and guidance not frozen read as themselves', async () => {
    await setDatabase(recordingDatabase([], { outcome: 'not_found' }))
    expect(
      await createHistoricalAccessDatabase().listGoalVersions(ACTOR, TARGET, { limit: 25 }),
    ).toEqual({ outcome: 'not_found' })

    await setDatabase(
      recordingDatabase([], {
        outcome: 'scope_required',
        required_scope: { code: 'nutrition_guidance', level: 'read' },
      }),
    )
    expect(
      await createHistoricalAccessDatabase().listGoalVersions(ACTOR, TARGET, { limit: 25 }),
    ).toEqual({
      outcome: 'scope_required',
      requiredScope: { code: 'nutrition_guidance', level: 'read' },
    })
  })
})
