import { describe, expect, test } from 'bun:test'

import { numbersOf, strangers } from './numbers.js'

describe('the numbers a summary may show', () => {
  test('T-WSM-UNIT-01: a number written as the week has it is known', () => {
    const known = numbersOf({ sessions: 4, top_kg: 82.5, kcal: 2150 })
    expect(strangers('Entrenaste 4 veces y llegaste a 82,5 kg; comiste 2150 kcal.', known)).toEqual(
      [],
    )
  })

  test('T-WSM-UNIT-02: a number the week does not have is a stranger', () => {
    const known = numbersOf({ sessions: 4, top_kg: 82.5 })
    expect(strangers('Entrenaste 5 veces y subiste un 12 %.', known)).toEqual(['5', '12'])
  })

  test('T-WSM-UNIT-03: a thousands separator reads as the whole number, in either style', () => {
    const known = numbersOf({ volume_kg: 18450, kcal: 2150 })
    expect(strangers('Moviste 18.450 kg y comiste 2,150 kcal.', known)).toEqual([])
    expect(strangers('You moved 18,450 kg.', known)).toEqual([])
  })

  test('T-WSM-UNIT-04: a decimal reads the same with a comma or a point', () => {
    const known = numbersOf({ top_kg: 82.5 })
    expect(strangers('82,5 kg', known)).toEqual([])
    expect(strangers('82.5 kg', known)).toEqual([])
    expect(strangers('82,6 kg', known)).toEqual(['82,6'])
  })

  test('T-WSM-UNIT-05: three digits after one separator may be thousands or decimals', () => {
    expect(strangers('1.850', numbersOf({ kcal: 1850 }))).toEqual([])
    expect(strangers('1.850', numbersOf({ km: 1.85 }))).toEqual([])
    expect(strangers('1.850', numbersOf({ kcal: 185 }))).toEqual(['1.850'])
  })

  test('T-WSM-UNIT-06: the digits of a date are known one by one', () => {
    const known = numbersOf({ from: '2026-11-09', to: '2026-11-15' })
    expect(strangers('Del 9 al 15 de noviembre de 2026.', known)).toEqual([])
    expect(strangers('El 10 de noviembre.', known)).toEqual(['10'])
  })

  test('T-WSM-UNIT-07: every number is read, at any depth and inside lists', () => {
    const known = numbersOf({
      training: { sessions: [{ minutes: 55, exercises: [{ top: { kg: 100, reps: 5 } }] }] },
    })
    expect(strangers('55 minutos, 100 kg por 5.', known)).toEqual([])
  })

  test('T-WSM-UNIT-08: a set written as 4x10 is two numbers', () => {
    const known = numbersOf({ sets: 4, reps: 10 })
    expect(strangers('Hiciste 4x10 y 4×10.', known)).toEqual([])
    expect(strangers('Hiciste 4x12.', known)).toEqual(['12'])
  })

  test('T-WSM-UNIT-09: a text without numbers has no strangers', () => {
    expect(strangers('Una semana constante.', numbersOf({ sessions: 4 }))).toEqual([])
  })

  test('T-WSM-UNIT-42: a difference below zero is known without its sign', () => {
    const known = numbersOf({ change: { kcal_per_day: -120, best_kg: -2.5 } })
    expect(strangers('120 kcal menos y 2,5 kg menos.', known)).toEqual([])
  })

  test('T-WSM-UNIT-10: several thousands groups and a decimal are one number', () => {
    const known = numbersOf({ volume_kg: 1234567.5 })
    expect(strangers('1.234.567,5 kg', known)).toEqual([])
    expect(strangers('1,234,567.5 kg', known)).toEqual([])
  })
})
