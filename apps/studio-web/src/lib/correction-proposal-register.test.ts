import { describe, expect, test } from 'bun:test'

import {
  PROPOSAL_FILTERS,
  proposalCancelNote,
  proposalEmptyNote,
  proposalFilterLabel,
  proposalRegisterFailure,
  proposalSessionTarget,
  proposalStatusLabel,
  proposalStatusNote,
  proposalStatusTone,
  proposalUnreachableNote,
} from './correction-proposal-register.js'
import type { CorrectionProposalStatus, ProposedCorrection } from './studio-api.js'

const EXECUTION = '01991600-7000-7000-8000-0000000000c1'

function proposal(overrides: Partial<ProposedCorrection> = {}): ProposedCorrection {
  return {
    id: '01991600-7000-7000-8000-0000000000e1',
    client: { person_id: '01991600-7000-7000-8000-0000000000a1', name: 'Camila Cliente' },
    target: { execution_id: EXECUTION, set_order: 2 },
    field: 'load',
    proposed: { value: 62.5, unit: 'kg' },
    reason: 'La barra pesaba 2,5 kg más de lo anotado.',
    status: 'pending',
    cancel_reason: null,
    created_at: '2026-11-17T15:00:00.000Z',
    expires_at: '2026-12-17T15:00:00.000Z',
    settled_at: null,
    ...overrides,
  } as ProposedCorrection
}

const STATES: readonly CorrectionProposalStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
]

describe('cada estado tiene su palabra y su tono', () => {
  test('los cinco estados del contrato están nombrados', () => {
    for (const status of STATES) {
      expect(proposalStatusLabel(status).length).toBeGreaterThan(0)
      expect(proposalStatusNote(status).length).toBeGreaterThan(0)
    }
  })

  test('el tono separa lo que espera de lo que ya se resolvió', () => {
    expect(proposalStatusTone('pending')).toBe('waiting')
    expect(proposalStatusTone('accepted')).toBe('done')
    expect(proposalStatusTone('rejected')).toBe('refused')
    expect(proposalStatusTone('expired')).toBe('lapsed')
    expect(proposalStatusTone('cancelled')).toBe('lapsed')
  })

  /* Criterio 3: si acepta, el dato sigue siendo de ella. */
  test('la aceptada dice que el valor sigue siendo suyo', () => {
    const note = proposalStatusNote('accepted')
    expect(note).toContain('sigue siendo suyo')
    expect(note).toContain('quien lo propuso')
    expect(note).not.toContain('tu dato')
  })

  /* Vencer y rechazar están a un clic de distancia y no son lo mismo. */
  test('vencida dice que vencer no es un no de ella', () => {
    expect(proposalStatusNote('expired')).toContain('no es un «no» suyo')
    expect(proposalStatusNote('rejected')).toContain('su decisión')
  })

  test('esperando no afirma que su dato ya cambió', () => {
    expect(proposalStatusNote('pending')).toContain('sigue como está')
  })
})

describe('por qué dejó de esperar una cancelada', () => {
  /* Criterio 2: la que cancela el fin del vínculo se lee como cancelada. */
  test('el fin del vínculo se nombra', () => {
    expect(proposalCancelNote('relationship_terminated')).toContain('vínculo con ella terminó')
  })

  test('su propia corrección se nombra', () => {
    expect(proposalCancelNote('target_changed')).toContain('Ella misma corrigió')
  })

  /*
   * El contrato colapsa anulada y oculta a propósito. Las tres formas caen en
   * la misma frase, así que una base de datos atrasada no puede filtrar cuál
   * de las dos fue.
   */
  test('anulada, oculta y no disponible dicen exactamente lo mismo', () => {
    const said = proposalCancelNote('session_unavailable')
    expect(proposalCancelNote('session_annulled')).toBe(said)
    expect(proposalCancelNote('session_hidden')).toBe(said)
    expect(said).toContain('no se informa')
    expect(said).not.toContain('anul')
    expect(said).not.toContain('ocult')
  })

  test('una razón que no conocemos no se inventa', () => {
    expect(proposalCancelNote('algo_nuevo')).toBe('La propuesta se cerró sin respuesta suya.')
  })
})

describe('a dónde lleva una fila', () => {
  test('a su sesión mientras la alcance', () => {
    expect(proposalSessionTarget(proposal())).toEqual({ executionId: EXECUTION, setOrder: 2 })
  })

  /* Sin `target` no hay enlace, y lo que se dice es sobre su alcance. */
  test('sin objetivo no hay enlace, y se dice por qué', () => {
    expect(proposalSessionTarget(proposal({ target: null }))).toBeNull()
    expect(proposalUnreachableNote()).toContain('Ya no puedes abrir esa sesión')
  })
})

describe('qué dice cuando no hay nada que mostrar', () => {
  test('sin ninguna propuesta dice dónde se proponen', () => {
    expect(proposalEmptyNote('all')).toContain('Todavía no has propuesto')
    expect(proposalEmptyNote('all')).toContain('una serie de una sesión')
  })

  test('cada filtro vacío habla de su propio filtro', () => {
    expect(proposalEmptyNote('pending')).toContain('esperando respuesta')
    expect(proposalEmptyNote('accepted')).toContain('aceptadas')
    expect(proposalEmptyNote('cancelled')).toContain('canceladas')
  })

  test('los seis filtros tienen etiqueta', () => {
    for (const filter of PROPOSAL_FILTERS) {
      expect(proposalFilterLabel(filter).length).toBeGreaterThan(0)
    }
    expect(PROPOSAL_FILTERS).toHaveLength(6)
  })
})

describe('qué significa un rechazo de la lectura', () => {
  /* El registro no trae datos de ella, así que el 403 solo puede ser su membresía. */
  test('403 habla de su membresía, no de ella', () => {
    const said = proposalRegisterFailure(403)
    expect(said).toContain('membresía')
    expect(said).not.toContain('permiso')
  })

  test('422 manda de vuelta al registro completo', () => {
    expect(proposalRegisterFailure(422)).toContain('Todas')
  })

  test('lo demás ofrece reintentar', () => {
    expect(proposalRegisterFailure(503)).toContain('Vuelve a intentarlo')
    expect(proposalRegisterFailure(0)).toContain('Vuelve a intentarlo')
  })
})
