import { describe, expect, test } from 'bun:test'

import { isLandingPath } from './locale'

describe('isLandingPath', () => {
  test('the landing in each language', () => {
    expect(isLandingPath('/es')).toBe(true)
    expect(isLandingPath('/en')).toBe(true)
  })

  test('not the workspace, and not a page that merely starts with a locale', () => {
    expect(isLandingPath('/')).toBe(false)
    expect(isLandingPath('/app')).toBe(false)
    expect(isLandingPath('/invitations')).toBe(false)
    expect(isLandingPath('/es/privacy')).toBe(false)
    expect(isLandingPath('/english')).toBe(false)
  })
})
