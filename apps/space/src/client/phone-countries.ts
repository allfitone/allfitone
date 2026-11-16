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

import { typedPhone } from './fitness-profile'

export interface Country {
  readonly iso: string
  readonly name: string
  /** The country code without its plus. */
  readonly dial: string
}

export const COUNTRIES: readonly Country[] = [
  { iso: 'AR', name: 'Argentina', dial: '54' },
  { iso: 'BZ', name: 'Belice', dial: '501' },
  { iso: 'BO', name: 'Bolivia', dial: '591' },
  { iso: 'BR', name: 'Brasil', dial: '55' },
  { iso: 'CA', name: 'Canadá', dial: '1' },
  { iso: 'CL', name: 'Chile', dial: '56' },
  { iso: 'CO', name: 'Colombia', dial: '57' },
  { iso: 'CR', name: 'Costa Rica', dial: '506' },
  { iso: 'EC', name: 'Ecuador', dial: '593' },
  { iso: 'SV', name: 'El Salvador', dial: '503' },
  { iso: 'US', name: 'Estados Unidos', dial: '1' },
  { iso: 'GT', name: 'Guatemala', dial: '502' },
  { iso: 'GY', name: 'Guyana', dial: '592' },
  { iso: 'HN', name: 'Honduras', dial: '504' },
  { iso: 'MX', name: 'México', dial: '52' },
  { iso: 'NI', name: 'Nicaragua', dial: '505' },
  { iso: 'PA', name: 'Panamá', dial: '507' },
  { iso: 'PY', name: 'Paraguay', dial: '595' },
  { iso: 'PE', name: 'Perú', dial: '51' },
  { iso: 'SR', name: 'Surinam', dial: '597' },
  { iso: 'UY', name: 'Uruguay', dial: '598' },
  { iso: 'VE', name: 'Venezuela', dial: '58' },
]

export const DEFAULT_COUNTRY = 'CO'

export function countryOf(iso: string): Country | undefined {
  return COUNTRIES.find((country) => country.iso === iso)
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** By name, accents and case aside, or by the start of the code, with or without its plus. */
export function searchCountries(query: string): Country[] {
  const wanted = plain(query).replace(/^\+/, '')
  if (wanted === '') return [...COUNTRIES]
  return COUNTRIES.filter(
    (country) => plain(country.name).includes(wanted) || country.dial.startsWith(wanted),
  )
}

// Longest code first, so +591 is Bolivia rather than an unknown +59; +1 is the United States.
function countryOfNumber(e164: string): Country | undefined {
  return [...COUNTRIES]
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
  const country = countryOf(iso)
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
