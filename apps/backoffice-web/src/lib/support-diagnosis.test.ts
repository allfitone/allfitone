import { describe, expect, test } from 'bun:test'

import {
  SUPPORT_OPERATION_STATES,
  circuitSummary,
  circuitTone,
  needsAttention,
  operationStateFilterLabel,
  operationStateLabel,
  operationStateTone,
  sourceFilterLabel,
  sourceLabel,
  supportDiagnosisMessage,
  isValidOperationIdentifier,
  jobHealthLine,
  jobHealthTone,
  jobLabel,
  silentJobs,
  shortIdentifier,
  subjectLine,
  type SupportDeliveryCircuit,
  type SupportOperation,
} from './support-diagnosis'

function operation(overrides: Partial<SupportOperation> = {}): SupportOperation {
  return {
    source: 'notification',
    reference_id: '019a6000-0000-7000-8000-000000000301',
    subject_kind: 'invitation',
    subject_id: '019a6000-0000-7000-8000-000000000401',
    label: 'identity.invitation_issued.v1',
    state: 'retrying',
    occurred_at: '2026-09-10T18:00:00.000Z',
    attempt_count: 3,
    last_error_code: 'smtp_timeout',
    resolved_at: null,
    ...overrides,
  }
}

function circuit(overrides: Partial<SupportDeliveryCircuit> = {}): SupportDeliveryCircuit {
  return {
    event_type: 'identity.invitation_issued.v1',
    state: 'closed',
    window_started_at: '2026-09-10T17:00:00.000Z',
    success_count: 40,
    failure_count: 0,
    opened_until: null,
    ...overrides,
  }
}

describe('technical diagnosis vocabulary', () => {
  test('each closed filter says what it filters, including when it filters nothing', () => {
    expect(sourceFilterLabel('any')).toBe('Todo')
    expect(operationStateFilterLabel('any')).toBe('Todo')
    expect(sourceFilterLabel('command')).toBe(sourceLabel('command'))
    for (const state of SUPPORT_OPERATION_STATES) {
      expect(operationStateFilterLabel(state)).toBe(operationStateLabel(state))
    }
  })

  test('names every state the feed can answer', () => {
    const labels = SUPPORT_OPERATION_STATES.map((state) => operationStateLabel(state))
    expect(new Set(labels).size).toBe(SUPPORT_OPERATION_STATES.length)
    expect(sourceLabel('notification')).toBe('Aviso')
    expect(sourceLabel('command')).toBe('Comando')
  })

  test('a queue with nothing sent yet does not read as a wall of failures', () => {
    expect(operationStateTone('pending')).toBe('secondary')
    expect(operationStateTone('processing')).toBe('secondary')
    expect(operationStateLabel('pending')).toBe('Sin enviar todavía')
  })

  test('still trying is warned about, having given up is a failure', () => {
    expect(operationStateTone('retrying')).toBe('warning')
    expect(operationStateTone('dead_lettered')).toBe('destructive')
    expect(operationStateTone('stalled')).toBe('destructive')
    expect(operationStateTone('rejected_final')).toBe('destructive')
  })

  test('only what somebody has to act on needs attention', () => {
    expect(needsAttention(operation({ state: 'dead_lettered' }))).toBe(true)
    expect(needsAttention(operation({ state: 'stalled' }))).toBe(true)
    expect(needsAttention(operation({ state: 'retrying' }))).toBe(false)
    expect(needsAttention(operation({ state: 'pending' }))).toBe(false)
    expect(needsAttention(operation({ state: 'delivered' }))).toBe(false)
  })

  test('a healthy set of channels says nothing rather than reassuring', () => {
    expect(circuitSummary([])).toBeNull()
    expect(circuitSummary([circuit(), circuit({ event_type: 'other.v1' })])).toBeNull()
  })

  test('a tripped channel is named, because it is usually the whole answer', () => {
    const summary = circuitSummary([circuit({ state: 'open', failure_count: 12 })])
    expect(summary).toContain('identity.invitation_issued.v1')
    expect(summary).toContain('causa más probable')
  })

  test('several tripped channels are counted instead of listed', () => {
    const summary = circuitSummary([
      circuit({ state: 'open' }),
      circuit({ event_type: 'other.v1', state: 'half_open' }),
    ])
    expect(summary).toContain('2 canales')
  })

  test('a channel state maps to a tone an operator can scan', () => {
    expect(circuitTone('open')).toBe('destructive')
    expect(circuitTone('half_open')).toBe('warning')
    expect(circuitTone('closed')).toBe('success')
  })

  test('explains a refusal as an expired duty rather than a mistake', () => {
    expect(supportDiagnosisMessage('forbidden')).toContain('llegan con el rol de administrador')
    expect(supportDiagnosisMessage('anything-else')).toBe('No se pudo leer el estado técnico.')
  })
})

// HU-BO-031 c1 and c3: the identifiers were in the answer and nowhere on screen.
describe('the identifiers an operation carries', () => {
  test('an identifier is shortened for the row and kept whole for its title', () => {
    expect(shortIdentifier('019a7000-0000-7000-8000-000000000001')).toBe('019a7000…')
  })

  test('the subject says what kind of thing it is and which one', () => {
    expect(
      subjectLine(
        operation({
          subject_kind: 'organization',
          subject_id: '019a7000-0000-7000-8000-000000000001',
        }),
      ),
    ).toBe('organization 019a7000…')
    expect(subjectLine(operation({ subject_kind: null, subject_id: null }))).toBe('Sin sujeto')
  })

  test('only an identifier is searched for, so a typo never becomes an empty answer', () => {
    expect(isValidOperationIdentifier(' 019a7000-0000-7000-8000-000000000001 ')).toBe(true)
    expect(isValidOperationIdentifier('019a7000')).toBe(false)
    expect(isValidOperationIdentifier('')).toBe(false)
  })
})

// HU-BO-031 c2: failed jobs, refused store notices and deliveries nobody picked up.
describe('what failed silently', () => {
  test('the new sources and the failed state read as words, and a failure as a failure', () => {
    expect(sourceLabel('job')).toBe('Tarea programada')
    expect(sourceLabel('store_notification')).toBe('Aviso de la tienda')
    expect(operationStateLabel('failed')).toBe('Falló')
    expect(operationStateTone('failed')).toBe('destructive')
    expect(needsAttention(operation({ source: 'job', state: 'failed' }))).toBe(true)
  })

  const NOW = Date.parse('2026-11-04T12:00:00.000Z')
  const job = {
    job_name: 'privacy_disposition',
    last_run_at: '2026-11-04T11:59:00.000Z',
    last_outcome: 'succeeded' as const,
    last_failure_at: null,
    last_error_code: null,
    failures_24h: 0,
  }

  test('a job says when it last ran and how it went', () => {
    expect(jobLabel('privacy_disposition')).toBe('Eliminaciones de privacidad')
    expect(jobLabel('media_disposal')).toBe('Borrado de fotos eliminadas')
    expect(jobLabel('something_new')).toBe('something_new')
    expect(jobHealthLine(job, NOW)).toBe('Corrió hace 1 min y terminó bien.')
    expect(
      jobHealthLine(
        {
          ...job,
          last_outcome: 'failed',
          last_failure_at: job.last_run_at,
          last_error_code: 'x_failed',
          failures_24h: 4,
        },
        NOW,
      ),
    ).toBe('Corrió hace 1 min y falló (x_failed). 4 fallos en 24 horas.')
    expect(jobHealthTone(job, NOW)).toBe('success')
    expect(jobHealthTone({ ...job, last_outcome: 'failed' }, NOW)).toBe('destructive')
  })

  test('a job that stopped running is called out, because nothing else would say so', () => {
    const stale = { ...job, last_run_at: '2026-11-04T11:40:00.000Z' }
    expect(jobHealthTone(stale, NOW)).toBe('warning')
    expect(jobHealthLine(stale, NOW)).toContain('No corre desde hace 20 min')
    expect(silentJobs([job, stale], NOW)).toEqual(['privacy_disposition'])
    expect(silentJobs([job], NOW)).toEqual([])
  })
})
