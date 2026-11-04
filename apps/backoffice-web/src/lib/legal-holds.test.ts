import { describe, expect, test } from 'bun:test'

import {
  emptyHold,
  holdApplication,
  holdIssue,
  holdIssueMessage,
  holdReasonLabel,
  holdRows,
  holdsEmptyMessage,
  holdsSummary,
  holdTone,
  type HoldDraft,
  type LegalHold,
  type LegalHoldPage,
} from './legal-holds'

const NOW = Date.parse('2026-09-23T12:00:00.000Z')
const SUBJECT = '019ac000-0000-7000-8000-000000000005'

function hold(overrides: Partial<LegalHold> = {}): LegalHold {
  return {
    id: '019ae000-0000-7000-8000-000000000701',
    subject_person_id: SUBJECT,
    data_classification_codes: ['body', 'nutrition'],
    scope_description: 'Mediciones y comidas del expediente 2026-301',
    reason_code: 'judicial_order',
    case_reference: 'JUZGADO-2026-301',
    valid_from: '2026-09-01T12:00:00.000Z',
    valid_to: '2026-11-02T12:00:00.000Z',
    status: 'active',
    applied_by_person_id: '019ae000-0000-7000-8000-000000000003',
    released_at: null,
    released_by_person_id: null,
    lapsed_at: null,
    suspended_items: 2,
    items: 2,
    ...overrides,
  }
}

function page(items: LegalHold[], hasMore = false): LegalHoldPage {
  return { items, has_more: hasMore }
}

const complete: HoldDraft = {
  subjectPersonId: SUBJECT,
  categories: ['body'],
  scopeDescription: '  Mediciones del expediente 2026-114 ',
  reasonCode: 'judicial_order',
  caseReference: ' JUZGADO-2026-114 ',
  validTo: '2026-12-22',
}

describe('legal holds', () => {
  test('the form asks for what is missing in the order it shows the fields', () => {
    expect(holdIssue(complete, NOW)).toBeUndefined()
    expect(holdIssue({ ...complete, subjectPersonId: 'Valentina' }, NOW)).toBe('subject')
    expect(holdIssue({ ...complete, categories: [] }, NOW)).toBe('categories')
    expect(holdIssue({ ...complete, scopeDescription: ' ' }, NOW)).toBe('scope')
    expect(holdIssue({ ...complete, caseReference: '' }, NOW)).toBe('case')
    expect(holdIssue({ ...complete, subjectPersonId: '', categories: [] }, NOW)).toBe('subject')
  })

  test('there are no indefinite holds, and a date already past is not an end', () => {
    expect(holdIssue({ ...complete, validTo: '' }, NOW)).toBe('vigency')
    expect(holdIssue({ ...complete, validTo: '2026-09-01' }, NOW)).toBe('vigency')
    expect(holdIssueMessage('vigency')).toContain('No existen suspensiones indefinidas')
    expect(holdIssueMessage('subject')).toContain('identificador')
    expect(holdIssueMessage('categories')).toContain('al menos un tipo de dato')
  })

  test('a complete draft travels trimmed, ending at the close of the day it names', () => {
    const application = holdApplication(complete)

    expect(application).toMatchObject({
      subject_person_id: SUBJECT,
      data_classification_codes: ['body'],
      scope_description: 'Mediciones del expediente 2026-114',
      reason_code: 'judicial_order',
      case_reference: 'JUZGADO-2026-114',
    })
    expect(application.valid_to).toBe(new Date('2026-12-22T23:59:59').toISOString())
  })

  test('a form opened from a request starts with that person and what is still waiting', () => {
    expect(emptyHold(SUBJECT, ['health'])).toMatchObject({
      subjectPersonId: SUBJECT,
      categories: ['health'],
      scopeDescription: '',
      validTo: '',
    })
  })

  test('a hold in force says when it ends, and its last days are marked', () => {
    const [far, near] = holdRows(
      page([hold(), hold({ id: 'near', valid_to: '2026-09-26T12:00:00.000Z' })]),
      NOW,
    )

    expect(far).toMatchObject({ state: 'active', stateLabel: 'Vence en 40 días' })
    expect(near).toMatchObject({ state: 'due_soon', stateLabel: 'Vence en 3 días' })
    expect(holdTone('due_soon')).toBe('warning')
  })

  test('an ended hold says whether someone released it or its own date ended it', () => {
    const [released, lapsed, unswept] = holdRows(
      page([
        hold({
          status: 'released',
          released_at: '2026-09-20T12:00:00.000Z',
          released_by_person_id: '019ae000-0000-7000-8000-000000000007',
          suspended_items: 0,
        }),
        hold({
          status: 'lapsed',
          valid_to: '2026-09-21T12:00:00.000Z',
          lapsed_at: '2026-09-21T12:01:00.000Z',
          suspended_items: 0,
        }),
        // Past its date before the worker recorded it: it already keeps nothing new.
        hold({ valid_to: '2026-09-22T12:00:00.000Z' }),
      ]),
      NOW,
    )

    expect(released?.state).toBe('released')
    expect(released?.stateLabel).toContain('Liberada el')
    expect(lapsed?.state).toBe('lapsed')
    expect(lapsed?.stateLabel).toContain('Venció el')
    expect(unswept?.state).toBe('lapsed')
  })

  test('each hold names the person, the kinds of data and what it is stopping now', () => {
    const [row] = holdRows(page([hold()]), NOW)
    const [idle] = holdRows(page([hold({ suspended_items: 0, items: 0 })]), NOW)

    expect(row).toMatchObject({
      subject: SUBJECT,
      kinds: 'Cuerpo · Nutrición',
      reason: 'orden judicial',
      reference: 'JUZGADO-2026-301',
      holding: '2 borrados detenidos',
    })
    expect(idle?.holding).toBe('Ningún borrado detenido todavía')
    expect(holdReasonLabel('tax_or_accounting_obligation')).toBe('obligación contable o tributaria')
  })

  test('the summary counts what ends within a week before any row is read', () => {
    const holds = page([hold(), hold({ id: 'near', valid_to: '2026-09-26T12:00:00.000Z' })], true)

    expect(holdsSummary(holds, 'active', NOW)).toBe(
      '2 retenciones vigentes, 1 vence esta semana. Hay más de las que caben en esta página.',
    )
    expect(holdsSummary(page([]), 'ended', NOW)).toBe('Ninguna retención terminada.')
    expect(holdsEmptyMessage('active')).toContain('No hay retenciones vigentes')
  })
})
