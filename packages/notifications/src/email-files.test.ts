import { describe, expect, test } from 'bun:test'

import { EMAIL_FILES, emailBrandAssetUrl, renderTeamInvitationEmail } from './index.js'

describe('the files an email loads', () => {
  test('each carries its content hash, so a changed file is a new URL', () => {
    for (const file of Object.values(EMAIL_FILES)) {
      expect(file).toMatch(/\.[0-9a-f]{8}\.(png|woff2)$/)
    }
  })

  test('resolve under the public site that serves email/, logo and fonts alike', () => {
    const logo = emailBrandAssetUrl('https://studio.allfit.one')
    const { html } = renderTeamInvitationEmail({
      organizationName: 'Studio Norte',
      proposedRoleCode: 'coach',
      invitationUrl: 'https://studio.allfit.one/invitations#token=coach-token',
      brandAssetUrl: logo,
      expiresAt: new Date('2026-08-19T12:00:00.000Z'),
    })

    expect(logo).toBe('https://studio.allfit.one/email/allfit-one-lockup-on-light.ce0bcfe6.png')
    expect(html).toContain(`<img src="${logo}"`)
    expect(html).toContain(
      "url('https://studio.allfit.one/email/fonts/barlow-condensed-600-latin.215a93c6.woff2')",
    )
    expect(html).toContain(
      "url('https://studio.allfit.one/email/fonts/manrope-latin.8c2def02.woff2')",
    )
  })
})
