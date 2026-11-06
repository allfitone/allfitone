/**
 * How a gym's own movements reach PostgreSQL (`OP-CAT-001/002/003/009/010`).
 *
 * The handler tests use a recording database and the pgTAP tests call the functions
 * directly, so neither would notice a binding in the wrong position: the organization
 * and the movement swapped, the revision sent as a change, or a removed variant lost on
 * the way. These assert the bindings themselves.
 */
import { afterEach, describe, expect, test } from 'bun:test'
import type postgres from 'postgres'

import { setDatabase } from '../../../platform/db/index.js'
import { MovementCursorError, type StoredOrganizationMovement } from '../domain/index.js'
import { createOrganizationMovementDatabase } from './organization-movements.js'

interface CapturedQuery {
  text: string
  values: unknown[]
}

function recordingDatabase(
  captured: CapturedQuery[],
  answer: (text: string) => unknown[] | Error,
): ReturnType<typeof postgres> {
  const client = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('$')
      captured.push({ text, values })
      const result = answer(text)
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result)
    },
    {
      begin: (operation: (transaction: unknown) => Promise<unknown>) => operation(client),
      json: (value: unknown) => ({ json: value }),
      end: () => Promise.resolve(),
    },
  )
  return client as unknown as ReturnType<typeof postgres>
}

const COACH = '019f5707-0000-7000-8000-000000000002'
const ORGANIZATION = '019f5707-0000-7000-8000-000000000101'
const MOVEMENT = '019f5707-0000-7000-8000-0000000000a1'
const GLOBAL = '019f5707-0000-7000-8000-0000000000f1'
const COMMAND = {
  personId: COACH,
  organizationId: ORGANIZATION,
  idempotencyKey: '3f1c2a4e-8b3d-4c5e-9f60-7a8b9c0d1e2f',
  commandId: '019f5707-0000-7000-8000-000000000c01',
  requestHash: new Uint8Array(32).fill(7),
}
const STORED: StoredOrganizationMovement = {
  id: MOVEMENT,
  name: 'Búlgara de la casa',
  discipline_code: 'strength',
  scope: 'organization',
  archived: false,
  revision: 1,
  aliases: [],
  equipment: [],
  muscles: [],
  variant_of: null,
  name_locked: false,
  demo_object_key: null,
}

afterEach(async () => {
  await setDatabase(undefined)
})

function call(captured: CapturedQuery[], name: string): CapturedQuery {
  const found = captured.find((query) => query.text.includes(name))
  if (!found) throw new Error(`${name} was never called`)
  return found
}

function actor(captured: CapturedQuery[]): unknown[] {
  return call(captured, "set_config('app.actor_person_id'").values
}

describe('reads', () => {
  test('T-CAT-STUDIO-MOVEMENT-INT-01 the search binds every filter in its place, as the member', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('search_organization_movements')
          ? [{ page: { data: [], page: { next_cursor: null, has_more: false } } }]
          : [],
      ),
    )

    const page = await createOrganizationMovementDatabase().search({
      personId: COACH,
      organizationId: ORGANIZATION,
      query: 'búlgara',
      discipline: 'strength',
      includeArchived: true,
      limit: 10,
      cursor: 'c2VudGFkaWxsYXwwMTlmNTcwNw',
    })

    expect(page).toEqual({ data: [], page: { next_cursor: null, has_more: false } })
    expect(actor(captured)).toEqual([COACH])
    expect(call(captured, 'search_organization_movements').values).toEqual([
      COACH,
      ORGANIZATION,
      'búlgara',
      'strength',
      true,
      10,
      'c2VudGFkaWxsYXwwMTlmNTcwNw',
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-02 a cursor PostgreSQL cannot read is the cursor error', async () => {
    await setDatabase(
      recordingDatabase([], (text) =>
        text.includes('search_organization_movements')
          ? Object.assign(new Error('invalid cursor'), { code: '22023' })
          : [],
      ),
    )

    const searching = createOrganizationMovementDatabase().search({
      personId: COACH,
      organizationId: ORGANIZATION,
      query: null,
      discipline: null,
      includeArchived: false,
      limit: 25,
      cursor: 'c2VudGFkaWxsYXwwMTlmNTcwNw',
    })

    expect(searching).rejects.toBeInstanceOf(MovementCursorError)
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-03 the read binds the organization before the movement', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('read_organization_movement') ? [{ movement: null }] : [],
      ),
    )

    const read = await createOrganizationMovementDatabase().read({
      personId: COACH,
      organizationId: ORGANIZATION,
      movementId: MOVEMENT,
    })

    expect(read).toBeNull()
    expect(call(captured, 'read_organization_movement').values).toEqual([
      COACH,
      ORGANIZATION,
      MOVEMENT,
    ])
  })
})

describe('commands', () => {
  test('T-CAT-STUDIO-MOVEMENT-INT-04 creating binds lists as lists and the variant as JSON', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('create_organization_movement') ? [{ result: STORED, replayed: true }] : [],
      ),
    )

    const result = await createOrganizationMovementDatabase().create({
      ...COMMAND,
      movement: {
        discipline_code: 'strength',
        name: 'Búlgara de la casa',
        aliases: ['Búlgara casera'],
        equipment: ['dumbbell'],
        variant: { movement_id: GLOBAL, relation: 'variant' },
      },
    })

    expect(result).toEqual({ resource: STORED, replayed: true })
    expect(actor(captured)).toEqual([COACH])
    expect(call(captured, 'create_organization_movement').values).toEqual([
      COACH,
      ORGANIZATION,
      'strength',
      'Búlgara de la casa',
      ['Búlgara casera'],
      ['dumbbell'],
      { json: { movement_id: GLOBAL, relation: 'variant' } },
      COMMAND.idempotencyKey,
      COMMAND.commandId,
      COMMAND.requestHash,
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-05 what was left out is null, not an empty list', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('create_organization_movement') ? [{ result: STORED, replayed: false }] : [],
      ),
    )

    await createOrganizationMovementDatabase().create({
      ...COMMAND,
      movement: { discipline_code: 'strength', name: 'Búlgara de la casa' },
    })

    expect(call(captured, 'create_organization_movement').values.slice(4, 7)).toEqual([
      null,
      null,
      null,
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-06 editing sends the revision apart and a removed variant as null', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('update_organization_movement') ? [{ result: STORED, replayed: false }] : [],
      ),
    )

    await createOrganizationMovementDatabase().update({
      ...COMMAND,
      movementId: MOVEMENT,
      expectedRevision: 3,
      changes: { name: 'Búlgara nueva', variant: null },
    })

    expect(call(captured, 'update_organization_movement').values).toEqual([
      COACH,
      ORGANIZATION,
      MOVEMENT,
      3,
      { json: { name: 'Búlgara nueva', variant: null } },
      COMMAND.idempotencyKey,
      COMMAND.commandId,
      COMMAND.requestHash,
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-07 archiving binds the movement and the command', async () => {
    const captured: CapturedQuery[] = []
    await setDatabase(
      recordingDatabase(captured, (text) =>
        text.includes('archive_organization_movement')
          ? [{ result: { ...STORED, archived: true }, replayed: false }]
          : [],
      ),
    )

    const result = await createOrganizationMovementDatabase().archive({
      ...COMMAND,
      movementId: MOVEMENT,
    })

    expect(result.resource.archived).toBe(true)
    expect(call(captured, 'archive_organization_movement').values).toEqual([
      COACH,
      ORGANIZATION,
      MOVEMENT,
      COMMAND.idempotencyKey,
      COMMAND.commandId,
      COMMAND.requestHash,
    ])
  })

  test('T-CAT-STUDIO-MOVEMENT-INT-08 a command PostgreSQL answered with nothing is an error', async () => {
    await setDatabase(recordingDatabase([], () => []))

    expect(
      createOrganizationMovementDatabase().archive({ ...COMMAND, movementId: MOVEMENT }),
    ).rejects.toThrow('PostgreSQL did not archive the movement')
  })
})
