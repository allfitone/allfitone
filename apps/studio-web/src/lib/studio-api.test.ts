import { afterEach, describe, expect, test } from 'bun:test'

import { StudioApiError, invitationDecisionFlowStep, newCommand, studioApi } from './studio-api.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('uses UUIDv4 for HTTP idempotency and UUIDv7 for durable command identity', () => {
  const command = newCommand()
  expect(command.idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
  expect(command.commandId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})

test('loads the combined Studio entry context in one credentialed request', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} })
    return Response.json({
      authenticated: true,
      registration_status: 'complete',
      identity: { name: 'Ada Lovelace', email: 'ada@example.test' },
      memberships: [],
    })
  }) as typeof fetch

  await studioApi.entryContext()

  expect(calls).toHaveLength(1)
  expect(new URL(calls[0]?.url ?? '').pathname).toBe('/studio/v1/entry-context')
  expect(calls[0]?.init.credentials).toBe('include')
})

describe('professional profile API', () => {
  test('forwards caller cancellation through every cache-managed account read', async () => {
    const requests: RequestInit[] = []
    globalThis.fetch = (async (input, init) => {
      requests.push(init ?? {})
      const pathname = new URL(String(input)).pathname
      if (pathname === '/studio/v1/me') {
        return Response.json({ profile: null, memberships: [] })
      }
      return Response.json({ items: [] })
    }) as typeof fetch
    const controller = new AbortController()

    await Promise.all([
      studioApi.me(controller.signal),
      studioApi.organizationTypes(controller.signal),
      studioApi.professionalSpecialties(controller.signal),
      studioApi.professionalCredentialTypes(controller.signal),
    ])

    expect(requests).toHaveLength(4)
    expect(requests.every((request) => request.signal === controller.signal)).toBe(true)
  })

  test('uses the personal profile routes and HTTP methods from the contract', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return Response.json({})
    }) as typeof fetch
    const command = newCommand()
    const profile = {
      headline: 'Entrenador de fuerza',
      bio: 'Acompañamiento profesional.',
      practice_started_year: 2020,
      specialty_codes: ['strength_conditioning'],
    }
    const credential = {
      credential_type_code: 'professional_certification',
      issuer: 'Allfit Academy',
      name: 'Fuerza aplicada',
    }

    await studioApi.me()
    await studioApi.updateProfessionalProfile(profile, command)
    await studioApi.declareProfessionalCredential(credential, command)
    await studioApi.retireProfessionalCredential('credential-1', command)

    expect(calls.map(({ url, init }) => [new URL(url).pathname, init.method ?? 'GET'])).toEqual([
      ['/studio/v1/me', 'GET'],
      ['/studio/v1/me/professional-profile', 'PUT'],
      ['/studio/v1/me/professional-credentials', 'POST'],
      ['/studio/v1/me/professional-credentials/credential-1/retirement', 'POST'],
    ])
    expect(calls.every(({ init }) => init.credentials === 'include')).toBe(true)
    expect(calls[1]?.init.body).toBe(JSON.stringify(profile))
    expect(calls[2]?.init.body).toBe(JSON.stringify(credential))
    expect(calls[3]?.init.body).toBeUndefined()
  })

  test('forwards caller cancellation through every cache-managed write', async () => {
    const requests: RequestInit[] = []
    globalThis.fetch = (async (_input, init) => {
      requests.push(init ?? {})
      return Response.json({})
    }) as typeof fetch
    const controller = new AbortController()
    const command = newCommand()
    const profile = {
      headline: 'Entrenador de fuerza',
      bio: 'Acompañamiento profesional.',
      practice_started_year: 2020,
      specialty_codes: ['strength_conditioning'],
    }
    const credential = {
      credential_type_code: 'professional_certification',
      issuer: 'Allfit Academy',
      name: 'Fuerza aplicada',
    }

    await Promise.all([
      studioApi.updateProfessionalProfile(profile, command, controller.signal),
      studioApi.declareProfessionalCredential(credential, command, controller.signal),
      studioApi.reviseProfessionalCredential(
        'credential-1',
        credential,
        command,
        controller.signal,
      ),
      studioApi.retireProfessionalCredential('credential-1', command, controller.signal),
      studioApi.createTeamInvitation(
        'organization-1',
        {
          channel: 'email',
          contact: 'person@example.test',
          intents: [{ kind: 'membership', proposed_role_code: 'staff' }],
        },
        command,
        controller.signal,
      ),
      studioApi.revokeTeamInvitation('organization-1', 'invitation-1', command, controller.signal),
    ])

    expect(requests).toHaveLength(6)
    expect(requests.every((request) => request.signal === controller.signal)).toBe(true)
  })

  test('sends exact credential revision route, body, cookies and command headers', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return Response.json(credentialResponse())
    }) as typeof fetch

    const command = newCommand()
    await studioApi.reviseProfessionalCredential(
      'credential-1',
      {
        credential_type_code: 'professional_certification',
        issuer: 'Allfit Academy',
        name: 'Fuerza aplicada',
      },
      command,
    )

    expect(capturedUrl).toEndWith('/studio/v1/me/professional-credentials/credential-1/revisions')
    expect(capturedInit?.method).toBe('POST')
    expect(capturedInit?.credentials).toBe('include')
    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('Idempotency-Key')).toBe(command.idempotencyKey)
    expect(headers.get('Command-Id')).toBe(command.commandId)
    expect(capturedInit?.body).toBe(
      JSON.stringify({
        credential_type_code: 'professional_certification',
        issuer: 'Allfit Academy',
        name: 'Fuerza aplicada',
      }),
    )
  })

  // Studio used to cache each catalogue's ETag and send it back, and the 304 that
  // came back reached the browser without CORS headers and was blocked. The API
  // no longer revalidates these; this keeps the client from asking it to.
  test('reads catalogs without a revalidation tag, even on a repeat read', async () => {
    const requests: RequestInit[] = []
    globalThis.fetch = (async (_input, init) => {
      requests.push(init ?? {})
      return Response.json(
        {
          items: [{ code: 'personal_training', name: 'Entrenamiento personal', description: null }],
        },
        { headers: { ETag: '"a-server-that-still-sends-one"' } },
      )
    }) as typeof fetch

    const first = await studioApi.professionalSpecialties()
    const second = await studioApi.professionalSpecialties()

    expect(second).toEqual(first)
    expect(requests).toHaveLength(2)
    for (const init of requests) {
      expect(new Headers(init.headers).has('If-None-Match')).toBe(false)
    }
  })

  test('preserves stable error codes and details', async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { error: { code: 'registration-incomplete', detail: 'Complete registration' } },
        { status: 403 },
      )) as unknown as typeof fetch

    const error = await studioApi.me().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(StudioApiError)
    if (error instanceof StudioApiError) {
      expect(error.status).toBe(403)
      expect(error.code).toBe('registration-incomplete')
      expect(error.detail).toBe('Complete registration')
    }
  })
})

/*
 * The content block's commands answer RFC 9457 problems rather than the
 * `{ error }` envelope. The two things a screen needs from them travel as
 * extensions: what is missing from a draft, and the draft somebody else saved.
 */
describe('a problem answer', () => {
  function answer(body: unknown, status: number) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/problem+json' },
      })) as unknown as typeof fetch
  }

  async function refusal(): Promise<StudioApiError> {
    const caught = await studioApi
      .createOrganizationSessionTemplate(
        '01991600-1000-7000-8000-000000000002',
        { discipline_code: 'strength', title: 'Fuerza' },
        newCommand(),
      )
      .catch((error: unknown) => error)
    if (!(caught instanceof StudioApiError)) throw new Error('expected a StudioApiError')
    return caught
  }

  test('is named by the last segment of its type', async () => {
    answer(
      { type: 'https://errors.allfit.invalid/not-found', title: 'Not found', status: 404 },
      404,
    )
    const error = await refusal()
    expect(error.status).toBe(404)
    expect(error.code).toBe('not-found')
  })

  test('keeps every issue it lists, in order', async () => {
    answer(
      {
        type: 'https://errors.allfit.invalid/validation-failed',
        title: 'The request failed validation',
        status: 422,
        errors: [
          { code: 'title', path: '/title', message: 'A non-empty title is required.' },
          { code: 'steps', path: '/steps', message: 'At least one planned step is required.' },
        ],
      },
      422,
    )
    const error = await refusal()
    expect(error.issues.map((issue) => issue.code)).toEqual(['title', 'steps'])
    expect(error.issues[0]?.path).toBe('/title')
  })

  test('hands over the current state a stale draft conflict carries', async () => {
    const current = { id: 'draft', etag: '"sha256:current"' }
    answer(
      {
        type: 'https://errors.allfit.invalid/stale-draft',
        title: 'The local draft is stale',
        status: 409,
        current_state: current,
      },
      409,
    )
    const error = await refusal()
    expect(error.code).toBe('stale-draft')
    expect(error.currentState).toEqual(current)
  })

  test('without extensions has no issues and no state', async () => {
    answer({ type: 'https://errors.allfit.invalid/conflict', title: 'Conflict', status: 409 }, 409)
    const error = await refusal()
    expect(error.issues).toEqual([])
    expect(error.currentState).toBeUndefined()
  })

  test('ignores issues that are not issues', async () => {
    answer(
      {
        type: 'https://errors.allfit.invalid/validation-failed',
        status: 422,
        errors: ['title', { code: 7 }, { code: 'steps', path: '/steps', message: 'x' }],
      },
      422,
    )
    const error = await refusal()
    expect(error.issues.map((issue) => issue.code)).toEqual(['steps'])
  })
})

describe('creating a session template', () => {
  test('posts the discipline and title with the command headers', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return Response.json({ id: 'template' }, { status: 201 })
    }) as typeof fetch
    const command = newCommand()

    await studioApi.createOrganizationSessionTemplate(
      '01991600-1000-7000-8000-000000000002',
      { discipline_code: 'strength', title: 'Fuerza' },
      command,
    )

    expect(new URL(calls[0]?.url ?? '').pathname).toBe(
      '/studio/v1/organizations/01991600-1000-7000-8000-000000000002/session-templates',
    )
    expect(calls[0]?.init.method).toBe('POST')
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      discipline_code: 'strength',
      title: 'Fuerza',
    })
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get('idempotency-key')).toBe(command.idempotencyKey)
    expect(headers.get('command-id')).toBe(command.commandId)
  })

  test('reads the disciplines under the Studio surface', async () => {
    const calls: string[] = []
    globalThis.fetch = (async (input) => {
      calls.push(String(input))
      return Response.json({ items: [] })
    }) as typeof fetch

    await studioApi.catalogDisciplines()

    expect(new URL(calls[0] ?? '').pathname).toBe('/studio/v1/catalog/disciplines')
  })
})

describe('organization team API', () => {
  test('maps invitation decisions to their explicit telemetry flow steps', () => {
    expect(invitationDecisionFlowStep('accepted')).toBe('invitation_accepted')
    expect(invitationDecisionFlowStep('rejected')).toBe('invitation_rejected')
    expect(invitationDecisionFlowStep(undefined)).toBeUndefined()
    expect(invitationDecisionFlowStep('unexpected')).toBeUndefined()
  })

  test('lists memberships with the contract query, cookies, and caller cancellation', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    globalThis.fetch = (async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return Response.json({ data: [], page: { has_more: false, next_cursor: null } })
    }) as typeof fetch
    const controller = new AbortController()

    await studioApi.organizationMemberships(
      '01991600-1000-7000-8000-000000000002',
      { status: 'terminated', limit: 50, cursor: 'next-page' },
      controller.signal,
    )

    const url = new URL(capturedUrl)
    expect(url.pathname).toBe(
      '/studio/v1/organizations/01991600-1000-7000-8000-000000000002/memberships',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: 'terminated',
      limit: '50',
      cursor: 'next-page',
    })
    expect(capturedInit?.credentials).toBe('include')
    expect(capturedInit?.cache).toBe('no-store')
    expect(capturedInit?.signal).toBe(controller.signal)
  })

  test('reads the role catalog per organization and never serves it after 403', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input, init) => {
      const request = { url: String(input), init: init ?? {} }
      requests.push(request)
      if (requests.length <= 2) return Response.json(roleCatalogResponse())
      return Response.json({ error: { code: 'forbidden' } }, { status: 403 })
    }) as typeof fetch

    const first = await studioApi.organizationRoles('organization-one')
    const second = await studioApi.organizationRoles('organization-two')
    const forbidden = await studioApi
      .organizationRoles('organization-three')
      .catch((error) => error)

    expect(second).toEqual(first)
    expect(requests.map(({ url }) => new URL(url).pathname)).toEqual([
      '/studio/v1/organizations/organization-one/roles',
      '/studio/v1/organizations/organization-two/roles',
      '/studio/v1/organizations/organization-three/roles',
    ])
    // No revalidation tag: a 304 here reached Studio without CORS headers.
    for (const { init } of requests) {
      expect(new Headers(init.headers).has('If-None-Match')).toBe(false)
    }
    expect(forbidden).toBeInstanceOf(StudioApiError)
    expect((forbidden as StudioApiError).status).toBe(403)
  })
})

function credentialResponse() {
  return {
    id: 'credential-2',
    credential_type_code: 'professional_certification',
    credential_type_name: 'Certificación profesional',
    issuer: 'Allfit Academy',
    name: 'Fuerza aplicada',
    identifier: null,
    issued_on: null,
    expires_on: null,
    verification_url: null,
    status: 'active',
    supersedes_credential_id: 'credential-1',
    created_at: '2026-08-10T12:00:00.000Z',
    retired_at: null,
    verification: {
      state: 'unverified',
      valid_from: null,
      valid_to: null,
      effective: false,
    },
  }
}

function roleCatalogResponse() {
  return {
    items: [
      {
        code: 'owner',
        name: 'Propietario',
        capabilities: [{ code: 'invite', name: 'Invitar al equipo' }],
        fitness_data_access_policy: 'not_granted_by_role',
      },
      {
        code: 'admin',
        name: 'Administrador',
        capabilities: [{ code: 'invite', name: 'Invitar al equipo' }],
        fitness_data_access_policy: 'not_granted_by_role',
      },
      {
        code: 'coach',
        name: 'Coach',
        capabilities: [{ code: 'observe_training', name: 'Observar entrenamiento' }],
        fitness_data_access_policy: 'requires_relationship_assignment_and_grant',
      },
      {
        code: 'staff',
        name: 'Staff',
        capabilities: [{ code: 'view_directory', name: 'Consultar directorio' }],
        fitness_data_access_policy: 'not_granted_by_role',
      },
    ],
  }
}

/*
 * The revision a site edit is based on used to travel in `If-Match`, and that
 * broke the screen in production: the API is one function mounted at `/`, and
 * Vercel's Edge evaluates conditional requests against that single cache key
 * before the function runs. A write carrying `If-Match` came back `412` from
 * the Edge after the row had already been written, and with no CORS headers, so
 * this client could not read the refusal and reported a failure for a change
 * that was saved.
 *
 * What these assert is therefore not a preference about where a field goes. It
 * is that this request must not be a conditional request at all.
 */
describe('the revision a site edit is based on', () => {
  async function patch(revision: number) {
    const calls: Array<{ url: string; init: RequestInit }> = []
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} })
      return Response.json({ id: 'site', revision_number: revision + 1 })
    }) as typeof fetch

    await studioApi.updateOrganizationSite(
      '01991600-2000-7000-8000-000000000001',
      '01991600-2000-7000-8000-000000000002',
      { status: 'inactive' },
      revision,
      newCommand(),
    )

    return {
      body: JSON.parse(String(calls[0]?.init.body)),
      headers: new Headers(calls[0]?.init.headers),
    }
  }

  test('travels in the body, alongside the change it applies to', async () => {
    const { body } = await patch(4)
    expect(body).toEqual({ status: 'inactive', expected_revision: 4 })
  })

  test('is not sent as a condition on the request', async () => {
    const { headers } = await patch(4)
    expect(headers.get('if-match')).toBeNull()
  })

  /*
   * A first revision is still a revision. Zero is falsy, so any code that
   * forwards it through a truthiness check drops it, and the server answers
   * `428` for an edit the screen was perfectly current about.
   */
  test('a first revision survives the trip', async () => {
    const { body } = await patch(0)
    expect(body.expected_revision).toBe(0)
  })
})
