/**
 * What has to be true about the discipline now that nobody is asked for it.
 *
 * Strength is the only discipline Allfit covers today, so the onboarding no longer
 * shows the carousel (TECH-47). The goal list still depends on the discipline, and
 * with nothing declared it has to be strength's list, not every goal there is.
 */

import { describe, expect, test } from 'bun:test'

import { DEFAULT_DISCIPLINE, goalsFor } from './discipline-form'
import { TRAINING_GOALS } from './goal-form'

describe('the discipline nobody is asked for', () => {
  test('T-SP-DISC-15 is strength', () => {
    expect(DEFAULT_DISCIPLINE).toBe('strength')
  })
})

describe('the goal depends on the discipline', () => {
  test('T-SP-DISC-11 strength drops running a race and keeps the rest', () => {
    // Strength training does not chase a race, and offering it would promise a plan
    // this discipline is never going to write.
    expect(goalsFor(TRAINING_GOALS, 'strength')).toEqual([
      'lose_weight',
      'build_muscle',
      'get_fit',
      'maintain',
    ])
  })

  test('T-SP-DISC-13 an undeclared discipline offers strength goals, not the whole list', () => {
    // Nobody declares one any more, so the default is what everybody gets.
    expect(goalsFor(TRAINING_GOALS)).toEqual(goalsFor(TRAINING_GOALS, 'strength'))
    expect(goalsFor(TRAINING_GOALS)).not.toContain('run_a_race')
  })
})
