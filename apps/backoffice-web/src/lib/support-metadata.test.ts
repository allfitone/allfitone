import { describe, expect, test } from 'bun:test'

import {
  SUPPORT_LOOKUP_KINDS,
  fileFacts,
  isValidCaseReference,
  isValidLookup,
  lookupIssueMessage,
  lookupLabel,
  supportMetadataMessage,
  verificationLabel,
  type SupportPersonMetadata,
} from './support-metadata'

const metadata: SupportPersonMetadata = {
  person_id: '019a5000-0000-7000-8000-000000000005',
  account_status: 'active',
  created_at: '2026-01-04T10:00:00.000Z',
  activated_at: null,
  contact_email_masked: '••••••••on@example.test',
  contact_phone_masked: null,
  email_verified_at: '2026-01-05T10:05:00.000Z',
  phone_verified_at: null,
  has_access_account: true,
  access_account_linked_at: null,
  active_session_count: 0,
  last_seen_at: null,
  professional_profile: { exists: false, created_at: null },
  membership_count: 0,
  active_membership_count: 0,
  relationships: {
    active: 1,
    ended: 1,
    last_started_at: '2026-08-01T10:00:00.000Z',
    last_ended_at: '2026-10-01T10:00:00.000Z',
  },
  permissions: {
    active: 2,
    frozen: 0,
    revoked: 1,
    last_granted_at: '2026-08-01T10:00:00.000Z',
    last_revoked_at: '2026-09-01T10:00:00.000Z',
  },
  plan: { status: null, started_at: null, current_period_end: null },
  pro: { source: 'organization', until: null },
}

// A fixed rendering, so the sentences are asserted rather than a locale.
const day = (instant: string) => instant.slice(0, 10)

describe('support metadata presentation rules', () => {
  test('offers exactly the three exact lookups, and no name', () => {
    expect(SUPPORT_LOOKUP_KINDS).toEqual(['identifier', 'email', 'phone'])
    expect(SUPPORT_LOOKUP_KINDS.map((kind) => lookupLabel(kind)).join(' ')).not.toContain('ombre')
  })

  test('accepts a structured case reference and refuses free prose', () => {
    expect(isValidCaseReference('CASE-2026-001')).toBe(true)
    expect(isValidCaseReference('  SUP-1234  ')).toBe(true)
    expect(isValidCaseReference('ZD-99887')).toBe(true)
    expect(isValidCaseReference('el usuario no puede entrar')).toBe(false)
    expect(isValidCaseReference('case-2026-001')).toBe(false)
    expect(isValidCaseReference('')).toBe(false)
  })

  test('checks each lookup against its own shape before it travels', () => {
    expect(isValidLookup('identifier', '019a5000-0000-7000-8000-000000000005')).toBe(true)
    expect(isValidLookup('identifier', 'not-a-uuid')).toBe(false)
    expect(isValidLookup('email', 'persona@ejemplo.com')).toBe(true)
    expect(isValidLookup('email', 'persona')).toBe(false)
    expect(isValidLookup('phone', '+573001234567')).toBe(true)
    expect(isValidLookup('phone', '573001234567')).toBe(false)
  })

  test('explains a malformed lookup in the terms of what was asked for', () => {
    const messages = SUPPORT_LOOKUP_KINDS.map((kind) => lookupIssueMessage(kind))
    expect(new Set(messages).size).toBe(SUPPORT_LOOKUP_KINDS.length)
    expect(lookupIssueMessage('phone')).toContain('+')
  })

  test('says what exists around the person, with states and dates (HU-BO-007 c2)', () => {
    expect(fileFacts(metadata, day)).toEqual([
      { label: 'Perfil profesional', value: 'No tiene' },
      {
        label: 'Gimnasios',
        value: 'Entrena en 1 · dejó 1 · último ingreso 2026-08-01 · última salida 2026-10-01',
      },
      {
        label: 'Permisos concedidos',
        value: '2 vigentes · 1 retirado · último concedido 2026-08-01 · último retirado 2026-09-01',
      },
      { label: 'Plan', value: 'Gratis · nunca se suscribió' },
      { label: 'Pro', value: 'Sí, se lo da un gimnasio mientras siga en él' },
    ])
  })

  test('tells nothing from a fact about the person, never as zero', () => {
    const empty = fileFacts(
      {
        ...metadata,
        professional_profile: { exists: true, created_at: '2026-02-01T10:00:00.000Z' },
        relationships: { active: 0, ended: 0, last_started_at: null, last_ended_at: null },
        permissions: {
          active: 0,
          frozen: 0,
          revoked: 0,
          last_granted_at: null,
          last_revoked_at: null,
        },
        plan: {
          status: 'active',
          started_at: '2026-03-01T10:00:00.000Z',
          current_period_end: '2026-12-01T10:00:00.000Z',
        },
        pro: { source: 'subscription', until: '2026-12-01T10:00:00.000Z' },
      },
      day,
    )
    expect(empty.map((fact) => fact.value)).toEqual([
      'Existe desde 2026-02-01',
      'Nunca ha estado en un gimnasio',
      'No ha concedido ninguno',
      'De pago, al día · desde 2026-03-01 · periodo hasta 2026-12-01',
      'Sí, por su suscripción, hasta 2026-12-01',
    ])
  })

  test('a block the server did not send reads as unknown (HU-BO-007 c5)', () => {
    // A database older than the screen answers without the blocks; that is not "none".
    const { relationships: _r, permissions: _p, plan: _l, pro: _o, ...older } = metadata
    expect(fileFacts(older, day).map((fact) => fact.value)).toEqual([
      'No tiene',
      'Sin dato',
      'Sin dato',
      'Sin dato',
      'Sin dato',
    ])
  })

  test('says each subscription state in the words of the case', () => {
    const plan = (status: 'grace' | 'suspended' | 'ended') =>
      fileFacts(
        { ...metadata, plan: { status, started_at: null, current_period_end: null } },
        day,
      )[3]?.value
    expect(plan('grace')).toBe('De pago, en periodo de gracia')
    expect(plan('suspended')).toBe('De pago, suspendido por un cobro que no llegó')
    expect(plan('ended')).toBe('Gratis · su suscripción terminó')
  })

  test('tells a verified contact from an unverified one without inventing a date', () => {
    expect(verificationLabel('2026-01-05T10:05:00.000Z')).toBe('Verificado')
    expect(verificationLabel(null)).toBe('Sin verificar')
  })

  test('explains a refusal as an expired duty rather than a mistake', () => {
    expect(supportMetadataMessage('forbidden')).toContain('vencen por diseño')
    expect(supportMetadataMessage('not-found')).toContain('ninguna persona')
    expect(supportMetadataMessage('anything-else')).toBe(
      'No se pudo leer la información de soporte.',
    )
  })
})
