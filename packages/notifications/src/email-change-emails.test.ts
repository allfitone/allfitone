import { describe, expect, test } from 'bun:test'

import { renderEmailChangeCodeEmail, renderEmailChangedNoticeEmail } from './index.js'

// What a reader sees: the shell keeps names together with non-breaking spaces.
const readable = (html: string) => html.replaceAll('&nbsp;', ' ')

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'

describe('the code that confirms a new email (TECH-44)', () => {
  test('carries the code, says how long it lasts and what to do if it was not her', () => {
    const { subject, text, html } = renderEmailChangeCodeEmail({
      code: '482913',
      minutes: 30,
      brandAssetUrl: BRAND,
    })

    expect(subject).toBe('Tu código para cambiar tu correo de Allfit')
    expect(text).toContain('482913')
    expect(text).toContain('Vence en 30 minutos.')
    expect(readable(html)).toContain('<html lang="es">')
    expect(readable(html)).toContain('SPACE')
    expect(readable(html)).toContain('TU CÓDIGO')
    expect(readable(html)).toContain('482913')
    expect(readable(html)).toContain('Si no pediste este cambio')
  })

  test('names nobody: the address may not be hers yet', () => {
    const { text, html } = renderEmailChangeCodeEmail({
      code: '000111',
      minutes: 30,
      brandAssetUrl: BRAND,
    })

    expect(text).not.toMatch(/Hola|Camila/)
    expect(html).not.toMatch(/Hola|Camila/)
  })
})

describe('the notice to the previous email (TECH-44)', () => {
  test('says the address changed, shows only a hint of the new one, and what to do', () => {
    const { subject, text, html } = renderEmailChangedNoticeEmail({
      newEmailHint: '••••••••va@example.test',
      brandAssetUrl: BRAND,
    })

    expect(subject).toBe('Tu correo de Allfit cambió')
    expect(text).toContain('••••••••va@example.test')
    expect(readable(html)).toContain('CORREO NUEVO')
    expect(readable(html)).toContain('••••••••va@example.test')
    expect(readable(html)).toContain('Si no fuiste tú')
    expect(text).not.toContain('camila.nueva@example.test')
  })

  test('escapes what it is given', () => {
    const { html } = renderEmailChangedNoticeEmail({
      newEmailHint: '<b>x</b>@example.test',
      brandAssetUrl: BRAND,
    })

    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
  })
})
