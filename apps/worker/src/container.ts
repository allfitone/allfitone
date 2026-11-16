/**
 * Container entry point: `node dist/container.js`.
 *
 * Kept apart from `server.ts` so importing the service in tests never opens a
 * port or starts the clock.
 */

import { emailProviderFromEnvironment } from './email.js'
import { app } from './index.js'
import { intervalFromEnvironment, startWorkerService } from './server.js'
import { shutdownWorkerTelemetry } from './telemetry.js'

const cronSecret = process.env.CRON_SECRET
if (!cronSecret) throw new Error('CRON_SECRET is required')
// An unknown provider stops the container now, not at the first email, possibly hours later.
emailProviderFromEnvironment(process.env)

const intervalMs = intervalFromEnvironment(process.env.WORKER_INTERVAL_MS)
const port = Number(process.env.WORKER_PORT ?? 8090)
const service = startWorkerService({ app, cronSecret, intervalMs, port })

console.info(`[worker] health on :${port}, batch every ${intervalMs} ms`)

process.once('SIGTERM', () => {
  void service.stop().then(() => shutdownWorkerTelemetry())
})
