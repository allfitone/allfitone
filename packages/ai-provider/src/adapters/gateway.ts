/**
 * Models through Vercel AI Gateway, with the AI SDK (ADR-041, ADR-045).
 *
 * - **Zero data retention on every request**, and not a setting: nothing a person sends
 *   is kept by the vendor or used to train. The Gateway's ZDR agreement with Google covers
 *   Vertex AI, not AI Studio, so the task names the inference providers it allows and the
 *   request never goes elsewhere; were none of them to offer the model, it fails instead.
 * - **One model, by exact id**, and no `models` fallback list, so a model that has not
 *   passed the task's eval never answers in its place.
 * - **The answer is held to the schema** by the SDK; one that does not fit is
 *   `invalid-answer`. A status the request itself caused (4xx but a timeout or a rate
 *   limit) is `rejected`; everything else is `unavailable`.
 */

import {
  createGateway,
  generateText,
  JSONParseError,
  Output,
  RetryError,
  TypeValidationError,
} from 'ai'

import { ModelError, type LanguageModel, type ModelFailure, type Part } from '../port.js'

export interface GatewaySettings {
  readonly apiKey: string
  /** The inference providers allowed, by Gateway slug, such as `vertex`. */
  readonly providers: readonly string[]
  /** Where the Gateway answers; set only to point a test at a fake one. */
  readonly baseURL?: string | undefined
}

export function createGatewayModel(settings: GatewaySettings): LanguageModel {
  if (settings.providers.length === 0) {
    throw new Error('The Gateway needs at least one inference provider to route to')
  }
  const gateway = createGateway({
    apiKey: settings.apiKey,
    ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
  })
  return {
    async answer(request) {
      const deadline = AbortSignal.timeout(request.timeoutMs)
      try {
        const result = await generateText({
          model: gateway(request.model),
          maxRetries: 1,
          abortSignal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline,
          messages: [{ role: 'user', content: request.parts.map(content) }],
          output: Output.object({ schema: request.schema }),
          providerOptions: {
            gateway: { only: [...settings.providers], zeroDataRetention: true },
          },
        })
        return { value: result.output, model: request.model }
      } catch (cause) {
        throw new ModelError(failureOf(cause), cause)
      }
    },
  }
}

function content(part: Part) {
  return part.kind === 'text'
    ? { type: 'text' as const, text: part.text }
    : { type: 'file' as const, data: part.bytes, mediaType: part.media }
}

function failureOf(cause: unknown): ModelFailure {
  if (cause instanceof TypeValidationError || cause instanceof JSONParseError) {
    return 'invalid-answer'
  }
  // The SDK swaps the Gateway's 401 for a plain Error with a friendlier message; only the
  // name survives, so the name is what says the key was refused.
  if (cause instanceof Error && cause.name === 'GatewayAuthenticationError') return 'rejected'
  const status = statusOf(RetryError.isInstance(cause) ? cause.lastError : cause)
  const refused = status !== undefined && status >= 400 && status < 500
  return refused && ![408, 424, 429].includes(status) ? 'rejected' : 'unavailable'
}

function statusOf(cause: unknown): number | undefined {
  return cause instanceof Error && 'statusCode' in cause && typeof cause.statusCode === 'number'
    ? cause.statusCode
    : undefined
}
