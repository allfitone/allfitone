import { expect, test, type Page } from '@playwright/test'

import { DESKTOP, SCREENS, openScreen } from './screens'
import { activeMembership, createStudioApiFixture, installStudioApiMock } from './studio-api-mock'

/**
 * Every visible control must come from the Design System: it carries a
 * `data-slot`, or sits inside something that does. Raw markup here is how a
 * surface drifts away from the shared library one element at a time.
 */
function designSystemViolations(page: Page): Promise<string[]> {
  return page.locator('button, input, select, textarea, table, dialog').evaluateAll((controls) =>
    controls
      .filter((control) => {
        const element = control as HTMLElement
        if (element.matches('[data-next-mark]')) return false
        // Playwright's locators pierce shadow roots; `document.querySelectorAll`
        // does not. Next's development overlay lives in one, hosted by
        // `<nextjs-portal>`, which is why the sweep sees buttons the page never
        // rendered ("Open issues overlay", "Copy Error Info"). They are the
        // framework's, not ours, and no production build has them. Studio uses
        // no shadow DOM, so "outside the document tree" names the exclusion
        // exactly, where matching the overlay's attributes one by one does not.
        if (element.getRootNode() !== document) return false
        const visible = element.getClientRects().length > 0
        if (!visible) return false
        return !element.matches('[data-slot]') && !element.closest('[data-slot]')
      })
      .map((control) => control.outerHTML.slice(0, 160)),
  )
}

test('uses canonical setup choices and one page heading without overflow', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture())
  await page.goto('/app')

  const choices = page.locator('[data-slot="choice-card"]')
  await expect(choices).toHaveCount(3)
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

  const independent = page.getByRole('button', { name: /Trabajo por mi cuenta/ })
  await independent.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Nombre visible')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

  await page.getByRole('button', { name: 'Volver' }).click()
  await page.getByRole('button', { name: /Tengo un equipo o centro/ }).click()
  await expect(page.getByLabel('Tipo de organización')).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  const dimensions = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
})

test('keeps visible controls inside a Design System contract', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`/organizations/${activeMembership.organization_id}/team`)

  expect(await designSystemViolations(page)).toEqual([])
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
})

/**
 * The contract above was only ever enforced on the team directory. The AFO-40
 * brief asks for Design System consistency across the fourteen implemented
 * stories, so the same check now sweeps every one of their screens.
 */
for (const screen of SCREENS) {
  test(`keeps ${screen.stories} inside the Design System contract`, async ({ page }) => {
    await openScreen(page, screen, DESKTOP)

    expect(await designSystemViolations(page), screen.stories).toEqual([])
  })
}

/**
 * A control fixed to the viewport lands on whatever the page puts behind it, so
 * it cannot borrow a background from a parent the way a control inside a panel
 * can. The privacy control used an outline variant, whose transparent fill left
 * only a border at roughly 1.24:1 against the entry background — invisible, and
 * not something the WCAG sweep catches, because axe does not automate non-text
 * contrast. Only the workspace floats it; the landing keeps it in its footer.
 */
test('the floating privacy control carries its own surface', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture())
  await page.goto('/app')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const measured = await page.getByRole('button', { name: 'Privacidad' }).evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    anchoring: getComputedStyle(element.parentElement as HTMLElement).position,
  }))

  expect(measured.anchoring, 'the control floats, so this test is about the right thing').toBe(
    'fixed',
  )
  expect(measured.background, 'a floating control with no surface reads as loose text').not.toBe(
    'rgba(0, 0, 0, 0)',
  )
})

/**
 * Analytics is optional, so the bar asking about it may never stand between a
 * person and the page. It used to open at the top, over the landing's heading
 * and the client's sheet, and on a phone it was the first screen; a box in the
 * corner covered the way in. It now runs along the bottom edge, and this holds
 * it below the heading, the wordmark and the way in at every width, and below
 * the sheet wherever the sheet shares the first screen.
 *
 * The check is what the browser would actually dispatch a click to, not a box
 * intersection, so a bar that overlaps harmlessly still passes.
 */
const CONSENT_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, sheetOnScreen: true },
  { name: 'laptop', width: 1280, height: 720, sheetOnScreen: true },
  { name: 'tablet', width: 768, height: 1024, sheetOnScreen: false },
  { name: 'mobile', width: 390, height: 844, sheetOnScreen: false },
]

for (const viewport of CONSENT_VIEWPORTS) {
  test(`the consent bar stays out of the way at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await installStudioApiMock(page, createStudioApiFixture({ signedOut: true }), {
      consent: 'undecided',
    })
    await page.goto('/es')
    await expect(page.getByText('Analítica opcional')).toBeVisible()

    const reachable = (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const box = element.getBoundingClientRect()
          const topmost = document.elementFromPoint(
            box.left + box.width / 2,
            box.top + box.height / 2,
          )
          return topmost === element || element.contains(topmost)
        })

    const targets: [selector: string, what: string][] = [
      ['[data-studio-actions] a', 'the way in'],
      ['[data-slot="site-header"] svg', 'the wordmark'],
      ['h1', 'the heading'],
      ...(viewport.sheetOnScreen
        ? [['[data-studio-sheet-head]', 'the client’s sheet'] satisfies [string, string]]
        : []),
    ]
    for (const [selector, what] of targets) {
      expect(await reachable(selector), `the consent bar is covering ${what}`).toBe(true)
    }

    const bar = await page.locator('[data-analytics-controls]').boundingBox()
    expect(bar, 'the consent bar is on screen').not.toBeNull()
    expect(
      (bar?.y ?? 0) + (bar?.height ?? 0),
      'the consent bar runs along the bottom edge',
    ).toBeGreaterThan(viewport.height - 24)
  })
}

test('ports the dark Studio sidebar to mobile and closes it after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`/organizations/${activeMembership.organization_id}`)

  await page.getByRole('button', { name: 'Abrir o cerrar navegación' }).click()
  const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]')
  await expect(sidebar).toHaveAttribute('data-afo-theme', 'dark')
  await expect(sidebar.getByRole('img', { name: 'Allfit Studio' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  expect(
    await sidebar.evaluate((element) => {
      const channels = getComputedStyle(element).backgroundColor.match(/\d+(?:\.\d+)?/g)
      if (!channels || channels.length < 3) return Number.POSITIVE_INFINITY
      return Number(channels[0]) * 0.299 + Number(channels[1]) * 0.587 + Number(channels[2]) * 0.114
    }),
  ).toBeLessThan(128)
  expect(await sidebar.evaluate((element) => element.contains(document.activeElement))).toBe(true)

  await sidebar.getByRole('link', { name: 'Equipo' }).click()
  await expect(page).toHaveURL(`/organizations/${activeMembership.organization_id}/team`)
  await expect(sidebar).toBeHidden()
})
