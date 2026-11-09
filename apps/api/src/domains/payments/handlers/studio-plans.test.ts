/**
 * `T-PAY-API-02` — a gym's plans in Studio against the contract (`OP-PAY-002..006`).
 *
 * What this layer owns is the shape: exactly the declared fields, whole pesos in COP, the
 * command headers, a hash that tells the four commands apart, a cursor that survives any
 * name, and each database refusal reaching the caller as its status. Who may publish and
 * what replacing a price does are decided in PostgreSQL (`T-PAY-GYM-PLAN-01/02`).
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractSchemas } from '@allfitone/contracts'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { Hono } from 'hono'

import type { StudioSessionService } from '../../identity/index.js'
import type { OrganizationPlanService } from '../application/organization-plans.js'
import type { StudioOrganizationPlan, StudioPlanVersion } from '../domain/organization-plans.js'
import { studioPaymentRoutes } from './studio.js'

const validator = new Ajv2020({ strict: false, allErrors: true })
addFormats(validator)
validator.addSchema({ $id: 'allfit-v1', components: { schemas: allfitV1ContractSchemas } })

function assertMatchesContract(schemaName: string, body: unknown): void {
  const validate = validator.getSchema(`allfit-v1#/components/schemas/${schemaName}`)
  if (!validate) throw new Error(`The contract declares no schema named ${schemaName}`)
  if (validate(body)) return
  const failures = (validate.errors ?? [])
    .map((error) => `${error.instancePath || '/'} ${error.message ?? 'is invalid'}`)
    .join('; ')
  throw new Error(`${schemaName} violates the contract: ${failures}`)
}

const ORGANIZATION = '019c3300-0000-7000-8000-000000000101'
const PLAN = '019c3300-0000-7000-8000-000000000401'
const VERSION = '019c3300-0000-7000-8000-000000000501'
const BASE = `/studio/v1/organizations/${ORGANIZATION}/plans`
const HEADERS = {
  origin: 'https://studio.example.test',
  cookie: 'allfit_studio_session=opaque',
}
const COMMAND = {
  ...HEADERS,
  'content-type': 'application/json',
  'idempotency-key': '7f1d3c9e-4a2b-4c6d-8e5f-0a1b2c3d4e5f',
  'command-id': '019c3300-0000-7000-8000-0000000000aa',
}
const PRICE = {
  amount_minor: 12000000,
  currency_code: 'COP',
  billing_period: 'month',
  delivery_mode: 'in_person',
}

function version(overrides: Partial<StudioPlanVersion> = {}): StudioPlanVersion {
  return {
    plan_version_id: VERSION,
    version_number: 1,
    amount_minor: 12000000,
    currency_code: 'COP',
    billing_period: 'month',
    delivery_mode: 'in_person',
    status: 'published',
    published_at: '2026-11-09T15:00:00.000Z',
    deprecated_at: null,
    ...overrides,
  }
}

function plan(overrides: Partial<StudioOrganizationPlan> = {}): StudioOrganizationPlan {
  return {
    plan_id: PLAN,
    name: 'Mensual',
    status: 'published',
    on_sale: true,
    created_at: '2026-11-09T14:00:00.000Z',
    current_version: version(),
    versions: [version()],
    ...overrides,
  }
}

function sessions(): StudioSessionService {
  return {
    completeCode: async () => ({ opaqueToken: 'opaque' }),
    readSession: async () => ({
      authenticated: true,
      registration_status: 'complete',
      identity: { given_name: 'Olivia', family_name: 'Owner' },
    }),
    resolveActor: async () => ({ accountId: 'account', personId: 'person' }),
    resolveAccountIdentity: async () => ({
      actor: { accountId: 'account', personId: 'person' },
      identity: { givenName: 'Olivia', familyName: 'Owner', verifiedEmail: 'o@example.test' },
    }),
    logout: async () => ({ redirectUrl: 'https://studio.example.test', outcome: 'already-absent' }),
  }
}

type Capture = { inputs: Record<string, unknown>[]; hashes: string[] }

function plans(overrides: Partial<OrganizationPlanService> = {}, capture?: Capture) {
  const record = (input: object) => {
    const seen = input as Record<string, unknown>
    capture?.inputs.push(seen)
    if (seen.requestHash instanceof Uint8Array) {
      capture?.hashes.push(Buffer.from(seen.requestHash).toString('hex'))
    }
  }
  const service: OrganizationPlanService = {
    list: async (_personId, input) => {
      record(input)
      return { items: [plan()], hasMore: false }
    },
    create: async (_personId, input) => {
      record(input)
      return {
        resource: plan({ status: 'draft', on_sale: false, current_version: null, versions: [] }),
        replayed: false,
      }
    },
    rename: async (_personId, input) => {
      record(input)
      return { resource: plan({ name: input.name }), replayed: false }
    },
    publish: async (_personId, input) => {
      record(input)
      return { resource: plan(), created: true, replayed: false }
    },
    deprecate: async (_personId, input) => {
      record(input)
      return {
        resource: plan({
          on_sale: false,
          current_version: null,
          versions: [version({ status: 'deprecated', deprecated_at: '2026-11-09T16:00:00.000Z' })],
        }),
        replayed: false,
      }
    },
    ...overrides,
  }
  return service
}

function app(service: OrganizationPlanService): Hono {
  const routes = new Hono()
  routes.route('/studio/v1', studioPaymentRoutes({ plans: service, sessions: sessions() }))
  return routes
}

function post(body: unknown, headers: Record<string, string> = COMMAND): RequestInit {
  return { method: 'POST', headers, body: JSON.stringify(body) }
}

beforeEach(() => {
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
})

describe('reading the plans', () => {
  test('answers the page the contract describes, never cached', async () => {
    const response = await app(plans()).request(BASE, { headers: HEADERS })

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await response.json()
    assertMatchesContract('StudioOrganizationPlanPage', body)
    expect(body).toEqual({ data: [plan()], page: { has_more: false, next_cursor: null } })
  })

  test('issues a cursor that carries any name back intact', async () => {
    const capture: Capture = { inputs: [], hashes: [] }
    const awkward = 'Plan "Élite" \u001f / 100%'
    const service = plans(
      {
        list: async (_personId, input) => {
          capture.inputs.push(input as Record<string, unknown>)
          return { items: [plan({ name: awkward, status: 'draft' })], hasMore: true }
        },
      },
      capture,
    )

    const first = await app(service).request(`${BASE}?limit=1`, { headers: HEADERS })
    const cursor = ((await first.json()) as { page: { next_cursor: string } }).page.next_cursor
    expect(typeof cursor).toBe('string')

    const second = await app(service).request(`${BASE}?cursor=${cursor}`, { headers: HEADERS })
    expect(second.status).toBe(200)
    expect(capture.inputs[1]).toMatchObject({
      organizationId: ORGANIZATION,
      limit: 50,
      cursorStatus: 'draft',
      cursorName: awkward,
      cursorPlanId: PLAN,
    })
  })

  test.each([
    ['a cursor that is not one', '?cursor=not-a-cursor'],
    [
      'a cursor with a status that does not exist',
      `?cursor=${Buffer.from(JSON.stringify(['gone', 'x', PLAN])).toString('base64url')}`,
    ],
    ['a page of nothing', '?limit=0'],
    ['a page past the cap', '?limit=101'],
  ])('refuses %s', async (_label, query) => {
    const response = await app(plans()).request(`${BASE}${query}`, { headers: HEADERS })
    expect(response.status).toBe(422)
  })

  test('refuses a malformed organization, a missing session and a foreign origin', async () => {
    const service = plans()
    const malformed = await app(service).request('/studio/v1/organizations/nope/plans', {
      headers: HEADERS,
    })
    const anonymous = await app(service).request(BASE, { headers: { origin: HEADERS.origin } })
    const foreign = await app(service).request(BASE, {
      headers: { ...HEADERS, origin: 'https://evil.example.test' },
    })

    expect(malformed.status).toBe(400)
    expect(anonymous.status).toBe(401)
    expect(foreign.status).toBe(403)
  })
})

describe('creating and renaming', () => {
  test('creates a draft and says so with 201', async () => {
    const capture: Capture = { inputs: [], hashes: [] }
    const response = await app(plans({}, capture)).request(BASE, post({ name: '  Mensual ' }))

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    assertMatchesContract('StudioOrganizationPlan', await response.json())
    expect(capture.inputs[0]).toMatchObject({ organizationId: ORGANIZATION, name: 'Mensual' })
  })

  test('marks a replay', async () => {
    const service = plans({
      create: async () => ({ resource: plan(), replayed: true }),
    })
    const response = await app(service).request(BASE, post({ name: 'Mensual' }))

    expect(response.status).toBe(201)
    expect(response.headers.get('Idempotent-Replay')).toBe('true')
  })

  test.each([
    ['no name', {}],
    ['a blank name', { name: '   ' }],
    ['a name past eighty characters', { name: 'x'.repeat(81) }],
    ['a name that is not text', { name: 7 }],
    ['a field the contract does not declare', { name: 'Mensual', status: 'published' }],
  ])('refuses %s', async (_label, body) => {
    const response = await app(plans()).request(BASE, post(body))
    expect(response.status).toBe(422)
  })

  test('refuses a body that is not JSON, and a command without its headers', async () => {
    const service = plans()
    const text = await app(service).request(BASE, {
      method: 'POST',
      headers: { ...COMMAND, 'content-type': 'text/plain' },
      body: 'Mensual',
    })
    const headless = await app(service).request(BASE, {
      method: 'POST',
      headers: { ...HEADERS, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Mensual' }),
    })

    expect(text.status).toBe(415)
    expect(headless.status).toBe(400)
  })

  test('renames a plan', async () => {
    const response = await app(plans()).request(`${BASE}/${PLAN}`, {
      method: 'PATCH',
      headers: COMMAND,
      body: JSON.stringify({ name: 'Mensual presencial' }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    assertMatchesContract('StudioOrganizationPlan', body)
    expect((body as { name: string }).name).toBe('Mensual presencial')
  })

  test('refuses a malformed plan id', async () => {
    const response = await app(plans()).request(`${BASE}/nope`, {
      method: 'PATCH',
      headers: COMMAND,
      body: JSON.stringify({ name: 'Mensual' }),
    })
    expect(response.status).toBe(400)
  })
})

describe('pricing and taking off sale', () => {
  const versions = `${BASE}/${PLAN}/versions`

  test('a new price answers 201 and reaches the service whole', async () => {
    const capture: Capture = { inputs: [], hashes: [] }
    const response = await app(plans({}, capture)).request(versions, post(PRICE))

    expect(response.status).toBe(201)
    assertMatchesContract('StudioOrganizationPlan', await response.json())
    expect(capture.inputs[0]).toMatchObject({
      organizationId: ORGANIZATION,
      planId: PLAN,
      version: PRICE,
    })
  })

  test('the price already on sale answers 200, and a replay answers as the first call did', async () => {
    const answer = (created: boolean, replayed: boolean) =>
      plans({ publish: async () => ({ resource: plan(), created, replayed }) })

    const same = await app(answer(false, false)).request(versions, post(PRICE))
    const sameAgain = await app(answer(false, true)).request(versions, post(PRICE))
    const newAgain = await app(answer(true, true)).request(versions, post(PRICE))

    expect(same.status).toBe(200)
    expect(same.headers.get('Idempotent-Replay')).toBeNull()
    expect(sameAgain.status).toBe(200)
    expect(sameAgain.headers.get('Idempotent-Replay')).toBe('true')
    expect(newAgain.status).toBe(201)
    expect(newAgain.headers.get('Idempotent-Replay')).toBe('true')
  })

  test.each([
    ['dollars', { ...PRICE, currency_code: 'USD' }],
    ['centavos', { ...PRICE, amount_minor: 1234550 }],
    ['nothing', { ...PRICE, amount_minor: 0 }],
    ['an amount past the cap', { ...PRICE, amount_minor: 100_000_000_100 }],
    ['an amount as text', { ...PRICE, amount_minor: '12000000' }],
    ['a fortnight', { ...PRICE, billing_period: 'fortnight' }],
    ['a delivery that does not exist', { ...PRICE, delivery_mode: 'online' }],
    ['a missing field', { amount_minor: 12000000, currency_code: 'COP', billing_period: 'month' }],
    ['an extra field', { ...PRICE, status: 'published' }],
  ])('refuses %s', async (_label, body) => {
    const response = await app(plans()).request(versions, post(body))
    expect(response.status).toBe(422)
  })

  test('retires a version without a body', async () => {
    const capture: Capture = { inputs: [], hashes: [] }
    const path = `${versions}/${VERSION}/deprecation`
    const response = await app(plans({}, capture)).request(path, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'idempotency-key': COMMAND['idempotency-key'],
        'command-id': COMMAND['command-id'],
      },
    })

    expect(response.status).toBe(200)
    assertMatchesContract('StudioOrganizationPlan', await response.json())
    expect(capture.inputs[0]).toMatchObject({ planId: PLAN, planVersionId: VERSION })
  })

  test('refuses a malformed version id', async () => {
    const response = await app(plans()).request(`${versions}/nope/deprecation`, {
      method: 'POST',
      headers: COMMAND,
    })
    expect(response.status).toBe(400)
  })
})

describe('what the commands share', () => {
  test('the same key on four commands makes four different hashes', async () => {
    const capture: Capture = { inputs: [], hashes: [] }
    const service = plans({}, capture)
    const versions = `${BASE}/${PLAN}/versions`

    await app(service).request(BASE, post({ name: 'Mensual' }))
    await app(service).request(`${BASE}/${PLAN}`, {
      method: 'PATCH',
      headers: COMMAND,
      body: JSON.stringify({ name: 'Mensual' }),
    })
    await app(service).request(versions, post(PRICE))
    await app(service).request(`${versions}/${VERSION}/deprecation`, {
      method: 'POST',
      headers: COMMAND,
    })

    expect(new Set(capture.hashes).size).toBe(4)
  })

  test.each([
    ['42501', 403],
    ['P0002', 404],
    ['23505', 409],
    ['40001', 409],
    ['22023', 422],
    ['XX000', 503],
  ])('a database answer %s reaches the caller as %i', async (code, status) => {
    const failing = plans({
      create: async () => {
        throw Object.assign(new Error('refused'), { code })
      },
    })
    const response = await app(failing).request(BASE, post({ name: 'Mensual' }))
    expect(response.status).toBe(status)
  })
})
