import { describe, expect, test } from 'bun:test'

import robots from './robots'

describe('robots', () => {
  test('points crawlers at the sitemap', () => {
    expect(robots().sitemap).toBe('https://studio.allfit.one/sitemap.xml')
  })

  test('blocks nothing, so crawlers can read the noindex the workspace carries', () => {
    const rules = [robots().rules].flat()
    expect(rules).toEqual([{ userAgent: '*', allow: '/' }])
  })
})
