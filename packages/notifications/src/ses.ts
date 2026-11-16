/**
 * The Amazon SES adapter for `EmailSender` (ADR-049).
 *
 * It lives behind its own entry point, `@allfitone/notifications/ses`, so that
 * only the worker loads the AWS SDK; the API imports this package for its
 * token helpers and never sends email.
 *
 * There is no key: the SDK finds its credentials the way every AWS SDK does,
 * which on ECS is the task role. Whether the role may send, and from which
 * address, is decided in IAM (`infra/modules/email`), not here.
 *
 * SES has no idempotency key. An event that comes back after its email went
 * out is sent again, which ADR-049 accepts over the risk of never sending. The
 * receipt carries the event's key and SES's message id into the worker's log,
 * so support can find that message in Virtual Deliverability Manager.
 */

import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

import { NotificationDeliveryError, type EmailSender } from './index.js'

export interface EmailReceipt {
  idempotencyKey: string
  providerMessageId: string
}

/** The one call the adapter makes; `SESv2Client` satisfies it, and tests pass a fake. */
export interface SendEmailClient {
  send(command: SendEmailCommand): Promise<{ MessageId?: string | undefined }>
}

// SES refuses these for this message or this account; sending again changes nothing.
const REJECTED = new Set([
  'MessageRejected',
  'MailFromDomainNotVerifiedException',
  'AccountSuspendedException',
  'SendingPausedException',
])

const THROTTLED = new Set(['TooManyRequestsException', 'LimitExceededException'])

export function createSesEmailSender(
  config: { from: string; region: string; onSent?: (receipt: EmailReceipt) => void },
  client?: SendEmailClient,
): EmailSender {
  if (!config.from || !config.region) throw new Error('SES email configuration is incomplete')
  const ses = client ?? new SESv2Client({ region: config.region })
  return {
    async send(message) {
      let messageId: string | undefined
      try {
        const sent = await ses.send(
          new SendEmailCommand({
            FromEmailAddress: config.from,
            Destination: { ToAddresses: [message.to] },
            Content: {
              Simple: {
                Subject: { Data: message.subject, Charset: 'UTF-8' },
                Body: {
                  Text: { Data: message.text, Charset: 'UTF-8' },
                  Html: { Data: message.html, Charset: 'UTF-8' },
                },
              },
            },
          }),
        )
        messageId = sent.MessageId
      } catch (error) {
        throw deliveryError(error)
      }
      if (messageId) {
        config.onSent?.({ idempotencyKey: message.idempotencyKey, providerMessageId: messageId })
      }
    },
  }
}

// Only the class of failure leaves the adapter; SES's message can name the recipient.
function deliveryError(error: unknown): NotificationDeliveryError {
  const name = error instanceof Error ? error.name : ''
  if (THROTTLED.has(name)) return new NotificationDeliveryError('provider_throttled', true)
  if (REJECTED.has(name)) return new NotificationDeliveryError('provider_rejected', false)
  const status = httpStatus(error)
  // No status means the request never got an answer: the network, or credentials not yet served.
  if (status === undefined) return new NotificationDeliveryError('network_error', true)
  if (status === 429) return new NotificationDeliveryError('provider_throttled', true)
  if (status >= 500) return new NotificationDeliveryError('provider_unavailable', true)
  return new NotificationDeliveryError('provider_rejected', false)
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) return undefined
  const metadata: unknown = error.$metadata
  if (typeof metadata !== 'object' || metadata === null || !('httpStatusCode' in metadata)) {
    return undefined
  }
  return typeof metadata.httpStatusCode === 'number' ? metadata.httpStatusCode : undefined
}
