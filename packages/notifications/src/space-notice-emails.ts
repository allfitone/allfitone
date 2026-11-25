/**
 * The emails that tell a person what her gym did or asks (ADR-054 decision 8), in the
 * language she chose: Spanish while she has none.
 *
 * - **Client invitation** (`HU-STUDIO-023`, and `HU-BO-011` when support resends it).
 * - **Professional reassigned**, **cover proposed** and **correction proposed**.
 * - **Plan paused**, **resumed** and **ended** (`payments.subscription_*.v1`).
 *
 * Each takes `locale`, and its Spanish words are exactly the ones these emails always
 * carried. Names of organizations, people and plans are never translated. Dates and money
 * are written the way a reader of that language reads them, in the zone each email always
 * used; English follows the waitlist emails (`en-GB`).
 *
 * They moved here from `index.ts` when they learned English, so every Space notice keeps
 * its words in one place, the way `waitlist-emails.ts` keeps the waitlist's.
 */

import { type EmailLanguage, escapeHtml, invitationEmailHtml } from './email-shell.js'

interface Rendered {
  subject: string
  text: string
  html: string
}

const INTL_LOCALE: Record<EmailLanguage, string> = { es: 'es-CO', en: 'en-GB' }

const CLIENT_INVITATION = {
  es: {
    subject: (org: string) => `${org} te invitó como cliente en Allfit One`,
    opening: (org: string) => `${org} quiere entrenarte en Allfit One.`,
    asks: 'te pide permiso para ver información sobre ti',
    lead: (asks: string, separately: string) => `Para hacerlo ${asks}. ${separately}`,
    separately: 'Verás exactamente qué pide, y para qué, y decides cada uno por separado.',
    validUntil: 'Válida hasta',
    review: 'Revisar invitación',
    note: 'Aceptar entrenar con el gimnasio no le da acceso a tus datos.',
    openingDecides: 'Abrir este correo tampoco decide nada.',
    ignore: 'Si no esperabas esta invitación, puedes ignorar este correo.',
    preheader: (org: string, asks: string, expires: string) =>
      `${org} quiere entrenarte y ${asks}. Revisa la invitación antes del ${expires}.`,
    heading: (org: string) => `${org} quiere entrenarte`,
    detailLabel: 'GIMNASIO',
    footer: (org: string) =>
      `Puedes ignorar este correo; no se hará ningún cambio. Allfit One lo envió en nombre de ${org}.`,
  },
  en: {
    subject: (org: string) => `${org} invited you as a client on Allfit One`,
    opening: (org: string) => `${org} wants to train you on Allfit One.`,
    asks: 'asks your permission to see information about you',
    lead: (asks: string, separately: string) => `To do so, the gym ${asks}. ${separately}`,
    separately: 'You’ll see exactly what it asks for, and why, and decide on each one separately.',
    validUntil: 'Valid until',
    review: 'Review invitation',
    note: 'Agreeing to train with the gym doesn’t give it access to your data.',
    openingDecides: 'Opening this email doesn’t decide anything either.',
    ignore: 'If you weren’t expecting this invitation, you can ignore this email.',
    preheader: (org: string, asks: string, expires: string) =>
      `${org} wants to train you and ${asks}. Review the invitation before ${expires}.`,
    heading: (org: string) => `${org} wants to train you`,
    detailLabel: 'GYM',
    footer: (org: string) =>
      `You can ignore this email; nothing will change. Allfit One sent it on behalf of ${org}.`,
  },
} as const

/**
 * The email a gym's client invitation sends.
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
  /** Hers when the address is one she verified; Spanish otherwise. */
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = CLIENT_INVITATION[locale]
  const organization = escapeHtml(input.organizationName)
  const expires = formatDay(input.expiresAt, locale, 'UTC')
  const lead = words.lead(words.asks, words.separately)
  return {
    subject: words.subject(input.organizationName),
    text: [
      words.opening(input.organizationName),
      lead,
      `${words.validUntil}: ${expires}`,
      `${words.review}: ${input.invitationUrl}`,
      `${words.note} ${words.openingDecides}`,
      words.ignore,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject(organization),
      preheader: words.preheader(organization, words.asks, expires),
      heading: words.heading(organization),
      lead,
      detailLabel: words.detailLabel,
      detailValue: organization,
      expires,
      actionUrl: escapeHtml(input.invitationUrl),
      brandAssetUrl: input.brandAssetUrl,
      note: `${words.note} ${words.openingDecides}`,
      footer: words.footer(organization),
    }),
  }
}

const REASSIGNED = {
  es: {
    subject: (professional: string, org: string) =>
      `${professional} es ahora tu profesional en ${org}`,
    heading: (org: string) => `${org} cambió el profesional que te atiende`,
    before: 'Antes',
    now: 'Ahora',
    unchanged:
      'Tus permisos no cambiaron. Tu nuevo profesional ve exactamente lo que el anterior veía, que es lo que tú permitiste, y nada más.',
    noLongerSees: (previous: string) => `${previous} ya no tiene acceso a tu información.`,
    note: 'Puedes cambiar o retirar tus permisos cuando quieras desde la app. Si no esperabas este cambio, habla con tu gimnasio.',
    preheader: (org: string) => `${org} cambió quién te atiende. Tus permisos no cambiaron.`,
    lead: (previous: string) =>
      `${previous} ya no tiene acceso a tu información. Tus permisos no cambiaron: tu nuevo profesional ve exactamente lo que el anterior veía.`,
    detailLabel: 'AHORA TE ATIENDE',
  },
  en: {
    subject: (professional: string, org: string) =>
      `${professional} is now your professional at ${org}`,
    heading: (org: string) => `${org} changed the professional who works with you`,
    before: 'Before',
    now: 'Now',
    unchanged:
      'Your permissions didn’t change. Your new professional sees exactly what the previous one saw, which is what you allowed, and nothing more.',
    noLongerSees: (previous: string) => `${previous} no longer has access to your information.`,
    note: 'You can change or withdraw your permissions whenever you like in the app. If you didn’t expect this change, talk to your gym.',
    preheader: (org: string) =>
      `${org} changed who works with you. Your permissions didn’t change.`,
    lead: (previous: string) =>
      `${previous} no longer has access to your information. Your permissions didn’t change: your new professional sees exactly what the previous one saw.`,
    detailLabel: 'NOW WORKING WITH YOU',
  },
} as const

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
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = REASSIGNED[locale]
  const organization = escapeHtml(input.organizationName)
  const professional = escapeHtml(input.professionalName)
  const previous = escapeHtml(input.previousProfessionalName)
  return {
    subject: words.subject(input.professionalName, input.organizationName),
    text: [
      `${words.heading(input.organizationName)}.`,
      `${words.before}: ${input.previousProfessionalName}`,
      `${words.now}: ${input.professionalName}`,
      words.unchanged,
      words.noLongerSees(input.previousProfessionalName),
      words.note,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject(professional, organization),
      preheader: words.preheader(organization),
      heading: words.heading(organization),
      lead: words.lead(previous),
      detailLabel: words.detailLabel,
      detailValue: professional,
      brandAssetUrl: input.brandAssetUrl,
      note: words.note,
    }),
  }
}

const COVER = {
  es: {
    subject: (substitute: string, holder: string) =>
      `¿Aceptas que ${substitute} te atienda mientras ${holder} no está?`,
    opening: (org: string, substitute: string, first: string, last: string, holder: string) =>
      `${org} propone que ${substitute} te atienda del ${first} al ${last}, mientras ${holder} no está.`,
    nothingYet: (substitute: string) =>
      `No pasa nada hasta que respondas. Mientras no aceptes, ${substitute} no ve nada de tu información.`,
    ifAccepted: (holder: string, last: string) =>
      `Si aceptas, verá lo mismo que ve ${holder} — lo que tú permitiste, y nada más — y solo hasta el ${last}.`,
    afterwards: 'Después deja de verlo sin que nadie tenga que hacer nada.',
    answer: 'Puedes aceptar o rechazar desde la app. Si no respondes, no se hace.',
    unexpected: 'Si no esperabas esto, habla con tu gimnasio.',
    preheader: (org: string) => `${org} propone una suplencia. No pasa nada hasta que respondas.`,
    heading: (org: string, substitute: string, holder: string) =>
      `${org} propone que ${substitute} te atienda mientras ${holder} no está`,
    detailLabel: 'TE ATENDERÍA',
    expiryLabel: 'SOLO ESTOS DÍAS',
  },
  en: {
    subject: (substitute: string, holder: string) =>
      `Will you let ${substitute} work with you while ${holder} is away?`,
    opening: (org: string, substitute: string, first: string, last: string, holder: string) =>
      `${org} proposes that ${substitute} works with you from ${first} to ${last}, while ${holder} is away.`,
    nothingYet: (substitute: string) =>
      `Nothing happens until you answer. Until you accept, ${substitute} sees none of your information.`,
    ifAccepted: (holder: string, last: string) =>
      `If you accept, they’ll see what ${holder} sees — what you allowed, and nothing more — and only until ${last}.`,
    afterwards: 'After that, they stop seeing it without anyone having to do anything.',
    answer: 'You can accept or decline in the app. If you don’t answer, it doesn’t happen.',
    unexpected: 'If you didn’t expect this, talk to your gym.',
    preheader: (org: string) => `${org} proposes a cover. Nothing happens until you answer.`,
    heading: (org: string, substitute: string, holder: string) =>
      `${org} proposes that ${substitute} works with you while ${holder} is away`,
    detailLabel: 'WOULD WORK WITH YOU',
    expiryLabel: 'ONLY THESE DAYS',
  },
} as const

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
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = COVER[locale]
  const organization = escapeHtml(input.organizationName)
  const substitute = escapeHtml(input.substituteName)
  const holder = escapeHtml(input.holderName)
  // Each day stays on one line, so a narrow panel breaks the range only at the dash.
  const windowHtml = [input.startsOn, input.endsOn]
    .map((day) => escapeHtml(formatCalendarDay(day, locale)).replaceAll(' ', '&nbsp;'))
    .join(' – ')
  const firstDay = formatCalendarDay(input.startsOn, locale)
  const lastDay = formatCalendarDay(input.endsOn, locale)
  return {
    subject: words.subject(input.substituteName, input.holderName),
    text: [
      words.opening(
        input.organizationName,
        input.substituteName,
        firstDay,
        lastDay,
        input.holderName,
      ),
      words.nothingYet(input.substituteName),
      `${words.ifAccepted(input.holderName, lastDay)} ${words.afterwards}`,
      words.answer,
      words.unexpected,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject(substitute, holder),
      preheader: words.preheader(organization),
      heading: words.heading(organization, substitute, holder),
      lead: `${words.nothingYet(substitute)} ${words.ifAccepted(holder, escapeHtml(lastDay))}`,
      detailLabel: words.detailLabel,
      detailValue: substitute,
      expiryLabel: words.expiryLabel,
      expires: windowHtml,
      brandAssetUrl: input.brandAssetUrl,
      note: `${words.answer} ${words.unexpected}`,
    }),
  }
}

const CORRECTION = {
  es: {
    subject: (proposer: string) => `${proposer} propone corregir un dato de tu entrenamiento`,
    opening: (proposer: string, org: string) =>
      `${proposer}, de ${org}, propone corregir un dato que registraste en una de tus sesiones de entrenamiento.`,
    unchanged:
      'Nada cambia a menos que lo aceptes: lo que registraste sigue igual, y tu historial también.',
    answer: (deadline: string) =>
      `Puedes revisarla y aceptarla o rechazarla desde la app hasta el ${deadline}. Si no respondes, la propuesta vence y todo queda como lo registraste.`,
    unexpected: 'Si no esperabas esto, habla con tu gimnasio.',
    preheader: 'Nada cambia a menos que lo aceptes.',
    heading: (proposer: string, org: string) =>
      `${proposer}, de ${org}, propone corregir un dato de tu entrenamiento`,
    detailLabel: 'LA PROPONE',
    expiryLabel: 'PUEDES RESPONDER HASTA',
  },
  en: {
    subject: (proposer: string) => `${proposer} proposes correcting something in your training`,
    opening: (proposer: string, org: string) =>
      `${proposer}, from ${org}, proposes correcting something you recorded in one of your training sessions.`,
    unchanged:
      'Nothing changes unless you accept it: what you recorded stays the same, and so does your history.',
    answer: (deadline: string) =>
      `You can review it and accept or decline it in the app until ${deadline}. If you don’t answer, the proposal expires and everything stays as you recorded it.`,
    unexpected: 'If you didn’t expect this, talk to your gym.',
    preheader: 'Nothing changes unless you accept it.',
    heading: (proposer: string, org: string) =>
      `${proposer}, from ${org}, proposes correcting something in your training`,
    detailLabel: 'PROPOSED BY',
    expiryLabel: 'YOU CAN ANSWER UNTIL',
  },
} as const

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
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = CORRECTION[locale]
  const organization = escapeHtml(input.organizationName)
  const proposer = escapeHtml(input.proposerName)
  const deadline = formatDay(input.expiresAt, locale, 'America/Bogota')
  const answer = words.answer(deadline)
  return {
    subject: words.subject(input.proposerName),
    text: [
      words.opening(input.proposerName, input.organizationName),
      words.unchanged,
      answer,
      words.unexpected,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: words.subject(proposer),
      preheader: words.preheader,
      heading: words.heading(proposer, organization),
      lead: escapeHtml(words.unchanged),
      detailLabel: words.detailLabel,
      detailValue: proposer,
      expiryLabel: words.expiryLabel,
      expires: escapeHtml(deadline),
      brandAssetUrl: input.brandAssetUrl,
      note: `${escapeHtml(answer)} ${words.unexpected}`,
    }),
  }
}

const PLAN = {
  es: {
    billing: 'El cobro lo administra el gimnasio, no Allfit One.',
    neverCard: 'Nunca te vamos a pedir los datos de tu tarjeta por correo.',
    paused: {
      subject: (org: string) => `${org} pausó tu plan por un pago pendiente`,
      opening: (org: string, plan: string, price: string) =>
        `${org} pausó tu plan ${plan} (${price}) por un pago pendiente.`,
      meanwhile:
        'Mientras esté pausado, tus sesiones futuras con ese gimnasio quedan en pausa y tu profesional no puede registrar cambios.',
      kept: 'Lo que compartiste con el gimnasio sigue igual: no se borró nada, tu historial está completo y los permisos que diste siguen en pie. Cuando el pago se resuelva, todo vuelve a funcionar sin que tengas que aceptar nada de nuevo.',
      resolve: 'Para resolverlo, habla directamente con ellos.',
      preheader:
        'Tus datos y tus permisos siguen igual. El plan se reactiva cuando el pago se resuelva.',
      leadKept:
        'Lo que compartiste sigue igual: no se borró nada, tu historial está completo y los permisos que diste siguen en pie.',
      note: 'El cobro lo administra el gimnasio, no Allfit One; para resolverlo habla directamente con ellos. Nunca te vamos a pedir los datos de tu tarjeta por correo.',
    },
    resumed: {
      subject: (org: string) => `${org} reactivó tu plan`,
      opening: (org: string, plan: string) => `${org} reactivó tu plan ${plan}.`,
      sessions:
        'Tus sesiones vuelven a verse como siempre y tu profesional puede registrar cambios otra vez.',
      nothingTaken:
        'No tuviste que volver a aceptar nada porque nunca se te quitó nada: el plan estaba en pausa, no cancelado.',
      preheader: 'Tus sesiones vuelven a verse como siempre.',
    },
    ended: {
      subject: (org: string) => `Tu plan con ${org} terminó`,
      opening: (org: string, plan: string) => `Tu plan ${plan} con ${org} terminó.`,
      noCharge: 'No se va a volver a cobrar.',
      yours:
        'Tu Fitness ID, tu historial de entrenamiento y lo que registraste siguen siendo tuyos y siguen ahí.',
      apart:
        'Terminar el plan no retira los permisos que diste ni cierra tu relación con el gimnasio. Si además quieres que dejen de ver tu información, eso se decide aparte desde la app.',
      preheader: 'No se va a volver a cobrar. Tu historial y tus permisos siguen como estaban.',
    },
  },
  en: {
    billing: 'The gym handles billing, not Allfit One.',
    neverCard: 'We will never ask for your card details by email.',
    paused: {
      subject: (org: string) => `${org} paused your plan over a pending payment`,
      opening: (org: string, plan: string, price: string) =>
        `${org} paused your ${plan} plan (${price}) over a pending payment.`,
      meanwhile:
        'While it’s paused, your upcoming sessions with that gym are on hold and your professional can’t record changes.',
      kept: 'What you shared with the gym stays the same: nothing was deleted, your history is complete and the permissions you gave still stand. Once the payment is resolved, everything works again, with nothing for you to accept.',
      resolve: 'To resolve it, talk to them directly.',
      preheader:
        'Your data and your permissions stay the same. The plan resumes once the payment is resolved.',
      leadKept:
        'What you shared stays the same: nothing was deleted, your history is complete and the permissions you gave still stand.',
      note: 'The gym handles billing, not Allfit One; to resolve it, talk to them directly. We will never ask for your card details by email.',
    },
    resumed: {
      subject: (org: string) => `${org} reactivated your plan`,
      opening: (org: string, plan: string) => `${org} reactivated your ${plan} plan.`,
      sessions: 'Your sessions are back to normal and your professional can record changes again.',
      nothingTaken:
        'You didn’t have to accept anything again because nothing was ever taken from you: the plan was paused, not cancelled.',
      preheader: 'Your sessions are back to normal.',
    },
    ended: {
      subject: (org: string) => `Your plan with ${org} ended`,
      opening: (org: string, plan: string) => `Your ${plan} plan with ${org} ended.`,
      noCharge: 'You won’t be charged again.',
      yours:
        'Your Fitness ID, your training history and what you recorded are still yours and still there.',
      apart:
        'Ending the plan doesn’t withdraw the permissions you gave or close your relationship with the gym. If you also want them to stop seeing your information, that’s a separate choice in the app.',
      preheader: 'You won’t be charged again. Your history and your permissions stay as they were.',
    },
  },
} as const

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
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = PLAN[locale]
  const copy = words.paused
  const organization = escapeHtml(input.organizationName)
  const price = formatMoney(input.amountMinor, input.currencyCode, locale)
  return {
    subject: copy.subject(input.organizationName),
    text: [
      copy.opening(input.organizationName, input.planName, price),
      copy.meanwhile,
      copy.kept,
      `${words.billing} ${copy.resolve}`,
      words.neverCard,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: copy.subject(organization),
      preheader: copy.preheader,
      heading: copy.subject(organization),
      lead: `${copy.meanwhile} ${copy.leadKept}`,
      detailLabel: 'PLAN',
      detailValue: `${escapeHtml(input.planName)} · ${escapeHtml(price)}`,
      brandAssetUrl: input.brandAssetUrl,
      note: copy.note,
    }),
  }
}

/** The pause is over. Nothing had to be re-granted, and the email says why. */
export function renderSubscriptionReactivatedEmail(input: {
  organizationName: string
  planName: string
  brandAssetUrl: string
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const words = PLAN[locale]
  const copy = words.resumed
  const organization = escapeHtml(input.organizationName)
  return {
    subject: copy.subject(input.organizationName),
    text: [
      copy.opening(input.organizationName, input.planName),
      copy.sessions,
      copy.nothingTaken,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: copy.subject(organization),
      preheader: copy.preheader,
      heading: copy.subject(organization),
      lead: `${copy.sessions} ${copy.nothingTaken}`,
      detailLabel: 'PLAN',
      detailValue: escapeHtml(input.planName),
      brandAssetUrl: input.brandAssetUrl,
      note: `${words.billing} ${words.neverCard}`,
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
  locale?: EmailLanguage
}): Rendered {
  const locale = input.locale ?? 'es'
  const copy = PLAN[locale].ended
  const organization = escapeHtml(input.organizationName)
  return {
    subject: copy.subject(input.organizationName),
    text: [
      `${copy.opening(input.organizationName, input.planName)} ${copy.noCharge}`,
      copy.yours,
      copy.apart,
    ].join('\n\n'),
    html: invitationEmailHtml({
      language: locale,
      product: 'Space',
      title: copy.subject(organization),
      preheader: copy.preheader,
      heading: copy.subject(organization),
      lead: `${copy.noCharge} ${copy.yours}`,
      detailLabel: 'PLAN',
      detailValue: escapeHtml(input.planName),
      brandAssetUrl: input.brandAssetUrl,
      note: copy.apart,
    }),
  }
}

/** A day as a reader of that language writes it, in the zone the email reckons in. */
function formatDay(instant: Date, locale: EmailLanguage, timeZone: string): string {
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(instant)
}

/**
 * A `date` from PostgreSQL as a person reads it.
 *
 * Parsed by its parts rather than handed to `new Date('2026-10-12')`, which
 * reads the string as midnight UTC and then renders it in the running machine's
 * zone — turning the 12th into the 11th for anybody west of Greenwich. A cover
 * that starts a day early in an email is a cover the person did not agree to.
 */
function formatCalendarDay(day: string, locale: EmailLanguage): string {
  const parts = day.split('-')
  const instant = Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  return formatDay(new Date(instant), locale, 'UTC')
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

function formatMoney(amountMinor: number, currencyCode: string, locale: EmailLanguage): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale], {
    style: 'currency',
    currency: currencyCode,
  }).format(amountMinor / 10 ** MINOR_UNIT_EXPONENT)
}
