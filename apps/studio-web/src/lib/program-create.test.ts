import { describe, expect, test } from 'bun:test'

import { programCreateError, programCreateMessage, programCreateRequest } from './program-create'
import { StudioApiError } from './studio-api'

describe('creating a program', () => {
  test('asks for a name, and no longer than 160 characters', () => {
    expect(programCreateError('   ')).toBe('Escribe el nombre del programa.')
    expect(programCreateError('x'.repeat(161))).toBe('El nombre admite hasta 160 caracteres.')
    expect(programCreateError('Hipertrofia')).toBeUndefined()
  })

  test('sends the trimmed name and nothing else', () => {
    expect(programCreateRequest('  Hipertrofia  ')).toEqual({ title: 'Hipertrofia' })
  })

  /*
   * `planning.assert_manage_content` answers a missing capability and an
   * inactive organization with the same 404, so one message covers both.
   */
  test('reads a 404 as the role or the organization, without telling them apart', () => {
    expect(programCreateMessage(new StudioApiError(404, 'not-found'))).toBe(
      'Tu rol ya no crea contenido en esta organización, o la organización no está activa.',
    )
  })

  test('says a repeated command is still running rather than failed', () => {
    expect(programCreateMessage(new StudioApiError(409, 'idempotency-conflict'))).toBe(
      'Esa creación ya está en curso. Espera un momento y reintenta sin cambiar el nombre.',
    )
  })
})
