import { describe, expect, test } from 'bun:test'

import {
  closeConsequences,
  closeFailure,
  closeOutcome,
  closeTitle,
  closedReasonLine,
} from './historical-close'
import type { HistoricalAccessCase } from './studio-api'

const ADA = { membership_id: 'membership-me', given_name: 'Ada', family_name: 'Lovelace' }
const DIANA = { membership_id: 'membership-diana', given_name: 'Diana', family_name: 'Entrante' }

function aCase(overrides: Partial<HistoricalAccessCase> = {}): HistoricalAccessCase {
  return {
    id: 'case-1',
    organization_id: 'org-1',
    relationship_id: 'rel-1',
    person: { id: 'person-1', given_name: 'Bruno', family_name: 'Bello' },
    cut_at: '2025-06-30T22:41:19.204Z',
    authorized: DIANA,
    opened_by: ADA,
    purpose: 'service_dispute',
    case_reference: 'RAD-2026-114',
    justification: 'Reclamo formal.',
    status: 'open',
    opened_at: '2026-11-12T14:00:00.000Z',
    expires_at: '2026-11-12T18:00:00.000Z',
    closed_at: null,
    closed_reason: null,
    closed_by: null,
    ...overrides,
  }
}

const closedByAda = aCase({
  status: 'closed',
  closed_reason: 'closed_by_manager',
  closed_at: '2026-11-12T15:00:00.000Z',
  closed_by: ADA,
})

describe('the question before closing', () => {
  test('names whose history the case reads', () => {
    expect(closeTitle(aCase())).toBe('¿Cerrar el caso sobre Bruno Bello?')
  })

  test('criterion 2: closing deletes no record of access', () => {
    expect(closeConsequences(aCase()).join(' ')).toContain('No se borra ningún registro')
  })

  test('criterion 3: a closed case does not reopen, a new one needs its own justification', () => {
    const said = closeConsequences(aCase()).join(' ')
    expect(said).toContain('no se reabre')
    expect(said).toContain('su propia justificación')
  })

  test('criterion 1: it would stop serving on its own anyway, and says when', () => {
    expect(closeConsequences(aCase()).join(' ')).toContain('deja de servir solo el ')
  })
})

describe('why a case is closed', () => {
  test('closed by a manager names who closed it', () => {
    expect(closedReasonLine(closedByAda)).toBe('Lo cerró Ada Lovelace.')
  })

  test('criterion 1: the deadline is not an error, it is the deadline', () => {
    expect(closedReasonLine(aCase({ status: 'expired' }))).toBe(
      'Se cumplió el plazo: ya no deja consultar nada.',
    )
    expect(closedReasonLine(aCase({ status: 'closed', closed_reason: 'expired' }))).toBe(
      'Se cumplió el plazo: ya no deja consultar nada.',
    )
  })

  test('closed because she took the frozen permission back', () => {
    expect(closedReasonLine(aCase({ status: 'closed', closed_reason: 'grant_revoked' }))).toBe(
      'Se cerró porque la persona retiró el permiso congelado.',
    )
  })

  test('closed because the member it named stopped qualifying', () => {
    expect(
      closedReasonLine(aCase({ status: 'closed', closed_reason: 'membership_ineligible' })),
    ).toBe('Se cerró porque Diana Entrante dejó de poder recibirlo.')
  })

  test('an open case has no reason to give', () => {
    expect(closedReasonLine(aCase())).toBeNull()
  })
})

describe('what closing answered', () => {
  test('closed now', () => {
    expect(closeOutcome(closedByAda)).toBe(
      'Cerraste el caso sobre Bruno Bello. Ya no deja consultar nada.',
    )
  })

  test('its time ran out first, so it closed as expired', () => {
    expect(closeOutcome(aCase({ status: 'closed', closed_reason: 'expired' }))).toBe(
      'El caso sobre Bruno Bello ya había vencido: se cerró por plazo.',
    )
  })

  test('says each refusal', () => {
    expect(closeFailure(403)).toContain('Tu rol')
    expect(closeFailure(404)).toContain('ya no existe')
    expect(closeFailure(503)).toContain('Inténtalo de nuevo')
  })
})
