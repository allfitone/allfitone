/**
 * Recognition as a task over the model port (ADR-041, ADR-045).
 *
 * The task owns what makes it this task: the prompt, the answer's shape, the checks on
 * what may reach a diary and the eval. Which vendor answers is the port's business, so
 * the same recogniser runs on the Gateway in production and on Bedrock in the eval.
 *
 * - **The schema is checked twice**: by the model port, for shape, and by `checkAnswer`,
 *   for what may reach a diary.
 * - **Where each food sits** is asked on a 0–1000 grid, which Gemini answers far more
 *   reliably than fractions, and turned into fractions here: the grid is part of the
 *   prompt, not of any vendor.
 * - **A model failure is a recognition failure.** A refused request is `unavailable` to
 *   the person, who searches instead; the API logs only that closed value.
 */

import { ModelError, type LanguageModel } from '@allfitone/ai-provider'
import { z } from 'zod'

import { DETAIL_CODES, FOOD_GROUPS, RecognitionError, type FoodRecognizer } from './port.js'
import { RECOGNITION_PROMPT } from './prompt.js'
import { checkAnswer } from './validate.js'

export interface RecognizerSettings {
  /** The exact model, as the port's adapter names it; it is what the meal records. */
  readonly model: string
  readonly timeoutMs?: number | undefined
}

// The detail is optional: the model says what it can, and what it cannot stays unsaid.
const DETAIL = Object.fromEntries(DETAIL_CODES.map((code) => [code, z.number().optional()]))

const ANSWER = z.object({
  dish: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      units: z.number(),
      grams: z.number(),
      confidence: z.number(),
      at: z.object({ x: z.number(), y: z.number() }),
      icon: z.enum(FOOD_GROUPS),
      estimate: z.object({
        energy: z.number(),
        protein: z.number(),
        carbohydrates: z.number(),
        fat: z.number(),
        ...DETAIL,
      }),
    }),
  ),
})

export function createFoodRecognizer(
  model: LanguageModel,
  settings: RecognizerSettings,
): FoodRecognizer {
  const timeoutMs = settings.timeoutMs ?? 15_000
  return {
    async recognize(jpeg, signal) {
      let answer: z.infer<typeof ANSWER>
      try {
        const { value } = await model.answer({
          model: settings.model,
          parts: [
            { kind: 'image', media: 'image/jpeg', bytes: jpeg },
            { kind: 'text', text: RECOGNITION_PROMPT },
          ],
          schema: ANSWER,
          timeoutMs,
          signal,
        })
        answer = value
      } catch (cause) {
        const malformed = cause instanceof ModelError && cause.failure === 'invalid-answer'
        throw new RecognitionError(malformed ? 'invalid-answer' : 'unavailable', cause)
      }
      const fractions = {
        ...answer,
        items: answer.items.map((item) => ({
          ...item,
          at: { x: item.at.x / 1000, y: item.at.y / 1000 },
        })),
      }
      return { ...checkAnswer(fractions), model: settings.model }
    },
  }
}
