import { expect, test } from '@playwright/test'

import {
  challengeAttempt,
  createBackofficeFixture,
  enrollmentAttempt,
  mockBackofficeApi,
} from './backoffice-api-mock'

test('authenticates an existing factor and lands on Inicio', async ({ context, page }) => {
  const fixture = createBackofficeFixture()
  await mockBackofficeApi(context, fixture)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
  await page.getByLabel('Correo').fill('operator@example.test')
  await page.getByLabel('Contraseña').fill('Password123!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Confirma el código.' })).toBeVisible()
  await page.getByLabel('Código de seis dígitos').fill('123456')
  await page.getByRole('button', { name: 'Verificar y entrar' }).click()

  // The code is the last step: Inicio already says who signed in, how, and until when.
  await expect(page).toHaveURL(/\/panel$/)
  const operator = page.locator('[data-operator-panel]')
  await expect(operator.getByRole('heading', { name: 'Ada Lovelace' })).toBeVisible()
  await expect(operator.getByText('Dos factores')).toBeVisible()
  const verification = fixture.requests.find(
    (request) => request.path === '/backoffice/v1/auth/totp/verification',
  )
  expect(verification?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
  expect(verification?.headers['command-id']).toMatch(/^[0-9a-f-]{36}$/)
})

test('enrolls the first TOTP factor with QR and manual accessibility fallback', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ passwordOutcome: 'enrollment' })
  await mockBackofficeApi(context, fixture)
  await context.grantPermissions(['clipboard-write'])
  await page.goto('/')
  await page.getByLabel('Correo').fill('operator@example.test')
  await page.getByLabel('Contraseña').fill('Password123!')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Conecta tu autenticador.' })).toBeVisible()
  await expect(page.getByAltText('Código QR para enlazar el autenticador')).toBeVisible()
  await expect(page.getByLabel('Clave del autenticador')).toHaveValue('JBSWY3DPEHPK3PXP')
  await page.getByRole('button', { name: 'Copiar clave' }).click()
  await expect(page.getByText('Clave copiada.')).toBeVisible()
})

test('recovers an open challenge after reload without persisting secrets in web storage', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ attempt: challengeAttempt() })
  await mockBackofficeApi(context, fixture)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Confirma el código.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Confirma el código.' })).toBeVisible()
  const storage = await page.evaluate(() => JSON.stringify(localStorage))
  expect(storage).not.toContain('operator@example.test')
  expect(storage).not.toContain('JBSWY3DPEHPK3PXP')
})

test('resolves a lost verification response through the session before retrying the code', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({
    attempt: challengeAttempt(),
    totpOutcome: 'network-lost-after-success',
  })
  await mockBackofficeApi(context, fixture)
  await page.goto('/')
  await page.getByLabel('Código de seis dígitos').fill('654321')
  await page.getByRole('button', { name: 'Verificar y entrar' }).click()

  await expect(page).toHaveURL(/\/panel$/)
  expect(
    fixture.requests.filter((request) => request.path === '/backoffice/v1/auth/totp/verification'),
  ).toHaveLength(1)
})

test('keeps password failure indistinguishable and honors Retry-After', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ passwordOutcome: 'unauthenticated' })
  await mockBackofficeApi(context, fixture)
  await page.goto('/')
  await page.getByLabel('Correo').fill('unknown@example.test')
  await page.getByLabel('Contraseña').fill('wrong')
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(
    page.getByText('No pudimos validar el acceso. Revisa tus datos e inténtalo de nuevo.'),
  ).toBeVisible()

  fixture.passwordOutcome = 'rate-limited'
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.getByText(/Podrás reintentar en [12] segundos/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeDisabled()
})

test('ends the TOTP attempt after the fifth invalid code', async ({ context, page }) => {
  const fixture = createBackofficeFixture({ attempt: challengeAttempt(), totpOutcome: 'invalid' })
  await mockBackofficeApi(context, fixture)
  await page.goto('/')

  for (let index = 0; index < 5; index += 1) {
    await page.getByLabel('Código de seis dígitos').fill(String(111111 + index))
    await page.getByRole('button', { name: 'Verificar y entrar' }).click()
    if (index < 4) {
      await expect(
        page.getByText('El código no fue válido. Usa el código actual de tu autenticador.'),
      ).toBeVisible()
    }
  }

  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
  await expect(page.getByText('El acceso anterior terminó')).toBeVisible()
})

test('explains a service outage before login and supports retry', async ({ context, page }) => {
  const fixture = createBackofficeFixture({ sessionUnavailable: true })
  await mockBackofficeApi(context, fixture)
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'No pudimos comprobar el acceso.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Completar cierre' })).toHaveCount(0)
  fixture.sessionUnavailable = false
  await page.getByRole('button', { name: 'Volver a comprobar' }).click()
  await expect(page.getByRole('heading', { name: 'Identifica tu acceso.' })).toBeVisible()
})

test('keeps strict recovery when an earlier session cannot be verified', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ sessionUnavailable: true })
  await mockBackofficeApi(context, fixture)
  await page.addInitScript(() => {
    localStorage.setItem(
      'allfit-backoffice-session:v1',
      JSON.stringify({
        version: 1,
        status: 'active',
        lastVerifiedAt: Date.now(),
        inactivityExpiresAt: Date.now() + 60 * 60_000,
        absoluteExpiresAt: Date.now() + 12 * 60 * 60_000,
      }),
    )
  })
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tu sesión está protegida.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Completar cierre' })).toBeVisible()
  // Without proof the session lives, the browser stays here instead of entering Inicio.
  await expect(page).not.toHaveURL(/\/panel$/)
})

test('uses the same password-reset confirmation for every email', async ({ context, page }) => {
  const fixture = createBackofficeFixture()
  await mockBackofficeApi(context, fixture)
  await page.goto('/')
  await page.getByRole('button', { name: 'Olvidé mi contraseña' }).click()
  await page.getByLabel('Correo').fill('anyone@example.test')
  await page.getByRole('button', { name: 'Enviar instrucciones' }).click()

  await expect(page.getByRole('heading', { name: 'Revisa tu correo.' })).toBeVisible()
  await expect(
    page.getByText('Si existe una cuenta, recibirás instrucciones para restablecer la contraseña.'),
  ).toBeVisible()
})

test('blocks compact phones while retaining the tablet and desktop flow', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ attempt: enrollmentAttempt() })
  await mockBackofficeApi(context, fixture)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Continúa en una pantalla más amplia.' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Conecta tu autenticador.' })).toBeHidden()

  await page.setViewportSize({ width: 820, height: 900 })
  await expect(page.getByRole('heading', { name: 'Conecta tu autenticador.' })).toBeVisible()
})

test('supports keyboard navigation and reduced motion', async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mockBackofficeApi(context, createBackofficeFixture())
  await page.goto('/')
  await expect(page.getByLabel('Correo')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Contraseña')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeFocused()
})
