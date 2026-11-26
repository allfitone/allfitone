import { describe, expect, test } from 'bun:test'

import { appLink, canOpenApp, CLIENT_INVITATION_PATH } from './client-invitation'

const TOKEN = 'kQ3v9Zp_Lm2-Xc8Rt4Yw6Ub1Na7Hs5Jd0Fg3Ek2Ci9B'

describe('the client invitation link (TECH-360)', () => {
  test('its path is the one the worker builds the email link with', () => {
    expect(CLIENT_INVITATION_PATH).toBe('/client-invitations')
  })

  test('the app opens on the same route, with the token still in the fragment', () => {
    expect(appLink(TOKEN)).toBe(`allfitspace://client-invitations#token=${TOKEN}`)
  })

  test('a phone or a tablet can open the app; a computer cannot', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    const android =
      'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile'
    const mac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
    const windows = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0'
    expect(canOpenApp(iphone, 5)).toBe(true)
    expect(canOpenApp(android, 5)).toBe(true)
    expect(canOpenApp(mac, 5)).toBe(true)
    expect(canOpenApp(mac, 0)).toBe(false)
    expect(canOpenApp(windows, 0)).toBe(false)
  })
})
