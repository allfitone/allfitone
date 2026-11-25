/**
 * What the rest bar says while it counts: what comes next, and in between, a nudge.
 *
 * **Next first and last, a phrase in the middle.** The opening seconds say what comes
 * next, because that is the question right after a set; the last ten say it again,
 * because that is when somebody gets up. The middle is the long stretch with nothing to
 * decide, and that is where a line with some personality earns its place.
 *
 * **One phrase per rest.** It is chosen from when the rest started, which a nudge of
 * ±15 does not move, so the line never changes under somebody's eyes mid-rest.
 *
 * The phrases talk about the moment — breathing, water, the next set — and never about
 * the body's health: this is a training log, not advice.
 */

import type { Dictionary } from '../i18n'
import { remaining, type Rest } from './rest-timer'

/** The words a rest says: `text.session.rest`. */
export type RestWords = Dictionary['session']['rest']

/** How long the bar says what comes next before the phrase takes over. */
const OPENING_SECONDS = 3
/** From here to the end it says what comes next again: time to get up. */
const CLOSING_SECONDS = 10
/** Shorter than this, there is no middle worth filling. */
const SHORTEST_FOR_A_PHRASE = 20

export type RestLine =
  | { readonly kind: 'next'; readonly text: string }
  | { readonly kind: 'phrase'; readonly text: string }

export function restLine(
  rest: Rest,
  now: number,
  next: string,
  phrases: readonly string[],
): RestLine {
  const started = rest.endsAt - rest.total * 1000
  const phrase = phrases[Math.floor(started / 1000) % phrases.length] ?? ''
  if (!next) return { kind: 'phrase', text: phrase }

  const left = remaining(rest, now)
  const elapsed = rest.total - left
  const middle =
    rest.total >= SHORTEST_FOR_A_PHRASE && elapsed >= OPENING_SECONDS && left > CLOSING_SECONDS
  return middle ? { kind: 'phrase', text: phrase } : { kind: 'next', text: next }
}

/**
 * The push when a rest is over, for the notification that reaches a locked phone.
 *
 * Unlike the phrases above, these have one job: get somebody off the bench and into the
 * next set. Each comes in two forms, with the exercise's name and without, so a rest
 * with nothing named after it still reads as a whole sentence.
 *
 * **Never about load or intensity.** «Ahora, peso muerto con todo» reads as «with all the
 * weight»; a line here must not be mistaken for an instruction about the bar. And the
 * name sits where no agreement depends on it: «que {next} no se hace sola» breaks for
 * every masculine exercise. The lines are `text.session.rest.pushes`, and
 * `rest-lines.test.ts` guards both rules in each language.
 */
export interface RestEndNotice {
  readonly title: string
  readonly subtitle: string
  readonly body: string
}

/** Chosen by the rest it ends, so a restarted rest does not repeat the last push. */
export function restEndNotice(next: string, seed: number, words: RestWords): RestEndNotice {
  const pushes = words.pushes
  const [named, unnamed] = pushes[Math.abs(Math.floor(seed)) % pushes.length] ??
    pushes[0] ?? ['', '']
  return {
    title: words.noticeTitle,
    subtitle: words.noticeSubtitle,
    body: next ? named.replace('{next}', next) : unnamed,
  }
}
