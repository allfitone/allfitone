/**
 * The Allfit Space waitlist emails (epic TECH-290).
 *
 * - **Confirmation** (TECH-293, HU-SP-116). The person confirms their address, and
 *   their place counts from then. The one click it asks for comes first.
 * - **Your link** (TECH-292, criterion 4). Somebody joined with an address that was
 *   already on the list. The form shows nothing about the person behind it, and their
 *   link goes here instead, to the inbox only they read. An address that never
 *   confirmed should get the confirmation email again rather than this one, since that
 *   email already carries everything this one does.
 *
 * Both carry what TECH-294 asks of every waitlist email: the person's code, the link
 * they share, how many people joined with it, and the private «mi link» page. Both also
 * carry the way out (TECH-323): a link to leave the list, which deletes the sign-up.
 *
 * Two links travel in each email, and they must never be confused. The referral link is
 * public by design; sharing it is the point. The «mi link» URL holds a bearer token, so
 * the copy says it is theirs alone and never offers it for sharing.
 *
 * `name` is the one the person gave when they first joined. The link email must not take
 * it from the repeated sign-up, or anybody could put their own words into a stranger's
 * inbox by typing that stranger's address.
 *
 * These are the first emails in two languages: the one the person joined in.
 *
 * The count is people who signed up with the link and confirmed. It is not progress
 * toward a reward: under the launch strategy v1.2 a referral earns rewards only once
 * active after launch (TECH-301), and the email says so under the count. Registered
 * and active side by side, with the steps to the next level, arrive with TECH-334.
 */

import {
  BODY_FONT,
  EMAIL_COLOR,
  type EmailLanguage,
  escapeHtml,
  invitationEmailHtml,
} from './email-shell.js'

/** What every waitlist email shows about the person's referrals (TECH-294). */
export interface WaitlistReferralStatus {
  /** Their own code, as the API issued it. */
  code: string
  /** The public link they share. It opens the waitlist page with their code. */
  referralUrl: string
  /** People who signed up through them and confirmed their email. */
  referrals: number
  /** The private «mi link» page. Its token is a bearer credential. */
  referralsPageUrl: string
  /** The page that leaves the list. It carries the same private token. */
  leaveUrl: string
}

interface WaitlistRecipient extends WaitlistReferralStatus {
  language: EmailLanguage
  /** The name given when they first joined. */
  name: string
  brandAssetUrl: string
}

const WORDS = {
  es: {
    registered: (count: number) => `Registrados con tu link: ${count}.`,
    rewardRule:
      'Para los premios de Allfit Pro cuentan los activos: desde el lanzamiento crean su cuenta y registran 3 entrenamientos o comidas en sus primeros 14 días.',
    codeLabel: 'TU CÓDIGO',
    linkLabel: 'TU LINK',
    referralsLabel: 'TUS REFERIDOS',
    referralsPage: 'Ver mis referidos',
    leave: (link: (label: string) => string) =>
      `Puedes ${link('salir de la lista de espera')} cuando quieras: al salir borramos tus datos.`,
    leaveText: 'Salir de la lista de espera y borrar tus datos',
    confirmation: {
      subject: 'Confirma tu correo para la lista de Allfit Space',
      preheader:
        'Tu lugar cuenta desde que confirmas. Adentro están tu código y tu link para invitar.',
      heading: (name: string) => `Confirma tu correo, ${name}`,
      lead: 'Así guardamos tu lugar en la lista de espera de Allfit Space. Tu lugar cuenta desde que confirmas, y las primeras 100 personas en confirmar son Founding Members.',
      action: 'Confirmar mi correo',
      expires: (date: string) => `El enlace vence el ${date}.`,
      note: 'Cada persona que se une con tu link y confirma su correo suma a tus registrados. «Ver mis referidos» abre tu página con el contador al día; ese enlace es solo tuyo, no lo compartas.',
      footerQuestion: '¿No te uniste tú?',
      footer: 'Ignora este correo: sin confirmar, esta dirección no cuenta en la lista de espera.',
    },
    link: {
      subject: 'Tu link de la lista de espera de Allfit Space',
      preheader: 'Tu código, tu link y cuántas personas se han unido con él.',
      heading: (name: string) => `Este es tu link, ${name}`,
      lead: 'Esta dirección ya estaba en la lista de espera de Allfit Space, así que no la inscribimos otra vez. Tu lugar sigue igual.',
      note: 'Ese botón abre tu página con el contador al día. Es solo tuya: no reenvíes este correo ni compartas ese enlace. Para invitar, comparte tu link.',
      footerQuestion: '¿No pediste este correo?',
      footer:
        'No tienes que hacer nada. Alguien escribió esta dirección en la lista de espera, y tu código y tu contador solo llegan aquí.',
    },
    text: {
      code: 'Tu código',
      link: 'Tu link para invitar',
      privatePage: 'Ver mis referidos (solo para ti, no lo compartas)',
    },
  },
  en: {
    registered: (count: number) => `Signed up with your link: ${count}.`,
    rewardRule:
      'Allfit Pro rewards count active referrals: from launch, they create an account and log 3 workouts or meals in their first 14 days.',
    codeLabel: 'YOUR CODE',
    linkLabel: 'YOUR LINK',
    referralsLabel: 'YOUR REFERRALS',
    referralsPage: 'See my referrals',
    leave: (link: (label: string) => string) =>
      `You can ${link('leave the waitlist')} whenever you like: leaving deletes your data.`,
    leaveText: 'Leave the waitlist and delete your data',
    confirmation: {
      subject: 'Confirm your email for the Allfit Space waitlist',
      preheader: 'Your place counts once you confirm. Your code and your invite link are inside.',
      heading: (name: string) => `Confirm your email, ${name}`,
      lead: 'That keeps your place on the Allfit Space waitlist. Your place counts from the moment you confirm, and the first 100 people to confirm are Founding Members.',
      action: 'Confirm my email',
      expires: (date: string) => `The link expires on ${date}.`,
      note: 'Everyone who joins with your link and confirms their email adds to your sign-ups. “See my referrals” opens your page with your count up to date; that link is yours alone, so don’t share it.',
      footerQuestion: 'Didn’t sign up?',
      footer: 'Ignore this email: without confirming, this address doesn’t count on the waitlist.',
    },
    link: {
      subject: 'Your Allfit Space waitlist link',
      preheader: 'Your code, your link and how many people have joined with it.',
      heading: (name: string) => `Here’s your link, ${name}`,
      lead: 'This address was already on the Allfit Space waitlist, so we didn’t add it again. Your place stays the same.',
      note: 'That button opens your page with your count up to date. It’s yours alone: don’t forward this email or share that link. To invite people, share your link.',
      footerQuestion: 'Didn’t ask for this?',
      footer:
        'You don’t need to do anything. Someone entered this address on the waitlist, and your code and count only ever arrive here.',
    },
    text: {
      code: 'Your code',
      link: 'Your invite link',
      privatePage: 'See my referrals (just for you, don’t share it)',
    },
  },
} as const

/**
 * The confirmation email (TECH-293). `expiresAt` is when the confirmation link stops
 * working; it is printed as a Bogotá date, where the list is, so a link that dies late
 * at night is not shown as lasting into the next day.
 */
export function renderWaitlistConfirmationEmail(
  input: WaitlistRecipient & { confirmationUrl: string; expiresAt: Date },
): { subject: string; text: string; html: string } {
  const words = WORDS[input.language]
  const copy = words.confirmation
  const name = escapeHtml(input.name)
  const expires = copy.expires(formatExpiry(input.expiresAt, input.language))
  return {
    subject: copy.subject,
    text: [
      `${copy.heading(input.name)}.`,
      copy.lead,
      `${copy.action}: ${input.confirmationUrl}\n${expires}`,
      referralLines(input),
      copy.note,
      `${copy.footerQuestion} ${copy.footer}`,
      `${words.leaveText}: ${input.leaveUrl}`,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: input.language,
      product: 'Space',
      title: copy.subject,
      preheader: copy.preheader,
      heading: copy.heading(name),
      lead: copy.lead,
      actionFirst: true,
      actionLabel: copy.action,
      actionUrl: escapeHtml(input.confirmationUrl),
      actionNote: expires,
      detailLabel: words.codeLabel,
      detailValue: escapeHtml(input.code),
      panelRows: referralRows(input, { withPrivateLink: true }),
      brandAssetUrl: input.brandAssetUrl,
      note: copy.note,
      footerQuestion: copy.footerQuestion,
      footer: `${copy.footer} ${leaveSentence(input)}`,
    }),
  }
}

/** The email that answers a repeated sign-up (TECH-292, criterion 4) with the person's own link. */
export function renderWaitlistLinkEmail(input: WaitlistRecipient): {
  subject: string
  text: string
  html: string
} {
  const words = WORDS[input.language]
  const copy = words.link
  const name = escapeHtml(input.name)
  return {
    subject: copy.subject,
    text: [
      `${copy.heading(input.name)}.`,
      copy.lead,
      referralLines(input),
      copy.note,
      `${copy.footerQuestion} ${copy.footer}`,
      `${words.leaveText}: ${input.leaveUrl}`,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: input.language,
      product: 'Space',
      title: copy.subject,
      preheader: copy.preheader,
      heading: copy.heading(name),
      lead: copy.lead,
      detailLabel: words.codeLabel,
      detailValue: escapeHtml(input.code),
      panelRows: referralRows(input, { withPrivateLink: false }),
      actionLabel: words.referralsPage,
      actionUrl: escapeHtml(input.referralsPageUrl),
      brandAssetUrl: input.brandAssetUrl,
      note: copy.note,
      footerQuestion: copy.footerQuestion,
      footer: `${copy.footer} ${leaveSentence(input)}`,
    }),
  }
}

/** The way out, as the last sentence of the footer. */
function leaveSentence(input: WaitlistRecipient): string {
  return WORDS[input.language].leave(
    (label) =>
      `<a href="${escapeHtml(input.leaveUrl)}" target="_blank" style="color:${EMAIL_COLOR.textSecondary};text-decoration:underline;">${label}</a>`,
  )
}

function referralLines(input: WaitlistRecipient): string {
  const words = WORDS[input.language]
  return [
    `${words.text.code}: ${input.code}`,
    `${words.text.link}: ${input.referralUrl}`,
    words.registered(input.referrals),
    words.rewardRule,
    `${words.text.privatePage}: ${input.referralsPageUrl}`,
  ].join('\n')
}

/** The link to share and the count, as rows of the dark panel under the code. */
function referralRows(
  input: WaitlistRecipient,
  { withPrivateLink }: { withPrivateLink: boolean },
): { label: string; html: string }[] {
  const c = EMAIL_COLOR
  const words = WORDS[input.language]
  // Breaks before the query first, so the code at the end stays whole on a phone.
  const shown = escapeHtml(input.referralUrl.replace(/^https?:\/\//, '')).replace('?', '<wbr>?')
  const privateLink = withPrivateLink
    ? `
                      <p style="margin:16px 0 0;font-family:${BODY_FONT};font-size:14px;font-weight:700;line-height:1.4;"><a href="${escapeHtml(input.referralsPageUrl)}" target="_blank" style="color:${c.textOnInverse};text-decoration:underline;">${words.referralsPage}</a></p>`
    : ''
  return [
    {
      label: words.linkLabel,
      html: `<p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1.4;overflow-wrap:anywhere;"><a href="${escapeHtml(input.referralUrl)}" target="_blank" style="color:${c.textOnInverse};text-decoration:none;">${shown}</a></p>`,
    },
    {
      label: words.referralsLabel,
      html: `<p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1.4;color:${c.textOnInverse};">${escapeHtml(words.registered(input.referrals))}</p><p style="margin:8px 0 0;font-family:${BODY_FONT};font-size:14px;font-weight:400;line-height:1.5;color:${c.textOnInverseMuted};">${escapeHtml(words.rewardRule)}</p>${privateLink}`,
    },
  ]
}

function formatExpiry(expiresAt: Date, language: EmailLanguage): string {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(expiresAt)
}
