import { describe, expect, test } from 'bun:test'

import {
  campaignFrom,
  failureOf,
  isPlausibleEmail,
  normalizeReferralCode,
  parseJoin,
  parseLink,
  referralLink,
  tokenFromFragment,
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

describe('joining’s answer', () => {
  test('a new address gets its code and a whole, non-negative count', () => {
    expect(parseJoin({ status: 'joined', referral_code: 'kevin7qh', referrals: 3 })).toEqual({
      status: 'joined',
      code: 'KEVIN7QH',
      referrals: 3,
    })
  })

  test('an address already on the list gets neither', () => {
    expect(parseJoin({ status: 'already_listed' })).toEqual({ status: 'already_listed' })
  })

  test('anything else is refused, so the form shows its failure', () => {
    for (const body of [
      null,
      'KEVIN7QH',
      { referral_code: 'KEVIN7QH', referrals: 3 },
      { status: 'joined', referral_code: 'KEVIN7QH' },
      { status: 'joined', referral_code: 'K', referrals: 0 },
      { status: 'joined', referral_code: 'KEVIN7QH', referrals: -1 },
      { status: 'joined', referral_code: 'KEVIN7QH', referrals: 1.5 },
      { status: 'joined', referral_code: 'KEVIN7QH', referrals: '3' },
    ]) {
      expect(() => parseJoin(body)).toThrow()
    }
  })
})

describe('a private link’s answer', () => {
  test('is the person’s code, count and whether they confirmed', () => {
    expect(
      parseLink({ referral_code: 'kevin7qh', referrals: 7, language: 'es', confirmed: false }),
    ).toEqual({ code: 'KEVIN7QH', referrals: 7, confirmed: false })
  })

  test('without all three it is refused', () => {
    for (const body of [
      {},
      { referral_code: 'KEVIN7QH', referrals: 7 },
      { referral_code: 'KEVIN7QH', confirmed: true },
      { referrals: 7, confirmed: true },
    ]) {
      expect(() => parseLink(body)).toThrow()
    }
  })
})

describe('a failed request', () => {
  test('names the disposable address and the rate limit, and nothing else', () => {
    expect(failureOf(422, { error: 'disposable-email' }).reason).toBe('disposable-email')
    expect(failureOf(429, { error: 'rate-limited' }).reason).toBe('rate-limited')
    expect(failureOf(422, { error: 'something-else' }).reason).toBe('unavailable')
    expect(failureOf(503, { error: 'unavailable' }).reason).toBe('unavailable')
    expect(failureOf(400, null).reason).toBe('unavailable')
  })
})

describe('campaigns', () => {
  test('are read from the three utm parameters, trimmed', () => {
    const search = new URLSearchParams(
      'utm_source=instagram&utm_medium=%20story%20&utm_campaign=launch&ref=KEVIN7QH',
    )
    expect(campaignFrom(search)).toEqual({
      source: 'instagram',
      medium: 'story',
      campaign: 'launch',
    })
  })

  test('a value the API would refuse is dropped, never cut', () => {
    const search = new URLSearchParams({
      utm_source: 'x'.repeat(65),
      utm_campaign: '   ',
    })
    expect(campaignFrom(search)).toEqual({})
  })
})

describe('email link tokens', () => {
  const token = 'A'.repeat(21) + '_-' + 'z9'.repeat(10)

  test('come from the fragment, as 43 base64url characters', () => {
    expect(token).toHaveLength(43)
    expect(tokenFromFragment(`#token=${token}`)).toBe(token)
  })

  test('anything shorter, longer or with other characters is no token', () => {
    for (const hash of [
      '',
      '#',
      `#token=${token.slice(1)}`,
      `#token=${token}A`,
      `#token=${token.slice(1)}=`,
      `#ref=${token}`,
    ]) {
      expect(tokenFromFragment(hash)).toBeNull()
    }
  })
})

test('an email only has to look like one; the confirmation proves it', () => {
  expect(isPlausibleEmail('kevin@correo.com')).toBe(true)
  expect(isPlausibleEmail('kevin@correo')).toBe(false)
  expect(isPlausibleEmail('kevin correo.com')).toBe(false)
})
