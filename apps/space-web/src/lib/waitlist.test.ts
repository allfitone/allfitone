import { describe, expect, test } from 'bun:test'

import {
  isPlausibleEmail,
  nextReferralLevel,
  normalizeReferralCode,
  parseJoined,
  reachedReferralLevel,
  referralLink,
  whatsappShareUrl,
} from './waitlist'

describe('referral codes', () => {
  test('are read in capitals, trimmed, and only as 4 to 16 letters and digits', () => {
    expect(normalizeReferralCode(' kevin7qh ')).toBe('KEVIN7QH')
    expect(normalizeReferralCode('ABC')).toBeNull()
    expect(normalizeReferralCode('A'.repeat(17))).toBeNull()
    expect(normalizeReferralCode('KEVIN-7')).toBeNull()
    expect(normalizeReferralCode(null)).toBeNull()
  })

  test('the link opens the waitlist page in the sharer’s language', () => {
    expect(referralLink('es', 'KEVIN7QH')).toBe('https://space.allfit.one/es/waitlist?ref=KEVIN7QH')
    expect(referralLink('en', 'KEVIN7QH')).toBe('https://space.allfit.one/en/waitlist?ref=KEVIN7QH')
  })

  test('WhatsApp gets the whole message, link included', () => {
    expect(whatsappShareUrl('Únete: https://x.y/?ref=A1B2')).toBe(
      'https://wa.me/?text=%C3%9Anete%3A%20https%3A%2F%2Fx.y%2F%3Fref%3DA1B2',
    )
  })
})

describe('referral levels', () => {
  test('the next level is the first one above the count, and none past the last', () => {
    expect(nextReferralLevel(0)).toBe(5)
    expect(nextReferralLevel(5)).toBe(15)
    expect(nextReferralLevel(29)).toBe(30)
    expect(nextReferralLevel(100)).toBeNull()
  })

  test('the reached level is the highest one at or below the count', () => {
    expect(reachedReferralLevel(4)).toBe(0)
    expect(reachedReferralLevel(5)).toBe(5)
    expect(reachedReferralLevel(42)).toBe(30)
    expect(reachedReferralLevel(250)).toBe(100)
  })
})

describe('the endpoint’s answer', () => {
  test('is a code and a whole, non-negative count', () => {
    expect(parseJoined({ code: 'kevin7qh', referrals: 3 })).toEqual({
      code: 'KEVIN7QH',
      referrals: 3,
    })
  })

  test('anything else is refused, so the form shows its failure', () => {
    for (const body of [
      null,
      'KEVIN7QH',
      { code: 'KEVIN7QH' },
      { code: 'K', referrals: 0 },
      { code: 'KEVIN7QH', referrals: -1 },
      { code: 'KEVIN7QH', referrals: 1.5 },
      { code: 'KEVIN7QH', referrals: '3' },
    ]) {
      expect(() => parseJoined(body)).toThrow()
    }
  })
})

test('an email only has to look like one; the confirmation proves it', () => {
  expect(isPlausibleEmail('kevin@correo.com')).toBe(true)
  expect(isPlausibleEmail('kevin@correo')).toBe(false)
  expect(isPlausibleEmail('kevin correo.com')).toBe(false)
})
