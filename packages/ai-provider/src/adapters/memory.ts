/**
 * A model for tests: answers what it was told, or fails the way it was told, and keeps
 * every request it received. The answer still goes through the request's schema, so a
 * test sees exactly what a real adapter would let through.
 */

import { ModelError, type LanguageModel, type ModelFailure, type ModelRequest } from '../port.js'

export interface MemoryModel extends LanguageModel {
  readonly seen: ModelRequest<unknown>[]
  /** What the next requests get, before their schema checks it. */
  willAnswer(raw: unknown): void
  failNext(failure: ModelFailure): void
}

export function createMemoryModel(id = 'memory/model'): MemoryModel {
  let raw: unknown = null
  let failure: ModelFailure | null = null
  const seen: ModelRequest<unknown>[] = []
  return {
    seen,
    willAnswer(next) {
      raw = next
    },
    failNext(next) {
      failure = next
    },
    answer(request) {
      seen.push(request)
      if (failure) {
        const thrown = new ModelError(failure)
        failure = null
        return Promise.reject(thrown)
      }
      const parsed = request.schema.safeParse(raw)
      return parsed.success
        ? Promise.resolve({ value: parsed.data, model: id })
        : Promise.reject(new ModelError('invalid-answer', parsed.error))
    },
  }
}
