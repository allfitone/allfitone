import { describe, expect, test } from 'bun:test'

import {
  GOAL_NUTRIENTS,
  amountCaption,
  draftFields,
  draftMode,
  emptyProposalDraft,
  replacesLine,
  guidanceLevel,
  holdsNutritionCredential,
  canGuideNutrition,
  pendingProposal,
  proposalBlockers,
  proposalBody,
  proposalProblems,
  proposalRefusal,
  type ProposalDraft,
} from './nutrition-goal-proposal'
import type { ClientCardSection, OrganizationRole, ProfessionalCredential } from './studio-api'

function draft(change: (next: ProposalDraft) => void): ProposalDraft {
  const next = emptyProposalDraft()
  change(next)
  return next
}

const reasoned = (next: ProposalDraft) => {
  next.rationale = 'Para el bloque de fuerza.'
}

describe('HU-071: six nutrients, each with its fixed unit', () => {
  test('the six the contract closes, energy and the macros first', () => {
    expect(GOAL_NUTRIENTS.map((nutrient) => `${nutrient.code} ${nutrient.unit}`)).toEqual([
      'energy kcal',
      'protein g',
      'carbohydrates g',
      'fat g',
      'fiber g',
      'water ml',
    ])
  })

  test('a fresh form has no target and no reason', () => {
    const fresh = emptyProposalDraft()
    expect(Object.values(fresh.targets).every((target) => target.mode === 'none')).toBe(true)
    expect(fresh.rationale).toBe('')
  })
})

describe('what the form refuses before anything is sent', () => {
  test('a valid proposal has no problems', () => {
    const valid = draft((next) => {
      reasoned(next)
      next.targets.protein = { mode: 'minimum', low: '140', high: '' }
    })
    expect(proposalProblems(valid)).toBeNull()
  })

  test('at least one nutrient, and a reason', () => {
    expect(proposalProblems(emptyProposalDraft())).toEqual({
      noTargets: true,
      targets: {},
      rationale: 'missing',
    })
  })

  test('criterion 3: a reason that is only spaces is no reason', () => {
    const blank = draft((next) => {
      next.rationale = '   \n '
      next.targets.fat = { mode: 'maximum', low: '', high: '70' }
    })
    expect(proposalProblems(blank)?.rationale).toBe('missing')
  })

  test('criterion 3: at most two thousand characters', () => {
    const long = draft((next) => {
      next.rationale = 'a'.repeat(2001)
      next.targets.fat = { mode: 'maximum', low: '', high: '70' }
    })
    expect(proposalProblems(long)?.rationale).toBe('too-long')
  })

  test('a chosen mode needs its value, as a plain number of at least zero', () => {
    const wrong = draft((next) => {
      reasoned(next)
      next.targets.energy = { mode: 'exact', low: '', high: '' }
      next.targets.protein = { mode: 'minimum', low: '140 g', high: '' }
      next.targets.water = { mode: 'maximum', low: '', high: '-1' }
    })
    expect(proposalProblems(wrong)?.targets).toEqual({
      energy: 'missing',
      protein: 'invalid',
      water: 'invalid',
    })
  })

  test('a range needs both ends, the low one first', () => {
    const wrong = draft((next) => {
      reasoned(next)
      next.targets.energy = { mode: 'range', low: '2400', high: '2100' }
      next.targets.carbohydrates = { mode: 'range', low: '200', high: '' }
    })
    expect(proposalProblems(wrong)?.targets).toEqual({
      energy: 'reversed',
      carbohydrates: 'missing',
    })
  })

  test('a decimal comma reads as the decimal it is', () => {
    const decimal = draft((next) => {
      reasoned(next)
      next.targets.fiber = { mode: 'minimum', low: '25,5', high: '' }
    })
    expect(proposalProblems(decimal)).toBeNull()
  })
})

describe('the body the contract takes', () => {
  test('the six keys always present, the unused ones null', () => {
    const full = draft((next) => {
      next.rationale = '  Para el bloque de fuerza.  '
      next.targets.energy = { mode: 'range', low: '2100', high: '2400' }
      next.targets.protein = { mode: 'minimum', low: '140', high: '' }
      next.targets.fat = { mode: 'maximum', low: '', high: '70' }
      next.targets.water = { mode: 'exact', low: '2500', high: '' }
    })
    expect(proposalBody(full)).toEqual({
      rationale: 'Para el bloque de fuerza.',
      targets: [
        {
          nutrient_code: 'energy',
          mode: 'range',
          minimum: 2100,
          maximum: 2400,
          exact: null,
          unit: 'kcal',
        },
        {
          nutrient_code: 'protein',
          mode: 'minimum',
          minimum: 140,
          maximum: null,
          exact: null,
          unit: 'g',
        },
        {
          nutrient_code: 'fat',
          mode: 'maximum',
          minimum: null,
          maximum: 70,
          exact: null,
          unit: 'g',
        },
        {
          nutrient_code: 'water',
          mode: 'exact',
          minimum: null,
          maximum: null,
          exact: 2500,
          unit: 'ml',
        },
      ],
    })
  })
})

function role(
  code: OrganizationRole['code'],
  capabilities: OrganizationRole['capabilities'][number]['code'][],
): OrganizationRole {
  return {
    code,
    name: code,
    capabilities: capabilities.map((capability) => ({ code: capability, name: capability })),
    fitness_data_access_policy: 'requires_relationship_assignment_and_grant',
  }
}

function credential(type: string, effective: boolean): ProfessionalCredential {
  return {
    id: '01991600-3000-7000-8000-000000000009',
    credential_type_code: type,
    credential_type_name: type,
    issuer: 'Colegio',
    name: 'Nutricionista',
    identifier: null,
    issued_on: null,
    expires_on: null,
    verification_url: null,
    status: 'active',
    supersedes_credential_id: null,
    created_at: '2026-01-01T00:00:00Z',
    retired_at: null,
    verification: {
      state: effective ? 'verified' : 'unverified',
      valid_from: null,
      valid_to: null,
      effective,
    },
  }
}

function section(level: 'read' | 'contribute'): ClientCardSection {
  return {
    scope_code: 'nutrition_guidance',
    scope_version: 1,
    access_level: level,
    granted_at: '2026-03-01T10:00:00Z',
    reads: ['listAuthorizedClientNutritionGoalVersions'],
  }
}

describe('criterion 1: the three conditions Studio can see before sending', () => {
  test('the capability, read from the role catalogue', () => {
    const catalog = [role('coach', ['guide_nutrition']), role('staff', ['invite'])]
    expect(canGuideNutrition(['coach'], catalog)).toBe(true)
    expect(canGuideNutrition(['staff'], catalog)).toBe(false)
    expect(canGuideNutrition(['coach'], undefined)).toBe(false)
  })

  test('a nutrition credential that counts today, and no other kind', () => {
    expect(holdsNutritionCredential([credential('nutrition_professional', true)])).toBe(true)
    expect(holdsNutritionCredential([credential('nutrition_professional', false)])).toBe(false)
    expect(holdsNutritionCredential([credential('professional_certification', true)])).toBe(false)
    expect(holdsNutritionCredential(undefined)).toBe(false)
  })

  test('her guidance, at the level she shares it', () => {
    expect(guidanceLevel([section('contribute')])).toBe('contribute')
    expect(guidanceLevel([section('read')])).toBe('read')
    expect(guidanceLevel([])).toBeNull()
  })

  test('says each condition missing, and none when all three hold', () => {
    expect(proposalBlockers({ canGuide: true, credential: true, level: 'contribute' })).toEqual([])
    expect(proposalBlockers({ canGuide: false, credential: false, level: 'read' })).toEqual([
      'role',
      'credential',
      'scope',
    ])
    expect(proposalBlockers({ canGuide: true, credential: true, level: null })).toEqual(['scope'])
  })
})

describe('criterion 4: the proposal still waiting on her', () => {
  test('is the one a new proposal replaces', () => {
    const waiting = { id: 'a', status: 'proposed' } as const
    const followed = { id: 'b', status: 'active' } as const
    expect(pendingProposal([waiting, followed])).toEqual(waiting)
    expect(pendingProposal([followed])).toBeNull()
  })

  test('is said before sending, with the day it was made', () => {
    const line = replacesLine('2026-07-20T15:00:00Z')
    expect(line).toStartWith('La propuesta del ')
    expect(line).toContain('2026')
    expect(line).toEndWith('queda reemplazada y ella ya no podrá aceptarla.')
  })
})

describe('the fields each mode asks for', () => {
  test('a range asks for both ends; the others for one value', () => {
    expect(draftFields('range')).toEqual(['low', 'high'])
    expect(draftFields('minimum')).toEqual(['low'])
    expect(draftFields('exact')).toEqual(['low'])
    expect(draftFields('maximum')).toEqual(['high'])
    expect(draftFields('none')).toEqual([])
  })

  test('each field is named by what it holds', () => {
    expect(amountCaption('range', 'low')).toBe('desde')
    expect(amountCaption('range', 'high')).toBe('hasta')
    expect(amountCaption('minimum', 'low')).toBe('al menos')
    expect(amountCaption('maximum', 'high')).toBe('como máximo')
    expect(amountCaption('exact', 'low')).toBe('exactamente')
  })

  test('a value the select does not offer reads as no target', () => {
    expect(draftMode('range')).toBe('range')
    expect(draftMode('menu')).toBe('none')
    expect(draftMode(null)).toBe('none')
  })
})

describe('what a refusal means, in words the reader can act on', () => {
  test('the three refusals of criterion 1 are three different things', () => {
    expect(proposalRefusal(403, 'forbidden')).toBe('role')
    expect(proposalRefusal(403, 'credential-required')).toBe('credential')
    expect(proposalRefusal(403, 'scope-required')).toBe('scope')
  })

  test('a paused service, a client no longer attended, and invalid targets', () => {
    expect(proposalRefusal(409, 'service-paused')).toBe('paused')
    expect(proposalRefusal(404, 'not-found')).toBe('gone')
    expect(proposalRefusal(422, 'validation-failed')).toBe('invalid')
  })

  test('criterion 7: anything else is a connection to try again', () => {
    expect(proposalRefusal(503, 'upstream-unavailable')).toBe('retry')
    expect(proposalRefusal(409, 'idempotency-in-progress')).toBe('retry')
    expect(proposalRefusal(undefined, undefined)).toBe('retry')
  })
})
