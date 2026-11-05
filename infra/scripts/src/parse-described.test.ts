import { describe, expect, test } from 'bun:test'

import { parseDescribed } from './parse-described.js'

const output = (taskDefinition: unknown) => JSON.stringify({ taskDefinition, tags: [] })

describe('parseDescribed', () => {
  test('reads the task definition out of describe-task-definition output', () => {
    const parsed = parseDescribed(
      output({
        family: 'allfitone-production-api',
        containerDefinitions: [{ name: 'api', image: 'repo:tag' }],
      }),
    )
    expect(parsed.family).toBe('allfitone-production-api')
    expect(parsed.containerDefinitions[0]?.image).toBe('repo:tag')
  })

  test('rejects output without a task definition', () => {
    expect(() => parseDescribed(JSON.stringify({ tags: [] }))).toThrow('task definition')
  })

  test('rejects a task definition without a family', () => {
    expect(() => parseDescribed(output({ containerDefinitions: [{ image: 'repo:tag' }] }))).toThrow(
      'task definition',
    )
  })

  test('rejects a container without an image', () => {
    expect(() =>
      parseDescribed(output({ family: 'f', containerDefinitions: [{ name: 'api' }] })),
    ).toThrow('task definition')
  })

  test('rejects an environment entry that is not a name and a value', () => {
    const container = { image: 'repo:tag', environment: [{ name: 'PORT' }] }
    expect(() =>
      parseDescribed(output({ family: 'f', containerDefinitions: [container] })),
    ).toThrow('task definition')
  })
})
