/**
 * Models on Amazon Bedrock, through the Converse API of the AWS SDK (ADR-045).
 *
 * - **Credentials are the SDK's default chain** unless given: in ECS that is the task
 *   role, so no key lives in a secret. The model id is the exact one Bedrock lists; a
 *   `us.` inference profile keeps the request inside one country (ADR-042).
 * - **The schema goes to Bedrock's structured output** as JSON Schema, and the answer is
 *   held to it again here: an answer that stopped for any reason but the end of its turn
 *   (cut at the token limit, filtered) is not an answer, whatever it parses to.
 * - **Errors** are sorted by what Bedrock says: no access, an invalid request or no such
 *   model is `rejected`; throttling, a busy or failing model and a deadline are
 *   `unavailable`.
 * - **HTTP/1.1, not the client's default HTTP/2.** HTTP/2 serves Bedrock's bidirectional
 *   streams, which nothing here uses, and Bun's `node:http2` fails on the SDK's handler;
 *   tests and the eval run under Bun.
 * - **The deadline is an abort signal per request**, retries included, because the
 *   handler's own timeouts do not fire under Bun (see the object store's S3 adapter).
 *
 * Bedrock keeps no prompt or answer unless model invocation logging is switched on for
 * the account; it stays off (ADR-045).
 */

import {
  AccessDeniedException,
  BedrockRuntimeClient,
  ConverseCommand,
  ResourceNotFoundException,
  ValidationException,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { z } from 'zod'

import { ModelError, type LanguageModel, type ModelFailure, type Part } from '../port.js'

export interface BedrockSettings {
  readonly region: string
  /** Set only to point a test at a fake Bedrock. */
  readonly endpoint?: string | undefined
  /** Set only for a test; absent, the default chain applies (the task role in ECS). */
  readonly credentials?:
    { readonly accessKeyId: string; readonly secretAccessKey: string } | undefined
  /** Converse needs a ceiling; an answer that reaches it is cut, and so not an answer. */
  readonly maxOutputTokens?: number | undefined
}

const CONNECT_TIMEOUT_MS = 3_000
const ATTEMPTS = 2
const MAX_OUTPUT_TOKENS = 8_192

export function createBedrockModel(settings: BedrockSettings): LanguageModel {
  const client = new BedrockRuntimeClient({
    region: settings.region,
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    ...(settings.credentials ? { credentials: settings.credentials } : {}),
    maxAttempts: ATTEMPTS,
    requestHandler: new NodeHttpHandler({ connectionTimeout: CONNECT_TIMEOUT_MS }),
  })
  return {
    async answer(request) {
      const deadline = AbortSignal.timeout(request.timeoutMs)
      let text: string
      try {
        const response = await client.send(
          new ConverseCommand({
            modelId: request.model,
            messages: [{ role: 'user', content: request.parts.map(content) }],
            inferenceConfig: { maxTokens: settings.maxOutputTokens ?? MAX_OUTPUT_TOKENS },
            outputConfig: {
              textFormat: {
                type: 'json_schema',
                structure: { jsonSchema: { name: 'answer', schema: jsonSchema(request.schema) } },
              },
            },
          }),
          { abortSignal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline },
        )
        if (response.stopReason !== 'end_turn') {
          throw new ModelError(
            'invalid-answer',
            new Error(`stopped: ${String(response.stopReason)}`),
          )
        }
        text = (response.output?.message?.content ?? []).map((block) => block.text ?? '').join('')
      } catch (cause) {
        throw cause instanceof ModelError ? cause : new ModelError(failureOf(cause), cause)
      }
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch (cause) {
        throw new ModelError('invalid-answer', cause)
      }
      const parsed = request.schema.safeParse(raw)
      if (!parsed.success) throw new ModelError('invalid-answer', parsed.error)
      return { value: parsed.data, model: request.model }
    },
  }
}

function content(part: Part): ContentBlock {
  return part.kind === 'text'
    ? { text: part.text }
    : { image: { format: 'jpeg', source: { bytes: part.bytes } } }
}

/** The schema as Bedrock reads it: JSON Schema 2020-12, without the `$schema` marker. */
function jsonSchema(schema: z.ZodType): string {
  const { $schema: _marker, ...rest } = z.toJSONSchema(schema)
  return JSON.stringify(rest)
}

function failureOf(cause: unknown): ModelFailure {
  const refused =
    cause instanceof AccessDeniedException ||
    cause instanceof ValidationException ||
    cause instanceof ResourceNotFoundException
  return refused ? 'rejected' : 'unavailable'
}
