import { expect, test } from 'bun:test'

import { NotificationDeliveryError, type FetchLike } from './index.js'
import { createSlackTeamChannel, type TeamNotice } from './team-channel.js'

const WEBHOOK = 'https://hooks.slack.com/services/T000/B000/secret'

function answering(
  status: number,
  calls: Array<[string, RequestInit | undefined]> = [],
): FetchLike {
  return async (input, init) => {
    calls.push([String(input), init])
    return new Response(status === 200 ? 'ok' : 'no_service', { status })
  }
}

const NOTICE: TeamNotice = {
  summary: 'Nueva persona en la lista · 41 confirmadas',
  title: 'Nueva persona en la lista de espera',
  origin: 'Allfit Space · Confirmó su correo',
  facts: [
    { label: 'Canal', value: 'instagram' },
    { label: 'Confirmadas en la lista', value: '41' },
  ],
}

function sent(calls: Array<[string, RequestInit | undefined]>): unknown {
  return JSON.parse(String(calls[0]?.[1]?.body))
}

test('a notice reaches the webhook as one Slack attachment in the brand colour', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []

  await createSlackTeamChannel(WEBHOOK, answering(200, calls)).post(NOTICE)

  expect(calls).toHaveLength(1)
  const [url, init] = calls[0] ?? []
  expect(url).toBe(WEBHOOK)
  expect(init?.method).toBe('POST')
  expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
  expect(init?.signal).toBeInstanceOf(AbortSignal)
  expect(sent(calls)).toEqual({
    attachments: [
      {
        color: '#55EFFB',
        fallback: 'Nueva persona en la lista · 41 confirmadas',
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: 'Nueva persona en la lista de espera', emoji: false },
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: 'Allfit Space · Confirmó su correo' }],
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Canal*\ninstagram' },
              { type: 'mrkdwn', text: '*Confirmadas en la lista*\n41' },
            ],
          },
        ],
      },
    ],
  })
})

test('text from outside cannot become Slack markup, wherever the notice carries it', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []
  const hostile = '<!channel> & <https://evil.example|haz clic>'
  const escaped = '&lt;!channel&gt; &amp; &lt;https://evil.example|haz clic&gt;'

  await createSlackTeamChannel(WEBHOOK, answering(200, calls)).post({
    summary: hostile,
    title: hostile,
    origin: hostile,
    facts: [{ label: hostile, value: hostile }],
  })

  const body = JSON.stringify(sent(calls))
  expect(body).not.toContain('<')
  expect(body).not.toContain('>')
  // The summary, the title, the origin, the label and the value: five places, all escaped.
  expect(body.split(escaped)).toHaveLength(6)
})

test('a notice with more facts than Slack takes keeps the first ten', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []

  await createSlackTeamChannel(WEBHOOK, answering(200, calls)).post({
    ...NOTICE,
    facts: Array.from({ length: 12 }, (_, index) => ({ label: `Dato ${index + 1}`, value: 'x' })),
  })

  const { attachments } = sent(calls) as {
    attachments: Array<{ blocks: Array<{ fields?: Array<{ text: string }> }> }>
  }
  const fields = attachments[0]?.blocks[2]?.fields ?? []
  expect(fields).toHaveLength(10)
  expect(fields.at(-1)?.text).toBe('*Dato 10*\nx')
})

test('an address that is not a Slack webhook is refused before any post', () => {
  for (const address of ['', 'https://example.com/hook', 'http://hooks.slack.com/services/T/B/x']) {
    expect(() => createSlackTeamChannel(address, answering(200))).toThrow(
      'The Slack webhook address is not a Slack incoming webhook',
    )
  }
})

test('what Slack answers decides whether another try is worth it', async () => {
  const outcomes: Array<[number, string, boolean]> = [
    [429, 'provider_throttled', true],
    [500, 'provider_unavailable', true],
    [503, 'provider_unavailable', true],
    [400, 'provider_rejected', false],
    [403, 'provider_rejected', false],
    [404, 'provider_rejected', false],
    [410, 'provider_rejected', false],
  ]
  for (const [status, code, retryable] of outcomes) {
    const failure = await createSlackTeamChannel(WEBHOOK, answering(status))
      .post(NOTICE)
      .catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(NotificationDeliveryError)
    expect(failure).toMatchObject({ code, retryable })
  }
})

test('a network failure is retried and never carries the address', async () => {
  const failing: FetchLike = async () => {
    throw new Error(`connect ECONNREFUSED ${WEBHOOK}`)
  }

  const failure = await createSlackTeamChannel(WEBHOOK, failing)
    .post(NOTICE)
    .catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(NotificationDeliveryError)
  expect(failure).toMatchObject({ code: 'network_error', retryable: true })
  expect(String((failure as Error).message)).not.toContain('hooks.slack.com')
})
