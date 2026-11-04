import { describe, expect, test } from 'bun:test'

import {
  actorModeLabel,
  DEFAULT_DUTY_DAYS,
  MAX_DUTY_DAYS,
  PLATFORM_DUTY_CODES,
  dutyExpiryFromDays,
  dutyLabel,
  dutyStatusLabel,
  dutyStatusTone,
  formatInstant,
  isDutyClosed,
  canRecertify,
  DUTY_STATUS_FILTERS,
  isValidDutyDays,
  isValidPersonId,
  isValidReasonCode,
  platformAccessMessage,
  roleStatusLabel,
  shortIdentifier,
} from './platform-access'

describe('platform access presentation rules', () => {
  test('names every duty of the closed catalogue', () => {
    expect(PLATFORM_DUTY_CODES).toHaveLength(13)
    for (const code of PLATFORM_DUTY_CODES) {
      expect(dutyLabel(code).length).toBeGreaterThan(0)
      expect(dutyLabel(code)).not.toBe(code)
    }
  })

  // ADR-037 names the modes; a bare code told the operator nothing about the duty.
  test('names every actor mode instead of showing its code', () => {
    expect(actorModeLabel('A10')).toBe('Soporte y operación')
    expect(actorModeLabel('A11')).toBe('Curaduría y verificación')
    expect(actorModeLabel('A12')).toBe('Seguridad y privacidad')
  })

  test('distinguishes every duty state an operator has to tell apart', () => {
    const states = ['scheduled', 'active', 'suspended', 'expired', 'revoked'] as const
    const labels = states.map((state) => dutyStatusLabel(state))
    expect(new Set(labels).size).toBe(states.length)
    expect(dutyStatusTone('active')).toBe('success')
    expect(dutyStatusTone('revoked')).toBe('destructive')
    expect(dutyStatusTone('suspended')).toBe('warning')
  })

  test('tells a retired base role apart from an effective one', () => {
    expect(roleStatusLabel('active')).not.toBe(roleStatusLabel('revoked'))
  })

  test('offers closing actions only while an assignment can still be closed', () => {
    expect(isDutyClosed('active')).toBe(false)
    expect(isDutyClosed('scheduled')).toBe(false)
    expect(isDutyClosed('suspended')).toBe(false)
    expect(isDutyClosed('expired')).toBe(true)
    expect(isDutyClosed('revoked')).toBe(true)
  })

  test('offers recertification only for a duty in force (HU-BO-028 c4)', () => {
    // A suspended, scheduled or closed duty is not attested: it is reinstated or granted.
    expect(canRecertify('active')).toBe(true)
    expect(canRecertify('scheduled')).toBe(false)
    expect(canRecertify('suspended')).toBe(false)
    expect(canRecertify('expired')).toBe(false)
    expect(canRecertify('revoked')).toBe(false)
  })

  test('filters the inventory by every state the API answers, and by none', () => {
    expect(DUTY_STATUS_FILTERS.map((option) => option.value)).toEqual([
      '',
      'active',
      'scheduled',
      'suspended',
      'expired',
      'revoked',
    ])
    expect(DUTY_STATUS_FILTERS[0]?.label).toBe('Todos los estados')
  })

  test('shortens an identifier for reading without inventing a new one', () => {
    const id = '019a3000-0000-7000-8000-000000000001'
    expect(shortIdentifier(id)).toBe('019a3000…0001')
    expect(shortIdentifier('short')).toBe('short')
  })

  test('shows an unknown instant as absent, never as a zero', () => {
    expect(formatInstant(null)).toBe('—')
    expect(formatInstant(undefined)).toBe('—')
    expect(formatInstant('not a date')).toBe('—')
    expect(formatInstant('2026-09-06T12:00:00.000Z')).not.toBe('—')
  })

  test('keeps a proposed duty window inside the ninety-day bound', () => {
    const now = new Date('2026-09-06T12:00:00.000Z')
    expect(DEFAULT_DUTY_DAYS).toBeLessThan(MAX_DUTY_DAYS)
    expect(dutyExpiryFromDays(DEFAULT_DUTY_DAYS, now)).toBe('2026-10-06T12:00:00.000Z')
    // A caller asking for more than the rules allow is clamped, not obeyed.
    expect(dutyExpiryFromDays(365, now)).toBe(
      new Date(now.getTime() + MAX_DUTY_DAYS * 86_400_000).toISOString(),
    )
    expect(dutyExpiryFromDays(0, now)).toBe(new Date(now.getTime() + 86_400_000).toISOString())
  })

  test('rejects a duty length outside the bound before sending it', () => {
    expect(isValidDutyDays(1)).toBe(true)
    expect(isValidDutyDays(90)).toBe(true)
    expect(isValidDutyDays(91)).toBe(false)
    expect(isValidDutyDays(0)).toBe(false)
    expect(isValidDutyDays(1.5)).toBe(false)
  })

  test('accepts an operational reference and refuses free narrative', () => {
    expect(isValidReasonCode('CASE-2026-014')).toBe(true)
    expect(isValidReasonCode('incidente 42')).toBe(true)
    expect(isValidReasonCode('')).toBe(false)
    expect(isValidReasonCode(' leading space')).toBe(false)
    expect(isValidReasonCode('porque Ada lo pidió <script>')).toBe(false)
    expect(isValidReasonCode('x'.repeat(121))).toBe(false)
  })

  test('accepts only a well formed person identifier', () => {
    expect(isValidPersonId('019a3000-0000-7000-8000-000000000001')).toBe(true)
    expect(isValidPersonId('not-a-uuid')).toBe(false)
  })

  test('explains a refused command without blaming the request', () => {
    expect(platformAccessMessage('forbidden')).toContain('deber vigente')
    // A self-assignment is refused with the same code; the message must not blame expiry alone.
    expect(platformAccessMessage('forbidden')).toContain('a sí mismo')
    expect(platformAccessMessage('conflict')).toContain('último administrador')
    expect(platformAccessMessage('unauthenticated')).toContain('sesión')
    expect(platformAccessMessage('something-new')).toBe('No se pudo completar la operación.')
  })
})
