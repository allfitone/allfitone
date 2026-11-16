import { describe, expect, test } from 'bun:test'

import {
  latestVersionNumber,
  publishBlockedReason,
  publishOutcome,
} from './session-template-publish.js'

describe('the newest version a template has', () => {
  test('is the highest number, retired or not, and none before the first publication', () => {
    expect(
      latestVersionNumber([
        { version_number: 1, status: 'deprecated' },
        { version_number: 3, status: 'published' },
        { version_number: 2, status: 'published' },
      ]),
    ).toBe(3)
    expect(latestVersionNumber([])).toBeUndefined()
  })
})

describe('what a publication answers', () => {
  test('a new number is a new version', () => {
    expect(publishOutcome(2, { version_number: 3 })).toEqual({
      kind: 'published',
      message: 'Publicada la versión 3. Ya se puede usar en programas.',
    })
    expect(publishOutcome(undefined, { version_number: 1 }).kind).toBe('published')
  })

  /*
   * Criterion 4, as built: the server compares with the newest version only
   * (`20260918190000_versions_never_go_back`). The same content again returns
   * that version instead of a new one, and the screen must not call it new.
   */
  test('the newest number again means nothing changed, and no version was made', () => {
    expect(publishOutcome(3, { version_number: 3 })).toEqual({
      kind: 'unchanged',
      message: 'El borrador es igual a la versión 3, así que no se creó una versión nueva.',
    })
  })
})

describe('when publishing has to wait', () => {
  test('unsaved work is saved first, because the server publishes what it has saved', () => {
    expect(publishBlockedReason({ dirty: true, conflict: false })).toBe(
      'Guarda el borrador antes de publicar: se publica lo guardado, no lo que ves sin guardar.',
    )
  })

  test('a conflict is resolved first', () => {
    expect(publishBlockedReason({ dirty: false, conflict: true })).toBe(
      'Resuelve primero el aviso de que alguien guardó este borrador.',
    )
  })

  test('otherwise it can go', () => {
    expect(publishBlockedReason({ dirty: false, conflict: false })).toBeUndefined()
  })
})
