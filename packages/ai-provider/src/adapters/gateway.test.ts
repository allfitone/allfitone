import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { ModelError, type ModelRequest } from '../port.js'
import { createGatewayModel } from './gateway.js'

const DISH = z.object({ dish: z.string() })

const request = (timeoutMs = 5_000): ModelRequest<{ dish: string }> => ({
  model: 'google/gemini-3.5-flash-lite',
  parts: [
    { kind: 'image', media: 'image/jpeg', bytes: new Uint8Array([255, 216, 255]) },
    { kind: 'text', text: '¿Qué plato es?' },
  ],
  schema: DISH,
  timeoutMs,
})

let server: ReturnType<typeof Bun.serve> | undefined
afterEach(async () => {
  await server?.stop(true)
  server = undefined
})

/** A Gateway that answers every call with `status`, keeping the bodies it received. */
function fakeGateway(status: number, type: string): { baseURL: string; bodies: string[] } {
  const bodies: string[] = []
  server = Bun.serve({
    port: 0,
    async fetch(incoming) {
      bodies.push(await incoming.text())
      return Response.json({ error: { message: 'no', type } }, { status })
    },
  })
  return { baseURL: `http://127.0.0.1:${String(server.port)}`, bodies }
}

describe('the Gateway model (ADR-041, ADR-045)', () => {
  test('T-AIP-UNIT-02 refuses to start without a provider to route to', () => {
    expect(() => createGatewayModel({ apiKey: 'k', providers: [] })).toThrow(
      'at least one inference provider',
    )
  })

  test('T-AIP-UNIT-03 sends the exact model with zero data retention, only through the providers allowed', async () => {
    const gateway = fakeGateway(401, 'authentication_error')
    const model = createGatewayModel({
      apiKey: 'k',
      providers: ['vertex'],
      baseURL: gateway.baseURL,
    })
    await expect(model.answer(request())).rejects.toThrow(ModelError)
    const sent = gateway.bodies.join('\n')
    expect(sent).toContain('"zeroDataRetention":true')
    expect(sent).toContain('"only":["vertex"]')
    expect(sent).toContain('¿Qué plato es?')
  })

  test('T-AIP-UNIT-04 a refused request is rejected, a failing or silent Gateway is unavailable', async () => {
    let gateway = fakeGateway(401, 'authentication_error')
    let model = createGatewayModel({ apiKey: 'k', providers: ['vertex'], baseURL: gateway.baseURL })
    await expect(model.answer(request())).rejects.toThrow(new ModelError('rejected'))
    expect(gateway.bodies).toHaveLength(1)
    await server?.stop(true)

    gateway = fakeGateway(500, 'internal_server_error')
    model = createGatewayModel({ apiKey: 'k', providers: ['vertex'], baseURL: gateway.baseURL })
    await expect(model.answer(request())).rejects.toThrow(new ModelError('unavailable'))
    expect(gateway.bodies).toHaveLength(2)
    await server?.stop(true)

    server = Bun.serve({ port: 0, fetch: () => Bun.sleep(3_000).then(() => new Response('late')) })
    model = createGatewayModel({
      apiKey: 'k',
      providers: ['vertex'],
      baseURL: `http://127.0.0.1:${String(server.port)}`,
    })
    const started = performance.now()
    await expect(model.answer(request(200))).rejects.toThrow(new ModelError('unavailable'))
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})
