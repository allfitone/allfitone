import { describe, expect, test } from 'bun:test'

import {
  changeLine,
  changeTone,
  estimateLine,
  kilos,
  movementIsUnnamed,
  movementName,
  musclesLine,
  nothingTrained,
  periodLabel,
  trainedTimeLine,
  volumeLine,
} from './client-progress'
import type { ClientProgressPeriod, SpacePeriodMuscle } from './studio-api'

function period(partial: Partial<ClientProgressPeriod>): ClientProgressPeriod {
  return {
    starts_on: '2026-11-02',
    ends_before: '2026-11-09',
    sessions: 3,
    trained_seconds: 9000,
    work_sets: 42,
    volume_kg: 5400,
    muscles: [],
    ...partial,
  } as ClientProgressPeriod
}

function muscle(name: string, sets: number): SpacePeriodMuscle {
  return { code: name.toLowerCase(), name, sets } as SpacePeriodMuscle
}

/*
 * These assert digits and words, never the whole string: bun and the browser
 * ship different ICU data, so the same options read «7 sept» under one and
 * «7 de sept» under the other. What a person sees is asserted end to end.
 */
describe('what a period is called', () => {
  /*
   * `ends_before` is exclusive, so a week that starts on the 2nd and ends before
   * the 9th is the 2nd to the 8th. Showing the 9th would claim a day she is not
   * being reported on.
   */
  test('a week says the days it covers, and the last one is not ends_before', () => {
    expect(periodLabel('week', period({}))).toContain('2')
    expect(periodLabel('week', period({}))).toContain('8')
    expect(periodLabel('week', period({}))).not.toContain('9')
  })

  test('a month says its name and its year', () => {
    const label = periodLabel(
      'month',
      period({ starts_on: '2026-11-01', ends_before: '2026-12-01' }),
    )
    expect(label).toContain('noviembre')
    expect(label).toContain('2026')
  })

  /*
   * A calendar day read as an instant lands on the day before anywhere west of
   * Greenwich — the same defect `calendar-day.ts` exists to avoid.
   */
  test('the first of a month keeps its month', () => {
    expect(
      periodLabel('month', period({ starts_on: '2026-03-01', ends_before: '2026-04-01' })),
    ).toContain('marzo')
  })

  test('a day that is not a day is handed back rather than guessed', () => {
    expect(periodLabel('week', period({ starts_on: 'pronto' }))).toBe('pronto')
  })
})

describe('time trained', () => {
  test('under an hour, in minutes', () => {
    expect(trainedTimeLine(2400)).toBe('40 min')
  })

  test('over an hour, in hours and minutes', () => {
    expect(trainedTimeLine(9000)).toBe('2 h 30 min')
  })

  test('a round hour says no minutes', () => {
    expect(trainedTimeLine(3600)).toBe('1 h')
  })

  /* A period with no time recorded says nothing, not «0 min». */
  test('nothing recorded is nothing said', () => {
    expect(trainedTimeLine(0)).toBeNull()
  })
})

/*
 * Criterion 2, and the place the contract makes it concrete: `volume_kg` is null
 * «when nothing in the period was weighed». A zero would say she lifted nothing
 * in a week she trained every day.
 */
describe('volume lifted in a period', () => {
  test('a figure reads in kilos', () => {
    expect(volumeLine(5400)).toBe('5.400 kg')
  })

  test('nothing weighed is absent, never zero', () => {
    expect(volumeLine(null)).toBeNull()
  })

  test('and a real zero is still a figure, because the server computed it', () => {
    expect(volumeLine(0)).toBe('0 kg')
  })
})

describe('a movement she alone can name', () => {
  /*
   * Criterion 4. The row stays because the figures counted it; dropping it would
   * change them, and inventing a name would read something she did not share.
   */
  test('is named as that, not dropped and not invented', () => {
    expect(movementName(null)).toBe('Un movimiento que solo ella nombra')
    expect(movementIsUnnamed(null)).toBe(true)
  })

  test('and one with a name keeps it', () => {
    expect(movementName('Sentadilla trasera')).toBe('Sentadilla trasera')
    expect(movementIsUnnamed('Sentadilla trasera')).toBe(false)
  })
})

describe('how a best moved', () => {
  test('up and down carry their sign', () => {
    expect(changeLine(5)).toBe('+5 kg')
    expect(changeLine(-2.5)).toBe('−2,5 kg')
  })

  /*
   * No earlier figure is not «held steady». Saying «+0 kg» would claim a
   * comparison that was never made.
   */
  test('nothing to compare against says nothing', () => {
    expect(changeLine(null)).toBeNull()
    expect(changeTone(null)).toBe('secondary')
  })

  test('an unchanged best says nothing either, and reads as neutral', () => {
    expect(changeLine(0)).toBeNull()
    expect(changeTone(0)).toBe('secondary')
  })

  test('the tone follows the direction', () => {
    expect(changeTone(5)).toBe('success')
    expect(changeTone(-5)).toBe('warning')
  })
})

describe('the estimated maximum', () => {
  test('reads in kilos when the window had a set to estimate from', () => {
    expect(estimateLine(102.5)).toBe('102,5 kg')
  })

  /* Out of the formula's range is no estimate, not a rounded one. */
  test('and says nothing when it had none', () => {
    expect(estimateLine(null)).toBeNull()
  })
})

describe('where the work sets fell', () => {
  test('heaviest first, as the server answered them, with a count each', () => {
    expect(musclesLine([muscle('Pecho', 12), muscle('Espalda', 9)])).toBe('Pecho 12 · Espalda 9')
  })

  /*
   * Only the heaviest few are named and the rest are counted, never added up:
   * a total of its own would be a figure the server did not compute.
   */
  test('past the first few it counts the rest instead of listing them', () => {
    const line = musclesLine([
      muscle('Pecho', 12),
      muscle('Espalda', 9),
      muscle('Piernas', 8),
      muscle('Hombros', 4),
      muscle('Brazos', 2),
    ])
    expect(line).toBe('Pecho 12 · Espalda 9 · Piernas 8 · y 2 más')
  })

  test('no muscles is nothing said', () => {
    expect(musclesLine([])).toBeNull()
  })
})

describe('a window with no training in it', () => {
  /*
   * Twelve rows of zeros read as a broken screen. The screen says it once
   * instead, and that is true whether she trained nothing or shared nothing —
   * which it cannot tell apart either way.
   */
  test('is recognised so the screen can say it once', () => {
    expect(nothingTrained([period({ sessions: 0 }), period({ sessions: 0 })])).toBe(true)
  })

  test('and one session anywhere is enough to draw the periods', () => {
    expect(nothingTrained([period({ sessions: 0 }), period({ sessions: 1 })])).toBe(false)
  })
})

describe('kilos', () => {
  test('at most one decimal, and no trailing zero', () => {
    expect(kilos(80)).toBe('80 kg')
    expect(kilos(82.5)).toBe('82,5 kg')
    expect(kilos(82.55)).toBe('82,6 kg')
  })
})
