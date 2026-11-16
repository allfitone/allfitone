/**
 * Models on Amazon Bedrock, through the Converse API of the AWS SDK (ADR-045).
 *
 * - **Credentials are the SDK's default chain** unless given: in ECS that is the task
 *   role, so no key lives in a secret. The model id is the exact one Bedrock lists; a
 *   `us.` inference profile keeps the request inside one country (ADR-042).
 * - **The schema goes to Bedrock's structured output** as JSON Schema, and the answer is
 *   held to it again here: an answer that stopped for any reason but the end of its turn
 *   (cut at the token limit, filtered) is not an answer, whatever it parses to.
 * - **Bedrock takes fewer schemas than zod writes** (user guide, «Structured output»):
 *   no numeric or string bounds, at most 16 properties that may be null or one of several
 *   types, and at most 12 optional properties, nested objects included. One optional
 *   property too many is answered only after up to 90 seconds, so that one is counted
 *   here and `rejected` before anything is sent, as is a schema JSON Schema cannot say.
 * - **A schema Bedrock has not seen is compiled first**, which can take 90 seconds, and
 *   then kept for 24 hours. A task's deadline has to allow for that first request.
 * - **Not every model has structured output.** Amazon Nova refuses it, so `shape: 'tool'`
 *   asks for the same schema as the input of one tool the model must call. Nothing holds
 *   the model to it there but the check made here, and the limits above do not apply.
 * - **A model that reasons before it answers spends the output ceiling on that.** Kimi K3
 *   reasons unless told otherwise; `modelFields` carries a model's own request fields,
 *   such as `reasoning_effort`, which Converse passes on without checking them.
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
 *
 * It has its own entry, `@allfitone/ai-provider/bedrock`: a deployable that does not ask
 * Bedrock does not load its client.
 */

import {
  AccessDeniedException,
  BedrockRuntimeClient,
  BedrockRuntimeServiceException,
  ConverseCommand,
  ResourceNotFoundException,
  ValidationException,
  type ContentBlock,
  type ConverseCommandInput,
  type ToolInputSchema,
} from '@aws-sdk/client-bedrock-runtime'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { z } from 'zod'

import { ModelError, type LanguageModel, type Part, type Usage } from '../port.js'
import { shapeReason, vendorReason } from '../reason.js'

export interface BedrockSettings {
  readonly region: string
  /** Set only to point a test at a fake Bedrock. */
  readonly endpoint?: string | undefined
  /** Set only for a test; absent, the default chain applies (the task role in ECS). */
  readonly credentials?:
    { readonly accessKeyId: string; readonly secretAccessKey: string } | undefined
  /** Converse needs a ceiling; an answer that reaches it is cut, and so not an answer. */
  readonly maxOutputTokens?: number | undefined
  /** How the schema is asked: Bedrock's structured output (the default), or one tool. */
  readonly shape?: 'output' | 'tool' | undefined
  /** A model's own request fields, such as `reasoning_effort`; Converse passes them on. */
  readonly modelFields?: Readonly<Record<string, string>> | undefined
}

const CONNECT_TIMEOUT_MS = 3_000
const ATTEMPTS = 2
const MAX_OUTPUT_TOKENS = 8_192
const MAX_OPTIONAL = 12

export function createBedrockModel(settings: BedrockSettings): LanguageModel {
  const client = new BedrockRuntimeClient({
    region: settings.region,
    ...(settings.endpoint ? { endpoint: settings.endpoint } : {}),
    ...(settings.credentials ? { credentials: settings.credentials } : {}),
    maxAttempts: ATTEMPTS,
    requestHandler: new NodeHttpHandler({ connectionTimeout: CONNECT_TIMEOUT_MS }),
  })
  const asTool = settings.shape === 'tool'
  return {
    async answer(request) {
      const schema = jsonSchema(request.schema, !asTool)
      const deadline = AbortSignal.timeout(request.timeoutMs)
      let raw: unknown
      let usage: Usage | null
      try {
        const response = await client.send(
          new ConverseCommand({
            modelId: request.model,
            messages: [{ role: 'user', content: request.parts.map(content) }],
            inferenceConfig: { maxTokens: settings.maxOutputTokens ?? MAX_OUTPUT_TOKENS },
            ...(asTool ? throughTool(schema) : throughOutput(schema)),
            ...(settings.modelFields ? { additionalModelRequestFields: settings.modelFields } : {}),
          }),
          { abortSignal: request.signal ? AbortSignal.any([request.signal, deadline]) : deadline },
        )
        if (response.stopReason !== (asTool ? 'tool_use' : 'end_turn')) {
          throw new ModelError('invalid-answer', `stopped: ${String(response.stopReason)}`)
        }
        const blocks = response.output?.message?.content ?? []
        raw = asTool
          ? blocks.find((block) => block.toolUse)?.toolUse?.input
          : parsed(blocks.map((block) => block.text ?? '').join(''))
        const { inputTokens, outputTokens } = response.usage ?? {}
        const counted = inputTokens !== undefined && outputTokens !== undefined
        usage = counted ? { inputTokens, outputTokens } : null
      } catch (cause) {
        throw cause instanceof ModelError ? cause : failed(cause)
      }
      const checked = request.schema.safeParse(raw)
      if (!checked.success) throw new ModelError('invalid-answer', shapeReason(checked.error))
      return { value: checked.data, usage }
    },
  }
}

const ANSWER = 'answer'

function throughOutput(schema: string): Pick<ConverseCommandInput, 'outputConfig'> {
  return {
    outputConfig: {
      textFormat: { type: 'json_schema', structure: { jsonSchema: { name: ANSWER, schema } } },
    },
  }
}

function throughTool(schema: string): Pick<ConverseCommandInput, 'toolConfig'> {
  return {
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: ANSWER,
            description: 'Gives the answer in the shape asked for.',
            inputSchema: { json: JSON.parse(schema) as ToolInputSchema.JsonMember['json'] },
          },
        },
      ],
      toolChoice: { tool: { name: ANSWER } },
    },
  }
}

function parsed(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ModelError('invalid-answer', 'the answer was not JSON')
  }
}

function content(part: Part): ContentBlock {
  return part.kind === 'text'
    ? { text: part.text }
    : { image: { format: 'jpeg', source: { bytes: part.bytes } } }
}

/** The schema as Bedrock reads it: JSON Schema 2020-12, without the `$schema` marker. */
function jsonSchema(schema: z.ZodType, structuredOutput: boolean): string {
  let written: Record<string, unknown>
  try {
    written = z.toJSONSchema(schema)
  } catch (cause) {
    throw new ModelError(
      'rejected',
      `the schema cannot be written as JSON Schema: ${vendorReason(cause)}`,
    )
  }
  const { $schema: _marker, ...rest } = written
  const optional = structuredOutput ? optionalIn(rest) : 0
  if (optional > MAX_OPTIONAL) {
    throw new ModelError(
      'rejected',
      `Bedrock takes at most ${String(MAX_OPTIONAL)} optional properties in a schema, and this one has ${String(optional)}`,
    )
  }
  return JSON.stringify(rest)
}

const SCHEMA_MAPS = ['properties', '$defs', 'definitions']
const SCHEMA_LISTS = ['anyOf', 'allOf', 'oneOf', 'prefixItems']
const SCHEMAS = ['items', 'additionalProperties']

/** Every property not listed in its object's `required`, through the whole schema. */
function optionalIn(node: unknown): number {
  if (typeof node !== 'object' || node === null) return 0
  const schema = node as Record<string, unknown>
  const inside: unknown[] = SCHEMAS.map((key) => schema[key])
  for (const key of SCHEMA_LISTS) {
    if (Array.isArray(schema[key])) inside.push(...(schema[key] as unknown[]))
  }
  let optional = 0
  for (const key of SCHEMA_MAPS) {
    const map = schema[key]
    if (typeof map !== 'object' || map === null) continue
    inside.push(...Object.values(map))
    if (key !== 'properties') continue
    const required = Array.isArray(schema.required) ? (schema.required as unknown[]) : []
    optional += Object.keys(map).filter((name) => !required.includes(name)).length
  }
  return inside.reduce<number>((sum, one) => sum + optionalIn(one), optional)
}

function failed(cause: unknown): ModelError {
  const refused =
    cause instanceof AccessDeniedException ||
    cause instanceof ValidationException ||
    cause instanceof ResourceNotFoundException
  const status =
    cause instanceof BedrockRuntimeServiceException ? cause.$metadata.httpStatusCode : undefined
  return new ModelError(refused ? 'rejected' : 'unavailable', vendorReason(cause, status))
}
