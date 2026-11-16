import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  type BackofficeAuthenticationService,
} from '../../identity/index.js'
import { mountSurfaces } from '../../../surfaces.js'
import type {
  SupportAttentionService,
  SupportBusinessService,
  SupportDiagnosisService,
  SupportMetadataService,
} from '../application/index.js'
import { backofficeSupportMetadataRoutes } from './backoffice-metadata.js'

const ORIGIN = 'https://backoffice.example.test'
const ACTOR_PERSON_ID = '019a5000-0000-7000-8000-000000000003'
const ACTOR_SESSION_ID = '019a5000-0000-7000-8000-000000000023'
const SUBJECT_ID = '019a5000-0000-7000-8000-000000000005'
const CASE = 'CASE-2026-101'

const metadata: AllfitV1Schemas['SupportPersonMetadata'] = {
  person_id: SUBJECT_ID,
  display_name: 'Epsilon Ramírez',
  contact_email: 'subject.epsilon@example.test',
  contact_phone: '+573001234567',
  account_status: 'active',
  created_at: '2026-01-04T10:00:00.000Z',
  activated_at: '2026-01-05T10:00:00.000Z',
  contact_email_masked: '••••••••on@example.test',
  contact_phone_masked: '••••••4567',
  email_verified_at: '2026-01-05T10:05:00.000Z',
  phone_verified_at: null,
  has_access_account: true,
  access_account_linked_at: '2026-01-05T10:01:00.000Z',
  active_session_count: 1,
  last_seen_at: '2026-09-09T18:00:00.000Z',
  professional_profile: { exists: false, created_at: null },
  membership_count: 2,
  active_membership_count: 1,
  relationships: {
    active: 1,
    ended: 1,
    last_started_at: '2026-08-01T10:00:00.000Z',
    last_ended_at: '2026-10-01T10:00:00.000Z',
  },
  permissions: {
    active: 2,
    frozen: 0,
    revoked: 1,
    last_granted_at: '2026-08-01T10:00:00.000Z',
    last_revoked_at: '2026-09-01T10:00:00.000Z',
  },
  plan: { status: null, started_at: null, current_period_end: null },
  pro: { source: 'organization', until: null },
}

const match: AllfitV1Schemas['SupportPersonMatch'] = {
  person_id: SUBJECT_ID,
  display_name: 'Epsilon Ramírez',
  contact_email: 'subject.epsilon@example.test',
  contact_phone: '+573001234567',
  account_status: 'active',
}

interface CapturedCall {
  operation: string
  reader: unknown
  input: unknown
}

const personPayments: AllfitV1Schemas['SupportPersonPayments'] = {
  person_id: SUBJECT_ID,
  generated_at: '2026-10-14T12:00:00.000Z',
  pro: {
    source: 'subscription',
    subscription: {
      plan_name: 'Pro',
      version_number: 1,
      amount_minor: 1990000,
      currency_code: 'COP',
      billing_period: 'month',
      store: 'app_store',
      status: 'active',
      auto_renews: true,
      started_at: '2026-09-14T12:00:00.000Z',
      current_period_end: '2026-11-01T12:00:00.000Z',
      grace_until: null,
      suspended_at: null,
      ended_at: null,
      ended_reason: null,
    },
    organizations: [],
  },
  payments: [
    {
      occurred_at: '2026-10-01T12:00:00.000Z',
      store: 'app_store',
      result: 'succeeded',
      failure_code: null,
      amount_minor: 1990000,
      currency_code: 'COP',
    },
  ],
  payments_truncated: false,
  organization_subscriptions: [],
  organization_charges_availability: 'not_modelled',
}

let captured: CapturedCall[] = []

const followUp: AllfitV1Schemas['SupportBillingFollowUp'] = {
  generated_at: '2026-11-04T12:00:00.000Z',
  window_days: 30,
  items: [
    {
      person_id: SUBJECT_ID,
      subscription_status: 'suspended',
      plan_name: 'Pro',
      store: 'google_play',
      grace_until: null,
      suspended_at: '2026-10-31T12:00:00.000Z',
      failed_charges: 1,
      last_failed_charge: {
        occurred_at: '2026-10-30T12:00:00.000Z',
        failure_code: 'billing_retry',
        amount_minor: 1990000,
        currency_code: 'COP',
      },
    },
  ],
  has_more: false,
}

function metadataService(overrides: Partial<SupportMetadataService> = {}): SupportMetadataService {
  return {
    search: (reader, input) => {
      captured.push({ operation: 'search', reader, input })
      return Promise.resolve({ outcome: 'found', items: [match], has_more: false })
    },
    read: (reader, input) => {
      captured.push({ operation: 'read', reader, input })
      return Promise.resolve(metadata)
    },
    payments: (reader, input) => {
      captured.push({ operation: 'payments', reader, input })
      return Promise.resolve(personPayments)
    },
    billingFollowUp: (reader, input) => {
      captured.push({ operation: 'billingFollowUp', reader, input })
      return Promise.resolve(followUp)
    },
    ...overrides,
  }
}

function sessionService(
  overrides: Partial<BackofficeAuthenticationService> = {},
): BackofficeAuthenticationService {
  return {
    resolveActor: async () => ({ personId: ACTOR_PERSON_ID, sessionId: ACTOR_SESSION_ID }),
    ...overrides,
  } as BackofficeAuthenticationService
}

const operation: AllfitV1Schemas['SupportOperation'] = {
  source: 'notification',
  reference_id: '019a6000-0000-7000-8000-000000000301',
  subject_kind: 'invitation',
  subject_id: '019a6000-0000-7000-8000-000000000401',
  label: 'identity.invitation_issued.v1',
  state: 'retrying',
  occurred_at: '2026-09-10T18:00:00.000Z',
  attempt_count: 3,
  last_error_code: 'smtp_timeout',
  resolved_at: null,
}

let diagnosisCalls: unknown[] = []

function diagnosisService(
  overrides: Partial<SupportDiagnosisService> = {},
): SupportDiagnosisService {
  return {
    listOperations: (_reader, input) => {
      diagnosisCalls.push(input)
      return Promise.resolve({ items: [operation], hasMore: true, nextCursor: 'next-page' })
    },
    listDeliveryCircuits: (_reader, input) => {
      diagnosisCalls.push(input)
      return Promise.resolve([
        {
          event_type: 'identity.invitation_issued.v1',
          state: 'open',
          window_started_at: '2026-09-10T17:00:00.000Z',
          success_count: 0,
          failure_count: 12,
          opened_until: '2026-09-10T19:00:00.000Z',
        },
      ])
    },
    jobHealth: (_reader, input) => {
      diagnosisCalls.push(input)
      return Promise.resolve({
        generated_at: '2026-11-04T12:00:00.000Z',
        items: [
          {
            job_name: 'privacy_disposition',
            last_run_at: '2026-11-04T11:59:00.000Z',
            last_outcome: 'failed',
            last_failure_at: '2026-11-04T11:59:00.000Z',
            last_error_code: 'privacy_disposition_failed',
            failures_24h: 3,
          },
        ],
      })
    },
    ...overrides,
  }
}

const panel: AllfitV1Schemas['SupportAttentionPanel'] = {
  generated_at: '2026-09-13T18:00:00.000Z',
  billing: {
    availability: 'withheld',
    window_hours: 24,
    failed_platform_charges: null,
    platform_subscriptions_in_grace: null,
    platform_subscriptions_suspended: null,
    organization_subscriptions_suspended: null,
    failed_organization_charges_availability: null,
  },
  credential_verifications: {
    availability: 'withheld',
    pending_count: null,
    oldest_requested_at: null,
    renewals_due_count: null,
  },
  unclaimed_organizations: {
    availability: 'available',
    count: 3,
    oldest_created_at: '2026-09-01T12:00:00.000Z',
    needs_follow_up_count: 1,
  },
  repeated_failures: {
    availability: 'available',
    window_hours: 24,
    groups: [
      {
        source: 'notification',
        label: 'identity.invitation_issued.v1',
        affected: 2,
        failures: 5,
        latest_occurred_at: '2026-09-13T17:50:00.000Z',
        last_error_code: 'smtp_timeout',
      },
    ],
    groups_truncated: false,
    open_circuits: [],
  },
}

let attentionCalls: CapturedCall[] = []

function attentionService(
  overrides: Partial<SupportAttentionService> = {},
): SupportAttentionService {
  return {
    read: (reader, input) => {
      attentionCalls.push({ operation: 'read', reader, input })
      return Promise.resolve(panel)
    },
    ...overrides,
  }
}

const business: AllfitV1Schemas['SupportBusinessPanel'] = {
  generated_at: '2026-09-17T18:00:00.000Z',
  minimum_aggregate: 5,
  metrics: [
    {
      key: 'registered_people',
      availability: 'available',
      value: 128,
      reason: null,
      period: { kind: 'total', from: null, to: '2026-09-17T18:00:00.000Z' },
    },
    {
      key: 'studio_active_professionals_this_week',
      availability: 'below_threshold',
      value: null,
      reason: null,
      period: {
        kind: 'week',
        from: '2026-09-10T18:00:00.000Z',
        to: '2026-09-17T18:00:00.000Z',
      },
    },
    {
      key: 'premium_people',
      availability: 'available',
      value: 12,
      reason: null,
      period: { kind: 'total', from: null, to: '2026-09-17T18:00:00.000Z' },
    },
  ],
  money: [
    {
      key: 'billed_this_month',
      availability: 'available',
      amounts: [{ currency_code: 'COP', amount_minor: 7960000 }],
      reason: null,
      period: {
        kind: 'month',
        from: '2026-09-01T05:00:00.000Z',
        to: '2026-09-17T18:00:00.000Z',
      },
    },
  ],
}

let businessCalls: CapturedCall[] = []

function businessService(overrides: Partial<SupportBusinessService> = {}): SupportBusinessService {
  return {
    read: (reader, input) => {
      businessCalls.push({ operation: 'read', reader, input })
      return Promise.resolve(business)
    },
    ...overrides,
  }
}

function routes(
  service: SupportMetadataService = metadataService(),
  sessions: BackofficeAuthenticationService = sessionService(),
  diagnosis: SupportDiagnosisService = diagnosisService(),
  attention: SupportAttentionService = attentionService(),
  businessPanel: SupportBusinessService = businessService(),
): Hono {
  return new Hono().route(
    '/backoffice/v1',
    backofficeSupportMetadataRoutes(service, sessions, diagnosis, attention, businessPanel),
  )
}

function request(path: string, init: { origin?: string; cookie?: boolean } = {}): Request {
  const headers = new Headers({ origin: init.origin ?? ORIGIN })
  if (init.cookie !== false) headers.set('cookie', `${BACKOFFICE_SESSION_COOKIE}=session-secret`)
  return new Request(`https://api.example.test/backoffice/v1${path}`, { headers })
}

function colonPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
}

beforeEach(() => {
  captured = []
  diagnosisCalls = []
  attentionCalls = []
  businessCalls = []
  process.env.BACKOFFICE_WEB_URL = ORIGIN
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Backoffice support metadata API contract', () => {
  test('T-SUP-API-21 mounts every support metadata operation with its contract method', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) =>
        [
          'OP-SUP-005',
          'NEW-SUP-ATTENTION',
          'NEW-SUP-DASHBOARD',
          'NEW-SUP-PERSON-PAYMENTS',
          'NEW-SUP-BILLING-FOLLOW-UP',
          'NEW-SUP-JOB-HEALTH',
        ].includes(operation.allfitOperation),
      )
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = backofficeSupportMetadataRoutes()
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /backoffice/v1${route.path}`)
      .sort()

    expect(contract).toHaveLength(9)
    expect(mounted).toEqual(contract)
  })

  test('T-SUP-API-22 mounts below the real Backoffice surface prefix', () => {
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)

    expect(mounted).toContain('GET /backoffice/v1/support/people')
    expect(mounted).toContain('GET /backoffice/v1/support/people/:personId')
    expect(mounted).toContain('GET /backoffice/v1/support/operations')
    expect(mounted).toContain('GET /backoffice/v1/support/delivery-circuits')
    expect(mounted).toContain('GET /backoffice/v1/support/attention')
    expect(mounted).toContain('GET /backoffice/v1/support/business')
    expect(mounted).toContain('GET /backoffice/v1/support/billing-follow-up')
    expect(mounted).toContain('GET /backoffice/v1/support/job-health')
  })

  test('T-SUP-API-50 reads the job health without a case reference, and refuses a filter', async () => {
    const response = await routes().fetch(request('/support/job-health'))
    const filtered = await routes().fetch(request('/support/job-health?job=privacy_disposition'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as { items: { last_outcome: string }[] }
    expect(body.items[0]?.last_outcome).toBe('failed')
    expect(filtered.status).toBe(400)
  })

  test('T-SUP-API-51 filters the feed by the two new sources and the failed state', async () => {
    const answers = await Promise.all(
      ['source=job', 'source=store_notification', 'state=failed'].map((query) =>
        routes().fetch(request(`/support/operations?${query}`)),
      ),
    )

    expect(answers.map((response) => response.status)).toEqual([200, 200, 200])
    expect(diagnosisCalls).toMatchObject([
      { source: 'job' },
      { source: 'store_notification' },
      { state: 'failed' },
    ])
  })

  test('T-SUP-API-23 finds people by part of a name, with the case and page carried through', async () => {
    const response = await routes().fetch(
      request(`/support/people?q=%20Epsi%20&case_reference=${CASE}&limit=10`),
    )
    const plain = await routes().fetch(request('/support/people?q=ramírez'))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      outcome: 'found',
      items: [match],
      has_more: false,
    })
    expect(plain.status).toBe(200)
    expect(captured[0]?.reader).toEqual({
      actorPersonId: ACTOR_PERSON_ID,
      actorSessionId: ACTOR_SESSION_ID,
    })
    expect(captured.map((call) => call.input)).toMatchObject([
      { caseReference: CASE, query: 'Epsi', limit: 10 },
      { caseReference: null, query: 'ramírez', limit: 25 },
    ])
  })

  test('T-SUP-API-24 says nothing was found instead of answering a bare empty list', async () => {
    const response = await routes(
      metadataService({
        search: async () => ({ outcome: 'not_found', items: [], has_more: false }),
      }),
    ).fetch(request(`/support/people?q=${SUBJECT_ID}`))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { outcome: string; items: unknown[] }
    expect(body.outcome).toBe('not_found')
    expect(body.items).toEqual([])
  })

  test('T-SUP-API-25 refuses a search too short, too long or with a page outside the contract', async () => {
    const answers = await Promise.all(
      [
        '/support/people',
        '/support/people?q=e',
        '/support/people?q=%20e%20',
        `/support/people?q=${'e'.repeat(101)}`,
        '/support/people?q=epsi&limit=0',
        '/support/people?q=epsi&limit=26',
        '/support/people?q=epsi&limit=diez',
      ].map((path) => routes().fetch(request(path))),
    )

    expect(answers.map((response) => response.status)).toEqual([400, 400, 400, 400, 400, 400, 400])
    expect(captured).toEqual([])
  })

  test('T-SUP-API-26 refuses the exact lookups the search no longer takes', async () => {
    const answers = await Promise.all(
      [`identifier=${SUBJECT_ID}`, 'email=subject.epsilon%40example.test', 'phone=%2B57300'].map(
        (lookup) => routes().fetch(request(`/support/people?q=epsi&${lookup}`)),
      ),
    )

    expect(answers.map((response) => response.status)).toEqual([400, 400, 400])
    expect(captured).toEqual([])
  })

  test('T-SUP-API-27 takes a case reference when there is one, and refuses one in free text', async () => {
    const searchProse = await routes().fetch(
      request('/support/people?q=epsi&case_reference=el%20usuario%20no%20entra'),
    )
    const readEmpty = await routes().fetch(request(`/support/people/${SUBJECT_ID}?case_reference=`))
    const readWithout = await routes().fetch(request(`/support/people/${SUBJECT_ID}`))

    expect([searchProse.status, readEmpty.status, readWithout.status]).toEqual([400, 400, 200])
    expect(captured).toEqual([
      expect.objectContaining({
        operation: 'read',
        input: expect.objectContaining({ caseReference: null }),
      }),
    ])
  })

  test('T-SUP-API-28 opens her file with her name and full contact, and no provider subject', async () => {
    const response = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as Record<string, unknown>
    expect(body.person_id).toBe(SUBJECT_ID)
    expect(body).toMatchObject({
      display_name: 'Epsilon Ramírez',
      contact_email: 'subject.epsilon@example.test',
      contact_phone: '+573001234567',
    })
    // HU-BO-007 criterion 2: what exists, with states and dates, never which gym or scope.
    expect(body.relationships).toEqual(metadata.relationships)
    expect(body.pro).toEqual({ source: 'organization', until: null })
    for (const forbidden of ['given_name', 'family_name', 'username', 'subject']) {
      expect(body).not.toHaveProperty(forbidden)
    }
    expect(captured[0]?.input).toMatchObject({ caseReference: CASE, personId: SUBJECT_ID })
  })

  test('T-SUP-API-45 opens what a person pays, with her case reference carried through', async () => {
    const response = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}/payments?case_reference=${CASE}`),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(personPayments)
    const call = captured.find((entry) => entry.operation === 'payments')
    expect(call?.input).toMatchObject({ caseReference: CASE, personId: SUBJECT_ID })
  })

  test('T-SUP-API-46 opens what she pays without a case, and refuses one in free text', async () => {
    const without = await routes().fetch(request(`/support/people/${SUBJECT_ID}/payments`))
    const prose = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}/payments?case_reference=sin%20caso`),
    )

    expect([without.status, prose.status]).toEqual([200, 400])
    const calls = captured.filter((entry) => entry.operation === 'payments')
    expect(calls.map((call) => call.input)).toMatchObject([
      { caseReference: null, personId: SUBJECT_ID },
    ])
  })

  test('T-SUP-API-47 refuses a person identifier that is not one', async () => {
    const response = await routes().fetch(
      request(`/support/people/not-a-uuid/payments?case_reference=${CASE}`),
    )

    expect(response.status).toBe(400)
    expect(captured.some((entry) => entry.operation === 'payments')).toBe(false)
  })

  test('T-SUP-API-48 lists the charges to follow up under the case, with its page size', async () => {
    const response = await routes().fetch(
      request(`/support/billing-follow-up?case_reference=${CASE}&limit=20`),
    )
    const defaulted = await routes().fetch(request('/support/billing-follow-up'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(followUp)
    expect(defaulted.status).toBe(200)
    const calls = captured.filter((entry) => entry.operation === 'billingFollowUp')
    expect(calls.map((call) => call.input)).toMatchObject([
      { caseReference: CASE, limit: 20 },
      { caseReference: null, limit: 50 },
    ])
  })

  test('T-SUP-API-49 refuses a case in free text or a page outside the contract', async () => {
    const answers = await Promise.all(
      [
        '/support/billing-follow-up?case_reference=sin%20caso',
        `/support/billing-follow-up?case_reference=${CASE}&limit=0`,
        `/support/billing-follow-up?case_reference=${CASE}&limit=201`,
        `/support/billing-follow-up?case_reference=${CASE}&limit=diez`,
        `/support/billing-follow-up?case_reference=${CASE}&status=suspended`,
      ].map((path) => routes().fetch(request(path))),
    )

    expect(answers.map((response) => response.status)).toEqual([400, 400, 400, 400, 400])
    expect(captured.some((entry) => entry.operation === 'billingFollowUp')).toBe(false)
  })

  test('T-SUP-API-29 rejects a malformed person before reaching the database', async () => {
    const response = await routes().fetch(
      request(`/support/people/not-a-uuid?case_reference=${CASE}`),
    )

    expect(response.status).toBe(400)
    expect(captured).toEqual([])
  })

  test('T-SUP-API-30 maps every declared database verdict to its problem response', async () => {
    const verdicts: [string, number][] = [
      ['P0002', 404],
      ['42501', 403],
      ['23514', 422],
    ]
    const answers = await Promise.all(
      verdicts.map(([sqlState]) =>
        routes(
          metadataService({
            read: () => Promise.reject(Object.assign(new Error('refused'), { code: sqlState })),
          }),
        ).fetch(request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`)),
      ),
    )
    const broken = await routes(
      metadataService({ read: () => Promise.reject(new Error('database unavailable')) }),
    ).fetch(request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`))

    expect(answers.map((response) => response.status)).toEqual(verdicts.map(([, status]) => status))
    expect(broken.status).toBe(503)
    expect(answers[0]?.headers.get('content-type')).toContain('application/problem+json')
  })

  test('T-SUP-API-31 answers unauthenticated without a session and when it no longer resolves', async () => {
    const missing = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`, { cookie: false }),
    )
    const ended = await routes(
      metadataService(),
      sessionService({
        resolveActor: async () =>
          Promise.reject(new BackofficeAuthenticationError('unauthenticated')),
      }),
    ).fetch(request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`))

    expect([missing.status, ended.status]).toEqual([401, 401])
    expect(captured).toEqual([])
  })

  test('T-SUP-API-32 exposes CORS to the exact Backoffice origin and stores nothing', async () => {
    const allowed = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`),
    )
    expect(allowed.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(allowed.headers.get('referrer-policy')).toBe('no-referrer')

    const denied = await routes().fetch(
      request(`/support/people/${SUBJECT_ID}?case_reference=${CASE}`, {
        origin: 'https://attacker.test',
      }),
    )
    expect(denied.headers.get('access-control-allow-origin')).not.toBe('https://attacker.test')
  })

  test('T-SUP-API-33 reads the operational feed with its filters and its own cursor', async () => {
    const response = await routes().fetch(
      request('/support/operations?source=notification&state=retrying&limit=10'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: [operation],
      page: { has_more: true, next_cursor: 'next-page' },
    })
    expect(diagnosisCalls[0]).toMatchObject({
      source: 'notification',
      state: 'retrying',
      limit: 10,
    })
  })

  test('T-SUP-API-34 refuses a filter outside its closed vocabulary', async () => {
    const answers = await Promise.all(
      ['source=payments', 'state=exploded', 'aggregate_id=not-a-uuid'].map((filter) =>
        routes().fetch(request(`/support/operations?${filter}`)),
      ),
    )

    expect(answers.map((response) => response.status)).toEqual([400, 400, 400])
    expect(diagnosisCalls).toEqual([])
  })

  test('T-SUP-API-35 refuses a page size outside the contract bounds', async () => {
    const answers = await Promise.all(
      ['limit=0', 'limit=101', 'limit=abc'].map((bound) =>
        routes().fetch(request(`/support/operations?${bound}`)),
      ),
    )

    expect(answers.map((response) => response.status)).toEqual([400, 400, 400])
    expect(diagnosisCalls).toEqual([])
  })

  test('T-SUP-API-36 round-trips its own cursor and rejects a forged one', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        occurredAt: '2026-09-10T18:00:00.000Z',
        id: '019a6000-0000-7000-8000-000000000301',
      }),
    ).toString('base64url')

    const accepted = await routes().fetch(request(`/support/operations?cursor=${cursor}`))
    expect(accepted.status).toBe(200)
    expect(diagnosisCalls[0]).toMatchObject({
      cursor: {
        occurredAt: '2026-09-10T18:00:00.000Z',
        id: '019a6000-0000-7000-8000-000000000301',
      },
    })

    const forged = await Promise.all(
      ['cursor=not-base64', `cursor=${Buffer.from('{"id":"nope"}').toString('base64url')}`].map(
        (bad) => routes().fetch(request(`/support/operations?${bad}`)),
      ),
    )
    expect(forged.map((response) => response.status)).toEqual([400, 400])
  })

  test('T-SUP-API-37 reads delivery health without asking for a case reference', async () => {
    const response = await routes().fetch(request('/support/delivery-circuits'))

    expect(response.status).toBe(200)
    const body = (await response.json()) as { items: { failure_count: number }[] }
    expect(body.items[0]?.failure_count).toBe(12)
    // A feed with no subject has nothing to trace back to a case, so requiring
    // one would be ceremony rather than a control.
    expect(diagnosisCalls).toHaveLength(1)
  })

  test('T-SUP-API-38 keeps the diagnosis routes behind the session and the origin', async () => {
    const unauthenticated = await routes().fetch(request('/support/operations', { cookie: false }))
    expect(unauthenticated.status).toBe(401)

    const allowed = await routes().fetch(request('/support/delivery-circuits'))
    expect(allowed.headers.get('cache-control')).toBe('no-store')

    // CORS on a GET is enforced by the browser, not by the server: the request
    // still runs, and what protects the answer is that a foreign origin gets no
    // grant to read it, plus the session cookie it cannot forge.
    const denied = await routes().fetch(
      request('/support/operations', { origin: 'https://attacker.test' }),
    )
    expect(denied.headers.get('access-control-allow-origin')).not.toBe('https://attacker.test')

    // Only the two authenticated reads reached the service; the cookieless one
    // never did.
    expect(diagnosisCalls).toHaveLength(2)
  })

  test('T-SUP-API-39 reads the attention panel as the operator, withheld notices included', async () => {
    const response = await routes().fetch(request('/support/attention'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(panel)
    expect(attentionCalls).toHaveLength(1)
    expect(attentionCalls[0]?.reader).toEqual({
      actorPersonId: ACTOR_PERSON_ID,
      actorSessionId: ACTOR_SESSION_ID,
    })
  })

  test('T-SUP-API-40 answers forbidden when no duty resolves a notice, and 503 when the read breaks', async () => {
    const forbidden = await routes(
      metadataService(),
      sessionService(),
      diagnosisService(),
      attentionService({
        read: () => Promise.reject(Object.assign(new Error('refused'), { code: '42501' })),
      }),
    ).fetch(request('/support/attention'))
    const broken = await routes(
      metadataService(),
      sessionService(),
      diagnosisService(),
      attentionService({ read: () => Promise.reject(new Error('database unavailable')) }),
    ).fetch(request('/support/attention'))

    expect([forbidden.status, broken.status]).toEqual([403, 503])
    expect(forbidden.headers.get('content-type')).toContain('application/problem+json')
  })

  test('T-SUP-API-41 never reads the panel without a session that still resolves', async () => {
    const missing = await routes().fetch(request('/support/attention', { cookie: false }))
    const ended = await routes(
      metadataService(),
      sessionService({
        resolveActor: async () =>
          Promise.reject(new BackofficeAuthenticationError('unauthenticated')),
      }),
    ).fetch(request('/support/attention'))

    expect([missing.status, ended.status]).toEqual([401, 401])
    expect(attentionCalls).toEqual([])
  })

  test('T-SUP-API-42 reads how the business is going, empty figures and all', async () => {
    const response = await routes().fetch(request('/support/business'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual(business)
    expect(businessCalls).toHaveLength(1)
    expect(businessCalls[0]?.reader).toEqual({
      actorPersonId: ACTOR_PERSON_ID,
      actorSessionId: ACTOR_SESSION_ID,
    })
  })

  test('T-SUP-API-43 answers forbidden without the metrics duty, and 503 when the read breaks', async () => {
    const forbidden = await routes(
      metadataService(),
      sessionService(),
      diagnosisService(),
      attentionService(),
      businessService({
        read: () => Promise.reject(Object.assign(new Error('refused'), { code: '42501' })),
      }),
    ).fetch(request('/support/business'))
    const broken = await routes(
      metadataService(),
      sessionService(),
      diagnosisService(),
      attentionService(),
      businessService({ read: () => Promise.reject(new Error('database unavailable')) }),
    ).fetch(request('/support/business'))

    expect([forbidden.status, broken.status]).toEqual([403, 503])
    expect(forbidden.headers.get('content-type')).toContain('application/problem+json')
  })

  test('T-SUP-API-44 never reads the figures without a session that still resolves', async () => {
    const missing = await routes().fetch(request('/support/business', { cookie: false }))
    const ended = await routes(
      metadataService(),
      sessionService({
        resolveActor: async () =>
          Promise.reject(new BackofficeAuthenticationError('unauthenticated')),
      }),
    ).fetch(request('/support/business'))

    expect([missing.status, ended.status]).toEqual([401, 401])
    expect(businessCalls).toEqual([])
  })
})
