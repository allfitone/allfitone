import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { ModelRequest } from '../port.js'
import { createGatewayModel } from './gateway.js'
import { failureOf, outcome } from './testing.js'

const DISH = z.object({ dish: z.string() })
const PHOTO = new Uint8Array([255, 216, 255, 224, 7, 7, 7, 7, 7, 7, 7, 7])

const request = (timeoutMs = 5_000): ModelRequest<{ dish: string }> => ({
  model: 'google/gemini-3.5-flash-lite',
  parts: [
    { kind: 'image', media: 'image/jpeg', bytes: PHOTO },
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

/** A Gateway whose model answers `text`, stopping for `finish`. */
function answeringGateway(text: string, finish = 'stop'): { baseURL: string; bodies: string[] } {
  const bodies: string[] = []
  server = Bun.serve({
    port: 0,
    async fetch(incoming) {
      bodies.push(await incoming.text())
      return Response.json({
        content: [{ type: 'text', text }],
        finishReason: { unified: finish, raw: finish },
        usage: { inputTokens: { total: 120 }, outputTokens: { total: 30 } },
        warnings: [],
      })
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
    const gateway = answeringGateway('{"dish":"ajiaco"}')
    const model = createGatewayModel({
      apiKey: 'k',
      providers: ['vertex'],
      baseURL: gateway.baseURL,
    })
    expect(await model.answer(request())).toEqual({
      value: { dish: 'ajiaco' },
      usage: { inputTokens: 120, outputTokens: 30 },
    })
    const sent = gateway.bodies.join('\n')
    expect(sent).toContain('"zeroDataRetention":true')
    expect(sent).toContain('"only":["vertex"]')
    expect(sent).toContain('¿Qué plato es?')
  })

  test('T-AIP-UNIT-04 a refused request is rejected, a failing or silent Gateway is unavailable', async () => {
    let gateway = fakeGateway(401, 'authentication_error')
    let model = createGatewayModel({ apiKey: 'k', providers: ['vertex'], baseURL: gateway.baseURL })
    expect(await outcome(model.answer(request()))).toBe('rejected')
    expect(gateway.bodies).toHaveLength(1)
    await server?.stop(true)

    gateway = fakeGateway(500, 'internal_server_error')
    model = createGatewayModel({ apiKey: 'k', providers: ['vertex'], baseURL: gateway.baseURL })
    expect(await outcome(model.answer(request()))).toBe('unavailable')
    expect(gateway.bodies).toHaveLength(2)
    await server?.stop(true)

    server = Bun.serve({ port: 0, fetch: () => Bun.sleep(3_000).then(() => new Response('late')) })
    model = createGatewayModel({
      apiKey: 'k',
      providers: ['vertex'],
      baseURL: `http://127.0.0.1:${String(server.port)}`,
    })
    const started = performance.now()
    expect(await outcome(model.answer(request(200)))).toBe('unavailable')
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  test('T-AIP-UNIT-08 an answer that is not JSON, out of shape or cut short is not an answer', async () => {
    const answers = [
      ['ajiaco', 'stop'],
      ['{"plate":"ajiaco"}', 'stop'],
      ['{"dish":"aji', 'length'],
    ] as const
    for (const [text, finish] of answers) {
      const gateway = answeringGateway(text, finish)
      const model = createGatewayModel({
        apiKey: 'k',
        providers: ['vertex'],
        baseURL: gateway.baseURL,
      })
      expect(await outcome(model.answer(request()))).toBe('invalid-answer')
      expect(gateway.bodies).toHaveLength(1)
      await server?.stop(true)
    }
  })

  test('T-AIP-UNIT-09 an error says what failed, and never carries the photo, the text or the answer', async () => {
    const photo = Buffer.from(PHOTO)
    const settings = { apiKey: 'k', providers: ['vertex'] }

    let gateway = fakeGateway(500, 'internal_server_error')
    let failed = await failureOf(
      createGatewayModel({ ...settings, baseURL: gateway.baseURL }).answer(request()),
    )
    expect(failed.error.message).toBe(
      'model failed: unavailable: GatewayInternalServerError 500 no',
    )
    expect(failed.error.cause).toBeUndefined()
    expect(failed.printed).not.toContain('¿Qué plato es?')
    expect(failed.printed).not.toContain(photo.toString('base64'))
    await server?.stop(true)

    gateway = answeringGateway('{"plate":"bandeja paisa"}')
    failed = await failureOf(
      createGatewayModel({ ...settings, baseURL: gateway.baseURL }).answer(request()),
    )
    expect(failed.error.message).toBe(
      'model failed: invalid-answer: the answer did not match the schema, finish: stop',
    )
    expect(failed.printed).not.toContain('bandeja paisa')
    expect(failed.printed).not.toContain('¿Qué plato es?')
  })
})
