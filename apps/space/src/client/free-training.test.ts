import { describe, expect, test } from 'bun:test'

import { textFor } from '../i18n'
import { openSessionBar } from './free-training'

const OPEN = '019e4000-0000-7000-8000-000000000901'

describe('free training on Today', () => {
  test('T-SPC-UNIT-303 the open bar carries the routine first, then the free session', () => {
    const free = textFor('es').session.freeSession
    const planned = { executionId: 'planned', title: 'Tirón' }
    expect(openSessionBar(planned, OPEN, free)).toEqual(planned)
    expect(openSessionBar(undefined, OPEN, free)).toEqual({
      executionId: OPEN,
      title: 'Entreno libre',
    })
    expect(openSessionBar(undefined, OPEN, textFor('en').session.freeSession)?.title).toBe(
      textFor('en').session.freeSession,
    )
    expect(openSessionBar(undefined, null, free)).toBeUndefined()
  })
})
