/**
 * The phone as two parts (TECH-43, ADR-050): the country code, picked from a list, and
 * the number typed beside it. The server keeps one E.164 string; the split exists only
 * on screen, so nobody has to know how to write their own country code.
 *
 * **The Americas, North, Central and South**, and nothing else for now: the 22 sovereign
 * countries of the continent. The Caribbean is left out on purpose, because most of it
 * shares `+1` with the United States and Canada and the list would stop telling apart
 * the countries it shows.
 *
 * **`+1` reads as the United States.** Canada shares the code, and the number alone
 * cannot say which it is; the person picks Canada again if that is hers.
 *
 * The picked country travels back from the list screen through `chooseCountry`, read
 * once by the phone screen when it shows again: a route parameter cannot return a value.
 */

import { intlLocale, type Dictionary, type Locale } from '../i18n'
import { typedPhone } from './fitness-profile'

export type CountryNames = Dictionary['identity']['countries']
type CountryIso = keyof CountryNames

export interface Country {
  readonly iso: string
  readonly name: string
  /** The country code without its plus. */
  readonly dial: string
}

/** The codes, which are data; their names come from the dictionary. */
const CODES: readonly { readonly iso: CountryIso; readonly dial: string }[] = [
  { iso: 'AR', dial: '54' },
  { iso: 'BZ', dial: '501' },
  { iso: 'BO', dial: '591' },
  { iso: 'BR', dial: '55' },
  { iso: 'CA', dial: '1' },
  { iso: 'CL', dial: '56' },
  { iso: 'CO', dial: '57' },
  { iso: 'CR', dial: '506' },
  { iso: 'EC', dial: '593' },
  { iso: 'SV', dial: '503' },
  { iso: 'US', dial: '1' },
  { iso: 'GT', dial: '502' },
  { iso: 'GY', dial: '592' },
  { iso: 'HN', dial: '504' },
  { iso: 'MX', dial: '52' },
  { iso: 'NI', dial: '505' },
  { iso: 'PA', dial: '507' },
  { iso: 'PY', dial: '595' },
  { iso: 'PE', dial: '51' },
  { iso: 'SR', dial: '597' },
  { iso: 'UY', dial: '598' },
  { iso: 'VE', dial: '58' },
]

/** The countries named in one language, in that language's alphabetical order. */
export function countriesIn(names: CountryNames, locale: Locale): Country[] {
  const collation = intlLocale(locale)
  return CODES.map((code) => ({ iso: code.iso, name: names[code.iso], dial: code.dial })).sort(
    (a, b) => a.name.localeCompare(b.name, collation),
  )
}

export const DEFAULT_COUNTRY = 'CO'

export function countryOf(iso: string, countries: readonly Country[]): Country | undefined {
  return countries.find((country) => country.iso === iso)
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** By name, accents and case aside, or by the start of the code, with or without its plus. */
export function searchCountries(query: string, countries: readonly Country[]): Country[] {
  const wanted = plain(query).replace(/^\+/, '')
  if (wanted === '') return [...countries]
  return countries.filter(
    (country) => plain(country.name).includes(wanted) || country.dial.startsWith(wanted),
  )
}

// Longest code first, so +591 is Bolivia rather than an unknown +59; +1 is the United States.
function countryOfNumber(e164: string): (typeof CODES)[number] | undefined {
  return [...CODES]
    .filter((country) => country.iso !== 'CA')
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((country) => e164.startsWith(`+${country.dial}`))
}

/** A saved number as its country and the rest; one from outside the list starts empty. */
export function splitPhone(e164: string | null): { country: string; national: string } {
  const country = e164 === null ? undefined : countryOfNumber(e164)
  if (e164 === null || country === undefined) return { country: DEFAULT_COUNTRY, national: '' }
  return { country: country.iso, national: e164.slice(country.dial.length + 1) }
}

/** E.164 from the two parts; null when the number is empty, undefined when it is not one. */
export function joinPhone(iso: string, national: string): string | null | undefined {
  const country = CODES.find((code) => code.iso === iso)
  const digits = national.replace(/[\s().-]/g, '')
  if (digits === '') return null
  if (country === undefined || !/^[0-9]{4,14}$/.test(digits)) return undefined
  return typedPhone(`+${country.dial}${digits}`) ?? undefined
}

/** «+57 3105550142»: the code apart, so the number reads. */
export function phoneLine(e164: string): string {
  const country = countryOfNumber(e164)
  return country ? `+${country.dial} ${e164.slice(country.dial.length + 1)}` : e164
}

let chosen: string | undefined

export function chooseCountry(iso: string): void {
  chosen = iso
}

export function takeChosenCountry(): string | undefined {
  const taken = chosen
  chosen = undefined
  return taken
}
