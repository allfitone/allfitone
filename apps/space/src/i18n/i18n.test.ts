import { describe, expect, test } from 'bun:test'

import { createLocaleStore, deviceLocale, intlLocale, isLocale, localeFromTag, textFor } from '.'

describe('which language the app speaks (TECH-44)', () => {
  test('T-SPC-UNIT-344 only an English phone gets English; anything else gets Spanish', () => {
    expect(localeFromTag('en')).toBe('en')
    expect(localeFromTag('en-US')).toBe('en')
    expect(localeFromTag('EN_gb')).toBe('en')
    expect(localeFromTag('es-CO')).toBe('es')
    expect(localeFromTag('fr-FR')).toBe('es')
    expect(localeFromTag('pt-BR')).toBe('es')
    expect(localeFromTag('')).toBe('es')
    expect(localeFromTag(undefined)).toBe('es')
    expect(localeFromTag(null)).toBe('es')
  })

  test('T-SPC-UNIT-345 the device language is read through Intl, and a throwing Intl is Spanish', () => {
    expect(deviceLocale(() => 'en-AU')).toBe('en')
    expect(deviceLocale(() => 'es-MX')).toBe('es')
    expect(
      deviceLocale(() => {
        throw new RangeError('no ICU data')
      }),
    ).toBe('es')
  })

  test('T-SPC-UNIT-346 a stored preference is accepted only when it names a locale', () => {
    expect(isLocale('en')).toBe(true)
    expect(isLocale('es')).toBe(true)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale(null)).toBe(false)
  })

  test('T-SPC-UNIT-347 each locale formats numbers through its one Intl tag', () => {
    expect(intlLocale('es')).toBe('es-CO')
    expect(intlLocale('en')).toBe('en-US')
    expect((1234.5).toLocaleString(intlLocale('es'))).toBe('1.234,5')
    expect((1234.5).toLocaleString(intlLocale('en'))).toBe('1,234.5')
  })
})

describe('the locale held in memory', () => {
  test('T-SPC-UNIT-348 it follows the phone, read once, until something overrides it', () => {
    let reads = 0
    const store = createLocaleStore(() => {
      reads += 1
      return 'en'
    })
    expect(store.get()).toBe('en')
    expect(store.get()).toBe('en')
    expect(reads).toBe(1)
    store.set('es')
    expect(store.get()).toBe('es')
    store.set(null)
    expect(store.get()).toBe('en')
  })

  test('T-SPC-UNIT-349 listeners hear a change of language, and only a change', () => {
    const store = createLocaleStore(() => 'es')
    let heard = 0
    const stop = store.subscribe(() => {
      heard += 1
    })
    store.set('es')
    expect(heard).toBe(0)
    store.set('en')
    expect(heard).toBe(1)
    store.set(null)
    expect(heard).toBe(2)
    stop()
    store.set('en')
    expect(heard).toBe(2)
  })
})

/** Every leaf path of a dictionary, with whether it is a string, a function or a list. */
function shape(node: unknown, path = ''): string[] {
  if (typeof node === 'string') return [`${path}:string`]
  if (typeof node === 'function') return [`${path}:function/${String(node.length)}`]
  if (Array.isArray(node)) return [`${path}:list/${String(node.length)}`]
  if (node && typeof node === 'object')
    return Object.entries(node).flatMap(([key, value]) => shape(value, `${path}.${key}`))
  return [`${path}:${typeof node}`]
}

describe('the dictionaries', () => {
  const es = textFor('es')
  const en = textFor('en')

  test('T-SPC-UNIT-350 English has exactly the entries Spanish has, of the same kind', () => {
    expect(shape(en)).toEqual(shape(es))
  })

  test('T-SPC-UNIT-351 no entry is left empty in either language', () => {
    const blank = (node: unknown): boolean =>
      typeof node === 'string'
        ? node.trim() === ''
        : node !== null && typeof node === 'object'
          ? Object.values(node).some(blank)
          : false
    expect(blank(es)).toBe(false)
    expect(blank(en)).toBe(false)
  })

  test('T-SPC-UNIT-352 interpolations put the value where each language wants it', () => {
    expect(es.profile.version('1.4.0')).toBe('Versión 1.4.0 · Allfit Space')
    expect(en.profile.version('1.4.0')).toBe('Version 1.4.0 · Allfit Space')
    expect(es.pro.includedBy('Bodytech Chicó')).toBe('Incluido por Bodytech Chicó')
    expect(en.pro.includedBy('Bodytech Chicó')).toBe('Included by Bodytech Chicó')
  })
})
