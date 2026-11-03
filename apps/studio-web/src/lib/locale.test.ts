import { describe, expect, test } from 'bun:test'

import { isLandingPath, preferredLocale } from './locale'

describe('preferredLocale', () => {
  test('Spanish when nothing is said', () => {
    expect(preferredLocale(null)).toBe('es')
    expect(preferredLocale('')).toBe('es')
  })

  test('the first supported language the browser asks for', () => {
    expect(preferredLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en')
    expect(preferredLocale('es-CO,es;q=0.9,en;q=0.8')).toBe('es')
  })

  test('by weight, not by position', () => {
    expect(preferredLocale('es;q=0.4,en;q=0.9')).toBe('en')
  })

  test('Spanish when the browser asks only for languages the landing lacks', () => {
    expect(preferredLocale('fr-FR,de;q=0.8')).toBe('es')
  })

  test('a language refused with q=0 is never chosen', () => {
    expect(preferredLocale('en;q=0,fr')).toBe('es')
  })
})

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
