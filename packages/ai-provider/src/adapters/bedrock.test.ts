import { afterEach, describe, expect, test } from 'bun:test'
import { z } from 'zod'

import type { ModelRequest } from '../port.js'
import { createBedrockModel } from './bedrock.js'
import { failureOf, outcome } from './testing.js'

const DISH = z.object({ dish: z.string(), grams: z.number().optional() })
const PHOTO = new Uint8Array([255, 216, 255, 224, 7, 7, 7, 7, 7, 7, 7, 7])
const MODEL = 'us.anthropic.claude-haiku-5-5'

const request = (
  timeoutMs = 5_000,
): ModelRequest<{ dish: string; grams?: number | undefined }> => ({
  model: MODEL,
  parts: [
    { kind: 'image', media: 'image/jpeg', bytes: PHOTO },
    { kind: 'text', text: '¿Qué plato es?' },
  ],
  schema: DISH,
  timeoutMs,
})

interface Received {
  readonly path: string
  readonly body: Record<string, unknown>
}

let server: ReturnType<typeof Bun.serve> | undefined
afterEach(async () => {
  await server?.stop(true)
  server = undefined
})

/** A Converse endpoint that gives `reply` to every call, keeping what it received. */
function fakeBedrock(reply: () => Response): { endpoint: string; received: Received[] } {
  const received: Received[] = []
  server = Bun.serve({
    port: 0,
    async fetch(incoming) {
      received.push({
        path: decodeURIComponent(new URL(incoming.url).pathname),
        body: (await incoming.json()) as Record<string, unknown>,
      })
      return reply()
    },
  })
  return { endpoint: `http://127.0.0.1:${String(server.port)}`, received }
}

const answered =
  (text: string, stopReason = 'end_turn') =>
  () =>
    Response.json({
      output: { message: { role: 'assistant', content: [{ text }] } },
      stopReason,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      metrics: { latencyMs: 12 },
    })

const failed = (status: number, type: string) => () =>
  Response.json(
    { message: 'no' },
    { status, headers: { 'x-amzn-errortype': `${type}:http://internal.amazon.com/coral/` } },
  )

const modelAt = (endpoint: string) =>
  createBedrockModel({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' },
  })

describe('the Bedrock model (ADR-045)', () => {
  test('T-AIP-UNIT-05 sends the photo, the text and the schema to the exact model, and reads the answer', async () => {
    const bedrock = fakeBedrock(answered('{"dish":"ajiaco","grams":350}'))
    const answer = await modelAt(bedrock.endpoint).answer(request())
    expect(answer).toEqual({
      value: { dish: 'ajiaco', grams: 350 },
      usage: { inputTokens: 10, outputTokens: 5 },
    })

    const [call] = bedrock.received
    expect(call?.path).toBe(`/model/${MODEL}/converse`)
    expect(call?.body.messages).toEqual([
      {
        role: 'user',
        content: [
          { image: { format: 'jpeg', source: { bytes: Buffer.from(PHOTO).toString('base64') } } },
          { text: '¿Qué plato es?' },
        ],
      },
    ])
    const format = (call?.body.outputConfig as { textFormat: Record<string, unknown> }).textFormat
    expect(format.type).toBe('json_schema')
    const { jsonSchema } = format.structure as { jsonSchema: { schema: string } }
    expect(JSON.parse(jsonSchema.schema)).toMatchObject({
      type: 'object',
      properties: { dish: { type: 'string' }, grams: { type: 'number' } },
      required: ['dish'],
      additionalProperties: false,
    })
  })

  test('T-AIP-UNIT-06 an answer out of shape, not JSON, or cut short is not an answer', async () => {
    for (const reply of [
      answered('{"plate":"ajiaco"}'),
      answered('ajiaco'),
      answered('{"dish":"aji', 'max_tokens'),
      answered('{"dish":"ajiaco"}', 'content_filtered'),
    ]) {
      const bedrock = fakeBedrock(reply)
      expect(await outcome(modelAt(bedrock.endpoint).answer(request()))).toBe('invalid-answer')
      await server?.stop(true)
    }
  })

  test('T-AIP-UNIT-07 a refused request is rejected, a busy or silent Bedrock is unavailable', async () => {
    const cases = [
      [failed(403, 'AccessDeniedException'), 'rejected'],
      [failed(400, 'ValidationException'), 'rejected'],
      [failed(404, 'ResourceNotFoundException'), 'rejected'],
      [failed(429, 'ThrottlingException'), 'unavailable'],
      [failed(503, 'ServiceUnavailableException'), 'unavailable'],
    ] as const
    for (const [reply, failure] of cases) {
      const bedrock = fakeBedrock(reply)
      expect(await outcome(modelAt(bedrock.endpoint).answer(request()))).toBe(failure)
      await server?.stop(true)
    }

    // A valid answer that comes too late: only the deadline can fail it.
    server = Bun.serve({
      port: 0,
      fetch: () => Bun.sleep(3_000).then(answered('{"dish":"ajiaco"}')),
    })
    const started = performance.now()
    const late = modelAt(`http://127.0.0.1:${String(server.port)}`).answer(request(200))
    expect(await outcome(late)).toBe('unavailable')
    expect(performance.now() - started).toBeLessThan(2_000)
  })

  test('T-AIP-UNIT-10 an error says what failed, and never carries the photo, the text or the answer', async () => {
    let bedrock = fakeBedrock(failed(400, 'ValidationException'))
    let failure = await failureOf(modelAt(bedrock.endpoint).answer(request()))
    expect(failure.error.message).toBe('model failed: rejected: ValidationException 400 no')
    expect(failure.error.cause).toBeUndefined()
    expect(failure.printed).not.toContain('¿Qué plato es?')
    expect(failure.printed).not.toContain(Buffer.from(PHOTO).toString('base64'))
    await server?.stop(true)

    bedrock = fakeBedrock(answered('{"dish":"bandeja paisa","grams":"muchos"}'))
    failure = await failureOf(modelAt(bedrock.endpoint).answer(request()))
    expect(failure.error.message).toBe(
      'model failed: invalid-answer: the answer did not match the schema (grams invalid_type)',
    )
    expect(failure.printed).not.toContain('bandeja paisa')
    expect(failure.printed).not.toContain('muchos')
  })
})
