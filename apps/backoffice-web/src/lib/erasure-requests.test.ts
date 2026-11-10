import { describe, expect, test } from 'bun:test'

import {
  categoryLine,
  emptyMessage,
  erasureMessage,
  holdableCategories,
  appendPage,
  nextPageCursor,
  panelSummary,
  requestRows,
  urgencyOf,
  type ErasureRequest,
  type ErasureRequestPage,
} from './erasure-requests'
import { holdReasonLabel } from './legal-holds'

const NOW = Date.parse('2026-09-23T12:00:00.000Z')

function request(overrides: Partial<ErasureRequest> = {}): ErasureRequest {
  return {
    id: '019ac000-0000-7000-8000-000000000501',
    subject_person_id: '019ac000-0000-7000-8000-000000000005',
    origin: 'request',
    status: 'open',
    opened_at: '2026-08-28T12:00:00.000Z',
    closed_at: null,
    due_at: '2026-09-27T12:00:00.000Z',
    pending_items: 1,
    suspended_items: 0,
    resolved_items: 2,
    categories: [
      {
        data_classification_code: 'body',
        action: 'delete',
        status: 'executed',
        items: 2,
        item_ids: ['019ae000-0000-7000-8000-000000000601', '019ae000-0000-7000-8000-000000000602'],
        result: 'deleted',
        executed_at: '2026-08-28T12:00:05.000Z',
        retained_until: null,
        hold: null,
      },
      {
        data_classification_code: 'health',
        action: 'delete',
        status: 'pending',
        items: 1,
        item_ids: ['019ae000-0000-7000-8000-000000000603'],
        result: null,
        executed_at: null,
        retained_until: null,
        hold: null,
      },
    ],
    ...overrides,
  }
}

describe('erasure request presentation rules', () => {
  test('a request is urgent by how close it is to the thirty days, not by its age', () => {
    // Four days left, one day past, and a month of room.
    expect(urgencyOf(request(), NOW)).toBe('due_soon')
    expect(urgencyOf(request({ due_at: '2026-09-22T12:00:00.000Z' }), NOW)).toBe('overdue')
    expect(urgencyOf(request({ due_at: '2026-10-23T12:00:00.000Z' }), NOW)).toBe('on_time')
  })

  test('a resolved request is not urgent, however late it was', () => {
    const closed = request({
      status: 'closed',
      closed_at: '2026-09-20T12:00:00.000Z',
      due_at: '2026-09-01T12:00:00.000Z',
      pending_items: 0,
      resolved_items: 3,
    })

    expect(urgencyOf(closed, NOW)).toBe('resolved')
  })

  test('a request whose only remainder is held by a legal obligation is waiting, not late', () => {
    // HU-BO-033: the hold keeps it on purpose, so the thirty days are not the team's to miss.
    const held = request({
      due_at: '2026-09-01T12:00:00.000Z',
      pending_items: 0,
      suspended_items: 1,
    })
    expect(urgencyOf(held, NOW)).toBe('held')

    const [row] = requestRows({ items: [held], has_more: false }, NOW)
    expect(row?.urgencyLabel).toBe('En espera legal')
    expect(row?.missing).toBe('1 categoría en espera por una obligación legal')

    // Something still owed beside the held part keeps the clock running.
    expect(urgencyOf({ ...held, pending_items: 1 }, NOW)).toBe('overdue')
  })

  test('the summary counts a held request as waiting, never as past the thirty days', () => {
    const held = request({
      id: 'held',
      due_at: '2026-09-01T12:00:00.000Z',
      pending_items: 0,
      suspended_items: 1,
    })
    expect(panelSummary({ items: [held], has_more: false }, 'open', NOW)).toBe(
      '1 solicitud abierta, 1 en espera por una obligación legal.',
    )
  })

  test('each row says who asked, since when, and what is still owed', () => {
    const [row] = requestRows({ items: [request()], has_more: false }, NOW)

    expect(row).toMatchObject({
      id: '019ac000-0000-7000-8000-000000000501',
      subject: '019ac000-0000-7000-8000-000000000005',
      urgency: 'due_soon',
      missing: 'Falta 1 categoría',
    })
    expect(row?.opened).toContain('2026')
    expect(row?.due).toContain('2026')
    expect(row?.urgencyLabel).toBe('Faltan 4 días')
  })

  test('a request with nothing left says so instead of showing a zero', () => {
    const [row] = requestRows(
      {
        items: [
          request({
            status: 'closed',
            closed_at: '2026-09-20T12:00:00.000Z',
            pending_items: 0,
            resolved_items: 3,
          }),
        ],
        has_more: false,
      },
      NOW,
    )

    expect(row?.missing).toBe('Nada pendiente')
    expect(row?.urgencyLabel).toBe('Resuelta')
  })

  test('a category held by a legal obligation is not counted as pending work', () => {
    const [row] = requestRows(
      { items: [request({ pending_items: 0, suspended_items: 1 })], has_more: false },
      NOW,
    )

    expect(row?.missing).toBe('1 categoría en espera por una obligación legal')
  })

  test('the resolution reads as a sentence per category, with what was kept and until when', () => {
    expect(
      categoryLine({
        data_classification_code: 'body',
        action: 'delete',
        status: 'executed',
        items: 2,
        item_ids: ['019ae000-0000-7000-8000-000000000601'],
        result: 'deleted',
        executed_at: '2026-08-28T12:00:05.000Z',
        retained_until: null,
        hold: null,
      }),
    ).toBe('Cuerpo · eliminado (2)')

    expect(
      categoryLine({
        data_classification_code: 'health',
        action: 'delete',
        status: 'pending',
        items: 1,
        item_ids: ['019ae000-0000-7000-8000-000000000603'],
        result: null,
        executed_at: null,
        retained_until: null,
        hold: null,
      }),
    ).toBe('Salud · pendiente de eliminar (1)')

    const kept = categoryLine({
      data_classification_code: 'health',
      action: 'retain_restricted',
      status: 'executed',
      items: 1,
      item_ids: ['019ae000-0000-7000-8000-000000000604'],
      result: 'retained',
      executed_at: '2026-08-28T12:00:05.000Z',
      retained_until: '2027-08-28T12:00:05.000Z',
      hold: null,
    })
    expect(kept).toContain('Salud · conservado hasta')
    expect(kept).toContain('2027')

    expect(
      categoryLine({
        data_classification_code: 'nutrition',
        action: 'anonymize',
        status: 'suspended',
        items: 4,
        item_ids: ['019ae000-0000-7000-8000-000000000605'],
        result: null,
        executed_at: null,
        retained_until: null,
        hold: {
          id: '019ae000-0000-7000-8000-000000000701',
          reason_code: 'judicial_order',
          valid_to: '2026-12-22T12:00:00.000Z',
        },
      }),
    ).toContain('Nutrición · en espera por una obligación legal')
  })

  // HU-BO-032: «Hay más» used to say so and never fetch it.
  test('the next page continues after the last row, in the order the half is read', () => {
    const open: ErasureRequestPage = { items: [request(), request({ id: 'b' })], has_more: true }
    expect(nextPageCursor(open, 'open')).toEqual({
      cursor_at: '2026-08-28T12:00:00.000Z',
      cursor_id: 'b',
    })
    const closed: ErasureRequestPage = {
      items: [request({ id: 'c', status: 'closed', closed_at: '2026-09-01T12:00:00.000Z' })],
      has_more: true,
    }
    expect(nextPageCursor(closed, 'closed')).toEqual({
      cursor_at: '2026-09-01T12:00:00.000Z',
      cursor_id: 'c',
    })
    expect(nextPageCursor({ ...open, has_more: false }, 'open')).toBeUndefined()
  })

  test('a page appended keeps each request once and takes the newer answer about more', () => {
    const first: ErasureRequestPage = { items: [request(), request({ id: 'b' })], has_more: true }
    const second: ErasureRequestPage = {
      items: [request({ id: 'b' }), request({ id: 'c' })],
      has_more: false,
    }
    const merged = appendPage(first, second)
    expect(merged.items.map((item) => item.id)).toEqual([
      '019ac000-0000-7000-8000-000000000501',
      'b',
      'c',
    ])
    expect(merged.has_more).toBe(false)
  })

  test('the panel states what it is showing, including when it is late', () => {
    const page: ErasureRequestPage = {
      items: [request(), request({ id: 'b', due_at: '2026-09-20T12:00:00.000Z' })],
      has_more: false,
    }

    expect(panelSummary(page, 'open', NOW)).toBe(
      '2 solicitudes abiertas, 1 pasada de los 30 días, 1 por vencer en 5 días o menos.',
    )
    expect(panelSummary({ items: [request()], has_more: true }, 'open', NOW)).toBe(
      '1 solicitud abierta cargada, 1 por vencer en 5 días o menos. Hay más: «Ver más solicitudes» trae las siguientes.',
    )
    expect(panelSummary({ items: [], has_more: false }, 'closed', NOW)).toBe(
      'Ninguna solicitud resuelta.',
    )
  })

  test('an empty half says which half is empty', () => {
    expect(emptyMessage('open')).toBe('No hay solicitudes de eliminación pendientes.')
    expect(emptyMessage('closed')).toBe('Todavía no se ha resuelto ninguna solicitud.')
  })

  test('a refusal explains the duty rather than reporting a failure', () => {
    expect(erasureMessage('forbidden')).toContain('manage_privacy_requests')
    expect(erasureMessage('network-unavailable')).toContain('conexión')
    expect(erasureMessage('anything-else')).toBe('No se pudo leer el seguimiento.')
  })

  test('a held category says on what ground and until when, without opening the hold', () => {
    const line = categoryLine({
      data_classification_code: 'body',
      action: 'delete',
      status: 'suspended',
      items: 2,
      item_ids: ['019ae000-0000-7000-8000-000000000601'],
      result: null,
      executed_at: null,
      retained_until: null,
      hold: {
        id: '019ae000-0000-7000-8000-000000000701',
        reason_code: 'judicial_order',
        valid_to: '2026-12-22T12:00:00.000Z',
      },
    })

    expect(line).toContain('en espera por una obligación legal')
    expect(line).toContain('orden judicial')
    expect(line).toContain('2026')
    expect(holdReasonLabel('tax_or_accounting_obligation')).toBe('obligación contable o tributaria')
  })

  test('only what is still waiting can be suspended', () => {
    const request_ = request({
      categories: [
        {
          data_classification_code: 'body',
          action: 'delete',
          status: 'pending',
          items: 2,
          item_ids: ['a', 'b'],
          result: null,
          executed_at: null,
          retained_until: null,
          hold: null,
        },
        {
          data_classification_code: 'health',
          action: 'delete',
          status: 'executed',
          items: 1,
          item_ids: ['c'],
          result: 'deleted',
          executed_at: '2026-08-28T12:00:05.000Z',
          retained_until: null,
          hold: null,
        },
        {
          data_classification_code: 'nutrition',
          action: 'delete',
          status: 'suspended',
          items: 1,
          item_ids: ['d'],
          result: null,
          executed_at: null,
          retained_until: null,
          hold: {
            id: '019ae000-0000-7000-8000-000000000701',
            reason_code: 'judicial_order',
            valid_to: '2026-12-22T12:00:00.000Z',
          },
        },
      ],
    })

    // What is already erased cannot be held, and what is held is released, not held again.
    expect(
      holdableCategories(request_).map((category) => category.data_classification_code),
    ).toEqual(['body'])
  })

  test('a separation conflict is explained as itself, not as a refusal', () => {
    expect(erasureMessage('separation-of-duties')).toContain('acceso excepcional')
    expect(erasureMessage('separation-of-duties')).not.toBe(erasureMessage('forbidden'))
    expect(erasureMessage('conflict')).toContain('ya terminó')
  })
})
