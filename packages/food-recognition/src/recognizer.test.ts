import { describe, expect, test } from 'bun:test'

import { createMemoryModel, type ModelFailure } from '@allfitone/ai-provider'

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
      estimate: { energy: 90, protein: 2, carbohydrates: 20, fat: 0, fiber: 2 },
    },
  ],
}

describe('the recogniser over the model port (ADR-041, ADR-045)', () => {
  test('T-REC-UNIT-12 sends the photo then the prompt to the exact model, and answers in fractions of the photo', async () => {
    const model = createMemoryModel(MODEL)
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
          estimate: { energy: 90, protein: 2, carbohydrates: 20, fat: 0, fiber: 2 },
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
    const model = createMemoryModel(MODEL)
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
})
