/**
 * The summariser the environment describes, or none.
 *
 * `WEEKLY_SUMMARY_MODEL` is the whole switch, and it is only set or changed after
 * `bun run eval` passes with that model (ADR-053, invariant 9).
 *
 * - **Unset, there is no summariser**, and the capability is closed: a person who asks
 *   is told the summary is not available, and nothing is sent anywhere. That is how the
 *   code ships before a model has been chosen for it.
 * - **`bedrock/<us. inference profile>`** asks Amazon Bedrock with the task's own role, in
 *   `WEEKLY_SUMMARY_REGION` or `us-east-1`. Every capability of the assistant is asked on
 *   Bedrock with processing in the United States (ADR-053, decision 11), so only a `us.`
 *   profile in a `us-` region is taken: such a profile keeps the week inside the country
 *   (ADR-042). Anything else is a configuration error, and it is said at once.
 *
 * A summary and its run record the whole slug, route included (ADR-018).
 */

import { createBedrockModel } from '@allfitone/ai-provider/bedrock'

import type { WeeklySummarizer } from './port.js'
import { createWeeklySummarizer } from './summarizer.js'

const BEDROCK = 'bedrock/'
const BEDROCK_REGION = 'us-east-1'
/** A summary is four short texts. An answer that reaches this was not one. */
const MAX_OUTPUT_TOKENS = 1_500

export function createWeeklySummarizerFromEnv(
  env: Record<string, string | undefined>,
): WeeklySummarizer | null {
  const model = env.WEEKLY_SUMMARY_MODEL?.trim()
  if (!model) return null
  const region = env.WEEKLY_SUMMARY_REGION?.trim() || BEDROCK_REGION
  if (!/^bedrock\/us\.[a-z0-9-]+\.[a-z0-9.-]+$/.test(model) || !/^us-[a-z]+-[0-9]$/.test(region)) {
    throw new Error(
      'WEEKLY_SUMMARY_MODEL must be bedrock/ and a us. inference profile, in a us- region: the assistant is asked on Amazon Bedrock in the United States',
    )
  }
  return createWeeklySummarizer(
    createBedrockModel({ region, maxOutputTokens: MAX_OUTPUT_TOKENS }),
    { model: model.slice(BEDROCK.length), recordedAs: model },
  )
}
