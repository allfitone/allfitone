/**
 * A summariser for tests: answers what it was told, or fails the way it was told, and
 * remembers every document it was shown. The answer still goes through `checkSummary`,
 * so a test sees exactly what the real summariser would let a person read.
 */

import {
  SummaryError,
  type Summarised,
  type SummaryFailure,
  type WeekDocument,
  type WeeklySummarizer,
} from '../port.js'
import { checkSummary } from '../validate.js'

export interface MemorySummarizer extends WeeklySummarizer {
  readonly seen: WeekDocument[]
  /** What the next requests get, before the checks; `tokens` is what each one cost. */
  answer(raw: unknown, tokens?: Summarised['tokens']): void
  failNext(failure: SummaryFailure): void
}

export function createMemorySummarizer(model = 'memory/summarizer'): MemorySummarizer {
  let raw: unknown = null
  let cost: Summarised['tokens'] = null
  let failure: SummaryFailure | null = null
  const seen: WeekDocument[] = []
  return {
    model,
    seen,
    answer(next, tokens = null) {
      raw = next
      cost = tokens
    },
    failNext(next) {
      failure = next
    },
    summarize(document) {
      seen.push(document)
      if (failure) {
        const thrown = new SummaryError(failure)
        failure = null
        return Promise.reject(thrown)
      }
      try {
        return Promise.resolve({ summary: checkSummary(raw, document), model, tokens: cost })
      } catch (cause) {
        const reason = cause instanceof SummaryError ? (cause.reason ?? undefined) : undefined
        return Promise.reject(new SummaryError('refused', { reason, tokens: cost }))
      }
    },
  }
}
