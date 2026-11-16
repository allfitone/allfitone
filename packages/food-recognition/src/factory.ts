/**
 * The recogniser the environment describes, and the consent it answers under.
 *
 * `FOOD_RECOGNITION_MODEL` is the whole switch, and it is only changed after
 * `bun run eval` passes with the new model. Its first segment is the route:
 *
 * - **`bedrock/<inference profile>`** asks Amazon Bedrock with the task's own role, in
 *   `FOOD_RECOGNITION_REGION` or `us-east-1`. Its consent text names Anthropic in the
 *   United States, so only a `us.anthropic.` profile in a `us-` region may answer under
 *   it: such a profile keeps a photo inside the country (ADR-042).
 * - **Anything else** asks the Vercel AI Gateway, routed only through Vertex: the
 *   Gateway's zero data retention agreement with Google covers Vertex AI, not AI Studio.
 *   Its consent text names Google through Vercel.
 *
 * **The consent follows the route.** Each route carries the version of the text that
 * names where it sends a photo, and the API asks for that one. A photo therefore never
 * reaches a vendor the person did not accept, whatever order code and configuration are
 * released in. Another vendor is another text, and so a new version here.
 *
 * A meal records the whole slug, route included. A model on Bedrock is slower than the
 * one on the Gateway, so its deadline is longer; both stay under what the edge waits.
 */

import { createGatewayModel } from '@allfitone/ai-provider'
import { createBedrockModel } from '@allfitone/ai-provider/bedrock'

import type { FoodRecognizer } from './port.js'
import { createFoodRecognizer } from './recognizer.js'

export interface FoodRecognition {
  readonly recognizer: FoodRecognizer
  /** The version of the consent text that names where this recogniser sends a photo. */
  readonly consent: string
}

export const DEFAULT_MODEL = 'google/gemini-3.5-flash-lite'

const GATEWAY_CONSENT = '2026-10-04'
const BEDROCK_CONSENT = '2026-11-15'
const BEDROCK = 'bedrock/'
const BEDROCK_REGION = 'us-east-1'
/** Sonnet 4.6 took up to 11.7 s a photo in the eval, and a schema not seen for a day adds two. */
const BEDROCK_TIMEOUT_MS = 20_000

export function createFoodRecognitionFromEnv(
  env: Record<string, string | undefined>,
): FoodRecognition {
  const model = env.FOOD_RECOGNITION_MODEL?.trim() || DEFAULT_MODEL
  if (!/^[a-z0-9-]+\/[a-z0-9.-]+$/.test(model)) {
    throw new Error(
      'FOOD_RECOGNITION_MODEL must be an exact model slug such as google/gemini-3.5-flash-lite',
    )
  }
  if (model.startsWith(BEDROCK)) {
    const profile = model.slice(BEDROCK.length)
    const region = env.FOOD_RECOGNITION_REGION?.trim() || BEDROCK_REGION
    if (!profile.startsWith('us.anthropic.') || !/^us-[a-z]+-[0-9]$/.test(region)) {
      throw new Error(
        'FOOD_RECOGNITION_MODEL on Bedrock must be a us.anthropic. inference profile in a us- region: the consent names Anthropic in the United States',
      )
    }
    return {
      recognizer: createFoodRecognizer(createBedrockModel({ region }), {
        model: profile,
        recordedAs: model,
        timeoutMs: BEDROCK_TIMEOUT_MS,
      }),
      consent: BEDROCK_CONSENT,
    }
  }
  const apiKey = env.AI_GATEWAY_API_KEY?.trim()
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set')
  return {
    recognizer: createFoodRecognizer(createGatewayModel({ apiKey, providers: ['vertex'] }), {
      model,
    }),
    consent: GATEWAY_CONSENT,
  }
}
