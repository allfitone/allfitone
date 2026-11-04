import { describe, expect, test } from 'bun:test'
import { allfitV1ContractManifest } from '@allfitone/contracts'

import { createApp } from './application.js'
import {
  BACKOFFICE_ATTEMPT_COOKIE_PATH,
  BACKOFFICE_SESSION_COOKIE_PATH,
  STUDIO_SESSION_COOKIE_PATH,
} from './domains/identity/index.js'

type Route = { method: string; path: string }

// Where each cookie scheme's cookie is set to travel. A browser sends a cookie only
// to its own path and below, so an operation outside it can never authenticate.
const COOKIE_SCHEME_PATHS: Readonly<Record<string, string>> = {
  backofficeAttemptAuth: BACKOFFICE_ATTEMPT_COOKIE_PATH,
  backofficeCookieAuth: BACKOFFICE_SESSION_COOKIE_PATH,
  cookieAuth: STUDIO_SESSION_COOKIE_PATH,
}
const NON_COOKIE_SCHEMES = new Set(['bearerAuth'])

type SecuredOperation = Route & { security: readonly string[] }

function unreachableCookieOperations(
  operations: readonly SecuredOperation[],
  schemePaths: Readonly<Record<string, string>>,
) {
  const problems: string[] = []
  for (const operation of operations) {
    for (const scheme of operation.security) {
      const cookiePath = schemePaths[scheme]
      if (cookiePath === undefined) {
        if (!NON_COOKIE_SCHEMES.has(scheme)) problems.push(`${routeKey(operation)} ${scheme}?`)
        continue
      }
      const reached = operation.path === cookiePath || operation.path.startsWith(`${cookiePath}/`)
      if (!reached) problems.push(`${routeKey(operation)} ${scheme}`)
    }
  }
  return problems
}
type Handled = Route & { handler: { length: number } }

const HTTP_METHODS = new Set(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'])

function routeKey(route: Route) {
  const canonicalPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
  return `${route.method.toUpperCase()} ${canonicalPath}`
}

// A terminal handler takes the context alone; route-level middleware takes a next as
// well. Only the first kind answers, so only the first kind may appear twice.
function collidingRoutes(routes: readonly Handled[]) {
  const answered = new Map<string, number>()
  for (const { method, path, handler } of routes) {
    if (!HTTP_METHODS.has(method.toUpperCase()) || handler.length !== 1) continue
    const key = routeKey({ method, path })
    answered.set(key, (answered.get(key) ?? 0) + 1)
  }
  return [...answered].filter(([, count]) => count > 1).map(([key]) => key)
}

function contractDrift(implementedRoutes: readonly Route[], excludedRoutes: readonly Route[]) {
  const stableRoutes = new Set(allfitV1ContractManifest.operations.map(routeKey))
  const exclusions = new Set(excludedRoutes.map(routeKey))
  const implemented = new Set(
    implementedRoutes.filter(({ method }) => HTTP_METHODS.has(method.toUpperCase())).map(routeKey),
  )

  return {
    undocumented: [...implemented].filter(
      (route) => !stableRoutes.has(route) && !exclusions.has(route),
    ),
    staleExclusions: [...exclusions].filter((route) => !implemented.has(route)),
  }
}

describe('OpenAPI route gate', () => {
  test('covers every implemented Hono route and keeps every exclusion live', () => {
    process.env.API_PUBLIC_URL = 'https://api.example.test'
    process.env.STUDIO_WEB_URL = 'https://studio.example.test'
    process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'
    const routes = createApp().routes.map(({ method, path }) => ({ method, path }))

    expect(contractDrift(routes, allfitV1ContractManifest.exclusions)).toEqual({
      undocumented: [],
      staleExclusions: [],
    })
  })

  // HU-BO-017 is deferred by decision: no platform closure distinct from the one the
  // owner governs, to be reconsidered with legal policy. Its V1 obligation is to prove
  // the absence of the route, so this is that proof. T-ORG-CLOSE-01 proves the rest.
  //
  // `NEW-ORG-PLATFORM-CLOSE` needs no assertion of its own: the generated operation
  // codes are a literal union, so naming it here does not compile. That is a stronger
  // guarantee than a comparison, and it is why one is absent.
  test('offers Backoffice no way to end a gym relationship', () => {
    expect(
      allfitV1ContractManifest.operations.filter(
        (operation) =>
          operation.path.startsWith('/backoffice/v1/') &&
          (/relationship/i.test(operation.path) ||
            (operation.path.startsWith('/backoffice/v1/organizations') &&
              /closure|terminat/i.test(operation.path))),
      ),
    ).toEqual([])
  })

  // The word test alone let `/organizations/{id}/closure` through under any other name.
  // What Backoffice may do to a gym is this closed list; a new command fails here until
  // somebody decides it is not the deferred closure.
  test('lets Backoffice act on a gym only through its closed list of commands', () => {
    expect(
      allfitV1ContractManifest.operations
        .filter(
          (operation) =>
            operation.method.toUpperCase() !== 'GET' &&
            operation.path.startsWith('/backoffice/v1/organizations'),
        )
        .map((operation) => `${operation.method.toUpperCase()} ${operation.path}`)
        .sort(),
    ).toEqual(
      [
        'POST /backoffice/v1/organizations',
        'POST /backoffice/v1/organizations/{organizationId}/cancellation',
        'POST /backoffice/v1/organizations/{organizationId}/client-invitations/{invitationId}/resends',
        'POST /backoffice/v1/organizations/{organizationId}/guest-quota',
        'POST /backoffice/v1/organizations/{organizationId}/handover/resends',
        'POST /backoffice/v1/organizations/{organizationId}/reactivation',
        'POST /backoffice/v1/organizations/{organizationId}/suspension',
        'POST /backoffice/v1/organizations/{organizationId}/team-invitations/{invitationId}/resends',
      ].sort(),
    )
  })

  // T-CAT-API-28. The catalogue reads once lived on /catalog/v1, where neither web
  // session cookie travels, and every one of them answered 401 in production.
  test('serves every cookie-authenticated operation where its cookie travels', () => {
    expect(
      unreachableCookieOperations(allfitV1ContractManifest.operations, COOKIE_SCHEME_PATHS),
    ).toEqual([])
  })

  test('rejects a cookie operation outside its path and a scheme it does not know', () => {
    const operations = [
      { method: 'GET', path: '/backoffice/v1', security: ['backofficeCookieAuth'] },
      { method: 'GET', path: '/backoffice/v1/reads', security: ['backofficeCookieAuth'] },
      { method: 'GET', path: '/backoffice/v1x/reads', security: ['backofficeCookieAuth'] },
      { method: 'GET', path: '/catalog/v1/reads', security: ['bearerAuth', 'cookieAuth'] },
      { method: 'GET', path: '/studio/v1/reads', security: ['newCookieAuth'] },
    ]

    expect(
      unreachableCookieOperations(operations, {
        backofficeCookieAuth: '/backoffice/v1',
        cookieAuth: '/studio/v1',
      }),
    ).toEqual([
      'GET /backoffice/v1x/reads backofficeCookieAuth',
      'GET /catalog/v1/reads cookieAuth',
      'GET /studio/v1/reads newCookieAuth?',
    ])
  })

  // Two routers mounted on the same prefix can both claim a path. Hono answers with
  // whichever registered first, so the other becomes unreachable without failing anything.
  test('leaves no path answered by two handlers', () => {
    process.env.API_PUBLIC_URL = 'https://api.example.test'
    process.env.STUDIO_WEB_URL = 'https://studio.example.test'
    process.env.BACKOFFICE_WEB_URL = 'https://backoffice.example.test'

    expect(collidingRoutes(createApp().routes)).toEqual([])
  })

  test('rejects a path two handlers answer and ignores route-level middleware', () => {
    const answer = (c: unknown) => c
    const middleware = (c: unknown, next: unknown) => [c, next]

    expect(
      collidingRoutes([
        { method: 'POST', path: '/twice', handler: answer },
        { method: 'POST', path: '/twice', handler: answer },
        { method: 'POST', path: '/guarded', handler: middleware },
        { method: 'POST', path: '/guarded', handler: answer },
      ]),
    ).toEqual(['POST /twice'])
  })

  test('rejects an implemented route absent from both OpenAPI and exclusions', () => {
    const routes = [{ method: 'GET', path: '/not-contracted' }]

    expect(contractDrift(routes, [])).toEqual({
      undocumented: ['GET /not-contracted'],
      staleExclusions: [],
    })
  })

  test('rejects an exclusion after its implementation disappears', () => {
    const exclusions = [{ method: 'GET', path: '/removed-route' }]

    expect(contractDrift([], exclusions)).toEqual({
      undocumented: [],
      staleExclusions: ['GET /removed-route'],
    })
  })
})
