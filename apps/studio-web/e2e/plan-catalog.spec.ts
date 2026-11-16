import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  installStudioApiMock,
  problem,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-077: the plans a gym sells, read by the whole team. Criterion 1 is
 * the state line under each name: a draft, a price on sale, or nothing on
 * sale. Criterion 2, never another organization's plans, is the read's; the
 * screen asks for its own organization and filters nothing.
 */

const BILLING_PATH = `/organizations/${activeMembership.organization_id}/billing`

function card(page: Page, name: string) {
  return page.locator('[data-content-register-item]', { hasText: name })
}

function subscriptionReads(fixture: StudioApiFixture) {
  return fixture.requests.filter(
    (request) => request.method === 'GET' && request.path.endsWith('/subscriptions'),
  )
}

test('an owner reads the plans in their own tab, beside who pays', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(BILLING_PATH)

  await expect(page.getByRole('tab', { name: 'Suscripciones' })).toBeVisible()
  await page.getByRole('tab', { name: 'Planes' }).click()

  await expect(card(page, 'Mensual ilimitado')).toContainText(
    /A la venta: \$\s?120\.000(,00)? al mes · presencial/,
  )
  await expect(card(page, 'Remoto de verano')).toContainText(
    'Fuera de venta: no tiene ningún precio a la venta ahora.',
  )
  // Criterion 1: a draft is said to be one, and why it cannot be sold.
  await expect(card(page, 'Anual con nutrición')).toContainText(
    'Borrador: todavía no tiene precio, así que nadie puede suscribirse.',
  )

  await card(page, 'Mensual ilimitado').getByRole('button', { name: 'Ver precios · 2' }).click()
  const prices = card(page, 'Mensual ilimitado').locator('[data-content-version-list] > li')
  await expect(prices.first()).toContainText('Versión 2')
  await expect(prices.first()).toContainText('A la venta')
  await expect(prices.nth(1)).toContainText('Versión 1')
  await expect(prices.nth(1)).toContainText('Retirada')
})

test('a coach reads the plans and never who pays', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [{ ...activeMembership, roles: ['coach'] }],
  })
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)

  await expect(card(page, 'Mensual ilimitado')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Suscripciones' })).toHaveCount(0)
  await expect(page.getByText('Las suscripciones no son de tu rol')).toBeVisible()
  expect(subscriptionReads(fixture)).toHaveLength(0)
})

test('staff reads them too, because a price is nobody’s personal data', async ({ page }) => {
  await installStudioApiMock(
    page,
    createStudioApiFixture({ memberships: [{ ...activeMembership, roles: ['staff'] }] }),
  )
  await page.goto(BILLING_PATH)

  await expect(card(page, 'Anual con nutrición')).toBeVisible()
})

test('with no plan yet, the tab says what a plan is', async ({ page }) => {
  const fixture = createStudioApiFixture({ memberships: [activeMembership] })
  fixture.organizationPlans = []
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)
  await page.getByRole('tab', { name: 'Planes' }).click()

  await expect(page.getByText('Todavía no hay planes')).toBeVisible()
})

test('a failed read says so and offers to try again', async ({ page }) => {
  const fixture = createStudioApiFixture({
    memberships: [{ ...activeMembership, roles: ['coach'] }],
  })
  // Down until the retry: a 503 is retried once on its own, so one failure never shows.
  let down = true
  fixture.intercept = (request) =>
    down && request.method === 'GET' && request.path.endsWith('/plans')
      ? { status: 503, body: problem('upstream-unavailable', 503) }
      : undefined
  await installStudioApiMock(page, fixture)
  await page.goto(BILLING_PATH)

  await expect(page.getByText('No pudimos cargar los planes')).toBeVisible()
  down = false
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(card(page, 'Mensual ilimitado')).toBeVisible()
})
