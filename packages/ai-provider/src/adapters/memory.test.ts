import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { createMemoryModel } from './memory.js'
import { outcome } from './testing.js'

const DISH = z.object({ dish: z.string() })

describe('the memory model (ADR-045)', () => {
  test('T-AIP-UNIT-01 answers through the request schema, fails when told, and keeps what it saw', async () => {
    const model = createMemoryModel('memory/test')
    const request = {
      model: 'memory/test',
      parts: [{ kind: 'text', text: '¿Qué plato es?' }] as const,
      schema: DISH,
      timeoutMs: 1_000,
    }

    model.willAnswer({ dish: 'ajiaco' })
    expect(await model.answer(request)).toEqual({ value: { dish: 'ajiaco' }, model: 'memory/test' })
    expect(model.seen).toEqual([request])

    model.willAnswer({ plate: 'ajiaco' })
    expect(await outcome(model.answer(request))).toBe('invalid-answer')

    model.willAnswer({ dish: 'ajiaco' })
    model.failNext('unavailable')
    expect(await outcome(model.answer(request))).toBe('unavailable')
    expect(await model.answer(request)).toEqual({ value: { dish: 'ajiaco' }, model: 'memory/test' })
  })
})
