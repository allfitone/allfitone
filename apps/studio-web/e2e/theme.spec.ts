/**
 * Studio's theme: dark unless the person chose light, and the choice kept in
 * her account.
 *
 * Three things can each be right while the whole is wrong, so each is held
 * here: what the document says before anyone is known, what the account's
 * answer does when it arrives, and what a press on the switch leaves behind.
 * The first one is about a frame, so it is measured against the browser's own
 * first paint and never against a wait.
 */
import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  type StudioApiFixture,
} from './studio-api-mock'

const STORAGE_KEY = 'allfit-studio-theme:v1'
const workspace = `/organizations/${activeMembership.organization_id}`

declare global {
  interface Window {
    __lightShownAt?: number
  }
}

async function remember(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      // Only where nothing is kept yet, so a reload keeps what the page wrote.
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value)
    },
    { key: STORAGE_KEY, value: theme },
  )
}

async function openWorkspace(
  page: Page,
  preferences: StudioApiFixture['preferences'],
  overrides: Partial<StudioApiFixture> = {},
): Promise<StudioApiFixture> {
  const fixture = createStudioApiFixture({
    memberships: [activeMembership],
    preferences,
    ...overrides,
  })
  await installStudioApiMock(page, fixture)
  await page.goto(workspace)
  await expect(page.locator('[data-today-scoreboard]')).toBeVisible()
  return fixture
}

function shownTheme(page: Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-afo-theme'))
}

function rememberedTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)
}

const themeSwitch = (page: Page) => page.getByRole('group', { name: 'Tema' })

test.describe('before anyone is known', () => {
  // No JavaScript means no script and no hydration: exactly what the server sent.
  test.describe('as the server sends it', () => {
    test.use({ javaScriptEnabled: false })

    test('the workspace document is dark', async ({ page }) => {
      await page.goto('/app')
      await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'dark')
    })

    test('the page for an address that does not exist is dark', async ({ page }) => {
      await page.goto('/no-such-address')
      await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'dark')
    })

    test('the landing keeps its own look', async ({ page }) => {
      await page.goto('/es')
      await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    })
  })

  test('a browser that remembers light shows it before the first frame', async ({ page }) => {
    await remember(page, 'light')
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (
          window.__lightShownAt === undefined &&
          document.documentElement?.getAttribute('data-afo-theme') === 'light'
        ) {
          window.__lightShownAt = performance.now()
        }
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-afo-theme'] })
    })
    // Her account says light too, so the answer changes nothing: were the script
    // gone, that answer would still turn the screen light, long after the frame.
    await openWorkspace(page, { theme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')

    const firstPaint = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const known = performance.getEntriesByName('first-paint')[0]
          if (known) {
            resolve(known.startTime)
            return
          }
          new PerformanceObserver((list) => {
            const entry = list.getEntriesByName('first-paint')[0]
            if (entry) resolve(entry.startTime)
          }).observe({ type: 'paint', buffered: true })
        }),
    )
    const lightShownAt = await page.evaluate(() => window.__lightShownAt)

    expect(lightShownAt, 'the theme was never switched to light').toBeDefined()
    expect(lightShownAt ?? Infinity).toBeLessThan(firstPaint)
  })

  test('the landing does not follow what the browser remembers', async ({ page }) => {
    await remember(page, 'dark')
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }))
    await page.goto('/es')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await shownTheme(page)).toBe('light')
  })
})

test.describe('once the account answers', () => {
  test('a person who never chose gets dark, and nothing is remembered', async ({ page }) => {
    await openWorkspace(page, { theme: null })

    await expect(themeSwitch(page).getByRole('button', { name: 'Oscuro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await shownTheme(page)).toBe('dark')
    expect(await rememberedTheme(page)).toBeNull()
  })

  test('her choice reaches a browser that never saw her', async ({ page }) => {
    await openWorkspace(page, { theme: 'light' })

    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    await expect(themeSwitch(page).getByRole('button', { name: 'Claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await rememberedTheme(page)).toBe('light')
  })

  test('what the browser remembers of somebody else gives way to her account', async ({ page }) => {
    await remember(page, 'light')
    await openWorkspace(page, { theme: null })

    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'dark')
    expect(await rememberedTheme(page)).toBeNull()
  })

  // The API ships ahead of its migration, so for a while the read can fail for everybody.
  test('an account that cannot be read leaves what the browser remembers, and says nothing', async ({
    page,
  }) => {
    await remember(page, 'light')
    const fixture = await openWorkspace(
      page,
      { theme: null },
      {
        intercept: (request) =>
          request.method === 'GET' && request.path === '/studio/v1/me/preferences'
            ? { status: 503, body: { code: 'upstream-unavailable' } }
            : undefined,
      },
    )
    // One retry, as for any read the service could not answer, and then no more.
    await expect
      .poll(
        () =>
          fixture.requests.filter((request) => request.path === '/studio/v1/me/preferences').length,
      )
      .toBe(2)

    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    expect(await rememberedTheme(page)).toBe('light')
    await expect(themeSwitch(page).getByRole('button', { name: 'Claro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.locator('[data-theme-switch-status]')).toHaveCount(0)
  })

  test('the menu stays dark on either theme', async ({ page }) => {
    await openWorkspace(page, { theme: 'light' })

    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    await expect(page.locator('[data-organization-sidebar]')).toHaveAttribute(
      'data-afo-theme',
      'dark',
    )
  })
})

test.describe('the switch', () => {
  test('a press changes the screen and tells the account, as one command', async ({ page }) => {
    const fixture = await openWorkspace(page, { theme: null })

    await themeSwitch(page).getByRole('button', { name: 'Claro' }).click()

    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    await expect.poll(() => fixture.preferences.theme).toBe('light')
    await expect.poll(() => rememberedTheme(page)).toBe('light')

    const writes = fixture.requests.filter(
      (request) => request.method === 'PUT' && request.path === '/studio/v1/me/preferences',
    )
    expect(writes).toHaveLength(1)
    expect(writes[0]?.body).toEqual({ theme: 'light' })
    expect(writes[0]?.headers['idempotency-key']).toBeTruthy()
    expect(writes[0]?.headers['command-id']).toBeTruthy()

    // The choice outlives the document: the body's first script shows it again.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
  })

  test('pressing the theme in force asks the account for nothing', async ({ page }) => {
    const fixture = await openWorkspace(page, { theme: null })

    await themeSwitch(page).getByRole('button', { name: 'Oscuro' }).click()

    await expect(themeSwitch(page).getByRole('button', { name: 'Oscuro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(fixture.requests.filter((request) => request.method === 'PUT')).toHaveLength(0)
  })

  test('a change the account did not take goes back, and says so', async ({ page }) => {
    const fixture = await openWorkspace(page, { theme: null }, { preferencesOutcome: 'failed' })

    await themeSwitch(page).getByRole('button', { name: 'Claro' }).click()

    await expect(page.getByText('No se pudo guardar el tema. Inténtalo de nuevo.')).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'dark')
    await expect(themeSwitch(page).getByRole('button', { name: 'Oscuro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(fixture.preferences.theme).toBeNull()
    expect(await rememberedTheme(page)).toBeNull()

    // The second press is the same intent: it repeats the command, not a new one.
    fixture.preferencesOutcome = 'saved'
    await themeSwitch(page).getByRole('button', { name: 'Claro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-afo-theme', 'light')
    await expect(page.getByText('No se pudo guardar el tema. Inténtalo de nuevo.')).toHaveCount(0)

    const keys = fixture.requests
      .filter((request) => request.method === 'PUT')
      .map((request) => request.headers['idempotency-key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
  })

  test('the rail hides it, as it hides the way out', async ({ page }) => {
    await openWorkspace(page, { theme: null })
    await expect(themeSwitch(page)).toBeVisible()

    await page.getByRole('button', { name: 'Abrir o cerrar navegación' }).click()

    await expect(themeSwitch(page)).toHaveCount(0)
  })
})
