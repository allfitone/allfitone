import { describe, expect, test } from 'bun:test'
import {
  AccountSuspendedException,
  BadRequestException,
  LimitExceededException,
  MailFromDomainNotVerifiedException,
  MessageRejected,
  SendEmailCommand,
  SendingPausedException,
  TooManyRequestsException,
} from '@aws-sdk/client-sesv2'

import { NotificationDeliveryError, type EmailMessage } from './index.js'
import { createSesEmailSender, type EmailReceipt, type SendEmailClient } from './ses.js'

const MESSAGE: EmailMessage = {
  to: 'person@example.test',
  subject: 'Invitación a Studio Norte',
  text: 'Texto con tilde: envío',
  html: '<p>Texto con tilde: envío</p>',
  idempotencyKey: 'staff-invitation/event-123',
}

const CONFIG = { from: 'Allfit One <invites@allfit.one>', region: 'us-east-1' }

function failingWith(error: unknown): SendEmailClient {
  return {
    send: async () => {
      throw error
    },
  }
}

describe('SES adapter', () => {
  test('sends the subject, both bodies and the sender to the one recipient', async () => {
    const commands: SendEmailCommand[] = []
    const receipts: EmailReceipt[] = []
    const sender = createSesEmailSender(
      { ...CONFIG, onSent: (receipt) => receipts.push(receipt) },
      {
        send: async (command) => {
          commands.push(command)
          return { MessageId: '010001a1c2717844-0000' }
        },
      },
    )

    await sender.send(MESSAGE)

    expect(commands).toHaveLength(1)
    expect(commands[0]?.input).toEqual({
      FromEmailAddress: 'Allfit One <invites@allfit.one>',
      Destination: { ToAddresses: ['person@example.test'] },
      Content: {
        Simple: {
          Subject: { Data: 'Invitación a Studio Norte', Charset: 'UTF-8' },
          Body: {
            Text: { Data: 'Texto con tilde: envío', Charset: 'UTF-8' },
            Html: { Data: '<p>Texto con tilde: envío</p>', Charset: 'UTF-8' },
          },
        },
      },
    })
    expect(receipts).toEqual([
      { idempotencyKey: 'staff-invitation/event-123', providerMessageId: '010001a1c2717844-0000' },
    ])
  })

  test('retries throttling, whichever limit SES hit', async () => {
    for (const error of [
      new TooManyRequestsException({ message: 'slow down', $metadata: { httpStatusCode: 429 } }),
      new LimitExceededException({ message: 'quota', $metadata: { httpStatusCode: 400 } }),
    ]) {
      await expect(createSesEmailSender(CONFIG, failingWith(error)).send(MESSAGE)).rejects.toEqual(
        new NotificationDeliveryError('provider_throttled', true),
      )
    }
  })

  test('retries a failure on the SES side', async () => {
    const error = Object.assign(new Error('internal'), {
      name: 'InternalFailure',
      $metadata: { httpStatusCode: 503 },
    })
    await expect(createSesEmailSender(CONFIG, failingWith(error)).send(MESSAGE)).rejects.toEqual(
      new NotificationDeliveryError('provider_unavailable', true),
    )
  })

  test('retries when the request never got an answer', async () => {
    const error = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    await expect(createSesEmailSender(CONFIG, failingWith(error)).send(MESSAGE)).rejects.toEqual(
      new NotificationDeliveryError('network_error', true),
    )
  })

  test('does not retry a rejection, and the reason never leaves the adapter', async () => {
    const metadata = { $metadata: { httpStatusCode: 400 } }
    for (const error of [
      new MessageRejected({
        message: 'Email address is not verified: person@example.test',
        ...metadata,
      }),
      new MailFromDomainNotVerifiedException({ message: 'mail from', ...metadata }),
      new AccountSuspendedException({ message: 'suspended', ...metadata }),
      new SendingPausedException({ message: 'paused', ...metadata }),
      new BadRequestException({ message: 'bad request', ...metadata }),
    ]) {
      const failure = await createSesEmailSender(CONFIG, failingWith(error))
        .send(MESSAGE)
        .then(
          () => undefined,
          (reason: unknown) => reason,
        )
      expect(failure).toEqual(new NotificationDeliveryError('provider_rejected', false))
      expect(String(failure)).not.toContain('person@example.test')
    }
  })

  test('refuses to start without a sender or a region', () => {
    expect(() => createSesEmailSender({ from: '', region: 'us-east-1' })).toThrow()
    expect(() => createSesEmailSender({ from: CONFIG.from, region: '' })).toThrow()
  })
})
