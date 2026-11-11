import { describe, expect, test } from 'bun:test'

import {
  disciplineOptions,
  templateCreateErrors,
  templateCreateMessage,
  templateCreateRequest,
} from './session-template-create.js'
import { StudioApiError } from './studio-api.js'

describe('what a new template needs before it is sent', () => {
  test('a discipline and a name', () => {
    expect(templateCreateErrors({ disciplineCode: '', title: '' })).toEqual({
      discipline: 'Elige la disciplina de la plantilla.',
      title: 'Escribe el nombre de la plantilla.',
    })
  })

  test('a name made of spaces is no name', () => {
    expect(templateCreateErrors({ disciplineCode: 'strength', title: '   ' }).title).toBe(
      'Escribe el nombre de la plantilla.',
    )
  })

  test('a name the contract would refuse is refused here first', () => {
    expect(templateCreateErrors({ disciplineCode: 'strength', title: 'a'.repeat(161) }).title).toBe(
      'El nombre admite hasta 160 caracteres.',
    )
    expect(templateCreateErrors({ disciplineCode: 'strength', title: 'a'.repeat(160) })).toEqual({})
  })

  test('sends the name trimmed, because the server trims it too', () => {
    expect(templateCreateRequest({ disciplineCode: 'strength', title: '  Fuerza  ' })).toEqual({
      discipline_code: 'strength',
      title: 'Fuerza',
    })
  })
})

describe('the disciplines a template can belong to', () => {
  test('are offered by name, in the order a person reads them', () => {
    expect(
      disciplineOptions([
        { code: 'strength', name: 'Fuerza' },
        { code: 'endurance', name: 'Carrera' },
      ]),
    ).toEqual([
      { value: 'endurance', label: 'Carrera' },
      { value: 'strength', label: 'Fuerza' },
    ])
  })
})

describe('what a refusal says', () => {
  test('a missing permission or an inactive gym reads as one thing, as the server sends it', () => {
    // `planning.assert_manage_content` answers both with the same not-found.
    expect(templateCreateMessage(new StudioApiError(404, 'not-found'))).toBe(
      'Tu rol ya no crea contenido en esta organización, o la organización no está activa.',
    )
  })

  test('a discipline that stopped being published is named', () => {
    expect(templateCreateMessage(new StudioApiError(422, 'validation-failed'))).toBe(
      'Revisa la disciplina y el nombre. La disciplina tiene que seguir publicada.',
    )
  })

  test('a command already running is not a reason to change the data', () => {
    expect(templateCreateMessage(new StudioApiError(409, 'idempotency-in-progress'))).toContain(
      'sin cambiar los datos',
    )
    expect(templateCreateMessage(new StudioApiError(429, 'rate-limited'))).toContain(
      'sin cambiar los datos',
    )
  })

  test('an outage keeps the attempt', () => {
    expect(templateCreateMessage(new StudioApiError(503, 'upstream-unavailable'))).toContain(
      'Reintenta',
    )
    expect(templateCreateMessage(new StudioApiError(500, 'http-500'))).toContain(
      'Conservamos el intento',
    )
  })
})
