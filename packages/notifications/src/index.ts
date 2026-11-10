import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html: string
  idempotencyKey: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export class NotificationDeliveryError extends Error {
  constructor(
    readonly code:
      'network_error' | 'provider_throttled' | 'provider_unavailable' | 'provider_rejected',
    readonly retryable: boolean,
  ) {
    super(code)
    this.name = 'NotificationDeliveryError'
  }
}

export function createInvitationToken(invitationId: string, encodedKey: string): string {
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) throw new Error('Invitation token keys must decode to exactly 32 bytes')
  return createHmac('sha256', key)
    .update(`allfit.staff-invitation.v1\u0000${invitationId}`, 'utf8')
    .digest('base64url')
}

export function hashInvitationToken(token: string): Uint8Array {
  return createHash('sha256').update(token, 'utf8').digest()
}

export function invitationTokenKey(version: number, environment = process.env): string {
  if (!Number.isSafeInteger(version) || version <= 0)
    throw new Error('Invalid invitation key version')
  const value = environment[`INVITATION_TOKEN_KEY_V${version}`]
  if (!value) throw new Error(`INVITATION_TOKEN_KEY_V${version} is not set`)
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error(`INVITATION_TOKEN_KEY_V${version} must decode to 32 bytes`)
  return value
}

export function activeInvitationTokenKeyVersion(environment = process.env): number {
  const value = Number(environment.INVITATION_TOKEN_ACTIVE_VERSION)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('INVITATION_TOKEN_ACTIVE_VERSION must be a positive integer')
  }
  invitationTokenKey(value, environment)
  return value
}

export function constantTimeBearerMatches(
  authorization: string | undefined,
  secret: string,
): boolean {
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8')
  const actual = Buffer.from(authorization ?? '', 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createResendEmailSender(
  config: { apiKey: string; from: string },
  fetcher: FetchLike = fetch,
): EmailSender {
  if (!config.apiKey || !config.from) throw new Error('Resend email configuration is incomplete')
  return {
    async send(message) {
      let response: Response
      try {
        response = await fetcher('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': message.idempotencyKey,
          },
          body: JSON.stringify({
            from: config.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
        })
      } catch {
        throw new NotificationDeliveryError('network_error', true)
      }
      if (response.ok) return
      if (response.status === 429) {
        throw new NotificationDeliveryError('provider_throttled', true)
      }
      if (response.status >= 500) {
        throw new NotificationDeliveryError('provider_unavailable', true)
      }
      throw new NotificationDeliveryError('provider_rejected', false)
    },
  }
}

export function renderTeamInvitationEmail(input: {
  organizationName: string
  proposedRoleCode: 'admin' | 'coach' | 'staff'
  invitationUrl: string
  brandAssetUrl: string
  expiresAt: Date
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const role = roleLabel(input.proposedRoleCode)
  const expires = formatInvitationExpiry(input.expiresAt)
  return {
    subject: `${input.organizationName} te invitó a su equipo en Allfit One`,
    text: [
      `${input.organizationName} quiere sumarte a su equipo en Allfit One.`,
      `Rol propuesto: ${role}`,
      `Válida hasta: ${expires}`,
      `Revisar invitación: ${input.invitationUrl}`,
      'Aceptar crea tu membresía. Abrir este correo o revisar la invitación no lo hace.',
      'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Studio',
      title: `${organization} te invitó a su equipo en Allfit One`,
      preheader: `${organization} te invitó como ${role}. Revisa la invitación antes del ${expires}.`,
      heading: `${organization} quiere sumarte a su equipo`,
      lead: 'Revisa el rol propuesto y la vigencia antes de decidir.',
      detailLabel: 'ROL PROPUESTO',
      detailValue: role.toLocaleUpperCase('es-CO'),
      expires,
      actionUrl: escapeHtml(input.invitationUrl),
      brandAssetUrl: input.brandAssetUrl,
      note: 'Aceptar crea tu membresía. Abrir este correo o revisar la invitación no lo hace.',
      footer: `Puedes ignorar este correo; no se hará ningún cambio. Allfit One lo envió en nombre de ${organization}.`,
    }),
  }
}

/**
 * The email that hands an organization Allfit created to its owner (`HU-BO-014`).
 *
 * It says, before anything else, that the organization does not operate until it is
 * accepted: the recipient is being offered ownership, not told they already have it.
 * Nobody from the organization sent it, so it never claims to speak in its name.
 */
export function renderOwnershipInvitationEmail(input: {
  organizationName: string
  invitationUrl: string
  brandAssetUrl: string
  expiresAt: Date
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const expires = formatInvitationExpiry(input.expiresAt)
  return {
    subject: `${input.organizationName} te espera en Allfit One`,
    text: [
      `Allfit One preparó ${input.organizationName} para que la recibas como propietario.`,
      'Mientras no la aceptes, la organización existe pero no opera.',
      `Válida hasta: ${expires}`,
      `Revisar invitación: ${input.invitationUrl}`,
      'Aceptar te hace su propietario. Abrir este correo o revisar la invitación no lo hace.',
      'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Studio',
      title: `${organization} te espera en Allfit One`,
      preheader: `Allfit One preparó ${organization} para ti. Revisa la invitación antes del ${expires}.`,
      heading: `${organization} está lista para que la recibas`,
      lead: 'Allfit One la preparó para ti. Mientras no la aceptes, la organización existe pero no opera.',
      detailLabel: 'ORGANIZACIÓN',
      detailValue: organization,
      expires,
      actionUrl: escapeHtml(input.invitationUrl),
      brandAssetUrl: input.brandAssetUrl,
      note: 'Aceptar te hace su propietario. Abrir este correo o revisar la invitación no lo hace.',
      footer:
        'Puedes ignorar este correo; no se hará ningún cambio. Allfit One lo envió porque el equipo de Allfit One preparó esta organización para esta dirección.',
    }),
  }
}

/**
 * The email a gym's client invitation sends (`HU-STUDIO-023`, and `HU-BO-011` when
 * support resends it).
 *
 * Two things make it different from the team and ownership emails.
 *
 * **It is an offer over health data, so it says so up front.** The gym is asking for
 * permission to see things about the person's body, health or food. Burying that until
 * after they sign in would make the email a trick.
 *
 * **But it says nothing about what, or how much.** The message reaches an address, not
 * a verified person. Naming the categories would tell whoever reads that inbox which
 * health data a gym is asking about, and even a bare count would have to be read out
 * of `privacy.invitation_scope_options` — a table whose policies admit the gym and the
 * invited person, and nobody else. Widening the most sensitive table in the system so
 * an email can print a number is not a trade worth making. The detail waits behind the
 * link, where the token proves control of the address and the person is signed in.
 */
export function renderClientInvitationEmail(input: {
  organizationName: string
  invitationUrl: string
  brandAssetUrl: string
  expiresAt: Date
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const expires = formatInvitationExpiry(input.expiresAt)
  const asks = 'te pide permiso para ver información sobre ti'
  const separately = 'Verás exactamente qué pide, y para qué, y decides cada uno por separado.'
  const note = 'Aceptar entrenar con el gimnasio no le da acceso a tus datos.'
  return {
    subject: `${input.organizationName} te invitó como cliente en Allfit One`,
    text: [
      `${input.organizationName} quiere entrenarte en Allfit One.`,
      `Para hacerlo ${asks}. ${separately}`,
      `Válida hasta: ${expires}`,
      `Revisar invitación: ${input.invitationUrl}`,
      `${note} Abrir este correo tampoco decide nada.`,
      'Si no esperabas esta invitación, puedes ignorar este correo.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `${organization} te invitó como cliente en Allfit One`,
      preheader: `${organization} quiere entrenarte y ${asks}. Revisa la invitación antes del ${expires}.`,
      heading: `${organization} quiere entrenarte`,
      lead: `Para hacerlo ${asks}. ${separately}`,
      detailLabel: 'GIMNASIO',
      detailValue: organization,
      expires,
      actionUrl: escapeHtml(input.invitationUrl),
      brandAssetUrl: input.brandAssetUrl,
      note: `${note} Abrir este correo tampoco decide nada.`,
      footer: `Puedes ignorar este correo; no se hará ningún cambio. Allfit One lo envió en nombre de ${organization}.`,
    }),
  }
}

/**
 * Every text value arrives already escaped: the caller knows which parts came from
 * a person. `brandAssetUrl` is the exception. It arrives raw, because the shell
 * resolves the fonts beside it before escaping both.
 *
 * `expires` and the action are optional because not every message is an
 * invitation. A notice that something already happened has no deadline and
 * nothing to click, and giving it a fake one of either would be inventing data
 * to fit a template. `footer` is optional for the same reason: only an invitation
 * can arrive unexpected and be ignored.
 */
interface InvitationEmailParts {
  title: string
  preheader: string
  /** The product the message is about: Studio for teams, Space for the person who trains. */
  product: 'Studio' | 'Space'
  heading: string
  lead: string
  detailLabel: string
  detailValue: string
  expiryLabel?: string
  expires?: string
  actionLabel?: string
  actionUrl?: string
  brandAssetUrl: string
  note: string
  footer?: string
}

/**
 * Telling somebody that a different professional now attends them.
 *
 * It carries no link and no deadline. There is nothing for the person to
 * approve — the change already happened — and a button in an email about who
 * can reach their data is an invitation to phish them. What they can do is talk
 * to their gym, which the text says.
 *
 * It also says what did **not** change, because that is the question this email
 * raises: their permissions are untouched, and the new professional sees
 * exactly what the previous one did, which is whatever they allowed.
 */
export function renderProfessionalReassignedEmail(input: {
  organizationName: string
  professionalName: string
  previousProfessionalName: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const professional = escapeHtml(input.professionalName)
  const previous = escapeHtml(input.previousProfessionalName)
  return {
    subject: `${input.professionalName} es ahora tu profesional en ${input.organizationName}`,
    text: [
      `${input.organizationName} cambió el profesional que te atiende.`,
      `Antes: ${input.previousProfessionalName}`,
      `Ahora: ${input.professionalName}`,
      'Tus permisos no cambiaron. Tu nuevo profesional ve exactamente lo que el anterior veía, que es lo que tú permitiste, y nada más.',
      `${input.previousProfessionalName} ya no tiene acceso a tu información.`,
      'Puedes cambiar o retirar tus permisos cuando quieras desde la app. Si no esperabas este cambio, habla con tu gimnasio.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `${professional} es ahora tu profesional en ${organization}`,
      preheader: `${organization} cambió quién te atiende. Tus permisos no cambiaron.`,
      heading: `${organization} cambió el profesional que te atiende`,
      lead: `${previous} ya no tiene acceso a tu información. Tus permisos no cambiaron: tu nuevo profesional ve exactamente lo que el anterior veía.`,
      detailLabel: 'AHORA TE ATIENDE',
      detailValue: professional,
      brandAssetUrl: input.brandAssetUrl,
      note: 'Puedes cambiar o retirar tus permisos cuando quieras desde la app. Si no esperabas este cambio, habla con tu gimnasio.',
    }),
  }
}

/**
 * Asking somebody whether another professional may cover for theirs.
 *
 * This one is a question, which no other email here is. So the subject is a
 * question, and the first thing the body says is that nothing happens until
 * they answer — because an email announcing that somebody new will see their
 * health data reads as a decision already taken unless it says otherwise in
 * the first line.
 *
 * No link, for the same reason as the reassignment notice: a button in an email
 * about who reaches their data is an invitation to phish them. They answer in
 * the app, where they are already who they say they are.
 */
export function renderSubstitutionProposedEmail(input: {
  organizationName: string
  substituteName: string
  holderName: string
  startsOn: string
  endsOn: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const substitute = escapeHtml(input.substituteName)
  const holder = escapeHtml(input.holderName)
  // Each day stays on one line, so a narrow panel breaks the range only at the dash.
  const windowHtml = [input.startsOn, input.endsOn]
    .map((day) => escapeHtml(formatCalendarDay(day)).replaceAll(' ', '&nbsp;'))
    .join(' – ')
  const lastDay = formatCalendarDay(input.endsOn)
  return {
    subject: `¿Aceptas que ${input.substituteName} te atienda mientras ${input.holderName} no está?`,
    text: [
      `${input.organizationName} propone que ${input.substituteName} te atienda del ${formatCalendarDay(input.startsOn)} al ${lastDay}, mientras ${input.holderName} no está.`,
      `No pasa nada hasta que respondas. Mientras no aceptes, ${input.substituteName} no ve nada de tu información.`,
      `Si aceptas, verá lo mismo que ve ${input.holderName} — lo que tú permitiste, y nada más — y solo hasta el ${lastDay}. Después deja de verlo sin que nadie tenga que hacer nada.`,
      'Puedes aceptar o rechazar desde la app. Si no respondes, no se hace.',
      'Si no esperabas esto, habla con tu gimnasio.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `¿Aceptas que ${substitute} te atienda mientras ${holder} no está?`,
      preheader: `${organization} propone una suplencia. No pasa nada hasta que respondas.`,
      heading: `${organization} propone que ${substitute} te atienda mientras ${holder} no está`,
      lead: `No pasa nada hasta que respondas. Mientras no aceptes, ${substitute} no ve nada de tu información. Si aceptas, verá lo mismo que ve ${holder} — lo que tú permitiste, y nada más — y solo hasta el ${escapeHtml(lastDay)}.`,
      detailLabel: 'TE ATENDERÍA',
      detailValue: substitute,
      expiryLabel: 'SOLO ESTOS DÍAS',
      expires: windowHtml,
      brandAssetUrl: input.brandAssetUrl,
      note: 'Puedes aceptar o rechazar desde la app. Si no respondes, no se hace. Si no esperabas esto, habla con tu gimnasio.',
    }),
  }
}

/**
 * Telling somebody a professional proposes to correct something she recorded.
 *
 * It says first that nothing changes unless she accepts, because a message about her own
 * training record reads as a change already made. It never carries the values: what she
 * declared and what he proposes are seen in the app, where she is already herself, and an
 * inbox is not where her training belongs. No link, for the reason the others have none.
 *
 * The deadline is the day it falls on in Colombia, where the product is offered; the
 * hour is left out because a time in an email reads as an appointment.
 */
export function renderCorrectionProposedEmail(input: {
  organizationName: string
  proposerName: string
  expiresAt: Date
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const proposer = escapeHtml(input.proposerName)
  const deadline = new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(input.expiresAt)
  const unchanged =
    'Nada cambia a menos que lo aceptes: lo que registraste sigue igual, y tu historial también.'
  const answer = `Puedes revisarla y aceptarla o rechazarla desde la app hasta el ${deadline}. Si no respondes, la propuesta vence y todo queda como lo registraste.`
  return {
    subject: `${input.proposerName} propone corregir un dato de tu entrenamiento`,
    text: [
      `${input.proposerName}, de ${input.organizationName}, propone corregir un dato que registraste en una de tus sesiones de entrenamiento.`,
      unchanged,
      answer,
      'Si no esperabas esto, habla con tu gimnasio.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `${proposer} propone corregir un dato de tu entrenamiento`,
      preheader: 'Nada cambia a menos que lo aceptes.',
      heading: `${proposer}, de ${organization}, propone corregir un dato de tu entrenamiento`,
      lead: escapeHtml(unchanged),
      detailLabel: 'LA PROPONE',
      detailValue: proposer,
      expiryLabel: 'PUEDES RESPONDER HASTA',
      expires: escapeHtml(deadline),
      brandAssetUrl: input.brandAssetUrl,
      note: `${escapeHtml(answer)} Si no esperabas esto, habla con tu gimnasio.`,
    }),
  }
}

/**
 * Telling an organization's administration that somebody left it.
 *
 * The reader has work to do: whoever the member attended now has nobody, and the
 * relationship stays open until an administrator assigns a new professional. So the
 * body says that before anything else it could say about the departure.
 */
export function renderMembershipResignedEmail(input: {
  organizationName: string
  memberName: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const member = escapeHtml(input.memberName)
  const followUp =
    'Las personas que atendía siguen en tu organización, pero ahora no tienen profesional asignado. Asígnales uno desde Allfit Studio.'
  const preserved = 'Sus roles y su acceso terminaron al renunciar. Lo que registró se conserva.'
  return {
    subject: `${input.memberName} dejó ${input.organizationName}`,
    text: [
      `${input.memberName} renunció a su membresía en ${input.organizationName}.`,
      followUp,
      preserved,
      'Si no esperabas esto, revisa tu equipo en Allfit Studio.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Studio',
      title: `${member} dejó ${organization}`,
      preheader: `${member} renunció. Revisa a quién atendía.`,
      heading: `${member} renunció a ${organization}`,
      lead: `${followUp} ${preserved}`,
      detailLabel: 'RENUNCIÓ',
      detailValue: member,
      brandAssetUrl: input.brandAssetUrl,
      note: 'Si no esperabas esto, revisa tu equipo en Allfit Studio.',
    }),
  }
}

/**
 * The Design System values the email shell uses, by their DS names.
 *
 * Email clients read no CSS variables and this package does not depend on
 * `@allfitone/tokens`, so the values are copied here. Two are blends: the DS gives
 * `border.subtle` as a translucent colour, and email needs it solid, so each is
 * that colour laid over the surface it sits on.
 */
const EMAIL_COLOR = {
  canvas: '#EDF6F6', // light background.canvas
  surface: '#FFFFFF', // light background.surface
  inverse: '#0A1B22', // light background.inverse, the dark detail panel
  hairline: '#E1E5E6', // light border.subtle over surface
  hairlineOnInverse: '#1C3239', // dark border.subtle over inverse
  textPrimary: '#0A1B22', // light text.primary
  textSecondary: '#456069', // light text.secondary
  textMuted: '#536A73', // light text.muted
  textOnInverse: '#F2FBFC', // light text.inverse
  textOnInverseMuted: '#9DB4BC', // dark text.secondary
  action: '#55EFFB', // action.primary
  onAction: '#06282B', // action.onPrimary
} as const

// The DS stacks, with the fallbacks most inboxes end up using: Gmail and Outlook load no fonts.
const DISPLAY_FONT = "'Barlow Condensed','Arial Narrow',Arial,sans-serif"
const BODY_FONT = "'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif"

/**
 * The one layout every email shares.
 *
 * It follows the Design System's light theme: tone separates the card from the
 * canvas, without a border; one dark inverse panel holds the facts; cyan appears
 * only on the action. The heading speaks first, with no label above it.
 *
 * Barlow Condensed and Manrope are served beside the logo, from the same origin,
 * so no new party learns that the email was opened. Apple Mail and iOS Mail use
 * them; Gmail and Outlook ignore web fonts and fall back through the stacks above.
 * Classic Outlook would fall to Times New Roman instead, so it is told to use Arial.
 */
function invitationEmailHtml(parts: InvitationEmailParts): string {
  const c = EMAIL_COLOR
  const logoUrl = escapeHtml(parts.brandAssetUrl)
  const fontUrl = (file: string) =>
    escapeHtml(new URL(`fonts/${file}`, parts.brandAssetUrl).toString())
  const label = `margin:0 0 8px;font-family:${BODY_FONT};font-size:12px;font-weight:700;line-height:1.25;letter-spacing:2px;color:${c.textOnInverseMuted};`
  const twoFacts = parts.expires !== undefined
  // The brand name never breaks across lines.
  const keepBrand = (html: string) => html.replaceAll('Allfit One', 'Allfit&nbsp;One')
  // Fills the inbox preview after the preheader, so clients do not append the body to it.
  const previewPadding = '&#847;&zwnj;&nbsp;'.repeat(40)
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${parts.title}</title>
    <!--[if !mso]><!-->
    <style>
      @font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: 600; font-display: swap; src: url('${fontUrl('barlow-condensed-600-latin.woff2')}') format('woff2'); }
      @font-face { font-family: 'Manrope'; font-style: normal; font-weight: 400 800; font-display: swap; src: url('${fontUrl('manrope-latin.woff2')}') format('woff2'); }
    </style>
    <!--<![endif]-->
    <!--[if mso]><style>h1, p, td, a, strong { font-family: Arial, sans-serif !important; }</style><![endif]-->
    <style>
      :root { color-scheme: light only; supported-color-schemes: light; }
      body { margin: 0; padding: 0; width: 100% !important; background: ${c.canvas}; }
      table { border-spacing: 0; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      a { color: inherit; }
      a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
      @media only screen and (max-width: 620px) {
        .afo-shell { padding: 16px 12px 32px !important; }
        .afo-brand { padding: 24px 24px 20px !important; }
        .afo-inset { padding-left: 24px !important; padding-right: 24px !important; }
        .afo-content { padding: 28px 24px 32px !important; }
        .afo-heading { font-size: 30px !important; }
        .afo-detail { display: block !important; width: 100% !important; box-sizing: border-box; }
        .afo-detail-expiry { border-left: 0 !important; border-top: 1px solid ${c.hairlineOnInverse} !important; }
        .afo-footer { padding: 20px 24px 0 !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;width:100%;background-color:${c.canvas};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${parts.preheader}${previewPadding}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.canvas}" style="width:100%;background-color:${c.canvas};border-collapse:collapse;">
      <tr>
        <td class="afo-shell" align="center" style="padding:40px 16px 48px;">
          <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.surface}" style="width:100%;max-width:600px;background-color:${c.surface};border-radius:20px;border-collapse:separate;overflow:hidden;">
            <tr>
              <td class="afo-brand" style="padding:32px 40px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="middle">
                      <img src="${logoUrl}" width="168" alt="Allfit One" style="display:block;width:168px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td align="right" valign="middle" style="font-family:${BODY_FONT};font-size:12px;font-weight:700;line-height:1.25;letter-spacing:2px;color:${c.textMuted};">
                      ${parts.product.toLocaleUpperCase('es-CO')}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="afo-inset" style="padding:0 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td height="1" bgcolor="${c.hairline}" style="height:1px;background-color:${c.hairline};font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="afo-content" style="padding:36px 40px 40px;">
                <h1 class="afo-heading" style="margin:0 0 16px;font-family:${DISPLAY_FONT};font-size:36px;font-weight:600;line-height:1.05;letter-spacing:-0.5px;text-wrap:balance;color:${c.textPrimary};">
                  ${keepBrand(parts.heading)}
                </h1>
                <p style="margin:0 0 32px;font-family:${BODY_FONT};font-size:16px;font-weight:400;line-height:1.5;color:${c.textSecondary};">
                  ${keepBrand(parts.lead)}
                </p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.inverse}" style="width:100%;background-color:${c.inverse};border-radius:16px;border-collapse:separate;">
                  <tr>
                    <td class="afo-detail" width="${twoFacts ? '50%' : '100%'}" valign="top" style="width:${twoFacts ? '50%' : '100%'};padding:24px;">
                      <p style="${label}">${parts.detailLabel}</p>
                      <p style="margin:0;font-family:${DISPLAY_FONT};font-size:28px;font-weight:600;line-height:1.1;color:${c.textOnInverse};">${parts.detailValue}</p>
                    </td>${
                      twoFacts
                        ? `
                    <td class="afo-detail afo-detail-expiry" width="50%" valign="top" style="width:50%;padding:24px;border-left:1px solid ${c.hairlineOnInverse};">
                      <p style="${label}">${parts.expiryLabel ?? 'VÁLIDA HASTA'}</p>
                      <p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1.4;color:${c.textOnInverse};">${parts.expires}</p>
                    </td>`
                        : ''
                    }
                  </tr>
                </table>
${
  parts.actionUrl
    ? `
                <table class="afo-action" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="${c.action}" style="background-color:${c.action};border-radius:999px;">
                      <a href="${parts.actionUrl}" target="_blank" style="display:inline-block;padding:16px 28px;font-family:${BODY_FONT};font-size:16px;font-weight:800;line-height:1;text-decoration:none;color:${c.onAction};border:1px solid ${c.action};border-radius:999px;">${parts.actionLabel ?? 'Revisar invitación'}</a>
                    </td>
                  </tr>
                </table>`
    : ''
}

                <p style="margin:24px 0 0;font-family:${BODY_FONT};font-size:14px;font-weight:400;line-height:1.5;color:${c.textMuted};">
                  ${keepBrand(parts.note)}
                </p>
              </td>
            </tr>
          </table>${
            parts.footer
              ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-collapse:collapse;">
            <tr>
              <td class="afo-footer" style="padding:24px 40px 0;font-family:${BODY_FONT};font-size:12px;font-weight:400;line-height:1.6;color:${c.textMuted};">
                <strong style="font-weight:700;color:${c.textSecondary};">¿No esperabas esta invitación?</strong> ${keepBrand(parts.footer)}
              </td>
            </tr>
          </table>`
              : ''
          }
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/**
 * A `date` from PostgreSQL as a person reads it.
 *
 * Parsed by its parts rather than handed to `new Date('2026-10-12')`, which
 * reads the string as midnight UTC and then renders it in the running machine's
 * zone — turning the 12th into the 11th for anybody west of Greenwich. A cover
 * that starts a day early in an email is a cover the person did not agree to.
 */
function formatCalendarDay(day: string): string {
  const parts = day.split('-')
  const instant = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(instant))
}

function formatInvitationExpiry(expiresAt: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(expiresAt)
}

function roleLabel(role: 'admin' | 'coach' | 'staff'): string {
  return role === 'admin' ? 'administrador' : role === 'coach' ? 'coach' : 'staff'
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/**
 * Telling somebody their gym paused their access for a payment.
 *
 * It carries **no link and no button.** There is nothing to approve and nothing to pay
 * here: the gym collects through its own gateway, so a payment link in an Allfit email
 * would be exactly the shape a phishing message takes. What the person can do is talk to
 * the gym, and the email says so.
 *
 * It says plainly what has *not* happened, because that is the part nobody would guess:
 * the data they shared is untouched, their history is intact, and their permissions still
 * stand. A suspension is reversible by design, and somebody who reads "suspendida" with
 * no further detail will assume they lost everything.
 */
export function renderSubscriptionSuspendedEmail(input: {
  organizationName: string
  planName: string
  amountMinor: number
  currencyCode: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  const price = formatMoney(input.amountMinor, input.currencyCode)
  return {
    subject: `${input.organizationName} pausó tu plan por un pago pendiente`,
    text: [
      `${input.organizationName} pausó tu plan ${input.planName} (${price}) por un pago pendiente.`,
      'Mientras esté pausado, tus sesiones futuras con ese gimnasio quedan en pausa y tu profesional no puede registrar cambios.',
      'Lo que compartiste con el gimnasio sigue igual: no se borró nada, tu historial está completo y los permisos que diste siguen en pie. Cuando el pago se resuelva, todo vuelve a funcionar sin que tengas que aceptar nada de nuevo.',
      'El cobro lo administra el gimnasio, no Allfit One. Para resolverlo, habla directamente con ellos.',
      'Nunca te vamos a pedir los datos de tu tarjeta por correo.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `${organization} pausó tu plan por un pago pendiente`,
      preheader:
        'Tus datos y tus permisos siguen igual. El plan se reactiva cuando el pago se resuelva.',
      heading: `${organization} pausó tu plan por un pago pendiente`,
      lead: 'Mientras esté pausado, tus sesiones futuras con ese gimnasio quedan en pausa y tu profesional no puede registrar cambios. Lo que compartiste sigue igual: no se borró nada, tu historial está completo y los permisos que diste siguen en pie.',
      detailLabel: 'PLAN',
      detailValue: `${escapeHtml(input.planName)} · ${escapeHtml(price)}`,
      brandAssetUrl: input.brandAssetUrl,
      note: 'El cobro lo administra el gimnasio, no Allfit One; para resolverlo habla directamente con ellos. Nunca te vamos a pedir los datos de tu tarjeta por correo.',
    }),
  }
}

/** The pause is over. Nothing had to be re-granted, and the email says why. */
export function renderSubscriptionReactivatedEmail(input: {
  organizationName: string
  planName: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  return {
    subject: `${input.organizationName} reactivó tu plan`,
    text: [
      `${input.organizationName} reactivó tu plan ${input.planName}.`,
      'Tus sesiones vuelven a verse como siempre y tu profesional puede registrar cambios otra vez.',
      'No tuviste que volver a aceptar nada porque nunca se te quitó nada: el plan estaba en pausa, no cancelado.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `${organization} reactivó tu plan`,
      preheader: 'Tus sesiones vuelven a verse como siempre.',
      heading: `${organization} reactivó tu plan`,
      lead: 'Tus sesiones vuelven a verse como siempre y tu profesional puede registrar cambios otra vez. No tuviste que volver a aceptar nada porque nunca se te quitó nada: el plan estaba en pausa, no cancelado.',
      detailLabel: 'PLAN',
      detailValue: escapeHtml(input.planName),
      brandAssetUrl: input.brandAssetUrl,
      note: 'El cobro lo administra el gimnasio, no Allfit One. Nunca te vamos a pedir los datos de tu tarjeta por correo.',
    }),
  }
}

/**
 * The paying bond is over, and the email's whole job is to say what that does **not**
 * mean. Ending a subscription revokes no permission and ends no relationship, so somebody
 * who reads this and assumes their data was deleted would be wrong in the direction that
 * matters: they might stop asking for it.
 */
export function renderSubscriptionEndedEmail(input: {
  organizationName: string
  planName: string
  brandAssetUrl: string
}): { subject: string; text: string; html: string } {
  const organization = escapeHtml(input.organizationName)
  return {
    subject: `Tu plan con ${input.organizationName} terminó`,
    text: [
      `Tu plan ${input.planName} con ${input.organizationName} terminó. No se va a volver a cobrar.`,
      'Tu Fitness ID, tu historial de entrenamiento y lo que registraste siguen siendo tuyos y siguen ahí.',
      'Terminar el plan no retira los permisos que diste ni cierra tu relación con el gimnasio. Si además quieres que dejen de ver tu información, eso se decide aparte desde la app.',
    ].join('\n\n'),
    html: invitationEmailHtml({
      product: 'Space',
      title: `Tu plan con ${organization} terminó`,
      preheader: 'No se va a volver a cobrar. Tu historial y tus permisos siguen como estaban.',
      heading: `Tu plan con ${organization} terminó`,
      lead: 'No se va a volver a cobrar. Tu Fitness ID, tu historial de entrenamiento y lo que registraste siguen siendo tuyos y siguen ahí.',
      detailLabel: 'PLAN',
      detailValue: escapeHtml(input.planName),
      brandAssetUrl: input.brandAssetUrl,
      note: 'Terminar el plan no retira los permisos que diste ni cierra tu relación con el gimnasio. Si además quieres que dejen de ver tu información, eso se decide aparte desde la app.',
    }),
  }
}

/**
 * Money as a person reads it, from the minor unit the database stores.
 *
 * The divisor is the **ISO 4217 exponent**, deliberately not what `Intl` would choose.
 * For COP, `Intl` resolves `maximumFractionDigits` to 0 because Colombians do not write
 * centavos, while the standard minor unit is still 1/100. Using that display preference
 * as the divisor turns a $120.000 plan into $12.000.000 — a number somebody reads twice
 * and then calls their bank about.
 *
 * Two decimals covers every currency a gym can charge in today. A zero-decimal currency —
 * CLP, PYG, JPY — has to be added here before one is accepted, because the column checks
 * only the shape of the code.
 *
 * How many decimals are *shown* is left to `Intl`, which is a different question and one
 * it answers correctly per currency.
 */
const MINOR_UNIT_EXPONENT = 2

function formatMoney(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 10 ** MINOR_UNIT_EXPONENT)
}
