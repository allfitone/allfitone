/**
 * The two emails of changing the address a person signs in with (TECH-44, `OP-IDN-021`,
 * `OP-IDN-022`, `HU-SP-076`, `HU-SP-077`).
 *
 * - **The code**, to the new address. It proves the mailbox before anything moves, so it
 *   names nobody: until the code comes back, the address is only a claim, and a name in
 *   it would tell whoever owns that inbox who tried to take it.
 * - **The notice**, to the previous address, once WorkOS took the new one. It shows only a
 *   hint of the new address: the old inbox may no longer be hers, and the full address
 *   would hand a stranger the new place to aim at.
 *
 * In the language she chose, Spanish while she has none (ADR-054 decision 8), and no
 * address of Allfit's in the copy: a reply reaches the sender.
 */

import { type EmailLanguage, escapeHtml, invitationEmailHtml } from './email-shell.js'

interface Rendered {
  subject: string
  text: string
  html: string
}

const CODE = {
  es: {
    subject: 'Tu código para cambiar tu correo de Allfit',
    lead: 'Escribe este código en Allfit Space para empezar a entrar con este correo. Hasta que lo confirmes, sigue valiendo el anterior.',
    expires: (minutes: number) => `Vence en ${String(minutes)} minutos.`,
    expiresShort: (minutes: number) => `En ${String(minutes)} minutos`,
    note: 'Si no pediste este cambio, ignora este correo: sin el código, nada cambia en ninguna cuenta.',
    footer: 'Nadie de Allfit te pedirá este código.',
    heading: 'Confirma tu correo nuevo',
    yourCode: 'Tu código',
    preheader: (code: string, expires: string) => `Tu código es ${code}. ${expires}`,
    detailLabel: 'TU CÓDIGO',
    expiryLabel: 'VENCE',
    footerQuestion: '¿No pediste esto?',
  },
  en: {
    subject: 'Your code to change your Allfit email',
    lead: 'Enter this code in Allfit Space to start signing in with this email. Until you confirm it, your previous one still works.',
    expires: (minutes: number) => `It expires in ${minutesInEnglish(minutes)}.`,
    expiresShort: (minutes: number) => `In ${minutesInEnglish(minutes)}`,
    note: 'If you didn’t ask for this change, ignore this email: without the code, nothing changes in any account.',
    footer: 'No one from Allfit will ever ask you for this code.',
    heading: 'Confirm your new email',
    yourCode: 'Your code',
    preheader: (code: string, expires: string) => `Your code is ${code}. ${expires}`,
    detailLabel: 'YOUR CODE',
    expiryLabel: 'EXPIRES',
    footerQuestion: 'Didn’t ask for this?',
  },
} as const

const CHANGED = {
  es: {
    subject: 'Tu correo de Allfit cambió',
    lead: 'Desde ahora entras a Allfit con otro correo, y cerramos las sesiones de tus otros dispositivos. Ya no te escribiremos aquí.',
    note: 'Si no fuiste tú, responde a este correo de inmediato para que revisemos tu cuenta.',
    heading: 'Cambiaste tu correo',
    newEmail: 'Correo nuevo',
    preheader: 'Desde ahora entras a Allfit con otro correo.',
    detailLabel: 'CORREO NUEVO',
    footerQuestion: '¿No fuiste tú?',
    footer: 'Responde a este correo y lo revisamos contigo.',
  },
  en: {
    subject: 'Your Allfit email changed',
    lead: 'From now on you sign in to Allfit with another email, and we signed you out on your other devices. We won’t write to you here anymore.',
    note: 'If it wasn’t you, reply to this email right away so we can check your account.',
    heading: 'You changed your email',
    newEmail: 'New email',
    preheader: 'From now on you sign in to Allfit with another email.',
    detailLabel: 'NEW EMAIL',
    footerQuestion: 'Not you?',
    footer: 'Reply to this email and we’ll look into it with you.',
  },
} as const

export function renderEmailChangeCodeEmail(input: {
  code: string
  minutes: number
  brandAssetUrl: string
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = CODE[locale]
  const expires = words.expires(input.minutes)
  return {
    subject: words.subject,
    text: [
      `${words.heading}.`,
      words.lead,
      `${words.yourCode}: ${input.code}\n${expires}`,
      words.note,
      words.footer,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject,
      preheader: words.preheader(escapeHtml(input.code), expires),
      heading: words.heading,
      lead: words.lead,
      detailLabel: words.detailLabel,
      detailValue: escapeHtml(input.code),
      expiryLabel: words.expiryLabel,
      expires: words.expiresShort(input.minutes),
      brandAssetUrl: input.brandAssetUrl,
      note: words.note,
      footerQuestion: words.footerQuestion,
      footer: words.footer,
    }),
  }
}

export function renderEmailChangedNoticeEmail(input: {
  newEmailHint: string
  brandAssetUrl: string
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = CHANGED[locale]
  return {
    subject: words.subject,
    text: [
      `${words.heading}.`,
      words.lead,
      `${words.newEmail}: ${input.newEmailHint}`,
      words.note,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject,
      preheader: words.preheader,
      heading: words.heading,
      lead: words.lead,
      detailLabel: words.detailLabel,
      detailValue: escapeHtml(input.newEmailHint),
      brandAssetUrl: input.brandAssetUrl,
      note: words.note,
      footerQuestion: words.footerQuestion,
      footer: words.footer,
    }),
  }
}

function minutesInEnglish(minutes: number): string {
  return `${String(minutes)} ${minutes === 1 ? 'minute' : 'minutes'}`
}
