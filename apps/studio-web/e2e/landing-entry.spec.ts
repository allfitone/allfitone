/**
 * The public landing at `/es` and `/en`, and the way from it into Studio.
 *
 * The landing used to be one state of the workspace entry: every visit asked
 * the API who was there before painting anything, so a first-time visitor
 * waited on that round trip and saw nothing while the API was slow or down.
 * Now the landing paints without asking, and the question moves to the moment
 * somebody asks to enter.
 *
 * "Entrar" decides on click, because only the browser knows whether it holds a
 * Studio session. None, and it goes straight to the provider. Possibly one,
 * and it goes through `/app`, whose guard verifies before it trusts. Until the
 * page hydrates the anchor points at `/app`, so an early click is a safe one.
 *
 * Only the landing has languages. `/` picks one from the browser, and the
 * workspace behind it keeps its Spanish, unprefixed addresses.
 */
import { expect, test } from '@playwright/test'

import { activeMembership, createStudioApiFixture, installStudioApiMock } from './studio-api-mock'

const SESSION_KEY = 'allfit-studio-session:v1'
const AUTH_START = 'http://127.0.0.1:8080/studio/v1/auth/start'

test('an anonymous visit reads nothing from the API', async ({ page }) => {
  const fixture = createStudioApiFixture({ signedOut: true })
  await installStudioApiMock(page, fixture)

  await page.goto('/es')
  await expect(page.getByRole('heading', { level: 1, name: /Tu plan/ })).toBeVisible()
  // A late bootstrap would show up here; idle is when its absence means something.
  await page.waitForLoadState('networkidle')

  expect(fixture.requests.map((request) => `${request.method} ${request.path}`)).toEqual([])
})

test('a browser without a Studio session goes straight to the provider', async ({ page }) => {
  const fixture = createStudioApiFixture({
    signedOut: true,
    intercept: (request) =>
      request.method === 'GET' && request.path === '/studio/v1/auth/start'
        ? { status: 200, body: { hosted: 'sign-in' } }
        : undefined,
  })
  await installStudioApiMock(page, fixture)
  await page.goto('/es')

  await page.getByRole('link', { name: 'Entrar a Studio' }).click()

  await expect(page).toHaveURL(AUTH_START)
  expect(fixture.requests.map((request) => request.path)).toEqual(['/studio/v1/auth/start'])
})

test('a signed-in browser enters its workspace without the provider', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.addInitScript((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, status: 'active', lastActivityAt: Date.now() }),
    )
  }, SESSION_KEY)

  await page.goto('/es')
  // Holding a session does not move anybody off the landing on its own.
  await expect(page.getByRole('heading', { level: 1, name: /Tu plan/ })).toBeVisible()
  await expect(page).toHaveURL('/es')

  await page.getByRole('link', { name: 'Entrar a Studio' }).click()

  await expect(page).toHaveURL(`/organizations/${activeMembership.organization_id}`)
  expect(fixture.requests.some((request) => request.path === '/studio/v1/auth/start')).toBe(false)
})

/**
 * The landing has nothing to protect, but its way in does: a session this
 * browser ended may still be open at the API, and signing in over it is what
 * the recovery lock exists to prevent.
 */
test('a session ended here but still open is closed before anyone can enter', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  await installStudioApiMock(page, fixture)
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, status: 'ended', endedAt: Date.now() }))
  }, SESSION_KEY)

  await page.goto('/es')

  await expect(page.getByRole('heading', { name: 'Tu sesión está protegida' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Completar cierre' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Entrar a Studio' })).toHaveCount(0)
})

test('the workspace entry without a session returns to the landing', async ({ page }) => {
  const fixture = createStudioApiFixture({ signedOut: true })
  await installStudioApiMock(page, fixture)

  await page.goto('/app')

  await expect(page).toHaveURL('/es')
  await expect(page.getByRole('link', { name: 'Entrar a Studio' })).toBeVisible()
})

test('a tab holding an invitation is taken back to it from the landing', async ({ page }) => {
  const invitationToken = 'A'.repeat(43)
  await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
  await page.addInitScript((token) => {
    sessionStorage.setItem('allfit-invitation-token:v1', token)
  }, invitationToken)

  await page.goto('/es')

  await expect(page).toHaveURL('/invitations')
})

/**
 * The landing has a footer, so its privacy entry lives there, as on the Space
 * landing, and nothing floats over the page once a visitor has decided.
 */
test.describe('privacy', () => {
  test('is a footer entry that opens the analytics preferences', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/es')

    const entry = page.getByRole('contentinfo').getByRole('button', { name: 'Privacidad' })
    await expect(entry).toBeVisible()
    await expect(page.locator('[data-analytics-controls]')).toHaveCount(0)

    // The panel opens far from the footer, so focus travels to it and back.
    await entry.focus()
    await page.keyboard.press('Enter')
    const panel = page.locator('[data-analytics-panel]')
    await expect(panel.getByText('Analítica opcional')).toBeVisible()
    await expect(panel).toBeFocused()

    await panel.getByRole('button', { name: 'No permitir' }).click()
    await expect(page.locator('[data-analytics-controls]')).toHaveCount(0)
    await expect(entry).toBeFocused()
  })

  test('speaks English on the English landing', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/en')

    await page.getByRole('contentinfo').getByRole('button', { name: 'Privacy' }).click()
    await expect(page.getByText('Optional analytics')).toBeVisible()
  })
})

test.describe('languages', () => {
  test('`/` takes a Spanish browser to the Spanish landing', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))

    await page.goto('/')

    await expect(page).toHaveURL('/es')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  })

  test.describe('an English browser', () => {
    test.use({ locale: 'en-US' })

    test('is taken to the English landing, consent panel included', async ({ page }) => {
      await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }), {
        consent: 'undecided',
      })

      await page.goto('/')

      await expect(page).toHaveURL('/en')
      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('heading', { level: 1, name: /Your plan/ })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in to Studio' })).toHaveAttribute(
        'href',
        '/app',
      )
      await expect(page.getByText('Optional analytics')).toBeVisible()
    })
  })

  test('the switch opens the same landing in the other language', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/es')
    const languages = page.getByRole('navigation', { name: 'Idioma' })
    await expect(languages.getByRole('link', { name: 'ES' })).toHaveAttribute(
      'aria-current',
      'true',
    )

    await languages.getByRole('link', { name: 'EN' }).click()

    await expect(page).toHaveURL('/en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1, name: /Your plan/ })).toBeVisible()
  })

  // The API knows no language: it returns every close to `/`.
  test('a partial logout keeps its notice through the language redirect', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))

    await page.goto('/?logout=partial')

    await expect(page.getByText('La sesión se cerró en este equipo')).toBeVisible()
    await expect(page).toHaveURL('/es')
  })

  test('the workspace has no language prefix', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))

    const response = await page.goto('/en/app')

    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole('heading', { level: 1, name: 'Esta página no existe' }),
    ).toBeVisible()
  })
})
