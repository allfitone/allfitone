/**
 * The notice that a person's password changed (TECH-325, `OP-IDN-066`, `HU-SP-005`).
 *
 * Sent to the address she signs in with once WorkOS took the new password and her other
 * sessions closed. It is how she learns of a change she did not make, so it says what
 * happened and what to do, and nothing else: no name, and nothing of either password.
 *
 * Spanish only, like every Space email outside the waitlist, and no address of Allfit's in
 * the copy: a reply reaches the sender.
 */

import { invitationEmailHtml } from './email-shell.js'

export function renderPasswordChangedNoticeEmail(input: { brandAssetUrl: string }): {
  subject: string
  text: string
  html: string
} {
  const subject = 'Tu contraseña de Allfit cambió'
  const lead =
    'Desde ahora entras a Allfit con tu contraseña nueva, y cerramos las sesiones de tus otros dispositivos. En el que la cambiaste sigues dentro.'
  const note = 'Si no fuiste tú, responde a este correo de inmediato para que revisemos tu cuenta.'
  return {
    subject,
    text: ['Cambiaste tu contraseña.', lead, note].join('\n\n'),
    html: invitationEmailHtml({
      language: 'es',
      product: 'Space',
      title: subject,
      preheader: 'Desde ahora entras a Allfit con tu contraseña nueva.',
      heading: 'Cambiaste tu contraseña',
      lead,
      detailLabel: 'TUS OTROS DISPOSITIVOS',
      detailValue: 'Sesiones cerradas',
      brandAssetUrl: input.brandAssetUrl,
      note,
      footerQuestion: '¿No fuiste tú?',
      footer: 'Responde a este correo y lo revisamos contigo.',
    }),
  }
}
