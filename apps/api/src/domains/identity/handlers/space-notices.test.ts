import { beforeEach, describe, expect, test } from 'bun:test'
import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import { mountSurfaces } from '../../../surfaces.js'
import type { SpaceNoticesService } from '../application/space-notices.js'
import { spaceNoticeRoutes } from './space-notices.js'

const NOTICE_ID = '019b8000-0000-7000-8000-000000000001'
const OLDER_ID = '019b8000-0000-7000-8000-000000000002'

const notice: AllfitV1Schemas['SpaceNotice'] = {
  id: NOTICE_ID,
  kind: 'client_invitation',
  category: 'relationship',
  subject: { type: 'invitation', id: '019b8000-0000-7000-8000-000000000401' },
  organization_id: '019b8000-0000-7000-8000-000000000101',
  occurred_at: '2026-11-25T10:00:00.123456+00:00',
  read_at: null,
  awaiting: true,
  expires_at: '2026-12-02T10:00:00+00:00',
  names: { organization: 'Gym Sur', professional: 'Camilo Coach', program: null },
}
const older: AllfitV1Schemas['SpaceNotice'] = {
  ...notice,
  id: OLDER_ID,
  kind: 'plan_paused',
  subject: { type: 'plan_subscription', id: '019b8000-0000-7000-8000-000000000a01' },
  occurred_at: '2026-11-24T09:00:00+00:00',
  awaiting: false,
  expires_at: null,
  names: { organization: 'Gym Sur', professional: null, program: null },
}

const token = { subject: 'user_subject', sessionId: 'session_1' } as unknown as VerifiedToken

let captured: { operation: string; token: unknown; input: unknown }[] = []

function service(overrides: Partial<SpaceNoticesService> = {}): SpaceNoticesService {
  return {
    list: (verified, input) => {
      captured.push({ operation: 'list', token: verified, input })
      return Promise.resolve({
        items: [notice, older],
        has_more: true,
        awaiting_count: 1,
        unread_count: 2,
      })
    },
    markRead: (verified, noticeId) => {
      captured.push({ operation: 'markRead', token: verified, input: noticeId })
      return Promise.resolve({ ...notice, read_at: '2026-11-25T11:00:00+00:00' })
    },
    ...overrides,
  }
}

function routes(injected: SpaceNoticesService = service()): Hono {
  return new Hono().route(
    '/space/v1',
    spaceNoticeRoutes(injected, async (value) => {
      if (value !== 'good-token') throw new Error('rejected')
      return token
    }),
  )
}

function request(path: string, init: { method?: string; bearer?: string | null } = {}): Request {
  const headers = new Headers()
  if (init.bearer !== null) headers.set('authorization', `Bearer ${init.bearer ?? 'good-token'}`)
  return new Request(`https://api.example.test/space/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
  })
}

function colonPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
}

beforeEach(() => {
  captured = []
  process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
  process.env.STUDIO_WEB_URL = 'https://studio.example.test'
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Space notices API contract', () => {
  test('T-IDN-NOTICE-API-01 mounts the listing and the read mark with their contract methods', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) => ['OP-IDN-074', 'OP-IDN-075'].includes(operation.allfitOperation))
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = spaceNoticeRoutes(service())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /space/v1${route.path}`)
      .sort()

    expect(contract).toHaveLength(2)
    expect(mounted).toEqual(contract)

    const app = new Hono()
    mountSurfaces(app)
    const surface = app.routes.map((route) => `${route.method} ${route.path}`)
    expect(surface).toContain('GET /space/v1/notices')
    expect(surface).toContain('POST /space/v1/notices/:noticeId/read')
  })

  test('T-IDN-NOTICE-API-02 lists her notices with the counts for the bell and a cursor to go on', async () => {
    const response = await routes().fetch(request('/notices'))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const page = (await response.json()) as AllfitV1Schemas['SpaceNoticePage']
    expect(page.items).toEqual([notice, older])
    expect(page.awaiting_count).toBe(1)
    expect(page.unread_count).toBe(2)
    expect(typeof page.next_cursor).toBe('string')
    expect(captured[0]).toMatchObject({ token, input: { filter: 'all' } })
  })

  test('T-IDN-NOTICE-API-03 the cursor continues after the last notice of the page', async () => {
    const first = (await (await routes().fetch(request('/notices'))).json()) as {
      next_cursor: string
    }
    const next = await routes().fetch(
      request(`/notices?filter=awaiting&cursor=${encodeURIComponent(first.next_cursor)}`),
    )

    expect(next.status).toBe(200)
    expect(captured[1]?.input).toEqual({
      filter: 'awaiting',
      after: { occurredAt: older.occurred_at, noticeId: OLDER_ID },
    })
  })

  test('T-IDN-NOTICE-API-04 the last page has no cursor', async () => {
    const response = await routes(
      service({
        list: async () => ({ items: [older], has_more: false, awaiting_count: 0, unread_count: 1 }),
      }),
    ).fetch(request('/notices'))

    await expect(response.json()).resolves.toMatchObject({ next_cursor: null })
  })

  test('T-IDN-NOTICE-API-05 an unknown filter or an unreadable cursor is 422, an unknown parameter 400', async () => {
    const unreadable = Buffer.from('yesterday\u001fnope', 'utf8').toString('base64url')
    const answers = await Promise.all([
      routes().fetch(request('/notices?filter=urgent')),
      routes().fetch(request('/notices?cursor=***')),
      routes().fetch(request(`/notices?cursor=${unreadable}`)),
      routes().fetch(request('/notices?person_id=someone')),
    ])

    expect(answers.map((response) => response.status)).toEqual([422, 422, 422, 400])
    expect(captured).toEqual([])
  })

  test('T-IDN-NOTICE-API-06 marks a notice read and answers it', async () => {
    const response = await routes().fetch(request(`/notices/${NOTICE_ID}/read`, { method: 'POST' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      id: NOTICE_ID,
      read_at: '2026-11-25T11:00:00+00:00',
      awaiting: true,
    })
    expect(captured[0]).toMatchObject({ operation: 'markRead', input: NOTICE_ID })
  })

  test('T-IDN-NOTICE-IDEM-01 marking read twice answers the same, with no key needed', async () => {
    const first = await routes().fetch(request(`/notices/${NOTICE_ID}/read`, { method: 'POST' }))
    const again = await routes().fetch(request(`/notices/${NOTICE_ID}/read`, { method: 'POST' }))

    expect([first.status, again.status]).toEqual([200, 200])
    expect(await again.json()).toEqual(await first.json())
  })

  test("T-IDN-NOTICE-API-07 somebody else's notice, or none, is 404; a malformed id 400", async () => {
    const missing = await routes(
      service({
        markRead: () => Promise.reject(Object.assign(new Error('missing'), { code: 'P0002' })),
      }),
    ).fetch(request(`/notices/${NOTICE_ID}/read`, { method: 'POST' }))
    const malformed = await routes().fetch(
      request('/notices/not-a-notice/read', { method: 'POST' }),
    )

    expect([missing.status, malformed.status]).toEqual([404, 400])
  })

  test('T-IDN-NOTICE-API-08 never reaches the service without a token it can verify', async () => {
    const answers = await Promise.all([
      routes().fetch(request('/notices', { bearer: null })),
      routes().fetch(request(`/notices/${NOTICE_ID}/read`, { method: 'POST', bearer: 'forged' })),
    ])

    expect(answers.map((response) => response.status)).toEqual([401, 401])
    expect(captured).toEqual([])
  })

  test('T-IDN-NOTICE-API-09 a closed account is 403 and a database down 503', async () => {
    const forbidden = await routes(
      service({ list: () => Promise.reject(Object.assign(new Error('no'), { code: '42501' })) }),
    ).fetch(request('/notices'))
    const broken = await routes(service({ list: () => Promise.reject(new Error('down')) })).fetch(
      request('/notices'),
    )

    expect([forbidden.status, broken.status]).toEqual([403, 503])
  })
})
