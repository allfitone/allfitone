import { afterEach, describe, expect, test } from 'bun:test'

import { createMemoryModel, type ModelFailure } from '@allfitone/ai-provider'
import { createBedrockModel } from '@allfitone/ai-provider/bedrock'

import { RecognitionError } from './port.js'
import { RECOGNITION_PROMPT } from './prompt.js'
import { createFoodRecognizer } from './recognizer.js'

const JPEG = new Uint8Array([255, 216, 255, 224])
const MODEL = 'google/gemini-3.5-flash-lite'

const ANSWER = {
  dish: 'ajiaco',
  items: [
    {
      name: 'papa',
      units: 2,
      grams: 120,
      confidence: 0.9,
      at: { x: 250, y: 500 },
      icon: 'vegetable',
      estimate: {
        energy: 90,
        protein: 2,
        carbohydrates: 20,
        fat: 0,
        detail: [
          { code: 'fiber', amount: 2 },
          { code: 'potassium', amount: 400 },
        ],
      },
    },
  ],
}

let server: ReturnType<typeof Bun.serve> | undefined
afterEach(async () => {
  await server?.stop(true)
  server = undefined
})

describe('the recogniser over the model port (ADR-041, ADR-045)', () => {
  test('T-REC-UNIT-12 sends the photo then the prompt to the exact model, and answers in fractions of the photo', async () => {
    const model = createMemoryModel()
    model.willAnswer(ANSWER)
    const recognizer = createFoodRecognizer(model, { model: MODEL })

    expect(await recognizer.recognize(JPEG)).toEqual({
      dish: 'ajiaco',
      items: [
        {
          name: 'papa',
          units: 2,
          grams: 120,
          confidence: 0.9,
          at: { x: 0.25, y: 0.5 },
          icon: 'vegetable',
          estimate: {
            energy: 90,
            protein: 2,
            carbohydrates: 20,
            fat: 0,
            fiber: 2,
            potassium: 400,
          },
        },
      ],
      model: MODEL,
    })
    const [request] = model.seen
    expect(request?.model).toBe(MODEL)
    expect(request?.timeoutMs).toBe(15_000)
    expect(request?.parts).toEqual([
      { kind: 'image', media: 'image/jpeg', bytes: JPEG },
      { kind: 'text', text: RECOGNITION_PROMPT },
    ])
  })

  test('T-REC-UNIT-13 a model failure is a recognition failure, and an empty plate is nothing recognised', async () => {
    const model = createMemoryModel()
    const recognizer = createFoodRecognizer(model, { model: MODEL, timeoutMs: 60_000 })
    const cases: [ModelFailure, 'invalid-answer' | 'unavailable'][] = [
      ['invalid-answer', 'invalid-answer'],
      ['unavailable', 'unavailable'],
      ['rejected', 'unavailable'],
    ]
    for (const [failure, expected] of cases) {
      model.failNext(failure)
      await expect(recognizer.recognize(JPEG)).rejects.toThrow(new RecognitionError(expected))
    }
    expect(model.seen.map((request) => request.timeoutMs)).toEqual([60_000, 60_000, 60_000])

    model.willAnswer({ dish: null, items: [] })
    await expect(recognizer.recognize(JPEG)).rejects.toThrow(
      new RecognitionError('nothing-recognised'),
    )
  })

  test('T-REC-UNIT-14 the answer is asked in a shape Bedrock takes too', async () => {
    let asked = 0
    server = Bun.serve({
      port: 0,
      fetch() {
        asked += 1
        return Response.json({
          output: { message: { role: 'assistant', content: [{ text: JSON.stringify(ANSWER) }] } },
          stopReason: 'end_turn',
          usage: { inputTokens: 900, outputTokens: 200, totalTokens: 1100 },
        })
      },
    })
    const bedrock = createBedrockModel({
      region: 'us-east-1',
      endpoint: `http://127.0.0.1:${String(server.port)}`,
      credentials: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'secret' },
    })
    const recognizer = createFoodRecognizer(bedrock, { model: 'us.anthropic.claude-haiku-5-5' })

    const seen = await recognizer.recognize(JPEG)
    expect(seen.items[0]?.estimate).toMatchObject({ energy: 90, fiber: 2, potassium: 400 })
    expect(asked).toBe(1)
  })
})
