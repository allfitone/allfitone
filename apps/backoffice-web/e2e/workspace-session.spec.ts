import { expect, test, type Page } from '@playwright/test'

import { activeSession, createBackofficeFixture, mockBackofficeApi } from './backoffice-api-mock'

/**
 * The session lifecycle inside the workspace, where the protected data lives.
 *
 * The access screen already ends its view at the deadline, across tabs and on
 * return; the workspace confirmed the session once and then kept whatever it had
 * rendered. These cases hold the workspace to the same rules.
 */

const LOGIN = { name: 'Identifica tu acceso.' }

function workspace(page: Page) {
  return page.locator('[data-backoffice-content]')
}

async function expectSignedOut(page: Page) {
  await expect(page.getByRole('heading', LOGIN)).toBeVisible({ timeout: 5_000 })
  await expect(workspace(page)).toHaveCount(0)
  await expect(page.getByText('Ada Lovelace', { exact: true })).toHaveCount(0)
}

test('the workspace ends at the API session deadline and says it was inactivity', async ({
  context,
  page,
}) => {
  const session = activeSession()
  session.inactivity_expires_at = new Date(Date.now() + 1_500).toISOString()
  const fixture = createBackofficeFixture({ session })
  await mockBackofficeApi(context, fixture)

  await page.goto('/team')
  await expect(workspace(page)).toBeVisible()

  await expectSignedOut(page)
  const logout = fixture.requests.find((request) => request.path === '/backoffice/v1/auth/logout')
  expect(logout?.body).toEqual({ reason: 'inactivity' })
})

test('meaningful activity keeps the workspace past the deadline it first read', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession() })
  await mockBackofficeApi(context, fixture)
  await page.clock.install()

  await page.goto('/team')
  await expect(workspace(page)).toBeVisible()

  // The API extends inactivity on every request; the heartbeat is how the page learns it.
  const extended = activeSession()
  extended.inactivity_expires_at = new Date(Date.now() + 40 * 60_000).toISOString()
  fixture.session = extended
  await page.clock.fastForward('02:00')
  await page.locator('[data-backoffice-header]').click()
  // Wait for the page to hold the new deadline, not for a request: the clock must not outrun it.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('allfit-backoffice-session:v1')))
    .toContain(`"inactivityExpiresAt":${Date.parse(extended.inactivity_expires_at)}`)

  await page.clock.fastForward('20:00')
  await expect(workspace(page)).toBeVisible()
  expect(fixture.requests.some((r) => r.path === '/backoffice/v1/auth/logout')).toBe(false)
})

test('a sign-out in another tab clears the workspace without revealing it', async ({ context }) => {
  const fixture = createBackofficeFixture({ session: activeSession() })
  await mockBackofficeApi(context, fixture)
  const access = await context.newPage()
  const working = await context.newPage()
  await access.goto('/')
  await working.goto('/team')
  await expect(workspace(working)).toBeVisible()

  await access.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expectSignedOut(working)
})

test('signing out of the workspace ends the session in every tab', async ({ context }) => {
  const fixture = createBackofficeFixture({ session: activeSession() })
  await mockBackofficeApi(context, fixture)
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto('/team')
  await second.goto('/people')
  await expect(workspace(first)).toBeVisible()
  await expect(workspace(second)).toBeVisible()

  await first.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expectSignedOut(first)
  await expectSignedOut(second)
  const logouts = fixture.requests.filter((r) => r.path === '/backoffice/v1/auth/logout')
  expect(logouts.map((request) => request.body)).toEqual([{ reason: 'manual' }])
})

test('a workspace sign-out the API never confirmed lands on the safe recovery, not the session', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession(), logoutFails: true })
  await mockBackofficeApi(context, fixture)
  await page.goto('/team')
  await expect(workspace(page)).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()

  await expect(page.getByRole('heading', { name: 'Tu sesión está protegida.' })).toBeVisible()
  await expect(page.getByText('Ada Lovelace', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Completar cierre' }).click()
  await expectSignedOut(page)
})

test('returning to a workspace tab whose session was revoked does not show it', async ({
  context,
  page,
}) => {
  const fixture = createBackofficeFixture({ session: activeSession() })
  await mockBackofficeApi(context, fixture)
  await page.goto('/team')
  await expect(workspace(page)).toBeVisible()

  fixture.session = undefined
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

  await expectSignedOut(page)
})
