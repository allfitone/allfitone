import { expect, test } from 'bun:test'

import { NotificationDeliveryError, type FetchLike } from './index.js'
import { createExpoPushSender, renderPushNotice, type PushMessage } from './push.js'

type Call = [string, RequestInit | undefined]

function answering(status: number, body: unknown, calls: Call[] = []): FetchLike {
  return async (input, init) => {
    calls.push([String(input), init])
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  }
}

function message(token: string): PushMessage {
  return {
    token,
    title: 'Bodytech Chicó te invita',
    body: 'Ábrela para ver qué te proponen.',
    data: { notice_id: '019b8000-0000-7000-8000-000000000001', kind: 'client_invitation' },
  }
}

test('T-NOT-PUSH-UNIT-01 posts the messages to Expo as its documented array, with no SDK', async () => {
  const calls: Call[] = []
  const sender = createExpoPushSender(
    { accessToken: 'expo-access' },
    answering(200, { data: [{ status: 'ok', id: 'ticket-1' }] }, calls),
  )

  const outcomes = await sender.send([message('ExponentPushToken[a]')])

  expect(outcomes).toEqual([{ kind: 'accepted' }])
  const [url, init] = calls[0] ?? []
  expect(url).toBe('https://exp.host/--/api/v2/push/send')
  expect(init?.method).toBe('POST')
  expect(init?.headers).toMatchObject({
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: 'Bearer expo-access',
  })
  expect(JSON.parse(String(init?.body))).toEqual([
    {
      to: 'ExponentPushToken[a]',
      title: 'Bodytech Chicó te invita',
      body: 'Ábrela para ver qué te proponen.',
      data: { notice_id: '019b8000-0000-7000-8000-000000000001', kind: 'client_invitation' },
      sound: 'default',
    },
  ])
})

test('T-NOT-PUSH-UNIT-02 without an access token it sends no authorization header', async () => {
  const calls: Call[] = []
  await createExpoPushSender({}, answering(200, { data: [{ status: 'ok', id: 't' }] }, calls)).send(
    [message('ExponentPushToken[a]')],
  )
  expect(Object.keys(calls[0]?.[1]?.headers ?? {})).not.toContain('authorization')
})

test('T-NOT-PUSH-UNIT-03 reads one ticket per message, in order, in our own words', async () => {
  const outcomes = await createExpoPushSender(
    {},
    answering(200, {
      data: [
        { status: 'ok', id: 'ticket-1' },
        {
          status: 'error',
          message: '"ExponentPushToken[b]" is not a registered push notification recipient',
          details: { error: 'DeviceNotRegistered' },
        },
        { status: 'error', message: 'too big', details: { error: 'MessageTooBig' } },
        { status: 'error', message: 'unknown' },
      ],
    }),
  ).send([
    message('ExponentPushToken[a]'),
    message('ExponentPushToken[b]'),
    message('ExponentPushToken[c]'),
    message('ExponentPushToken[d]'),
  ])

  expect(outcomes).toEqual([
    { kind: 'accepted' },
    { kind: 'unregistered' },
    { kind: 'rejected', reason: 'MessageTooBig' },
    { kind: 'rejected', reason: 'expo_error' },
  ])
})

test('T-NOT-PUSH-UNIT-04 sends at most a hundred messages per request', async () => {
  const calls: Call[] = []
  const fetcher: FetchLike = async (input, init) => {
    calls.push([String(input), init])
    const count = (JSON.parse(String(init?.body)) as unknown[]).length
    return new Response(
      JSON.stringify({ data: Array.from({ length: count }, () => ({ status: 'ok', id: 't' })) }),
      { status: 200 },
    )
  }

  const outcomes = await createExpoPushSender({}, fetcher).send(
    Array.from({ length: 150 }, (_, index) => message(`ExponentPushToken[${index}]`)),
  )

  expect(calls.map(([, init]) => (JSON.parse(String(init?.body)) as unknown[]).length)).toEqual([
    100, 50,
  ])
  expect(outcomes).toHaveLength(150)
})

test('T-NOT-PUSH-UNIT-05 a request refused whole is retried only when Expo or the network was down', async () => {
  const refusal = (status: number) =>
    createExpoPushSender({}, answering(status, { errors: [{ code: 'X', message: 'x' }] }))
      .send([message('ExponentPushToken[a]')])
      .catch((error: unknown) => error)

  const throttled = await refusal(429)
  const down = await refusal(503)
  const malformed = await refusal(400)
  const offline = await createExpoPushSender({}, async () => {
    throw new Error('ECONNRESET')
  })
    .send([message('ExponentPushToken[a]')])
    .catch((error: unknown) => error)

  for (const [error, code, retryable] of [
    [throttled, 'provider_throttled', true],
    [down, 'provider_unavailable', true],
    [malformed, 'provider_rejected', false],
    [offline, 'network_error', true],
  ] as const) {
    expect(error).toBeInstanceOf(NotificationDeliveryError)
    expect(error).toMatchObject({ code, retryable })
  }
})

test('T-NOT-PUSH-UNIT-06 tickets that do not match the messages are never guessed at', async () => {
  const error = await createExpoPushSender({}, answering(200, { data: [] }))
    .send([message('ExponentPushToken[a]')])
    .catch((caught: unknown) => caught)
  expect(error).toMatchObject({ code: 'provider_unavailable', retryable: true })
})

test('T-NOT-PUSH-UNIT-07 a push says what happened in her language, Spanish while she has none', () => {
  expect(
    renderPushNotice({
      kind: 'client_invitation',
      organizationName: 'Bodytech Chicó',
      locale: null,
    }),
  ).toEqual({ title: 'Bodytech Chicó te invita', body: 'Ábrela para ver qué te proponen.' })
  expect(
    renderPushNotice({
      kind: 'client_invitation',
      organizationName: 'Bodytech Chicó',
      locale: 'en',
    }),
  ).toEqual({ title: 'Bodytech Chicó invited you', body: 'Open it to see what they offer.' })
  expect(
    renderPushNotice({ kind: 'password_changed', organizationName: null, locale: 'es' }),
  ).toEqual({ title: 'Tu contraseña cambió', body: 'Si no fuiste tú, ábrela ahora.' })
  expect(
    renderPushNotice({ kind: 'plan_paused', organizationName: null, locale: 'fr' }).title,
  ).toBe('Tu plan con tu gimnasio está en pausa')
})
