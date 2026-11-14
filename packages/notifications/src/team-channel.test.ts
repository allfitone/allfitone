import { expect, test } from 'bun:test'

import { NotificationDeliveryError, type FetchLike } from './index.js'
import { createSlackTeamChannel } from './team-channel.js'

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

test('a post reaches the webhook as Slack expects it', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []

  await createSlackTeamChannel(WEBHOOK, answering(200, calls)).post('Confirmadas: 41')

  expect(calls).toHaveLength(1)
  const [url, init] = calls[0] ?? []
  expect(url).toBe(WEBHOOK)
  expect(init?.method).toBe('POST')
  expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
  expect(JSON.parse(String(init?.body))).toEqual({ text: 'Confirmadas: 41' })
  expect(init?.signal).toBeInstanceOf(AbortSignal)
})

test('text from outside cannot become Slack markup', async () => {
  const calls: Array<[string, RequestInit | undefined]> = []

  await createSlackTeamChannel(WEBHOOK, answering(200, calls)).post(
    'Canal: <!channel> & <https://evil.example|haz clic>',
  )

  expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({
    text: 'Canal: &lt;!channel&gt; &amp; &lt;https://evil.example|haz clic&gt;',
  })
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
      .post('x')
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
    .post('x')
    .catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(NotificationDeliveryError)
  expect(failure).toMatchObject({ code: 'network_error', retryable: true })
  expect(String((failure as Error).message)).not.toContain('hooks.slack.com')
})
