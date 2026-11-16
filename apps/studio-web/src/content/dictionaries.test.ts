import { describe, expect, test } from 'bun:test'

import { en } from './en'
import { es } from './es'

/** Every leaf path of a dictionary, with its value. */
function leaves(value: unknown, path = ''): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leaves(item, `${path}[${String(index)}]`))
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) =>
      leaves(item, path ? `${path}.${key}` : key),
    )
  }
  return [[path, value]]
}

describe('landing dictionaries', () => {
  test('Spanish and English say the same things', () => {
    expect(leaves(en).map(([path]) => path)).toEqual(leaves(es).map(([path]) => path))
  })

  test('no text is left empty', () => {
    for (const dictionary of [es, en]) {
      const empty = leaves(dictionary).filter(
        ([, value]) => typeof value === 'string' && value.trim() === '',
      )
      expect(empty).toEqual([])
    }
  })

  // A display title breaks one sentence across lines, so only its first line
  // has to open with a capital.
  test('every text starts with a capital letter, a number or a sign', () => {
    for (const dictionary of [es, en]) {
      const lower = leaves(dictionary).filter(
        ([path, value]) =>
          typeof value === 'string' && !/\.title\[[1-9]\]$/.test(path) && /^[a-zà-ÿ]/.test(value),
      )
      expect(lower).toEqual([])
    }
  })

  test('the page title separates its parts with « | »', () => {
    for (const dictionary of [es, en]) {
      expect(dictionary.meta.title).toMatch(/^Allfit Studio \| \S/)
      expect(dictionary.meta.title).not.toMatch(/·| [-–—] /)
    }
  })

  // A forgotten translation reads as Spanish on the English page. These three
  // are the same word in both languages.
  test('English translates everything else', () => {
    const spanish = new Map(leaves(es))
    const same = leaves(en)
      .filter(([path, value]) => spanish.get(path) === value)
      .map(([path]) => path)
    expect(same).toEqual(['sheet.columns.planned', 'footer.rights'])
  })
})
