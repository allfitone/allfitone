import { describe, expect, test } from 'bun:test'

import {
  AGREEMENT_REQUIRED,
  LOWERING_NOTE,
  UNLIMITED_NOTE,
  agreementSentence,
  draftWarning,
  lastChangeSentence,
  occupancySentence,
  parseAgreementReference,
  parseSeats,
  placesLeftSentence,
  quotaHistoryRows,
  quotaMessage,
  quotaOutcomeMessage,
  quotaSentence,
  type OrganizationGuestQuota,
} from './organization-guest-quota'

const ORGANIZATION = '019ab000-0000-7000-8000-000000000301'
const PERSON = '019ab000-0000-7000-8000-000000000003'
const ASSIGNMENT = '019ab000-0000-7000-8000-000000000701'

function quota(overrides: Partial<OrganizationGuestQuota> = {}): OrganizationGuestQuota {
  return {
    organization_id: ORGANIZATION,
    seats: 50,
    agreement_reference: 'CONTRATO-2026-014',
    occupied: 3,
    relationships_active: 2,
    invitations_pending: 1,
    places_left: 47,
    over_quota: false,
    last_change: {
      at: '2026-10-15T15:00:00.000Z',
      by_person_id: PERSON,
      by_name: 'Lucía Comercial',
      by_duty_assignment_id: ASSIGNMENT,
      previous_seats: null,
      agreement_reference: 'CONTRATO-2026-014',
    },
    history: [
      {
        at: '2026-10-15T15:00:00.000Z',
        by_person_id: PERSON,
        by_name: 'Lucía Comercial',
        seats: 50,
        previous_seats: null,
        agreement_reference: 'CONTRATO-2026-014',
      },
    ],
    ...overrides,
  }
}

describe('what a gym may fill, as the panel says it', () => {
  test('a gym with a number is told what it is', () => {
    expect(quotaSentence(quota())).toBe('Puede tener 50 personas a la vez.')
    expect(quotaSentence(quota({ seats: 1 }))).toBe('Puede tener 1 persona a la vez.')
  })

  test('never having a quota is told apart from a deal with no cap', () => {
    expect(quotaSentence(quota({ seats: null, last_change: null }))).toContain(
      'No tiene cupo fijado',
    )
    expect(quotaSentence(quota({ seats: null }))).toContain('acuerdo sin tope')
  })

  test('the occupancy keeps relationships and unanswered invitations apart', () => {
    expect(occupancySentence(quota())).toBe(
      'Ocupa 3: 2 relaciones vigentes y 1 invitación sin responder.',
    )
    expect(occupancySentence(quota({ occupied: 2, invitations_pending: 0 }))).toContain(
      'ninguna invitación sin responder',
    )
  })

  test('what is left is counted, and no limit leaves nothing to count', () => {
    expect(placesLeftSentence(quota())).toBe('Le quedan 47 lugares.')
    expect(placesLeftSentence(quota({ places_left: 1 }))).toBe('Le queda 1 lugar.')
    expect(placesLeftSentence(quota({ places_left: 0 }))).toBe('No le queda ningún lugar.')
    expect(placesLeftSentence(quota({ seats: null, places_left: null }))).toContain(
      'no tiene límite',
    )
  })

  test('over its quota says by how much, and that nobody is thrown out', () => {
    const line = placesLeftSentence(
      quota({ seats: 1, occupied: 3, places_left: 0, over_quota: true }),
    )
    expect(line).toContain('por encima de su cupo en 2 personas')
    expect(line).toContain('invitaciones nuevas')
  })

  test('the last change says what the number replaced, including no limit', () => {
    expect(lastChangeSentence(quota())).toBe(
      'Último cambio, por Lucía Comercial: antes no tenía límite.',
    )
    expect(
      lastChangeSentence(
        quota({
          last_change: {
            at: '2026-10-15T15:00:00.000Z',
            by_person_id: PERSON,
            by_name: 'Pablo Comercial',
            by_duty_assignment_id: ASSIGNMENT,
            previous_seats: 20,
            agreement_reference: 'OTROSI-2026-031',
          },
        }),
      ),
    ).toBe('Último cambio, por Pablo Comercial: antes eran 20 personas.')
    expect(lastChangeSentence(quota({ last_change: null }))).toContain('Nadie ha fijado el cupo')
  })

  // HU-BO-034 c3: who, when and the previous value of every change, not only the last.
  test('every change is listed, newest first, with who made it and what it replaced', () => {
    const rows = quotaHistoryRows(
      quota({
        history: [
          {
            at: '2026-10-20T15:00:00.000Z',
            by_person_id: PERSON,
            by_name: null,
            seats: null,
            previous_seats: 30,
            agreement_reference: 'OTROSI-2026-031',
          },
          {
            at: '2026-10-18T15:00:00.000Z',
            by_person_id: PERSON,
            by_name: 'Pablo Comercial',
            seats: 30,
            previous_seats: 50,
            agreement_reference: 'CONTRATO-2026-014',
          },
          {
            at: '2026-10-15T15:00:00.000Z',
            by_person_id: PERSON,
            by_name: 'Lucía Comercial',
            seats: 1,
            previous_seats: null,
            agreement_reference: null,
          },
        ],
      }),
    )
    expect(rows.map((row) => [row.at, row.who, row.change, row.agreement])).toEqual([
      [
        '2026-10-20T15:00:00.000Z',
        'alguien del equipo (019ab000)',
        '30 personas → sin límite',
        'acuerdo OTROSI-2026-031',
      ],
      [
        '2026-10-18T15:00:00.000Z',
        'Pablo Comercial',
        '50 personas → 30 personas',
        'acuerdo CONTRATO-2026-014',
      ],
      [
        '2026-10-15T15:00:00.000Z',
        'Lucía Comercial',
        'Sin límite → 1 persona',
        'sin referencia de acuerdo',
      ],
    ])
    expect(new Set(rows.map((row) => row.key)).size).toBe(3)
    expect(quotaHistoryRows(quota({ last_change: null, history: [] }))).toEqual([])
  })

  // HU-BO-027 c2: the agreement a number stands on is said beside the number.
  test('the agreement in force is named, and its absence is told apart', () => {
    expect(agreementSentence(quota())).toBe('Acuerdo vigente: CONTRATO-2026-014.')
    expect(agreementSentence(quota({ agreement_reference: null, last_change: null }))).toBe(
      'Todavía no hay un acuerdo registrado.',
    )
    expect(agreementSentence(quota({ agreement_reference: null }))).toContain(
      'se fijó sin referencia de acuerdo',
    )
  })

  test('an agreement is one line naming the deal, and an empty box is not one', () => {
    expect(parseAgreementReference('  CONTRATO-2026-014 ')).toBe('CONTRATO-2026-014')
    expect(parseAgreementReference('A'.repeat(120))).toBe('A'.repeat(120))
    expect(parseAgreementReference('')).toBeUndefined()
    expect(parseAgreementReference('   ')).toBeUndefined()
    expect(parseAgreementReference('A'.repeat(121))).toBeUndefined()
    expect(parseAgreementReference('CONTRATO\t2026')).toBeUndefined()
    expect(AGREEMENT_REQUIRED).toContain('referencia del acuerdo')
  })

  test('no limit is a decision, and an empty box is not one', () => {
    expect(parseSeats('', true)).toEqual({ seats: null })
    expect(parseSeats('50', false)).toEqual({ seats: 50 })
    expect(parseSeats('  50 ', false)).toEqual({ seats: 50 })
    expect(parseSeats('', false)).toBeUndefined()
    expect(parseSeats('0', false)).toBeUndefined()
    expect(parseSeats('-1', false)).toBeUndefined()
    expect(parseSeats('1.5', false)).toBeUndefined()
    expect(parseSeats('1000001', false)).toBeUndefined()
    expect(parseSeats('cincuenta', false)).toBeUndefined()
  })

  test('a number below the occupancy is warned about before it is sent', () => {
    expect(draftWarning({ seats: 1 }, quota())).toContain('por debajo de lo que ya ocupa, por 2')
    expect(draftWarning({ seats: 2 }, quota())).toContain('1 persona')
    expect(draftWarning({ seats: 3 }, quota())).toBeUndefined()
    expect(draftWarning({ seats: null }, quota())).toBeUndefined()
    expect(draftWarning(undefined, quota())).toBeUndefined()
  })

  test('the notes say what nobody can read off the number', () => {
    expect(UNLIMITED_NOTE).toContain('Sin cupo fijado')
    expect(LOWERING_NOTE).toContain('no termina ninguna relación')
  })

  test('a refusal names the duty that is missing, which creates no gym', () => {
    expect(quotaMessage('forbidden')).toContain('manage_platform_commercial')
    expect(quotaMessage('conflict')).toContain('ya no opera')
    expect(quotaMessage('network-unavailable')).toContain('El cupo no cambió')
    expect(quotaMessage('unknown')).toBe('No se pudo fijar el cupo.')
    expect(quotaMessage('validation-failed')).toContain('referencia del acuerdo')
  })

  test('and the outcome repeats the number that was written, and its agreement', () => {
    expect(quotaOutcomeMessage(quota({ seats: 50 }))).toBe(
      'Listo: su cupo queda en 50 personas, bajo el acuerdo CONTRATO-2026-014.',
    )
    expect(quotaOutcomeMessage(quota({ seats: null }))).toBe(
      'Listo: este gimnasio queda sin límite de personas, bajo el acuerdo CONTRATO-2026-014.',
    )
  })
})
