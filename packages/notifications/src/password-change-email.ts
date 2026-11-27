/**
 * The notice that a person's password changed (TECH-325, `OP-IDN-066`, `HU-SP-005`).
 *
 * Sent to the address she signs in with once WorkOS took the new password and her other
 * sessions closed. It is how she learns of a change she did not make, so it says what
 * happened and what to do, and nothing else: no name, and nothing of either password.
 *
 * In the language she chose, Spanish while she has none (ADR-054 decision 8), and no
 * address of Allfit's in the copy: a reply reaches the sender.
 */

import { type EmailLanguage, invitationEmailHtml } from './email-shell.js'

const WORDS = {
  es: {
    subject: 'Tu contraseña de Allfit cambió',
    lead: 'Desde ahora entras a Allfit con tu contraseña nueva, y cerramos las sesiones de tus otros dispositivos. En el que la cambiaste sigues dentro.',
    note: 'Si no fuiste tú, responde a este correo de inmediato para que revisemos tu cuenta.',
    heading: 'Cambiaste tu contraseña',
    preheader: 'Desde ahora entras a Allfit con tu contraseña nueva.',
    detailLabel: 'TUS OTROS DISPOSITIVOS',
    detailValue: 'Sesiones cerradas',
    footerQuestion: '¿No fuiste tú?',
    footer: 'Responde a este correo y lo revisamos contigo.',
  },
  en: {
    subject: 'Your Allfit password changed',
    lead: 'From now on you sign in to Allfit with your new password, and we signed you out on your other devices. You’re still signed in on the one you changed it on.',
    note: 'If it wasn’t you, reply to this email right away so we can check your account.',
    heading: 'You changed your password',
    preheader: 'From now on you sign in to Allfit with your new password.',
    detailLabel: 'YOUR OTHER DEVICES',
    detailValue: 'Signed out',
    footerQuestion: 'Not you?',
    footer: 'Reply to this email and we’ll look into it with you.',
  },
} as const

export function renderPasswordChangedNoticeEmail(input: {
  brandAssetUrl: string
  locale?: EmailLanguage
}): {
  subject: string
  text: string
  html: string
} {
  const locale = input.locale ?? 'es'
  const words = WORDS[locale]
  return {
    subject: words.subject,
    text: [`${words.heading}.`, words.lead, words.note].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject,
      preheader: words.preheader,
      heading: words.heading,
      lead: words.lead,
      detailLabel: words.detailLabel,
      detailValue: words.detailValue,
      brandAssetUrl: input.brandAssetUrl,
      note: words.note,
      footerQuestion: words.footerQuestion,
      footer: words.footer,
    }),
  }
}
