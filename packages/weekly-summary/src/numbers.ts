/**
 * Which numbers a summary shows, and whether the week it was written from has them.
 *
 * A model that writes about a week can state a number nobody logged: a session that did
 * not happen, a load five kilos higher. In a summary that is the one error a person
 * cannot see, so it is checked here and not left to the prompt: every number in the text
 * must be a number of the week it was given.
 *
 * - **A number is read every way its digits can be.** «1.850» is 1850 where a point
 *   groups thousands and 1.85 where it marks decimals; a text in Spanish and one in
 *   English write the same amount differently. A number is known if any reading is.
 * - **Thousands may be grouped with a space**, as Spanish writes them: «22 135 kg». The
 *   groups are one number when the week has that number; otherwise each is read alone,
 *   so two numbers that merely stand side by side are still two.
 * - **The week's numbers are its values, and the digits inside its texts.** A date such
 *   as `2026-11-09` gives 2026, 11 and 9, so the text may say «el 9 de noviembre».
 * - **Nothing is allowed for free**, not even small numbers: what the summary may count
 *   or compare is stated in the week, already computed (see `document.ts`).
 */

const NUMBER = /\d+(?:[.,]\d+)*/g
// A plain, no-break, narrow no-break or thin space between groups of three digits.
const GROUP_SPACE = /[ \u00a0\u202f\u2009]/g
const GROUPED = /(?<![\d.,])\d{1,3}(?:[ \u00a0\u202f\u2009]\d{3})+(?:[.,]\d+)?(?!\d)/g
const PLACES = 1e6

const exact = (value: number): number => Math.round(value * PLACES) / PLACES

/** Each way the digits of one written number can be read. */
function readings(written: string): number[] {
  const groups = written.split(/[.,]/)
  const marks = written.replace(/\d/g, '')
  const [whole = '', ...rest] = groups
  if (rest.length === 0) return [Number(whole)]
  const last = rest.at(-1) ?? ''
  const joined = Number(groups.join(''))
  const withDecimals = Number(`${groups.slice(0, -1).join('')}.${last}`)
  // Two kinds of mark: the last one is the decimal, whichever it is.
  if (marks.includes('.') && marks.includes(',')) return [withDecimals]
  if (rest.length > 1) return [joined]
  return last.length === 3 && whole.length <= 3 ? [joined, withDecimals] : [withDecimals]
}

/** Every number a week holds: its numeric values, and the digits written in its texts. */
export function numbersOf(document: unknown): ReadonlySet<number> {
  const known = new Set<number>()
  const visit = (node: unknown): void => {
    // A difference is written without its sign: «120 kcal menos».
    if (typeof node === 'number') known.add(exact(Math.abs(node)))
    else if (typeof node === 'string') {
      for (const written of node.match(NUMBER) ?? []) {
        for (const value of readings(written)) known.add(exact(value))
      }
    } else if (Array.isArray(node)) node.forEach(visit)
    else if (typeof node === 'object' && node !== null) Object.values(node).forEach(visit)
  }
  visit(document)
  return known
}

/** The numbers in `text`, as written, that no reading finds among `known`. */
export function strangers(text: string, known: ReadonlySet<number>): string[] {
  const isKnown = (written: string): boolean =>
    readings(written).some((value) => known.has(exact(value)))
  // A known grouped number is set aside whole; an unknown one is left to be read in parts.
  const rest = text.replace(GROUPED, (written) =>
    isKnown(written.replace(GROUP_SPACE, '')) ? ' ' : written,
  )
  return (rest.match(NUMBER) ?? []).filter((written) => !isKnown(written))
}
