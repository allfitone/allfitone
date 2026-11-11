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
 * Spanish only, like every Space email outside the waitlist, and no address of Allfit's
 * in the copy: a reply reaches the sender.
 */

import { escapeHtml, invitationEmailHtml } from './email-shell.js'

interface Rendered {
  subject: string
  text: string
  html: string
}

export function renderEmailChangeCodeEmail(input: {
  code: string
  minutes: number
  brandAssetUrl: string
}): Rendered {
  const subject = 'Tu código para cambiar tu correo de Allfit'
  const lead =
    'Escribe este código en Allfit Space para empezar a entrar con este correo. Hasta que lo confirmes, sigue valiendo el anterior.'
  const expires = `Vence en ${String(input.minutes)} minutos.`
  const note =
    'Si no pediste este cambio, ignora este correo: sin el código, nada cambia en ninguna cuenta.'
  const footer = 'Nadie de Allfit te pedirá este código.'
  return {
    subject,
    text: [
      'Confirma tu correo nuevo.',
      lead,
      `Tu código: ${input.code}\n${expires}`,
      note,
      footer,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: 'es',
      product: 'Space',
      title: subject,
      preheader: `Tu código es ${escapeHtml(input.code)}. ${expires}`,
      heading: 'Confirma tu correo nuevo',
      lead,
      detailLabel: 'TU CÓDIGO',
      detailValue: escapeHtml(input.code),
      expiryLabel: 'VENCE',
      expires: `En ${String(input.minutes)} minutos`,
      brandAssetUrl: input.brandAssetUrl,
      note,
      footerQuestion: '¿No pediste esto?',
      footer,
    }),
  }
}

export function renderEmailChangedNoticeEmail(input: {
  newEmailHint: string
  brandAssetUrl: string
}): Rendered {
  const subject = 'Tu correo de Allfit cambió'
  const lead =
    'Desde ahora entras a Allfit con otro correo, y cerramos las sesiones de tus otros dispositivos. Ya no te escribiremos aquí.'
  const note = 'Si no fuiste tú, responde a este correo de inmediato para que revisemos tu cuenta.'
  return {
    subject,
    text: ['Cambiaste tu correo.', lead, `Correo nuevo: ${input.newEmailHint}`, note].join('\n\n'),
    html: invitationEmailHtml({
      language: 'es',
      product: 'Space',
      title: subject,
      preheader: 'Desde ahora entras a Allfit con otro correo.',
      heading: 'Cambiaste tu correo',
      lead,
      detailLabel: 'CORREO NUEVO',
      detailValue: escapeHtml(input.newEmailHint),
      brandAssetUrl: input.brandAssetUrl,
      note,
      footerQuestion: '¿No fuiste tú?',
      footer: 'Responde a este correo y lo revisamos contigo.',
    }),
  }
}
