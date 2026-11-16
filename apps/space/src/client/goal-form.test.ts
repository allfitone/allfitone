import { describe, expect, test } from 'bun:test'

import {
  bodyVariant,
  canSubmitGoal,
  CARD_GAP,
  copyInset,
  COPY_FLOOR,
  PAIR_OVERLAP,
  PAIR_OVERLAP_MIN,
  pairLayout,
  singleHeight,
  stageHeight,
  STAGE_CHROME,
  STAGE_MAX,
  STAGE_MIN,
  STRIP_SHARE,
  TRAINING_GOALS,
} from './goal-form'

describe('TRAINING_GOALS', () => {
  test('offers five, because improve_performance is deferred out of the initial launch', () => {
    expect(TRAINING_GOALS).toHaveLength(5)
    expect(TRAINING_GOALS).not.toContain('improve_performance' as never)
  })
})

describe('stageHeight', () => {
  test('takes the canvas measure on a screen that can afford it', () => {
    expect(stageHeight(STAGE_CHROME + STAGE_MAX + 60)).toBe(STAGE_MAX)
  })

  test('gives up height rather than pushing the button off a short screen', () => {
    expect(stageHeight(STAGE_CHROME + 200)).toBe(200)
  })

  test('stops shrinking at the point where a body stops being a body', () => {
    // Por debajo del suelo la pantalla se desplaza, que es mejor que un escenario
    // de cuarenta puntos con una figura recortada dentro.
    expect(stageHeight(400)).toBe(STAGE_MIN)
  })

  test('keeps the gap a constant the screen and the tests agree on', () => {
    expect(CARD_GAP).toBeGreaterThan(0)
  })
})

describe('bodyVariant', () => {
  test('brings the woman for every goal when that is what was declared', () => {
    for (const goal of TRAINING_GOALS) {
      expect(bodyVariant('female', goal)).toBe('female')
    }
  })

  test('brings the man for every goal when that is what was declared', () => {
    for (const goal of TRAINING_GOALS) {
      expect(bodyVariant('male', goal)).toBe('male')
    }
  })

  test('mixes the artwork when the question was declined', () => {
    // A screen where every goal showed one sex would be a statement, and
    // declining is the answer that asks us not to make one.
    const variants = TRAINING_GOALS.map((goal) => bodyVariant(null, goal))

    expect(new Set(variants).size).toBe(2)
  })

  test('keeps the declined mix stable, so the screen does not shuffle between visits', () => {
    expect(TRAINING_GOALS.map((goal) => bodyVariant(null, goal))).toEqual([
      'female',
      'male',
      'female',
      'male',
      'male',
    ])
  })
})

describe('canSubmitGoal', () => {
  test('refuses until something is chosen, because only one goal is principal', () => {
    expect(canSubmitGoal({ goal: undefined, submitting: false, sessionExpired: false })).toBe(false)
  })

  test('allows a chosen goal', () => {
    expect(canSubmitGoal({ goal: 'build_muscle', submitting: false, sessionExpired: false })).toBe(
      true,
    )
  })

  test('refuses while a submission is in flight', () => {
    expect(canSubmitGoal({ goal: 'build_muscle', submitting: true, sessionExpired: false })).toBe(
      false,
    )
  })

  test('refuses once the session is gone, because pressing could only fail', () => {
    expect(canSubmitGoal({ goal: 'build_muscle', submitting: false, sessionExpired: true })).toBe(
      false,
    )
  })
})

describe('pairLayout', () => {
  const STANDING = { before: 0.579, after: 0.626 }
  const RUNNING = { before: 0.84, after: 0.9 }
  const stripWidth = (h: number, overlap: number, aspects: typeof STANDING) =>
    10 + h * (aspects.after * overlap + aspects.before)

  test('lets a standing pair reach the top of the stage, so the chin crop reads as the card', () => {
    // The artwork is cut at the chin on purpose. Sized by the width alone, the pair
    // stopped short of the top and the cut floated in the card like a head sliced off.
    const { height, overlap } = pairLayout(362, 246, STANDING.before, STANDING.after, 10)

    expect(height).toBe(246)
    expect(stripWidth(height, overlap, STANDING)).toBeLessThanOrEqual(362 * STRIP_SHARE + 1e-9)
  })

  test('pulls the figures closer instead of shrinking them when the strip is short', () => {
    const { overlap } = pairLayout(362, 246, STANDING.before, STANDING.after, 10)

    expect(overlap).toBeLessThan(PAIR_OVERLAP)
    expect(overlap).toBeGreaterThanOrEqual(PAIR_OVERLAP_MIN)
  })

  test('keeps the designed spacing when the card has room for it', () => {
    expect(pairLayout(600, 246, STANDING.before, STANDING.after, 10)).toEqual({
      height: 246,
      overlap: PAIR_OVERLAP,
    })
  })

  test('shrinks a wide running pair once the figures cannot get any closer', () => {
    const { height, overlap } = pairLayout(342, 246, RUNNING.before, RUNNING.after, 10)

    expect(overlap).toBe(PAIR_OVERLAP_MIN)
    expect(height).toBeLessThan(246)
    expect(stripWidth(height, overlap, RUNNING)).toBeCloseTo(342 * STRIP_SHARE, 5)
  })

  test('never returns a negative height on a card too small to hold anything', () => {
    expect(pairLayout(10, 246, RUNNING.before, RUNNING.after, 10).height).toBe(0)
  })

  test('answers zero rather than dividing by zero when an aspect is missing', () => {
    expect(pairLayout(362, 246, 0, 0, 10).height).toBe(0)
  })
})

describe('copyInset', () => {
  test('stops the copy where the front figure starts, so no word sits on skin', () => {
    expect(copyInset(362, 154, 10, 10)).toBe(174)
  })

  test('never squeezes the copy below its floor when the figure is narrow', () => {
    expect(copyInset(362, 40, 10, 10)).toBe(362 * COPY_FLOOR)
  })
})

describe('singleHeight', () => {
  const STANDING = 0.564

  test('lets the lone standing figure reach the top of the stage, so the crop reads as the card', () => {
    // The artwork is cut at the chin on purpose. Short of the top, the cut floats
    // in the card and reads as a head sliced off.
    expect(singleHeight(342, 240, STANDING, 10)).toBe(240)
  })

  test('shrinks a figure too wide for the strip instead of covering the copy', () => {
    const height = singleHeight(342, 240, 2, 10)

    expect(height).toBeLessThan(240)
    expect(10 + height * 2).toBeCloseTo(342 * STRIP_SHARE, 5)
  })

  test('answers zero rather than dividing by zero when the aspect is missing', () => {
    expect(singleHeight(342, 240, 0, 10)).toBe(0)
  })
})
