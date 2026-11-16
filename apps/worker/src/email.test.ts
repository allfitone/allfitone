import { describe, expect, test } from 'bun:test'
import type { EmailSender } from '@allfitone/notifications'

import {
  createEmailSenderFromEnvironment,
  emailProviderFromEnvironment,
  type EmailAdapters,
} from './email.js'

const SENDER: EmailSender = { send: async () => undefined }

function recordingAdapters() {
  const calls: { adapter: keyof EmailAdapters; config: Record<string, unknown> }[] = []
  const adapters: EmailAdapters = {
    resend: (config) => {
      calls.push({ adapter: 'resend', config })
      return SENDER
    },
    ses: (config) => {
      calls.push({ adapter: 'ses', config })
      return SENDER
    },
  }
  return { adapters, calls }
}

describe('email provider', () => {
  test('ses sends through SES, from the configured sender, in the task region', () => {
    const { adapters, calls } = recordingAdapters()
    createEmailSenderFromEnvironment(
      {
        EMAIL_PROVIDER: 'ses',
        EMAIL_FROM: 'Allfit One <invites@allfit.one>',
        AWS_REGION: 'us-east-1',
      },
      adapters,
    )
    expect(calls).toHaveLength(1)
    expect(calls[0]?.adapter).toBe('ses')
    expect(calls[0]?.config).toMatchObject({
      from: 'Allfit One <invites@allfit.one>',
      region: 'us-east-1',
    })
    expect(calls[0]?.config.onSent).toBeFunction()
  })

  test('resend sends through Resend with its key', () => {
    const { adapters, calls } = recordingAdapters()
    createEmailSenderFromEnvironment(
      {
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM: 'Allfit One <invites@allfit.one>',
        RESEND_API_KEY: 're_test',
      },
      adapters,
    )
    expect(calls).toEqual([
      { adapter: 'resend', config: { apiKey: 're_test', from: 'Allfit One <invites@allfit.one>' } },
    ])
  })

  test('unset keeps Resend, so a task definition from before the setting still starts', () => {
    expect(emailProviderFromEnvironment({})).toBe('resend')
    expect(emailProviderFromEnvironment({ EMAIL_PROVIDER: '' })).toBe('resend')
  })

  test('any other value stops the worker instead of sending through a guess', () => {
    for (const value of ['SES', 'smtp', 'amazon', ' ses']) {
      expect(() => emailProviderFromEnvironment({ EMAIL_PROVIDER: value })).toThrow(
        'EMAIL_PROVIDER must be "resend" or "ses"',
      )
    }
  })

  test('SES needs the sender and the region, never a key', () => {
    const { adapters, calls } = recordingAdapters()
    expect(() =>
      createEmailSenderFromEnvironment(
        { EMAIL_PROVIDER: 'ses', AWS_REGION: 'us-east-1' },
        adapters,
      ),
    ).toThrow('EMAIL_FROM is not set')
    expect(() =>
      createEmailSenderFromEnvironment(
        { EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'invites@allfit.one' },
        adapters,
      ),
    ).toThrow('AWS_REGION is not set')
    expect(calls).toHaveLength(0)
  })

  test('the receipt reaches the log without the recipient', async () => {
    const { adapters, calls } = recordingAdapters()
    createEmailSenderFromEnvironment(
      { EMAIL_PROVIDER: 'ses', EMAIL_FROM: 'invites@allfit.one', AWS_REGION: 'us-east-1' },
      adapters,
    )
    const onSent = calls[0]?.config.onSent
    if (typeof onSent !== 'function') throw new Error('the SES adapter got no receipt handler')
    const lines: string[] = []
    const original = console.info
    console.info = (line: string) => lines.push(line)
    try {
      onSent({ idempotencyKey: 'staff-invitation/event-1', providerMessageId: '0100-abc' })
    } finally {
      console.info = original
    }
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {
        kind: 'event',
        name: 'worker.email.sent',
        provider: 'ses',
        idempotency_key: 'staff-invitation/event-1',
        provider_message_id: '0100-abc',
      },
    ])
  })
})
