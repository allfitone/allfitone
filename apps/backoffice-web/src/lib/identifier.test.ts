import { describe, expect, test } from 'bun:test'

import { shortIdentifier } from './identifier'

describe('an identifier shortened for reading', () => {
  test('keeps its first eight and last four characters', () => {
    expect(shortIdentifier('019a3000-0000-7000-8000-000000000001')).toBe('019a3000…0001')
  })

  // A UUIDv7 starts with its timestamp: two people created in the same minute
  // share their first eight characters, and only the end tells them apart.
  test('tells apart two identifiers made in the same minute', () => {
    const first = shortIdentifier('019a9100-0000-7000-8000-000000000006')
    const second = shortIdentifier('019a9100-0000-7000-8000-000000000008')
    expect(first).not.toBe(second)
  })

  test('leaves a value already short as it is', () => {
    expect(shortIdentifier('short')).toBe('short')
  })
})
