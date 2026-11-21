import { expect, test, type Page } from '@playwright/test'

import {
  activeMembership,
  createStudioApiFixture,
  draftPlan,
  installStudioApiMock,
  MONTHLY_PLAN_ID,
  problem,
  type StudioApiFixture,
} from './studio-api-mock'

/*
 * HU-STUDIO-077: the plans a gym sells, read by the whole team. Criterion 1 is
 * the badge on each plan, a draft, a plan on sale or one off sale, with the
 * price beside it; why a plan cannot be bought is said on the plan's own page.
 * Criterion 2, never another organization's plans, is the read's; the screen
 * asks for its own organization and filters nothing.
 */

const BILLING_PATH = `/organizations/${activeMembership.organization_id}/billing`

function card(page: Page, name: string) {
  return page.locator('[data-library-card="plans"]', { hasText: name })
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

  const onSale = card(page, 'Mensual ilimitado')
  await expect(onSale.locator('[data-plan-state]')).toHaveText('A la venta')
  await expect(onSale).toContainText(/\$\s?120\.000(,00)? al mes · Presencial/)
  await expect(onSale).toContainText('2 precios')

  const offSale = card(page, 'Remoto de verano')
  await expect(offSale.locator('[data-plan-state]')).toHaveText('Fuera de venta')
  await expect(offSale).toContainText('Sin precio a la venta')

  // Criterion 1: a draft is said to be one.
  const draft = card(page, 'Anual con nutrición')
  await expect(draft.locator('[data-plan-state]')).toHaveText('Borrador')
  await expect(draft).toContainText('Sin precio')

  // Every price a plan has had is on its own page, the newest first.
  await onSale.getByRole('link', { name: 'Mensual ilimitado' }).click()
  await expect(page).toHaveURL(`${BILLING_PATH}/plans/${MONTHLY_PLAN_ID}`)
  const prices = page.locator('[data-studio-register="plan-prices"] tbody tr')
  await expect(prices.first()).toContainText('Versión 2')
  await expect(prices.first()).toContainText('A la venta')
  await expect(prices.nth(1)).toContainText('Versión 1')
  await expect(prices.nth(1)).toContainText('Retirada')
})

// Criterion 1, the other half: why a draft cannot be sold, said where it is opened.
test('a draft says on its page why nobody can buy it', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${BILLING_PATH}/plans/${draftPlan.plan_id}`)

  await expect(page.locator('[data-plan-offer]')).toHaveAttribute('data-plan-offer', 'draft')
  await expect(page.locator('[data-plan-offer]')).toContainText(
    'Todavía no tiene precio, así que nadie puede suscribirse.',
  )
})

test('the address names the tab, so the way back from a plan lands on the plans', async ({
  page,
}) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(BILLING_PATH)
  await page.getByRole('tab', { name: 'Planes' }).click()
  await expect(page).toHaveURL(`${BILLING_PATH}?tab=plans`)

  await card(page, 'Mensual ilimitado').getByRole('link', { name: 'Mensual ilimitado' }).click()
  await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Planes' }).click()

  await expect(page).toHaveURL(`${BILLING_PATH}?tab=plans`)
  await expect(page.getByRole('tab', { name: 'Planes' })).toHaveAttribute('aria-selected', 'true')
  await expect(card(page, 'Mensual ilimitado')).toBeVisible()
})

test('a plan is found by name, and the plans read as rows too', async ({ page }) => {
  await installStudioApiMock(page, createStudioApiFixture({ memberships: [activeMembership] }))
  await page.goto(`${BILLING_PATH}?tab=plans`)

  await page.getByLabel('Buscar planes').fill('NUTRICION')
  await expect(page.locator('[data-library-card="plans"]')).toHaveCount(1)
  await expect(card(page, 'Anual con nutrición')).toBeVisible()

  await page.getByLabel('Buscar planes').fill('zzz')
  await expect(page.getByText('Ningún plan coincide')).toBeVisible()
  await page.getByRole('button', { name: 'Quitar la búsqueda' }).click()
  await expect(page.locator('[data-library-card="plans"]')).toHaveCount(3)

  await page.locator('[data-library-view]').getByText('Filas').click()
  const row = page.locator('[data-library-row="plans"]', { hasText: 'Mensual ilimitado' })
  await expect(row).toContainText(/\$\s?120\.000(,00)? al mes · Presencial/)
  await expect(row.locator('[data-plan-state]')).toHaveText('A la venta')
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
