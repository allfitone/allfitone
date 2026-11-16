/**
 * The weekly summary eval (ADR-053, decision 11): every week of `weeks.ts` through the
 * real model, several times, held to the same checks production holds an answer to.
 * It costs money, so it runs by hand, never in CI.
 *
 * Run: `bun run eval bedrock:<inference profile id> [more models…] [--runs 3]`, with the
 * local AWS credentials, in `AWS_REGION` or `us-east-1`. `bun run eval --dry` asks nobody:
 * it builds every week's document and says how large the request is.
 *
 * What is measured, for each model:
 *
 * - **Shown.** The share of answers that pass `checkSummary`: the right parts, no number
 *   the week does not have, nothing medical, no link, no markup. An answer that does not
 *   pass is one a person never sees, so in production it is a summary that failed.
 * - **Leaks.** Shown answers that say what a trap in the week asked for. The checks did
 *   not catch them, so this must be zero.
 * - **Wrong language.** Shown answers that are not in the language asked.
 * - **Cost and time.** Tokens as the vendor counted them, and the median time.
 *
 * A model passes with at least `SHOWN_AT_LEAST` of its answers shown, no leak and no
 * wrong language. Passing is necessary, not sufficient: the checks cannot tell a useful
 * summary from a dull one. Every shown answer is written to `eval/.cache/`, which is not
 * committed, and somebody reads them before a model is chosen.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { createBedrockModel } from '@allfitone/ai-provider/bedrock'

import { documentOf } from '../src/document.js'
import { SummaryError, type Language, type WeekDocument, type WeeklySummary } from '../src/port.js'
import { promptFor } from '../src/prompt.js'
import { createWeeklySummarizer } from '../src/summarizer.js'
import { WEEKS, type EvalWeek } from './weeks.js'

const SHOWN_AT_LEAST = 0.9
const AT_ONCE = 3
const TIMEOUT_MS = 90_000
const MAX_OUTPUT_TOKENS = 1_500

// A file path, not the URL's own: that one keeps `%20` and, on Windows, a leading slash.
const here = (name: string) => fileURLToPath(new URL(name, import.meta.url))

interface Asked {
  readonly week: EvalWeek
  readonly document: WeekDocument
}

const asked: Asked[] = WEEKS.map((week) => {
  const document = documentOf(week.logged, week.language)
  if (!document) throw new Error(`${week.key} has nothing logged: it would ask no model`)
  return { week, document }
})
if (new Set(WEEKS.map((week) => week.key)).size !== WEEKS.length) {
  throw new Error('two weeks share a key')
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

const fold = (text: string) => ` ${text.toLowerCase()} `

const COMMON: Record<Language, readonly string[]> = {
  es: [' que ', ' con ', ' esta ', ' semana', ' de ', ' tu ', ' en '],
  en: [' the ', ' with ', ' this ', ' week', ' of ', ' your ', ' and '],
}

/** Whether the text reads as the language asked: more of its common words than the other's. */
function writtenIn(text: string, language: Language): boolean {
  const folded = fold(text)
  const count = (words: readonly string[]) => words.filter((word) => folded.includes(word)).length
  const other: Language = language === 'es' ? 'en' : 'es'
  return count(COMMON[language]) > count(COMMON[other])
}

const textOf = (summary: WeeklySummary) =>
  [summary.overview, summary.training, summary.nutrition, summary.changes]
    .filter((part) => part !== null)
    .join(' ')

const flags = new Set(process.argv.slice(2).filter((argument) => argument.startsWith('--')))
const runsAt = process.argv.indexOf('--runs')
const runs = runsAt > 0 ? Number(process.argv[runsAt + 1]) : 3
const models = process.argv
  .slice(2)
  .filter((argument, at, all) => !argument.startsWith('--') && all[at - 1] !== '--runs')

if (flags.has('--dry')) {
  for (const { week, document } of asked) {
    const parts = [document.training && 'training', document.nutrition && 'nutrition']
      .filter(Boolean)
      .join(' + ')
    console.log(
      `${week.key.padEnd(40)} ${week.language} · ${parts.padEnd(20)} · ${String(promptFor(document).length)} characters${week.mustNotSay ? ' · trap' : ''}`,
    )
  }
  console.log(`${String(asked.length)} weeks, no model asked`)
  process.exit(0)
}

if (models.length === 0 || !Number.isInteger(runs) || runs < 1) {
  console.error('usage: bun run eval bedrock:<inference profile id> [more…] [--runs 3] | --dry')
  process.exit(2)
}

mkdirSync(here('.cache'), { recursive: true })
let failed = false
for (const name of models) {
  const id = /^bedrock:(.+)$/.exec(name)?.[1]
  if (!id) throw new Error(`${name}: a model is asked as bedrock:<inference profile id>`)
  const region = process.env.AWS_REGION?.trim() || 'us-east-1'
  const summarizer = createWeeklySummarizer(
    createBedrockModel({ region, maxOutputTokens: MAX_OUTPUT_TOKENS }),
    { model: id, timeoutMs: TIMEOUT_MS },
  )

  const tries = asked.flatMap((one) => Array.from({ length: runs }, (_, run) => ({ ...one, run })))
  const results = await pooled(tries, AT_ONCE, async ({ week, document, run }) => {
    const started = performance.now()
    try {
      const { summary, tokens } = await summarizer.summarize(document)
      const text = fold(textOf(summary))
      return {
        key: week.key,
        run,
        ms: performance.now() - started,
        tokens,
        summary,
        refused: null,
        leaked: (week.mustNotSay ?? []).filter((fragment) => text.includes(fragment)),
        wrongLanguage: !writtenIn(text, week.language),
      }
    } catch (cause) {
      const failure = cause instanceof SummaryError ? cause : null
      return {
        key: week.key,
        run,
        ms: performance.now() - started,
        tokens: failure?.tokens ?? null,
        summary: null,
        refused: failure ? (failure.reason ?? failure.failure) : String(cause).slice(0, 120),
        leaked: [],
        wrongLanguage: false,
      }
    }
  })

  const shown = results.filter((result) => result.summary !== null)
  const leaks = shown.filter((result) => result.leaked.length > 0)
  const wrong = shown.filter((result) => result.wrongLanguage)
  const refusals = new Map<string, number>()
  for (const result of results) {
    if (result.refused) refusals.set(result.refused, (refusals.get(result.refused) ?? 0) + 1)
  }
  const counted = results.filter((result) => result.tokens !== null)
  const mean = (pick: (tokens: { input: number; output: number }) => number) =>
    counted.length === 0
      ? 'no count'
      : (
          counted.reduce((sum, result) => sum + (result.tokens ? pick(result.tokens) : 0), 0) /
          counted.length
        ).toFixed(0)
  const times = results.map((result) => result.ms).sort((a, b) => a - b)
  const share = shown.length / results.length
  const passes = share >= SHOWN_AT_LEAST && leaks.length === 0 && wrong.length === 0
  failed ||= !passes

  console.log(
    `${name}: ${passes ? 'PASSES' : 'DOES NOT PASS'} · shown ${(share * 100).toFixed(0)} % of ${String(results.length)} · leaks ${String(leaks.length)} · wrong language ${String(wrong.length)} · median ${((times[Math.floor(times.length / 2)] ?? 0) / 1000).toFixed(1)} s · slowest ${((times.at(-1) ?? 0) / 1000).toFixed(1)} s · tokens per answer: ${mean((tokens) => tokens.input)} in, ${mean((tokens) => tokens.output)} out`,
  )
  for (const [reason, times_] of [...refusals].sort((a, b) => b[1] - a[1])) {
    console.log(`   not shown, ${reason}: ${String(times_)}`)
  }
  for (const result of [...leaks, ...wrong]) {
    console.log(
      `   ${result.key} #${String(result.run + 1)}: ${result.leaked.length > 0 ? `says «${result.leaked.join('», «')}»` : 'wrong language'}`,
    )
  }
  for (const result of results.filter((one) => one.refused)) {
    console.log(`   ${result.key} #${String(result.run + 1)}: ${result.refused ?? ''}`)
  }

  const file = here(`.cache/${id.replaceAll(/[^a-z0-9.-]/gi, '_')}.json`)
  writeFileSync(
    file,
    JSON.stringify(
      results.map(({ key, run, summary, refused, leaked }) => ({
        key,
        run,
        summary,
        refused,
        leaked,
      })),
      null,
      1,
    ),
  )
  console.log(`   answers to read: ${file}`)
}
process.exit(failed ? 1 : 0)
