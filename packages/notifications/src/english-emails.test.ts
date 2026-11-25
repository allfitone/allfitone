import { describe, expect, test } from 'bun:test'

import {
  renderClientInvitationEmail,
  renderCorrectionProposedEmail,
  renderEmailChangeCodeEmail,
  renderEmailChangedNoticeEmail,
  renderPasswordChangedNoticeEmail,
  renderProfessionalReassignedEmail,
  renderSubscriptionEndedEmail,
  renderSubscriptionReactivatedEmail,
  renderSubscriptionSuspendedEmail,
  renderSubstitutionProposedEmail,
} from './index.js'

// What a reader sees: the shell keeps names together with non-breaking spaces.
const readable = (html: string) => html.replaceAll('&nbsp;', ' ')

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'

// Words that would only be there if a Spanish sentence leaked into an English email.
const SPANISH = /\b(tu|tus|te|que|correo|gimnasio|hasta|plan con)\b|ñ|á|é|í|ó/i

function expectEnglish(rendered: { subject: string; text: string; html: string }): void {
  expect(readable(rendered.html)).toContain('<html lang="en">')
  expect(rendered.subject).not.toMatch(SPANISH)
  expect(rendered.text).not.toMatch(SPANISH)
}

describe('the Space notice emails speak English when she chose it (ADR-054 decision 8)', () => {
  test('the client invitation, with the gym’s name untranslated and the date as she reads it', () => {
    const rendered = renderClientInvitationEmail({
      organizationName: 'Entrena Norte',
      invitationUrl: 'https://app.allfit.one/client-invitations#token=client-token',
      brandAssetUrl: BRAND,
      expiresAt: new Date('2026-10-11T12:00:00.000Z'),
      locale: 'en',
    })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Entrena Norte invited you as a client on Allfit One')
    expect(rendered.text).toContain('asks your permission to see information about you')
    expect(rendered.text).toContain('Valid until: 11 October 2026')
    expect(rendered.text).toContain('Opening this email doesn’t decide anything either.')
    expect(readable(rendered.html)).toContain('Review invitation')
    expect(readable(rendered.html)).toContain('GYM')
  })

  test('the reassignment says what did not change', () => {
    const rendered = renderProfessionalReassignedEmail({
      organizationName: 'Entrena Norte',
      professionalName: 'Laura Gómez',
      previousProfessionalName: 'Camilo Ruiz',
      brandAssetUrl: BRAND,
      locale: 'en',
    })

    expect(readable(rendered.html)).toContain('<html lang="en">')
    expect(rendered.subject).toBe('Laura Gómez is now your professional at Entrena Norte')
    expect(rendered.text).toContain('Before: Camilo Ruiz')
    expect(rendered.text).toContain('Camilo Ruiz no longer has access to your information.')
    expect(readable(rendered.html)).toContain('NOW WORKING WITH YOU')
  })

  test('the cover asks, and gives its days in English', () => {
    const rendered = renderSubstitutionProposedEmail({
      organizationName: 'Entrena Norte',
      substituteName: 'Laura',
      holderName: 'Camilo',
      startsOn: '2026-10-12',
      endsOn: '2026-10-30',
      brandAssetUrl: BRAND,
      locale: 'en',
    })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Will you let Laura work with you while Camilo is away?')
    expect(rendered.text).toContain('from 12 October 2026 to 30 October 2026')
    expect(rendered.text).toContain('Nothing happens until you answer.')
    expect(rendered.html).toContain('12&nbsp;October&nbsp;2026 – 30&nbsp;October&nbsp;2026')
    expect(readable(rendered.html)).toContain('ONLY THESE DAYS')
  })

  test('the correction proposal keeps Bogotá’s day for its deadline', () => {
    const rendered = renderCorrectionProposedEmail({
      organizationName: 'Entrena Norte',
      proposerName: 'Laura',
      // 03:00 UTC is still the 12th in Bogotá.
      expiresAt: new Date('2026-10-13T03:00:00.000Z'),
      brandAssetUrl: BRAND,
      locale: 'en',
    })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Laura proposes correcting something in your training')
    expect(rendered.text).toContain('until 12 October 2026')
    expect(readable(rendered.html)).toContain('YOU CAN ANSWER UNTIL')
  })

  test('the three plan notices, with the plan’s name untranslated', () => {
    const paused = renderSubscriptionSuspendedEmail({
      organizationName: 'Entrena Norte',
      planName: 'Plan Oro',
      amountMinor: 12_000_000,
      currencyCode: 'COP',
      brandAssetUrl: BRAND,
      locale: 'en',
    })
    expect(readable(paused.html)).toContain('<html lang="en">')
    expect(paused.subject).toBe('Entrena Norte paused your plan over a pending payment')
    // Intl keeps the currency and the amount together with a no-break space.
    expect(paused.text.replaceAll('\u00a0', ' ')).toContain('your Plan Oro plan (COP 120,000.00)')
    expect(paused.text).toContain('We will never ask for your card details by email.')

    const resumed = renderSubscriptionReactivatedEmail({
      organizationName: 'Entrena Norte',
      planName: 'Mensual',
      brandAssetUrl: BRAND,
      locale: 'en',
    })
    expectEnglish(resumed)
    expect(resumed.subject).toBe('Entrena Norte reactivated your plan')
    expect(resumed.text).toContain('the plan was paused, not cancelled')

    const ended = renderSubscriptionEndedEmail({
      organizationName: 'Entrena Norte',
      planName: 'Mensual',
      brandAssetUrl: BRAND,
      locale: 'en',
    })
    expectEnglish(ended)
    expect(ended.subject).toBe('Your plan with Entrena Norte ended')
    expect(ended.text).toContain(
      'Your Mensual plan with Entrena Norte ended. You won’t be charged again.',
    )
  })
})

describe('the security emails speak English when she chose it', () => {
  test('the password notice', () => {
    const rendered = renderPasswordChangedNoticeEmail({ brandAssetUrl: BRAND, locale: 'en' })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Your Allfit password changed')
    expect(readable(rendered.html)).toContain('Not you?')
  })

  test('the code that confirms a new email, one minute singular', () => {
    const rendered = renderEmailChangeCodeEmail({
      code: '482913',
      minutes: 30,
      brandAssetUrl: BRAND,
      locale: 'en',
    })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Your code to change your Allfit email')
    expect(rendered.text).toContain('Your code: 482913\nIt expires in 30 minutes.')
    expect(readable(rendered.html)).toContain('YOUR CODE')

    const last = renderEmailChangeCodeEmail({
      code: '482913',
      minutes: 1,
      brandAssetUrl: BRAND,
      locale: 'en',
    })
    expect(last.text).toContain('It expires in 1 minute.')
  })

  test('the notice to the previous address', () => {
    const rendered = renderEmailChangedNoticeEmail({
      newEmailHint: '••••••••va@example.test',
      brandAssetUrl: BRAND,
      locale: 'en',
    })

    expectEnglish(rendered)
    expect(rendered.subject).toBe('Your Allfit email changed')
    expect(rendered.text).toContain('New email: ••••••••va@example.test')
  })
})

describe('Spanish stays what it always was', () => {
  test('naming Spanish renders exactly what no language renders', () => {
    const input = {
      organizationName: 'Entrena Norte',
      planName: 'Mensual',
      brandAssetUrl: BRAND,
    }
    expect(renderSubscriptionEndedEmail({ ...input, locale: 'es' })).toEqual(
      renderSubscriptionEndedEmail(input),
    )
    expect(renderPasswordChangedNoticeEmail({ brandAssetUrl: BRAND, locale: 'es' })).toEqual(
      renderPasswordChangedNoticeEmail({ brandAssetUrl: BRAND }),
    )
  })
})
