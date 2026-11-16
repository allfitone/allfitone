import { describe, expect, test } from 'bun:test'

import { renderPasswordChangedNoticeEmail } from './index.js'

// What a reader sees: the shell keeps names together with non-breaking spaces.
const readable = (html: string) => html.replaceAll('&nbsp;', ' ')

const BRAND = 'https://space.allfit.one/email/allfit-one-lockup-on-light.png'

describe('the notice that a password changed (TECH-325)', () => {
  test('says it changed, that the other sessions closed and what to do if it was not her', () => {
    const { subject, text, html } = renderPasswordChangedNoticeEmail({ brandAssetUrl: BRAND })

    expect(subject).toBe('Tu contraseña de Allfit cambió')
    expect(text).toContain('cerramos las sesiones de tus otros dispositivos')
    expect(text).toContain('Si no fuiste tú')
    expect(readable(html)).toContain('<html lang="es">')
    expect(readable(html)).toContain('SPACE')
    expect(readable(html)).toContain('Cambiaste tu contraseña')
    expect(readable(html)).toContain('¿No fuiste tú?')
  })

  test('names nobody and carries nothing of the password', () => {
    const { text, html } = renderPasswordChangedNoticeEmail({ brandAssetUrl: BRAND })

    expect(text).not.toMatch(/Camila|camila@/)
    expect(readable(html)).not.toMatch(/Camila|camila@/)
    expect(text).not.toMatch(/contraseña nueva:|contraseña actual:/i)
  })
})
