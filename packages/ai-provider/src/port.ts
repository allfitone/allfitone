/**
 * Model port: asking a model for an answer of a known shape (ADR-045).
 *
 * It speaks our language, not a vendor's. A task says what it sends — text and images,
 * in order — which model answers, the shape the answer must have and how long it may
 * take; it gets back an answer that already has that shape, and the exact model that
 * gave it, for the record the task keeps. Any vendor that answers in a JSON schema fits
 * behind it: Vercel AI Gateway and Amazon Bedrock today, another tomorrow. That is the
 * test AGENTS.md sets for a port.
 *
 * **What is missing is missing on purpose.** Tools, conversations of several turns,
 * token usage and streaming have no caller yet; each joins this port with the first task
 * that needs it, not before (ADR-021: no abstraction only because it might be reused).
 *
 * **One model per request, and no fallback.** A model that has not passed the task's
 * eval never answers in its place: when the model fails, the request fails (ADR-041).
 */

import type { ZodType } from 'zod'

/** What the person sends: text, and photos as JPEG bytes already stripped of metadata. */
export type Part =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'image'; readonly media: 'image/jpeg'; readonly bytes: Uint8Array }

export interface ModelRequest<T> {
  /** The exact model, as the adapter's vendor names it; never an alias the vendor moves. */
  readonly model: string
  readonly parts: readonly Part[]
  /** The shape the answer must have; an answer without it is not an answer. */
  readonly schema: ZodType<T>
  /** The whole request, retries included, ends by then. */
  readonly timeoutMs: number
  readonly signal?: AbortSignal | undefined
}

export interface ModelAnswer<T> {
  readonly value: T
  /** The exact model that answered, for the record the task keeps (ADR-018). */
  readonly model: string
}

export interface LanguageModel {
  /** Fails closed with `ModelError`; the vendor's own errors never cross this line. */
  answer<T>(request: ModelRequest<T>): Promise<ModelAnswer<T>>
}

/**
 * - `unavailable`: the vendor did not answer in time, or could not now; later may work.
 * - `invalid-answer`: it answered, but not in the shape asked for.
 * - `rejected`: it refused the request as sent: no access, no such model, or a schema it
 *   does not take. Sending the same again will fail the same way.
 */
export type ModelFailure = 'unavailable' | 'invalid-answer' | 'rejected'

export class ModelError extends Error {
  readonly failure: ModelFailure

  constructor(failure: ModelFailure, cause?: unknown) {
    super(`model failed: ${failure}`, { cause })
    this.name = 'ModelError'
    this.failure = failure
  }
}
