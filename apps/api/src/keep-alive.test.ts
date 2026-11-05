import { createServer } from 'node:http'
import { expect, test } from 'bun:test'

import { LOAD_BALANCER_IDLE_TIMEOUT_MS, keepAliveOptions } from './keep-alive.js'

test('a server built with the options keeps idle connections longer than the load balancer', () => {
  const server = createServer(keepAliveOptions)

  expect(server.keepAliveTimeout).toBeGreaterThan(LOAD_BALANCER_IDLE_TIMEOUT_MS)
})

test('it waits for headers longer than it keeps a connection idle', () => {
  const server = createServer(keepAliveOptions)

  expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout)
})
