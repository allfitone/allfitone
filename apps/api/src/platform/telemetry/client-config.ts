import { TELEMETRY_NOTICE_VERSION } from '@allfitone/telemetry'
import { telemetryEnvironmentFromRuntime } from '@allfitone/telemetry/node'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

// The Backoffice is staff-only, so it measures nothing in the browser and has no gate.
type ClientSurface = 'space' | 'studio'

const ENABLED_ENVIRONMENT_VARIABLE: Record<ClientSurface, string> = {
  space: 'ANALYTICS_SPACE_CLIENT_ENABLED',
  studio: 'ANALYTICS_STUDIO_CLIENT_ENABLED',
}

export function clientTelemetryConfigRoutes(surface: ClientSurface, allowedOrigin?: string): Hono {
  const routes = new Hono()

  if (allowedOrigin) {
    routes.use(
      '/telemetry-config',
      cors({
        origin: allowedOrigin,
        allowMethods: ['GET', 'OPTIONS'],
        exposeHeaders: ['ETag', 'Server-Timing'],
        maxAge: 600,
      }),
    )
  }

  routes.get('/telemetry-config', (c) => {
    // Anonymous and the same for everyone, so browsers may keep it for five minutes.
    c.header('Cache-Control', 'public, max-age=300')
    return c.json({
      enabled:
        telemetryEnvironmentFromRuntime() === 'production' &&
        process.env[ENABLED_ENVIRONMENT_VARIABLE[surface]] === 'true',
      notice_version: TELEMETRY_NOTICE_VERSION,
    })
  })

  return routes
}
