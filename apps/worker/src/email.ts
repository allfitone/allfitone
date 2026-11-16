/**
 * Which adapter sends the worker's email (ADR-049, decision 8).
 *
 * `EMAIL_PROVIDER` chooses while both adapters exist. Unset keeps Resend, as
 * before the setting existed, so a task definition from before this change
 * still starts; any other value stops the worker at start rather than at the
 * first email, possibly hours later.
 *
 * The SES receipt goes to the log with the event's key and SES's message id,
 * never the recipient: that pair is enough to find the message in Virtual
 * Deliverability Manager.
 */

import { createResendEmailSender, type EmailSender } from '@allfitone/notifications'
import { createSesEmailSender, type EmailReceipt } from '@allfitone/notifications/ses'

export type EmailProvider = 'resend' | 'ses'

export interface EmailAdapters {
  resend: typeof createResendEmailSender
  ses: typeof createSesEmailSender
}

const ADAPTERS: EmailAdapters = { resend: createResendEmailSender, ses: createSesEmailSender }

export function emailProviderFromEnvironment(environment: NodeJS.ProcessEnv): EmailProvider {
  const value = environment.EMAIL_PROVIDER
  if (value === undefined || value === '') return 'resend'
  if (value === 'resend' || value === 'ses') return value
  throw new Error('EMAIL_PROVIDER must be "resend" or "ses"')
}

export function createEmailSenderFromEnvironment(
  environment: NodeJS.ProcessEnv,
  adapters: EmailAdapters = ADAPTERS,
): EmailSender {
  const from = required(environment, 'EMAIL_FROM')
  if (emailProviderFromEnvironment(environment) === 'ses') {
    return adapters.ses({ from, region: required(environment, 'AWS_REGION'), onSent: logSent })
  }
  return adapters.resend({ apiKey: required(environment, 'RESEND_API_KEY'), from })
}

function logSent(receipt: EmailReceipt): void {
  console.info(
    JSON.stringify({
      kind: 'event',
      name: 'worker.email.sent',
      provider: 'ses',
      idempotency_key: receipt.idempotencyKey,
      provider_message_id: receipt.providerMessageId,
    }),
  )
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}
