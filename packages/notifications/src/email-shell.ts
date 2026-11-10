/**
 * The layout every Allfit One email shares, and the Design System values it is drawn with.
 *
 * Each email module writes its own words and passes them here, so a message about a gym's
 * plan and one about the Space waitlist look like the same product.
 */

/**
 * The Design System values the email shell uses, by their DS names.
 *
 * Email clients read no CSS variables and this package does not depend on
 * `@allfitone/tokens`, so the values are copied here. Two are blends: the DS gives
 * `border.subtle` as a translucent colour, and email needs it solid, so each is
 * that colour laid over the surface it sits on.
 */
export const EMAIL_COLOR = {
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
  trackOnInverse: '#5A707A', // dark border.default, the empty marks of a progress row
  onAction: '#06282B', // action.onPrimary
} as const

// The DS stacks, with the fallbacks most inboxes end up using: Gmail and Outlook load no fonts.
export const DISPLAY_FONT = "'Barlow Condensed','Arial Narrow',Arial,sans-serif"
export const BODY_FONT = "'Manrope',system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif"

/**
 * The files an email loads from the public site, each named by the first eight hex digits
 * of its SHA-256. Gmail and Outlook fetch an image once through their own proxies and keep
 * it by URL whatever our cache headers say, so a file that changes must change its name.
 */
export const EMAIL_FILES = {
  logo: 'allfit-one-lockup-on-light.ce0bcfe6.png',
  displayFont: 'fonts/barlow-condensed-600-latin.215a93c6.woff2',
  bodyFont: 'fonts/manrope-latin.8c2def02.woff2',
} as const

/** The logo on the public site that serves `email/`; the fonts are resolved beside it. */
export function emailBrandAssetUrl(publicBaseUrl: string | URL): string {
  return new URL(`email/${EMAIL_FILES.logo}`, publicBaseUrl).toString()
}

/** The languages an email can be written in. Everything but the waitlist is Spanish today. */
export type EmailLanguage = 'es' | 'en'

// The words the shell writes itself, when a message does not bring its own.
const SHELL_WORDS = {
  es: {
    expires: 'VÁLIDA HASTA',
    action: 'Revisar invitación',
    footerQuestion: '¿No esperabas esta invitación?',
  },
  en: {
    expires: 'VALID UNTIL',
    action: 'Review invitation',
    footerQuestion: "Didn't expect this invitation?",
  },
} as const

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
export function invitationEmailHtml(parts: InvitationEmailParts): string {
  const c = EMAIL_COLOR
  const logoUrl = escapeHtml(parts.brandAssetUrl)
  const fontUrl = (file: string) => escapeHtml(new URL(file, parts.brandAssetUrl).toString())
  const label = `margin:0 0 8px;font-family:${BODY_FONT};font-size:12px;font-weight:700;line-height:1.25;letter-spacing:2px;color:${c.textOnInverseMuted};`
  const twoFacts = parts.expires !== undefined
  const language = parts.language ?? 'es'
  const words = SHELL_WORDS[language]
  // The brand and product names never break across lines.
  const keepBrand = (html: string) =>
    html.replace(/Allfit (One|Space|Studio|Pro)\b/g, 'Allfit&nbsp;$1')
  const action = parts.actionUrl
    ? `
                <table class="afo-action" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:${parts.actionFirst ? 0 : 32}px;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="${c.action}" style="background-color:${c.action};border-radius:999px;">
                      <a href="${parts.actionUrl}" target="_blank" style="display:inline-block;padding:16px 28px;font-family:${BODY_FONT};font-size:16px;font-weight:800;line-height:1;text-decoration:none;color:${c.onAction};border:1px solid ${c.action};border-radius:999px;">${parts.actionLabel ?? words.action}</a>
                    </td>
                  </tr>
                </table>${
                  parts.actionNote
                    ? `
                <p style="margin:12px 0 0;font-family:${BODY_FONT};font-size:14px;font-weight:400;line-height:1.5;color:${c.textMuted};">${keepBrand(parts.actionNote)}</p>`
                    : ''
                }`
    : ''
  const panelRows = (parts.panelRows ?? [])
    .map(
      (row) => `
                  <tr>
                    <td class="afo-panel-row"${twoFacts ? ' colspan="2"' : ''} style="padding:24px;border-top:1px solid ${c.hairlineOnInverse};">${
                      row.label
                        ? `
                      <p style="${label}">${row.label}</p>`
                        : ''
                    }
                      ${keepBrand(row.html)}
                    </td>
                  </tr>`,
    )
    .join('')
  // Fills the inbox preview after the preheader, so clients do not append the body to it.
  const previewPadding = '&#847;&zwnj;&nbsp;'.repeat(40)
  return `<!doctype html>
<html lang="${language}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light only">
    <meta name="supported-color-schemes" content="light">
    <title>${parts.title}</title>
    <!--[if !mso]><!-->
    <style>
      @font-face { font-family: 'Barlow Condensed'; font-style: normal; font-weight: 600; font-display: swap; src: url('${fontUrl(EMAIL_FILES.displayFont)}') format('woff2'); }
      @font-face { font-family: 'Manrope'; font-style: normal; font-weight: 400 800; font-display: swap; src: url('${fontUrl(EMAIL_FILES.bodyFont)}') format('woff2'); }
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
        .afo-panel-row { padding: 20px 24px !important; }
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
${parts.actionFirst ? `${action}\n                <div style="height:32px;line-height:32px;font-size:0;">&nbsp;</div>\n` : ''}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.inverse}" style="width:100%;background-color:${c.inverse};border-radius:16px;border-collapse:separate;">
                  <tr>
                    <td class="afo-detail" width="${twoFacts ? '50%' : '100%'}" valign="top" style="width:${twoFacts ? '50%' : '100%'};padding:24px;">
                      <p style="${label}">${parts.detailLabel}</p>
                      <p style="margin:0;font-family:${DISPLAY_FONT};font-size:28px;font-weight:600;line-height:1.1;color:${c.textOnInverse};">${parts.detailValue}</p>
                    </td>${
                      twoFacts
                        ? `
                    <td class="afo-detail afo-detail-expiry" width="50%" valign="top" style="width:50%;padding:24px;border-left:1px solid ${c.hairlineOnInverse};">
                      <p style="${label}">${parts.expiryLabel ?? words.expires}</p>
                      <p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1.4;color:${c.textOnInverse};">${parts.expires}</p>
                    </td>`
                        : ''
                    }
                  </tr>${panelRows}
                </table>
${parts.actionFirst ? '' : action}

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
                <strong style="font-weight:700;color:${c.textSecondary};">${parts.footerQuestion ?? words.footerQuestion}</strong> ${keepBrand(parts.footer)}
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
export interface InvitationEmailParts {
  /** Spanish unless the message says otherwise. It sets `lang` and the shell's own words. */
  language?: EmailLanguage
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
  /** Puts the action right under the lead, for an email whose whole point is that one click. */
  actionFirst?: boolean
  /** A short line under the action, such as when its link expires. */
  actionNote?: string
  /** Full-width rows under the facts, each above a hairline: a link to share, a count. */
  panelRows?: readonly { label?: string; html: string }[]
  brandAssetUrl: string
  note: string
  footer?: string
  /** The bold question that opens the footer; invitations ask whether it was expected. */
  footerQuestion?: string
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
