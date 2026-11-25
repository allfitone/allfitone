/**
 * `T-SP-FAIL-01..05` — what a failed save tells somebody.
 *
 * The one that matters is the stale draft. It used to read «revisa tu conexión», which
 * sent people to look at their wifi for a problem that was not there — and left the
 * one thing they could actually do, reopen the screen, unsaid.
 */

import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { ApiError } from './api-error'
import { discardFailure, saveFailure } from './save-failure'

const es = textFor('es').training.save
const en = textFor('en').training.save

describe('why a save did not land', () => {
  test('T-SP-FAIL-01 a stale draft says what happened and what to do', () => {
    expect(saveFailure(new ApiError('conflict'), es)).toBe(
      'Se guardó desde otro sitio. Ciérralo y vuelve a abrirlo.',
    )
  })

  test('T-SP-FAIL-02 a request the server refused is called our fault, not the wifi', () => {
    expect(saveFailure(new ApiError('invalid-request'), es)).toBe(
      'El servidor rechazó el guardado. Es un fallo nuestro, no tuyo.',
    )
  })

  test('T-SP-FAIL-03 something discarded elsewhere is gone, not unreachable', () => {
    expect(saveFailure(new ApiError('not-found'), es)).toBe(
      'Esto ya no existe. Puede que se haya descartado desde otro sitio.',
    )
  })

  test('T-SP-FAIL-04 an expired session is the one that needs signing in again', () => {
    expect(saveFailure(new ApiError('unauthenticated'), es)).toBe(
      'Tu sesión venció. Vuelve a entrar para continuar.',
    )
  })

  test('T-SP-FAIL-05 and anything that is not an answer at all is the connection', () => {
    expect(saveFailure(new TypeError('Network request failed'), es)).toBe(es.offline)
    expect(saveFailure(new ApiError('unavailable'), es)).toBe(es.offline)
  })
})

describe('why a photograph did not become a cover', () => {})

describe('discardFailure', () => {
  test('names the programme when the routine is only in one, and says what to do', () => {
    // «Quítala de ahí primero» era un callejón: un programa publicado no se puede vaciar
    // ni descartar, así que quien siguiera el consejo daba vueltas.
    expect(discardFailure(new ApiError('conflict'), [{ title: 'Ini' }], es)).toBe(
      '«Ini» no puede quedarse sin rutinas. Añádele otra antes de descartar esta.',
    )
  })

  test('and stays general when it cannot know which one would be left empty', () => {
    const several = discardFailure(new ApiError('conflict'), [{ title: 'A' }, { title: 'B' }], es)
    expect(several).toContain('no puede quedarse sin rutinas')
    expect(several).not.toContain('«A»')
  })

  test('anything else is the retry it actually is', () => {
    expect(discardFailure(new Error('red'), [], es)).toBe(
      'No pudimos descartar la rutina. Inténtalo otra vez.',
    )
  })
})

describe('a failed save in English (TECH-44)', () => {
  test('T-SP-FAIL-06 the stale draft and the last routine of a programme speak English', () => {
    expect(saveFailure(new ApiError('conflict'), en)).toBe(
      'It was saved somewhere else. Close it and open it again.',
    )
    expect(discardFailure(new ApiError('conflict'), [{ title: 'Ini' }], en)).toBe(
      "“Ini” can't be left without routines. Add another one before discarding this one.",
    )
  })
})
