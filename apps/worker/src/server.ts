/**
 * The worker as a long-lived container (ECS), instead of a function woken by
 * Vercel Cron.
 *
 * It reuses the cron route as it is: the scheduler sends the same request the
 * cron sent, with the same secret, to the same Hono app, in process. Nothing
 * about the jobs changes; only what triggers them does.
 *
 * The only port it opens answers `/health`, through `node:http`, because that
 * is all the orchestrator needs and it keeps the worker free of a server
 * dependency.
 */

import { createServer, type Server } from 'node:http'
import type { Hono } from 'hono'

import { createScheduler, type Scheduler } from './scheduler.js'

const DEFAULT_INTERVAL_MS = 15_000
const MIN_INTERVAL_MS = 1_000

export function intervalFromEnvironment(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_INTERVAL_MS
  const value = Number(raw)
  if (!Number.isInteger(value) || value < MIN_INTERVAL_MS) {
    throw new Error(`WORKER_INTERVAL_MS must be an integer of at least ${MIN_INTERVAL_MS}`)
  }
  return value
}

export function createBatchRun(app: Hono, cronSecret: string): () => Promise<void> {
  return async () => {
    const response = await app.request('/cron/outbox', {
      headers: { authorization: `Bearer ${cronSecret}` },
    })
    if (response.status !== 200) throw new Error(`worker batch answered ${response.status}`)
  }
}

export function healthResponse(
  method: string | undefined,
  path: string | undefined,
  running: boolean,
): { status: number; body: string } {
  if (method !== 'GET' || path !== '/health') return { status: 404, body: 'not found' }
  return running ? { status: 200, body: 'ok' } : { status: 503, body: 'stopped' }
}

export interface WorkerService {
  scheduler: Scheduler
  server: Server
  stop(): Promise<void>
}

export function startWorkerService(options: {
  app: Hono
  cronSecret: string
  intervalMs: number
  port: number
}): WorkerService {
  const scheduler = createScheduler({
    intervalMs: options.intervalMs,
    run: createBatchRun(options.app, options.cronSecret),
    onError: (error) => {
      console.error(`[worker] batch failed: ${error instanceof Error ? error.message : 'unknown'}`)
    },
  })

  const server = createServer((request, response) => {
    const answer = healthResponse(request.method, request.url, scheduler.running())
    response.writeHead(answer.status, { 'content-type': 'text/plain', 'cache-control': 'no-store' })
    response.end(answer.body)
  })

  server.listen(options.port)
  scheduler.start()

  return {
    scheduler,
    server,
    async stop() {
      await scheduler.stop()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
