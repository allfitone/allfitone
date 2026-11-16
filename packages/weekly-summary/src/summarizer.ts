/**
 * The weekly summary as a task over the model port (ADR-045, ADR-053).
 *
 * The task owns what makes it this task: the prompt, the answer's shape, the checks on
 * what a person may be shown and the eval. Which vendor answers is the port's business,
 * so the same summariser runs in production and in the eval.
 *
 * - **The answer is checked twice**: by the model port, for shape, and by `checkSummary`,
 *   for what it says against the week it was given.
 * - **A model that fails is a summary that fails.** No other model answers in its place
 *   and nothing is retried here: the person sees her week without a summary and may ask
 *   again (ADR-053, decision 13).
 * - **A failure still says what it cost.** A refused answer was paid for, and its run
 *   records the tokens like any other.
 */

import { ModelError, type LanguageModel } from '@allfitone/ai-provider'

import { SummaryError, type Summarised, type WeeklySummarizer } from './port.js'
import { promptFor } from './prompt.js'
import { ANSWER, checkSummary } from './validate.js'

export interface SummarizerSettings {
  /** The exact model, as the port's adapter names it. */
  readonly model: string
  /** What a run and a summary record, when it says more than the adapter's id: the route too. */
  readonly recordedAs?: string | undefined
  readonly timeoutMs?: number | undefined
}

const TIMEOUT_MS = 25_000

export function createWeeklySummarizer(
  model: LanguageModel,
  settings: SummarizerSettings,
): WeeklySummarizer {
  const timeoutMs = settings.timeoutMs ?? TIMEOUT_MS
  const recordedAs = settings.recordedAs ?? settings.model
  return {
    model: recordedAs,
    async summarize(document, signal) {
      let value: unknown
      let tokens: Summarised['tokens']
      try {
        const answer = await model.answer({
          model: settings.model,
          parts: [{ kind: 'text', text: promptFor(document) }],
          schema: ANSWER,
          timeoutMs,
          signal,
        })
        value = answer.value
        tokens = answer.usage
          ? { input: answer.usage.inputTokens, output: answer.usage.outputTokens }
          : null
      } catch (cause) {
        const malformed = cause instanceof ModelError && cause.failure === 'invalid-answer'
        throw malformed
          ? new SummaryError('refused', { reason: 'shape', cause })
          : new SummaryError('unavailable', { cause })
      }
      try {
        return { summary: checkSummary(value, document), model: recordedAs, tokens }
      } catch (cause) {
        if (!(cause instanceof SummaryError)) throw cause
        throw new SummaryError(cause.failure, { reason: cause.reason ?? undefined, tokens })
      }
    },
  }
}
