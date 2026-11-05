import { describe, expect, test } from 'bun:test'

import { localeFromPath } from './locale'

describe('localeFromPath', () => {
  test('reads the first segment', () => {
    expect(localeFromPath('/en')).toBe('en')
    expect(localeFromPath('/es/privacy')).toBe('es')
  })

  test('nothing when the path has no locale', () => {
    expect(localeFromPath('/')).toBeNull()
    expect(localeFromPath('/privacy')).toBeNull()
    expect(localeFromPath('/english')).toBeNull()
  })
})
