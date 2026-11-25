import { describe, expect, test } from 'bun:test'

import { ApiError } from './api-error'
import {
  comparison,
  contextLine,
  correctionSections,
  decisionFailure,
  decisionMovedOn,
  expiryLabel,
  findProposal,
  outcomeLine,
  proposalCaption,
  proposalTitle,
  proposedWhen,
  setOf,
  statusBadge,
  statusOf,
  type CorrectionProposal,
} from './corrections'
import type { FinishedExecution } from './execution'
import { textFor } from '../i18n'

const ES = textFor('es')
const EN = textFor('en')
const ZONE = 'America/Bogota'
const KG = { mass: 'kg', distance: 'km' } as const
const LB = { mass: 'lb', distance: 'mi' } as const

// Bogotá is UTC-5: 15:00Z is ten in the morning there.
const NOW = new Date('2026-10-01T15:00:00Z')

function proposal(overrides: Partial<CorrectionProposal> = {}): CorrectionProposal {
  return {
    id: '019e4000-0000-7000-8000-0000000000p1',
    execution_id: '019e4000-0000-7000-8000-0000000000e1',
    set_order: 5,
    movement_id: null,
    movement_name: 'Sentadilla',
    field: 'achieved_reps',
    current: { value: 6, unit: null },
    proposed: { value: 8, unit: null },
    reason: 'Te vi hacer 8 en la sala; creo que anotaste 6 por error.',
    status: 'pending',
    cancel_reason: null,
    created_at: '2026-09-30T14:00:00Z',
    expires_at: '2026-10-30T14:00:00Z',
    settled_at: null,
    proposer_name: 'Laura Gómez',
    organization_name: 'Bodytech',
    ...overrides,
  }
}

function set(order: number, load: number | null, reps: number | null, unit: string | null = 'kg') {
  return {
    set_order: order,
    kind: 'normal' as const,
    load_value: load,
    load_unit_code: load === null ? null : unit,
    achieved_reps: reps,
    rpe: null,
    best_ever: false,
  }
}

const detail = {
  executed_session_id: '019e4000-0000-7000-8000-0000000000e1',
  started_at: '2026-08-22T03:00:00Z',
  title: 'Pierna',
  exercises: [
    { movement: 'Prensa', sets: [set(1, 120, 10), set(2, 120, 10)] },
    { movement: 'Sentadilla', sets: [set(3, 100, 6), set(4, 100, 6), set(5, 100, 6)] },
  ],
} as unknown as FinishedExecution

describe('the corrections proposed to her (HU-SP-062)', () => {
  test('T-SPC-UNIT-640 pending soonest to expire first; the rest most recently settled first', () => {
    const late = proposal({ id: 'a', expires_at: '2026-10-29T14:00:00Z' })
    const soon = proposal({ id: 'b', expires_at: '2026-10-10T14:00:00Z' })
    const accepted = proposal({ id: 'c', status: 'accepted', settled_at: '2026-09-12T10:00:00Z' })
    const cancelled = proposal({
      id: 'd',
      status: 'cancelled',
      cancel_reason: 'relationship_terminated',
      settled_at: '2026-09-20T10:00:00Z',
    })
    const lapsed = proposal({ id: 'e', expires_at: '2026-09-25T14:00:00Z' })

    const { pending, decided } = correctionSections([late, accepted, soon, cancelled, lapsed], NOW)
    expect(pending.map((one) => one.id)).toEqual(['b', 'a'])
    expect(decided.map((one) => one.id)).toEqual(['e', 'd', 'c'])
    expect(findProposal(decided, 'd')).toBe(cancelled)
    expect(findProposal(decided, 'zzz')).toBeUndefined()
  })

  test('T-SPC-UNIT-641 one past its thirty days is expired even before any sweep marks it', () => {
    expect(statusOf(proposal(), NOW)).toBe('pending')
    expect(statusOf(proposal(), new Date('2026-10-30T14:00:00Z'))).toBe('expired')
    expect(statusOf(proposal({ status: 'rejected' }), NOW)).toBe('rejected')
  })

  test('T-SPC-UNIT-642 each state wears its badge: pending warns, accepted succeeds, the rest recede', () => {
    expect(statusBadge('pending', ES.corrections)).toEqual({ label: 'Pendiente', tone: 'warning' })
    expect(statusBadge('accepted', ES.corrections)).toEqual({ label: 'Aceptada', tone: 'success' })
    expect(statusBadge('rejected', EN.corrections)).toEqual({ label: 'Rejected', tone: 'neutral' })
    expect(statusBadge('expired', ES.corrections).tone).toBe('neutral')
    expect(statusBadge('cancelled', ES.corrections)).toEqual({
      label: 'Cancelada',
      tone: 'neutral',
    })
  })

  test('T-SPC-UNIT-643 the expiry counts calendar days in her zone', () => {
    expect(expiryLabel(proposal(), NOW, ZONE, ES.corrections)).toBe('Vence en 29 días')
    expect(expiryLabel(proposal(), NOW, ZONE, EN.corrections)).toBe('Expires in 29 days')
    const tomorrow = proposal({ expires_at: '2026-10-02T15:00:00Z' })
    expect(expiryLabel(tomorrow, NOW, ZONE, ES.corrections)).toBe('Vence mañana')
    // 02:00Z on the 2nd is still the evening of the 1st in Bogotá.
    const tonight = proposal({ expires_at: '2026-10-02T02:00:00Z' })
    expect(expiryLabel(tonight, NOW, ZONE, ES.corrections)).toBe('Vence hoy')
    expect(expiryLabel(tonight, NOW, ZONE, EN.corrections)).toBe('Expires today')
  })

  test('T-SPC-UNIT-644 when it was proposed reads today, yesterday, or its day', () => {
    const months = ES.common.months
    expect(proposedWhen(proposal(), NOW, ZONE, ES.corrections, months)).toBe('ayer')
    const fresh = proposal({ created_at: '2026-10-01T13:00:00Z' })
    expect(proposedWhen(fresh, NOW, ZONE, EN.corrections, EN.common.months)).toBe('today')
    const older = proposal({ created_at: '2026-09-22T14:00:00Z' })
    expect(proposedWhen(older, NOW, ZONE, ES.corrections, months)).toBe('22 sep')
    expect(proposedWhen(older, NOW, ZONE, EN.corrections, EN.common.months)).toBe('Sep 22')
  })

  test('T-SPC-UNIT-645 a row names the exercise and the set as the session numbers it', () => {
    expect(setOf(detail, 5)?.number).toBe(3)
    expect(setOf(detail, 9)).toBeUndefined()
    expect(proposalTitle(proposal(), 3, ES.corrections)).toBe('Sentadilla · serie 3')
    expect(proposalTitle(proposal(), 3, EN.corrections)).toBe('Sentadilla · set 3')
    expect(proposalTitle(proposal({ movement_name: null }), undefined, ES.corrections)).toBe(
      'Ejercicio',
    )
  })

  test('T-SPC-UNIT-646 the caption says who and when it expires, or when it ended', () => {
    const months = ES.common.months
    expect(proposalCaption(proposal(), NOW, ZONE, ES.corrections, months)).toBe(
      'Laura Gómez · vence el 30 oct',
    )
    const accepted = proposal({ status: 'accepted', settled_at: '2026-09-12T15:00:00Z' })
    expect(proposalCaption(accepted, NOW, ZONE, ES.corrections, months)).toBe(
      'Laura Gómez · 12 sep',
    )
    const ended = proposal({
      status: 'cancelled',
      cancel_reason: 'relationship_terminated',
      settled_at: '2026-06-03T15:00:00Z',
      organization_name: 'Smart Fit',
    })
    expect(proposalCaption(ended, NOW, ZONE, ES.corrections, months)).toBe('Smart Fit · 3 jun')
    expect(proposalCaption(ended, NOW, ZONE, EN.corrections, EN.common.months)).toBe(
      'Smart Fit · Jun 3',
    )
  })

  test('T-SPC-UNIT-647 the context names the session, its day in her zone, and the set', () => {
    // 03:00Z on Saturday the 22nd is still ten at night on Friday the 21st in Bogotá.
    expect(contextLine(proposal(), detail, ZONE, ES.corrections, ES.common.months)).toBe(
      'Pierna · vie 21 ago · Sentadilla · serie 3',
    )
    expect(contextLine(proposal(), detail, ZONE, EN.corrections, EN.common.months)).toBe(
      'Pierna · Fri, Aug 21 · Sentadilla · set 3',
    )
    expect(contextLine(proposal(), undefined, ZONE, ES.corrections, ES.common.months)).toBe(
      'Sentadilla',
    )
  })
})

describe('what she logged against what is proposed (HU-SP-063)', () => {
  const sentadilla = setOf(detail, 5)?.set

  test('T-SPC-UNIT-648 a proposal on the reps keeps the set load beside them', () => {
    expect(comparison(proposal(), sentadilla, KG, 'es', ES.corrections)).toEqual({
      registered: '100 kg × 6',
      proposed: '100 kg × 8',
    })
  })

  test('T-SPC-UNIT-649 a load reads in her unit, whatever unit it was proposed in', () => {
    const load = proposal({
      field: 'load',
      current: { value: 100, unit: 'kg' },
      proposed: { value: 102.5, unit: 'kg' },
    })
    expect(comparison(load, sentadilla, KG, 'es', ES.corrections)).toEqual({
      registered: '100 kg × 6',
      proposed: '102,5 kg × 6',
    })
    expect(comparison(load, sentadilla, LB, 'en', EN.corrections)).toEqual({
      registered: '220.5 lb × 6',
      proposed: '226 lb × 6',
    })
    const pounds = proposal({
      field: 'load',
      current: { value: 220, unit: 'lb' },
      proposed: { value: 225, unit: 'lb' },
    })
    expect(comparison(pounds, undefined, KG, 'es', ES.corrections)).toEqual({
      registered: '99,8 kg',
      proposed: '102,1 kg',
    })
  })

  test('T-SPC-UNIT-650 without the session the field reads alone; an effort reads as RPE', () => {
    expect(comparison(proposal(), undefined, KG, 'es', ES.corrections)).toEqual({
      registered: '6 reps',
      proposed: '8 reps',
    })
    const effort = proposal({
      field: 'rpe',
      current: { value: 7, unit: null },
      proposed: { value: 8.5, unit: null },
    })
    expect(comparison(effort, sentadilla, KG, 'es', ES.corrections)).toEqual({
      registered: 'RPE 7',
      proposed: 'RPE 8,5',
    })
    const bodyweight = set(5, null, 12)
    expect(comparison(proposal(), bodyweight, KG, 'en', EN.corrections).registered).toBe('6 reps')
  })

  test('T-SPC-UNIT-651 one that no longer waits says what became of it, and why it was cancelled', () => {
    const months = ES.common.months
    expect(outcomeLine(proposal(), NOW, ZONE, ES.corrections, months)).toBeUndefined()
    const accepted = proposal({ status: 'accepted', settled_at: '2026-09-12T15:00:00Z' })
    expect(outcomeLine(accepted, NOW, ZONE, ES.corrections, months)).toContain(
      'La aceptaste el 12 sep',
    )
    const lapsed = proposal({ expires_at: '2026-09-25T14:00:00Z' })
    expect(outcomeLine(lapsed, NOW, ZONE, ES.corrections, months)).toBe(
      'Venció el 25 sep sin respuesta. Tu registro sigue como estaba.',
    )
    const ended = proposal({
      status: 'cancelled',
      cancel_reason: 'relationship_terminated',
      settled_at: '2026-09-20T15:00:00Z',
      organization_name: 'Smart Fit',
    })
    expect(outcomeLine(ended, NOW, ZONE, EN.corrections, EN.common.months)).toBe(
      'It was cancelled because your relationship with Smart Fit ended. Your entry stays as it was.',
    )
    const hidden = proposal({ status: 'cancelled', cancel_reason: 'session_hidden' })
    expect(outcomeLine(hidden, NOW, ZONE, ES.corrections, months)).toBe(
      'Se canceló porque ocultaste esa sesión a Bodytech.',
    )
  })

  test('T-SPC-UNIT-652 a refused decision says why, and a closed one is read again', () => {
    const words = ES.corrections
    expect(decisionFailure(new ApiError('conflict'), words)).toBe(words.failure.closed)
    expect(decisionFailure(new ApiError('not-found'), words)).toBe(words.failure.gone)
    expect(decisionFailure(new ApiError('unauthenticated'), words)).toBe(words.failure.session)
    expect(decisionFailure(new ApiError('invalid-request'), words)).toBe(words.failure.refused)
    expect(decisionFailure(new ApiError('unavailable'), words)).toBe(words.failure.offline)
    expect(decisionFailure(new Error('boom'), words)).toBe(words.failure.offline)
    expect(decisionMovedOn(new ApiError('conflict'))).toBe(true)
    expect(decisionMovedOn(new ApiError('not-found'))).toBe(true)
    expect(decisionMovedOn(new ApiError('unavailable'))).toBe(false)
  })
})
