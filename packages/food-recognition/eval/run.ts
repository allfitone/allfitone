/**
 * The recognition eval (ADR-041): every photo of `photos.json` through the real model,
 * scored against what a person sees in it. A model only replaces the current one when it
 * passes: at least 85 % of the expected foods named, and no answer that is just the dish.
 * It costs money, so it runs by hand, never in CI.
 *
 * Run: `bun run eval [model …]` (the pinned model by default). A Gateway slug such as
 * `google/gemini-3.5-flash-lite` needs `AI_GATEWAY_API_KEY`; `bedrock:<model id>` asks
 * Amazon Bedrock with the local AWS credentials, in `AWS_REGION` or `us-east-1` (ADR-045),
 * and `bedrock-tool:<model id>` asks a model without structured output, such as Nova.
 * A model's own request fields follow the id as a query: `bedrock:<id>?reasoning_effort=none`.
 * Passing on Bedrock is a measurement, not a switch: production changes only with its own
 * consent version and decision.
 *
 * Each model's line ends with the tokens a photo cost it, as its vendor counted them: two
 * models that both pass are told apart by that and by the median time. Bedrock is asked a
 * few photos at a time, because a new account's quota is small and a throttled photo would
 * read as a failed one, and is given longer, because it compiles a schema it has not seen
 * for up to 90 seconds before the first answer.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createGatewayModel, type LanguageModel } from '@allfitone/ai-provider'
import { createBedrockModel } from '@allfitone/ai-provider/bedrock'

import { DEFAULT_MODEL } from '../src/factory.js'
import { createFoodRecognizer } from '../src/recognizer.js'

interface Photo {
  readonly key: string
  readonly url: string
  readonly expected: readonly string[]
}

// A file path, not the URL's own: that one keeps `%20` and, on Windows, a leading slash.
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))
const { photos } = JSON.parse(readFileSync(here('photos.json'), 'utf8')) as { photos: Photo[] }

interface Asked {
  readonly port: LanguageModel
  readonly id: string
  readonly timeoutMs: number
  /** How many photos it is asked at the same time. */
  readonly atOnce: number
}

/** The port and the exact id each argument names: Bedrock by prefix, the Gateway otherwise. */
function modelFor(name: string): Asked {
  const bedrock = /^bedrock(-tool)?:([^?]+)(?:\?(.+))?$/.exec(name)
  if (bedrock) {
    const region = process.env.AWS_REGION?.trim() || 'us-east-1'
    const modelFields = bedrock[3] ? Object.fromEntries(new URLSearchParams(bedrock[3])) : undefined
    return {
      port: createBedrockModel({ region, shape: bedrock[1] ? 'tool' : 'output', modelFields }),
      id: bedrock[2] ?? '',
      timeoutMs: 150_000,
      atOnce: 3,
    }
  }
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim()
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set')
  return {
    port: createGatewayModel({ apiKey, providers: ['vertex'] }),
    id: name,
    timeoutMs: 60_000,
    atOnce: photos.length,
  }
}

/** `work` over every item, at most `atOnce` at a time, in the items' order. */
async function pooled<T, R>(
  items: readonly T[],
  atOnce: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  const queue = items.entries()
  const worker = async () => {
    for (const [at, item] of queue) results[at] = await work(item)
  }
  await Promise.all(Array.from({ length: Math.max(1, atOnce) }, worker))
  return results
}

/** Every message down the cause chain, so a refusal says what was refused. */
function reason(cause: unknown): string {
  const messages: string[] = []
  for (let at: unknown = cause; at instanceof Error && messages.length < 4; at = at.cause) {
    messages.push(at.message.split('\n')[0] ?? at.name)
  }
  return messages.length > 0 ? messages.join(' ← ') : String(cause)
}

const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

async function image(photo: Photo): Promise<Uint8Array> {
  mkdirSync(here('.cache'), { recursive: true })
  const path = here(`.cache/${photo.key}.jpg`)
  if (!existsSync(path)) {
    const response = await fetch(photo.url, {
      headers: { 'user-agent': 'AllfitEval/1.0 (internal test)' },
    })
    if (!response.ok) throw new Error(`could not download ${photo.key}: ${String(response.status)}`)
    writeFileSync(path, new Uint8Array(await response.arrayBuffer()))
  }
  return new Uint8Array(readFileSync(path))
}

// Photos first and one at a time: Wikimedia throttles a burst, and a photo that did not
// download must not read as a model that failed.
for (const photo of photos) await image(photo)

const models = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [DEFAULT_MODEL]
let failed = false
for (const model of models) {
  const { port, id, timeoutMs, atOnce } = modelFor(model)
  const used = { input: 0, output: 0, answers: 0 }
  const counting: LanguageModel = {
    async answer(request) {
      const answer = await port.answer(request)
      if (answer.usage) {
        used.input += answer.usage.inputTokens
        used.output += answer.usage.outputTokens
        used.answers += 1
      }
      return answer
    },
  }
  const recognizer = createFoodRecognizer(counting, { model: id, timeoutMs })
  const scores = await pooled(photos, atOnce, async (photo) => {
    const started = performance.now()
    try {
      const answer = await recognizer.recognize(await image(photo))
      const names = answer.items.map((item) => fold(item.name))
      const hits = photo.expected.filter((pattern) =>
        names.some((name) => new RegExp(pattern).test(name)),
      )
      return {
        photo: photo.key,
        recall: hits.length / photo.expected.length,
        collapsed: answer.items.length === 1 && photo.expected.length > 1,
        ms: performance.now() - started,
        error: null,
      }
    } catch (cause) {
      return {
        photo: photo.key,
        recall: 0,
        collapsed: false,
        ms: performance.now() - started,
        error: reason(cause),
      }
    }
  })
  const recall = scores.reduce((sum, score) => sum + score.recall, 0) / scores.length
  const collapsed = scores.filter((score) => score.collapsed).length
  const errors = scores.filter((score) => score.error)
  const sorted = scores.map((score) => score.ms).sort((a, b) => a - b)
  const passes = recall >= 0.85 && collapsed === 0 && errors.length === 0
  failed ||= !passes
  const tokens =
    used.answers > 0
      ? `${(used.input / used.answers).toFixed(0)} de entrada y ${(used.output / used.answers).toFixed(0)} de salida`
      : 'sin dato'
  console.log(
    `${model}: ${passes ? 'PASA' : 'NO PASA'} · aciertos ${(recall * 100).toFixed(0)} % · solo el plato ${String(collapsed)} · errores ${String(errors.length)} · mediana ${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(0)} ms · la más lenta ${(sorted.at(-1) ?? 0).toFixed(0)} ms · tokens por foto: ${tokens}`,
  )
  for (const score of scores.filter((one) => one.recall < 1 || one.error)) {
    console.log(
      `   ${score.photo}: ${(score.recall * 100).toFixed(0)} %${score.error ? ` · ${score.error}` : ''}`,
    )
  }
}
process.exit(failed ? 1 : 0)
