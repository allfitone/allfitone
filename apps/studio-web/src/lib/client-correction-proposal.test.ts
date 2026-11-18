import { describe, expect, test } from 'bun:test'

import {
  canProposeCorrection,
  correctionFieldLabel,
  correctionTargets,
  pendingProposalFor,
  pendingProposalNote,
  proposalExpiryNote,
  proposalFailure,
  proposalOutcome,
  proposalReasonProblem,
  proposedValue,
  proposedValueProblem,
  type CorrectionTarget,
} from './client-correction-proposal.js'
import type {
  ClientCardSection,
  ExecutionDetailStrengthSet,
  ProposedCorrection,
} from './studio-api.js'

function section(scope_code: string, access_level: 'read' | 'contribute'): ClientCardSection {
  return {
    scope_code: scope_code as ClientCardSection['scope_code'],
    access_level,
    scope_version: 1,
    granted_at: '2026-11-01T10:00:00.000Z',
    reads: [],
  }
}

const EXECUTION = '01991600-7000-7000-8000-0000000000c1'

function set(overrides: Partial<ExecutionDetailStrengthSet> = {}): ExecutionDetailStrengthSet {
  return {
    segment_position: null,
    order: 2,
    movement_id: '01991600-7000-7000-8000-00000000c702',
    movement_name: 'Sentadilla trasera',
    achieved_reps: 8,
    load: { value: 60, unit: 'kg' },
    rpe: 8,
    ...overrides,
  } as ExecutionDetailStrengthSet
}

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

const target = (overrides: Partial<CorrectionTarget> = {}): CorrectionTarget => ({
  field: 'load',
  declared: 60,
  unit: 'kg',
  ...overrides,
})

describe('which of a set’s fields can take a proposal', () => {
  test('the three she filled, each with her own unit', () => {
    expect(correctionTargets(set())).toEqual([
      { field: 'achieved_reps', declared: 8, unit: null },
      { field: 'load', declared: 60, unit: 'kg' },
      { field: 'rpe', declared: 8, unit: null },
    ])
  })

  /*
   * A field she left empty has nothing to correct, and the server says so with
   * 422 `field`. Absent rather than offered.
   */
  test('a field she left empty is not offered', () => {
    expect(correctionTargets(set({ rpe: null, load: null })).map((entry) => entry.field)).toEqual([
      'achieved_reps',
    ])
    expect(correctionTargets(set({ achieved_reps: null, load: null, rpe: null }))).toEqual([])
  })

  test('RPE zero is a value she declared, not an absence', () => {
    expect(correctionTargets(set({ rpe: 0 })).map((entry) => entry.field)).toContain('rpe')
  })
})

describe('what the form will not send', () => {
  test('nothing written, and something that is not a number', () => {
    expect(proposedValueProblem(target(), '  ')).toBe('empty')
    expect(proposedValueProblem(target(), 'sesenta')).toBe('not-a-number')
  })

  /* A coach types 62,5 in Colombia; the API takes 62.5. */
  test('a decimal comma is read as a decimal point', () => {
    expect(proposedValueProblem(target(), '62,5')).toBeNull()
    expect(proposedValue('62,5')).toBe(62.5)
  })

  test('each field keeps the bounds the operation sets', () => {
    const reps = target({ field: 'achieved_reps', declared: 8, unit: null })
    expect(proposedValueProblem(reps, '8,5')).toBe('not-whole')
    expect(proposedValueProblem(reps, '0')).toBe('out-of-range')
    expect(proposedValueProblem(reps, '1001')).toBe('out-of-range')
    expect(proposedValueProblem(reps, '1000')).toBeNull()

    const rpe = target({ field: 'rpe', declared: 8, unit: null })
    expect(proposedValueProblem(rpe, '10,5')).toBe('out-of-range')
    expect(proposedValueProblem(rpe, '-1')).toBe('out-of-range')
    expect(proposedValueProblem(rpe, '0')).toBeNull()

    expect(proposedValueProblem(target(), '10000')).toBe('out-of-range')
    expect(proposedValueProblem(target(), '9999,9')).toBeNull()
  })

  /* Proposing what she already declared is not a correction, and the server agrees. */
  test('the value she already declared', () => {
    expect(proposedValueProblem(target(), '60')).toBe('unchanged')
    expect(proposedValueProblem(target(), '60,0')).toBe('unchanged')
  })

  test('the reason is required and has its own limit', () => {
    expect(proposalReasonProblem(' ')).toBe('empty')
    expect(proposalReasonProblem('a'.repeat(501))).toBe('too-long')
    expect(proposalReasonProblem('a'.repeat(500))).toBeNull()
  })
})

describe('a field that already waits on her', () => {
  test('matched by where it points and by which field', () => {
    const waiting = [proposal()]
    expect(pendingProposalFor(waiting, EXECUTION, 2, 'load')?.id).toBe(proposal().id)
    expect(pendingProposalFor(waiting, EXECUTION, 2, 'rpe')).toBeUndefined()
    expect(pendingProposalFor(waiting, EXECUTION, 3, 'load')).toBeUndefined()
    expect(pendingProposalFor(waiting, 'another-session', 2, 'load')).toBeUndefined()
  })

  /* One he no longer reaches carries no target, so it cannot be this set's. */
  test('one with no target is not matched', () => {
    expect(pendingProposalFor([proposal({ target: null })], EXECUTION, 2, 'load')).toBeUndefined()
  })

  test('one already settled is not waiting', () => {
    const settled = proposal({ status: 'accepted', settled_at: '2026-11-18T10:00:00.000Z' })
    expect(pendingProposalFor([settled], EXECUTION, 2, 'load')).toBeUndefined()
  })
})

describe('what the screen says about time', () => {
  const now = new Date('2026-11-17T15:00:00.000Z')

  /* The fourth criterion has two halves, and the second is the one nobody guesses. */
  test('when it expires, and that expiring is not a no from her', () => {
    const note = proposalExpiryNote(proposal(), now)
    expect(note).toContain('en 30 días')
    expect(note).toContain('su silencio no es un sí')
  })

  test('the last day reads as tomorrow, and a past one does not go negative', () => {
    expect(proposalExpiryNote(proposal({ expires_at: '2026-11-18T15:00:00.000Z' }), now)).toContain(
      'Vence mañana',
    )
    expect(proposalExpiryNote(proposal({ expires_at: '2026-11-01T15:00:00.000Z' }), now)).toContain(
      'Vence en 0 días',
    )
  })

  test('a field already waiting says so before offering another', () => {
    expect(pendingProposalNote(proposal(), now)).toContain('esperando su respuesta')
  })

  /* The first criterion again, after the fact: her value has not moved. */
  test('what landed says her value stays until she accepts', () => {
    const said = proposalOutcome(proposal(), now)
    expect(said).toContain('carga')
    expect(said).toContain('ya le avisamos')
    expect(said).toContain('sigue igual hasta que ella acepte')
  })
})

describe('what a refused proposal means', () => {
  test('the two 403s are different conversations', () => {
    expect(proposalFailure(403, 'scope-required', [])).toContain('Ella decide ese permiso')
    expect(proposalFailure(403, 'forbidden', [])).toContain('quien administra el equipo')
  })

  /* One 409 for three facts: it names the two he can act on, and claims neither. */
  test('the 409 names a waiting proposal and no address, without picking one', () => {
    const said = proposalFailure(409, 'conflict', [])
    expect(said).toContain('ya hay una propuesta esperando')
    expect(said).toContain('no tenemos a dónde avisarle')
  })

  test('a paused service says where it is resolved, which is not here', () => {
    expect(proposalFailure(409, 'service-paused', [])).toContain(
      'reactivándolo o terminando el vínculo',
    )
  })

  /* The second criterion, as a refusal: the screen cannot know this beforehand. */
  test('a value that is not hers says so plainly', () => {
    expect(proposalFailure(422, 'validation-failed', [{ code: 'execution' }])).toContain(
      'no lo declaró ella',
    )
  })

  test('a value equal to hers, caught by the server after all', () => {
    expect(proposalFailure(422, 'validation-failed', [{ code: 'value' }])).toContain(
      'ya tiene registrado',
    )
  })

  test('404 does not guess which of its reasons it was', () => {
    expect(proposalFailure(404, 'not-found', [])).toContain('ya no está disponible para ti')
  })

  test('anything else says nothing reached her', () => {
    expect(proposalFailure(503, 'upstream-unavailable', [])).toContain('No le llegó nada')
    expect(proposalFailure(0, undefined, [])).toContain('No le llegó nada')
  })
})

describe('the field names a coach reads', () => {
  test('each field has one name, and it is the one on the row', () => {
    expect(correctionFieldLabel('achieved_reps')).toBe('Repeticiones')
    expect(correctionFieldLabel('load')).toBe('Carga')
    expect(correctionFieldLabel('rpe')).toBe('RPE')
  })
})

describe('who may propose at all', () => {
  test('her training at the writing level, and nothing else stands in for it', () => {
    expect(canProposeCorrection([section('relationship_training', 'contribute')])).toBe(true)
    expect(canProposeCorrection([section('relationship_training', 'read')])).toBe(false)
    expect(canProposeCorrection([])).toBe(false)
  })

  /* Health context has nothing to do with what she recorded of her training. */
  test('her health context does not grant it', () => {
    expect(canProposeCorrection([section('health_context', 'contribute')])).toBe(false)
  })
})
