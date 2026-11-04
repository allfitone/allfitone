import { beforeEach, describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest, type AllfitV1Schemas } from '@allfitone/contracts'
import { Hono } from 'hono'

import {
  BACKOFFICE_SESSION_COOKIE,
  BackofficeAuthenticationError,
  STUDIO_SESSION_COOKIE,
  StudioSessionError,
  type BackofficeAuthenticationService,
  type StudioSessionService,
} from '../../identity/index.js'
import { mountSurfaces } from '../../../surfaces.js'
import type { GlobalCatalogService } from '../application/index.js'
import type { CatalogReader } from '../domain/index.js'
import { backofficeCatalogReadRoutes, studioCatalogReadRoutes } from './catalog.js'

const STUDIO_ORIGIN = 'https://studio.example.test'
const BACKOFFICE_ORIGIN = 'https://backoffice.example.test'
const PERSON_ID = '019f0000-0000-7000-8000-000000000001'
const SESSION_ID = '019f0000-0000-7000-8000-000000000002'
const ACTIVITY_TYPE_ID = '019f0000-0000-7000-8000-000000000003'
const CONTRACT_ID = '019f0000-0000-7000-8000-000000000101'

const discipline: AllfitV1Schemas['CatalogDiscipline'] = { code: 'strength', name: 'Fuerza' }

const activityType: AllfitV1Schemas['CatalogActivityType'] = {
  id: ACTIVITY_TYPE_ID,
  discipline_code: 'strength',
  code: 'barbell_squat',
  name: 'Sentadilla con barra',
}

const binding: AllfitV1Schemas['ActivityTypeResultContract'] = {
  result_contract_id: CONTRACT_ID,
  contract_code: 'test.catalog_surface',
  version_number: 2,
  activity_family: 'strength',
  contract_schema_version: 1,
  envelope: { schema: 1 },
  minimums: { target_sets: true },
  is_default: true,
  valid_from: '2026-09-09T12:00:00.000Z',
}

const category: AllfitV1Schemas['CatalogInformationCategory'] = {
  scope_code: 'health_context',
  display_name: 'Contexto de salud',
  summary: 'Dolor, limitaciones y recuperación, sin historia clínica.',
  description:
    'Lo que declares sobre dolor, limitaciones y recuperación. No incluye diagnósticos ni documentos médicos.',
  default_purpose: 'Adaptar tu entrenamiento a lo que tu cuerpo admite hoy.',
}

let readers: CatalogReader[] = []

function catalog(overrides: Partial<GlobalCatalogService> = {}): GlobalCatalogService {
  return {
    listDisciplines: async (reader) => {
      readers.push(reader)
      return [discipline]
    },
    listActivityTypes: async (reader) => {
      readers.push(reader)
      return [activityType]
    },
    listActivityTypeResultContracts: async (reader) => {
      readers.push(reader)
      return [binding]
    },
    listInformationCategories: async (reader) => {
      readers.push(reader)
      return [category]
    },
    ...overrides,
  }
}

function studioSessions(overrides: Partial<StudioSessionService> = {}): StudioSessionService {
  return {
    resolveActor: async () => ({ accountId: 'account', personId: PERSON_ID }),
    ...overrides,
  } as StudioSessionService
}

function backofficeSessions(
  overrides: Partial<BackofficeAuthenticationService> = {},
): BackofficeAuthenticationService {
  return {
    resolveActor: async () => ({ personId: PERSON_ID, sessionId: SESSION_ID }),
    ...overrides,
  } as BackofficeAuthenticationService
}

const BACKOFFICE_CATALOG = '/backoffice/v1/catalog'
const STUDIO_CATALOG = '/studio/v1/catalog'
const BACKOFFICE_COOKIE = `${BACKOFFICE_SESSION_COOKIE}=session-secret`
const STUDIO_COOKIE = `${STUDIO_SESSION_COOKIE}=opaque`

function routes(
  service: GlobalCatalogService = catalog(),
  studio: StudioSessionService = studioSessions(),
  backoffice: BackofficeAuthenticationService = backofficeSessions(),
): Hono {
  return new Hono()
    .route(BACKOFFICE_CATALOG, backofficeCatalogReadRoutes(service, backoffice))
    .route(STUDIO_CATALOG, studioCatalogReadRoutes(service, studio))
}

// By default, the origin and the cookie a browser of the path's product sends there.
function request(
  path: string,
  init: { origin?: string | null; cookie?: string | null; ifNoneMatch?: string } = {},
): Request {
  const studio = path.startsWith(STUDIO_CATALOG)
  const headers = new Headers()
  if (init.origin !== null) {
    headers.set('origin', init.origin ?? (studio ? STUDIO_ORIGIN : BACKOFFICE_ORIGIN))
  }
  if (init.cookie !== null) {
    headers.set('cookie', init.cookie ?? (studio ? STUDIO_COOKIE : BACKOFFICE_COOKIE))
  }
  if (init.ifNoneMatch) headers.set('if-none-match', init.ifNoneMatch)
  return new Request(`https://api.example.test${path}`, { headers })
}

function colonPath(path: string): string {
  return path.replace(/\{([A-Za-z0-9_]+)\}/g, ':$1')
}

beforeEach(() => {
  readers = []
  process.env.STUDIO_WEB_URL = STUDIO_ORIGIN
  process.env.BACKOFFICE_WEB_URL = BACKOFFICE_ORIGIN
  process.env.API_PUBLIC_URL = 'https://api.example.test'
})

describe('Global catalogue surface', () => {
  test('T-CAT-API-13 mounts every global catalogue operation with its contract method', () => {
    const contract = allfitV1ContractManifest.operations
      .filter((operation) =>
        ['OP-CAT-007', 'OP-CAT-008', 'OP-CAT-012', 'OP-PRV-022'].includes(
          operation.allfitOperation ?? '',
        ),
      )
      .map((operation) => `${operation.method} ${colonPath(operation.path)}`)
      .sort()
    const mounted = [
      ...backofficeCatalogReadRoutes().routes.map(
        (route) => `${route.method} ${BACKOFFICE_CATALOG}${route.path}`,
      ),
      ...studioCatalogReadRoutes().routes.map(
        (route) => `${route.method} ${STUDIO_CATALOG}${route.path}`,
      ),
    ]
      .filter((route) => !route.startsWith('ALL '))
      .sort()

    expect(contract).toHaveLength(4)
    expect(mounted).toEqual(contract)
  })

  // The web reads moved inside their surfaces: on /catalog/v1 no session cookie
  // arrives, so each of them answered 401 in production. Space's bearer reads stay.
  test('T-CAT-API-14 serves the web reads on their product surface and /catalog/v1 to Space', () => {
    const app = new Hono()
    mountSurfaces(app)
    const mounted = app.routes
      .filter((route) => route.method !== 'ALL')
      .map((route) => `${route.method} ${route.path}`)

    expect(mounted).toContain('GET /backoffice/v1/catalog/disciplines')
    expect(mounted).toContain('GET /backoffice/v1/catalog/activity-types')
    expect(mounted).toContain(
      'GET /backoffice/v1/catalog/activity-types/:activityTypeId/result-contracts',
    )
    expect(mounted).toContain('GET /studio/v1/catalog/information-categories')
    expect(mounted.filter((route) => route.startsWith('GET /catalog/v1/')).sort()).toEqual([
      'GET /catalog/v1/equipment',
      'GET /catalog/v1/movements',
      'GET /catalog/v1/movements/:movementId',
      'GET /catalog/v1/muscles',
    ])
  })

  // Both callers are browsers reading across origins, and a 304 reached them
  // without `Access-Control-Allow-Origin`, so the catalogue is served uncached and
  // a caller still holding an ETag receives the body rather than a 304.
  test('T-CAT-API-15 serves the catalogue uncached and never answers 304', async () => {
    const first = await routes().fetch(request(`${BACKOFFICE_CATALOG}/disciplines`))
    expect(first.status).toBe(200)
    expect(first.headers.get('cache-control')).toBe('no-store')
    expect(first.headers.get('etag')).toBeNull()
    await expect(first.json()).resolves.toEqual({ items: [discipline] })

    const revalidation = await routes().fetch(
      request(`${BACKOFFICE_CATALOG}/disciplines`, { ifNoneMatch: '"a-tab-kept-this"' }),
    )
    expect(revalidation.status).toBe(200)
    await expect(revalidation.json()).resolves.toEqual({ items: [discipline] })

    const studio = await routes().fetch(
      request(`${STUDIO_CATALOG}/information-categories`, { ifNoneMatch: '"a-tab-kept-this"' }),
    )
    expect(studio.status).toBe(200)
    expect(studio.headers.get('cache-control')).toBe('private, no-store')
  })

  test('T-CAT-API-16 serves activity types and their effective result contracts', async () => {
    const types = await routes().fetch(request(`${BACKOFFICE_CATALOG}/activity-types`))
    expect(types.status).toBe(200)
    await expect(types.json()).resolves.toEqual({ items: [activityType] })

    const contracts = await routes().fetch(
      request(`${BACKOFFICE_CATALOG}/activity-types/${ACTIVITY_TYPE_ID}/result-contracts`),
    )
    expect(contracts.status).toBe(200)
    await expect(contracts.json()).resolves.toEqual({ items: [binding] })
  })

  test('T-CAT-API-17 reads as the surface the request came from', async () => {
    await routes().fetch(request(`${STUDIO_CATALOG}/information-categories`))
    await routes().fetch(request(`${BACKOFFICE_CATALOG}/disciplines`))

    expect(readers).toEqual([
      { personId: PERSON_ID, actorKind: 'person' },
      { personId: PERSON_ID, actorKind: 'support' },
    ])
  })

  // Each surface reads its own session and ignores the other's, even when both arrive.
  test('T-CAT-API-18 reads only the cookie of its own surface', async () => {
    const backofficeWithStudio = await routes().fetch(
      request(`${BACKOFFICE_CATALOG}/disciplines`, { cookie: STUDIO_COOKIE }),
    )
    const studioWithBackoffice = await routes().fetch(
      request(`${STUDIO_CATALOG}/information-categories`, { cookie: BACKOFFICE_COOKIE }),
    )
    expect([backofficeWithStudio.status, studioWithBackoffice.status]).toEqual([401, 401])

    const failing = { resolveActor: async () => Promise.reject(new Error('wrong surface')) }
    const both = `${STUDIO_COOKIE}; ${BACKOFFICE_COOKIE}`
    const studio = await routes(catalog(), studioSessions(), backofficeSessions(failing)).fetch(
      request(`${STUDIO_CATALOG}/information-categories`, { cookie: both }),
    )
    const backoffice = await routes(catalog(), studioSessions(failing), backofficeSessions()).fetch(
      request(`${BACKOFFICE_CATALOG}/disciplines`, { cookie: both }),
    )
    expect([studio.status, backoffice.status]).toEqual([200, 200])
    expect(readers.map((reader) => reader.actorKind)).toEqual(['person', 'support'])
  })

  // The paths no browser ever sent a session cookie to are gone, not left answering 401.
  test('T-CAT-API-19 no longer answers the web reads on /catalog/v1', async () => {
    const app = new Hono()
    mountSurfaces(app)
    const both = `${STUDIO_COOKIE}; ${BACKOFFICE_COOKIE}`
    const paths = [
      '/catalog/v1/disciplines',
      '/catalog/v1/activity-types',
      `/catalog/v1/activity-types/${ACTIVITY_TYPE_ID}/result-contracts`,
      '/catalog/v1/information-categories',
    ]

    const answers = await Promise.all(
      paths.map((path) => app.fetch(request(path, { origin: STUDIO_ORIGIN, cookie: both }))),
    )
    expect(answers.map((response) => response.status)).toEqual([404, 404, 404, 404])
  })

  test('T-CAT-API-20 refuses a caller with no session and one whose session ended', async () => {
    const missing = await routes().fetch(
      request(`${STUDIO_CATALOG}/information-categories`, { cookie: null }),
    )
    expect(missing.status).toBe(401)

    const expired = await routes(
      catalog(),
      studioSessions({
        resolveActor: async () => Promise.reject(new StudioSessionError('unauthenticated')),
      }),
    ).fetch(request(`${STUDIO_CATALOG}/information-categories`))
    expect(expired.status).toBe(401)

    const absent = await routes().fetch(
      request(`${BACKOFFICE_CATALOG}/disciplines`, { cookie: null }),
    )
    expect(absent.status).toBe(401)

    const ended = await routes(
      catalog(),
      studioSessions(),
      backofficeSessions({
        resolveActor: async () =>
          Promise.reject(new BackofficeAuthenticationError('unauthenticated')),
      }),
    ).fetch(request(`${BACKOFFICE_CATALOG}/disciplines`))
    expect(ended.status).toBe(401)
    expect(readers).toEqual([])
  })

  test('T-CAT-API-21 refuses an account that never finished registration', async () => {
    const response = await routes(
      catalog(),
      studioSessions({ resolveActor: async () => ({ accountId: 'account' }) }),
    ).fetch(request(`${STUDIO_CATALOG}/information-categories`))

    expect(response.status).toBe(403)
    expect(readers).toEqual([])
  })

  test('T-CAT-API-22 rejects a malformed activity type before reaching the database', async () => {
    const response = await routes().fetch(
      request(`${BACKOFFICE_CATALOG}/activity-types/not-a-uuid/result-contracts`),
    )
    expect(response.status).toBe(400)
    expect(readers).toEqual([])
  })

  test('T-CAT-API-23 translates the database verdicts instead of leaking them', async () => {
    const notFound = Object.assign(new Error('activity type not found'), { code: 'P0002' })
    const denied = Object.assign(new Error('requires an active person'), { code: '42501' })
    const broken = new Error('database unavailable')

    const answers = await Promise.all(
      [notFound, denied, broken].map((error) =>
        routes(catalog({ listActivityTypeResultContracts: () => Promise.reject(error) })).fetch(
          request(`${BACKOFFICE_CATALOG}/activity-types/${ACTIVITY_TYPE_ID}/result-contracts`),
        ),
      ),
    )

    expect(answers.map((response) => response.status)).toEqual([404, 403, 503])
  })

  // Studio's reads answer under the CORS its whole surface shares (surfaces.ts).
  test('T-CAT-API-24 exposes the Backoffice reads to the Backoffice origin alone', async () => {
    const backoffice = await routes().fetch(request(`${BACKOFFICE_CATALOG}/disciplines`))
    expect(backoffice.headers.get('access-control-allow-origin')).toBe(BACKOFFICE_ORIGIN)
    expect(backoffice.headers.get('access-control-allow-credentials')).toBe('true')
    expect(backoffice.headers.get('vary')).toContain('Origin')

    for (const origin of [STUDIO_ORIGIN, 'https://attacker.test']) {
      const response = await routes().fetch(
        request(`${BACKOFFICE_CATALOG}/disciplines`, { origin }),
      )
      expect(response.headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  /*
   * `OP-PRV-022`, `HU-STUDIO-034`. The wording a member reads to know what they
   * may ask a client for.
   */
  test('T-CAT-API-25 serves the information categories to a member of a gym', async () => {
    const response = await routes().fetch(request(`${STUDIO_CATALOG}/information-categories`))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({ items: [category] })
    expect(readers).toEqual([{ personId: PERSON_ID, actorKind: 'person' }])
  })

  /*
   * The half of criterion 1 that is easy to drop. A category that says only what
   * it covers lets somebody tick "body progress" believing it reaches injuries,
   * so the description carrying its own limit travels with the summary rather
   * than instead of it.
   */
  test('T-CAT-API-26 answers both the one-line summary and the limit of each category', async () => {
    const response = await routes().fetch(request(`${STUDIO_CATALOG}/information-categories`))
    const body = (await response.json()) as { items: (typeof category)[] }

    expect(body.items[0]?.summary).not.toBeNull()
    expect(body.items[0]?.description).toContain('No incluye')
  })

  /*
   * The row-level policy on the wording admits `person` alone, so an empty list
   * would read as "there are no categories" — a wrong answer wearing the shape of
   * a right one. Backoffice is not offered the read, and a refusal is never empty.
   */
  test('T-CAT-API-27 refuses a support actor instead of answering an empty list', async () => {
    const offered = await routes().fetch(request(`${BACKOFFICE_CATALOG}/information-categories`))
    expect(offered.status).toBe(404)

    const forbidden = Object.assign(new Error('active person required'), { code: '42501' })
    const response = await routes(
      catalog({
        listInformationCategories: async () => {
          throw forbidden
        },
      }),
    ).fetch(request(`${STUDIO_CATALOG}/information-categories`))

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.not.toEqual({ items: [] })
    expect(readers).toEqual([])
  })
})
