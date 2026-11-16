import { describe, expect, test } from 'bun:test'

import { createMemoryRecognizer } from './adapters/memory.js'
import { createFoodRecognitionFromEnv } from './factory.js'
import { RecognitionError } from './port.js'

describe('the recogniser (ADR-041)', () => {
  test('T-REC-UNIT-06 the factory names the missing key and refuses a model alias', () => {
    expect(() => createFoodRecognitionFromEnv({})).toThrow('AI_GATEWAY_API_KEY is not set')
    expect(() =>
      createFoodRecognitionFromEnv({
        AI_GATEWAY_API_KEY: 'k',
        FOOD_RECOGNITION_MODEL: 'gemini latest',
      }),
    ).toThrow('exact model slug')
    expect(createFoodRecognitionFromEnv({ AI_GATEWAY_API_KEY: 'k' }).recognizer).toHaveProperty(
      'recognize',
    )
  })

  test('T-REC-UNIT-15 the consent asked is the one whose text names where the photo goes', () => {
    expect(createFoodRecognitionFromEnv({ AI_GATEWAY_API_KEY: 'k' }).consent).toBe('2026-10-04')

    // Bedrock answers with the task's own role: no key of the Gateway's is asked for.
    const onBedrock = createFoodRecognitionFromEnv({
      FOOD_RECOGNITION_MODEL: 'bedrock/us.anthropic.claude-sonnet-4-6',
    })
    expect(onBedrock.consent).toBe('2026-11-15')
    expect(onBedrock.recognizer).toHaveProperty('recognize')

    // Its text names Anthropic in the United States, so nothing else may answer under it.
    for (const [model, region] of [
      ['bedrock/moonshotai.kimi-k2.5', undefined],
      ['bedrock/global.anthropic.claude-sonnet-4-6', undefined],
      ['bedrock/us.anthropic.claude-sonnet-4-6', 'eu-west-1'],
    ] as const) {
      expect(() =>
        createFoodRecognitionFromEnv({
          FOOD_RECOGNITION_MODEL: model,
          FOOD_RECOGNITION_REGION: region,
        }),
      ).toThrow('Anthropic in the United States')
    }
  })

  test('T-REC-UNIT-07 the memory recogniser answers through the same checks, fails when told, and keeps what it saw', async () => {
    const recognizer = createMemoryRecognizer('memory/test')
    recognizer.answer({
      dish: 'ajiaco',
      items: [
        { name: 'papa', units: 1, grams: 60, confidence: 0.8 },
        { name: '<b>', units: 1, grams: 5, confidence: 1 },
      ],
    })
    const jpeg = new Uint8Array([1, 2, 3])
    expect(await recognizer.recognize(jpeg)).toEqual({
      dish: 'ajiaco',
      items: [
        {
          name: 'papa',
          units: 1,
          grams: 60,
          confidence: 0.8,
          at: null,
          icon: null,
          estimate: null,
        },
      ],
      model: 'memory/test',
    })
    expect(recognizer.seen).toEqual([jpeg])
    recognizer.failNext('unavailable')
    await expect(recognizer.recognize(jpeg)).rejects.toThrow(new RecognitionError('unavailable'))
  })
})
