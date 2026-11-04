import { expect, test } from 'bun:test'
import { Hono } from 'hono'

import { createBatchRun, healthResponse, intervalFromEnvironment } from './server.js'

test('the scheduled run calls the batch with the cron secret', async () => {
  const seen: (string | undefined)[] = []
  const app = new Hono()
  app.get('/cron/outbox', (c) => {
    seen.push(c.req.header('authorization'))
    return c.json({})
  })

  await createBatchRun(app, 'cron-test-secret')()

  expect(seen).toEqual(['Bearer cron-test-secret'])
})

test('a failed batch is reported as a failure, not swallowed', async () => {
  const app = new Hono()
  app.get('/cron/outbox', (c) => c.json({ error: { code: 'upstream-unavailable' } }, 503))

  await expect(createBatchRun(app, 'cron-test-secret')()).rejects.toThrow('503')
})

test('health is up only while the scheduler runs', () => {
  expect(healthResponse('GET', '/health', true)).toEqual({ status: 200, body: 'ok' })
  expect(healthResponse('GET', '/health', false)).toEqual({ status: 503, body: 'stopped' })
  expect(healthResponse('GET', '/cron/outbox', true)).toEqual({ status: 404, body: 'not found' })
  expect(healthResponse('POST', '/health', true)).toEqual({ status: 404, body: 'not found' })
})

test('runs every fifteen seconds unless told otherwise', () => {
  expect(intervalFromEnvironment(undefined)).toBe(15_000)
  expect(intervalFromEnvironment('5000')).toBe(5_000)
})

test('refuses an interval that would hammer or starve the queue', () => {
  expect(() => intervalFromEnvironment('0')).toThrow()
  expect(() => intervalFromEnvironment('abc')).toThrow()
  expect(() => intervalFromEnvironment('999')).toThrow()
})
