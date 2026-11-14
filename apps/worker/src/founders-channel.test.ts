import { expect, test } from 'bun:test'

import { foundersChannelFromEnvironment } from './founders-channel.js'

test('T-WRK-WL-12 the environment gives a channel only for a Slack webhook address', () => {
  const logged: unknown[][] = []
  const original = console.error
  console.error = (...parts: unknown[]) => {
    logged.push(parts)
  }
  try {
    expect(foundersChannelFromEnvironment({})).toBeUndefined()
    expect(foundersChannelFromEnvironment({ SLACK_FOUNDERS_WEBHOOK_URL: '' })).toBeUndefined()
    expect(logged).toEqual([])

    expect(
      foundersChannelFromEnvironment({
        SLACK_FOUNDERS_WEBHOOK_URL: 'https://example.com/hooks/secret-part',
      }),
    ).toBeUndefined()
    // A wrong address is reported without printing it.
    expect(logged).toHaveLength(1)
    expect(JSON.stringify(logged)).not.toContain('secret-part')

    expect(
      foundersChannelFromEnvironment({
        SLACK_FOUNDERS_WEBHOOK_URL: 'https://hooks.slack.com/services/T000/B000/secret',
      }),
    ).toBeDefined()
  } finally {
    console.error = original
  }
})
