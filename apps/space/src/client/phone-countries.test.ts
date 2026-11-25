/**
 * The phone as two parts (TECH-43, ADR-050): the country code picked from a list of the
 * Americas and the number typed beside it, joined into the E.164 the server keeps.
 */

import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import {
  chooseCountry,
  countriesIn,
  joinPhone,
  phoneLine,
  searchCountries,
  splitPhone,
  takeChosenCountry,
} from './phone-countries'

const COUNTRIES = countriesIn(textFor('es').identity.countries, 'es')

describe('the country codes of the Americas', () => {
  test('T-SPC-UNIT-PHONE-01 North, Central and South America, in alphabetical order', () => {
    const names = COUNTRIES.map((country) => country.name)

    expect(COUNTRIES).toHaveLength(22)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'es')))
    expect(COUNTRIES.find((country) => country.iso === 'CO')).toEqual({
      iso: 'CO',
      name: 'Colombia',
      dial: '57',
    })
    expect(new Set(COUNTRIES.map((country) => country.iso)).size).toBe(22)
  })

  test('T-SPC-UNIT-PHONE-02 a search finds a country by name, without accents, or by its code', () => {
    expect(searchCountries('peru', COUNTRIES).map((country) => country.iso)).toEqual(['PE'])
    expect(searchCountries('  CANADÁ ', COUNTRIES).map((country) => country.iso)).toEqual(['CA'])
    expect(searchCountries('+59', COUNTRIES).map((country) => country.iso)).toEqual([
      'BO',
      'EC',
      'GY',
      'PY',
      'SR',
      'UY',
    ])
    expect(searchCountries('', COUNTRIES)).toHaveLength(22)
  })

  test('T-SPC-UNIT-356 in English the countries are named and ordered in English', () => {
    const english = countriesIn(textFor('en').identity.countries, 'en')
    const names = english.map((country) => country.name)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
    expect(names.slice(-3)).toEqual(['United States', 'Uruguay', 'Venezuela'])
    expect(searchCountries('brazil', english).map((country) => country.iso)).toEqual(['BR'])
  })
})

describe('a phone in two parts', () => {
  test('T-SPC-UNIT-PHONE-03 a saved number splits into its country and the rest', () => {
    expect(splitPhone('+573105550142')).toEqual({ country: 'CO', national: '3105550142' })
    expect(splitPhone('+5939912345678')).toEqual({ country: 'EC', national: '9912345678' })
    expect(splitPhone('+14155550100')).toEqual({ country: 'US', national: '4155550100' })
    expect(splitPhone(null)).toEqual({ country: 'CO', national: '' })
    expect(splitPhone('+34600111222')).toEqual({ country: 'CO', national: '' })
  })

  test('T-SPC-UNIT-PHONE-04 the code and the number join into E.164; empty removes it', () => {
    expect(joinPhone('CO', '310 555-0142')).toBe('+573105550142')
    expect(joinPhone('AR', '(11) 5555 0100')).toBe('+541155550100')
    expect(joinPhone('CO', '   ')).toBeNull()
    expect(joinPhone('CO', '+57 310 555 0142')).toBeUndefined()
    expect(joinPhone('CO', '31a')).toBeUndefined()
    expect(joinPhone('CO', '12')).toBeUndefined()
  })

  test('T-SPC-UNIT-PHONE-05 a saved number reads with its code apart', () => {
    expect(phoneLine('+573105550142')).toBe('+57 3105550142')
    expect(phoneLine('+34600111222')).toBe('+34600111222')
  })

  test('T-SPC-UNIT-PHONE-06 the country picked in the list is handed back once', () => {
    expect(takeChosenCountry()).toBeUndefined()
    chooseCountry('PE')
    expect(takeChosenCountry()).toBe('PE')
    expect(takeChosenCountry()).toBeUndefined()
  })
})
