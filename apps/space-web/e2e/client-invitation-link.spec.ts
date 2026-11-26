/**
 * The page a client invitation email opens (TECH-360).
 *
 * The invitation is decided in Allfit Space, so the page calls nothing: on a phone it
 * hands the token to the app, on a computer it says to open the email on the phone, and
 * without a token it says the link is incomplete. The token never reaches a server and
 * leaves the address bar as soon as it is read.
 */
import AxeBuilder from '@axe-core/playwright'
import { devices, expect, test, type Page } from '@playwright/test'

const TOKEN = 'kQ3v9Zp_Lm2-Xc8Rt4Yw6Ub1Na7Hs5Jd0Fg3Ek2Ci9B'
const APP_LINK = `allfitspace://client-invitations#token=${TOKEN}`

async function blockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  return results.violations
    .filter(({ impact }) => ['serious', 'critical'].includes(impact ?? ''))
    .map(({ id }) => id)
}

test.describe('on a computer', () => {
  test('says to open it on the phone, with no button that cannot work', async ({ page }) => {
    const served: string[] = []
    page.on('request', (request) => served.push(request.url()))
    await page.goto(`/es/client-invitations#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ábrela desde tu teléfono')
    await expect(page.getByRole('link', { name: 'Abrir en Allfit Space' })).toHaveCount(0)
    await expect(page.getByText('¿Aún no tienes la app?')).toBeVisible()
    await expect(page.getByText('La invitación vence a los 7 días.')).toBeVisible()
    await expect(page).toHaveURL(/\/es\/client-invitations$/)
    expect(served.filter((url) => url.includes(TOKEN))).toEqual([])
  })

  test('a link without the locale keeps its token through the redirect', async ({ page }) => {
    await page.goto(`/client-invitations#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ábrela desde tu teléfono')
    await expect(page).toHaveURL(/\/es\/client-invitations$/)
  })

  test('reads in English', async ({ page }) => {
    await page.goto(`/en/client-invitations#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open it on your phone')
  })

  test('a link cut short says so and leads home', async ({ page }) => {
    await page.goto('/es/client-invitations#token=short')

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Este enlace está incompleto')
    await expect(page.getByRole('link', { name: 'Ir a Allfit Space' })).toHaveAttribute(
      'href',
      '/es',
    )
  })

  test('is never indexed', async ({ page }) => {
    await page.goto(`/es/client-invitations#token=${TOKEN}`)

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  })

  test('passes axe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/es/client-invitations#token=${TOKEN}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ábrela desde tu teléfono')

    expect(await blockingViolations(page)).toEqual([])
  })
})

test.describe('on a phone', () => {
  const { defaultBrowserType: _browser, ...iphone } = devices['iPhone 15']
  test.use(iphone)

  test('one button hands the token to the app', async ({ page }) => {
    await page.goto(`/es/client-invitations#token=${TOKEN}`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Tu invitación te espera en la app',
    )
    await expect(page.getByRole('link', { name: 'Abrir en Allfit Space' })).toHaveAttribute(
      'href',
      APP_LINK,
    )
    await expect(page.getByText(/Nada se comparte hasta que decidas en la app/)).toBeVisible()
    await expect(page).toHaveURL(/\/es\/client-invitations$/)
  })

  test('a refresh still finds the token', async ({ page }) => {
    await page.goto(`/es/client-invitations#token=${TOKEN}`)
    await expect(page).toHaveURL(/\/es\/client-invitations$/)
    await page.reload()

    await expect(page.getByRole('link', { name: 'Abrir en Allfit Space' })).toHaveAttribute(
      'href',
      APP_LINK,
    )
  })

  test('passes axe', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/es/client-invitations#token=${TOKEN}`)
    await expect(page.getByRole('link', { name: 'Abrir en Allfit Space' })).toBeVisible()

    expect(await blockingViolations(page)).toEqual([])
  })
})
