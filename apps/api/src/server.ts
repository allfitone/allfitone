/**
 * Entry point in a container: `node dist/server.js` on ECS, and `bun run dev`.
 *
 * Nothing in the app depends on the host, so moving it means changing the
 * pipeline, not the code.
 */
import { serve } from '@hono/node-server'
import { createApp } from './application.js'
import { keepAliveOptions } from './keep-alive.js'
import { shutdownServerTelemetry } from './platform/telemetry/server.js'
import { shutdownGracefully } from './shutdown.js'

const port = Number(process.env.PORT ?? 8080)

const server = serve({ fetch: createApp().fetch, port, serverOptions: keepAliveOptions })
console.log(`API listening on :${port}`)

process.once('SIGTERM', () => {
  void shutdownGracefully({
    server,
    flush: shutdownServerTelemetry,
    exit: (code) => process.exit(code),
  })
})
