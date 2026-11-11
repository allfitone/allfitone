import { beforeEach, describe, expect, test } from 'bun:test'
import type { VerifiedToken } from '@allfitone/auth-provider'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import { mountSurfaces } from '../../../surfaces.js'
import type { OwnProfileService } from '../application/own-profile.js'
import { spaceOwnProfileRoutes } from './space-own-profile.js'

const COMMAND_ID = '019f4000-0000-7000-8000-000000000501'
const IDEMPOTENCY_KEY = 'a1000000-0000-4000-8000-000000000001'
const OPERATIONS = [
  'OP-IDN-012',
  'OP-IDN-013',
  'OP-IDN-021',
  'OP-IDN-022',
  'OP-IDN-063',
  'OP-IDN-064',
  'OP-IDN-065',
]

const identity: AllfitV1Schemas['SpaceIdentity'] = {
  given_name: 'Camila',
  family_name: 'Rojas',
  username: 'camilarojas',
  active_since: '2026-07-03T10:05:00.000Z',
  email: { address: 'camila@example.test', verified: true, pending: null },
  phone: { number: '+573105550142', verified: false },
  accounts: [{ provider: 'workos', linked_at: '2026-07-03T10:00:00.000Z' }],
}

const profile: AllfitV1Schemas['SpaceFitnessProfile'] = {
  biological_sex: 'female',
  attributes: [
    {
      attribute_code: 'training_experience',
      values: ['some_practice'],
      provenance: 'person_declared',
      selected_because: 'declared_by_you',
      valid_from: '2026-07-03T10:11:00.000Z',
      alternatives: [
        {
          values: ['experienced'],
          provenance: 'professional_observation',
          valid_from: '2026-09-24T08:00:00.000Z',
        },
      ],
    },
  ],
}

const token = { subject: 'user_subject', sessionId: 'session_1' } as unknown as VerifiedToken

let captured: { operation: string; token: unknown; input: unknown }[] = []

function ownProfileService(overrides: Partial<OwnProfileService> = {}): OwnProfileService {
  return {
    readIdentity: (verifiedToken) => {
      captured.push({ operation: 'readIdentity', token: verifiedToken, input: undefined })
      return Promise.resolve(identity)
    },
    readProfile: (verifiedToken) => {
      captured.push({ operation: 'readProfile', token: verifiedToken, input: undefined })
      return Promise.resolve(profile)
    },
    correctName: (verifiedToken, input) => {
      captured.push({ operation: 'correctName', token: verifiedToken, input })
      return Promise.resolve({
        resource: { given_name: 'Camila', family_name: 'Rojas Díaz', username: 'camirojas' },
        replayed: false,
      })
    },
    correctBiologicalSex: (verifiedToken, input) => {
      captured.push({ operation: 'correctBiologicalSex', token: verifiedToken, input })
      return Promise.resolve({ resource: input.sex, replayed: false })
    },
    correctPhone: (verifiedToken, input) => {
      captured.push({ operation: 'correctPhone', token: verifiedToken, input })
      return Promise.resolve({
        resource: { number: input.phone, verified: false },
        replayed: false,
      })
    },
    requestEmailChange: (verifiedToken, input) => {
      captured.push({ operation: 'requestEmailChange', token: verifiedToken, input })
      return Promise.resolve({
        resource: {
          address: input.email.trim().toLowerCase(),
          status: 'awaiting_code' as const,
          expires_at: '2026-11-10T10:30:00.000Z',
        },
        replayed: false,
      })
    },
    verifyEmailChange: (verifiedToken, input) => {
      captured.push({ operation: 'verifyEmailChange', token: verifiedToken, input })
      return Promise.resolve({ resource: { outcome: 'applying' as const }, replayed: false })
    },
    declareEquipment: (verifiedToken, input) => {
      captured.push({ operation: 'declareEquipment', token: verifiedToken, input })
      return Promise.resolve({
        resource: { equipment: [...input.equipment].sort() },
        replayed: false,
      })
    },
    ...overrides,
  }
}

function routes(
  service: OwnProfileService = ownProfileService(),
  verify: (value: string) => Promise<VerifiedToken> = async (value) => {
    if (value !== 'good-token') throw new Error('rejected')
    return token
  },
): Hono {
  return new Hono().route('/space/v1', spaceOwnProfileRoutes(service, verify))
}

function request(
  path: string,
  init: {
    method?: string
    bearer?: string | null
    headers?: Record<string, string>
    body?: string
  } = {},
): Request {
  const headers = new Headers(init.headers)
  if (init.bearer !== null) headers.set('authorization', `Bearer ${init.bearer ?? 'good-token'}`)
  return new Request(`https://api.example.test/space/v1${path}`, {
    method: init.method ?? 'GET',
    headers,
    ...(init.body === undefined ? {} : { body: init.body }),
  })
}

function command(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  method = 'POST',
): Request {
  return request(path, {
    method,
    headers: {
      'idempotency-key': IDEMPOTENCY_KEY,
      'command-id': COMMAND_ID,
      'content-type': 'application/json',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
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

describe('Space own profile API contract', () => {
  test('T-IDN-OWNPROFILE-API-01 mounts the two reads and five commands of the contract', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) => OPERATIONS.includes(operation.allfitOperation))
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = spaceOwnProfileRoutes(ownProfileService())
      .routes.filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} /space/v1${route.path}`)
      .sort()

    expect(contract).toHaveLength(7)
    expect(mounted).toEqual(contract)
  })

  test('T-IDN-OWNPROFILE-API-02 mounts below the real Space surface prefix', () => {
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)

    expect(mounted).toContain('GET /space/v1/me')
    expect(mounted).toContain('POST /space/v1/me/name')
    expect(mounted).toContain('PATCH /space/v1/me/contact')
    expect(mounted).toContain('POST /space/v1/me/contact/verification')
    expect(mounted).toContain('GET /space/v1/profile')
    expect(mounted).toContain('POST /space/v1/profile/biological-sex')
    expect(mounted).toContain('POST /space/v1/profile/equipment')
  })

  test('T-IDN-OWNPROFILE-API-03 reads my identity and my profile, never cached', async () => {
    const me = await routes().fetch(request('/me'))
    const mine = await routes().fetch(request('/profile'))

    expect([me.status, mine.status]).toEqual([200, 200])
    expect(me.headers.get('cache-control')).toBe('no-store')
    expect(mine.headers.get('cache-control')).toBe('no-store')
    await expect(me.json()).resolves.toEqual(identity)
    await expect(mine.json()).resolves.toEqual(profile)
    expect(captured.map(({ token: seen }) => seen)).toEqual([token, token])
  })

  test('T-IDN-OWNPROFILE-API-04 a read takes no query: nobody reads someone else here', async () => {
    const answers = await Promise.all([
      routes().fetch(request('/me?person_id=someone')),
      routes().fetch(request('/profile?person_id=someone')),
    ])

    expect(answers.map((response) => response.status)).toEqual([400, 400])
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-05 corrects the name under the command that names it', async () => {
    const response = await routes().fetch(
      command('/me/name', {
        given_name: 'Camila',
        family_name: 'Rojas Díaz',
        username: 'CamiRojas',
      }),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      given_name: 'Camila',
      family_name: 'Rojas Díaz',
      username: 'camirojas',
    })
    expect(captured[0]?.input).toMatchObject({
      idempotencyKey: IDEMPOTENCY_KEY,
      commandId: COMMAND_ID,
      name: { given_name: 'Camila', family_name: 'Rojas Díaz', username: 'CamiRojas' },
    })
  })

  test('T-IDN-OWNPROFILE-API-06 refuses a name the database would refuse anyway', async () => {
    const valid = { given_name: 'Camila', family_name: 'Rojas', username: 'camila' }
    const bodies: unknown[] = [
      { ...valid, given_name: '   ' },
      { ...valid, family_name: 'a'.repeat(81) },
      { ...valid, username: 'ca' },
      { ...valid, username: '1camila' },
      { ...valid, username: 'cami rojas' },
      { ...valid, email: 'camila@example.test' },
      { given_name: 'Camila', family_name: 'Rojas' },
      '{not json',
    ]
    const answers = await Promise.all(
      bodies.map((body) => routes().fetch(command('/me/name', body))),
    )

    expect(answers.map((response) => response.status)).toEqual(bodies.map(() => 422))
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-07 corrects the biological sex, and declining is an answer', async () => {
    const declared = await routes().fetch(
      command('/profile/biological-sex', { biological_sex: 'male' }),
    )
    const declined = await routes().fetch(
      command('/profile/biological-sex', { biological_sex: null }),
    )
    const refused = await Promise.all(
      [{ biological_sex: 'unknown' }, {}, { biological_sex: 'male', gender: 'man' }].map((body) =>
        routes().fetch(command('/profile/biological-sex', body)),
      ),
    )

    expect([declared.status, declined.status]).toEqual([200, 200])
    await expect(declined.json()).resolves.toEqual({ biological_sex: null })
    expect(refused.map((response) => response.status)).toEqual([422, 422, 422])
    expect(captured.map(({ input }) => (input as { sex: unknown }).sex)).toEqual([
      { biological_sex: 'male' },
      { biological_sex: null },
    ])
  })

  test('T-IDN-OWNPROFILE-API-08 declares the equipment as a whole set', async () => {
    const response = await routes().fetch(
      command('/profile/equipment', { equipment: ['dumbbell', 'bodyweight'] }),
    )
    const refused = await Promise.all(
      [
        { equipment: [] },
        { equipment: ['bench', 'bench'] },
        { equipment: ['treadmill'] },
        { equipment: 'bench' },
        { equipment: ['bench', null] },
        {},
      ].map((body) => routes().fetch(command('/profile/equipment', body))),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ equipment: ['bodyweight', 'dumbbell'] })
    expect(refused.map((answer) => answer.status)).toEqual([422, 422, 422, 422, 422, 422])
    expect(captured).toHaveLength(1)
  })

  test('T-IDN-OWNPROFILE-API-09 says when a command replays', async () => {
    const response = await routes(
      ownProfileService({
        declareEquipment: async () => ({ resource: { equipment: ['bench'] }, replayed: true }),
      }),
    ).fetch(command('/profile/equipment', { equipment: ['bench'] }))

    expect(response.status).toBe(200)
    expect(response.headers.get('idempotent-replay')).toBe('true')
  })

  test('T-IDN-OWNPROFILE-API-10 requires a JSON body and the command identifiers', async () => {
    const body = { equipment: ['bench'] }
    const answers = await Promise.all([
      routes().fetch(command('/profile/equipment', body, { 'content-type': 'text/plain' })),
      routes().fetch(command('/profile/equipment', body, { 'idempotency-key': 'nope' })),
      routes().fetch(
        command('/profile/equipment', body, {
          'command-id': 'a0000000-0000-4000-8000-000000000501',
        }),
      ),
    ])

    expect(answers.map((response) => response.status)).toEqual([415, 400, 400])
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-11 maps every declared database verdict to its problem response', async () => {
    const verdicts: [string, number][] = [
      ['42501', 403],
      ['22023', 422],
      ['23505', 409],
      ['40001', 409],
    ]
    const answers = await Promise.all(
      verdicts.map(([sqlState]) =>
        routes(
          ownProfileService({
            correctName: () =>
              Promise.reject(Object.assign(new Error('refused'), { code: sqlState })),
          }),
        ).fetch(
          command('/me/name', { given_name: 'Camila', family_name: 'Rojas', username: 'camila' }),
        ),
      ),
    )
    const broken = await routes(
      ownProfileService({ readProfile: () => Promise.reject(new Error('database unavailable')) }),
    ).fetch(request('/profile'))

    expect(answers.map((response) => response.status)).toEqual(verdicts.map(([, status]) => status))
    expect(answers[0]?.headers.get('content-type')).toContain('application/problem+json')
    expect(answers[3]?.headers.get('retry-after')).toBe('1')
    expect(broken.status).toBe(503)
  })

  test('T-IDN-OWNPROFILE-API-12 never reaches the service without a token it can verify', async () => {
    const answers = await Promise.all([
      routes().fetch(request('/me', { bearer: null })),
      routes().fetch(request('/profile', { bearer: 'forged' })),
      routes().fetch(
        request('/profile/equipment', {
          method: 'POST',
          bearer: 'forged',
          headers: {
            'idempotency-key': IDEMPOTENCY_KEY,
            'command-id': COMMAND_ID,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ equipment: ['bench'] }),
        }),
      ),
    ])

    expect(answers.map((response) => response.status)).toEqual([401, 401, 401])
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-13 saves the phone as typed in E.164, and null removes it', async () => {
    const saved = await routes().fetch(
      command('/me/contact', { phone: '+57 300 111-2233' }, {}, 'PATCH'),
    )
    const removed = await routes().fetch(command('/me/contact', { phone: null }, {}, 'PATCH'))

    expect([saved.status, removed.status]).toEqual([200, 200])
    await expect(saved.json()).resolves.toEqual({ number: '+573001112233', verified: false })
    await expect(removed.json()).resolves.toEqual({ number: null, verified: false })
    expect(captured.map(({ input }) => input)).toMatchObject([
      { idempotencyKey: IDEMPOTENCY_KEY, commandId: COMMAND_ID, phone: '+573001112233' },
      { phone: null },
    ])
  })

  test('T-IDN-OWNPROFILE-API-14 refuses a phone the database would refuse anyway', async () => {
    const bodies: unknown[] = [
      { phone: '3001112233' },
      { phone: '+0123' },
      { phone: 573001112233 },
      { phone: '+57'.padEnd(40, '1') },
      { phone: '+573001112233', email: 'camila@example.test' },
      {},
    ]
    const answers = await Promise.all(
      bodies.map((body) => routes().fetch(command('/me/contact', body, {}, 'PATCH'))),
    )

    expect(answers.map((response) => response.status)).toEqual(bodies.map(() => 422))
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-15 asks to change the email: 202, and nothing in force moves', async () => {
    const response = await routes().fetch(
      command('/me/contact', { email: ' Camila.Nueva@Example.test ' }, {}, 'PATCH'),
    )

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      address: 'camila.nueva@example.test',
      status: 'awaiting_code',
      expires_at: '2026-11-10T10:30:00.000Z',
    })
    expect(captured).toMatchObject([
      {
        operation: 'requestEmailChange',
        input: { idempotencyKey: IDEMPOTENCY_KEY, email: ' Camila.Nueva@Example.test ' },
      },
    ])
  })

  test('T-IDN-OWNPROFILE-API-16 takes exactly one of phone or email', async () => {
    const bodies: unknown[] = [
      { phone: '+573001112233', email: 'camila@example.test' },
      { email: null },
      { email: 42 },
      { email: 'a'.repeat(250) + '@example.test' },
      { email: 'sin-arroba' },
    ]
    const answers = await Promise.all(
      bodies.map((body) => routes().fetch(command('/me/contact', body, {}, 'PATCH'))),
    )

    expect(answers.map((response) => response.status)).toEqual(bodies.map(() => 422))
    expect(captured).toEqual([])
  })

  test('T-IDN-OWNPROFILE-API-17 confirms the code from this session, and keeps it', async () => {
    const response = await routes().fetch(command('/me/contact/verification', { code: '482913' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ outcome: 'applying' })
    expect(captured).toMatchObject([
      {
        operation: 'verifyEmailChange',
        input: { idempotencyKey: IDEMPOTENCY_KEY, code: '482913', sessionId: 'session_1' },
      },
    ])
  })

  test('T-IDN-OWNPROFILE-API-18 a wrong or late code is 422, the fifth one 409', async () => {
    const answering = (outcome: 'wrong_code' | 'expired' | 'too_many_attempts') =>
      routes(
        ownProfileService({
          verifyEmailChange: () => Promise.resolve({ resource: { outcome }, replayed: false }),
        }),
      ).fetch(command('/me/contact/verification', { code: '000000' }))
    const malformed = await Promise.all(
      [{ code: '12345' }, { code: 482913 }, { code: '482913', extra: true }].map((body) =>
        routes().fetch(command('/me/contact/verification', body)),
      ),
    )

    expect((await answering('wrong_code')).status).toBe(422)
    expect((await answering('expired')).status).toBe(422)
    expect((await answering('too_many_attempts')).status).toBe(409)
    expect(malformed.map((response) => response.status)).toEqual([422, 422, 422])
    expect(captured).toEqual([])
  })
})
