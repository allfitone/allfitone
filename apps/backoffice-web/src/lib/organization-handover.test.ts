import { describe, expect, test } from 'bun:test'

import {
  EMPTY_HANDOVER_DRAFT,
  canActOn,
  cancelledBySentence,
  createdBySentence,
  fileLink,
  handoverDraftIssue,
  handoverMessage,
  handoverStage,
  resendNotice,
  responsibleSentence,
  stageSentence,
  toHandoverCreate,
  type HandoverDraft,
  type OrganizationHandover,
} from './organization-handover'

const NOW = Date.parse('2026-09-14T12:00:00.000Z')

function handover(overrides: Partial<OrganizationHandover> = {}): OrganizationHandover {
  return {
    organization_id: '019a6000-0000-7000-8000-000000000001',
    display_name: 'Handover Norte',
    type_code: 'gym',
    type_name: 'Gimnasio',
    party_kind: 'legal_entity',
    legal_name: 'Norte Fitness SAS',
    status: 'unclaimed',
    created_at: '2026-09-13T12:00:00.000Z',
    claimed_at: null,
    cancelled_at: null,
    created_by: { person_id: '019a6000-0000-7000-8000-000000000004', name: 'Mateo Ciclo' },
    cancelled_by: null,
    site: null,
    invitation: {
      invitation_id: '019a6000-0000-7000-8000-000000000101',
      status: 'pending',
      intent_status: 'pending',
      contact_hint: 'o***@example.test',
      expires_at: '2026-09-20T12:00:00.000Z',
    },
    ...overrides,
  }
}

// HU-BO-014 c7 and HU-BO-015 c3: who on Allfit's team created it, and who cancelled it.
describe('who on the team created and cancelled a gym', () => {
  test('the creator is named', () => {
    expect(createdBySentence(handover())).toBe('Lo creó Mateo Ciclo, del equipo de Allfit.')
    expect(cancelledBySentence(handover())).toBeUndefined()
  })

  test('and so is whoever cancelled it', () => {
    const cancelled = handover({
      status: 'cancelled',
      cancelled_at: '2026-09-14T12:00:00.000Z',
      cancelled_by: { person_id: '019a6000-0000-7000-8000-000000000006', name: 'Sara Ciclo' },
    })
    expect(cancelledBySentence(cancelled)).toBe('Lo canceló Sara Ciclo.')
  })

  test('a gym nobody at Allfit created says so instead of naming somebody', () => {
    expect(createdBySentence(handover({ created_by: null }))).toBe(
      'No lo creó nadie del equipo de Allfit.',
    )
  })

  // HU-BO-034 c1: the quota is set in the gym's file, and an unclaimed gym had no way there.
  test('an unclaimed gym leads to its file, where its quota is set', () => {
    expect(fileLink(handover())).toEqual({
      href: '/organizations/019a6000-0000-7000-8000-000000000001',
      label: 'Fijar su cupo en la ficha del gimnasio',
    })
    expect(fileLink(handover({ status: 'active' }))?.label).toBe('Ver la ficha del gimnasio')
    expect(fileLink(handover({ status: 'cancelled' }))).toBeUndefined()
  })
})

const company: HandoverDraft = {
  ...EMPTY_HANDOVER_DRAFT,
  displayName: '  Handover Norte ',
  typeCode: 'gym',
  partyKind: 'legal_entity',
  legalName: ' Norte Fitness SAS ',
  ownerEmail: ' Owner@Example.test ',
}

describe('organization handover presentation', () => {
  test('a company is named, and a natural person never is', () => {
    expect(handoverDraftIssue({ ...company, legalName: '' })).toBe('legal-name')
    const person = toHandoverCreate({
      ...company,
      partyKind: 'natural_person',
      legalName: 'Somebody Typed This',
    })
    expect(person.legal_name).toBeNull()
    expect(JSON.stringify(person)).not.toContain('Somebody Typed This')
  })

  test('sends only a clean command, with the site left out when it has no name', () => {
    expect(handoverDraftIssue(company)).toBeUndefined()
    expect(toHandoverCreate(company)).toEqual({
      display_name: 'Handover Norte',
      type_code: 'gym',
      party_kind: 'legal_entity',
      legal_name: 'Norte Fitness SAS',
      site: null,
      owner_email: 'owner@example.test',
    })
    expect(toHandoverCreate({ ...company, siteName: 'Sede', siteAddress: '' }).site).toEqual({
      name: 'Sede',
      address: null,
    })
    expect(handoverDraftIssue({ ...company, siteAddress: 'Calle 1' })).toBe('site-name')
    expect(handoverDraftIssue({ ...company, ownerEmail: 'no es un correo' })).toBe('email')
  })

  test('tells waiting, lapsed, declined, claimed and cancelled apart', () => {
    const invitation = handover().invitation
    if (!invitation) throw new Error('the fixture handover carries an invitation')
    expect(handoverStage(handover(), NOW)).toBe('waiting')
    expect(
      handoverStage(
        handover({ invitation: { ...invitation, expires_at: '2026-09-01T00:00:00.000Z' } }),
        NOW,
      ),
    ).toBe('lapsed')
    expect(
      handoverStage(
        handover({
          invitation: { ...invitation, status: 'completed', intent_status: 'rejected' },
        }),
        NOW,
      ),
    ).toBe('declined')
    expect(handoverStage(handover({ status: 'active' }), NOW)).toBe('claimed')
    expect(handoverStage(handover({ status: 'cancelled' }), NOW)).toBe('cancelled')
  })

  test('a waiting handover is never described as done', () => {
    const sentence = stageSentence(handover(), 'waiting')
    expect(sentence).toContain('no opera hasta que su dueño acepte')
    expect(sentence).toContain('o***@example.test')
  })

  test('only a handover that still waits can be resent or cancelled', () => {
    expect(canActOn('waiting')).toBeTrue()
    expect(canActOn('lapsed')).toBeTrue()
    expect(canActOn('declined')).toBeTrue()
    expect(canActOn('claimed')).toBeFalse()
    expect(canActOn('cancelled')).toBeFalse()
  })

  test('says whether a resend reused the invitation or replaced it', () => {
    expect(resendNotice('waiting')).toContain('misma invitación')
    expect(resendNotice('lapsed')).toContain('invitación nueva')
  })

  test('names a natural person only as a person until they accept', () => {
    expect(
      responsibleSentence(handover({ party_kind: 'natural_person', legal_name: null })),
    ).toContain('se toma de su propia cuenta')
    expect(responsibleSentence(handover())).toBe('Norte Fitness SAS')
  })

  test('explains a lost race and an expired duty', () => {
    expect(handoverMessage('conflict')).toContain('Se volvió a leer su estado')
    expect(handoverMessage('forbidden')).toContain('vencen por diseño')
  })
})
