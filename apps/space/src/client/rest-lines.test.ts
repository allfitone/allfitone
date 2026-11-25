import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { restEndNotice, restLine } from './rest-lines'
import { started } from './rest-timer'

const es = textFor('es').session.rest
const en = textFor('en').session.rest
const REST_LINES = es.phrases
const GO_LINES = es.pushes

const NOW = 1_000_000
const ninety = started(NOW, 90)

describe('what the rest bar says while it counts (ADR-035)', () => {
  test('T-SPC-UNIT-132 it opens saying what comes next', () => {
    expect(restLine(ninety, NOW + 1_000, 'Sigue con Remo', REST_LINES)).toEqual({
      kind: 'next',
      text: 'Sigue con Remo',
    })
  })

  test('T-SPC-UNIT-133 in the middle of the rest it says something to keep going', () => {
    const middle = restLine(ninety, NOW + 30_000, 'Sigue con Remo', REST_LINES)

    expect(middle.kind).toBe('phrase')
    expect(REST_LINES).toContain(middle.text)
  })

  test('T-SPC-UNIT-134 the same rest keeps the same phrase, so it never flickers', () => {
    const early = restLine(ninety, NOW + 20_000, 'Sigue con Remo', REST_LINES)
    const later = restLine(ninety, NOW + 60_000, 'Sigue con Remo', REST_LINES)

    expect(later.text).toBe(early.text)
  })

  test('T-SPC-UNIT-135 the last seconds go back to what comes next', () => {
    expect(restLine(ninety, NOW + 82_000, 'Sigue con Remo', REST_LINES).kind).toBe('next')
  })

  test('T-SPC-UNIT-136 a rest too short for a phrase only says what comes next', () => {
    const short = started(NOW, 15)

    expect(restLine(short, NOW + 5_000, 'Sigue con Remo', REST_LINES).kind).toBe('next')
  })

  test('T-SPC-UNIT-137 with nothing next to say, the phrase fills the whole rest', () => {
    expect(restLine(ninety, NOW + 1_000, '', REST_LINES).kind).toBe('phrase')
  })
})

describe('the notice when a rest is over (ADR-035)', () => {
  test('T-SPC-UNIT-138 says who is talking and that the rest is over', () => {
    const notice = restEndNotice('Remo con mancuerna', 7, es)

    expect(notice.title).toBe('Allfit Space')
    expect(notice.subtitle).toBe('Descanso terminado ⏱️')
    expect(restEndNotice('Dumbbell row', 7, en).subtitle).toBe('Rest over ⏱️')
  })

  test('T-SPC-UNIT-139 pushes on to the next set, by name when there is one', () => {
    const bodies = GO_LINES.map((_, seed) => restEndNotice('Remo con mancuerna', seed, es).body)

    expect(bodies.every((body) => body.includes('Remo con mancuerna'))).toBe(true)
    expect(new Set(bodies).size).toBe(GO_LINES.length)
    const english = en.pushes.map((_, seed) => restEndNotice('Dumbbell row', seed, en).body)
    expect(english.every((body) => body.includes('Dumbbell row'))).toBe(true)
    expect(new Set(english).size).toBe(en.pushes.length)
  })

  test('T-SPC-UNIT-140 with no name it still pushes, and never leaves a gap', () => {
    const body = restEndNotice('', 3, es).body

    expect(body).not.toContain('{next}')
    expect(body.length).toBeGreaterThan(0)
  })
})

describe('what no line may say (ADR-035)', () => {
  // Read as instructions about the bar or the body, not as encouragement.
  const AMBIGUOUS = /con todo|rompe|a tope|al máximo|al fallo|más peso|sin excusas|dolor|dolió/i

  test('T-SPC-UNIT-141 no phrase talks about load, intensity or pain', () => {
    const every = [...REST_LINES, ...GO_LINES.flat()]

    expect(every.filter((line) => AMBIGUOUS.test(line))).toEqual([])
    const english = [...en.phrases, ...en.pushes.flat()]
    const ambiguous = /all out|max(imum)? out|to failure|more weight|no excuses|pain|hurt/i
    expect(english.filter((line) => ambiguous.test(line))).toEqual([])
  })

  test('T-SPC-UNIT-142 the name never has to agree with a word after it', () => {
    // «{next} no se hace sola» breaks for «Press de banca»: the name ends the clause.
    const named = GO_LINES.map(([line]) => line)

    const agreeing = /\{next\}[^.:]*\b(sol[oa]s?|list[oa]s?|hech[oa]s?|nuev[oa]s?|pesad[oa]s?)\b/
    expect(named.filter((line) => agreeing.test(line))).toEqual([])
    // The guard does see the line it was written for.
    expect(agreeing.test('🚀 Arriba, que {next} no se hace sola.')).toBe(true)
  })
})
