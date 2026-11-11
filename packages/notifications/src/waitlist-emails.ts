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
 * The referral levels and their rewards repeat the ones `apps/space-web` shows
 * (`src/lib/waitlist.ts` and its dictionaries), on purpose: a package cannot import an
 * app, and the API that counts will hold its own copy. If the levels change, all three
 * change together.
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
  /** People who joined through them and confirmed their email. */
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

const REFERRAL_LEVELS = [5, 15, 30, 100] as const
type ReferralLevel = (typeof REFERRAL_LEVELS)[number]

/** Up to this many steps to the next level, the count is drawn as marks; past it, as one bar. */
const MAX_MARKS = 15

const WORDS = {
  es: {
    rewards: {
      5: '1 mes de Allfit Pro',
      15: '2 meses de Allfit Pro',
      30: '3 meses de Allfit Pro',
      100: '1 año de Allfit Pro y merch de Allfit One',
    },
    progress: (count: number, goal: number, reward: string) =>
      `Llevas ${count} de ${goal} para ${reward}.`,
    progressDone: (count: number) => `Llevas ${count}: alcanzaste el último nivel.`,
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
      note: 'Cada persona que se une con tu link y confirma su correo suma a tus referidos. «Ver mis referidos» abre tu página con el contador al día; ese enlace es solo tuyo, no lo compartas.',
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
    rewards: {
      5: '1 month of Allfit Pro',
      15: '2 months of Allfit Pro',
      30: '3 months of Allfit Pro',
      100: '1 year of Allfit Pro and Allfit One merch',
    },
    progress: (count: number, goal: number, reward: string) =>
      `${count} of ${goal} toward ${reward}.`,
    progressDone: (count: number) => `${count} so far: you reached the last level.`,
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
      note: 'Everyone who joins with your link and confirms their email adds to your referrals. “See my referrals” opens your page with your count up to date; that link is yours alone, so don’t share it.',
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
    progressSentence(input.referrals, input.language),
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
      html: `${progressMarks(input.referrals)}<p style="margin:0;font-family:${BODY_FONT};font-size:16px;font-weight:600;line-height:1.4;color:${c.textOnInverse};">${escapeHtml(progressSentence(input.referrals, input.language))}</p>${privateLink}`,
    },
  ]
}

function progressSentence(referrals: number, language: EmailLanguage): string {
  const words = WORDS[language]
  const next = nextReferralLevel(referrals)
  return next === null
    ? words.progressDone(referrals)
    : words.progress(referrals, next, words.rewards[next])
}

/**
 * The steps from the last level reached to the next one, as the waitlist page draws them:
 * a mark per person, cyan once they count. Table cells, because Outlook draws nothing else.
 */
function progressMarks(referrals: number): string {
  const c = EMAIL_COLOR
  const next = nextReferralLevel(referrals)
  if (next === null) return ''
  const floor = reachedReferralLevel(referrals)
  const steps = next - floor
  const done = referrals - floor
  const cell = (width: number, color: string) =>
    `<td width="${width}" height="6" bgcolor="${color}" style="width:${width}px;height:6px;background-color:${color};border-radius:999px;font-size:0;line-height:0;">&nbsp;</td>`
  const gap = '<td width="4" style="width:4px;font-size:0;line-height:0;">&nbsp;</td>'
  if (steps > MAX_MARKS) {
    const filled = Math.round((128 * done) / steps)
    // One track with the done part laid in it, so the two ends stay round.
    return `<table role="presentation" width="128" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.trackOnInverse}" style="width:128px;margin:0 0 12px;background-color:${c.trackOnInverse};border-radius:999px;border-collapse:separate;"><tr>${filled > 0 ? cell(filled, c.action) : ''}<td height="6" style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr></table>`
  }
  // Narrower past ten, so fifteen marks still fit a phone.
  const width = steps <= 10 ? 20 : 12
  const marks = Array.from({ length: steps }, (_, index) =>
    cell(width, index < done ? c.action : c.trackOnInverse),
  ).join(gap)
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;border-collapse:separate;"><tr>${marks}</tr></table>`
}

function nextReferralLevel(referrals: number): ReferralLevel | null {
  return REFERRAL_LEVELS.find((level) => level > referrals) ?? null
}

function reachedReferralLevel(referrals: number): ReferralLevel | 0 {
  return [...REFERRAL_LEVELS].reverse().find((level) => level <= referrals) ?? 0
}

function formatExpiry(expiresAt: Date, language: EmailLanguage): string {
  return new Intl.DateTimeFormat(language === 'es' ? 'es-CO' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(expiresAt)
}
