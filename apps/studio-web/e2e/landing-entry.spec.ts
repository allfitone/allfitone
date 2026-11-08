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
  await expect(page.getByRole('heading', { level: 1, name: /Tus clientes/ })).toBeVisible()
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

  await page.getByRole('link', { name: 'Empezar con Studio' }).first().click()

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
  await expect(page.getByRole('heading', { level: 1, name: /Tus clientes/ })).toBeVisible()
  await expect(page).toHaveURL('/es')

  await page.getByRole('link', { name: 'Empezar con Studio' }).first().click()

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
  await expect(page.getByRole('link', { name: 'Empezar con Studio' }).first()).toHaveCount(0)
})

test('the workspace entry without a session returns to the landing', async ({ page }) => {
  const fixture = createStudioApiFixture({ signedOut: true })
  await installStudioApiMock(page, fixture)

  await page.goto('/app')

  await expect(page).toHaveURL('/es')
  await expect(page.getByRole('link', { name: 'Empezar con Studio' }).first()).toBeVisible()
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
 * The landing keeps nothing over the page: the consent bar asks once, and once
 * the visitor has answered it leaves and no control floats in its place.
 */
test.describe('privacy', () => {
  test('the consent bar leaves once the visitor answers', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }), {
      consent: 'undecided',
    })
    await page.goto('/es')

    const panel = page.locator('[data-analytics-panel]')
    await expect(panel.getByText('Analítica opcional')).toBeVisible()
    await panel.getByRole('button', { name: 'No permitir' }).click()

    await expect(page.locator('[data-analytics-controls]')).toHaveCount(0)
  })

  test('a decided visitor finds nothing floating over the landing', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/en')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')

    await expect(page.locator('[data-analytics-controls]')).toHaveCount(0)
  })
})

/**
 * Like the Space landing's footer: the company and the sibling product side by
 * side, then the three legal documents on www.allfit.one, every one of them in
 * a new tab because each leaves the landing.
 */
test.describe('footer', () => {
  test('opens Allfit One and Allfit Space side by side, in new tabs', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/es')

    const family = page
      .getByRole('contentinfo')
      .getByRole('link', { name: /^Allfit (One|Space)\b/ })
    await expect(family).toHaveCount(2)
    await expect(family.nth(0)).toHaveAttribute('href', 'https://www.allfit.one/es')
    await expect(family.nth(1)).toHaveAttribute('href', 'https://space.allfit.one/es')
    for (const link of await family.all()) {
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    const [one, space] = await Promise.all([
      family.nth(0).boundingBox(),
      family.nth(1).boundingBox(),
    ])
    expect(Math.abs((one?.y ?? 0) - (space?.y ?? -100))).toBeLessThan(4)
  })

  test('opens the three legal documents in the page’s language, in new tabs', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    for (const [locale, names, newTab] of [
      ['es', ['Términos', 'Privacidad', 'Analítica'], '(se abre en una pestaña nueva)'],
      ['en', ['Terms', 'Privacy', 'Analytics'], '(opens in a new tab)'],
    ] as const) {
      await page.goto(`/${locale}`)
      const footer = page.getByRole('contentinfo')
      for (const [index, document] of (['terms', 'privacy', 'analytics'] as const).entries()) {
        const link = footer.getByRole('link', { name: `${names[index]} ${newTab}`, exact: true })
        await expect(link).toHaveAttribute(
          'href',
          `https://www.allfit.one/${locale}/legal/${document}`,
        )
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      }
    }
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

    test('is taken to the Spanish landing too', async ({ page }) => {
      await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))

      await page.goto('/')

      await expect(page).toHaveURL('/es')
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    })

    test('still finds the English landing at /en, consent panel included', async ({ page }) => {
      await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }), {
        consent: 'undecided',
      })

      await page.goto('/en')

      await expect(page.locator('html')).toHaveAttribute('lang', 'en')
      await expect(page.getByRole('heading', { level: 1, name: /Your clients/ })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Start with Studio' }).first()).toHaveAttribute(
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
    await expect(page.getByRole('heading', { level: 1, name: /Your clients/ })).toBeVisible()
  })

  // The API knows no language: it returns every close to `/`.
  test('a partial logout keeps its notice through the language redirect', async ({ page }) => {
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))

    await page.goto('/?logout=partial')

    await expect(page.getByText('La sesión se cerró en este equipo')).toBeVisible()
    await expect(page).toHaveURL('/es')
  })

  // A sign-up that waited on its email past the ten-minute state comes back here.
  test('an expired sign-in explains itself and starts a fresh one', async ({ page }) => {
    const fixture = createStudioApiFixture({
      signedOut: true,
      intercept: (request) =>
        request.method === 'GET' && request.path === '/studio/v1/auth/start'
          ? { status: 200, body: { hosted: 'sign-in' } }
          : undefined,
    })
    await installStudioApiMock(page, fixture)

    await page.goto('/?access=expired')

    const notice = page.getByRole('status').filter({ hasText: 'El acceso tardó demasiado' })
    await expect(notice).toBeVisible()
    await expect(page).toHaveURL('/es')

    await notice.getByRole('link', { name: 'Entrar de nuevo' }).click()

    await expect(page).toHaveURL(AUTH_START)
    expect(fixture.requests.map((request) => request.path)).toEqual(['/studio/v1/auth/start'])
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
