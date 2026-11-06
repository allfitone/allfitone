/**
 * The recogniser the environment describes. The model is pinned by default to the one
 * that passed the eval (ADR-041); changing `FOOD_RECOGNITION_MODEL` is the whole switch,
 * and it is only made after `bun run eval` passes with the new one.
 *
 * It answers through the Gateway, routed only through Vertex: the Gateway's zero data
 * retention agreement with Google covers Vertex AI, not AI Studio, and the consent the
 * person accepted names Google through Vercel. Another vendor is a new consent version.
 */

import { createGatewayModel } from '@allfitone/ai-provider'

import type { FoodRecognizer } from './port.js'
import { createFoodRecognizer } from './recognizer.js'

export const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite'

export function createFoodRecognizerFromEnv(
  env: Record<string, string | undefined>,
): FoodRecognizer {
  const apiKey = env.AI_GATEWAY_API_KEY?.trim()
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set')
  const model = env.FOOD_RECOGNITION_MODEL?.trim() || DEFAULT_MODEL
  if (!/^[a-z0-9-]+\/[a-z0-9.-]+$/.test(model)) {
    throw new Error(
      'FOOD_RECOGNITION_MODEL must be an exact model slug such as google/gemini-3.5-flash-lite',
    )
  }
  return createFoodRecognizer(createGatewayModel({ apiKey, providers: ['vertex'] }), { model })
}
