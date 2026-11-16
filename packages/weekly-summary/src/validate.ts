/**
 * What an answer must hold before a person reads it as the summary of her week.
 *
 * The prompt asks for all of this; none of it is left to the prompt. A model that slips
 * is refused here, and the person sees her week without a summary instead of a wrong one
 * (ADR-053, decision 13).
 *
 * - **It speaks only of what she logged.** A part about training or nutrition she did not
 *   log is refused, and so is a comparison when there is no week before to compare with.
 *   A part she did log may not be missing either: half a summary reads as a whole one.
 * - **Every number is one of hers** (`numbers.ts`).
 * - **Nothing medical** (ADR-053, decision 9). A summary describes a week; it does not
 *   diagnose, guess at a condition or name a remedy. The words below are the ones such a
 *   sentence needs, in the two languages a summary is written in. An exercise is named as
 *   she named it, so its name is set aside before the words are looked for.
 * - **Plain text.** The app shows it as it comes: a link or markup would be shown raw, and
 *   a link is nothing a summary of her own week needs.
 *
 * A refusal is a closed reason. The text that broke the rule stays out of the error, so
 * it cannot reach a log; `problemsIn` gives the detail to the eval, which runs by hand.
 */

import { z } from 'zod'

import { numbersOf, strangers } from './numbers.js'
import { SummaryError, type RefusalReason, type WeekDocument, type WeeklySummary } from './port.js'

export const ANSWER = z.object({
  overview: z.string(),
  training: z.string().nullable(),
  nutrition: z.string().nullable(),
  changes: z.string().nullable(),
})

const OVERVIEW_AT_MOST = 400
const PART_AT_MOST = 900

const LINK = /https?:\/\/|www\./i
const MARKUP = /[*#`]|^\s*[-•]\s/m
const MEDICAL =
  /diagn[oó]s|trastorno|desorden|disorder|enfermedad|disease|illness|patolog|s[ií]ntoma|symptom|lesi[oó]n|lesiona|injur|m[eé]dic[oa]s?\b|medical|doctor|cl[ií]nic|medicament|medication|f[aá]rmac|suplement|supplement|anorexi|bulimi|diabet|hipertens|hypertens|obes/i

export interface Problem {
  readonly reason: RefusalReason
  /** For the eval only: it may quote the answer, so it never reaches a log. */
  readonly detail: string
}

const PARTS = ['overview', 'training', 'nutrition', 'changes'] as const

const tidy = (text: string): string => text.replace(/\s+/g, ' ').trim()

function exerciseNames(document: WeekDocument): string[] {
  const names = document.training?.sessions.flatMap((session) =>
    session.exercises.map((exercise) => exercise.name),
  )
  // Longest first, so a name that contains another is set aside whole.
  return [...new Set(names ?? [])].sort((a, b) => b.length - a.length)
}

function withoutNames(text: string, names: readonly string[]): string {
  return names.reduce((rest, name) => rest.replaceAll(new RegExp(escaped(name), 'gi'), ' '), text)
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every rule the answer breaks, in the order they are checked; empty when it may be shown. */
export function problemsIn(raw: unknown, document: WeekDocument): Problem[] {
  const parsed = ANSWER.safeParse(raw)
  if (!parsed.success) return [{ reason: 'shape', detail: parsed.error.issues[0]?.message ?? '' }]
  const answer = parsed.data
  const problems: Problem[] = []
  const said = PARTS.flatMap((part) => {
    const written = answer[part]
    return written === null ? [] : [{ part, written, text: tidy(written) }]
  })

  for (const { part, text } of said) {
    if (text === '') problems.push({ reason: 'empty', detail: part })
    const most = part === 'overview' ? OVERVIEW_AT_MOST : PART_AT_MOST
    if (text.length > most) problems.push({ reason: 'too-long', detail: part })
  }

  const comparable =
    (document.training?.week_before ?? null) !== null ||
    (document.nutrition?.week_before ?? null) !== null
  const logged = {
    training: document.training !== null,
    nutrition: document.nutrition !== null,
    changes: comparable,
  }
  for (const part of ['training', 'nutrition', 'changes'] as const) {
    if (answer[part] !== null && !logged[part]) {
      problems.push({ reason: 'part-not-logged', detail: part })
    }
    if (answer[part] === null && logged[part]) {
      problems.push({ reason: 'part-missing', detail: part })
    }
  }

  const names = exerciseNames(document)
  const known = numbersOf(document)
  type Said = (typeof said)[number]
  const each = (reason: RefusalReason, found: (one: Said) => string | undefined): void => {
    for (const one of said) {
      const what = found(one)
      if (what !== undefined) problems.push({ reason, detail: `${one.part}: ${what}` })
    }
  }
  each('link', ({ text }) => LINK.exec(text)?.[0])
  // As written: tidying joins the lines a list would start.
  each('markup', ({ written }) => MARKUP.exec(written)?.[0])
  each('medical', ({ text }) => MEDICAL.exec(withoutNames(text, names))?.[0])
  each('unknown-number', ({ text }) => strangers(text, known).join(' ') || undefined)
  return problems
}

/** The summary as it may be shown, or a `SummaryError` that says which rule it broke. */
export function checkSummary(raw: unknown, document: WeekDocument): WeeklySummary {
  const [first] = problemsIn(raw, document)
  if (first) throw new SummaryError('refused', { reason: first.reason })
  const answer = ANSWER.parse(raw)
  return {
    overview: tidy(answer.overview),
    training: answer.training === null ? null : tidy(answer.training),
    nutrition: answer.nutrition === null ? null : tidy(answer.nutrition),
    changes: answer.changes === null ? null : tidy(answer.changes),
  }
}
