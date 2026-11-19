/**
 * `RUN_ORDER` is what production runs, so a script left out of it never reaches production
 * and nothing says so.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const listed = readFileSync(join(import.meta.dir, 'RUN_ORDER'), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))

describe('the curation run order', () => {
  test('lists every curation script exactly once', () => {
    const scripts = readdirSync(import.meta.dir).filter((name) => name.endsWith('.sql'))

    expect([...listed].sort()).toEqual(scripts.sort())
  })

  test('numbers each script apart, because a run is narrowed by number', () => {
    const numbers = listed.map((name) => name.split('_')[0] ?? '')

    expect(numbers.every((number) => /^\d{3}$/.test(number))).toBe(true)
    expect(new Set(numbers).size).toBe(listed.length)
  })
})
