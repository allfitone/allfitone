import { describe, expect, test } from 'bun:test'

import {
  HISTORICAL_DURATIONS,
  HISTORICAL_PURPOSES,
  authorizationChoices,
  canManageHistoricalAccess,
  caseDraftProblems,
  caseState,
  caseStateLabel,
  caseWindowLine,
  durationLabel,
  emptyCaseDraft,
  formerHolder,
  memberName,
  openCaseFailure,
  openCaseRequest,
  purposeLabel,
  type CaseDraft,
} from './historical-access'
import type { HistoricalAccessCase, OrganizationRole, RelationshipHistoryEvent } from './studio-api'

function catalog(capabilities: string[]): OrganizationRole[] {
  return [
    {
      code: 'owner',
      name: 'Propietario',
      capabilities: capabilities.map((code) => ({ code, name: code })),
    },
  ] as OrganizationRole[]
}

const CUT = '2026-09-28T16:00:00.000Z'

function event(
  type: RelationshipHistoryEvent['type'],
  occurred_at: string,
  detail: Record<string, unknown>,
): RelationshipHistoryEvent {
  return { type, occurred_at, source_id: '01991600-7000-7000-8000-000000000301', detail }
}

function complete(overrides: Partial<CaseDraft> = {}): CaseDraft {
  return {
    relationship: { id: 'rel-1', name: 'Bruno Bello', endedAt: CUT },
    authorized: 'membership-me',
    purpose: 'service_dispute',
    reference: '  RAD-2026-114  ',
    justification: '  Reclamo formal por cobro de octubre.  ',
    hours: 4,
    ...overrides,
  }
}

function aCase(overrides: Partial<HistoricalAccessCase> = {}): HistoricalAccessCase {
  return {
    id: 'case-1',
    organization_id: 'org-1',
    relationship_id: 'rel-1',
    person: { id: 'person-1', given_name: 'Bruno', family_name: 'Bello' },
    cut_at: CUT,
    authorized: { membership_id: 'membership-me', given_name: 'Ada', family_name: 'Lovelace' },
    opened_by: { membership_id: 'membership-me', given_name: 'Ada', family_name: 'Lovelace' },
    purpose: 'service_dispute',
    case_reference: 'RAD-2026-114',
    justification: 'Reclamo formal por cobro de octubre.',
    status: 'open',
    opened_at: '2026-11-12T14:00:00.000Z',
    expires_at: '2026-11-12T18:00:00.000Z',
    closed_at: null,
    closed_reason: null,
    closed_by: null,
    ...overrides,
  }
}

describe('who may open a case', () => {
  test('reads manage_historical_access from the published catalogue', () => {
    expect(canManageHistoricalAccess(['owner'], catalog(['manage_historical_access']))).toBe(true)
  })

  test('says no without the capability, and without a catalogue to read it from', () => {
    expect(canManageHistoricalAccess(['owner'], catalog(['manage_billing']))).toBe(false)
    expect(canManageHistoricalAccess(['owner'], undefined)).toBe(false)
    expect(canManageHistoricalAccess(['owner'], [])).toBe(false)
  })
})

describe('HU-061 criteria 2 and 3: a purpose from a closed list', () => {
  test('offers exactly the five purposes the contract accepts', () => {
    expect(HISTORICAL_PURPOSES.map((purpose) => purpose.value)).toEqual([
      'service_dispute',
      'legal_or_regulatory_obligation',
      'customer_support_request',
      'security_investigation',
      'authorized_quality_review',
    ])
  })

  test('never names an invalid purpose, not even as an example', () => {
    const words = HISTORICAL_PURPOSES.flatMap((purpose) => [purpose.label, purpose.hint])
      .join(' ')
      .toLowerCase()
    for (const invalid of [
      'marketing',
      'comercial',
      'inteligencia artificial',
      ' ia ',
      'curiosidad',
    ]) {
      expect(words).not.toContain(invalid)
    }
  })

  test('labels a purpose by its code', () => {
    expect(purposeLabel('legal_or_regulatory_obligation')).toBe('Obligación legal o regulatoria')
  })
})

describe('HU-061 criterion 4: from one to twenty-four hours, and one has to be chosen', () => {
  test('offers every whole hour from 1 to 24', () => {
    expect(HISTORICAL_DURATIONS[0]).toBe(1)
    expect(HISTORICAL_DURATIONS.at(-1)).toBe(24)
    expect(HISTORICAL_DURATIONS).toHaveLength(24)
  })

  test('chooses none for the person', () => {
    expect(emptyCaseDraft().hours).toBeNull()
    expect(caseDraftProblems(complete({ hours: null })).hours).toBe(
      'Elige cuántas horas dura el caso.',
    )
  })

  test('says one hour in the singular', () => {
    expect(durationLabel(1)).toBe('1 hora')
    expect(durationLabel(24)).toBe('24 horas')
  })
})

describe('HU-061 criterion 5: one membership, the opener or the coach who held her at the end', () => {
  const handover = [
    event('relationship_ended', CUT, { ended_by_kind: 'person' }),
    event('holder_ended', CUT, {
      membership_id: 'membership-diana',
      display_name: 'Diana Entrante',
    }),
    event('holder_assigned', '2026-09-20T09:00:00.000Z', {
      membership_id: 'membership-diana',
      display_name: 'Diana Entrante',
    }),
    event('holder_ended', '2026-09-20T09:00:00.000Z', {
      membership_id: 'membership-camilo',
      display_name: 'Camilo Saliente',
    }),
  ]

  test('finds the coach whose assignment ended at the cut', () => {
    expect(formerHolder(handover, CUT)).toEqual({
      membershipId: 'membership-diana',
      name: 'Diana Entrante',
    })
  })

  test('ignores a coach replaced before the end', () => {
    expect(formerHolder(handover.slice(2), CUT)).toBeNull()
  })

  test('compares instants, not spellings', () => {
    expect(formerHolder(handover, '2026-09-28T11:00:00-05:00')?.membershipId).toBe(
      'membership-diana',
    )
  })

  test('finds nobody when nobody attended her', () => {
    expect(formerHolder([event('relationship_ended', CUT, {})], CUT)).toBeNull()
  })

  test('offers the opener and that coach', () => {
    expect(
      authorizationChoices('membership-me', {
        membershipId: 'membership-diana',
        name: 'Diana Entrante',
      }).map((choice) => choice.value),
    ).toEqual(['membership-me', 'membership-diana'])
  })

  test('offers the opener once when the opener was her coach', () => {
    expect(
      authorizationChoices('membership-me', { membershipId: 'membership-me', name: 'Ada' }),
    ).toHaveLength(1)
  })

  test('offers only the opener when nobody held her', () => {
    expect(authorizationChoices('membership-me', null)).toHaveLength(1)
  })
})

describe('what the form still needs', () => {
  test('a complete draft has nothing to say', () => {
    expect(caseDraftProblems(complete())).toEqual({})
  })

  test('names each missing answer', () => {
    const problems = caseDraftProblems(emptyCaseDraft())
    expect(Object.keys(problems).sort()).toEqual([
      'authorized',
      'hours',
      'justification',
      'purpose',
      'reference',
      'relationship',
    ])
  })

  test('spaces alone are no reference and no justification', () => {
    const problems = caseDraftProblems(complete({ reference: '   ', justification: '\n ' }))
    expect(problems.reference).toBeDefined()
    expect(problems.justification).toBeDefined()
  })

  test('holds the contract lengths', () => {
    expect(caseDraftProblems(complete({ reference: 'x'.repeat(121) })).reference).toBeDefined()
    expect(caseDraftProblems(complete({ reference: 'x'.repeat(120) })).reference).toBeUndefined()
    expect(
      caseDraftProblems(complete({ justification: 'x'.repeat(2001) })).justification,
    ).toBeDefined()
  })

  test('sends what was written, trimmed', () => {
    expect(openCaseRequest(complete())).toEqual({
      relationship_id: 'rel-1',
      authorized_membership_id: 'membership-me',
      purpose: 'service_dispute',
      case_reference: 'RAD-2026-114',
      justification: 'Reclamo formal por cobro de octubre.',
      duration_hours: 4,
    })
  })

  test('sends nothing while an answer is missing', () => {
    expect(openCaseRequest(complete({ purpose: null }))).toBeNull()
  })
})

describe('HU-061 criterion 6 and the refusals the screen has to say', () => {
  test('an old sign-in asks to sign in again instead of failing', () => {
    expect(openCaseFailure(403, 'reauthentication-required')).toEqual({ kind: 'reauthenticate' })
  })

  test('a 409 names both causes, because the answer does not say which', () => {
    const failure = openCaseFailure(409, 'conflict')
    expect(failure.kind).toBe('message')
    if (failure.kind !== 'message') return
    expect(failure.text).toContain('ningún permiso congelado')
    expect(failure.text).toContain('ya hay un caso abierto')
  })

  test('a 422 says the person chosen no longer qualifies, and that staff never does', () => {
    const failure = openCaseFailure(422, 'validation-failed')
    if (failure.kind !== 'message') throw new Error('expected a message')
    expect(failure.text).toContain('propietario, administración o coach')
  })

  test('a 404 says the ended relationship was not found', () => {
    const failure = openCaseFailure(404, 'not-found')
    if (failure.kind !== 'message') throw new Error('expected a message')
    expect(failure.text).toContain('relación terminada')
  })

  test('a plain 403 is the role, not the sign-in', () => {
    const failure = openCaseFailure(403, 'forbidden')
    if (failure.kind !== 'message') throw new Error('expected a message')
    expect(failure.text).toContain('Tu rol')
  })

  test('anything else is worth another try', () => {
    const failure = openCaseFailure(503, 'upstream-unavailable')
    if (failure.kind !== 'message') throw new Error('expected a message')
    expect(failure.text).toContain('Inténtalo de nuevo')
  })
})

describe('where a case stands', () => {
  test('an open case is open', () => {
    expect(caseState(aCase())).toBe('open')
  })

  test('a case whose time ran out is expired, closed by the deadline or not', () => {
    expect(caseState(aCase({ status: 'expired' }))).toBe('expired')
    expect(caseState(aCase({ status: 'closed', closed_reason: 'expired' }))).toBe('expired')
  })

  test('any other close is closed', () => {
    expect(caseState(aCase({ status: 'closed', closed_reason: 'closed_by_manager' }))).toBe(
      'closed',
    )
    expect(caseState(aCase({ status: 'closed', closed_reason: 'grant_revoked' }))).toBe('closed')
  })

  test('names the three states', () => {
    expect(caseStateLabel('open')).toBe('Abierto')
    expect(caseStateLabel('expired')).toBe('Vencido')
    expect(caseStateLabel('closed')).toBe('Cerrado')
  })

  test('says when its window ends or ended', () => {
    expect(caseWindowLine(aCase())).toStartWith('Vence el ')
    expect(caseWindowLine(aCase({ status: 'expired' }))).toStartWith('Venció el ')
    expect(
      caseWindowLine(
        aCase({ status: 'closed', closed_reason: 'expired', closed_at: '2026-11-12T18:00:00Z' }),
      ),
    ).toStartWith('Venció el ')
    expect(
      caseWindowLine(
        aCase({
          status: 'closed',
          closed_reason: 'closed_by_manager',
          closed_at: '2026-11-12T15:00:00Z',
        }),
      ),
    ).toStartWith('Se cerró el ')
  })

  test('names a member, or the person, by both names', () => {
    expect(memberName(aCase().authorized)).toBe('Ada Lovelace')
    expect(memberName(aCase().person)).toBe('Bruno Bello')
  })
})
