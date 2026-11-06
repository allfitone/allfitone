import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { ModelError } from '../port.js'
import { createMemoryModel } from './memory.js'

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
    await expect(model.answer(request)).rejects.toThrow(new ModelError('invalid-answer'))

    model.willAnswer({ dish: 'ajiaco' })
    model.failNext('unavailable')
    await expect(model.answer(request)).rejects.toThrow(new ModelError('unavailable'))
    expect(await model.answer(request)).toEqual({ value: { dish: 'ajiaco' }, model: 'memory/test' })
  })
})
