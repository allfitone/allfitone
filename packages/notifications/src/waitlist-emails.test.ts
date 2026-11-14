import { describe, expect, test } from 'bun:test'

import { renderWaitlistConfirmationEmail, renderWaitlistLinkEmail } from './index.js'

// What a reader sees: the shell keeps names together with non-breaking spaces.
const readable = (html: string) => html.replaceAll('&nbsp;', ' ')

const BASE = {
  name: 'Laura',
  code: 'LAURA7K',
  referralUrl: 'https://space.allfit.one/es/waitlist?ref=LAURA7K',
  referrals: 0,
  referralsPageUrl: 'https://space.allfit.one/es/waitlist/me?token=private-token',
  leaveUrl: 'https://space.allfit.one/es/waitlist/leave#token=private-token',
  brandAssetUrl: 'https://studio.allfit.one/email/allfit-one-lockup-on-light.png',
}

const CONFIRMATION = {
  ...BASE,
  confirmationUrl: 'https://space.allfit.one/es/waitlist/confirm?token=confirm-token',
  expiresAt: new Date('2026-11-16T15:00:00.000Z'),
}

describe('waitlist confirmation email', () => {
  test('asks for the one click first, in Spanish, with the code, the link and the count', () => {
    const { subject, text, html } = renderWaitlistConfirmationEmail({
      ...CONFIRMATION,
      language: 'es',
    })

    expect(subject).toBe('Confirma tu correo para la lista de Allfit Space')
    expect(readable(html)).toContain('<html lang="es">')
    expect(readable(html)).toContain('Confirma tu correo, Laura')
    expect(readable(html)).toContain('SPACE')
    expect(readable(html)).toContain(
      'href="https://space.allfit.one/es/waitlist/confirm?token=confirm-token"',
    )
    expect(readable(html)).toContain('El enlace vence el 16 de noviembre de 2026.')
    expect(readable(html)).toContain('TU CÓDIGO')
    expect(readable(html)).toContain('LAURA7K')
    // Shown without the scheme, and breaking before the query so the code stays whole.
    expect(readable(html)).toContain('space.allfit.one/es/waitlist<wbr>?ref=LAURA7K')
    expect(readable(html)).toContain('Registrados con tu link: 0.')
    expect(readable(html)).toContain('Ver mis referidos')
    expect(readable(html)).toContain('¿No te uniste tú?')
    expect(readable(html)).not.toContain('¿No esperabas esta invitación?')
    // The action comes before the panel that holds the code.
    expect(html.indexOf('Confirmar mi correo')).toBeLessThan(html.indexOf('TU CÓDIGO'))

    expect(text).toContain(`Confirmar mi correo: ${CONFIRMATION.confirmationUrl}`)
    expect(text).toContain(`Tu link para invitar: ${BASE.referralUrl}`)
    expect(text).toContain(`no lo compartas): ${BASE.referralsPageUrl}`)
  })

  test('speaks English to someone who joined in English', () => {
    const { subject, html } = renderWaitlistConfirmationEmail({
      ...CONFIRMATION,
      referralUrl: 'https://space.allfit.one/en/waitlist?ref=LAURA7K',
      language: 'en',
    })

    expect(subject).toBe('Confirm your email for the Allfit Space waitlist')
    expect(readable(html)).toContain('<html lang="en">')
    expect(readable(html)).toContain('Confirm my email')
    expect(readable(html)).toContain('The link expires on 16 November 2026.')
    expect(readable(html)).toContain('YOUR CODE')
    expect(readable(html)).toContain('Signed up with your link: 0.')
    expect(readable(html)).toContain('See my referrals')
    expect(readable(html)).not.toContain('Registrados')
    expect(readable(html)).not.toContain('VÁLIDA')
  })

  test('dates the expiry in Bogotá, so a link that dies at night is not shown lasting a day longer', () => {
    // 03:00 UTC on the 17th is 22:00 on the 16th in Bogotá.
    const { html } = renderWaitlistConfirmationEmail({
      ...CONFIRMATION,
      expiresAt: new Date('2026-11-17T03:00:00.000Z'),
      language: 'es',
    })

    expect(readable(html)).toContain('El enlace vence el 16 de noviembre de 2026.')
  })

  test('never offers the private page as something to share', () => {
    const { html } = renderWaitlistConfirmationEmail({ ...CONFIRMATION, language: 'es' })

    // It is a link to open, once, and the copy says it is theirs alone.
    expect(html.split(BASE.referralsPageUrl.replace('&', '&amp;')).length - 1).toBe(1)
    expect(readable(html)).toContain('ese enlace es solo tuyo, no lo compartas')
  })

  test('loads nothing from outside the logo origin', () => {
    const { html } = renderWaitlistConfirmationEmail({ ...CONFIRMATION, language: 'es' })
    const origins = new Set(
      [...html.matchAll(/(?:src="|url\(')(https?:\/\/[^/"']+)/g)].map((match) => match[1]),
    )

    expect([...origins]).toEqual(['https://studio.allfit.one'])
  })
})

describe('waitlist link email', () => {
  test('sends the link to the inbox, and says the place did not change', () => {
    const { subject, text, html } = renderWaitlistLinkEmail({
      ...BASE,
      referrals: 3,
      language: 'es',
    })

    expect(subject).toBe('Tu link de la lista de espera de Allfit Space')
    expect(readable(html)).toContain('Este es tu link, Laura')
    expect(readable(html)).toContain('ya estaba en la lista de espera de Allfit Space')
    expect(readable(html)).toContain('Registrados con tu link: 3.')
    expect(readable(html)).toContain(`href="${BASE.referralsPageUrl}"`)
    expect(readable(html)).toContain('¿No pediste este correo?')
    expect(readable(html)).not.toContain('Confirmar mi correo')
    expect(text).toContain(`Tu código: ${BASE.code}`)
  })

  test('speaks English to someone who joined in English', () => {
    const { subject, html } = renderWaitlistLinkEmail({ ...BASE, referrals: 3, language: 'en' })

    expect(subject).toBe('Your Allfit Space waitlist link')
    expect(readable(html)).toContain('<html lang="en">')
    expect(readable(html)).toContain('Signed up with your link: 3.')
    expect(readable(html)).toContain('Didn’t ask for this?')
  })
})

describe('waitlist referral count', () => {
  // Rewards need referrals active after launch (TECH-301), so a sign-up is never progress.
  test('counts the sign-ups and says what makes a referral count for rewards', () => {
    const email = (referrals: number) =>
      renderWaitlistLinkEmail({ ...BASE, referrals, language: 'es' })

    for (const referrals of [5, 30, 140]) {
      const { text, html } = email(referrals)
      expect(readable(html)).toContain(`Registrados con tu link: ${String(referrals)}.`)
      expect(text).toContain(`Registrados con tu link: ${String(referrals)}.`)
      expect(readable(html)).toContain(
        'Para los premios de Allfit Pro cuentan los activos: desde el lanzamiento crean su cuenta y registran 3 entrenamientos o comidas en sus primeros 14 días.',
      )
      expect(text).toContain('Para los premios de Allfit Pro cuentan los activos')
    }
  })

  test('draws no steps toward a level, since nobody is active before launch', () => {
    const { html } = renderWaitlistLinkEmail({ ...BASE, referrals: 3, language: 'es' })

    expect(html).not.toMatch(/height="6" bgcolor/)
    expect(readable(html)).not.toContain('Llevas')
    expect(readable(html)).not.toContain('1 mes de Allfit Pro')
  })
})

describe('waitlist emails keep names whole', () => {
  test('so a narrow screen never splits Allfit from Space or Pro', () => {
    const { html } = renderWaitlistLinkEmail({ ...BASE, referrals: 3, language: 'en' })

    expect(html).toContain('the Allfit&nbsp;Space waitlist')
    expect(html).toContain('Allfit&nbsp;Pro rewards count active referrals')
    expect(html).not.toContain('Allfit Space waitlist, so')
  })
})

describe('waitlist emails escape what a person typed', () => {
  test('in the name, the code and every link', () => {
    const { html } = renderWaitlistConfirmationEmail({
      ...CONFIRMATION,
      name: '<b>Ana & "Co"</b>',
      referralUrl: 'https://space.allfit.one/es/waitlist?ref=ANA1&x="y"',
      confirmationUrl: 'https://space.allfit.one/es/waitlist/confirm?token=a&next="b"',
      language: 'es',
    })

    expect(readable(html)).not.toContain('<b>Ana')
    expect(readable(html)).toContain('&lt;b&gt;Ana &amp; &quot;Co&quot;&lt;/b&gt;')
    expect(readable(html)).toContain('ref=ANA1&amp;x=&quot;y&quot;')
    expect(readable(html)).toContain('token=a&amp;next=&quot;b&quot;')
  })
})

describe('the way out of the waitlist', () => {
  test.each([
    ['confirmation', () => renderWaitlistConfirmationEmail({ ...CONFIRMATION, language: 'es' })],
    ['link', () => renderWaitlistLinkEmail({ ...BASE, language: 'es' })],
  ] as const)(
    'the %s email links to leaving, once, and says what leaving does',
    (_name, render) => {
      const { text, html } = render()

      expect(readable(html)).toContain(`<a href="${BASE.leaveUrl}"`)
      expect(html.split(BASE.leaveUrl).length - 1).toBe(1)
      expect(readable(html)).toContain('salir de la lista de espera</a> cuando quieras')
      expect(readable(html)).toContain('al salir borramos tus datos.')
      expect(text).toContain(`Salir de la lista de espera y borrar tus datos: ${BASE.leaveUrl}`)
    },
  )

  test('says it in English to someone who joined in English', () => {
    const { text, html } = renderWaitlistLinkEmail({ ...BASE, language: 'en' })

    expect(readable(html)).toContain('leave the waitlist</a> whenever you like')
    expect(text).toContain(`Leave the waitlist and delete your data: ${BASE.leaveUrl}`)
  })
})
